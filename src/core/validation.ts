import { safeLabel } from './model.js';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
export function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z][a-z0-9._-]{0,63}$/u.test(value) &&
    !['constructor', 'prototype', '__proto__'].includes(value)
  );
}
export function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || safeLabel(value) !== value)
    throw new Error('Invalid text or terminal controls');
  return value;
}
