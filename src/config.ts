import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type {
  ResolvedConfig,
  SkillRoot,
  CustomHarnessConfig,
  Scope,
  SkillLayout
} from './core/types.js';
import { BUILTIN_HARNESS_IDS } from './adapters/builtins.js';

export class ConfigError extends Error {
  readonly exitCode = 2;
  readonly code = 'CONFIG_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface RuntimePaths {
  cwd: string;
  homeDir: string;
  configDir?: string | undefined;
  dataDir?: string | undefined;
}

const DEFAULT_CONFIG: ResolvedConfig = {
  scan: {
    workspaces: [],
    depth: 4,
    maxFiles: 50000,
    ignore: []
  },
  harness: {
    custom: []
  }
};

const VALID_SCOPES: Scope[] = ['user', 'project', 'plugin', 'system'];

export function parseRootString(
  rootStr: string,
  configDir: string,
  homeDir: string
): SkillRoot {
  const trimmed = rootStr.trim();
  if (!trimmed) {
    throw new ConfigError('Empty root path string');
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon === -1) {
    throw new ConfigError(`Invalid root string format (missing precedence): "${trimmed}"`);
  }

  const precStr = trimmed.slice(lastColon + 1);
  if (!/^-?\d+$/.test(precStr)) {
    throw new ConfigError(`Invalid precedence in root string: "${trimmed}"`);
  }
  const precedence = parseInt(precStr, 10);

  const remainder = trimmed.slice(0, lastColon);
  const secondLastColon = remainder.lastIndexOf(':');
  if (secondLastColon === -1) {
    throw new ConfigError(`Invalid root string format (missing scope): "${trimmed}"`);
  }

  const scopeStr = remainder.slice(secondLastColon + 1) as Scope;
  if (!VALID_SCOPES.includes(scopeStr)) {
    throw new ConfigError(`Invalid scope "${scopeStr}" in root string: "${trimmed}"`);
  }

  let rawPath = remainder.slice(0, secondLastColon).trim();
  if (!rawPath) {
    throw new ConfigError(`Empty path in root string: "${trimmed}"`);
  }

  if (rawPath.startsWith('~')) {
    rawPath = path.join(homeDir, rawPath.slice(1));
  } else if (!path.isAbsolute(rawPath)) {
    rawPath = path.resolve(configDir, rawPath);
  }

  const resolvedPath = path.normalize(rawPath);

  return {
    path: resolvedPath,
    scope: scopeStr,
    precedence,
    readonly: scopeStr === 'plugin' || scopeStr === 'system'
  };
}

async function findLocalConfigFile(cwd: string, homeDir: string): Promise<string | null> {
  let curr = path.resolve(cwd);
  const homeResolved = path.resolve(homeDir);

  while (true) {
    const candidate = path.join(curr, '.skillctl.toml');
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }

    try {
      const gitStat = await fs.stat(path.join(curr, '.git'));
      if (gitStat.isDirectory() || gitStat.isFile()) {
        break;
      }
    } catch {
      // ignore
    }

    if (curr === homeResolved || curr === path.parse(curr).root) {
      break;
    }

    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  return null;
}

interface RawConfig {
  scan?: {
    workspaces?: unknown;
    depth?: unknown;
    maxFiles?: unknown;
    ignore?: unknown;
  };
  harness?: {
    custom?: unknown[];
  };
}

