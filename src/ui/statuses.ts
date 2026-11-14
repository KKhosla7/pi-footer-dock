import { truncateToWidth } from '@earendil-works/pi-tui';

const ESCAPE =
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[@-_]/gu;
const COLOUR = /^\u001b\[[0-9;:]*m$/u;

export function cleanStatus(text: string): string {
  const kept = text
    .replace(/[\r\n\t]/gu, ' ')
    .replace(ESCAPE, (sequence) => (COLOUR.test(sequence) ? sequence : ''));
  const characters = Array.from(kept).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code === 0x1b || (code >= 0x20 && code !== 0x7f && (code < 0x80 || code > 0x9f));
  });
  return characters
    .join('')
    .replace(/\u001b(?!\[[0-9;:]*m)/gu, '')
    .replace(/ +/gu, ' ')
    .trim();
}

export function statusLine(
  statuses: ReadonlyMap<string, string>,
  width: number,
): string | undefined {
  const texts = [...statuses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => cleanStatus(text))
    .filter((text) => text !== '');
  return texts.length === 0 ? undefined : truncateToWidth(texts.join(' '), width, '…');
}
