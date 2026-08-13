import * as path from 'node:path';
import * as os from 'node:os';
import { defineCommand } from 'citty';
import type { Scope, ListJsonOutput, SkillRecord } from '../../core/types.js';
import { readIndex, getIndexPath, IndexStoreError } from '../../store/index.js';
import { projectRecord } from './scan.js';
import { renderBanner } from '../ui/banner.js';
import { isUnicodeOutput, resolveOutputCapabilities } from '../ui/output.js';
import { renderSkillsTable } from '../ui/table.js';
import { theme } from '../ui/theme.js';
import { PACKAGE_VERSION } from '../../version.js';

const VALID_SCOPES: Scope[] = ['user', 'project', 'plugin', 'system'];

const SORT_KEYS = ['name', 'harness', 'scope', 'size', 'mtime', 'path'] as const;
type SortKey = (typeof SORT_KEYS)[number];

export type SortableSkill = Pick<
  SkillRecord,
  'name' | 'harness' | 'scope' | 'path' | 'mtime' | 'size'
>;

/** Order records for display. `size` and `mtime` are descending; ties break on name. */
export function sortSkills<T extends SortableSkill>(skills: readonly T[], key: SortKey): T[] {
  return [...skills].sort((a, b) => {
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'harness': {
        const cmp = a.harness.localeCompare(b.harness);
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      }
      case 'scope': {
        const cmp = a.scope.localeCompare(b.scope);
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      }
      case 'size': {
        const diff = b.size.tokensApprox - a.size.tokensApprox;
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      case 'mtime': {
        const diff = b.mtime.localeCompare(a.mtime);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      case 'path': {
        const cmp = a.path.localeCompare(b.path);
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      }
    }
  });
}

export const lsCommand = defineCommand({
  meta: {
    name: 'ls',
    description: 'List indexed skills from the local skillctl store'
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Output JSON format',
      default: false
    },
    plain: {
      type: 'boolean',
      description: 'Use portable plain-text output',
      default: false
    },
    harness: {
      type: 'string',
      description: 'Filter by harness id (comma-separated list)'
    },
    scope: {
      type: 'string',
      description: 'Filter by scope (user,project,plugin,system)'
    },
    sort: {
      type: 'string',
      description: 'Sort by field (name, harness, scope, size, mtime, path)'
    },
    long: {
      type: 'boolean',
      description: 'Include description field',
      default: false
    }
  },
  async run({ args }) {
    const isJson = Boolean(args.json);
    const output = resolveOutputCapabilities({
      plain: Boolean(args.plain),
      isTTY: process.stdout.isTTY,
      columns: process.stdout.columns,
      term: process.env.TERM
    });
    const homeDir = process.env.HOME ? path.resolve(process.env.HOME) : os.homedir();
    const dataDir = process.env.XDG_DATA_HOME ? path.resolve(process.env.XDG_DATA_HOME) : undefined;
    const indexPath = getIndexPath(dataDir, homeDir);

    let harnessFilter: string[] = [];
    if (args.harness) {
      harnessFilter = args.harness
        .split(',')
        .map(h => h.trim())
        .filter(Boolean);
    }

    const scopeFilter: Scope[] = [];
    if (args.scope) {
      const rawScopes = args.scope
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      for (const s of rawScopes) {
        if (!VALID_SCOPES.includes(s as Scope)) {
          const msg = `Invalid --scope "${s}". Valid values: ${VALID_SCOPES.join(', ')}`;
          if (isJson) {
            console.log(
              JSON.stringify({
                schemaVersion: 1,
                error: { code: 'CONFIG_INVALID', message: msg }
              })
            );
          } else {
            console.error(isUnicodeOutput(output) ? theme.error(msg) : msg);
          }
          process.exitCode = 2;
          return;
        }
        scopeFilter.push(s as Scope);
      }
    }

    let sortKey: SortKey | null = null;
    if (args.sort) {
      const trimmed = args.sort.trim();
      if (!SORT_KEYS.includes(trimmed as SortKey)) {
        const msg = `Invalid --sort "${trimmed}". Valid values: ${SORT_KEYS.join(', ')}`;
        if (isJson) {
          console.log(
            JSON.stringify({
              schemaVersion: 1,
              error: { code: 'CONFIG_INVALID', message: msg }
            })
          );
        } else {
          console.error(isUnicodeOutput(output) ? theme.error(msg) : msg);
        }
        process.exitCode = 2;
        return;
      }
      sortKey = trimmed as SortKey;
    }

    let index;
    try {
      index = await readIndex(indexPath);
    } catch (err) {
      const storeErr = err as IndexStoreError;
      const code = storeErr.code ?? 'INDEX_MISSING';
      const msg = storeErr.message;
      if (isJson) {
        console.log(
          JSON.stringify({
            schemaVersion: 1,
            error: { code, message: msg }
          })
        );
      } else {
        console.error(
          isUnicodeOutput(output)
            ? theme.error(`Error loading index: ${msg}\nRun "skillctl scan --write" to generate index.`)
            : `Error loading index: ${msg}\nRun "skillctl scan --write" to generate index.`
        );
      }
      process.exitCode = 1;
      return;
    }

    let filtered = index.skills;

    if (harnessFilter.length > 0) {
      filtered = filtered.filter(s => harnessFilter.includes(s.harness));
    }

    if (scopeFilter.length > 0) {
      filtered = filtered.filter(s => scopeFilter.includes(s.scope));
    }

    if (sortKey !== null) {
      filtered = sortSkills(filtered, sortKey);
    }

    if (isJson) {
      const output: ListJsonOutput = {
        schemaVersion: 1,
        command: 'ls',
        normalizerVersion: 1,
        indexedAt: index.generatedAt,
        filters: {
          harnesses: harnessFilter,
          scopes: scopeFilter
        },
        count: filtered.length,
        skills: filtered.map(projectRecord),
        warnings: index.warnings
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      renderBanner({ version: PACKAGE_VERSION, command: 'ls', output });
      renderSkillsTable(filtered, homeDir, { long: Boolean(args.long), output });
    }
  }
});
