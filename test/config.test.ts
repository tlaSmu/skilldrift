import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { parseRootString, parseConfigFile, loadConfig, ConfigError } from '../src/config.js';

describe('config', () => {
  it('parses valid root strings correctly', () => {
    const root = parseRootString('/tmp/skills:user:20', '/tmp', '/home/user');
    expect(root).toEqual({
      path: path.normalize('/tmp/skills'),
      scope: 'user',
      precedence: 20,
      readonly: false
    });
  });

  it('parses Windows drive letter root strings correctly', () => {
    const root = parseRootString('C:\\Users\\test\\skills:project:30', '/tmp', '/home/user');
    expect(root.scope).toBe('project');
    expect(root.precedence).toBe(30);
    expect(root.readonly).toBe(false);
  });

  it('expands tilde in root strings relative to homeDir', () => {
    const root = parseRootString('~/skills:user:10', '/tmp', '/home/testuser');
    expect(root.path).toBe(path.normalize('/home/testuser/skills'));
  });

  it('resolves relative path in root strings against configDir', () => {
    const root = parseRootString('../rel-skills:user:10', '/home/testuser/config', '/home/testuser');
    expect(root.path).toBe(path.normalize('/home/testuser/rel-skills'));
  });

  it('throws ConfigError on invalid root string formats', () => {
    expect(() => parseRootString('invalid-string', '/tmp', '/home')).toThrow(ConfigError);
    expect(() => parseRootString('/tmp/skills:invalidscope:10', '/tmp', '/home')).toThrow(ConfigError);
    expect(() => parseRootString('/tmp/skills:user:notanumber', '/tmp', '/home')).toThrow(ConfigError);
  });

  it('parses a complete TOML config file', () => {
    const tomlContent = `
[scan]
workspaces = ["~/projects"]
depth = 5
maxFiles = 20000
ignore = ["*.tmp"]

[[harness.custom]]
id = "my-harness"
layout = "dir-skill-md"
roots = ["/skills:project:30"]
`;
    const res = parseConfigFile(tomlContent, '/tmp/config.toml', '/home/user');
    expect(res.scan?.depth).toBe(5);
    expect(res.scan?.maxFiles).toBe(20000);
    expect(res.customHarnesses).toHaveLength(1);
    expect(res.customHarnesses?.[0]?.config.id).toBe('my-harness');
  });

  it('rejects custom harness ids that conflict with built-in harness ids', () => {
    const reservedIds = ['claude-code', 'omp', 'codex', 'antigravity'];
    for (const reservedId of reservedIds) {
      const tomlContent = `
[[harness.custom]]
id = "${reservedId}"
layout = "dir-skill-md"
roots = ["/skills:project:30"]
`;
      expect(() => parseConfigFile(tomlContent, '/tmp/config.toml', '/home/user')).toThrow(
        `Custom harness id "${reservedId}" conflicts with built-in harness "${reservedId}" in "/tmp/config.toml"`
      );
    }
  });

  it('throws ConfigError on duplicate custom harness ids', () => {
    const tomlContent = `
[[harness.custom]]
id = "h1"
layout = "dir-skill-md"
roots = ["/skills:project:30"]

[[harness.custom]]
id = "h1"
layout = "flat-md"
roots = ["/skills2:user:10"]
`;
    expect(() => parseConfigFile(tomlContent, '/tmp/config.toml', '/home/user')).toThrow(ConfigError);
  });

  it('throws ConfigError on unsupported generic layout "custom"', () => {
    const tomlContent = `
[[harness.custom]]
id = "h1"
layout = "custom"
roots = ["/skills:project:30"]
`;
    expect(() => parseConfigFile(tomlContent, '/tmp/config.toml', '/home/user')).toThrow(ConfigError);
  });

  it('loads explicit config file correctly', async () => {
    const fixtureConfig = path.resolve('test/fixtures/inventory/config/config.toml');
    const loaded = await loadConfig({ cwd: process.cwd(), homeDir: osHome() }, fixtureConfig);
    expect(loaded.config.scan.depth).toBe(4);
    expect(loaded.config.harness.custom).toHaveLength(2);
  });
});

function osHome(): string {
  return process.env.HOME ?? '/home/user';
}
