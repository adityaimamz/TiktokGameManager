import { beforeEach, describe, expect, it } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import {
  createBattleArenaState,
  recordSessionGift,
  resetMatch,
  roundsNeeded,
  startNewRound,
  topSessionGifters,
} from '../../../src/games/battle-arena/state.js'
import { fireProjectile } from '../../../src/games/battle-arena/projectiles.js'
import { spawnGameEffect } from '../../../src/games/battle-arena/effects.js'

const gameplay = defaultConfig().gameplay

const makeState = () => createBattleArenaState({ rng: createRng(7), clock: createManualClock() })

describe('roundsNeeded', () => {
  it('is a simple majority of the best-of count', () => {
    expect(roundsNeeded(1)).toBe(1)
    expect(roundsNeeded(3)).toBe(2)
    expect(roundsNeeded(5)).toBe(3)
    expect(roundsNeeded(7)).toBe(4)
  })
})

describe('createBattleArenaState', () => {
  it('starts idle with an empty scoreboard', () => {
    const state = makeState()
    expect(state.matchState).toBe('idle')
    expect(state.tick).toBe(0)
    expect(state.roundIndex).toBe(0)
    expect(state.roundScore).toEqual({ a: 0, b: 0, c: 0, d: 0 })
    expect(state.roundsWon).toEqual({ a: 0, b: 0, c: 0, d: 0 })
    expect(state.roundWinner).toBeNull()
    expect(state.matchWinner).toBeNull()
    expect(state.fighters.count).toBe(0)
  })

  it('pre-allocates the projectile and effect pools', () => {
    const state = makeState()
    expect(state.projectiles.capacity).toBe(500)
    expect(state.effects.capacity).toBeGreaterThanOrEqual(200)
  })
})

describe('startNewRound', () => {
  beforeEach(() => resetEntityIds())

  it('advances the round, clears the kill score and revives everyone', () => {
    const state = makeState()
    const a = state.fighters.join({ platform: 'tiktok', username: 'a1', avatarUrl: null }, 'a', gameplay).fighter
    if (a === null) throw new Error('expected a fighter')
    a.alive = false
    a.hp = 0
    a.kills = 4
    state.roundScore.a = 30
    state.roundWinner = 'a'

    startNewRound(state, gameplay)

    expect(state.roundIndex).toBe(1)
    expect(state.roundScore).toEqual({ a: 0, b: 0, c: 0, d: 0 })
    expect(state.roundWinner).toBeNull()
    expect(a.alive).toBe(true)
    expect(a.hp).toBe(a.maxHp)
    expect(a.kills).toBe(4)
  })

  it('clears projectiles and effects left over from the previous round', () => {
    const state = makeState()
    const a = state.fighters.join({ platform: 'tiktok', username: 'a1', avatarUrl: null }, 'a', gameplay).fighter
    const b = state.fighters.join({ platform: 'tiktok', username: 'b1', avatarUrl: null }, 'b', gameplay).fighter
    if (a === null || b === null) throw new Error('expected two fighters')
    fireProjectile(state.projectiles, a, b)
    spawnGameEffect(state.effects, defaultConfig(), { type: 'hit', x: 1, y: 1 })

    startNewRound(state, gameplay)

    expect(state.projectiles.activeCount).toBe(0)
    expect(state.effects.activeCount).toBe(0)
  })

  it('keeps the rounds already won', () => {
    const state = makeState()
    state.roundsWon.b = 2
    startNewRound(state, gameplay)
    expect(state.roundsWon).toEqual({ a: 0, b: 2, c: 0, d: 0 })
  })
})

describe('resetMatch', () => {
  beforeEach(() => resetEntityIds())

  it('empties the arena and puts every counter back to zero', () => {
    const state = makeState()
    state.fighters.join({ platform: 'tiktok', username: 'a1', avatarUrl: null }, 'a', gameplay)
    state.roundScore.a = 12
    state.roundsWon.a = 2
    state.roundIndex = 3
    state.roundWinner = 'a'
    state.matchWinner = 'a'
    state.tick = 900

    resetMatch(state, gameplay)

    expect(state.fighters.count).toBe(0)
    expect(state.roundScore).toEqual({ a: 0, b: 0, c: 0, d: 0 })
    expect(state.roundsWon).toEqual({ a: 0, b: 0, c: 0, d: 0 })
    expect(state.roundIndex).toBe(0)
    expect(state.roundWinner).toBeNull()
    expect(state.matchWinner).toBeNull()
    expect(state.tick).toBe(0)
    expect(state.projectiles.activeCount).toBe(0)
    expect(state.effects.activeCount).toBe(0)
  })

  it('menahan roster tapi menolkan statistiknya saat keepRoster', () => {
    const state = makeState()
    const f = state.fighters.join({ platform: 'tiktok', username: 'a1', avatarUrl: null }, 'a', gameplay)
      .fighter
    if (f === null) throw new Error('expected a fighter')
    f.kills = 5
    f.deaths = 2
    f.giftCoins = 900
    f.maxHp = 700
    f.alive = false
    state.roundsWon.a = 2

    resetMatch(state, gameplay, true)

    expect(state.fighters.count).toBe(1)
    const kept = state.fighters.get('tiktok:a1')
    expect(kept?.kills).toBe(0)
    expect(kept?.deaths).toBe(0)
    expect(kept?.giftCoins).toBe(0)
    expect(kept?.maxHp).toBe(gameplay.baseHp)
    // Lobi berikutnya menghitung yang HIDUP; roster yang mati semua tidak akan maju.
    expect(kept?.alive).toBe(true)
    expect(state.roundsWon).toEqual({ a: 0, b: 0, c: 0, d: 0 })
  })
})

