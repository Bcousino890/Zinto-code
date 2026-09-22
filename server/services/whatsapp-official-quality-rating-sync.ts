/**
 * Periodic refresh of Meta's `quality_rating`/`messaging_limit_tier` for
 * WhatsApp official channel connections (CRM API v2 parity plan, Fase 2,
 * item 3). Meta already exposes this for embedded-signup ("Meta partner")
 * numbers via a one-time fetch at connection time
 * (whatsapp-meta-partner.ts:~732), but the official channel never fetched
 * it at all, and nothing refreshed it periodically for either channel type
 * — this is the first scheduler for either. Mirrors
 * template-status-sync.ts's shape (fetch, compare, update-if-changed,
 * start/stop scheduler) for the same reason: same failure modes (a
 * connection missing its access token, a transient Meta API error), same
 * established fix.
 *
 * Stored in `channelConnections.connectionData` (the existing jsonb bag
 * already holding wabaId/accessToken/phoneNumberId for this channel type)
 * rather than a new column — no schema migration needed, same convention
 * flagged already-acceptable in the Fase 1 item 1 handoff notes.
 */

import { db } from '../db';
import { channelConnections } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import axios from 'axios';
import { logger } from '../utils/logger';
import { normalizeQualityRatingResponse, type FetchedQualityRating } from './whatsapp-quality-rating-parsing';

const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';
const WHATSAPP_API_VERSION = 'v23.0';

// Quality rating/tier change at most a few times a day on Meta's side
// (their own docs describe it as a rolling daily evaluation) — hourly is
// frequent enough to stay current without hammering the Graph API rate
// limit across every official connection on the platform.
const SYNC_INTERVAL = 60 * 60 * 1000;

async function fetchPhoneQualityRating(phoneNumberId: string, accessToken: string): Promise<FetchedQualityRating | null> {
  try {
    const url = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}?fields=quality_rating,messaging_limit_tier`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      timeout: 10000,
    });
    return normalizeQualityRatingResponse(response.data);
  } catch (error: any) {
    logger.error('whatsapp-official-quality-rating-sync', 'Error fetching quality rating', {
      phoneNumberId,
      error: error.response?.data || error.message,
    });
    return null;
  }
}

// Guards against two runs overlapping (a hung/slow Graph API, or enough
// connections that one pass takes longer than SYNC_INTERVAL) — without
// this, two concurrent passes could both be mid-loop over the same
// connection, doubling Graph API calls for no benefit. The per-row write
// below is a scoped jsonb merge (safe to run twice), so this is a
// resource-usage guard, not a correctness requirement — but it's free and
// removes any doubt.
let syncInProgress = false;

/** Refreshes quality_rating/messaging_limit_tier for every active WhatsApp official connection. */
export async function syncQualityRatings(): Promise<void> {
  if (syncInProgress) {
    logger.info('whatsapp-official-quality-rating-sync', 'Skipping — a previous sync run is still in progress');
    return;
  }
  syncInProgress = true;
  try {
    const connections = await db
      .select()
      .from(channelConnections)
      .where(and(
        eq(channelConnections.channelType, 'whatsapp_official'),
        eq(channelConnections.status, 'active'),
      ));

    if (connections.length === 0) {
      logger.info('whatsapp-official-quality-rating-sync', 'No active WhatsApp official connections to sync');
      return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    for (const connection of connections) {
      const connectionData = connection.connectionData as any;
      const accessToken = connectionData?.accessToken || connection.accessToken;
      const phoneNumberId = connectionData?.phoneNumberId;

      if (!accessToken || !phoneNumberId) {
        continue;
      }

      const fetched = await fetchPhoneQualityRating(phoneNumberId, accessToken);
      if (!fetched) {
        errorCount++;
        continue;
      }

      if (connectionData?.qualityRating === fetched.qualityRating && connectionData?.messagingLimitTier === fetched.messagingLimitTier) {
        continue;
      }

      try {
        // A scoped jsonb merge (COALESCE + ||) rather than spreading the
        // in-memory `connectionData` snapshot back — that snapshot is from
        // the batch SELECT above and can be stale by the time a slow,
        // sequential loop reaches this row. Merging at the DB level against
        // whatever the row's current value actually is avoids reverting a
        // concurrent write to wabaId/accessToken/phoneNumberId (the same
        // jsonb bag) made after this job's initial read.
        await db
          .update(channelConnections)
          .set({
            connectionData: sql`COALESCE(${channelConnections.connectionData}, '{}') || ${JSON.stringify({
              qualityRating: fetched.qualityRating,
              messagingLimitTier: fetched.messagingLimitTier,
            })}`,
          })
          .where(eq(channelConnections.id, connection.id));

        updatedCount++;
      } catch (error: any) {
        // Isolated per-connection: one DB error (transient PG error,
        // deadlock, dropped connection) must not abort the rest of the
        // batch the way an uncaught throw here would.
        logger.error('whatsapp-official-quality-rating-sync', 'Error persisting quality rating', {
          connectionId: connection.id,
          error: error.message,
        });
        errorCount++;
        continue;
      }

      // Same pacing as template-status-sync.ts — spreads Graph API calls out
      // instead of bursting them across every connection at once.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info('whatsapp-official-quality-rating-sync', 'Quality rating sync completed', {
      total: connections.length,
      updated: updatedCount,
      errors: errorCount,
    });
  } catch (error: any) {
    logger.error('whatsapp-official-quality-rating-sync', 'Error in quality rating sync', {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    syncInProgress = false;
  }
}

export function startWhatsAppOfficialQualityRatingSync(): NodeJS.Timeout {
  logger.info('whatsapp-official-quality-rating-sync', 'Starting WhatsApp official quality rating sync scheduler', {
    intervalMinutes: SYNC_INTERVAL / 60000,
  });

  syncQualityRatings().catch((error) => {
    logger.error('whatsapp-official-quality-rating-sync', 'Error in initial sync', { error: error.message });
  });

  return setInterval(() => {
    syncQualityRatings().catch((error) => {
      logger.error('whatsapp-official-quality-rating-sync', 'Error in scheduled sync', { error: error.message });
    });
  }, SYNC_INTERVAL);
}

export function stopWhatsAppOfficialQualityRatingSync(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  logger.info('whatsapp-official-quality-rating-sync', 'Stopped WhatsApp official quality rating sync scheduler');
}