export function parseConfigFile(
  content: string,
  filePath: string,
  homeDir: string
): {
  scan?: Partial<ResolvedConfig['scan']>;
  customHarnesses?: Array<{ config: CustomHarnessConfig; parsedRoots: SkillRoot[] }>;
} {
  const configDir = path.dirname(filePath);
  let parsed: unknown;
  try {
    parsed = parseToml(content);
  } catch (err) {
    throw new ConfigError(`Malformed TOML in "${filePath}": ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`Invalid TOML structure in "${filePath}"`);
  }

  const raw = parsed as RawConfig;
  const resultScan: Partial<ResolvedConfig['scan']> = {};

  if (raw.scan !== undefined) {
    if (typeof raw.scan !== 'object' || raw.scan === null || Array.isArray(raw.scan)) {
      throw new ConfigError(`"[scan]" must be a table in "${filePath}"`);
    }

    if (raw.scan.workspaces !== undefined) {
      if (!Array.isArray(raw.scan.workspaces) || !raw.scan.workspaces.every(w => typeof w === 'string')) {
        throw new ConfigError(`"scan.workspaces" must be an array of strings in "${filePath}"`);
      }
      resultScan.workspaces = raw.scan.workspaces.map(w => {
        let p = w.trim();
        if (p.startsWith('~')) {
          p = path.join(homeDir, p.slice(1));
        } else if (!path.isAbsolute(p)) {
          p = path.resolve(configDir, p);
        }
        return path.normalize(p);
      });
    }

    if (raw.scan.depth !== undefined) {
      if (typeof raw.scan.depth !== 'number' || !Number.isInteger(raw.scan.depth) || raw.scan.depth < 1) {
        throw new ConfigError(`"scan.depth" must be a positive integer in "${filePath}"`);
      }
      resultScan.depth = raw.scan.depth;
    }

    if (raw.scan.maxFiles !== undefined) {
      if (typeof raw.scan.maxFiles !== 'number' || !Number.isInteger(raw.scan.maxFiles) || raw.scan.maxFiles < 1) {
        throw new ConfigError(`"scan.maxFiles" must be a positive integer in "${filePath}"`);
      }
      resultScan.maxFiles = raw.scan.maxFiles;
    }

    if (raw.scan.ignore !== undefined) {
      if (!Array.isArray(raw.scan.ignore) || !raw.scan.ignore.every(i => typeof i === 'string')) {
        throw new ConfigError(`"scan.ignore" must be an array of strings in "${filePath}"`);
      }
      resultScan.ignore = raw.scan.ignore;
    }
  }

  const customHarnesses: Array<{ config: CustomHarnessConfig; parsedRoots: SkillRoot[] }> = [];

  if (raw.harness !== undefined) {
    if (typeof raw.harness !== 'object' || raw.harness === null || Array.isArray(raw.harness)) {
      throw new ConfigError(`"[harness]" must be a table in "${filePath}"`);
    }

    if (raw.harness.custom !== undefined) {
      if (!Array.isArray(raw.harness.custom)) {
        throw new ConfigError(`"harness.custom" must be an array of tables in "${filePath}"`);
      }

      const seenIds = new Set<string>();

      for (const item of raw.harness.custom) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new ConfigError(`"harness.custom" elements must be tables in "${filePath}"`);
        }

        const h = item as Record<string, unknown>;

        if (typeof h.id !== 'string' || !h.id.trim()) {
          throw new ConfigError(`Custom harness missing valid "id" in "${filePath}"`);
        }
        const id = h.id.trim();

        if ((BUILTIN_HARNESS_IDS as readonly string[]).includes(id)) {
          throw new ConfigError(`Custom harness id "${id}" conflicts with built-in harness "${id}" in "${filePath}"`);
        }

        if (seenIds.has(id)) {
          throw new ConfigError(`Duplicate custom harness id "${id}" in "${filePath}"`);
        }
        seenIds.add(id);

        if (typeof h.layout !== 'string') {
          throw new ConfigError(`Custom harness "${id}" missing "layout" in "${filePath}"`);
        }

        if (h.layout === 'custom') {
          throw new ConfigError(`Unsupported generic layout "custom" for harness "${id}" in "${filePath}"`);
        }

        if (h.layout !== 'dir-skill-md' && h.layout !== 'flat-md') {
          throw new ConfigError(`Invalid layout "${h.layout}" for harness "${id}" in "${filePath}"`);
        }

        const layout = h.layout as SkillLayout;

        if (!Array.isArray(h.roots) || !h.roots.every(r => typeof r === 'string')) {
          throw new ConfigError(`Custom harness "${id}" roots must be an array of strings in "${filePath}"`);
        }

        const parsedRoots: SkillRoot[] = [];
        const seenRoots = new Set<string>();

        for (const rootStr of h.roots) {
          const parsedRoot = parseRootString(rootStr, configDir, homeDir);
          const key = `${parsedRoot.path}:${parsedRoot.scope}:${parsedRoot.precedence}`;
          if (seenRoots.has(key)) {
            throw new ConfigError(`Duplicate root "${rootStr}" in custom harness "${id}" in "${filePath}"`);
          }
          seenRoots.add(key);
          parsedRoots.push(parsedRoot);
        }

        customHarnesses.push({
          config: {
            id,
            roots: h.roots as string[],
            layout
          },
          parsedRoots
        });
      }
    }
  }

  return { scan: resultScan, customHarnesses };
}

export async function loadConfig(
  runtimePaths: RuntimePaths,
  explicitConfigPath?: string
): Promise<{
  config: ResolvedConfig;
  customHarnessRoots: Map<string, SkillRoot[]>;
}> {
  const cwd = path.resolve(runtimePaths.cwd);
  const homeDir = path.resolve(runtimePaths.homeDir);

  const xdgConfigHome = runtimePaths.configDir
    ? path.resolve(runtimePaths.configDir)
    : process.env.XDG_CONFIG_HOME
      ? path.resolve(process.env.XDG_CONFIG_HOME)
      : path.join(homeDir, '.config');

  const defaultUserConfigPath = path.join(xdgConfigHome, 'skillctl', 'config.toml');

  const configFilesToRead: string[] = [];

  // 1. User config (lowest file precedence)
  if (!explicitConfigPath) {
    try {
      const stat = await fs.stat(defaultUserConfigPath);
      if (stat.isFile()) {
        configFilesToRead.push(defaultUserConfigPath);
      }
    } catch {
      // ignore missing default config
    }
  }

  // 2. Local config (.skillctl.toml from cwd up to git/home boundary)
  if (!explicitConfigPath) {
    const localConfig = await findLocalConfigFile(cwd, homeDir);
    if (localConfig && !configFilesToRead.includes(localConfig)) {
      configFilesToRead.push(localConfig);
    }
  }

  // 3. Explicit config (highest file precedence)
  if (explicitConfigPath) {
    const resolvedExplicit = path.resolve(cwd, explicitConfigPath);
    try {
      const stat = await fs.stat(resolvedExplicit);
      if (!stat.isFile()) {
        throw new ConfigError(`Explicit config file "${explicitConfigPath}" is not a file`);
      }
      configFilesToRead.push(resolvedExplicit);
    } catch (err) {
      if (err instanceof ConfigError) throw err;
      throw new ConfigError(`Explicit config file not found: "${explicitConfigPath}"`);
    }
  }

  // Merge configurations
  const mergedConfig: ResolvedConfig = {
    scan: { ...DEFAULT_CONFIG.scan },
    harness: { custom: [] }
  };

  const customHarnessRoots = new Map<string, SkillRoot[]>();

  for (const filePath of configFilesToRead) {
    const content = await fs.readFile(filePath, 'utf-8');
    const { scan, customHarnesses } = parseConfigFile(content, filePath, homeDir);

    if (scan) {
      if (scan.workspaces !== undefined) mergedConfig.scan.workspaces = scan.workspaces;
      if (scan.depth !== undefined) mergedConfig.scan.depth = scan.depth;
      if (scan.maxFiles !== undefined) mergedConfig.scan.maxFiles = scan.maxFiles;
      if (scan.ignore !== undefined) mergedConfig.scan.ignore = scan.ignore;
    }

    if (customHarnesses !== undefined) {
      mergedConfig.harness.custom = customHarnesses.map(h => h.config);
      customHarnessRoots.clear();
      for (const h of customHarnesses) {
        customHarnessRoots.set(h.config.id, h.parsedRoots);
      }
    }
  }

  return { config: mergedConfig, customHarnessRoots };
}
