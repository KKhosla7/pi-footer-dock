import { clinePass } from './clinepass.js';
import { codex } from './codex.js';
import type { ProviderQuotaSource } from './contract.js';
import { openCodeGo } from './opencode-go.js';

/** Every provider with a server-side quota endpoint. Adding one is a new module and a line here. */
export const quotaSources: readonly ProviderQuotaSource[] = [clinePass, openCodeGo, codex];

const byProvider = new Map(quotaSources.map((source) => [source.provider, source]));
export function quotaSourceFor(provider: string | undefined): ProviderQuotaSource | undefined {
  return provider === undefined ? undefined : byProvider.get(provider);
}
