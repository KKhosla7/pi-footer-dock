import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Credential } from '../adapters/authorized-fetch.js';
import type { RateLimitWindow } from '../core/rate-limits.js';

/** What a source needs from the session: the model in use and Pi's auth registry. */
export type QuotaContext = Pick<ExtensionContext, 'model' | 'modelRegistry'>;
export type Problem = 'unsupported' | 'auth';
/** Why a source cannot be asked: the model is not one it can serve, or the login is unusable. */
export class QuotaProblem extends Error {
  constructor(readonly problem: Problem) {
    super(problem);
  }
}
/** The credential to send and the one-way scope that keys the shared gate for this account. */
export interface ResolvedCredential {
  credential: Credential;
  scope: string;
}
export type CredentialResolver = (
  ctx: QuotaContext,
  source: ProviderQuotaSource,
) => Promise<ResolvedCredential>;

/**
 * One server-side quota endpoint for one Pi provider. A provider is one self-contained module that
 * exports one of these; `registry.ts` lists them. Nothing else changes when a provider is added.
 */
export interface ProviderQuotaSource {
  /** Pi provider id this source serves. */
  provider: string;
  label: string;
  /** The only origin that may ever receive this provider's credential (HTTPS). */
  origin: string;
  path: string;
  /** Strict parser: the windows the provider published, or undefined for anything unexpected. */
  parse: (body: unknown) => RateLimitWindow[] | undefined;
  /** How to obtain the credential; absent means Pi's token for this provider (`shared/bearer.ts`). */
  credential?: CredentialResolver;
}
