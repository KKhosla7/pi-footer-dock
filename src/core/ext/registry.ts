import { cleanText, fields, list, validId } from './clean.js';
import { LIMITS, REGIONS } from './protocol.js';
import type { ExtItem, Registration, Region, SettingRow } from './protocol.js';
import { parseAt, parseExplain, parseRegistration } from './validate.js';
import type { Problems } from './validate.js';

export interface Found {
  registration: Registration;
  item: ExtItem;
}

/**
 * What the extensions that are loaded have registered, in memory for this session. It stores no
 * preference and writes nothing; it knows no extension by name. Everything it holds came through
 * the messages of the protocol and was cleaned and bounded on the way in.
 */
export class ExtensionRegistry {
  private readonly registrations = new Map<string, Registration>();
  /** Counts every change, so a view can tell when it has to be drawn again. */
  version = 0;

  /** Replaces the extension's registration (the same message twice is the same as once). */
  register(raw: unknown): Problems {
    const { registration, problems } = parseRegistration(raw);
    if (!registration) return problems;
    if (!this.registrations.has(registration.ext) && this.registrations.size >= LIMITS.extensions)
      return [...problems, `at most ${LIMITS.extensions} extensions can register`];
    this.registrations.set(registration.ext, registration);
    this.version += 1;
    return problems;
  }

  /** Changes item forms, item explanations and setting values of a registered extension. */
  update(raw: unknown): Problems {
    const message = fields(raw);
    const registration = validId(message.ext) ? this.registrations.get(message.ext) : undefined;
    if (message.v !== 1 || !registration)
      return ['"update" needs "v": 1 and an "ext" that is registered'];
    const problems: Problems = [];
    for (const entry of list(message.items, LIMITS.items))
      this.updateItem(registration, fields(entry), problems);
    for (const entry of list(message.settings, LIMITS.settingRows)) {
      const change = fields(entry);
      const row = registration.settings?.rows.find((candidate) => candidate.id === change.row);
      const current = cleanText(change.current, 24);
      if (row && current && row.values.includes(current)) row.current = current;
      else problems.push(`setting "${String(change.row)}" not updated: unknown row or value`);
    }
    this.version += 1;
    return problems;
  }
  private updateItem(
    registration: Registration,
    change: Record<string, unknown>,
    problems: Problems,
  ): void {
    const item = registration.items.find((candidate) => candidate.id === change.id);
    if (!item) {
      problems.push(`item "${String(change.id)}" not updated: not registered`);
      return;
    }
    if (change.at !== undefined) {
      const at = parseAt(change.at, problems, `item "${item.id}"`);
      if (at) item.at = at;
    }
    if (change.explain !== undefined) {
      const explain = parseExplain(change.explain, problems, `item "${item.id}"`);
      if (explain) item.explain = explain;
    }
  }

  unregister(ext: unknown): void {
    if (validId(ext) && this.registrations.delete(ext)) this.version += 1;
  }
  clear(): void {
    if (this.registrations.size === 0) return;
    this.registrations.clear();
    this.version += 1;
  }

  /** The user picked a value in the extension's menu: show it until the extension confirms or changes it. */
  setCurrent(ext: string, row: string, value: string): boolean {
    const target: SettingRow | undefined = this.registrations
      .get(ext)
      ?.settings?.rows.find((candidate) => candidate.id === row);
    if (!target?.values.includes(value)) return false;
    target.current = value;
    this.version += 1;
    return true;
  }

  get size(): number {
    return this.registrations.size;
  }
  all(): Registration[] {
    return [...this.registrations.values()];
  }
  /** The footer id of an item: `<extension>:<item>`. */
  static idOf(ext: string, item: string): string {
    return `${ext}:${item}`;
  }
  find(id: string): Found | undefined {
    const at = id.indexOf(':');
    const registration = this.registrations.get(id.slice(0, at));
    const item = registration?.items.find((candidate) => candidate.id === id.slice(at + 1));
    return registration && item ? { registration, item } : undefined;
  }
  has(id: string): boolean {
    return this.find(id) !== undefined;
  }
  /** Footer ids placed in a region, in registration order. */
  ids(region: Region): string[] {
    return this.all().flatMap((registration) =>
      registration.items
        .filter((item) => item.region === region)
        .map((item) => ExtensionRegistry.idOf(registration.ext, item.id)),
    );
  }
  /** Regions that have items, so rows appear only when something is in them. */
  usedRegions(): Region[] {
    return REGIONS.filter((region) => this.ids(region).length > 0);
  }
}
