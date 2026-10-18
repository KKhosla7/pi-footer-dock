import { stripTerminalSequences, truncateToWidth } from '@earendil-works/pi-tui';
import { safeLabel } from './model.js';

export interface ActionBus {
  on(channel: string, handler: (data: unknown) => void): () => void;
  emit(channel: string, data: unknown): void;
}

export const MAX_UI_ACTIONS = 64;
export const MAX_UI_ACTIONS_PER_TARGET = 16;

export const actionChannels = {
  discover: 'pi:ui-actions:discover:v1',
  register: 'pi:ui-actions:register:v1',
  unregister: 'pi:ui-actions:unregister:v1',
  invoke: 'pi:ui-actions:invoke:v1',
} as const;

export interface UIAction {
  id: string;
  target: string;
  label: string;
}

export type ActionSelector = (labels: string[]) => Promise<string | undefined>;
export type ActionResult = 'invoked' | 'unavailable' | 'cancelled';

function payload(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  return data.version === 1 ? data : undefined;
}

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\p{Cc}\p{Cf}\s]/u.test(value)
  );
}

function registration(value: unknown, targets: ReadonlySet<string>): UIAction | undefined {
  const data = payload(value);
  if (!validId(data?.id) || typeof data.target !== 'string' || !targets.has(data.target)) {
    return undefined;
  }
  if (typeof data.label !== 'string' || data.label.length > 4096) return undefined;
  const label = stripTerminalSequences(
    truncateToWidth(safeLabel(stripTerminalSequences(data.label)).trim(), 80, '…', false),
  );
  return label ? { id: data.id, target: data.target, label } : undefined;
}

/** Session-scoped protocol consumer. It knows nothing about footer geometry or providers. */
export class UIActionRegistry {
  private readonly records = new Map<string, UIAction>();
  private subscriptions: (() => void)[] = [];
  private generation = 0;
  private selecting = false;

  constructor(
    private readonly bus: ActionBus,
    private readonly targets: ReadonlySet<string>,
    private readonly trace: (metadata: Record<string, unknown>) => void = () => {
      /* Diagnostics are off unless supplied by the consumer. */
    },
  ) {}

  start(): void {
    this.stop();
    this.subscriptions = [
      this.bus.on(actionChannels.register, (data) => {
        const action = registration(data, this.targets);
        if (!action) return;
        const existing = this.records.get(action.id);
        if (!existing && this.records.size >= MAX_UI_ACTIONS) return;
        if (
          existing?.target !== action.target &&
          this.actions(action.target).length >= MAX_UI_ACTIONS_PER_TARGET
        )
          return;
        if (existing?.label === action.label && existing.target === action.target) {
          this.trace({
            layer: 'registry',
            event: 'register-unchanged',
            id: action.id,
            count: this.records.size,
          });
          return;
        }
        this.records.set(action.id, action);
        this.trace({
          layer: 'registry',
          event: 'register',
          id: action.id,
          target: action.target,
          count: this.records.size,
        });
      }),
      this.bus.on(actionChannels.unregister, (data) => {
        const value = payload(data);
        if (validId(value?.id)) {
          this.records.delete(value.id);
          this.trace({
            layer: 'registry',
            event: 'unregister',
            id: value.id,
            count: this.records.size,
          });
        }
      }),
    ];
    this.trace({ layer: 'registry', event: 'discover', generation: this.generation });
    this.bus.emit(actionChannels.discover, { version: 1 });
  }

  stop(): void {
    this.generation += 1;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
    this.records.clear();
    this.selecting = false;
    this.trace({ layer: 'registry', event: 'stop', generation: this.generation });
  }

  actions(target: string): UIAction[] {
    return [...this.records.values()].filter((action) => action.target === target);
  }

  async invoke(target: string, select: ActionSelector): Promise<ActionResult> {
    const actions = this.actions(target);
    this.trace({
      layer: 'registry',
      event: 'invoke-request',
      target,
      count: actions.length,
      selecting: this.selecting,
    });
    if (actions.length === 0) return 'unavailable';
    if (this.selecting) return 'cancelled';
    const generation = this.generation;
    const selected = await this.choose(actions, select);
    if (generation !== this.generation || !selected) return 'cancelled';
    if (this.records.get(selected.id) !== selected) return 'cancelled';
    this.trace({ layer: 'registry', event: 'invoke-emit', id: selected.id, target });
    this.bus.emit(actionChannels.invoke, { version: 1, id: selected.id });
    return 'invoked';
  }

  private async choose(actions: UIAction[], select: ActionSelector): Promise<UIAction | undefined> {
    if (actions.length === 1) return actions[0];
    this.selecting = true;
    const generation = this.generation;
    // Ordinals keep labels unambiguous even when providers advertise identical labels.
    const labels = actions.map((action, index) => `${index + 1}. ${action.label}`);
    try {
      const answer = await select(labels);
      return actions[labels.indexOf(answer ?? '')];
    } finally {
      if (generation === this.generation) this.selecting = false;
    }
  }
}
