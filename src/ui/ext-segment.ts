import type { ExtItem, Form, FormTone } from '../core/ext/protocol.js';
import { LOOKS } from '../core/looks.js';
import type { Look } from '../core/looks.js';
import type { Glyphs } from './glyphs.js';
import type { Paint, Tone } from './palette.js';
import { iconSpan, paintIcon } from './segment-parts.js';

const TONES: Record<FormTone, Tone> = {
  text: 'text',
  muted: 'muted',
  accent: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

/** The form for a look: the nearest one given at this look or a richer one; `hide` removes the item. */
export function formAt(item: ExtItem, look: Look): Form | 'hide' {
  for (let index = LOOKS.indexOf(look); index >= 0; index -= 1) {
    const key = LOOKS[index];
    const form = key === undefined ? undefined : item.at[key];
    if (form !== undefined) return form;
  }
  return item.at.xl;
}

/** An extension's item as footer text, with its icon as a token of its own when the icon takes clicks. */
export function renderExtensionItem(
  item: ExtItem,
  look: Look,
  options: { paint: Paint; glyphs: Glyphs },
): { text: string; iconWidth: number } {
  const form = formAt(item, look);
  if (form === 'hide') return { text: '', iconWidth: 0 };
  const icon = form.icon ? options.glyphs[form.icon] : '';
  const tone = form.dim === true ? 'muted' : TONES[form.tone ?? 'text'];
  const text = (icon ? paintIcon(options.paint, `${icon} `) : '') + options.paint(form.text, tone);
  return { text, iconWidth: icon && item.icon === 'event' ? iconSpan(item.id, icon) : 0 };
}
