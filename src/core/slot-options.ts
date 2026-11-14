import { isLook } from './looks.js';
import { isMeterStyle } from './meter-styles.js';
import type { MeterStyle } from './meter-styles.js';
import type { Look } from './looks.js';
import { safeLabel } from './model.js';
import { boundedText, identifier, record } from './validation.js';

export interface SlotOptions {
  text?: string;
  icon?: string;
  help?: string;
  click?: 'help' | 'action' | 'none';
  actionTarget?: string;
  gap?: number;
  hideAt?: Look;
  meterColor?: 'lavender' | 'theme';
  meterStyle?: MeterStyle;
  animation?: boolean;
  wording?: 'left' | 'used';
  unit?: 'tokens' | 'percent';
  period?: 'day' | 'week' | 'month' | 'session';
  collapse?: 'always';
  collapsedShow?: string[];
  hideWindows?: string[];
  layers?: Record<string, boolean>;
}

function validClick(value: unknown): NonNullable<SlotOptions['click']> {
  if (value !== 'help' && value !== 'action' && value !== 'none')
    throw new Error('Invalid click mode');
  return value;
}
function validGap(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6)
    throw new Error('Gap must be 0–6 columns');
  return value;
}
function meterColor(value: unknown): NonNullable<SlotOptions['meterColor']> {
  if (value !== 'lavender' && value !== 'theme') throw new Error('Invalid meter color');
  return value;
}
function validMeterStyle(value: unknown): MeterStyle {
  if (!isMeterStyle(value)) throw new Error('Meter style must be slanted, line or blocks');
  return value;
}
function animationEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Animation must be boolean');
  return value;
}
function validWording(value: unknown): NonNullable<SlotOptions['wording']> {
  if (value !== 'left' && value !== 'used') throw new Error('Wording must be left or used');
  return value;
}
function validUnit(value: unknown): NonNullable<SlotOptions['unit']> {
  if (value !== 'tokens' && value !== 'percent') throw new Error('Unit must be tokens or percent');
  return value;
}
function validPeriod(value: unknown): NonNullable<SlotOptions['period']> {
  if (value !== 'day' && value !== 'week' && value !== 'month' && value !== 'session')
    throw new Error('Period must be day, week, month or session');
  return value;
}
function validCollapse(value: unknown): 'always' {
  if (value !== 'always') throw new Error('collapse must be always');
  return value;
}
function windowLabels(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error('At most 8 window labels');
  return value.map((label) => boundedText(label, 24));
}
function layerFlags(value: unknown): Record<string, boolean> {
  const entries = Object.entries(record(value));
  if (entries.length > 8) throw new Error('At most 8 layers');
  return Object.fromEntries(
    entries.map(([name, flag]) => {
      if (typeof flag !== 'boolean')
        throw new Error(`Layer ${safeLabel(name)} must be true or false`);
      return [name, flag];
    }),
  );
}
function validLook(value: unknown): Look {
  if (!isLook(value)) throw new Error('hideAt must be xl, lg, md, sm or xs');
  return value;
}
const parsers = new Map<string, (item: unknown) => SlotOptions>([
  ['text', (item) => ({ text: boundedText(item, 1024) })],
  ['help', (item) => ({ help: boundedText(item, 2048) })],
  ['icon', (item) => ({ icon: boundedText(item, 16) })],
  ['actionTarget', (item) => ({ actionTarget: actionTarget(item) })],
  ['click', (item) => ({ click: validClick(item) })],
  ['gap', (item) => ({ gap: validGap(item) })],
  ['hideAt', (item) => ({ hideAt: validLook(item) })],
  ['meterColor', (item) => ({ meterColor: meterColor(item) })],
  ['meterStyle', (item) => ({ meterStyle: validMeterStyle(item) })],
  ['animation', (item) => ({ animation: animationEnabled(item) })],
  ['wording', (item) => ({ wording: validWording(item) })],
  ['unit', (item) => ({ unit: validUnit(item) })],
  ['period', (item) => ({ period: validPeriod(item) })],
  ['collapse', (item) => ({ collapse: validCollapse(item) })],
  ['hideWindows', (item) => ({ hideWindows: windowLabels(item) })],
  ['layers', (item) => ({ layers: layerFlags(item) })],
  ['collapsedShow', (item) => ({ collapsedShow: windowLabels(item) })],
]);
export const SLOT_OPTION_KEYS: readonly string[] = [...parsers.keys()];
function actionTarget(value: unknown): string {
  if (!identifier(value)) throw new Error('Invalid action target');
  return value;
}
function option(key: string, item: unknown): SlotOptions {
  const parse = parsers.get(key);
  if (!parse) throw new Error(`Unknown slot option: ${safeLabel(key)}`);
  return parse(item);
}
export function parseSlotOptions(value: unknown): SlotOptions {
  const result: SlotOptions = {};
  for (const [key, item] of Object.entries(record(value))) Object.assign(result, option(key, item));
  return result;
}
