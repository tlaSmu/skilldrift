import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { performScan } from '../src/core/scan.js';
import { createBuiltinAdapters } from '../src/adapters/builtins.js';
import { GenericHarnessAdapter } from '../src/adapters/generic.js';
import { loadConfig } from '../src/config.js';
import type { AdapterEnv } from '../src/core/types.js';
import { sortSkills, type SortableSkill } from '../src/cli/commands/ls.js';

function skill(over: Partial<SortableSkill> & { name: string }): SortableSkill {
  return {
    harness: 'claude-code',
    scope: 'user',
    path: `/root/${over.name}/SKILL.md`,
    mtime: '2026-01-01T00:00:00.000Z',
    size: { bytes: 0, tokensApprox: 0 },
    ...over
  };
}

describe('sortSkills', () => {
  const records = [
    skill({ name: 'beta', harness: 'omp', scope: 'project', mtime: '2026-03-01T00:00:00.000Z', size: { bytes: 0, tokensApprox: 10 } }),
    skill({ name: 'alpha', harness: 'zeta', scope: 'user', mtime: '2026-01-01T00:00:00.000Z', size: { bytes: 0, tokensApprox: 30 } }),
    skill({ name: 'gamma', harness: 'claude-code', scope: 'plugin', mtime: '2026-02-01T00:00:00.000Z', size: { bytes: 0, tokensApprox: 20 } })
  ];

  it('sorts by name ascending', () => {
    expect(sortSkills(records, 'name').map(s => s.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('sorts by size descending', () => {
    expect(sortSkills(records, 'size').map(s => s.name)).toEqual(['alpha', 'gamma', 'beta']);
  });

  it('sorts by mtime newest first', () => {
    expect(sortSkills(records, 'mtime').map(s => s.name)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts by harness then name', () => {
    expect(sortSkills(records, 'harness').map(s => s.harness)).toEqual(['claude-code', 'omp', 'zeta']);
  });

  it('breaks size ties on name and never mutates the input', () => {
    const tied = [skill({ name: 'b' }), skill({ name: 'a' })];
    expect(sortSkills(tied, 'size').map(s => s.name)).toEqual(['a', 'b']);
    expect(tied.map(s => s.name)).toEqual(['b', 'a']);
  });
});

describe('fourteen-skill fixture inventory smoke test', () => {
  it('scans exactly fourteen skills across six harnesses', async () => {
    const fixtureHome = path.resolve('test/fixtures/inventory/home');
    const fixtureProject = path.resolve('test/fixtures/inventory/project');
    const fixtureConfig = path.resolve('test/fixtures/inventory/config/config.toml');

    const loaded = await loadConfig(
      { cwd: fixtureProject, homeDir: fixtureHome },
      fixtureConfig
    );

    const env: AdapterEnv = {
      cwd: fixtureProject,
      homeDir: fixtureHome,
      configDir: path.join(fixtureHome, '.config'),
      dataDir: path.join(fixtureHome, '.local', 'share'),
      config: loaded.config,
      platform: 'darwin',
      environment: {},
      warn() {}
    };

    const adapters = [
      ...createBuiltinAdapters(),
      ...loaded.config.harness.custom.map(
        c => new GenericHarnessAdapter(c, loaded.customHarnessRoots.get(c.id) ?? [])
      )
    ];

    const index = await performScan(adapters, env);

    expect(index.summary.skills).toBe(14);
    expect(index.summary.harnesses).toBe(6);
    expect(index.summary.truncated).toBe(false);

    const countByHarness: Record<string, number> = {};
    for (const s of index.skills) {
      countByHarness[s.harness] = (countByHarness[s.harness] ?? 0) + 1;
    }

    expect(countByHarness).toEqual({
      'claude-code': 2,
      omp: 4,
      codex: 3,
      antigravity: 2,
      'generic-agent': 2,
      'notes-agent': 1
    });

    const sharedOmp = index.skills.find(s => s.name === 'shared-agents-skill' && s.harness === 'omp');
    const sharedCodex = index.skills.find(s => s.name === 'shared-agents-skill' && s.harness === 'codex');
    expect(sharedOmp).toBeDefined();
    expect(sharedCodex).toBeDefined();
  });
});
