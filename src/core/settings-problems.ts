import { CONFIG_KEYS, parseFooterConfig } from './footer-config.js';
import { invalidValue, problem, unknownName } from './problems.js';
import type { Problem } from './problems.js';
import { SETTING_KEYS, parseSettings, settingsItems } from './settings.js';
import { SLOT_OPTION_KEYS } from './slot-options.js';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const kindOf = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value;

function attempt(where: string, setting: string, value: unknown, run: () => unknown): Problem[] {
  try {
    run();
    return [];
  } catch (error) {
    return [invalidValue(where, setting, value, error)];
  }
}
const notAnObject = (where: string, setting: string, what: string, value: unknown): Problem =>
  problem(
    where,
    setting,
    `${what} must be a JSON object, not ${kindOf(value)}.`,
    'Use { ... } with the settings inside.',
  );
const versionProblems = (where: string, value: unknown): Problem[] =>
  value === 1 ? [] : [invalidValue(where, 'version', value, new Error('The version must be 1'))];

function slotProblems(
  where: string,
  value: unknown,
  probe: (id: string, option: string, item: unknown) => unknown,
): Problem[] {
  if (!isObject(value)) return [notAnObject(where, 'slots', 'slots', value)];
  return Object.entries(value).flatMap(([id, options]) => {
    if (!isObject(options))
      return [notAnObject(where, `slots.${id}`, `The options of ${id}`, options)];
    return Object.entries(options).flatMap(([option, item]) =>
      SLOT_OPTION_KEYS.includes(option)
        ? attempt(where, `slots.${id}.${option}`, item, () => probe(id, option, item))
        : [
            unknownName(where, `slots.${id}.${option}`, option, {
              kind: 'slot option',
              names: SLOT_OPTION_KEYS,
            }),
          ],
    );
  });
}

function settingsSlotProblems(where: string, value: unknown): Problem[] {
  if (!isObject(value)) return [notAnObject(where, 'slots', 'slots', value)];
  const items = settingsItems();
  const unknown = Object.keys(value)
    .filter((id) => !items.includes(id))
    .map((id) => unknownName(where, `slots.${id}`, id, { kind: 'footer item', names: items }));
  const known = Object.fromEntries(Object.entries(value).filter(([id]) => items.includes(id)));
  const probe = (id: string, option: string, item: unknown): unknown =>
    parseSettings({ version: 1, slots: { [id]: { [option]: item } } });
  return [...unknown, ...slotProblems(where, known, probe)];
}

function settingProblems(where: string, key: string, item: unknown): Problem[] {
  if (!(SETTING_KEYS as readonly string[]).includes(key))
    return [unknownName(where, key, key, { kind: 'setting', names: SETTING_KEYS })];
  if (key === 'version') return versionProblems(where, item);
  if (key === 'slots') return settingsSlotProblems(where, item);
  return attempt(where, key, item, () => parseSettings({ version: 1, [key]: item }));
}

export function checkSettings(value: unknown, where: string): Problem[] {
  if (!isObject(value)) return [notAnObject(where, '(file)', 'The settings', value)];
  const missing =
    'version' in value
      ? []
      : [
          problem(
            where,
            'version',
            'The version is missing.',
            'Add "version": 1 as the first entry.',
          ),
        ];
  const found = [
    ...missing,
    ...Object.entries(value).flatMap(([key, item]) => settingProblems(where, key, item)),
  ];
  return found.length > 0
    ? found
    : attempt(where, '(settings)', undefined, () => parseSettings(value));
}

function configProblems(where: string, key: string, item: unknown): Problem[] {
  if (!(CONFIG_KEYS as readonly string[]).includes(key))
    return [unknownName(where, key, key, { kind: 'configuration key', names: CONFIG_KEYS })];
  if (key === 'version') return versionProblems(where, item);
  if (key === 'slots')
    return slotProblems(where, item, (id, option, setting) =>
      parseFooterConfig({ slots: { [id]: { [option]: setting } } }),
    );
  return attempt(where, key, item, () => parseFooterConfig({ [key]: item }));
}

export function checkConfig(value: unknown, where: string): Problem[] {
  if (!isObject(value)) return [notAnObject(where, '(configuration)', 'The configuration', value)];
  const found = Object.entries(value).flatMap(([key, item]) => configProblems(where, key, item));
  return found.length > 0
    ? found
    : attempt(where, '(configuration)', undefined, () => parseFooterConfig(value));
}
