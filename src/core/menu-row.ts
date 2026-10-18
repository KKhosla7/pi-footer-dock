import { safeLabel } from './model.js';

/** One line of the settings menu: what it is called, what it says, what it can be, what it is. */
export interface MenuRow {
  id: string;
  label: string;
  description: string;
  values: string[];
  current: string;
  /** The value that counts as unchanged; the first of `values` when absent. */
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
/** Window labels the file format can hold, so a saved choice can always be loaded again. */
export const savable = (label: string): boolean => label.length <= 24 && safeLabel(label) === label;
