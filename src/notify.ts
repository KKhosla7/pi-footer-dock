import { stripTerminalSequences } from '@earendil-works/pi-tui';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

const MAX_CHARACTERS = 8_000;

/** Line breaks and tabs stay; every other control character goes. */
const isControl = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return (code < 0x20 && code !== 0x0a && code !== 0x09) || (code >= 0x7f && code <= 0x9f);
};

type Level = 'info' | 'warning' | 'error';

/** Text that is safe to show: no terminal sequences, no control characters, bounded length. */
export function clean(text: string): string {
  const characters = Array.from(stripTerminalSequences(text)).filter((c) => !isControl(c));
  return characters.length > MAX_CHARACTERS
    ? `${characters.slice(0, MAX_CHARACTERS).join('')}\n… (cut)`
    : characters.join('');
}

/**
 * The one way Footer Dock shows a message. The text may come from an error, a file or a Git
 * message, so it is cleaned first; and it never throws, because a message that cannot be shown
 * (a context made stale by `/reload`, for one) must not become a second failure.
 */
export function say(ctx: Pick<ExtensionContext, 'ui'>, text: string, level: Level = 'info'): void {
  try {
    ctx.ui.notify(clean(text), level);
  } catch {
    /* Nowhere to show it. */
  }
}
