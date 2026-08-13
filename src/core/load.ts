import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  DiscoveredSkill,
  SkillSource,
  SkillResource
} from './types.js';
import { ScanBudget, ScanIo, nodeScanIo } from './discover.js';

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

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function loadSkill(
  candidate: DiscoveredSkill,
  budget: ScanBudget,
  io: ScanIo = nodeScanIo
): Promise<SkillSource | null> {
  // Consume budget unit for main file
  if (!budget.consume()) {
    return null;
  }

  let mainFileBytes: Uint8Array;
  let mainFileMtime: Date;
  let mainFileBirthtime: Date | null;

  try {
    mainFileBytes = await io.readFile(candidate.physicalFilePath);
    const mainStat = await io.stat(candidate.physicalFilePath);
    mainFileMtime = mainStat.mtime;
    mainFileBirthtime = mainStat.birthtime;
  } catch {
    return null;
  }

  const resources: SkillResource[] = [];

  const isDirSkill = candidate.logicalFilePath !== candidate.logicalEntryPath;

  // If skill is directory-based, enumerate resources below physicalDirPath
  if (isDirSkill || candidate.symlinkTarget !== null) {
    const rootDir = candidate.physicalDirPath;

    async function collectResources(dirPath: string): Promise<boolean> {
      let entries;
      try {
        entries = await io.readdir(dirPath);
      } catch {
        return true;
      }

      for (const entry of entries) {
        if (DEFAULT_BUILTIN_SKIPS.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        let lstat;
        try {
          lstat = await io.lstat(fullPath);
        } catch {
          continue;
        }

        // Do not follow nested resource symlinks
        if (lstat.isSymbolicLink()) {
          continue;
        }

        if (lstat.isDirectory()) {
          const ok = await collectResources(fullPath);
          if (!ok) return false;
        } else if (lstat.isFile()) {
          if (fullPath === candidate.physicalFilePath) {
            continue;
          }

          if (!budget.consume()) {
            return false;
          }

          try {
            const bytes = await io.readFile(fullPath);
            const stat = await io.stat(fullPath);
            const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
            const fileHex = sha256Hex(bytes);

            resources.push({
              rel,
              sha256: fileHex,
              bytes: stat.size
            });
          } catch {
            // Ignore unreadable resource
          }
        }
      }

      return true;
    }

    const success = await collectResources(rootDir);
    if (!success) {
      return null;
    }
  }

  // Sort resources by POSIX-style relative path
  resources.sort((a, b) => a.rel.localeCompare(b.rel));

  return {
    candidate,
    mainFileBytes,
    mainFileMtime,
    mainFileBirthtime,
    resources
  };
}
