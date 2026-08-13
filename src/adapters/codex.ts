import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { glob } from 'tinyglobby';
import type {
  HarnessAdapter,
  AdapterEnv,
  SkillRoot,
  SkillLayout
} from '../core/types.js';
import {
  isDirectory,
  deduplicateRoots,
  resolveEnvironmentDir
} from './shared.js';

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

export class CodexAdapter implements HarnessAdapter {
  readonly id = 'codex';
  readonly displayName = 'Codex';
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
    const homeResolved = path.resolve(env.homeDir);

    const codexHome = resolveEnvironmentDir(
      env.environment.CODEX_HOME,
      path.join(homeResolved, '.codex'),
      homeResolved
    );

    // 1. Shared ~/.agents/skills (precedence 20)
    const sharedAgentsSkillsPath = path.join(homeResolved, '.agents', 'skills');
    if (await isDirectory(sharedAgentsSkillsPath)) {
      discoveredRoots.push({
        path: sharedAgentsSkillsPath,
        scope: 'user',
        precedence: 20,
        readonly: false
      });
    }

    // 2. <codexHome>/skills (precedence 20)
    const userSkillsPath = path.join(codexHome, 'skills');
    if (await isDirectory(userSkillsPath)) {
      discoveredRoots.push({
        path: userSkillsPath,
        scope: 'user',
        precedence: 20,
        readonly: false
      });
    }

    // 3. <codexHome>/skills/.system (precedence 10)
    const systemSkillsPath = path.join(codexHome, 'skills', '.system');
    if (await isDirectory(systemSkillsPath)) {
      discoveredRoots.push({
        path: systemSkillsPath,
        scope: 'system',
        precedence: 10,
        readonly: true
      });
    }

    // 4. /etc/codex/skills on non-Windows (precedence 10)
    if (env.platform !== 'win32') {
      const globalEtcSkillsPath = path.normalize('/etc/codex/skills');
      if (await isDirectory(globalEtcSkillsPath)) {
        discoveredRoots.push({
          path: globalEtcSkillsPath,
          scope: 'system',
          precedence: 10,
          readonly: true
        });
      }
    }

    // 5. Enabled plugins from <codexHome>/config.toml (precedence 15)
    const configTomlPath = path.join(codexHome, 'config.toml');
    try {
      const content = await fs.readFile(configTomlPath, 'utf-8');
      let parsed: unknown;
      try {
        parsed = parseToml(content);
      } catch (err) {
        env.warn({
          code: 'CODEX_PLUGIN_STATE_INVALID',
          path: configTomlPath,
          message: `Failed to parse config.toml: ${(err as Error).message}`
        });
        parsed = null;
      }

      if (parsed !== null) {
        if (!isObject(parsed)) {
          env.warn({
            code: 'CODEX_PLUGIN_STATE_INVALID',
            path: configTomlPath,
            message: 'Invalid config.toml content structure'
          });
        } else if ('plugins' in parsed && parsed.plugins !== undefined) {
          if (!isObject(parsed.plugins)) {
            env.warn({
              code: 'CODEX_PLUGIN_STATE_INVALID',
              path: configTomlPath,
              message: '"plugins" in config.toml must be a table'
            });
          } else {
            const pluginsTable = parsed.plugins as Record<string, unknown>;
            for (const [key, pluginVal] of Object.entries(pluginsTable)) {
              if (!isObject(pluginVal) || pluginVal.enabled !== true) {
                continue;
              }

              const lastAt = key.lastIndexOf('@');
              const plugin = lastAt > 0 ? key.slice(0, lastAt) : '';
              const marketplace = lastAt > 0 ? key.slice(lastAt + 1) : '';

              if (
                lastAt <= 0 ||
                lastAt === key.length - 1 ||
                !SEGMENT_REGEX.test(plugin) ||
                !SEGMENT_REGEX.test(marketplace)
              ) {
                env.warn({
                  code: 'CODEX_PLUGIN_STATE_INVALID',
                  path: configTomlPath,
                  message: `Invalid plugin key format "${key}"`
                });
                continue;
              }

              const cacheDir = path.join(codexHome, 'plugins', 'cache', marketplace, plugin);
              if (await isDirectory(cacheDir)) {
                try {
                  const matches = await glob('*/skills', {
                    cwd: cacheDir,
                    absolute: true,
                    onlyDirectories: true,
                    deep: 2,
                    followSymbolicLinks: false
                  });
                  for (const matchDir of matches) {
                    discoveredRoots.push({
                      path: path.normalize(matchDir),
                      scope: 'plugin',
                      precedence: 15,
                      readonly: true
                    });
                  }
                } catch {
                  // ignore glob errors
                }
              }
            }
          }
        }
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        env.warn({
          code: 'CODEX_PLUGIN_STATE_INVALID',
          path: configTomlPath,
          message: `Failed to read config.toml: ${error.message}`
        });
      }
    }

    return deduplicateRoots(discoveredRoots);
  }
}
