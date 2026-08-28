import type { Db } from '../db/client.js'
import { insertAnalytics } from './analytics.js'
import { allGifts, saveGifts } from './gifts.js'
import { recentMatches, recordMatch } from './matches.js'
import { recordProgress, topPlayers } from './players.js'
import type { Repos } from './types.js'

/** Merakit fungsi-fungsi repository menjadi satu objek yang route bisa pegang. */
export function createRepos(db: Db): Repos {
  return {
    recordMatch: (record) => recordMatch(db, record),
    // Jam dibaca di sini, bukan di dalam repo: lapisan repo tetap bisa diuji tanpa jam dinding.
    recordProgress: (entries) => recordProgress(db, entries, Date.now()),
    recentMatches: (limit) => recentMatches(db, limit),
    topPlayers: (limit, sort) => topPlayers(db, limit, sort),
    recordAnalytics: (events, matchId) => insertAnalytics(db, events, matchId),
    saveGifts: (entries) => saveGifts(db, entries),
    allGifts: () => allGifts(db),
  }
}

export type { Repos } from './types.js'
