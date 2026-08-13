import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import ignore, { type Ignore } from 'ignore';
import type {
  HarnessAdapter,
  AdapterEnv,
  SkillRoot,
  DiscoveredSkill,
  ScanWarning
} from './types.js';

export interface ScanBudgetOptions {
  scanDepth?: number | undefined;
  maxFiles?: number | undefined;
  timeoutMs?: number | undefined;
}

export class ScanBudget {
  readonly maxFiles: number;
  readonly timeoutMs: number;
  readonly deadline: number;
  private count = 0;

  constructor(options?: ScanBudgetOptions) {
    this.maxFiles = options?.maxFiles ?? 50000;
    this.timeoutMs = options?.timeoutMs ?? 30000;
    this.deadline = Date.now() + this.timeoutMs;
  }

  isExpired(): boolean {
    return Date.now() >= this.deadline;
  }

  isLimitReached(): boolean {
    return this.count >= this.maxFiles;
  }

  consume(): boolean {
    if (this.isExpired() || this.isLimitReached()) {
      return false;
    }
    this.count++;
    return true;
  }

  usedCount(): number {
    return this.count;
  }
}

export interface DirEntryInfo {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface FileStatInfo {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  mtime: Date;
  birthtime: Date | null;
  size: number;
}

export interface ScanIo {
  readdir(path: string): Promise<DirEntryInfo[]>;
  stat(path: string): Promise<FileStatInfo>;
  lstat(path: string): Promise<FileStatInfo>;
  readlink(path: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  realpath(path: string): Promise<string>;
}

export const nodeScanIo: ScanIo = {
  async readdir(p: string): Promise<DirEntryInfo[]> {
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: () => e.isDirectory(),
      isFile: () => e.isFile(),
      isSymbolicLink: () => e.isSymbolicLink()
    }));
  },
  async stat(p: string): Promise<FileStatInfo> {
    const s = await fs.stat(p);
    return {
      isDirectory: () => s.isDirectory(),
      isFile: () => s.isFile(),
      isSymbolicLink: () => s.isSymbolicLink(),
      mtime: s.mtime,
      birthtime: s.birthtime && s.birthtime.getTime() > 0 ? s.birthtime : null,
      size: s.size
    };
  },
  async lstat(p: string): Promise<FileStatInfo> {
    const s = await fs.lstat(p);
    return {
      isDirectory: () => s.isDirectory(),
      isFile: () => s.isFile(),
      isSymbolicLink: () => s.isSymbolicLink(),
      mtime: s.mtime,
      birthtime: s.birthtime && s.birthtime.getTime() > 0 ? s.birthtime : null,
      size: s.size
    };
  },
  async readlink(p: string): Promise<string> {
    return await fs.readlink(p);
  },
  async readFile(p: string): Promise<Uint8Array> {
    return await fs.readFile(p);
  },
  async realpath(p: string): Promise<string> {
    return await fs.realpath(p);
  }
};

const DEFAULT_BUILTIN_SKIPS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.venv',
  'target',
  'vendor',
  '.cache',
  'Library'
]);

interface LoadedIgnore {
  baseDir: string;
  ig: Ignore;
}

