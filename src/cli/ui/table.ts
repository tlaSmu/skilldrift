import pc from 'picocolors';
import * as path from 'node:path';
import type { SkillRecord } from '../../core/types.js';
import type { OutputCapabilities } from './output.js';
import { isUnicodeOutput } from './output.js';
import { padEndVisible, plainTheme, theme, truncateVisible, visibleLength } from './theme.js';

export interface SkillsTableOptions {
  long?: boolean;
  output: OutputCapabilities;
}

interface DisplaySkill {
  record: SkillRecord;
  path: string;
}

export function shortenHomePath(skillPath: string, homeDir: string): string {
  const normalizedHome = path.normalize(homeDir);
  const normalizedPath = path.normalize(skillPath);
  if (normalizedPath === normalizedHome) {
    return '~';
  }
  if (normalizedPath.startsWith(normalizedHome + path.sep)) {
    return `~${normalizedPath.slice(normalizedHome.length)}`;
  }
  return normalizedPath;
}

export function renderSkillsTable(
  skills: readonly SkillRecord[],
  homeDir: string,
  options: SkillsTableOptions
): void {
  const activeTheme = isUnicodeOutput(options.output) ? theme : plainTheme;
  if (skills.length === 0) {
    console.log(activeTheme.warning('No skills found matching filters.'));
    return;
  }

  const rows = skills.map(record => ({ record, path: shortenHomePath(record.path, homeDir) }));
  if (options.output.columns < 100) {
    renderNarrowSkills(rows, options);
  } else {
    renderWideSkills(rows, options);
  }
}

function renderNarrowSkills(rows: readonly DisplaySkill[], options: SkillsTableOptions): void {
  const { output } = options;
  const isUnicode = isUnicodeOutput(output);
  const activeTheme = isUnicode ? theme : plainTheme;
  const colors = isUnicode ? pc : pc.createColors(false);
  const columns = output.columns;

  for (const { record, path: skillPath } of rows) {
    const status = record.issues.length > 0 ? `warning ${record.issues.length}` : 'ok';
    const link = record.symlinkTarget ? 'link' : '';
    const metadata = [record.harness, record.scope, status, link].filter(Boolean).join('  ');
    const nameWidth = Math.max(12, columns - visibleLength(metadata) - 4);
    const name = truncateVisible(record.name, nameWidth);

    console.log(
      colors.bold(name) +
        '  ' +
        activeTheme.harness(record.harness) +
        '  ' +
        activeTheme.scope(record.scope) +
        '  ' +
        (record.issues.length > 0
          ? activeTheme.warning(isUnicode ? `⚠ ${record.issues.length}` : `warning ${record.issues.length}`)
          : activeTheme.muted('ok')) +
        (record.symlinkTarget
          ? `  ${isUnicode ? colors.cyan('🔗 link') : activeTheme.muted('link')}`
          : '')
    );
    console.log(`  ${activeTheme.path(truncateVisible(skillPath, columns - 2))}`);
    if (options.long && record.description) {
      console.log(`  ${activeTheme.muted(truncateVisible(record.description, columns - 2))}`);
    }
  }

  console.log(`\n${colors.bold('Total skills:')} ${activeTheme.title(String(rows.length))}`);
}

function renderWideSkills(rows: readonly DisplaySkill[], options: SkillsTableOptions): void {
  const { output } = options;
  const isUnicode = isUnicodeOutput(output);
  const activeTheme = isUnicode ? theme : plainTheme;
  const colors = isUnicode ? pc : pc.createColors(false);
  const headers = ['NAME', 'HARNESS', 'SCOPE', 'LINK', 'RES', 'SIZE', 'ISSUES', 'PATH'];
  const rawRows = rows.map(({ record, path: skillPath }) => [
    record.name,
    record.harness,
    record.scope,
    record.symlinkTarget ? 'link' : '-',
    String(record.resources.length),
    formatTokenCount(record.size.tokensApprox),
    record.issues.length > 0 ? `warning ${record.issues.length}` : '-',
    skillPath
  ]);
  const maxWidths = [24, 14, 8, 6, 4, 6, 9];
  const fixedWidths = maxWidths.map((maxWidth, index) => {
    const widest = Math.max(headers[index]!.length, ...rawRows.map(row => visibleLength(row[index]!)));
    return Math.min(widest, maxWidth);
  });
  const pathWidth = Math.max(
    12,
    output.columns - fixedWidths.reduce((sum, width) => sum + width, 0) - 14
  );
  const columnWidths = [...fixedWidths, pathWidth];
  const separator = isUnicode ? '─' : '-';

  console.log(
    headers
      .map((header, index) =>
        index === headers.length - 1
          ? colors.bold(colors.cyan(header))
          : padEndVisible(colors.bold(colors.cyan(header)), columnWidths[index]!)
      )
      .join('  ')
  );
  console.log(activeTheme.border(columnWidths.map(width => separator.repeat(width)).join(`${separator}${separator}`)));

  for (const [index, row] of rawRows.entries()) {
    const record = rows[index]!.record;
    const cells = [
      colors.bold(truncateVisible(row[0]!, columnWidths[0]!)),
      activeTheme.harness(truncateVisible(row[1]!, columnWidths[1]!)),
      activeTheme.scope(truncateVisible(row[2]!, columnWidths[2]!)),
      record.symlinkTarget
        ? isUnicode
          ? colors.cyan('🔗 link')
          : activeTheme.muted('link')
        : activeTheme.muted('-'),
      record.resources.length > 0 ? colors.bold(row[4]!) : activeTheme.muted('0'),
      activeTheme.tokenCount(record.size.tokensApprox),
      record.issues.length > 0
        ? activeTheme.warning(isUnicode ? `⚠ ${record.issues.length}` : `warning ${record.issues.length}`)
        : activeTheme.muted('-'),
      activeTheme.path(truncateVisible(row[7]!, columnWidths[7]!))
    ];
    console.log(
      cells
        .map((cell, cellIndex) =>
          cellIndex === cells.length - 1
            ? cell
            : padEndVisible(cell, columnWidths[cellIndex]!)
        )
        .join('  ')
    );
    if (options.long && record.description) {
      console.log(`  ${activeTheme.muted(truncateVisible(record.description, output.columns - 2))}`);
    }
  }

  console.log(activeTheme.border(columnWidths.map(width => separator.repeat(width)).join(`${separator}${separator}`)));
  console.log(`${colors.bold('Total skills:')} ${activeTheme.title(String(rows.length))}`);
}

function formatTokenCount(tokens: number): string {
  return tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`;
}
