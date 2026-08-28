import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { MatchPlayerRecord, PlayerProgress } from '@lga/shared'
import type { Db } from '../db/client.js'
import { MAX_PLAYERS, evictPlayers, topPlayers, upsertPlayers } from './players.js'
import { describeDb, freshDb, truncateAll } from './testing.js'

const player = (username: string, over: Partial<MatchPlayerRecord> = {}): MatchPlayerRecord => ({
  platform: 'tiktok',
  username,
  avatarUrl: null,
  side: 'a',
  kills: 0,
  deaths: 0,
  ...over,
})

const progress = (username: string, over: Partial<PlayerProgress> = {}): PlayerProgress => ({
  platform: 'tiktok',
  username,
  avatarUrl: null,
  kills: 0,
  deaths: 0,
  giftCoins: 0,
  ...over,
})

describeDb('players repo', () => {
  // Dibuat di beforeAll, bukan saat kolektor berjalan: `describe.skip` tetap memanggil
  // factory suite-nya untuk mengumpulkan nama test, tapi TIDAK menjalankan hook-nya.
  // Membangun koneksi di badan suite akan melempar di mesin tanpa DATABASE_URL.
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

  const at = (ms: number) => ms

  it('inserts a player that has never been seen', async () => {
    const ids = await upsertPlayers(
      db,
      [progress('budi', { avatarUrl: 'https://x/a.jpg', kills: 3, deaths: 1 })],
      at(1_000),
      'progress',
    )

    expect(ids.size).toBe(1)
    const [row] = await topPlayers(db, 10)
    expect(row?.username).toBe('budi')
    expect(row?.kills).toBe(3)
    expect(row?.deaths).toBe(1)
  })

  it('accumulates stats when the same player returns', async () => {
    await upsertPlayers(db, [progress('budi', { kills: 3, deaths: 1 })], at(1_000), 'progress')
    await upsertPlayers(db, [progress('budi', { kills: 2, deaths: 4 })], at(2_000), 'progress')

    const [row] = await topPlayers(db, 10)
    expect(row?.kills).toBe(5)
    expect(row?.deaths).toBe(5)
  })

  /*
   * Dua penulis, dua kepemilikan kolom (spec Plan 13 §3).
   *
   * Satu mode yang melakukan keduanya berarti tiap kill dihitung dua kali — sekali oleh
   * flush berkala, sekali lagi saat match berakhir.
   */
  it('mode progress menjumlahkan penghitung tanpa menyentuh gamesPlayed', async () => {
    await upsertPlayers(db, [progress('budi', { kills: 2, giftCoins: 100 })], at(1_000), 'progress')
    await upsertPlayers(db, [progress('budi', { kills: 3, giftCoins: 50 })], at(2_000), 'progress')

    const [row] = await topPlayers(db, 10)
    expect(row).toMatchObject({ username: 'budi', kills: 5, giftCoins: 150, gamesPlayed: 0 })
  })

  it('mode match menaikkan gamesPlayed tanpa menyentuh penghitung', async () => {
    await upsertPlayers(db, [progress('budi', { kills: 7, giftCoins: 900 })], at(1_000), 'progress')
    await upsertPlayers(db, [player('budi', { kills: 4, deaths: 2 })], at(2_000), 'match')

    const [row] = await topPlayers(db, 10)
    expect(row).toMatchObject({ username: 'budi', kills: 7, deaths: 0, giftCoins: 900, gamesPlayed: 1 })
  })

  it('mode match yang menemui pemain baru tidak menulis kill match itu ke total', async () => {
    await upsertPlayers(db, [player('siti', { kills: 4, deaths: 2 })], at(1_000), 'match')

    const [row] = await topPlayers(db, 10)
    expect(row).toMatchObject({ username: 'siti', kills: 0, deaths: 0, gamesPlayed: 1 })
  })

  it('refreshes the avatar but never blanks it with a null', async () => {
    await upsertPlayers(db, [player('budi', { avatarUrl: 'https://x/old.jpg' })], at(1_000), 'match')
    await upsertPlayers(db, [player('budi', { avatarUrl: 'https://x/new.jpg' })], at(2_000), 'match')
    await upsertPlayers(db, [player('budi', { avatarUrl: null })], at(3_000), 'match')

    const [row] = await topPlayers(db, 10)
    expect(row?.avatarUrl).toBe('https://x/new.jpg')
  })

  it('returns one id per distinct player, keyed by platform and username', async () => {
    const ids = await upsertPlayers(db, [player('budi'), player('siti', { side: 'b' })], at(1_000), 'match')

    expect([...ids.keys()].sort()).toEqual(['tiktok:budi', 'tiktok:siti'])
    expect(new Set(ids.values()).size).toBe(2)
  })

  it('orders the leaderboard by kills and honours the limit', async () => {
    await upsertPlayers(
      db,
      [
        progress('low', { kills: 1 }),
        progress('high', { kills: 9 }),
        progress('mid', { kills: 5 }),
      ],
      at(1_000),
      'progress',
    )

    const rows = await topPlayers(db, 2)
    expect(rows.map((row) => row.username)).toEqual(['high', 'mid'])
  })

  it('menumpuk koin gift lintas flush', async () => {
    await upsertPlayers(db, [progress('andi', { giftCoins: 100 })], at(1_000), 'progress')
    await upsertPlayers(db, [progress('andi', { giftCoins: 50 })], at(2_000), 'progress')
    const [row] = await topPlayers(db, 10, 'coins')
    expect(row?.giftCoins).toBe(150)
  })

  it('mengurutkan berdasarkan koin saat diminta', async () => {
    await upsertPlayers(
      db,
      [progress('andi', { kills: 9, giftCoins: 1 }), progress('budi', { kills: 0, giftCoins: 900 })],
      at(1_000),
      'progress',
    )
    expect((await topPlayers(db, 10, 'coins')).map((row) => row.username)).toEqual(['budi', 'andi'])
    expect((await topPlayers(db, 10, 'kills')).map((row) => row.username)).toEqual(['andi', 'budi'])
  })

  it('evicts the least recently seen players beyond the limit (Req 21 AC3)', async () => {
    for (const [index, username] of ['oldest', 'middle', 'newest'].entries()) {
      await upsertPlayers(db, [player(username)], at(1_000 + index * 1_000), 'match')
    }

    const removed = await evictPlayers(db, 2)

    expect(removed).toBe(1)
    const remaining = (await topPlayers(db, 10)).map((row) => row.username).sort()
    expect(remaining).toEqual(['middle', 'newest'])
  })

  it('evicts nothing when the population fits under the limit', async () => {
    await upsertPlayers(db, [player('budi')], at(1_000), 'match')
    expect(await evictPlayers(db, 2)).toBe(0)
  })

  it('caps production eviction at twenty thousand players', () => {
    expect(MAX_PLAYERS).toBe(20_000)
  })
})
