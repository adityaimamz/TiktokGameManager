import { describe, expect, it } from 'vitest'
import { GIFT_SEED } from '@lga/shared'
import type { ChatMessage } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../src/games/battle-arena/config/index.js'
import { matchesSide } from '../../../src/games/battle-arena/triggers.js'
import {
  BattleArenaSimulator,
  CHATTER_SEED,
  REJOIN_DELAY_MAX_MS,
  REJOIN_DELAY_MIN_MS,
  SIMULATOR_JOIN_RATE_PER_SEC,
} from '../../../src/games/battle-arena/simulator.js'

/** Kadens frame produksi: `update()` dipanggil sekali per gambar, bukan sekali per detik. */
const FRAME_MS = 16

const setup = (mutate: (c: BattleArenaConfig) => void = () => {}, seed = 5) => {
  const config = defaultConfig()
  config.sides.a = { ...config.sides.a, keyword: 'messi' }
  config.sides.b = { ...config.sides.b, keyword: 'ronaldo' }
  config.simulation = { commentsPerSecond: 0, likesPerSecond: 0, giftsPerSecond: 0 }
  // Kapasitas arena 5+5 = 10 blob; itulah plafon join simulator sekarang.
  config.gameplay = { ...config.gameplay, maxFightersPerSide: 5 }
  mutate(config)

  const clock = createManualClock(0)
  const messages: ChatMessage[] = []
  const simulator = new BattleArenaSimulator({ rng: createRng(seed), clock, getConfig: () => config })

  /** Menjalankan waktu seperti render loop: banyak frame kecil, bukan satu lompatan besar. */
  const tick = (ms: number, activeDemoFighters = 0): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      clock.advance(FRAME_MS)
      simulator.update(activeDemoFighters)
    }
  }

  const isJoin = (m: ChatMessage): boolean => m.text === 'messi' || m.text === 'ronaldo'

  return {
    config,
    clock,
    messages,
    simulator,
    tick,
    isJoin,
    connect: () => simulator.connect((m) => messages.push(m)),
  }
}

describe('BattleArenaSimulator as a ChatSource', () => {
  it('identifies itself as the demo platform', () => {
    const { simulator } = setup()
    expect(simulator.platform).toBe('demo')
    expect(simulator.id).toBe('battle-arena-simulator')
  })

  it('emits nothing before connect', () => {
    const { simulator, messages, tick } = setup()
    tick(1000)
    expect(simulator.isRunning).toBe(false)
    expect(messages).toEqual([])
  })

  it('stops emitting after disconnect', () => {
    const { simulator, messages, tick, connect } = setup()
    connect()
    tick(1000)
    const emitted = messages.length
    simulator.disconnect()
    tick(1000)
    expect(messages).toHaveLength(emitted)
    expect(simulator.isRunning).toBe(false)
  })
})

