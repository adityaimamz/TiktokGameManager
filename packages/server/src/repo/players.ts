import { desc, sql } from 'drizzle-orm'
import type { MatchPlayerRecord, PlayerStats } from '@lga/shared'
import type { Db } from '../db/client.js'
import { players } from '../db/schema.js'

/** Req 21 AC3. Parameter di `evictPlayers` supaya test tidak perlu menulis 20.001 baris. */
export const MAX_PLAYERS = 20_000

/** Sesuatu yang bisa dipakai seperti `Db` — juga berlaku untuk transaksi. */
type Queryable = Pick<Db, 'insert' | 'select' | 'execute'>

export function playerKey(platform: string, username: string): string {
  return `${platform}:${username}`
}

/**
 * Menyisipkan atau menaikkan statistik pemain, lalu mengembalikan id tiap orang.
 *
 * Satu `INSERT … ON CONFLICT DO UPDATE` untuk seluruh daftar, bukan satu query per orang:
 * sebuah match dengan 200 viewer tidak boleh berarti 200 round-trip ke Neon.
 *
 * `avatarUrl` yang `null` tidak menimpa yang sudah tersimpan — event TikTok kadang datang
 * tanpa avatar, dan kehilangan gambar karena satu event pelit adalah regresi yang terlihat.
 */
export async function upsertPlayers(
  db: Queryable,
  entries: readonly MatchPlayerRecord[],
  nowMs: number,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  if (entries.length === 0) return ids

  const seenAt = new Date(nowMs)
  const rows = await db
    .insert(players)
    .values(
      entries.map((entry) => ({
        platform: entry.platform,
        username: entry.username,
        avatarUrl: entry.avatarUrl,
        kills: entry.kills,
        deaths: entry.deaths,
        gamesPlayed: 1,
        giftCoins: entry.giftCoins,
        lastSeenAt: seenAt,
      })),
    )
    .onConflictDoUpdate({
      target: [players.platform, players.username],
      set: {
        kills: sql`${players.kills} + excluded.kills`,
        deaths: sql`${players.deaths} + excluded.deaths`,
        gamesPlayed: sql`${players.gamesPlayed} + 1`,
        giftCoins: sql`${players.giftCoins} + excluded.gift_coins`,
        avatarUrl: sql`coalesce(excluded.avatar_url, ${players.avatarUrl})`,
        lastSeenAt: seenAt,
      },
    })
    .returning({ id: players.id, platform: players.platform, username: players.username })

  for (const row of rows) ids.set(playerKey(row.platform, row.username), row.id)
  return ids
}

/**
 * Membuang pemain di luar `limit` yang paling baru terlihat, mengembalikan jumlah terhapus.
 *
 * Baris `match_players` mereka ikut terhapus lewat `on delete cascade` di skema — bukan
 * lewat query kedua di sini, supaya keduanya tidak bisa berbeda pendapat.
 */
export async function evictPlayers(db: Queryable, limit: number): Promise<number> {
  const result = await db.execute(sql`
    delete from players
    where id not in (
      select id from players order by last_seen_at desc, id desc limit ${limit}
    )
  `)
  return result.rowCount ?? 0
}

export type PlayerSort = 'kills' | 'coins'

export async function topPlayers(
  db: Db,
  limit: number,
  sort: PlayerSort = 'kills',
): Promise<PlayerStats[]> {
  const rows = await db
    .select({
      platform: players.platform,
      username: players.username,
      avatarUrl: players.avatarUrl,
      kills: players.kills,
      deaths: players.deaths,
      gamesPlayed: players.gamesPlayed,
      giftCoins: players.giftCoins,
    })
    .from(players)
    // Id menurun sebagai pemecah seri di kedua urutan: tanpa itu dua pemain berimbang
    // bertukar tempat antar-request dan papan terlihat berkedip.
    .orderBy(sort === 'coins' ? desc(players.giftCoins) : desc(players.kills), desc(players.id))
    .limit(limit)
  return rows
}
