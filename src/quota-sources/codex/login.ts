import { createHash } from 'node:crypto';
import { QuotaProblem } from '../contract.js';
import type { QuotaContext } from '../contract.js';

/** The headers to send and the one-way identity of the account they belong to. */
export interface CodexLogin {
  headers: Record<string, string>;
  identityKey: string;
}

/** The login is unusable (malformed, missing claims): the user should look at their login. */
const broken = (): QuotaProblem => new QuotaProblem('auth');
/** Footer Dock cannot ask for this account's quota at all (API key, custom route, overrides). */
const unsupported = (): QuotaProblem => new QuotaProblem('unsupported');

function claims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload || payload.length > 16_384) throw broken();
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (value && typeof value === 'object' && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {
    /* Never expose a token or parser error. */
  }
  throw broken();
}
function identityPart(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\p{Cc}\p{Cf}\s]/u.test(value)
    ? value
    : undefined;
}
function authClaims(value: Record<string, unknown>): Record<string, unknown> {
  const auth = value['https://api.openai.com/auth'];
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) throw broken();
  return auth as Record<string, unknown>;
}
export async function quotaHeaders(ctx: QuotaContext): Promise<Record<string, string>> {
  if (ctx.model?.provider !== 'openai-codex') throw unsupported();
  const model = ctx.modelRegistry.find('openai-codex', ctx.model.id);
  if (!model || !ctx.modelRegistry.isUsingOAuth(model)) throw unsupported();
  const resolved = await ctx.modelRegistry.getProviderAuth('openai-codex');
  const token = resolved?.auth.apiKey;
  if (!token || token.length > 65_536) throw broken();
  const account = identityPart(authClaims(claims(token)).chatgpt_account_id);
  if (!account || !/^[\w-]+$/u.test(account)) throw broken();
  return {
    Authorization: `Bearer ${token}`,
    'ChatGPT-Account-Id': account,
    Accept: 'application/json',
  };
}

function requireDirectModel(ctx: QuotaContext): void {
  const model = ctx.model;
  if (!model) throw unsupported();
  const base = model.baseUrl.replace(/\/$/u, '');
  if (
    (base && base !== 'https://chatgpt.com/backend-api') ||
    Object.keys(model.headers ?? {}).length
  )
    throw unsupported();
}
function requirePhysicalSource(ctx: QuotaContext): void {
  requireDirectModel(ctx);
  if (ctx.model?.provider !== 'openai-codex' || ctx.model.api !== 'openai-codex-responses')
    throw unsupported();
  if (
    ctx.modelRegistry.getRegisteredProviderConfig('openai-codex') ||
    ctx.modelRegistry.getRegisteredNativeProvider('openai-codex')
  )
    throw unsupported();
}
/** Native physical legacy source only. Unknown routed/custom auth requires its own contract. */
export async function resolveQuotaCredential(ctx: QuotaContext): Promise<CodexLogin> {
  requirePhysicalSource(ctx);
  const headers = await quotaHeaders(ctx);
  const body = claims(headers.Authorization?.slice(7) ?? '');
  const auth = authClaims(body);
  const subject = identityPart(body.sub);
  const user = identityPart(auth.chatgpt_user_id);
  if (!subject && !user) throw broken();
  const identity = [
    'openai-codex',
    'wham-account-v1',
    headers['ChatGPT-Account-Id'],
    subject ?? '',
    user ?? '',
    identityPart(auth.organization_id) ?? '',
  ];
  return {
    headers,
    identityKey: createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
  };
}
