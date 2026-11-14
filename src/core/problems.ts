export interface Problem {
  where: string;
  setting: string;
  reason: string;
  fix: string;
}

const MAX_TEXT = 200;
const MAX_SHOWN_VALUE = 40;
export const MAX_PROBLEMS = 20;

const plain = (text: string): string => text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
const bounded = (text: string): string => {
  const clean = plain(text);
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
};

export function shown(value: unknown): string {
  let text: string;
  try {
    text = value === undefined ? 'nothing' : JSON.stringify(value);
  } catch {
    text = '(a value that cannot be shown)';
  }
  const clean = plain(text);
  return clean.length > MAX_SHOWN_VALUE ? `${clean.slice(0, MAX_SHOWN_VALUE - 1)}…` : clean;
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1)
      next.push(
        Math.min(
          (row[j] ?? 0) + 1,
          (next[j - 1] ?? 0) + 1,
          (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    row = next;
  }
  return row[b.length] ?? 0;
}
export function closest(name: string, candidates: Iterable<string>): string | undefined {
  let best: { name: string; steps: number } | undefined;
  for (const candidate of candidates) {
    const steps = distance(name.slice(0, 64), candidate);
    if (steps <= Math.max(2, Math.floor(candidate.length / 4)) && (!best || steps < best.steps))
      best = { name: candidate, steps };
  }
  return best?.name;
}

export function problem(where: string, setting: string, reason: string, fix: string): Problem {
  return { where, setting, reason: bounded(reason), fix: bounded(fix) };
}
export function invalidValue(
  where: string,
  setting: string,
  value: unknown,
  error: unknown,
): Problem {
  const message = error instanceof Error ? error.message : 'The value is not accepted';
  return problem(
    where,
    setting,
    `The value ${shown(value)} is not accepted for ${setting}.`,
    message.endsWith('.') ? message : `${message}.`,
  );
}
export function unknownName(
  where: string,
  setting: string,
  name: string,
  known: { kind: string; names: readonly string[] },
): Problem {
  const near = closest(name, known.names);
  return problem(
    where,
    setting,
    `${shown(name)} is not a ${known.kind}.`,
    near
      ? `Did you mean "${near}"? Otherwise remove it.`
      : `Use one of: ${known.names.join(', ')}.`,
  );
}

export function formatProblems(heading: string, problems: readonly Problem[]): string {
  const shownProblems = problems.slice(0, MAX_PROBLEMS);
  const lines = shownProblems.map(
    (item, index) =>
      `${index + 1}. ${item.where}: ${item.setting}\n   ${item.reason}\n   Fix: ${item.fix}`,
  );
  const more =
    problems.length > MAX_PROBLEMS ? [`… and ${problems.length - MAX_PROBLEMS} more.`] : [];
  const count = problems.length === 1 ? '1 problem' : `${problems.length} problems`;
  return [`${heading} (${count}):`, ...lines, ...more].join('\n');
}
