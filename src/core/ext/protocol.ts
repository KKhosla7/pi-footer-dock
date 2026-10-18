import type { Block, Tone as BlockTone } from '../explain/blocks.js';
import type { Look } from '../looks.js';

/** The event-bus channels of the extension protocol, version 1. See docs/extending-footer-dock.md. */
export const CHANNELS = {
  ready: 'footer-dock/ready/v1',
  hello: 'footer-dock/hello/v1',
  register: 'footer-dock/register/v1',
  update: 'footer-dock/update/v1',
  unregister: 'footer-dock/unregister/v1',
  click: 'footer-dock/click/v1',
  setting: 'footer-dock/setting/v1',
  rejected: 'footer-dock/rejected/v1',
} as const;

/** Everything an extension can ask for is bounded; a registration over a bound is cut or dropped. */
export const LIMITS = {
  extensions: 8,
  items: 12,
  settingRows: 16,
  settingValues: 8,
  blocks: 30,
  formText: 60,
  label: 40,
  note: 120,
  paragraph: 600,
  listItems: 12,
  tableRows: 16,
  tableColumns: 6,
  chartValues: 60,
  bullets: 8,
} as const;

/** Icons are names; Footer Dock owns the glyphs for each icon set. */
export const ICON_NAMES = [
  'folder',
  'branch',
  'changed',
  'ahead',
  'chip',
  'input',
  'output',
  'cache',
  'robot',
  'reasoning',
  'hourglass',
  'reset',
  'speed',
  'dot',
  'check',
  'warn',
  'error',
  'info',
  'clock',
  'user',
  'star',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const FORM_TONES = ['text', 'muted', 'accent', 'success', 'warning', 'error'] as const;
export type FormTone = (typeof FORM_TONES)[number];

export const REGIONS = [
  'row1.left',
  'row1.right',
  'row2.left',
  'row2.right',
  'row3.left',
  'row3.right',
] as const;
export type Region = (typeof REGIONS)[number];

/** How one item looks at one look: what to say, an icon, a colour. */
export interface Form {
  text: string;
  icon?: IconName;
  tone?: FormTone;
  dim?: boolean;
}
/** `xl` is required; a look not given inherits the nearest richer one; `hide` removes the item. */
export type At = { xl: Form | 'hide' } & Partial<Record<Exclude<Look, 'xl'>, Form | 'hide'>>;

export interface ExtExplain {
  title: string;
  reports: string[];
  missingWhen: string[];
  status?: { available: boolean; text: string };
  blocks: Block[];
}
export interface ExtItem {
  /** Local id; the footer id is `<ext>:<id>`. */
  id: string;
  region: Region;
  at: At;
  /** What a click on the icon does: nothing, or send an event to the extension. */
  icon: 'none' | 'event';
  /** What a click on the text does: Footer Dock's explanation (the default), an event, or nothing. */
  text: 'explain' | 'event' | 'none';
  explain?: ExtExplain;
}
export interface SettingRow {
  id: string;
  label: string;
  description: string;
  values: string[];
  current: string;
  default?: string;
}
export interface Registration {
  ext: string;
  label: string;
  items: ExtItem[];
  settings?: { note: string; rows: SettingRow[] };
}

export type { BlockTone };