/**
 * Tally gift SESI — sumber tunggal TOP 5 GIFTERS.
 * Ia menggantikan penyapuan `Fighter.giftCoins` yang salah di tiga cara sekaligus, dan
 * ketiganya dikunci di sini: bertahan lintas match, menerima penonton tanpa fighter, dan
 * tidak bergantung pada urutan `ensureGifterJoined`.
 */
describe('tally gift sesi', () => {
  const gifter = (username: string, avatarUrl: string | null = null) => ({
    platform: 'tiktok',
    username,
    avatarUrl,
  })

  it('menumpuk beberapa gift dari orang yang sama', () => {
    const state = makeState()
    recordSessionGift(state, gifter('andi'), 100)
    recordSessionGift(state, gifter('andi'), 54)

    expect(topSessionGifters(state)).toEqual([
      { username: 'andi', avatarUrl: null, coins: 154 },
    ])
  })

  it('memilih penyumbang terbesar, bukan yang terakhir', () => {
    const state = makeState()
    recordSessionGift(state, gifter('andi'), 6854)
    recordSessionGift(state, gifter('budi'), 104)

    expect(topSessionGifters(state)[0]?.username).toBe('andi')
  })

  it('menghitung penonton yang TIDAK punya fighter sama sekali', () => {
    const state = makeState()
    // Tidak ada satu pun fighter yang didaftarkan; ini persis kasus yang dulu hilang, karena
    // FighterRegistry.addGiftCoins memulangkan pengirim yang belum bergabung.
    recordSessionGift(state, gifter('hakata1368'), 6854)

    expect([...state.fighters.values()]).toHaveLength(0)
    expect(topSessionGifters(state)[0]?.coins).toBe(6854)
  })

  it('memutus seri dengan username supaya kartunya tidak berkedip', () => {
    const state = makeState()
    recordSessionGift(state, gifter('budi'), 50)
    recordSessionGift(state, gifter('andi'), 50)

    expect(topSessionGifters(state)[0]?.username).toBe('andi')
  })

  it('mengurutkan dan membatasi papan pada lima penyumbang teratas', () => {
    const state = makeState()
    recordSessionGift(state, gifter('fajar'), 10)
    recordSessionGift(state, gifter('budi'), 50)
    recordSessionGift(state, gifter('dina'), 30)
    recordSessionGift(state, gifter('andi'), 50)
    recordSessionGift(state, gifter('eka'), 20)
    recordSessionGift(state, gifter('cinta'), 40)

    expect(topSessionGifters(state).map((entry) => entry.username)).toEqual([
      'andi',
      'budi',
      'cinta',
      'dina',
      'eka',
    ])
  })

  it('mengabaikan gift tanpa koin', () => {
    const state = makeState()
    recordSessionGift(state, gifter('andi'), 0)

    expect(topSessionGifters(state)).toEqual([])
  })

  it('mempertahankan avatar lama saat gift berikutnya datang tanpa avatar', () => {
    const state = makeState()
    recordSessionGift(state, gifter('andi', 'https://x.test/a.png'), 10)
    recordSessionGift(state, gifter('andi'), 10)

    expect(topSessionGifters(state)[0]?.avatarUrl).toBe('https://x.test/a.png')
  })

  it('BERTAHAN saat match melingkar ke match berikutnya', () => {
    const state = makeState()
    recordSessionGift(state, gifter('andi'), 6854)

    // keepRoster = match selesai lalu melingkar. Papan gift adalah ucapan terima kasih
    // sepanjang siaran, bukan papan skor match — inilah bug yang membuat TOP GIFTER
    // menampilkan 104 koin sementara panel Gift menampilkan 6.854.
    resetMatch(state, defaultConfig().gameplay, true)

    expect(topSessionGifters(state)[0]?.coins).toBe(6854)
  })

  it('DIHAPUS oleh Reset creator, bersama arenanya', () => {
    const state = makeState()
    recordSessionGift(state, gifter('andi'), 6854)

    resetMatch(state, defaultConfig().gameplay)

    expect(topSessionGifters(state)).toEqual([])
  })
})
