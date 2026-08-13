/// <reference types="node" />

export type Scope = 'user' | 'project' | 'plugin' | 'system';

export type SkillLayout = 'dir-skill-md' | 'flat-md' | 'custom';

export interface SkillRoot {
  path: string;
  scope: Scope;
  precedence: number;
  readonly: boolean;
}

export interface CustomHarnessConfig {
  id: string;
  roots: string[];
  layout: SkillLayout;
}

export interface ScanConfig {
  workspaces: string[];
  depth: number;
  maxFiles: number;
  ignore: string[];
}

export interface HarnessConfig {
  custom: CustomHarnessConfig[];
}

export interface ResolvedConfig {
  scan: ScanConfig;
  harness: HarnessConfig;
}

export type ScanWarningCode =
  | 'ROOT_UNREADABLE'
  | 'ENTRY_UNREADABLE'
  | 'BROKEN_SYMLINK'
  | 'CLAUDE_PLUGIN_STATE_INVALID'
  | 'CODEX_PLUGIN_STATE_INVALID'
  | 'SCAN_TIMEOUT'
  | 'MAX_FILES_REACHED';

export interface ScanWarning {
  code: ScanWarningCode;
  path: string;
  message: string;
}

export interface AdapterEnv {
  cwd: string;
  homeDir: string;
  configDir: string;
  dataDir: string;
  config: ResolvedConfig;
  platform: NodeJS.Platform;
  environment: Readonly<Record<string, string | undefined>>;
  warn(warning: ScanWarning): void;
}

export interface HarnessAdapter {
  id: string;
  displayName: string;
  layout: SkillLayout;
  detect(env: AdapterEnv): Promise<boolean>;
  roots(env: AdapterEnv): Promise<SkillRoot[]>;
}

export interface DiscoveredSkill {
  adapterId: string;
  root: SkillRoot;
  logicalEntryPath: string;
  logicalFilePath: string;
  physicalDirPath: string;
  physicalFilePath: string;
  symlinkTarget: string | null;
}

export interface SkillResource {
  rel: string;
  sha256: string;
  bytes: number;
}

export interface SkillSource {
  candidate: DiscoveredSkill;
  mainFileBytes: Uint8Array;
  mainFileMtime: Date;
  mainFileBirthtime: Date | null;
  resources: SkillResource[];
}

export interface SkillRecord {
  id: string;
  name: string;
  declaredName: string | null;
  description: string | null;
  path: string;
  dir: string;
  sourceRoot: string;
  harness: string;
  scope: Scope;
  precedence: number;
  readonly: boolean;
  symlinkTarget: string | null;
  allowedTools: string[];
  frontmatterRaw: Record<string, unknown>;
  unknownKeys: string[];
  body: string;
  bodyNormalized: string;
  hashExact: string;
  hashFile: string;
  resourcesHash: string;
  resources: SkillResource[];
  size: {
    bytes: number;
    tokensApprox: number;
  };
  mtime: string;
  birthtime: string | null;
  issues: string[];
}

export const SCAN_SCHEMA_VERSION = 1;
export const NORMALIZER_VERSION = 1;

export interface IndexSummary {
  harnesses: number;
  roots: number;
  skills: number;
  issues: number;
  warnings: number;
  truncated: boolean;
}

export interface SkillIndex {
  schemaVersion: typeof SCAN_SCHEMA_VERSION;
  normalizerVersion: typeof NORMALIZER_VERSION;
  generatedAt: string;
  projectPath: string;
  summary: IndexSummary;
  skills: SkillRecord[];
  warnings: ScanWarning[];
}

export type SkillJsonProjection = Omit<
  SkillRecord,
  'body' | 'bodyNormalized' | 'frontmatterRaw'
>;

export interface ScanJsonOutput {
  schemaVersion: typeof SCAN_SCHEMA_VERSION;
  command: 'scan';
  normalizerVersion: typeof NORMALIZER_VERSION;
  generatedAt: string;
  summary: IndexSummary;
  indexWritten: boolean;
  indexPath: string | null;
  skills: SkillJsonProjection[];
  warnings: ScanWarning[];
}

export interface ListJsonOutput {
  schemaVersion: typeof SCAN_SCHEMA_VERSION;
  command: 'ls';
  normalizerVersion: typeof NORMALIZER_VERSION;
  indexedAt: string;
  filters: {
    harnesses: string[];
    scopes: Scope[];
  };
  count: number;
  skills: SkillJsonProjection[];
  warnings: ScanWarning[];
}

export interface CliErrorOutput {
  schemaVersion: typeof SCAN_SCHEMA_VERSION;
  error: {
    code: string;
    message: string;
  };
}
