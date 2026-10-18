/** Opaque, provider/source-scoped key. Adapters must never put credentials in it. */
export interface QuotaScope {
  provider: string;
  domain: string;
  identityKey: string;
}

export interface BindingLease {
  readonly scope: Readonly<QuotaScope>;
  readonly generation: number;
}

function sameScope(left: QuotaScope, right: QuotaScope): boolean {
  return (
    left.provider === right.provider &&
    left.domain === right.domain &&
    left.identityKey === right.identityKey
  );
}

/** Subscriber fencing only; shared acquisition admission belongs to the durable store. */
export class QuotaBinding {
  private generation = 0;
  private current: BindingLease | undefined;

  bind(scope: QuotaScope): BindingLease {
    if (this.current && sameScope(this.current.scope, scope)) return this.current;
    this.invalidate();
    this.current = Object.freeze({
      scope: Object.freeze({ ...scope }),
      generation: this.generation,
    });
    return this.current;
  }

  /** Call before resolving a new account/routed source, including A → B → A. */
  invalidate(): void {
    this.generation += 1;
    this.current = undefined;
  }

  accepts(lease: BindingLease): boolean {
    return this.current === lease && lease.generation === this.generation;
  }

  snapshot(): BindingLease | undefined {
    return this.current;
  }
}
