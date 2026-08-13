import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { OmpAdapter } from '../../src/adapters/omp.js';
import type { AdapterEnv } from '../../src/core/types.js';

describe('OmpAdapter', () => {
  it('discovers native, remapped Claude, shared, and managed roots with correct precedence', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-test-'));
    const tmpProject = path.join(tmpHome, 'project');
    await fs.mkdir(tmpProject, { recursive: true });

    // Create all test directories
    const nativeSkills = path.join(tmpHome, '.omp', 'agent', 'skills');
    const managedSkills = path.join(tmpHome, '.omp', 'agent', 'managed-skills');
    const agentSkills = path.join(tmpHome, '.agent', 'skills');
    const agentsSkills = path.join(tmpHome, '.agents', 'skills');
    const codexSkills = path.join(tmpHome, '.codex', 'skills');
    const claudeSkills = path.join(tmpHome, '.claude', 'skills');

    await fs.mkdir(nativeSkills, { recursive: true });
    await fs.mkdir(managedSkills, { recursive: true });
    await fs.mkdir(agentSkills, { recursive: true });
    await fs.mkdir(agentsSkills, { recursive: true });
    await fs.mkdir(codexSkills, { recursive: true });
    await fs.mkdir(claudeSkills, { recursive: true });

    const adapter = new OmpAdapter();
    const env: AdapterEnv = {
      cwd: tmpProject,
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

    const nativeRoot = roots.find(r => r.path === nativeSkills);
    expect(nativeRoot).toBeDefined();
    expect(nativeRoot?.scope).toBe('user');
    expect(nativeRoot?.precedence).toBe(100);
    expect(nativeRoot?.readonly).toBe(false);

    const claudeRoot = roots.find(r => r.path === claudeSkills);
    expect(claudeRoot).toBeDefined();
    expect(claudeRoot?.scope).toBe('user');
    expect(claudeRoot?.precedence).toBe(80);
    expect(claudeRoot?.readonly).toBe(false);

    const agentRoot = roots.find(r => r.path === agentSkills);
    expect(agentRoot?.precedence).toBe(70);

    const agentsRoot = roots.find(r => r.path === agentsSkills);
    expect(agentsRoot?.precedence).toBe(70);

    const codexRoot = roots.find(r => r.path === codexSkills);
    expect(codexRoot?.precedence).toBe(70);

    const managedRoot = roots.find(r => r.path === managedSkills);
    expect(managedRoot).toBeDefined();
    expect(managedRoot?.scope).toBe('user');
    expect(managedRoot?.precedence).toBe(5);
    expect(managedRoot?.readonly).toBe(false);

    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('respects PI_CODING_AGENT_DIR override', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-env-test-'));
    const customAgentDir = path.join(tmpHome, 'custom-agent');
    const customSkills = path.join(customAgentDir, 'skills');
    const customManaged = path.join(customAgentDir, 'managed-skills');

    await fs.mkdir(customSkills, { recursive: true });
    await fs.mkdir(customManaged, { recursive: true });

    const adapter = new OmpAdapter();
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
      environment: {
        PI_CODING_AGENT_DIR: customAgentDir
      },
      warn() {}
    };

    const roots = await adapter.roots(env);

    const nativeRoot = roots.find(r => r.path === customSkills);
    expect(nativeRoot).toBeDefined();
    expect(nativeRoot?.precedence).toBe(100);

    const managedRoot = roots.find(r => r.path === customManaged);
    expect(managedRoot).toBeDefined();
    expect(managedRoot?.precedence).toBe(5);

    await fs.rm(tmpHome, { recursive: true, force: true });
  });
});
