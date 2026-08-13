import { createHash } from 'node:crypto';
import type { SkillResource } from './types.js';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function computeMerkleRootHex(resources: SkillResource[]): string {
  if (resources.length === 0) {
    return sha256Hex('empty\x00');
  }

  let level: string[] = resources.map(res => {
    const payload = `blob\x00${res.rel}\x00${res.bytes}\x00${res.sha256}`;
    return sha256Hex(payload);
  });

  while (level.length > 1) {
    if (level.length % 2 !== 0) {
      const last = level[level.length - 1];
      if (last) {
        level.push(last);
      }
    }

    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (left && right) {
        nextLevel.push(sha256Hex(`node\x00${left}${right}`));
      }
    }
    level = nextLevel;
  }

  return level[0] ?? sha256Hex('empty\x00');
}

export function computeHashesAndSize(
  logicalFilePath: string,
  mainFileBytes: Uint8Array,
  body: string,
  bodyNormalized: string,
  resources: SkillResource[]
): {
  id: string;
  hashExact: string;
  hashFile: string;
  resourcesHash: string;
  size: {
    bytes: number;
    tokensApprox: number;
  };
} {
  const pathHash = sha256Hex(logicalFilePath);
  const id = pathHash.slice(0, 12);

  const hashExactHex = sha256Hex(bodyNormalized);
  const hashFileHex = sha256Hex(mainFileBytes);
  const rootHex = computeMerkleRootHex(resources);

  const tokensApprox = Math.ceil(body.length / 4);

  return {
    id,
    hashExact: `sha256:${hashExactHex}`,
    hashFile: `sha256:${hashFileHex}`,
    resourcesHash: `sha256:${rootHex}`,
    size: {
      bytes: mainFileBytes.length,
      tokensApprox
    }
  };
}
