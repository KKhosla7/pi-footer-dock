import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { QuotaContext } from '../../src/quota-sources/contract.js';
import { ProviderQuotaService } from '../../src/adapters/provider-quota-service.js';
import type { QuotaState } from '../../src/core/quota-presentation.js';
import { SharedGate } from '../../src/adapters/shared-gate.js';
import { quotaRoot } from './quota-fixtures.js';

export const KEY = 'provider-key-canary-71c2';
export const CLINE = 'https://api.cline.bot/api/v1';
export const GO = 'https://opencode.ai/zen/go/v1';

export async function until(predicate: () => boolean, timeout = 1500): Promise<void> {
  const deadline = performance.now() + timeout;
  while (!predicate() && performance.now() < deadline) await sleep(5);
  assert.ok(predicate(), 'expected the service to reach the awaited state');
}
export function context(
  provider: string,
  baseUrl: string,
  credential: { key: string | null } = { key: KEY },
) {
  const calls = { auth: [] as string[] };
  const ctx = {
    model: { provider, id: `${provider}/model`, baseUrl },
    modelRegistry: {
      getProviderAuth: (name: string) => {
        calls.auth.push(name);
        return Promise.resolve(
          credential.key === null ? undefined : { auth: { apiKey: credential.key } },
        );
      },
    },
  } as unknown as QuotaContext;
  return { ctx, calls };
}
export const reply = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), { status: 200, ...init });

export function harness(
  t: TestContext,
  respond: (call: number, clock: number) => Response | Error,
) {
  const root = quotaRoot(t);
  let clock = 1_800_000_000_000;
  const now = () => clock;
  const gate = new SharedGate({ root, now, flightMs: 45_000 });
  const fetches: { url: string; authorization: string | undefined }[] = [];
  /** The same requests with every header they carried. */
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fake = ((input: URL | string, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    fetches.push({ url: String(input), authorization: headers?.Authorization });
    requests.push({ url: String(input), headers: headers ?? {} });
    const result = respond(fetches.length, clock);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  }) as typeof fetch;
  const states: QuotaState[] = [];
  const services: ProviderQuotaService[] = [];
  t.after(() => {
    for (const service of services) service.dispose();
  });
  return {
    root,
    states,
    fetches,
    requests,
    advance: (ms: number) => {
      clock += ms;
    },
    last: () => states.at(-1),
    /** The same gate, fake network and clock, for a controller that builds its own service. */
    options: () => ({ gate, fetch: fake, now }),
    service: () => {
      const service: ProviderQuotaService = new ProviderQuotaService(
        () => {
          const state = service.state();
          if (state) states.push(state);
        },
        { gate, fetch: fake, now },
      );
      services.push(service);
      return service;
    },
  };
}
export function clineBody(clock: number): unknown {
  const at = (seconds: number) => new Date(clock + seconds * 1000).toISOString();
  return {
    success: true,
    data: {
      limits: [
        { type: 'five_hour', percentUsed: 6, resetsAt: at(9960) },
        { type: 'weekly', percentUsed: 52, resetsAt: at(286_960) },
        { type: 'monthly', percentUsed: 47, resetsAt: at(1_641_592) },
      ],
    },
  };
}
export function goBody(clock: number): unknown {
  const at = (seconds: number) => new Date(clock + seconds * 1000).toISOString();
  return {
    usage: {
      rolling: { status: 'ok', percent: 0, resetsAt: at(18_000) },
      weekly: { status: 'ok', percent: 0, resetsAt: at(72_525) },
      monthly: { status: 'rate-limited', percent: 100, resetsAt: at(453_550) },
    },
  };
}
export const left = (state: QuotaState | undefined) =>
  state?.limits?.windows.map((w) => w.remainingPercent);
