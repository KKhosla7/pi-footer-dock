/** The colours an explanation may ask for; the screen maps them onto the Pi theme. */
export type Tone = 'accent' | 'success' | 'warning' | 'error' | 'muted' | 'dim';

export interface Fact {
  label: string;
  value: string;
  tone?: Tone;
  /** A short aside after the value, dimmed. */
  note?: string;
}
export interface MeterRow {
  label: string;
  /** 0..1, or null when there is nothing to draw (the bar is left empty and dimmed). */
  fraction: number | null;
  text: string;
  tone?: Tone;
  /** 0..1: a second position on the bar, such as how far through a window the clock is. */
  mark?: number;
}
export interface StackPart {
  label: string;
  amount: number;
  tone: Tone;
  /** Printed after the label in the legend, such as `2.1M`. */
  text?: string;
}
/** A column chart over time: one column per value, oldest first. */
export interface BarChart {
  values: readonly number[];
  /** What the left and right ends of the axis are called, for example two dates. */
  axis: readonly [string, string];
  /** Names the largest value, for example `$12.40`. */
  peak: string;
  /** The column to draw in the accent colour: the period that is still running. */
  current?: number;
  tone?: Tone;
}
export interface Bullet {
  /** Shown in bold before the text. */
  term?: string;
  text: string;
  tone?: Tone;
}

/** What an explanation is made of: plain data that one renderer turns into lines. */
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
