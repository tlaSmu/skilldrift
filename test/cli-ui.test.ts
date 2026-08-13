import { describe, expect, it, vi } from 'vitest';
import type { SkillRecord } from '../src/core/types.js';
import { mergeWarnings, parsePositiveInteger } from '../src/cli/commands/scan.js';
import { renderSummaryCard } from '../src/cli/ui/banner.js';
import { resolveOutputCapabilities } from '../src/cli/ui/output.js';
import { shortenHomePath, renderSkillsTable } from '../src/cli/ui/table.js';
import { truncateVisible, visibleLength } from '../src/cli/ui/theme.js';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'sample-id',
    name: 'sample-skill',
    declaredName: 'sample-skill',
    description: null,
    path: '/home/tester/.agents/skills/sample-skill/SKILL.md',
    dir: '/home/tester/.agents/skills/sample-skill',
    sourceRoot: '/home/tester/.agents/skills',
    harness: 'omp',
    scope: 'user',
    precedence: 70,
    readonly: false,
    symlinkTarget: null,
    allowedTools: [],
    frontmatterRaw: {},
    unknownKeys: [],
    body: '',
    bodyNormalized: '',
    hashExact: 'exact',
    hashFile: 'file',
    resourcesHash: 'resources',
    resources: [],
    size: { bytes: 0, tokensApprox: 0 },
    mtime: '2026-01-01T00:00:00.000Z',
    birthtime: null,
    issues: [],
    ...overrides
  };
}

describe('CLI validation helpers', () => {
  it('accepts only positive safe integers for scan limits', () => {
    expect(parsePositiveInteger('1')).toBe(1);
    expect(parsePositiveInteger('50000')).toBe(50000);
    expect(parsePositiveInteger('2.5')).toBeNull();
    expect(parsePositiveInteger('3junk')).toBeNull();
    expect(parsePositiveInteger('1e3')).toBeNull();
    expect(parsePositiveInteger('0')).toBeNull();
  });

  it('deduplicates and orders environment diagnostics', () => {
    const warning = {
      code: 'CLAUDE_PLUGIN_STATE_INVALID' as const,
      path: '/home/tester/.claude/plugins/installed_plugins.json',
      message: 'Invalid plugin state'
    };
    const result = mergeWarnings([warning], [warning, {
      code: 'CODEX_PLUGIN_STATE_INVALID',
      path: '/home/tester/.codex/config.toml',
      message: 'Invalid plugin state'
    }]);

    expect(result).toEqual([
      warning,
      {
        code: 'CODEX_PLUGIN_STATE_INVALID',
        path: '/home/tester/.codex/config.toml',
        message: 'Invalid plugin state'
      }
    ]);
  });
});

describe('terminal output formatting', () => {
  it('uses plain output for redirected or explicitly plain streams', () => {
    expect(resolveOutputCapabilities({ isTTY: false, columns: 120, term: 'xterm-256color' })).toMatchObject({
      mode: 'plain',
      showBanner: false,
      showSpinner: false
    });
    expect(resolveOutputCapabilities({ plain: true, isTTY: true, columns: 120, term: 'xterm-256color' })).toMatchObject({
      mode: 'plain',
      showBanner: false
    });
  });

  it('uses Unicode enhancements only on an interactive capable terminal', () => {
    expect(resolveOutputCapabilities({ isTTY: true, columns: 120, term: 'xterm-256color' })).toEqual({
      mode: 'unicode',
      columns: 120,
      showBanner: true,
      showSpinner: true
    });
    expect(resolveOutputCapabilities({ isTTY: true, columns: 80, term: 'dumb' })).toMatchObject({
      mode: 'plain',
      showBanner: false,
      showSpinner: false
    });
  });

  it('measures display cells and truncates by grapheme', () => {
    expect(visibleLength('界')).toBe(2);
    expect(truncateVisible('😀😀😀', 5)).toBe('😀😀…');
  });

  it('only shortens paths inside the home directory', () => {
    expect(shortenHomePath('/home/tester/.agents/skills/sample/SKILL.md', '/home/tester')).toBe(
      '~/.agents/skills/sample/SKILL.md'
    );
    expect(shortenHomePath('/home/tester-backup/SKILL.md', '/home/tester')).toBe(
      '/home/tester-backup/SKILL.md'
    );
  });

  it('renders a summary card with consistent border widths', () => {
    const output: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.join(' '));
    });
    try {
      renderSummaryCard({
        skills: 12,
        harnesses: 4,
        roots: 8,
        issues: 1,
        warnings: 0,
        indexWritten: false,
        indexPath: null,
        defaultIndexPath: '/home/tester/.local/share/skillctl/index.json',
        truncated: false,
        output: resolveOutputCapabilities({ isTTY: true, columns: 120, term: 'xterm-256color' })
      });
    } finally {
      log.mockRestore();
    }

    const cardLines = output.filter(line => line.includes('╭') || line.includes('│') || line.includes('╰'));
    expect(cardLines).toHaveLength(6);
    expect(new Set(cardLines.map(visibleLength))).toEqual(new Set([cardLines.map(visibleLength)[0]]));
  });

  it('keeps narrow listings within the terminal width', () => {
    const output: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.join(' '));
    });
    try {
      renderSkillsTable(
        [record({
          name: 'very-long-skill-name-for-narrow-terminals',
          path: '/home/tester/.agents/skills/very-long-skill-name-for-narrow-terminals/SKILL.md',
          description: 'A detailed description for narrow-terminal rendering.',
          issues: ['invalid frontmatter']
        })],
        '/home/tester',
        {
          long: true,
          output: resolveOutputCapabilities({ isTTY: true, columns: 50, term: 'xterm-256color' })
        }
      );
    } finally {
      log.mockRestore();
    }

    expect(output.every(line => visibleLength(line) <= 50)).toBe(true);
  });
});
