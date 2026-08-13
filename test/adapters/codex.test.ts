import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { CodexAdapter } from '../../src/adapters/codex.js';
import type { AdapterEnv, ScanWarning } from '../../src/core/types.js';

describe('CodexAdapter', () => {
  it('discovers shared user, codex user, system, and enabled plugins while ignoring disabled plugins', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-test-'));

    const sharedAgentsSkills = path.join(tmpHome, '.agents', 'skills');
    const codexSkills = path.join(tmpHome, '.codex', 'skills');
    const codexSystemSkills = path.join(tmpHome, '.codex', 'skills', '.system');
    const enabledPluginSkills = path.join(
      tmpHome,
      '.codex',
      'plugins',
      'cache',
      'store',
      'my-plugin',
      '1.0.0',
      'skills'
    );
    const disabledPluginSkills = path.join(
      tmpHome,
      '.codex',
      'plugins',
      'cache',
      'store',
      'disabled-plugin',
      '1.0.0',
      'skills'
    );

    await fs.mkdir(sharedAgentsSkills, { recursive: true });
    await fs.mkdir(codexSkills, { recursive: true });
    await fs.mkdir(codexSystemSkills, { recursive: true });
    await fs.mkdir(enabledPluginSkills, { recursive: true });
    await fs.mkdir(disabledPluginSkills, { recursive: true });

    const configToml = `
[plugins."my-plugin@store"]
enabled = true

[plugins."disabled-plugin@store"]
enabled = false
`;
    await fs.writeFile(path.join(tmpHome, '.codex', 'config.toml'), configToml, 'utf-8');

    const warnings: ScanWarning[] = [];
    const adapter = new CodexAdapter();
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
      warn(w) {
        warnings.push(w);
      }
    };

    const detected = await adapter.detect(env);
    expect(detected).toBe(true);

    const roots = await adapter.roots(env);
    expect(warnings).toHaveLength(0);

    const sharedRoot = roots.find(r => r.path === sharedAgentsSkills);
    expect(sharedRoot?.precedence).toBe(20);
    expect(sharedRoot?.scope).toBe('user');

    const userRoot = roots.find(r => r.path === codexSkills);
    expect(userRoot?.precedence).toBe(20);
    expect(userRoot?.scope).toBe('user');

    const systemRoot = roots.find(r => r.path === codexSystemSkills);
    expect(systemRoot?.precedence).toBe(10);
    expect(systemRoot?.scope).toBe('system');
    expect(systemRoot?.readonly).toBe(true);

    const pluginRoot = roots.find(r => r.path === enabledPluginSkills);
    expect(pluginRoot).toBeDefined();
    expect(pluginRoot?.precedence).toBe(15);
    expect(pluginRoot?.scope).toBe('plugin');
    expect(pluginRoot?.readonly).toBe(true);

    const disabledRoot = roots.find(r => r.path === disabledPluginSkills);
    expect(disabledRoot).toBeUndefined();

    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('respects CODEX_HOME environment variable', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-env-test-'));
    const customHome = path.join(tmpHome, 'custom-codex');
    const customSkills = path.join(customHome, 'skills');

    await fs.mkdir(customSkills, { recursive: true });

    const adapter = new CodexAdapter();
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
        CODEX_HOME: customHome
      },
      warn() {}
    };

    const roots = await adapter.roots(env);
    const customRoot = roots.find(r => r.path === customSkills);
    expect(customRoot).toBeDefined();

    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('emits CODEX_PLUGIN_STATE_INVALID warning on malformed config.toml while preserving user/system roots', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-err-test-'));
    const codexSkills = path.join(tmpHome, '.codex', 'skills');
    await fs.mkdir(codexSkills, { recursive: true });

    await fs.writeFile(path.join(tmpHome, '.codex', 'config.toml'), 'invalid toml [[', 'utf-8');

    const warnings: ScanWarning[] = [];
    const adapter = new CodexAdapter();
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
      warn(w) {
        warnings.push(w);
      }
    };

    const roots = await adapter.roots(env);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('CODEX_PLUGIN_STATE_INVALID');

    const userRoot = roots.find(r => r.path === codexSkills);
    expect(userRoot).toBeDefined();

    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('excludes /etc/codex/skills on Windows platform', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-win-test-'));

    const adapter = new CodexAdapter();
    const env: AdapterEnv = {
      cwd: tmpHome,
      homeDir: tmpHome,
      configDir: path.join(tmpHome, '.config'),
      dataDir: path.join(tmpHome, '.local', 'share'),
      config: {
        scan: { workspaces: [], depth: 4, maxFiles: 1000, ignore: [] },
        harness: { custom: [] }
      },
      platform: 'win32',
      environment: {},
      warn() {}
    };

    const roots = await adapter.roots(env);
    const etcRoot = roots.find(r => r.path.includes('etc'));
    expect(etcRoot).toBeUndefined();

    await fs.rm(tmpHome, { recursive: true, force: true });
  });
});
