import * as path from 'node:path';
import { parseDocument, isMap } from 'yaml';
import type {
  SkillSource,
  SkillRecord
} from './types.js';
import { normalizeBody } from './normalize.js';
import { computeHashesAndSize } from './hash.js';

export function parseSkill(source: SkillSource, homeDir: string): SkillRecord {
  let rawText = new TextDecoder('utf-8').decode(source.mainFileBytes);
  if (rawText.charCodeAt(0) === 0xfeff) {
    rawText = rawText.slice(1);
  }

  const issues: string[] = [];
  let frontmatterRaw: Record<string, unknown> = {};
  let body = rawText;

  // Split frontmatter when first line is --- and closing --- exists
  const lines = rawText.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[0]?.trim() === '---') {
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex > 0) {
      const fmText = lines.slice(1, closingIndex).join('\n');
      body = lines.slice(closingIndex + 1).join('\n');

      try {
        const doc = parseDocument(fmText, { logLevel: 'silent' });
        if (doc.errors.length > 0 || !doc.contents || !isMap(doc.contents)) {
          issues.push('frontmatter.invalid');
        } else {
          const jsObj = doc.toJS();
          if (typeof jsObj === 'object' && jsObj !== null && !Array.isArray(jsObj)) {
            frontmatterRaw = jsObj as Record<string, unknown>;
          } else {
            issues.push('frontmatter.invalid');
          }
        }
      } catch {
        issues.push('frontmatter.invalid');
      }
    }
  }

  // Extract name & derived name
  const isDirSkill = source.candidate.logicalFilePath !== source.candidate.logicalEntryPath;
  const derivedName = isDirSkill || source.candidate.symlinkTarget !== null
    ? path.basename(source.candidate.logicalEntryPath)
    : path.basename(source.candidate.logicalFilePath, '.md');

  let declaredName: string | null = null;
  if ('name' in frontmatterRaw) {
    const rawVal = frontmatterRaw.name;
    if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
      declaredName = rawVal.trim();
    } else {
      issues.push('name.invalid');
    }
  }

  if (declaredName !== null && declaredName !== derivedName) {
    issues.push('frontmatter.name-mismatch');
  }

  const name = declaredName ?? derivedName;

  // Extract description
  let description: string | null = null;
  if ('description' in frontmatterRaw) {
    const rawDesc = frontmatterRaw.description;
    if (typeof rawDesc === 'string' && rawDesc.trim().length > 0) {
      description = rawDesc.trim();
    }
  }

  if (!description) {
    issues.push('description.missing');
  }

  // Extract allowed-tools
  let allowedTools: string[] = [];
  const rawAllowed = frontmatterRaw['allowed-tools'] ?? frontmatterRaw.allowedTools;
  if (rawAllowed !== undefined) {
    if (typeof rawAllowed === 'string') {
      allowedTools = rawAllowed
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    } else if (Array.isArray(rawAllowed)) {
      const validItems: string[] = [];
      let valid = true;
      for (const item of rawAllowed) {
        if (typeof item === 'string' && item.trim().length > 0) {
          validItems.push(item.trim());
        } else {
          valid = false;
        }
      }
      if (valid) {
        allowedTools = validItems;
      } else {
        issues.push('allowed-tools.invalid');
      }
    } else {
      issues.push('allowed-tools.invalid');
    }
  }

  // Unknown keys
  const knownKeys = new Set(['name', 'description', 'allowed-tools', 'allowedTools']);
  const unknownKeys: string[] = Object.keys(frontmatterRaw)
    .filter(k => !knownKeys.has(k))
    .sort();

  // Normalize body
  const bodyNormalized = normalizeBody(body, homeDir);

  // Compute hashes and size metadata
  const metadata = computeHashesAndSize(
    source.candidate.logicalFilePath,
    source.mainFileBytes,
    body,
    bodyNormalized,
    source.resources
  );

  const mtimeIso = source.mainFileMtime.toISOString();
  const birthtimeIso = source.mainFileBirthtime ? source.mainFileBirthtime.toISOString() : null;

  return {
    id: metadata.id,
    name,
    declaredName,
    description,
    path: source.candidate.logicalFilePath,
    dir: source.candidate.logicalEntryPath,
    sourceRoot: source.candidate.root.path,
    harness: source.candidate.adapterId,
    scope: source.candidate.root.scope,
    precedence: source.candidate.root.precedence,
    readonly: source.candidate.root.readonly,
    symlinkTarget: source.candidate.symlinkTarget,
    allowedTools,
    frontmatterRaw,
    unknownKeys,
    body,
    bodyNormalized,
    hashExact: metadata.hashExact,
    hashFile: metadata.hashFile,
    resourcesHash: metadata.resourcesHash,
    resources: source.resources,
    size: metadata.size,
    mtime: mtimeIso,
    birthtime: birthtimeIso,
    issues: Array.from(new Set(issues)).sort()
  };
}
