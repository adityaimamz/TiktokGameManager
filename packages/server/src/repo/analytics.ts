import type { AnalyticsEvent } from '@lga/shared'
import type { Db } from '../db/client.js'
import { analyticsEvents } from '../db/schema.js'

/** Satu `INSERT` untuk seluruh batch; logger di client sudah menumpuknya lebih dulu. */
export async function insertAnalytics(
  db: Db,
  events: readonly AnalyticsEvent[],
  matchId: number | null,
): Promise<number> {
  if (events.length === 0) return 0
  await db.insert(analyticsEvents).values(
    events.map((event) => ({
      matchId,
      type: event.type,
      payload: event.payload,
      createdAt: new Date(event.atMs),
    })),
  )
  return events.length
}
