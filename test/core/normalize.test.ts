import { describe, it, expect } from 'vitest';
import { normalizeBody } from '../../src/core/normalize.js';

describe('normalizeBody', () => {
  it('converts CRLF to LF', () => {
    const raw = 'line1\r\nline2\r\nline3';
    expect(normalizeBody(raw, '/home/user')).toBe('line1\nline2\nline3');
  });

  it('removes trailing spaces outside fenced code', () => {
    const raw = 'line1   \nline2\t\t\nline3';
    expect(normalizeBody(raw, '/home/user')).toBe('line1\nline2\nline3');
  });

  it('preserves trailing spaces inside fenced code', () => {
    const raw = '```\nline1   \nline2\n```';
    expect(normalizeBody(raw, '/home/user')).toBe('```\nline1   \nline2\n```');
  });

  it('collapses 3-or-more blank lines to 2 outside fenced code', () => {
    const raw = 'text1\n\n\n\ntext2';
    expect(normalizeBody(raw, '/home/user')).toBe('text1\n\n\ntext2');
  });

  it('replaces exact home prefix at path boundary outside fenced code', () => {
    const raw = 'Check path /home/user/my-file and /home/userother';
    expect(normalizeBody(raw, '/home/user')).toBe('Check path ~/my-file and /home/userother');
  });

  it('preserves home prefix inside fenced code', () => {
    const raw = '```\n/home/user/my-file\n```';
    expect(normalizeBody(raw, '/home/user')).toBe('```\n/home/user/my-file\n```');
  });

  it('removes multiline HTML comments outside fenced code', () => {
    const raw = 'Before <!-- comment\nline2 --> After';
    expect(normalizeBody(raw, '/home/user')).toBe('Before  After');
  });

  it('applies Unicode NFC normalization and trims document', () => {
    const raw = '  e\u0301  \n'; // e + combining acute accent
    const normalized = normalizeBody(raw, '/home/user');
    expect(normalized).toBe('\u00e9'); // é
  });
});
