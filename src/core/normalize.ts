export function normalizeBody(body: string, homeDir: string): string {
  // 1. CRLF / CR to LF
  const lfBody = body.replace(/\r\n?/g, '\n');

  // Prepare home directory regex for path boundary replacement
  const homeResolved = homeDir ? homeDir.replace(/[/\\]+$/, '') : '';
  let homeRegex: RegExp | null = null;
  if (homeResolved) {
    const escapedHome = homeResolved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    homeRegex = new RegExp(`(?<=^|[^a-zA-Z0-9_.-])${escapedHome}(?=$|[/\\\\\\s"'):;,.?])`, 'g');
  }

  // Parse lines into fenced vs non-fenced segments
  const lines = lfBody.split('\n');
  const processedLines: string[] = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;
  let currentNonFencedBuffer: string[] = [];

  function flushNonFencedBuffer() {
    if (currentNonFencedBuffer.length === 0) return;
    let text = currentNonFencedBuffer.join('\n');

    // Remove multiline HTML comments outside fenced code
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Replace exact absolute home prefix at path boundaries with ~
    if (homeRegex) {
      text = text.replace(homeRegex, '~');
    }

    // Remove trailing spaces outside fenced code lines
    const bufLines = text.split('\n').map(l => l.replace(/[ \t]+$/g, ''));
    text = bufLines.join('\n');

    // Collapse three-or-more blank lines to two outside fenced code
    // 3 blank lines = 4 consecutive newlines (\n\n\n\n) -> 2 blank lines (\n\n\n)
    text = text.replace(/\n{4,}/g, '\n\n\n');

    processedLines.push(text);
    currentNonFencedBuffer = [];
  }

  for (const line of lines) {
    const fenceStartMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!inFence) {
      if (fenceStartMatch && fenceStartMatch[1]) {
        flushNonFencedBuffer();
        inFence = true;
        fenceChar = fenceStartMatch[1][0]!;
        fenceLength = fenceStartMatch[1].length;
        processedLines.push(line);
      } else {
        currentNonFencedBuffer.push(line);
      }
    } else {
      const fenceEndMatch = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (
        fenceEndMatch &&
        fenceEndMatch[1] &&
        fenceEndMatch[1][0] === fenceChar &&
        fenceEndMatch[1].length >= fenceLength
      ) {
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
        processedLines.push(line);
      } else {
        processedLines.push(line);
      }
    }
  }

  flushNonFencedBuffer();

  let result = processedLines.join('\n');

  // Unicode NFC normalization
  result = result.normalize('NFC');

  // Trim document
  return result.trim();
}
