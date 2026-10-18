import { LOOKS } from '../looks.js';
import type { Look } from '../looks.js';
import { parseBlocks } from './blocks.js';
import type { Problems } from './blocks.js';
import { cleanText, fields, list, oneOf, validId } from './clean.js';
import { FORM_TONES, ICON_NAMES, LIMITS, REGIONS } from './protocol.js';
import type {
  At,
  ExtExplain,
  ExtItem,
  Form,
  FormTone,
  IconName,
  Region,
  Registration,
  SettingRow,
} from './protocol.js';

export type { Problems };
export { cleanText };

function parseForm(value: unknown): Form | undefined {
  const form = fields(value);
  const text = cleanText(form.text, LIMITS.formText);
  if (text === undefined) return undefined;
  const icon = oneOf<IconName>(ICON_NAMES, form.icon);
  const tone = oneOf<FormTone>(FORM_TONES, form.tone);
  return {
    text,
    ...(icon ? { icon } : {}),
    ...(tone ? { tone } : {}),
    ...(form.dim === true ? { dim: true } : {}),
  };
}
export function parseAt(value: unknown, problems: Problems, where: string): At | undefined {
  const table = fields(value);
  const first = table.xl === 'hide' ? 'hide' : parseForm(table.xl);
  if (first === undefined) {
    problems.push(`${where}: "at.xl" must be a form {text, icon?, tone?, dim?} or "hide"`);
    return undefined;
  }
  const at: At = { xl: first };
  for (const look of LOOKS.slice(1) as Exclude<Look, 'xl'>[]) {
    const raw = table[look];
    if (raw === undefined) continue;
    const form = raw === 'hide' ? 'hide' : parseForm(raw);
    if (form === undefined) problems.push(`${where}: "at.${look}" ignored (not a form or "hide")`);
    else at[look] = form;
  }
  return at;
}

function strings(value: unknown, max: number, size: number): string[] {
  return list(value, max).flatMap((entry) => {
    const text = cleanText(entry, size);
    return text ? [text] : [];
  });
}

export function parseExplain(
  value: unknown,
  problems: Problems,
  where: string,
): ExtExplain | undefined {
  const raw = fields(value);
  const title = cleanText(raw.title, LIMITS.label);
  const reports = strings(raw.reports, LIMITS.bullets, 240);
  const missingWhen = strings(raw.missingWhen, LIMITS.bullets, 240);
  if (!title || reports.length === 0 || missingWhen.length === 0) {
    problems.push(
      `${where}: "explain" needs a title, at least one "reports" and one "missingWhen" line`,
    );
    return undefined;
  }
  const status = fields(raw.status);
  const statusText = cleanText(status.text, LIMITS.formText);
  return {
    title,
    reports,
    missingWhen,
    ...(statusText && typeof status.available === 'boolean'
      ? { status: { available: status.available, text: statusText } }
      : {}),
    blocks: parseBlocks(raw.blocks, problems, `${where}.explain`),
  };
}
function parseItem(value: unknown, problems: Problems): ExtItem | undefined {
  const raw = fields(value);
  if (!validId(raw.id) || raw.id === 'icon') {
    problems.push('an item was dropped: "id" must match ^[a-z][a-z0-9-]{0,23}$ and not be "icon"');
    return undefined;
  }
  const where = `item "${raw.id}"`;
  const region = oneOf<Region>(REGIONS, raw.region);
  const at = parseAt(raw.at, problems, where);
  if (!region || !at) {
    if (!region) problems.push(`${where}: "region" must be one of ${REGIONS.join(', ')}`);
    return undefined;
  }
  const clicks = fields(raw.clicks);
  const explain =
    raw.explain === undefined ? undefined : parseExplain(raw.explain, problems, where);
  return {
    id: raw.id,
    region,
    at,
    icon: clicks.icon === 'event' ? 'event' : 'none',
    text: clicks.text === 'event' || clicks.text === 'none' ? clicks.text : 'explain',
    ...(explain ? { explain } : {}),
  };
}
function parseRow(value: unknown, problems: Problems): SettingRow | undefined {
  const raw = fields(value);
  const label = cleanText(raw.label, LIMITS.label);
  const values = strings(raw.values, LIMITS.settingValues, 24);
  const current = cleanText(raw.current, 24);
  if (!validId(raw.id) || !label || values.length < 2 || !current || !values.includes(current)) {
    problems.push(
      `a setting row was dropped: needs "id", "label", 2-8 "values" and a "current" that is one of them`,
    );
    return undefined;
  }
  const standard = cleanText(raw.default, 24);
  return {
    id: raw.id,
    label,
    description: cleanText(raw.description, LIMITS.note) ?? '',
    values,
    current,
    ...(standard && values.includes(standard) ? { default: standard } : {}),
  };
}

/** A registration, cleaned and bounded; items and rows that are not valid are dropped and reported. */
export function parseRegistration(value: unknown): {
  registration?: Registration;
  problems: Problems;
} {
  const problems: Problems = [];
  const raw = fields(value);
  if (raw.v !== 1) return { problems: ['"v" must be 1'] };
  const label = cleanText(raw.label, LIMITS.label);
  if (!validId(raw.ext) || !label)
    return { problems: ['"ext" must match ^[a-z][a-z0-9-]{0,23}$ and "label" must be text'] };
  const items = list(raw.items, LIMITS.items).flatMap((entry) => {
    const item = parseItem(entry, problems);
    return item ? [item] : [];
  });
  if (Array.isArray(raw.items) && raw.items.length > LIMITS.items)
    problems.push(`only the first ${LIMITS.items} items are used`);
  const ids = new Set<string>();
  const unique = items.filter((item) => !ids.has(item.id) && ids.add(item.id));
  const settings = fields(raw.settings);
  const rows = list(settings.rows, LIMITS.settingRows).flatMap((entry) => {
    const row = parseRow(entry, problems);
    return row ? [row] : [];
  });
  return {
    registration: {
      ext: raw.ext,
      label,
      items: unique,
      ...(rows.length > 0
        ? { settings: { note: cleanText(settings.note, LIMITS.note) ?? '', rows } }
        : {}),
    },
    problems,
  };
}
