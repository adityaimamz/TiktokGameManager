import type {
  AnalyticsEvent,
  GiftCatalogEntry,
  MatchRecord,
  MatchSummary,
  PlayerStats,
} from '@lga/shared'
import type { PlayerSort } from './players.js'

/**
 * Segala yang route butuhkan dari database.
 *
 * Route tidak pernah menyentuh Drizzle langsung. Itu yang membuat setiap route bisa
 * diuji lawan implementasi palsu, sementara SQL sungguhannya diuji terpisah lawan Neon.
 */
export interface Repos {
  recordMatch(record: MatchRecord): Promise<{ matchId: number }>
  recentMatches(limit: number): Promise<MatchSummary[]>
  topPlayers(limit: number, sort: PlayerSort): Promise<PlayerStats[]>
  recordAnalytics(events: AnalyticsEvent[], matchId: number | null): Promise<number>
  saveGifts(entries: readonly GiftCatalogEntry[]): Promise<number>
  allGifts(): Promise<GiftCatalogEntry[]>
}
