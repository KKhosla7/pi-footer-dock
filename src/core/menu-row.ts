import { safeLabel } from './model.js';

export interface MenuRow {
  id: string;
  label: string;
  description: string;
  values: string[];
  current: string;
  default?: string;
}
export const HIDDEN = 'hidden';
export const SHOWN = 'shown';

export const row = (id: string, label: string, current: string, values: string[]): MenuRow => ({
  id,
  label,
  description: '',
  values,
  current,
});
export const withNote = (base: MenuRow, description: string): MenuRow => ({ ...base, description });
export const savable = (label: string): boolean => label.length <= 24 && safeLabel(label) === label;
