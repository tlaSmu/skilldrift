import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.js';
import type { AdapterEnv, ScanWarning } from '../../src/core/types.js';

describe('ClaudeCodeAdapter', () => {
  it('discovers user and project roots in fixture setup', async () => {
    const adapter = new ClaudeCodeAdapter();
    const fixtureHome = path.resolve('test/fixtures/inventory/home');
    const fixtureProject = path.resolve('test/fixtures/inventory/project');

    const warnings: ScanWarning[] = [];
    const env: AdapterEnv = {
      cwd: fixtureProject,
      homeDir: fixtureHome,
      configDir: path.join(fixtureHome, '.config'),
      dataDir: path.join(fixtureHome, '.local', 'share'),
      config: {
        scan: { workspaces: [], depth: 4, maxFiles: 1000, ignore: [] },
        harness: { custom: [] }
      },
      platform: 'darwin',
      environment: {},
      warn(w) {
        warnings.push(w);
      }
    };

    const detected = await adapter.detect(env);
    expect(detected).toBe(true);

    const roots = await adapter.roots(env);
    expect(roots.length).toBeGreaterThanOrEqual(2);

    const userRoot = roots.find(r => r.scope === 'user');
    expect(userRoot).toBeDefined();
    expect(userRoot?.precedence).toBe(20);
    expect(userRoot?.readonly).toBe(false);

    const projectRoot = roots.find(r => r.scope === 'project');
    expect(projectRoot).toBeDefined();
    expect(projectRoot?.precedence).toBe(30);
    expect(projectRoot?.readonly).toBe(false);
  });

  it('selects alternate user base when CLAUDE_CONFIG_DIR is set without changing project root', async () => {
    const adapter = new ClaudeCodeAdapter();
    const fixtureHome = path.resolve('test/fixtures/inventory/home');
    const fixtureProject = path.resolve('test/fixtures/inventory/project');
    const altClaudeDir = path.resolve('test/fixtures/inventory/claude-alt');

    const env: AdapterEnv = {
      cwd: fixtureProject,
      homeDir: fixtureHome,
      configDir: path.join(fixtureHome, '.config'),
      dataDir: path.join(fixtureHome, '.local', 'share'),
      config: {
        scan: { workspaces: [], depth: 4, maxFiles: 1000, ignore: [] },
        harness: { custom: [] }
      },
      platform: 'darwin',
      environment: {
        CLAUDE_CONFIG_DIR: altClaudeDir
      },
      warn() {}
    };

    const roots = await adapter.roots(env);
    const userRoot = roots.find(r => r.scope === 'user');
    expect(userRoot).toBeDefined();
    expect(userRoot?.path).toBe(path.join(altClaudeDir, 'skills'));

    const projectRoot = roots.find(r => r.scope === 'project');
    expect(projectRoot).toBeDefined();
    expect(projectRoot?.path).toBe(path.join(fixtureProject, '.claude', 'skills'));
  });
});
