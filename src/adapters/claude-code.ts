import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'tinyglobby';
import type {
  HarnessAdapter,
  AdapterEnv,
  SkillRoot,
  SkillLayout
} from '../core/types.js';
import {
  isDirectory,
  hasGitMarker,
  deduplicateRoots,
  resolveEnvironmentDir
} from './shared.js';

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}
export class ClaudeCodeAdapter implements HarnessAdapter {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly layout: SkillLayout = 'dir-skill-md';

  async detect(env: AdapterEnv): Promise<boolean> {
    const noopEnv: AdapterEnv = {
      ...env,
      warn() {}
    };
    const rootList = await this.roots(noopEnv);
    return rootList.length > 0;
  }

  async roots(env: AdapterEnv): Promise<SkillRoot[]> {
    const discoveredRoots: SkillRoot[] = [];
    const cwdResolved = path.resolve(env.cwd);
    const homeResolved = path.resolve(env.homeDir);
    const claudeConfigBase = resolveEnvironmentDir(
      env.environment.CLAUDE_CONFIG_DIR,
      path.join(homeResolved, '.claude'),
      homeResolved
    );

    // 1. User root: <claudeConfigBase>/skills
    const userSkillsPath = path.join(claudeConfigBase, 'skills');
    if (await isDirectory(userSkillsPath)) {
      discoveredRoots.push({
        path: userSkillsPath,
        scope: 'user',
        precedence: 20,
        readonly: false
      });
    }

    // 2. Project roots (upward search from cwd up to scan.depth)
    let curr = cwdResolved;
    const maxDepth = env.config.scan.depth;
    for (let depth = 0; depth < maxDepth; depth++) {
      const projectSkillsPath = path.join(curr, '.claude', 'skills');
      if (await isDirectory(projectSkillsPath)) {
        discoveredRoots.push({
          path: projectSkillsPath,
          scope: 'project',
          precedence: 30,
          readonly: false
        });
      }

      const isGitRoot = await hasGitMarker(curr);
      const isHomeBoundary = curr === homeResolved;
      const isFsRoot = curr === path.parse(curr).root;

      if (isGitRoot || isHomeBoundary || isFsRoot) {
        break;
      }

      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }

    // 3. Workspaces search
    if (env.config.scan.workspaces.length > 0) {
      const defaultSkips = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.venv/**',
        '**/target/**',
        '**/vendor/**',
        '**/.cache/**',
        '**/Library/Caches/**'
      ];
      const ignorePatterns = [...defaultSkips, ...env.config.scan.ignore];

      for (const workspace of env.config.scan.workspaces) {
        if (await isDirectory(workspace)) {
          try {
            const matches = await glob('**/.claude/skills', {
              cwd: workspace,
              absolute: true,
              onlyDirectories: true,
              deep: env.config.scan.depth,
              ignore: ignorePatterns,
              followSymbolicLinks: false
            });

            for (const matchDir of matches) {
              discoveredRoots.push({
                path: path.normalize(matchDir),
                scope: 'project',
                precedence: 30,
                readonly: false
              });
            }
          } catch {
            // Ignore workspace scan errors
          }
        }
      }
    }

    // 4. Installed plugin roots
    const pluginJsonPath = path.join(claudeConfigBase, 'plugins', 'installed_plugins.json');
    let pluginStateProcessed = false;

    try {
      const content = await fs.readFile(pluginJsonPath, 'utf-8');
      pluginStateProcessed = true;
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = null;
      }

      if (!isObject(parsed) || !('plugins' in parsed) || !isObject(parsed.plugins)) {
        env.warn({
          code: 'CLAUDE_PLUGIN_STATE_INVALID',
          path: pluginJsonPath,
          message: 'Invalid installed_plugins.json content structure'
        });
        await this.addLegacyPluginRoots(claudeConfigBase, discoveredRoots);
      } else {
        const pluginsObj = parsed.plugins;
        for (const pluginEntries of Object.values(pluginsObj)) {
          if (!Array.isArray(pluginEntries)) continue;
          for (const entry of pluginEntries) {
            if (!isObject(entry) || !('installPath' in entry) || typeof entry.installPath !== 'string') {
              continue;
            }

            const installPath = entry.installPath;
            const scope = typeof entry.scope === 'string' ? entry.scope : undefined;
            const projectPath = typeof entry.projectPath === 'string' ? entry.projectPath : undefined;

            let applies = false;
            if (!scope || scope === 'user' || scope === 'global') {
              applies = true;
            } else if (scope === 'project' || scope === 'local') {
              if (projectPath) {
                const resolvedProject = path.resolve(projectPath);
                applies =
                  cwdResolved === resolvedProject ||
                  cwdResolved.startsWith(resolvedProject + path.sep);
              }
            }

            if (applies) {
              const pluginSkillsPath = path.join(installPath, 'skills');
              if (await isDirectory(pluginSkillsPath)) {
                discoveredRoots.push({
                  path: path.normalize(pluginSkillsPath),
                  scope: 'plugin',
                  precedence: 10,
                  readonly: true
                });
              }
            }
          }
        }
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        env.warn({
          code: 'CLAUDE_PLUGIN_STATE_INVALID',
          path: pluginJsonPath,
          message: `Failed to read installed_plugins.json: ${error.message}`
        });
        await this.addLegacyPluginRoots(claudeConfigBase, discoveredRoots);
        pluginStateProcessed = true;
      }
    }

    if (!pluginStateProcessed) {
      await this.addLegacyPluginRoots(claudeConfigBase, discoveredRoots);
    }

    // Deduplicate and normalize
    return deduplicateRoots(discoveredRoots);
  }

  private async addLegacyPluginRoots(claudeConfigBase: string, discoveredRoots: SkillRoot[]): Promise<void> {
    const pluginsDir = path.join(claudeConfigBase, 'plugins');
    if (await isDirectory(pluginsDir)) {
      try {
        const matches = await glob('*/skills', {
          cwd: pluginsDir,
          absolute: true,
          onlyDirectories: true,
          deep: 2,
          followSymbolicLinks: false
        });
        for (const matchDir of matches) {
          discoveredRoots.push({
            path: path.normalize(matchDir),
            scope: 'plugin',
            precedence: 10,
            readonly: true
          });
        }
      } catch {
        // ignore legacy scan errors
      }
    }
  }
}

