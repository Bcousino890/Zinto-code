import path from 'path';

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');

/**
 * Pure path helpers only — no `db` import. Kept separate from
 * crm-media-access.ts's `findMediaOwnerCompanyId` (which does need `db`) so
 * that anything wanting just a media URL — including things imported by
 * lightweight unit tests — doesn't transitively pull in `server/db.ts`'s
 * environment integrity check, which throws outside a fully configured
 * server environment.
 */

/**
 * Resolves a `/media/<type>/<file>` path to its on-disk location, rejecting
 * anything that would escape the media directory (path traversal via `..`,
 * absolute paths, etc.) — the same guard `media-cleanup.ts` uses before
 * touching a file on disk.
 */
export function resolveMediaFilePath(mediaPath: string): string | null {
  if (!mediaPath.startsWith('/media/')) {
    return null;
  }

  const relative = decodeURIComponent(mediaPath.slice('/media/'.length));
  const resolved = path.resolve(MEDIA_DIR, relative);

  if (!resolved.startsWith(MEDIA_DIR + path.sep)) {
    return null;
  }

  return resolved;
}

/**
 * Rewrites Zinto's internal `/media/<type>/<filename>` storage path into the
 * absolute, authenticated v2 download URL shared with CRM partners
 * (`GET /api/v2/media?type=...&filename=...`, gated by `media:read`).
 *
 * Query params rather than `/media/{type}/{filename}` path segments: a
 * filename can't contain `/`, but keeping it out of the path avoids any
 * dependence on a reverse proxy tolerating encoded slashes in path segments.
 */
export function buildCrmMediaDownloadUrl(internalMediaUrl: string): string | null {
  const match = /^\/media\/([^/]+)\/([^/]+)$/.exec(internalMediaUrl);
  if (!match) {
    return null;
  }

  const [, type, filename] = match;
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const query = new URLSearchParams({ type, filename });
  return `${baseUrl}/api/v2/media?${query.toString()}`;
}
