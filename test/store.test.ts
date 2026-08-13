import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { writeIndex, readIndex, getIndexPath, IndexStoreError } from '../src/store/index.js';
import type { SkillIndex } from '../src/core/types.js';

describe('store/index', () => {
  it('resolves index path correctly with dataDir', () => {
    const p = getIndexPath('/tmp/custom-data', '/home/user');
    expect(p).toBe(path.normalize('/tmp/custom-data/skillctl/index.json'));
  });

  it('performs atomic write and read round-trip', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillctl-test-'));
    const indexPath = path.join(tmpDir, 'skillctl', 'index.json');

    const index: SkillIndex = {
      schemaVersion: 1,
      normalizerVersion: 1,
      generatedAt: new Date().toISOString(),
      projectPath: '/tmp/project',
      summary: {
        harnesses: 1,
        roots: 1,
        skills: 1,
        issues: 0,
        warnings: 0,
        truncated: false
      },
      skills: [],
      warnings: []
    };

    await writeIndex(indexPath, index);
    const read = await readIndex(indexPath);
    expect(read.schemaVersion).toBe(1);
    expect(read.projectPath).toBe('/tmp/project');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('refuses to write truncated index', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillctl-test-'));
    const indexPath = path.join(tmpDir, 'skillctl', 'index.json');

    const truncatedIndex: SkillIndex = {
      schemaVersion: 1,
      normalizerVersion: 1,
      generatedAt: new Date().toISOString(),
      projectPath: '/tmp/project',
      summary: {
        harnesses: 1,
        roots: 1,
        skills: 1,
        issues: 0,
        warnings: 1,
        truncated: true
      },
      skills: [],
      warnings: []
    };

    await expect(writeIndex(indexPath, truncatedIndex)).rejects.toThrow(IndexStoreError);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('throws IndexStoreError on missing index', async () => {
    const missingPath = '/tmp/nonexistent-path-skillctl-12345/index.json';
    await expect(readIndex(missingPath)).rejects.toThrow(IndexStoreError);
  });
});
