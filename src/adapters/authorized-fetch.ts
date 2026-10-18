import { QUOTA_MAX_BODY_BYTES } from '../core/quota-limits.js';

export type EndpointErrorCode =
  'bad-endpoint' | 'bad-credential' | 'timeout' | 'network' | 'too-large' | 'invalid-json';
/** Carries a fixed code only, never a URL, header, credential or response text. */
export class EndpointError extends Error {
  constructor(readonly code: EndpointErrorCode) {
    super(code);
  }
}
/** What may be sent: a bearer token and, for ChatGPT accounts, the account the token belongs to. */
export interface Credential {
  token: string;
  accountId?: string;
}
export interface PinnedEndpoint {
  origin: string;
  path: string;
}
export interface EndpointReply {
  status: number;
  body: unknown;
  retryAfterMs: number | null;
}
export interface GetOptions {
  signal: AbortSignal;
  fetch?: typeof fetch;
  now?: () => number;
}

function target(endpoint: PinnedEndpoint): URL {
  const pinned = new URL(endpoint.origin);
  const url = new URL(endpoint.path, pinned);
  const exact =
    pinned.protocol === 'https:' &&
    url.origin === pinned.origin &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash;
  if (!exact) throw new EndpointError('bad-endpoint');
  return url;
}
function validCredential(credential: Credential): boolean {
  const { token, accountId } = credential;
  const tokenOk = token.length > 0 && token.length <= 8192 && !/[\p{Cc}\p{Cf}\s]/u.test(token);
  return tokenOk && (accountId === undefined || /^[\w-]{1,256}$/u.test(accountId));
}
export function retryAfterMs(headers: Headers, now: number): number | null {
  const text = headers.get('retry-after');
  if (!text) return null;
  const seconds = /^\d{1,9}$/u.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}
async function readBody(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > QUOTA_MAX_BODY_BYTES || !response.body)
    throw new EndpointError('too-large');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > QUOTA_MAX_BODY_BYTES) throw new EndpointError('too-large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new EndpointError('invalid-json');
  }
}

/**
 * The only place a credential is attached to a request. It refuses any origin other than the
 * pinned one, any non-HTTPS scheme, userinfo, query, fragment or redirect, and bounds the body.
 */
export async function authorizedGet(
  endpoint: PinnedEndpoint,
  credential: Credential,
  options: GetOptions,
): Promise<EndpointReply> {
  const url = target(endpoint);
  if (!validCredential(credential)) throw new EndpointError('bad-credential');
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credential.token}`,
        Accept: 'application/json',
        ...(credential.accountId === undefined
          ? {}
          : { 'ChatGPT-Account-Id': credential.accountId }),
      },
      redirect: 'error',
      signal: options.signal,
    });
  } catch {
    throw new EndpointError(options.signal.aborted ? 'timeout' : 'network');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return {
      status: response.status,
      body: null,
      retryAfterMs: retryAfterMs(response.headers, (options.now ?? Date.now)()),
    };
  }
  try {
    return { status: response.status, body: await readBody(response), retryAfterMs: null };
  } catch (error) {
    if (error instanceof EndpointError) throw error;
    throw new EndpointError(options.signal.aborted ? 'timeout' : 'network');
  }
}
