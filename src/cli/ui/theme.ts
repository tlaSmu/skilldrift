import pc from 'picocolors';

import stringWidth from 'string-width';
import type { Scope } from '../../core/types.js';

interface ColorPalette {
  bold(input: string): string;
  cyan(input: string): string;
  dim(input: string): string;
  green(input: string): string;
  magenta(input: string): string;
  red(input: string): string;
  yellow(input: string): string;
  blue(input: string): string;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function visibleLength(str: string): number {
  return stringWidth(str);
}

export function padEndVisible(str: string, targetLength: number): string {
  const vLen = visibleLength(str);
  if (vLen >= targetLength) return str;
  return str + ' '.repeat(targetLength - vLen);
}

export function truncateVisible(value: string, maxWidth: number, ellipsis = '…'): string {
  if (visibleLength(value) <= maxWidth) return value;
  if (maxWidth <= 0) return '';
  if (visibleLength(ellipsis) >= maxWidth) return ellipsis;

  const targetWidth = maxWidth - visibleLength(ellipsis);
  let result = '';
  for (const { segment } of graphemeSegmenter.segment(value)) {
    if (visibleLength(result + segment) > targetWidth) {
      break;
    }
    result += segment;
  }

  return result + ellipsis;
}

function createTheme(colors: ColorPalette) {
  return {
    title: (str: string) => colors.bold(colors.cyan(str)),
    subtitle: (str: string) => colors.dim(str),
    brandGradient: (str: string) => colors.bold(colors.magenta(str)),
    highlight: (str: string) => colors.bold(colors.yellow(str)),
    success: (str: string = '✔ OK') => colors.bold(colors.green(str)),
    warning: (str: string) => colors.bold(colors.yellow(str)),
    error: (str: string) => colors.bold(colors.red(str)),
    muted: (str: string) => colors.dim(str),
    scope: (scope: Scope | string) => {
      switch (scope) {
        case 'user':
          return colors.blue('user');
        case 'project':
          return colors.magenta('project');
        case 'plugin':
          return colors.yellow('plugin');
        case 'system':
          return colors.cyan('system');
        default:
          return colors.dim(scope);
      }
    },
    harness: (harness: string) => {
      switch (harness) {
        case 'claude-code':
          return colors.bold(colors.magenta('claude-code'));
        case 'omp':
          return colors.bold(colors.cyan('omp'));
        case 'codex':
          return colors.bold(colors.yellow('codex'));
        case 'antigravity':
          return colors.bold(colors.green('antigravity'));
        default:
          return colors.bold(colors.blue(harness));
      }
    },
    border: (str: string) => colors.dim(str),
    path: (str: string) => colors.cyan(str),
    tokenCount: (count: number) => {
      const formatted = count < 1000 ? String(count) : `${(count / 1000).toFixed(1)}k`;
      return count > 10000 ? colors.yellow(formatted) : colors.dim(formatted);
    }
  };
}

export const theme = createTheme(pc);
export const plainTheme = createTheme(pc.createColors(false));
