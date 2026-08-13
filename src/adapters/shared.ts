import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SkillRoot } from '../core/types.js';

export async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function hasGitMarker(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, '.git');
    const stat = await fs.stat(gitPath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

export function deduplicateRoots(roots: SkillRoot[]): SkillRoot[] {
  const seen = new Set<string>();
  const result: SkillRoot[] = [];

  for (const root of roots) {
    let normalizedPath = path.normalize(root.path);
    if (
      normalizedPath.length > 1 &&
      (normalizedPath.endsWith('/') || normalizedPath.endsWith('\\'))
    ) {
      normalizedPath = normalizedPath.slice(0, -1);
    }
    const key = `${normalizedPath}:${root.scope}:${root.precedence}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        ...root,
        path: normalizedPath
      });
    }
  }

  return result;
}

export function resolveEnvironmentDir(
  value: string | undefined,
  fallback: string,
  homeDir: string
): string {
  const raw = value && value.trim() ? value.trim() : fallback;
  if (raw === '~') {
    return path.normalize(homeDir);
  }
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.normalize(path.join(homeDir, raw.slice(2)));
  }
  if (path.isAbsolute(raw)) {
    return path.normalize(raw);
  }
  return path.normalize(path.resolve(process.cwd(), raw));
}
