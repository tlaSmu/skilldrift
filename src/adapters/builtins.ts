import type { HarnessAdapter } from '../core/types.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { OmpAdapter } from './omp.js';
import { CodexAdapter } from './codex.js';
import { AntigravityAdapter } from './antigravity.js';

export const BUILTIN_HARNESS_IDS = [
  'claude-code',
  'omp',
  'codex',
  'antigravity'
] as const;

export type BuiltinHarnessId = (typeof BUILTIN_HARNESS_IDS)[number];

export function createBuiltinAdapters(): HarnessAdapter[] {
  return [
    new ClaudeCodeAdapter(),
    new OmpAdapter(),
    new CodexAdapter(),
    new AntigravityAdapter()
  ];
}
