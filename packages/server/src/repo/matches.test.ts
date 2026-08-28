import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { MatchRecord } from '@lga/shared'
import type { Db } from '../db/client.js'
import { recentMatches, recordMatch } from './matches.js'
import { topPlayers } from './players.js'
import { describeDb, freshDb, truncateAll } from './testing.js'

const record = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  gameId: 'battle-arena',
  startedAtMs: 1_700_000_000_000,
  endedAtMs: 1_700_000_060_000,
  winnerSide: 'a',
  roundsWonA: 3,
  roundsWonB: 1,
  totalFighters: 2,
  players: [
    { platform: 'tiktok', username: 'budi', avatarUrl: null, side: 'a', kills: 7, deaths: 2 },
    { platform: 'tiktok', username: 'siti', avatarUrl: null, side: 'b', kills: 2, deaths: 7 },
  ],
  ...overrides,
})

describeDb('recordMatch', () => {
  let db: Db

  beforeAll(() => {
    db = freshDb()
  })

  beforeEach(async () => {
    await truncateAll(db)
  })

  afterAll(async () => {
    await truncateAll(db)
  })

  const countOf = async (table: string): Promise<number> => {
    const result = await db.execute(sql.raw(`select count(*)::int as n from ${table}`))
    return (result.rows[0] as { n: number }).n
  }

  it('writes the match row with its outcome and duration', async () => {
    const { matchId } = await recordMatch(db, record())

    expect(matchId).toBeGreaterThan(0)
    const result = await db.execute(sql`select * from matches where id = ${matchId}`)
    const row = result.rows[0] as Record<string, unknown>
    expect(row['game_id']).toBe('battle-arena')
    expect(row['winner_side']).toBe('a')
    expect(row['rounds_won_a']).toBe(3)
    expect(row['duration_ms']).toBe(60_000)
    expect(row['total_fighters']).toBe(2)
  })

  it('writes one match_players row per participant', async () => {
    await recordMatch(db, record())
    expect(await countOf('match_players')).toBe(2)
  })

  /*
   * Jalur match menghitung PENAMPILAN, bukan kill (spec Plan 13 §3).
   *
   * Kill per match tetap tersimpan — di `match_players`, yang diperiksa test lain di berkas
   * ini. Yang TIDAK lagi dilakukan di sini adalah menjumlahkannya ke total sepanjang masa:
   * itu milik `POST /api/players/progress`, dan menaikkannya di dua tempat berarti tiap kill
   * dihitung dua kali.
   */
  it('menghitung penampilan pemain yang sama lintas dua match', async () => {
    await recordMatch(db, record())
    await recordMatch(db, record())

    // Dicari namanya, bukan diambil baris pertama: dengan seluruh kill nol, urutan papan
    // jatuh ke pemecah seri `id desc` dan "teratas" tidak berarti apa-apa lagi di sini.
    const budi = (await topPlayers(db, 10)).find((row) => row.username === 'budi')
    expect(budi?.gamesPlayed).toBe(2)
    expect(budi?.kills).toBe(0)
    expect(await countOf('matches')).toBe(2)
  })

  it('records a match with no real viewers, leaving match_players empty', async () => {
    const { matchId } = await recordMatch(db, record({ players: [], totalFighters: 12 }))

    expect(matchId).toBeGreaterThan(0)
    expect(await countOf('matches')).toBe(1)
    expect(await countOf('match_players')).toBe(0)
    expect(await countOf('players')).toBe(0)
  })

  it('accepts a drawn match with no winner', async () => {
    const { matchId } = await recordMatch(db, record({ winnerSide: null }))
    const result = await db.execute(sql`select winner_side from matches where id = ${matchId}`)
    expect((result.rows[0] as { winner_side: string | null }).winner_side).toBeNull()
  })

  it('evicts stale players and takes their match_players rows with them', async () => {
    await recordMatch(db, record())
    await recordMatch(
      db,
      record({
        players: [
          { platform: 'tiktok', username: 'agus', avatarUrl: null, side: 'a', kills: 1, deaths: 0 },
        ],
      }),
      { evictLimit: 1 },
    )

    const remaining = await topPlayers(db, 10)
    expect(remaining.map((row) => row.username)).toEqual(['agus'])
    // budi dan siti ikut hilang dari match_players lewat cascade, bukan lewat query kedua.
    expect(await countOf('match_players')).toBe(1)
  })

  it('leaves nothing behind when the write fails midway', async () => {
    // Sebuah username 100.000 karakter TERNYATA tidak ditolak Postgres: teks berulang
    // seperti itu di-TOAST-compress begitu kecil sehingga tetap muat di batas ukuran
    // baris indeks btree. Pemicu kegagalan diganti dengan sesuatu yang pasti ditolak:
    // `gameId` NOT NULL di skema, dilewatkan sebagai null lewat cast. Ini menolak di
    // langkah insert match — setelah kedua player di atas sudah berhasil di-upsert.
    const broken = record({
      players: [
        { platform: 'tiktok', username: 'budi', avatarUrl: null, side: 'a', kills: 1, deaths: 0 },
        { platform: 'tiktok', username: 'siti', avatarUrl: null, side: 'b', kills: 1, deaths: 0 },
      ],
      gameId: null as unknown as string,
    })

    await expect(recordMatch(db, broken)).rejects.toThrow()
    expect(await countOf('matches')).toBe(0)
    expect(await countOf('players')).toBe(0)
  })
})

describeDb('recentMatches', () => {
  let db: Db

  beforeAll(() => {
    db = freshDb()
  })

  beforeEach(async () => {
    await truncateAll(db)
  })

  afterAll(async () => {
    await truncateAll(db)
  })

  /** Durasi ikut bergeser bersama waktu mulai; kalau tidak, `endedAtMs` tertinggal di
   *  masa lalu dan `recordMatch` menulis durasi 0 lewat `Math.max`. */
  const at = (startedAtMs: number): MatchRecord =>
    record({ startedAtMs, endedAtMs: startedAtMs + 60_000, players: [] })

  it('returns the newest match first', async () => {
    await recordMatch(db, at(1_700_000_000_000))
    await recordMatch(db, at(1_700_000_600_000))

    const rows = await recentMatches(db, 10)

    expect(rows.map((row) => row.startedAtMs)).toEqual([1_700_000_600_000, 1_700_000_000_000])
  })

  it('returns milliseconds, not Date objects, so the wire keeps its promise', async () => {
    await recordMatch(db, at(1_700_000_000_000))

    const [row] = await recentMatches(db, 10)

    expect(typeof row?.startedAtMs).toBe('number')
  })

  it('honours the limit', async () => {
    await recordMatch(db, at(1_700_000_000_000))
    await recordMatch(db, at(1_700_000_600_000))

    expect(await recentMatches(db, 1)).toHaveLength(1)
  })

  it('carries every field a history row needs', async () => {
    await recordMatch(
      db,
      record({
        startedAtMs: 1_700_000_000_000,
        endedAtMs: 1_700_000_060_000,
        winnerSide: null,
        roundsWonA: 2,
        roundsWonB: 2,
        totalFighters: 9,
        players: [],
      }),
    )

    const [row] = await recentMatches(db, 10)

    expect(row?.winnerSide).toBeNull()
    expect(row?.roundsWonA).toBe(2)
    expect(row?.roundsWonB).toBe(2)
    expect(row?.durationMs).toBe(60_000)
    expect(row?.totalFighters).toBe(9)
  })
})
