import { createHash } from 'node:crypto';
import { QuotaProblem } from '../contract.js';
import type { CredentialResolver } from '../contract.js';

export const scopeOf = (...parts: string[]): string =>
  createHash('sha256')
    .update(`pi-footer-dock\0${parts.join('\0')}`)
    .digest('hex');
function originOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

export const bearer: CredentialResolver = async (ctx, source) => {
  if (originOf(ctx.model?.baseUrl) !== source.origin) throw new QuotaProblem('unsupported');
  const resolved = await ctx.modelRegistry.getProviderAuth(source.provider);
  const token = resolved?.auth.apiKey;
  if (!token) throw new QuotaProblem('auth');
  return { credential: { token }, scope: scopeOf(source.provider, token) };
};
