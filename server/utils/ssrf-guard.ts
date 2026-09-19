/**
 * Blocks outbound HTTP requests to private/internal/cloud-metadata
 * destinations for endpoints that take a user-supplied URL and fetch it
 * server-side directly (e.g. via axios), rather than through
 * performFlowHttpRequest (which has its own, more complete ssrfGuard that
 * also re-validates redirect targets and binds to the validated IP).
 *
 * Resolves the hostname and checks the resolved IP too, not just the
 * literal host string, to close the DNS-rebinding gap.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { isPrivateOrReservedIP } from './is-private-or-reserved-ip';

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * `.test` and `.example` are permanently reserved by RFC 2606 and can never
 * be registered as real, resolvable internet domains — unlike `localhost`,
 * which genuinely resolves back to whatever machine makes the request, so
 * allowing it would defeat the point of this guard unless the caller has its
 * own explicit, deliberate sandbox-mode flag gating it (as
 * sandbox-api-key-policy.ts does for API keys). Safe to skip DNS resolution
 * for these two TLDs unconditionally; nothing else gets a pass here.
 */
export function isReservedTestDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith('.test') || host.endsWith('.example');
}

/**
 * Throws SsrfBlockedError if `rawUrl` is not safe for the server to fetch
 * on behalf of a user-supplied destination. Call this immediately before
 * making the actual outbound request (not earlier), so the DNS check is
 * fresh. Note: this does not protect against a redirect from the target
 * server pointing at a private address — callers that follow redirects
 * should prefer performFlowHttpRequest's ssrfGuard instead.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError('Only http/https URLs are allowed');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === 'metadata.google.internal') {
    throw new SsrfBlockedError('Destination host is not allowed');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIP(hostname)) {
      throw new SsrfBlockedError('Destination IP is not allowed');
    }
    return url;
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new SsrfBlockedError('Could not resolve destination host');
  }

  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIP)) {
    throw new SsrfBlockedError('Destination host resolves to a disallowed address');
  }

  return url;
}
