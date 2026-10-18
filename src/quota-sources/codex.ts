import { parseCodexUsage } from '../core/rate-limits.js';
import { QuotaProblem } from './contract.js';
import type { CredentialResolver, ProviderQuotaSource } from './contract.js';
import { resolveQuotaCredential } from './codex/login.js';
import { scopeOf } from './shared/bearer.js';

/** A ChatGPT OAuth login: every refusal of the login check stays; the account keys the scope. */
const codexOAuth: CredentialResolver = async (ctx, source) => {
  const { headers, identityKey } = await resolveQuotaCredential(ctx);
  const token = headers.Authorization?.slice('Bearer '.length) ?? '';
  const accountId = headers['ChatGPT-Account-Id'];
  if (!token || !accountId) throw new QuotaProblem('auth');
  return {
    credential: { token, accountId },
    scope: scopeOf(source.provider, 'account', identityKey),
  };
};

export const codex: ProviderQuotaSource = {
  provider: 'openai-codex',
  label: 'Codex',
  origin: 'https://chatgpt.com',
  path: '/backend-api/wham/usage',
  parse: (body) => parseCodexUsage('openai-codex', '', body)?.windows,
  credential: codexOAuth,
};
