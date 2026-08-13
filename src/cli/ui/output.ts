export type OutputMode = 'plain' | 'unicode';

export interface OutputCapabilities {
  mode: OutputMode;
  columns: number;
  showBanner: boolean;
  showSpinner: boolean;
}

export interface OutputCapabilityInput {
  plain?: boolean;
  isTTY?: boolean;
  columns?: number;
  term?: string | undefined;
}

export function resolveOutputCapabilities(input: OutputCapabilityInput = {}): OutputCapabilities {
  const columns = input.columns && input.columns > 0 ? input.columns : 80;
  const mode: OutputMode =
    input.plain || !input.isTTY || input.term === 'dumb' ? 'plain' : 'unicode';

  return {
    mode,
    columns,
    showBanner: mode === 'unicode' && columns >= 96,
    showSpinner: mode === 'unicode'
  };
}

export function isUnicodeOutput(output: OutputCapabilities): boolean {
  return output.mode === 'unicode';
}
