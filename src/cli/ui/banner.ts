import pc from 'picocolors';
import type { OutputCapabilities } from './output.js';
import { isUnicodeOutput } from './output.js';
import { padEndVisible, theme, visibleLength } from './theme.js';

export function renderBanner(options: {
  version: string;
  command: 'scan' | 'ls';
  output: OutputCapabilities;
}): void {
  const { version, command, output } = options;
  if (!isUnicodeOutput(output)) {
    return;
  }

  if (!output.showBanner) {
    console.log(theme.title(`skillctl ${command}`) + theme.muted(' — Local skill inventory'));
    console.log();
    return;
  }

  const asciiArt = [
    '  ████████  ████████  ██  ██        ██       ██████   ██████    ██  ████████ ████████ ',
    '  ██        ██    ██  ██  ██        ██       ██   ██  ██   ██   ██  ██          ██    ',
    '  ████████  ████████  ██  ██        ██       ██   ██  ██████    ██  ████████    ██    ',
    '        ██  ██    ██  ██  ██        ██       ██   ██  ██   ██   ██  ██          ██    ',
    '  ████████  ██    ██  ██  ████████  ████████ ██████   ██   ██   ██  ████████    ██    '
  ];

  console.log();
  for (const line of asciiArt) {
    console.log(pc.bold(pc.cyan(line)));
  }
  console.log(
    pc.dim('                     ─── ') +
      pc.bold(pc.magenta('LOCAL SKILL INVENTORY')) +
      pc.dim(` (v${version}) ───`)
  );
  console.log();
}

export interface SummaryOptions {
  skills: number;
  harnesses: number;
  roots: number;
  issues: number;
  warnings: number;
  indexWritten: boolean;
  indexPath: string | null;
  defaultIndexPath: string;
  truncated: boolean;
  output: OutputCapabilities;
}

export function renderSummaryCard(options: SummaryOptions): void {
  const { skills, harnesses, roots, issues, warnings, output } = options;
  const plainLines = [
    `Skills discovered: ${skills}`,
    `Harnesses scanned: ${harnesses}`,
    `Skill roots: ${roots} directories`,
    `Diagnostics: ${issues} issues | ${warnings} warnings`
  ];

  if (!isUnicodeOutput(output) || output.columns < 48) {
    console.log('Scan complete');
    for (const line of plainLines) {
      console.log(`  ${line}`);
    }
  } else {
    const styledLines = [
      `Skills discovered: ${theme.title(String(skills))}`,
      `Harnesses scanned: ${theme.highlight(String(harnesses))}`,
      `Skill roots: ${theme.subtitle(String(roots))} directories`,
      `Diagnostics: ${
        issues > 0 ? theme.warning(`${issues} issues`) : theme.success('0 issues')
      } ${theme.border('|')} ${
        warnings > 0 ? theme.warning(`${warnings} warnings`) : theme.success('0 warnings')
      }`
    ];
    const innerWidth = Math.max(...plainLines.map(visibleLength));
    const title = theme.title('SCAN SUMMARY');
    const titleWidth = visibleLength(title);
    const header =
      theme.border('╭─ ') +
      title +
      theme.border(` ${'─'.repeat(Math.max(0, innerWidth - titleWidth - 1))}╮`);
    const footer = theme.border(`╰${'─'.repeat(innerWidth + 2)}╯`);

    console.log(header);
    for (const line of styledLines) {
      console.log(theme.border('│ ') + padEndVisible(line, innerWidth) + theme.border(' │'));
    }
    console.log(footer);
  }

  console.log();
  if (options.indexWritten && options.indexPath) {
    console.log(
      isUnicodeOutput(output)
        ? theme.success('✔ ') + pc.bold('Index saved to: ') + theme.path(options.indexPath)
        : `Index saved to: ${options.indexPath}`
    );
  } else if (options.truncated) {
    console.log(
      isUnicodeOutput(output)
        ? theme.warning('Warning: ') + pc.yellow('Scan incomplete due to timeout/limits; index not updated.')
        : 'Warning: scan incomplete due to timeout/limits; index not updated.'
    );
  } else {
    console.log(
      isUnicodeOutput(output)
        ? theme.muted('Preview only. Rerun with ') +
            pc.bold(pc.cyan('--write')) +
            theme.muted(` to save to ${options.defaultIndexPath}`)
        : `Preview only. Rerun with --write to save to ${options.defaultIndexPath}`
    );
  }
}
