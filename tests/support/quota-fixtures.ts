import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type { QuotaContext } from '../../src/quota-sources/contract.js';
import { providerModels } from '../fixtures.js';

export const quotaBody = {
  rate_limit: {
    primary_window: { used_percent: 20.5, limit_window_seconds: 18000, reset_at: 4_000_001_000 },
    secondary_window: { used_percent: 100, limit_window_seconds: 604800, reset_at: 4_000_100_000 },
  },
};
export const quotaHeaders = {
  Authorization: 'Bearer fixture-credential-canary',
  'ChatGPT-Account-Id': 'fixture-account-canary',
  Accept: 'application/json',
};
export function quotaIdentity(name = 'account-a'): string {
  return createHash('sha256').update(name).digest('hex');
}
/**
 * A throw-away folder. `stopWriters` runs first, and the folder is removed without blocking the event
 * loop: a write that is still finishing needs the loop to run, and a blocking removal would keep the
 * folder non-empty for as long as it retries.
 */
export function quotaRoot(t: TestContext, stopWriters: () => void = () => undefined): string {
  const root = mkdtempSync(join(tmpdir(), 'pi-footer-dock-quota-test-'));
  t.after(async () => {
    stopWriters();
    await delay(50);
    await rm(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  });
  return root;
}
export async function quotaServer(
  t: TestContext,
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handle);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected loopback fixture');
  return `http://127.0.0.1:${address.port}/usage`;
}
export function quotaToken(account = 'account-a', user = 'user-a'): string {
  const body = {
    sub: `fixture-${user}`,
    'https://api.openai.com/auth': {
      chatgpt_account_id: account,
      chatgpt_user_id: user,
    },
  };
  return `fixture.${Buffer.from(JSON.stringify(body)).toString('base64url')}.fixture`;
}
export function quotaContext(token = quotaToken()): QuotaContext {
  const selected = providerModels[0];
  if (!selected) throw new Error('Missing Codex fixture model');
  const model = { ...selected, baseUrl: 'https://chatgpt.com/backend-api' };
  return {
    model,
    modelRegistry: {
      find: () => model,
      isUsingOAuth: () => true,
      getRegisteredProviderConfig: () => undefined,
      getRegisteredNativeProvider: () => undefined,
      getProviderAuth: () => Promise.resolve({ auth: { apiKey: token } }),
    } as unknown as QuotaContext['modelRegistry'],
  };
}
