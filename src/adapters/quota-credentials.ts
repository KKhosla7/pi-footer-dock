import type {
  ProviderQuotaSource,
  QuotaContext,
  ResolvedCredential,
} from '../quota-sources/contract.js';
import { bearer } from '../quota-sources/shared/bearer.js';
import { withAcquisitionDeadline } from './acquisition-deadline.js';

const RESOLVE_MS = 3000;

/** Resolves the source's credential within a deadline; a resolver throws typed problems only. */
export function resolveCredential(
  ctx: QuotaContext,
  source: ProviderQuotaSource,
): Promise<ResolvedCredential> {
  const resolve = source.credential ?? bearer;
  return withAcquisitionDeadline(() => resolve(ctx, source), RESOLVE_MS);
}
