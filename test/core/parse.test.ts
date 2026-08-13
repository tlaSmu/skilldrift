import { describe, it, expect } from 'vitest';
import { parseSkill } from '../../src/core/parse.js';
import type { SkillSource } from '../../src/core/types.js';

describe('parseSkill', () => {
  it('parses valid frontmatter correctly', () => {
    const mainFileBytes = new TextEncoder().encode(`---
name: my-skill
description: A great skill
allowed-tools: Read, Write
---
Body text here.
`);

    const source: SkillSource = {
      candidate: {
        adapterId: 'claude-code',
        root: { path: '/tmp/skills', scope: 'user', precedence: 20, readonly: false },
        logicalEntryPath: '/tmp/skills/my-skill',
        logicalFilePath: '/tmp/skills/my-skill/SKILL.md',
        physicalDirPath: '/tmp/skills/my-skill',
        physicalFilePath: '/tmp/skills/my-skill/SKILL.md',
        symlinkTarget: null
      },
      mainFileBytes,
      mainFileMtime: new Date('2026-08-13T10:00:00Z'),
      mainFileBirthtime: new Date('2026-08-13T10:00:00Z'),
      resources: []
    };

    const record = parseSkill(source, '/home/user');
    expect(record.name).toBe('my-skill');
    expect(record.description).toBe('A great skill');
    expect(record.allowedTools).toEqual(['Read', 'Write']);
    expect(record.issues).toEqual([]);
    expect(record.id).toHaveLength(12);
  });

  it('handles invalid frontmatter gracefully by falling back to derived name', () => {
    const mainFileBytes = new TextEncoder().encode(`---
invalid yaml syntax: [
---
Body text.
`);

    const source: SkillSource = {
      candidate: {
        adapterId: 'claude-code',
        root: { path: '/tmp/skills', scope: 'user', precedence: 20, readonly: false },
        logicalEntryPath: '/tmp/skills/fallback-name',
        logicalFilePath: '/tmp/skills/fallback-name/SKILL.md',
        physicalDirPath: '/tmp/skills/fallback-name',
        physicalFilePath: '/tmp/skills/fallback-name/SKILL.md',
        symlinkTarget: null
      },
      mainFileBytes,
      mainFileMtime: new Date('2026-08-13T10:00:00Z'),
      mainFileBirthtime: null,
      resources: []
    };

    const record = parseSkill(source, '/home/user');
    expect(record.name).toBe('fallback-name');
    expect(record.issues).toContain('description.missing');
    expect(record.issues).toContain('frontmatter.invalid');
  });
});
