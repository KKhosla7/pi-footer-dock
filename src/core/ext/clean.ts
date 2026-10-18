import { plain } from '../explain/render.js';
import { LIMITS } from './protocol.js';

const ID = /^[a-z][a-z0-9-]{0,23}$/u;

/** Untrusted text: no terminal sequences, no controls, one line, cut to `max` characters, never empty. */
export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = plain(value).replace(/\s+/gu, ' ').trim();
  return text === '' ? undefined : Array.from(text).slice(0, max).join('');
}
/** Like `cleanText` but keeps line breaks (a paragraph of an explanation). */
export function paragraph(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value
    .split('\n')
    .map((line) => plain(line).trim())
    .join('\n')
    .trim();
  return text === '' ? undefined : Array.from(text).slice(0, LIMITS.paragraph).join('');
}
export const validId = (value: unknown): value is string =>
  typeof value === 'string' && ID.test(value);
export const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  list.find((entry) => entry === value);
export const list = (value: unknown, max: number): unknown[] =>
  Array.isArray(value) ? value.slice(0, max) : [];

export const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
export const fraction = (value: unknown): number | undefined => {
  const n = num(value);
  return n === undefined ? undefined : Math.max(0, Math.min(1, n));
};

/** An object's fields, or nothing at all for anything that is not a plain object; never throws. */
export const fields = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
