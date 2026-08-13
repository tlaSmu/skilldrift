import type {
  HarnessAdapter,
  AdapterEnv,
  SkillIndex,
  SkillRecord,
  ScanWarning
} from './types.js';
import { SCAN_SCHEMA_VERSION, NORMALIZER_VERSION } from './types.js';
import { ScanBudget, discoverSkills, ScanIo, nodeScanIo } from './discover.js';
import { loadSkill } from './load.js';
import { parseSkill } from './parse.js';

export interface PerformScanOptions {
  timeoutMs?: number;
  io?: ScanIo;
}

export async function performScan(
  adapters: HarnessAdapter[],
  env: AdapterEnv,
  options?: PerformScanOptions
): Promise<SkillIndex> {
  const io = options?.io ?? nodeScanIo;
  const budget = new ScanBudget({
    maxFiles: env.config.scan.maxFiles,
    scanDepth: env.config.scan.depth,
    timeoutMs: options?.timeoutMs
  });

  const discoveryResult = await discoverSkills(adapters, env, budget, io);
  const warnings: ScanWarning[] = [...discoveryResult.warnings];
  let truncated = discoveryResult.truncated;

  const records: SkillRecord[] = [];

  for (const candidate of discoveryResult.candidates) {
    if (budget.isExpired()) {
      truncated = true;
      warnings.push({
        code: 'SCAN_TIMEOUT',
        path: candidate.logicalFilePath,
        message: `Scan deadline exceeded (${budget.timeoutMs}ms)`
      });
      break;
    }

    if (budget.isLimitReached()) {
      truncated = true;
      warnings.push({
        code: 'MAX_FILES_REACHED',
        path: candidate.logicalFilePath,
        message: `Scan max files limit reached (${budget.maxFiles})`
      });
      break;
    }

    const source = await loadSkill(candidate, budget, io);
    if (!source) {
      truncated = true;
      break;
    }

    const record = parseSkill(source, env.homeDir);
    records.push(record);
  }

  // Sort records deterministically
  records.sort((a, b) => {
    const hComp = a.harness.localeCompare(b.harness);
    if (hComp !== 0) return hComp;
    const nComp = a.name.localeCompare(b.name);
    if (nComp !== 0) return nComp;
    return a.path.localeCompare(b.path);
  });

  // Sort warnings deterministically
  warnings.sort((a, b) => {
    const pComp = a.path.localeCompare(b.path);
    if (pComp !== 0) return pComp;
    const cComp = a.code.localeCompare(b.code);
    if (cComp !== 0) return cComp;
    return a.message.localeCompare(b.message);
  });

  const distinctHarnesses = new Set(records.map(r => r.harness));
  const totalIssues = records.reduce((sum, r) => sum + r.issues.length, 0);

  return {
    schemaVersion: SCAN_SCHEMA_VERSION,
    normalizerVersion: NORMALIZER_VERSION,
    generatedAt: new Date().toISOString(),
    projectPath: env.cwd,
    summary: {
      harnesses: distinctHarnesses.size,
      roots: discoveryResult.roots.length,
      skills: records.length,
      issues: totalIssues,
      warnings: warnings.length,
      truncated
    },
    skills: records,
    warnings
  };
}
