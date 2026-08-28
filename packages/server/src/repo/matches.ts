import { desc } from 'drizzle-orm'
import type { MatchRecord, MatchSummary } from '@lga/shared'
import type { Db } from '../db/client.js'
import { matchPlayers, matches } from '../db/schema.js'
import { MAX_PLAYERS, evictPlayers, playerKey, upsertPlayers } from './players.js'

export interface RecordMatchOptions {
  /** Diturunkan di test supaya eviction bisa dibuktikan tanpa 20.001 baris (P7). */
  evictLimit?: number
}

/**
 * Menulis hasil satu match sekaligus: player, match, match_players, lalu eviction.
 *
 * Semuanya dalam satu transaksi karena hasil separuh jadi lebih buruk daripada tidak ada
 * hasil sama sekali — sebuah baris `matches` tanpa `match_players`-nya akan terlihat
 * seperti match yang tidak dimainkan siapa pun, selamanya.
 *
 * Ini satu-satunya tulisan yang terjadi sepanjang hidup sebuah match (P4).
 */
export async function recordMatch(
  db: Db,
  record: MatchRecord,
  opts: RecordMatchOptions = {},
): Promise<{ matchId: number }> {
  const evictLimit = opts.evictLimit ?? MAX_PLAYERS

  return db.transaction(async (tx) => {
    const ids = await upsertPlayers(tx, record.players, record.endedAtMs, 'match')

    const [inserted] = await tx
      .insert(matches)
      .values({
        gameId: record.gameId,
        startedAt: new Date(record.startedAtMs),
        endedAt: new Date(record.endedAtMs),
        winnerSide: record.winnerSide,
        roundsWonA: record.roundsWonA,
        roundsWonB: record.roundsWonB,
        durationMs: Math.max(0, record.endedAtMs - record.startedAtMs),
        totalFighters: record.totalFighters,
      })
      .returning({ id: matches.id })

    if (inserted === undefined) throw new Error('match insert returned no row')
    const matchId = inserted.id

    if (record.players.length > 0) {
      await tx.insert(matchPlayers).values(
        record.players.map((player) => {
          const playerId = ids.get(playerKey(player.platform, player.username))
          if (playerId === undefined) {
            throw new Error(`no id was returned for ${player.platform}:${player.username}`)
          }
          return {
            matchId,
            playerId,
            side: player.side,
            kills: player.kills,
            deaths: player.deaths,
          }
        }),
      )
    }

    await evictPlayers(tx, evictLimit)
    return { matchId }
  })
}

/**
 * Riwayat match terbaru, terbaru dulu.
 *
 * `id` menurun sebagai pemecah seri — alasan yang sama dengan `topPlayers`: dua match yang
 * mulai pada milidetik yang sama akan bertukar tempat antar-request dan papannya berkedip.
 *
 * Timestamp diubah jadi angka DI SINI, bukan di client. Drizzle mengembalikan `Date`, dan
 * `JSON.stringify` mengubahnya jadi string ISO — `MatchSummary` akan berbohong begitu ia
 * melewati kabel.
 */
export async function recentMatches(db: Db, limit: number): Promise<MatchSummary[]> {
  const rows = await db
    .select({
      id: matches.id,
      startedAt: matches.startedAt,
      winnerSide: matches.winnerSide,
      roundsWonA: matches.roundsWonA,
      roundsWonB: matches.roundsWonB,
      durationMs: matches.durationMs,
      totalFighters: matches.totalFighters,
    })
    .from(matches)
    .orderBy(desc(matches.startedAt), desc(matches.id))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    startedAtMs: row.startedAt.getTime(),
    // Kolomnya `text`, jadi Drizzle mengetiknya `string | null`. Yang menulisnya hanya
    // `recordMatch`, yang sudah menolak nilai selain 'a' | 'b' | null di lapisan route.
    winnerSide: row.winnerSide as 'a' | 'b' | null,
    roundsWonA: row.roundsWonA,
    roundsWonB: row.roundsWonB,
    durationMs: row.durationMs,
    totalFighters: row.totalFighters,
  }))
}
