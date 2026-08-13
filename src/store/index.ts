import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SkillIndex } from '../core/types.js';
import { SCAN_SCHEMA_VERSION } from '../core/types.js';

export class IndexStoreError extends Error {
  readonly code:
    | 'INDEX_MISSING'
    | 'INDEX_CORRUPT'
    | 'INDEX_SCHEMA_UNSUPPORTED'
    | 'INDEX_WRITE_FAILED';

  constructor(
    code:
      | 'INDEX_MISSING'
      | 'INDEX_CORRUPT'
      | 'INDEX_SCHEMA_UNSUPPORTED'
      | 'INDEX_WRITE_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'IndexStoreError';
    this.code = code;
  }
}

export function getIndexPath(dataDir?: string, homeDir?: string): string {
  const homeResolved = homeDir ? path.resolve(homeDir) : os.homedir();

  if (dataDir) {
    return path.join(path.resolve(dataDir), 'skillctl', 'index.json');
  }

  if (process.env.XDG_DATA_HOME) {
    return path.join(path.resolve(process.env.XDG_DATA_HOME), 'skillctl', 'index.json');
  }

  return path.join(homeResolved, '.local', 'share', 'skillctl', 'index.json');
}

export async function writeIndex(indexPath: string, index: SkillIndex): Promise<void> {
  if (index.summary.truncated) {
    throw new IndexStoreError(
      'INDEX_WRITE_FAILED',
      'Cannot persist incomplete/truncated scan index'
    );
  }

  const dirPath = path.dirname(indexPath);
  try {
    await fs.mkdir(dirPath, { recursive: true, mode: 0o700 });
  } catch (err) {
    throw new IndexStoreError(
      'INDEX_WRITE_FAILED',
      `Failed to create directory "${dirPath}": ${(err as Error).message}`
    );
  }

  const tmpPath = `${indexPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const content = JSON.stringify(index, null, 2);

  try {
    await fs.writeFile(tmpPath, content, { mode: 0o600, encoding: 'utf-8' });
    await fs.rename(tmpPath, indexPath);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw new IndexStoreError(
      'INDEX_WRITE_FAILED',
      `Failed to write index to "${indexPath}": ${(err as Error).message}`
    );
  }
}

export async function readIndex(indexPath: string): Promise<SkillIndex> {
  let content: string;
  try {
    content = await fs.readFile(indexPath, 'utf-8');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new IndexStoreError('INDEX_MISSING', `Index file not found at "${indexPath}"`);
    }
    throw new IndexStoreError(
      'INDEX_CORRUPT',
      `Failed to read index file at "${indexPath}": ${error.message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new IndexStoreError('INDEX_CORRUPT', `Index file at "${indexPath}" is invalid JSON`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new IndexStoreError('INDEX_CORRUPT', `Index file at "${indexPath}" is not an object`);
  }

  const index = parsed as SkillIndex;

  if (index.schemaVersion !== SCAN_SCHEMA_VERSION) {
    throw new IndexStoreError(
      'INDEX_SCHEMA_UNSUPPORTED',
      `Index schema version ${String(index.schemaVersion)} is not supported (expected ${SCAN_SCHEMA_VERSION})`
    );
  }

  return index;
}
