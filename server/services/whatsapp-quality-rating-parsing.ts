/**
 * Pure normalization of Meta's phone-number quality_rating/messaging_limit_tier
 * response, extracted out of whatsapp-official-quality-rating-sync.ts so it's
 * unit-testable without importing that file's `db` dependency (server/db.ts
 * throws at import time outside a fully configured server environment — same
 * reasoning as crm-media-url.ts's docstring).
 */

export type FetchedQualityRating = { qualityRating: string; messagingLimitTier: string | null };

export function normalizeQualityRatingResponse(data: any): FetchedQualityRating {
  return {
    qualityRating: typeof data?.quality_rating === 'string' ? data.quality_rating.toLowerCase() : 'unknown',
    messagingLimitTier: typeof data?.messaging_limit_tier === 'string' ? data.messaging_limit_tier : null,
  };
}
