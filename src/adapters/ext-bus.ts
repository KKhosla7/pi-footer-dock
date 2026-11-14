import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { CHANNELS } from '../core/ext/protocol.js';
import { ExtensionRegistry } from '../core/ext/registry.js';
import type { Problems } from '../core/ext/validate.js';
import { fields } from '../core/ext/clean.js';

const COALESCE_MS = 100;
const MAX_REPORTED = 20;

export class ExtensionBus {
  readonly registry = new ExtensionRegistry();
  private unsubscribe: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly pi: Pick<ExtensionAPI, 'events'>,
    private readonly changed: () => void,
  ) {}

  start(): void {
    this.stop();
    const on = (channel: string, handle: (data: unknown) => Problems | undefined): void => {
      this.unsubscribe.push(
        this.pi.events.on(channel, (data) => {
          try {
            const problems = handle(data);
            if (problems && problems.length > 0) this.reject(data, problems);
            this.touch();
          } catch {}
        }),
      );
    };
    on(CHANNELS.hello, () => {
      this.ready();
      return undefined;
    });
    on(CHANNELS.register, (data) => this.registry.register(data));
    on(CHANNELS.update, (data) => this.registry.update(data));
    on(CHANNELS.unregister, (data) => {
      this.registry.unregister(fields(data).ext);
      return undefined;
    });
    this.ready();
  }
  stop(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.registry.clear();
  }

  private ready(): void {
    this.pi.events.emit(CHANNELS.ready, { v: 1 });
  }
  click(ext: string, item: string, token: 'icon' | 'text'): void {
    this.pi.events.emit(CHANNELS.click, { v: 1, ext, item, token });
  }
  setting(ext: string, row: string, value: string): void {
    this.registry.setCurrent(ext, row, value);
    this.pi.events.emit(CHANNELS.setting, { v: 1, ext, row, value });
    this.touch();
  }
  private reject(data: unknown, problems: Problems): void {
    const ext = fields(data).ext;
    this.pi.events.emit(CHANNELS.rejected, {
      v: 1,
      ext: typeof ext === 'string' ? ext.slice(0, 24) : null,
      problems: problems.slice(0, MAX_REPORTED),
    });
  }
  private touch(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.changed();
    }, COALESCE_MS);
    this.timer.unref();
  }
}
