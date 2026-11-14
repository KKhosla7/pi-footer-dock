export type Tone = 'accent' | 'success' | 'warning' | 'error' | 'muted' | 'dim';

export interface Fact {
  label: string;
  value: string;
  tone?: Tone;
  note?: string;
}
export interface MeterRow {
  label: string;
  fraction: number | null;
  text: string;
  tone?: Tone;
  mark?: number;
}
export interface StackPart {
  label: string;
  amount: number;
  tone: Tone;
  text?: string;
}
export interface BarChart {
  values: readonly number[];
  axis: readonly [string, string];
  peak: string;
  current?: number;
  tone?: Tone;
}
export interface Bullet {
  term?: string;
  text: string;
  tone?: Tone;
}

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'facts'; rows: readonly Fact[] }
  | { kind: 'meters'; rows: readonly MeterRow[] }
  | { kind: 'stack'; parts: readonly StackPart[] }
  | {
      kind: 'table';
      head: readonly string[];
      rows: readonly (readonly string[])[];
      right?: readonly number[];
    }
  | { kind: 'bars'; chart: BarChart }
  | { kind: 'bullets'; items: readonly Bullet[] }
  | { kind: 'note'; text: string; tone?: Tone }
  | { kind: 'gap' };

export const heading = (text: string): Block => ({ kind: 'heading', text });
export const facts = (...rows: Fact[]): Block => ({ kind: 'facts', rows });
export const meters = (...rows: MeterRow[]): Block => ({ kind: 'meters', rows });
export const stack = (...parts: StackPart[]): Block => ({ kind: 'stack', parts });
export const table = (
  head: readonly string[],
  rows: readonly (readonly string[])[],
  right: readonly number[] = [],
): Block => ({ kind: 'table', head, rows, right });
export const bars = (chart: BarChart): Block => ({ kind: 'bars', chart });
export const bullets = (...items: Bullet[]): Block => ({ kind: 'bullets', items });
export const note = (text: string, tone?: Tone): Block =>
  tone ? { kind: 'note', text, tone } : { kind: 'note', text };
export const gap: Block = { kind: 'gap' };
