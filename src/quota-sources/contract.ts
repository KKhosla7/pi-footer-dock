import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Credential } from '../adapters/authorized-fetch.js';
import type { RateLimitWindow } from '../core/rate-limits.js';
import type { ObserveWindow } from '../core/window-report.js';

export type QuotaContext = Pick<ExtensionContext, 'model' | 'modelRegistry'>;
export type Problem = 'unsupported' | 'auth';
export class QuotaProblem extends Error {
  constructor(readonly problem: Problem) {
    super(problem);
  }
}
export interface ResolvedCredential {
  credential: Credential;
  scope: string;
}
export type CredentialResolver = (
  ctx: QuotaContext,
  source: ProviderQuotaSource,
) => Promise<ResolvedCredential>;

export interface ProviderQuotaSource {
  provider: string;
  label: string;
  origin: string;
  path: string;
  parse: (body: unknown, observe?: ObserveWindow) => RateLimitWindow[] | undefined;
  credential?: CredentialResolver;
}
