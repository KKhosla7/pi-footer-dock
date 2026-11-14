export const METER_STYLES = ['slanted', 'line', 'blocks'] as const;
export type MeterStyle = (typeof METER_STYLES)[number];

export const METER_CELLS: Record<MeterStyle, { on: string; off: string }> = {
  slanted: { on: '▰', off: '▱' },
  line: { on: '━', off: '─' },
  blocks: { on: '█', off: '░' },
};

export const isMeterStyle = (value: unknown): value is MeterStyle =>
  typeof value === 'string' && (METER_STYLES as readonly string[]).includes(value);

export const meterSample = (style: MeterStyle): string =>
  METER_CELLS[style].on.repeat(3) + METER_CELLS[style].off.repeat(2);
