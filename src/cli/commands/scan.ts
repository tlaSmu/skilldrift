import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { defineCommand } from 'citty';
import ora from 'ora';
import type {
  AdapterEnv,
  HarnessAdapter,
  ScanJsonOutput,
  SkillJsonProjection,
  SkillRecord,
  ScanWarning
} from '../../core/types.js';
import { loadConfig, ConfigError } from '../../config.js';
import { createBuiltinAdapters } from '../../adapters/builtins.js';
import { GenericHarnessAdapter } from '../../adapters/generic.js';
import { performScan } from '../../core/scan.js';
import { getIndexPath, writeIndex } from '../../store/index.js';
import { renderBanner, renderSummaryCard } from '../ui/banner.js';
import { isUnicodeOutput, resolveOutputCapabilities } from '../ui/output.js';
import type { OutputCapabilities } from '../ui/output.js';
import { theme } from '../ui/theme.js';
import { PACKAGE_VERSION } from '../../version.js';

export function projectRecord(record: SkillRecord): SkillJsonProjection {
  const { body: _b, bodyNormalized: _bn, frontmatterRaw: _fm, ...rest } = record;
  return rest;
}

export function parsePositiveInteger(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function mergeWarnings(
  indexWarnings: readonly ScanWarning[],
  environmentWarnings: readonly ScanWarning[]
): ScanWarning[] {
  const uniqueWarnings = new Map<string, ScanWarning>();
  for (const warning of [...indexWarnings, ...environmentWarnings]) {
    uniqueWarnings.set(`${warning.code}\u0000${warning.path}\u0000${warning.message}`, warning);
  }

  return [...uniqueWarnings.values()].sort((a, b) => {
    const codeCompare = a.code.localeCompare(b.code);
    if (codeCompare !== 0) return codeCompare;
    const pathCompare = a.path.localeCompare(b.path);
    return pathCompare !== 0 ? pathCompare : a.message.localeCompare(b.message);
  });
}

function formatHumanError(message: string, output: OutputCapabilities): string {
  return isUnicodeOutput(output) ? theme.error(message) : message;
}

export const scanCommand = defineCommand({
  meta: {
    name: 'scan',
    description: 'Discover and index local skills across configured harness adapters'
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Working directory path'
    },
    config: {
      type: 'string',
      description: 'Path to configuration TOML file'
    },
    json: {
      type: 'boolean',
      description: 'Output JSON instead of human-readable text',
      default: false
    },
    plain: {
      type: 'boolean',
      description: 'Use portable plain-text output',
      default: false
    },
    write: {
      type: 'boolean',
      description: 'Persist scan index to disk',
      default: false
    },
    'scan-depth': {
      type: 'string',
      description: 'Max depth for workspace/project search'
    },
    'max-files': {
      type: 'string',
      description: 'Max file budget limit'
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
    const cwdPath = args.cwd ? path.resolve(args.cwd) : process.cwd();

    try {
      const cwdStat = await fs.stat(cwdPath);
      if (!cwdStat.isDirectory()) {
        throw new ConfigError(`Target cwd "${cwdPath}" is not a directory`);
      }
    } catch (err) {
      if (isJson) {
        console.log(
          JSON.stringify({
            schemaVersion: 1,
            error: {
              code: 'CONFIG_INVALID',
              message: `Invalid cwd: ${(err as Error).message}`
            }
          })
        );
        process.exitCode = 2;
        return;
      }
      console.error(formatHumanError(`Invalid cwd: ${(err as Error).message}`, output));
      process.exitCode = 2;
      return;
    }

    const homeDir = process.env.HOME ? path.resolve(process.env.HOME) : os.homedir();
    const configDir = process.env.XDG_CONFIG_HOME ? path.resolve(process.env.XDG_CONFIG_HOME) : undefined;
    const dataDir = process.env.XDG_DATA_HOME ? path.resolve(process.env.XDG_DATA_HOME) : undefined;

    let loaded;
    try {
      loaded = await loadConfig(
        { cwd: cwdPath, homeDir, configDir, dataDir },
        args.config
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (isJson) {
        console.log(
          JSON.stringify({
            schemaVersion: 1,
            error: {
              code: 'CONFIG_INVALID',
              message: msg
            }
          })
        );
        process.exitCode = 2;
        return;
      }
      console.error(formatHumanError(`Configuration error: ${msg}`, output));
      process.exitCode = 2;
      return;
    }

    const { config, customHarnessRoots } = loaded;

    if (args['scan-depth']) {
      const depthNum = parsePositiveInteger(args['scan-depth']);
      if (depthNum === null) {
        const msg = `Invalid --scan-depth "${args['scan-depth']}": must be a positive integer`;
        if (isJson) {
          console.log(
            JSON.stringify({
              schemaVersion: 1,
              error: { code: 'CONFIG_INVALID', message: msg }
            })
          );
        } else {
          console.error(formatHumanError(msg, output));
        }
        process.exitCode = 2;
        return;
      }
      config.scan.depth = depthNum;
    }

    if (args['max-files']) {
      const maxNum = parsePositiveInteger(args['max-files']);
      if (maxNum === null) {
        const msg = `Invalid --max-files "${args['max-files']}": must be a positive integer`;
        if (isJson) {
          console.log(
            JSON.stringify({
              schemaVersion: 1,
              error: { code: 'CONFIG_INVALID', message: msg }
            })
          );
        } else {
          console.error(formatHumanError(msg, output));
        }
        process.exitCode = 2;
        return;
      }
      config.scan.maxFiles = maxNum;
    }

    if (!isJson) {
      renderBanner({ version: PACKAGE_VERSION, command: 'scan', output });
    }

    const envWarnings: ScanWarning[] = [];
    const env: AdapterEnv = {
      cwd: cwdPath,
      homeDir,
      configDir: configDir ?? path.join(homeDir, '.config'),
      dataDir: dataDir ?? path.join(homeDir, '.local', 'share'),
      config,
      platform: process.platform,
      environment: process.env,
      warn(warning) {
        envWarnings.push(warning);
      }
    };

    const adapters: HarnessAdapter[] = [...createBuiltinAdapters()];
    for (const customCfg of config.harness.custom) {
      const roots = customHarnessRoots.get(customCfg.id) ?? [];
      adapters.push(new GenericHarnessAdapter(customCfg, roots));
    }

    const spinner = !isJson && output.showSpinner
      ? ora({ text: theme.subtitle('Scanning local skill roots...'), color: 'cyan' }).start()
      : null;

    const index = await performScan(adapters, env).finally(() => spinner?.stop());
    index.warnings = mergeWarnings(index.warnings, envWarnings);
    index.summary.warnings = index.warnings.length;

    const indexPath = getIndexPath(dataDir, homeDir);
    let indexWritten = false;
    let writtenPath: string | null = null;

    if (args.write) {
      if (!index.summary.truncated) {
        try {
          await writeIndex(indexPath, index);
          indexWritten = true;
          writtenPath = indexPath;
        } catch (err) {
          const msg = `Failed to write index: ${(err as Error).message}`;
          if (isJson) {
            console.log(
              JSON.stringify({
                schemaVersion: 1,
                error: { code: 'INDEX_WRITE_FAILED', message: msg }
              })
            );
            process.exitCode = 1;
            return;
          }
          console.error(theme.error(msg));
          process.exitCode = 1;
          return;
        }
      }
    }

    if (isJson) {
      const jsonOutput: ScanJsonOutput = {
        schemaVersion: 1,
        command: 'scan',
        normalizerVersion: 1,
        generatedAt: index.generatedAt,
        summary: index.summary,
        indexWritten,
        indexPath: writtenPath,
        skills: index.skills.map(projectRecord),
        warnings: index.warnings
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      renderSummaryCard({
        skills: index.summary.skills,
        harnesses: index.summary.harnesses,
        roots: index.summary.roots,
        issues: index.summary.issues,
        warnings: index.summary.warnings,
        indexWritten,
        indexPath: writtenPath,
        defaultIndexPath: indexPath,
        truncated: index.summary.truncated,
        output
      });

      if (index.warnings.length > 0) {
        console.log('\n' + (isUnicodeOutput(output) ? theme.warning('Warnings:') : 'Warnings:'));
        for (const warning of index.warnings) {
          const code = `[${warning.code}]`;
          console.log(
            isUnicodeOutput(output)
              ? `  ${theme.warning(code)} ${theme.path(warning.path)}: ${warning.message}`
              : `  ${code} ${warning.path}: ${warning.message}`
          );
        }
      }
    }
  }
});
