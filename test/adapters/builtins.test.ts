import { describe, it, expect } from 'vitest';
import { BUILTIN_HARNESS_IDS, createBuiltinAdapters } from '../../src/adapters/builtins.js';

describe('createBuiltinAdapters', () => {
  it('returns the exact four built-in adapters in order', () => {
    expect(BUILTIN_HARNESS_IDS).toEqual([
      'claude-code',
      'omp',
      'codex',
      'antigravity'
    ]);

    const adapters = createBuiltinAdapters();
    expect(adapters).toHaveLength(4);

    const ids = adapters.map(a => a.id);
    expect(ids).toEqual([...BUILTIN_HARNESS_IDS]);
  });
});
