import type { Block, Tone as BlockTone } from '../explain/blocks.js';
import type { Look } from '../looks.js';

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

export interface Form {
  text: string;
  icon?: IconName;
  tone?: FormTone;
  dim?: boolean;
}
export type At = { xl: Form | 'hide' } & Partial<Record<Exclude<Look, 'xl'>, Form | 'hide'>>;

export interface ExtExplain {
  title: string;
  reports: string[];
  missingWhen: string[];
  status?: { available: boolean; text: string };
  blocks: Block[];
}
export interface ExtItem {
  id: string;
  region: Region;
  at: At;
  icon: 'none' | 'event';
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
