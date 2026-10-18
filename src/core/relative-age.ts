const UNITS: readonly (readonly [string, number])[] = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/** `3 days ago`, `just now`; an unknown time is `unknown`. Times in the future count as now. */
export function relativeAge(time: number | undefined, now: number): string {
  if (time === undefined) return 'unknown';
  const seconds = now - time;
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      const amount = Math.floor(seconds / size);
      return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}