async function loadProjectIgnore(cwd: string, homeDir: string, io: ScanIo): Promise<LoadedIgnore | null> {
  let curr = path.resolve(cwd);
  const homeResolved = path.resolve(homeDir);

  while (true) {
    const candidate = path.join(curr, '.skillctlignore');
    try {
      const contentBuf = await io.readFile(candidate);
      const text = new TextDecoder().decode(contentBuf);
      const ig = ignore().add(text);
      return { baseDir: curr, ig };
    } catch {
      // ignore missing
    }

    try {
      const gitStat = await io.stat(path.join(curr, '.git'));
      if (gitStat.isDirectory() || gitStat.isFile()) {
        break;
      }
    } catch {
      // ignore missing
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

async function loadRootIgnore(rootPath: string, io: ScanIo): Promise<LoadedIgnore | null> {
  const candidate = path.join(rootPath, '.skillctlignore');
  try {
    const contentBuf = await io.readFile(candidate);
    const text = new TextDecoder().decode(contentBuf);
    const ig = ignore().add(text);
    return { baseDir: rootPath, ig };
  } catch {
    return null;
  }
}

function isPathIgnored(
  fullPath: string,
  projectIgnore: LoadedIgnore | null,
  rootIgnore: LoadedIgnore | null
): boolean {
  const segments = fullPath.split(/[/\\]/);
  for (const seg of segments) {
    if (DEFAULT_BUILTIN_SKIPS.has(seg)) {
      return true;
    }
  }

  if (projectIgnore) {
    if (fullPath.startsWith(projectIgnore.baseDir + path.sep) || fullPath === projectIgnore.baseDir) {
      const rel = path.relative(projectIgnore.baseDir, fullPath).split(path.sep).join('/');
      if (rel && projectIgnore.ig.ignores(rel)) {
        return true;
      }
    }
  }

  if (rootIgnore) {
    if (fullPath.startsWith(rootIgnore.baseDir + path.sep) || fullPath === rootIgnore.baseDir) {
      const rel = path.relative(rootIgnore.baseDir, fullPath).split(path.sep).join('/');
      if (rel && rootIgnore.ig.ignores(rel)) {
        return true;
      }
    }
  }

  return false;
}

export async function discoverSkills(
  adapters: HarnessAdapter[],
  env: AdapterEnv,
  budget: ScanBudget,
  io: ScanIo = nodeScanIo
): Promise<{
  candidates: DiscoveredSkill[];
  roots: SkillRoot[];
  warnings: ScanWarning[];
  truncated: boolean;
}> {
  const candidates: DiscoveredSkill[] = [];
  const acceptedRoots: SkillRoot[] = [];
  const warnings: ScanWarning[] = [];
  let truncated = false;

  const projectIgnore = await loadProjectIgnore(env.cwd, env.homeDir, io);

  for (const adapter of adapters) {
    if (budget.isExpired()) {
      truncated = true;
      warnings.push({
        code: 'SCAN_TIMEOUT',
        path: env.cwd,
        message: `Scan deadline exceeded (${budget.timeoutMs}ms)`
      });
      break;
    }

    if (budget.isLimitReached()) {
      truncated = true;
      warnings.push({
        code: 'MAX_FILES_REACHED',
        path: env.cwd,
        message: `Scan max files limit reached (${budget.maxFiles})`
      });
      break;
    }

    let detected: boolean;
    try {
      detected = await adapter.detect(env);
    } catch {
      detected = false;
    }

    if (!detected) {
      continue;
    }

    let roots: SkillRoot[];
    try {
      roots = await adapter.roots(env);
    } catch (err) {
      warnings.push({
        code: 'ROOT_UNREADABLE',
        path: adapter.id,
        message: `Adapter failed to resolve roots: ${(err as Error).message}`
      });
      continue;
    }

    for (const root of roots) {
      if (budget.isExpired()) {
        truncated = true;
        warnings.push({
          code: 'SCAN_TIMEOUT',
          path: root.path,
          message: `Scan deadline exceeded (${budget.timeoutMs}ms)`
        });
        break;
      }

      if (budget.isLimitReached()) {
        truncated = true;
        warnings.push({
          code: 'MAX_FILES_REACHED',
          path: root.path,
          message: `Scan max files limit reached (${budget.maxFiles})`
        });
        break;
      }

      const rootIgnore = await loadRootIgnore(root.path, io);

      let entries: DirEntryInfo[];
      try {
        entries = await io.readdir(root.path);
      } catch (err) {
        warnings.push({
          code: 'ROOT_UNREADABLE',
          path: root.path,
          message: `Failed to read root directory: ${(err as Error).message}`
        });
        continue;
      }

      acceptedRoots.push(root);

      for (const entry of entries) {
        if (budget.isExpired()) {
          truncated = true;
          warnings.push({
            code: 'SCAN_TIMEOUT',
            path: root.path,
            message: `Scan deadline exceeded (${budget.timeoutMs}ms)`
          });
          break;
        }

        if (budget.isLimitReached()) {
          truncated = true;
          warnings.push({
            code: 'MAX_FILES_REACHED',
            path: root.path,
            message: `Scan max files limit reached (${budget.maxFiles})`
          });
          break;
        }

        const entryPath = path.join(root.path, entry.name);

        if (isPathIgnored(entryPath, projectIgnore, rootIgnore)) {
          continue;
        }

        let lstat: FileStatInfo;
        try {
          lstat = await io.lstat(entryPath);
        } catch (err) {
          warnings.push({
            code: 'ENTRY_UNREADABLE',
            path: entryPath,
            message: `Failed to stat entry: ${(err as Error).message}`
          });
          continue;
        }

        if (adapter.layout === 'dir-skill-md') {
          if (lstat.isSymbolicLink()) {
            let targetPathRaw: string;
            try {
              targetPathRaw = await io.readlink(entryPath);
            } catch (err) {
              warnings.push({
                code: 'BROKEN_SYMLINK',
                path: entryPath,
                message: `Failed to read symlink target: ${(err as Error).message}`
              });
              continue;
            }

            const symlinkTarget = path.resolve(root.path, targetPathRaw);

            let targetStat: FileStatInfo;
            try {
              targetStat = await io.stat(symlinkTarget);
            } catch {
              warnings.push({
                code: 'BROKEN_SYMLINK',
                path: entryPath,
                message: `Broken symlink target: "${entryPath}" -> "${symlinkTarget}"`
              });
              continue;
            }

            if (!targetStat.isDirectory()) {
              warnings.push({
                code: 'BROKEN_SYMLINK',
                path: entryPath,
                message: `Symlink target is not a directory: "${entryPath}" -> "${symlinkTarget}"`
              });
              continue;
            }

            const physicalFilePath = path.join(symlinkTarget, 'SKILL.md');
            try {
              const fileStat = await io.stat(physicalFilePath);
              if (fileStat.isFile()) {
                candidates.push({
                  adapterId: adapter.id,
                  root,
                  logicalEntryPath: entryPath,
                  logicalFilePath: path.join(entryPath, 'SKILL.md'),
                  physicalDirPath: symlinkTarget,
                  physicalFilePath,
                  symlinkTarget
                });
              }
            } catch {
              // Target directory lacks SKILL.md, ignore
            }
          } else if (lstat.isDirectory()) {
            const physicalFilePath = path.join(entryPath, 'SKILL.md');
            try {
              const fileStat = await io.stat(physicalFilePath);
              if (fileStat.isFile()) {
                candidates.push({
                  adapterId: adapter.id,
                  root,
                  logicalEntryPath: entryPath,
                  logicalFilePath: physicalFilePath,
                  physicalDirPath: entryPath,
                  physicalFilePath,
                  symlinkTarget: null
                });
              }
            } catch {
              // Directory lacks SKILL.md, ignore
            }
          }
        } else if (adapter.layout === 'flat-md') {
          if (!entry.name.endsWith('.md')) {
            continue;
          }

          if (lstat.isSymbolicLink()) {
            let targetPathRaw: string;
            try {
              targetPathRaw = await io.readlink(entryPath);
            } catch (err) {
              warnings.push({
                code: 'BROKEN_SYMLINK',
                path: entryPath,
                message: `Failed to read symlink target: ${(err as Error).message}`
              });
              continue;
            }

            const symlinkTarget = path.resolve(root.path, targetPathRaw);

            let targetStat: FileStatInfo;
            try {
              targetStat = await io.stat(symlinkTarget);
            } catch {
              warnings.push({
                code: 'BROKEN_SYMLINK',
                path: entryPath,
                message: `Broken symlink target: "${entryPath}" -> "${symlinkTarget}"`
              });
              continue;
            }

            if (!targetStat.isFile()) {
              warnings.push({
                code: 'BROKEN_SYMLINK',
                path: entryPath,
                message: `Symlink target is not a file: "${entryPath}" -> "${symlinkTarget}"`
              });
              continue;
            }

            candidates.push({
              adapterId: adapter.id,
              root,
              logicalEntryPath: entryPath,
              logicalFilePath: entryPath,
              physicalDirPath: root.path,
              physicalFilePath: symlinkTarget,
              symlinkTarget
            });
          } else if (lstat.isFile()) {
            candidates.push({
              adapterId: adapter.id,
              root,
              logicalEntryPath: entryPath,
              logicalFilePath: entryPath,
              physicalDirPath: root.path,
              physicalFilePath: entryPath,
              symlinkTarget: null
            });
          }
        }
      }
    }
  }

  return { candidates, roots: acceptedRoots, warnings, truncated };
}
