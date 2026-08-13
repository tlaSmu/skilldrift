import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { AntigravityAdapter } from '../../src/adapters/antigravity.js';
import type { AdapterEnv } from '../../src/core/types.js';

describe('AntigravityAdapter', () => {
  it('discovers user and builtin system roots when present', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'antigrav-test-'));

    const userSkills = path.join(tmpHome, '.gemini', 'config', 'skills');
    const builtinSkills = path.join(tmpHome, '.gemini', 'antigravity', 'builtin', 'skills');

    await fs.mkdir(userSkills, { recursive: true });
    await fs.mkdir(builtinSkills, { recursive: true });

    const adapter = new AntigravityAdapter();
    const env: AdapterEnv = {
      cwd: tmpHome,
      homeDir: tmpHome,
      configDir: path.join(tmpHome, '.config'),
      dataDir: path.join(tmpHome, '.local', 'share'),
      config: {
        scan: { workspaces: [], depth: 4, maxFiles: 1000, ignore: [] },
        harness: { custom: [] }
      },
      platform: 'darwin',
      environment: {},
      warn() {}
    };

    const detected = await adapter.detect(env);
    expect(detected).toBe(true);

    const roots = await adapter.roots(env);
    expect(roots).toHaveLength(2);

    const userRoot = roots.find(r => r.path === userSkills);
    expect(userRoot).toBeDefined();
    expect(userRoot?.scope).toBe('user');
    expect(userRoot?.precedence).toBe(20);
    expect(userRoot?.readonly).toBe(false);

    const builtinRoot = roots.find(r => r.path === builtinSkills);
    expect(builtinRoot).toBeDefined();
    expect(builtinRoot?.scope).toBe('system');
    expect(builtinRoot?.precedence).toBe(10);
    expect(builtinRoot?.readonly).toBe(true);

    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('returns no roots and false detection when paths do not exist', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'antigrav-empty-'));

    const adapter = new AntigravityAdapter();
    const env: AdapterEnv = {
      cwd: tmpHome,
      homeDir: tmpHome,
      configDir: path.join(tmpHome, '.config'),
      dataDir: path.join(tmpHome, '.local', 'share'),
      config: {
        scan: { workspaces: [], depth: 4, maxFiles: 1000, ignore: [] },
        harness: { custom: [] }
      },
      platform: 'darwin',
      environment: {},
      warn() {}
    };

    const detected = await adapter.detect(env);
    expect(detected).toBe(false);

    const roots = await adapter.roots(env);
    expect(roots).toHaveLength(0);

    await fs.rm(tmpHome, { recursive: true, force: true });
  });
});
