import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeQualityRatingResponse } from '../../server/services/whatsapp-quality-rating-parsing';

test('normalizes a well-formed Meta response, lowercasing quality_rating', () => {
  assert.deepEqual(
    normalizeQualityRatingResponse({ quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K' }),
    { qualityRating: 'green', messagingLimitTier: 'TIER_1K' },
  );
});

test('defaults quality_rating to "unknown" when Meta omits it, and messagingLimitTier to null', () => {
  assert.deepEqual(normalizeQualityRatingResponse({}), { qualityRating: 'unknown', messagingLimitTier: null });
});

test('tolerates a malformed response (non-string fields, null, undefined) without throwing', () => {
  assert.deepEqual(normalizeQualityRatingResponse({ quality_rating: 42, messaging_limit_tier: null }), { qualityRating: 'unknown', messagingLimitTier: null });
  assert.deepEqual(normalizeQualityRatingResponse(null), { qualityRating: 'unknown', messagingLimitTier: null });
  assert.deepEqual(normalizeQualityRatingResponse(undefined), { qualityRating: 'unknown', messagingLimitTier: null });
});

test('preserves messaging_limit_tier casing (Meta\'s own convention, unlike quality_rating)', () => {
  assert.deepEqual(
    normalizeQualityRatingResponse({ quality_rating: 'yellow', messaging_limit_tier: 'TIER_10K' }),
    { qualityRating: 'yellow', messagingLimitTier: 'TIER_10K' },
  );
});
