import { describe, it, expect } from 'vitest';
import { sha256Hex, computeMerkleRootHex, computeHashesAndSize } from '../../src/core/hash.js';

describe('hash', () => {
  it('computes sha256 hex correctly', () => {
    expect(sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('computes empty Merkle root hex for empty resources', () => {
    const emptyRoot = computeMerkleRootHex([]);
    expect(emptyRoot).toBe(sha256Hex('empty\x00'));
  });

  it('computes correct Merkle root hex for single resource', () => {
    const res = [{ rel: 'script.sh', sha256: sha256Hex('echo hi'), bytes: 7 }];
    const expectedLeaf = sha256Hex(`blob\x00script.sh\x007\x00${res[0]!.sha256}`);
    expect(computeMerkleRootHex(res)).toBe(expectedLeaf);
  });

  it('computes correct Merkle root hex for odd number of resources (duplicate last)', () => {
    const r1 = { rel: 'a', sha256: '11', bytes: 1 };
    const r2 = { rel: 'b', sha256: '22', bytes: 2 };
    const r3 = { rel: 'c', sha256: '33', bytes: 3 };

    const l1 = sha256Hex(`blob\x00a\x001\x0011`);
    const l2 = sha256Hex(`blob\x00b\x002\x0022`);
    const l3 = sha256Hex(`blob\x00c\x003\x0033`);

    const parent1 = sha256Hex(`node\x00${l1}${l2}`);
    const parent2 = sha256Hex(`node\x00${l3}${l3}`);

    const root = sha256Hex(`node\x00${parent1}${parent2}`);

    expect(computeMerkleRootHex([r1, r2, r3])).toBe(root);
  });

  it('computes 12-char hex id and size approximate tokens', () => {
    const res = computeHashesAndSize(
      '/path/to/skill/SKILL.md',
      new TextEncoder().encode('Hello World'),
      'Hello World',
      'Hello World',
      []
    );

    expect(res.id).toHaveLength(12);
    expect(res.hashExact).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(res.size.bytes).toBe(11);
    expect(res.size.tokensApprox).toBe(3);
  });
});
