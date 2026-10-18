/** Opt-in, bounded metadata-only diagnostics. Callers must never pass message/auth payloads. */
export class InteractionTrace {
  enabled = false;
  private records: Record<string, unknown>[] = [];

  constructor(private readonly publish: (record: Record<string, unknown>) => void) {}

  record = (metadata: Record<string, unknown>): void => {
    if (!this.enabled) return;
    const record = { timestamp: Date.now(), ...metadata };
    this.records.push(record);
    if (this.records.length > 128) this.records.shift();
    this.publish(record);
  };

  snapshot(): readonly Record<string, unknown>[] {
    return this.records.slice();
  }

  clear(): void {
    this.records = [];
  }
}