describe('BattleArenaSimulator joins', () => {
  it('averages the ramp rate over a long enough run', () => {
    const { messages, tick, connect } = setup((c) => (c.gameplay.maxFightersPerSide = 500))
    connect()
    tick(20_000)

    const expected = SIMULATOR_JOIN_RATE_PER_SEC * 20
    expect(messages.length).toBeGreaterThan(expected * 0.7)
    expect(messages.length).toBeLessThan(expected * 1.3)
  })

  /*
   * Jitter itulah yang membedakan penonton dari metronom, jadi ia diuji langsung: jeda antar
   * join tidak boleh semuanya sama. Tanpa ini, "organik" hanya klaim di komentar kode.
   */
  it('spaces the joins unevenly instead of on a fixed cadence', () => {
    const { messages, tick, connect } = setup((c) => (c.gameplay.maxFightersPerSide = 500))
    connect()
    tick(20_000)

    const gaps = messages.slice(1).map((m, i) => m.timestampMs - (messages[i]?.timestampMs ?? 0))
    expect(new Set(gaps).size).toBeGreaterThan(gaps.length / 2)
  })

  it('stops joining once the arena is at capacity', () => {
    const { messages, tick, connect, isJoin } = setup((c) => (c.simulation.commentsPerSecond = 2))
    connect()
    tick(5000, 10)
    expect(messages.filter(isJoin)).toHaveLength(0)
  })

  /* Aturan barunya: penuh berarti berhenti MENGISI, bukan berhenti bicara. */
  it('keeps the chat alive while the arena is full', () => {
    const { messages, tick, connect } = setup((c) => (c.simulation.commentsPerSecond = 2))
    connect()
    tick(5000, 10)
    expect(messages.length).toBeGreaterThan(4)
  })

  it('joins one of the two configured sides', () => {
    const { messages, tick, connect } = setup()
    connect()
    tick(10_000)
    expect(messages.every((m) => m.text === 'messi' || m.text === 'ronaldo')).toBe(true)
    expect(new Set(messages.map((m) => m.text)).size).toBe(2)
  })

  it('generates unique usernames of three to sixteen alphanumeric characters', () => {
    const { messages, tick, connect } = setup((c) => (c.gameplay.maxFightersPerSide = 500))
    connect()
    tick(20_000)
    expect(messages.length).toBeGreaterThan(30)
    for (const message of messages) {
      expect(message.username).toMatch(/^[a-z0-9]{3,16}$/)
      expect(message.platform).toBe('demo')
      expect(message.kind).toBe('textMessageEvent')
    }
    expect(new Set(messages.map((m) => m.username)).size).toBe(messages.length)
  })

  it('produces the same run twice for the same seed', () => {
    const first = setup((c) => (c.simulation.commentsPerSecond = 1), 99)
    first.connect()
    first.tick(5000)
    const second = setup((c) => (c.simulation.commentsPerSecond = 1), 99)
    second.connect()
    second.tick(5000)
    expect(first.messages.length).toBeGreaterThan(0)
    expect(first.messages.map((m) => `${m.username}:${m.text}`)).toEqual(
      second.messages.map((m) => `${m.username}:${m.text}`),
    )
  })
})

describe('BattleArenaSimulator chatter', () => {
  it('emits ordinary comments alongside the keyword joins', () => {
    const { messages, tick, connect, isJoin } = setup((c) => (c.simulation.commentsPerSecond = 2))
    connect()
    tick(10_000)

    const chatter = messages.filter((m) => m.kind === 'textMessageEvent' && !isJoin(m))
    expect(chatter.length).toBeGreaterThan(8)
    expect(chatter.every((m) => CHATTER_SEED.includes(m.text ?? ''))).toBe(true)
    expect(new Set(chatter.map((m) => m.text)).size).toBeGreaterThan(4)
  })

  /*
   * Keyword sisi bawaan adalah "a" dan "b" dan `matchesSide` mencocokkan per KATA, jadi satu
   * kata satu huruf di CHATTER_SEED sudah cukup untuk mengubah obrolan biasa jadi perintah
   * bergabung — fighter muncul tanpa ada yang memintanya.
   */
  it('never accidentally names a side', () => {
    const sides = defaultConfig().sides
    for (const text of CHATTER_SEED) {
      expect(matchesSide(text, sides.a), text).toBe(false)
      expect(matchesSide(text, sides.b), text).toBe(false)
    }
  })

  it('speaks as viewers that are actually in the room', () => {
    const { messages, tick, connect, isJoin } = setup((c) => (c.simulation.commentsPerSecond = 2))
    connect()
    tick(10_000)

    const joined = messages.filter(isJoin).map((m) => m.username)
    const chatter = messages.filter((m) => m.kind === 'textMessageEvent' && !isJoin(m))
    // Yang pertama boleh saja seorang penonton bisu yang lewat sebelum ada yang bergabung.
    expect(chatter.slice(1).every((m) => joined.includes(m.username))).toBe(true)
  })
})

