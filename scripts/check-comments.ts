import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export type Kind = 'script' | 'shell' | 'python';

const KINDS: Record<string, Kind> = {
  '.ts': 'script',
  '.js': 'script',
  '.cjs': 'script',
  '.mjs': 'script',
  '.sh': 'shell',
  '.py': 'python',
};

function scriptComments(text: string): number[] {
  const source = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, true);
  const found = new Map<number, number>();
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(source);
    if (children.length === 0) {
      const ranges = [
        ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
        ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
      ];
      for (const range of ranges) {
        found.set(range.pos, source.getLineAndCharacterOfPosition(range.pos).line + 1);
      }
    }
    for (const child of children) visit(child);
  };
  visit(source);
  return [...found.values()].sort((a, b) => a - b);
}

function endOfQuote(text: string, from: number, quote: string): number {
  for (let index = from; index < text.length; index += 1) {
    if (text.charAt(index) === '\\' && quote !== "'") index += 1;
    else if (text.startsWith(quote, index)) return index + quote.length;
  }
  return text.length;
}

function hashComments(text: string, kind: 'shell' | 'python'): number[] {
  const lines: number[] = [];
  let wordStart = true;
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === '#' && wordStart && !(index === 0 && text.startsWith('#!'))) {
      lines.push(text.slice(0, index).split('\n').length);
      const end = text.indexOf('\n', index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === "'" || char === '"') {
      const triple = kind === 'python' && text.startsWith(char.repeat(3), index);
      const quote = triple ? char.repeat(3) : char;
      index = endOfQuote(text, index + quote.length, quote);
      wordStart = false;
      continue;
    }
    if (char === '\\') {
      index += 2;
      wordStart = false;
      continue;
    }
    wordStart = ` \t\n;|&(`.includes(char);
    index += 1;
  }
  return lines;
}

export function commentLines(text: string, kind: Kind): number[] {
  return kind === 'script' ? scriptComments(text) : hashComments(text, kind);
}

export function commentsInRepository(root: string): { file: string; line: number }[] {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return tracked.flatMap((file) => {
    const kind = file.startsWith('.githooks/') ? 'shell' : KINDS[file.slice(file.lastIndexOf('.'))];
    if (!kind || file.startsWith('dist/')) return [];
    return commentLines(readFileSync(join(root, file), 'utf8'), kind).map((line) => ({
      file,
      line,
    }));
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').at(-1) ?? '')) {
  const found = commentsInRepository(process.cwd());
  for (const { file, line } of found) process.stderr.write(`comment: ${file}:${line}\n`);
  if (found.length > 0) {
    process.stderr.write(
      `${found.length} comment(s): the rules live in the docs, not in the code\n`,
    );
    process.exit(1);
  }
  process.stdout.write('comments: none\n');
}