describe('BattleArenaSimulator likes and gifts', () => {
  it('emits like events near the configured rate, only for viewers that joined', () => {
    const { messages, tick, connect, isJoin } = setup((c) => (c.simulation.likesPerSecond = 2))
    connect()
    tick(10_000)

    const joined = messages.filter(isJoin).map((m) => m.username)
    const likes = messages.filter((m) => m.kind === 'likeEvent')
    expect(likes.length).toBeGreaterThan(8)
    expect(likes.length).toBeLessThan(32)
    expect(likes.every((m) => joined.includes(m.username))).toBe(true)
    expect(likes.every((m) => m.likeCount >= 1)).toBe(true)
  })

  it('emits no likes while nobody has joined yet', () => {
    const { messages, tick, connect } = setup((c) => (c.simulation.likesPerSecond = 5))
    connect()
    // Arena sudah penuh viewer demo, jadi tidak ada yang join lewat simulator ini —
    // dan tanpa viewer yang ia kenal, ia tidak boleh memancarkan like satu pun.
    tick(1000, 10)
    expect(messages).toEqual([])
  })

  it('emits gift events near the configured rate', () => {
    const { messages, tick, connect } = setup((c) => (c.simulation.giftsPerSecond = 1))
    connect()
    tick(10_000)

    const gifts = messages.filter((m) => m.kind === 'giftEvent')
    expect(gifts.length).toBeGreaterThan(4)
    expect(gifts[0]?.giftName).not.toBeNull()
    expect(gifts[0]?.giftCount).toBeGreaterThanOrEqual(1)
  })
})

describe('BattleArenaSimulator rejoins', () => {
  it('sends a viewer back in after two to ten seconds', () => {
    const { messages, simulator, tick, connect } = setup()
    connect()
    simulator.scheduleRejoin('ghost', 'a')

    // Arena sudah penuh, jadi satu-satunya pesan yang mungkin muncul adalah rejoin.
    tick(REJOIN_DELAY_MIN_MS - FRAME_MS, 10)
    expect(messages).toEqual([])

    tick(REJOIN_DELAY_MAX_MS, 10)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.username).toBe('ghost')
    expect(messages[0]?.kind).toBe('textMessageEvent')
  })

  it('menyebut sisi yang sedang ditempati, bukan undian baru', () => {
    // Undian sisi separuh waktunya menyebut sisi lawan, dan `join` menjawabnya `sideFull`
    // begitu sisi seberang penuh — fighter yang mati lalu tidak pernah hidup lagi.
    for (const side of ['a', 'b'] as const) {
      const { messages, simulator, tick, connect, config } = setup()
      connect()
      for (let i = 0; i < 6; i++) simulator.scheduleRejoin(`ghost${i}`, side)
      tick(REJOIN_DELAY_MAX_MS, 10)
      expect(messages).toHaveLength(6)
      for (const m of messages) expect(m.text).toBe(config.sides[side].keyword)
    }
  })

  it('rejoins each viewer only once per death', () => {
    const { messages, simulator, tick, connect } = setup()
    connect()
    simulator.scheduleRejoin('ghost', 'a')
    tick(REJOIN_DELAY_MAX_MS, 10)
    tick(REJOIN_DELAY_MAX_MS, 10)
    expect(messages.filter((m) => m.username === 'ghost')).toHaveLength(1)
  })
})

describe('gift simulator', () => {
  it('mengirim gift dari GIFT_SEED dengan koin sesuai daftarnya', () => {
    const { messages, tick, connect } = setup((c) => (c.simulation.giftsPerSecond = 5))
    connect()
    tick(4000)

    const gifts = messages.filter((m) => m.kind === 'giftEvent')
    expect(gifts.length).toBeGreaterThan(0)
    for (const gift of gifts) {
      const entry = GIFT_SEED.find((g) => g.name === gift.giftName)
      expect(entry).toBeDefined()
      expect(gift.giftCoins).toBe((entry?.coins ?? 0) * gift.giftCount)
    }
  })
})
