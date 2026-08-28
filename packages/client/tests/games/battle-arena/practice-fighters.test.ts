import { beforeEach, describe, expect, it } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../src/games/battle-arena/config/index.js'
import { FighterRegistry } from '../../../src/games/battle-arena/fighters.js'
import { PRACTICE_MIN_PER_SIDE, PracticeFighters } from '../../../src/games/battle-arena/practice-fighters.js'
import type { ActorIdentity, SideId } from '../../../src/games/battle-arena/types.js'

const setup = () => {
  const config = defaultConfig()
  config.sides.a = { ...config.sides.a, keyword: 'messi' }
  config.sides.b = { ...config.sides.b, keyword: 'ronaldo' }
  const fighters = new FighterRegistry({ rng: createRng(1), clock: createManualClock() })
  const bots = new PracticeFighters()

  const add = (username: string, side: SideId, platform: ActorIdentity['platform'] = 'tiktok') =>
    fighters.join({ platform, username, avatarUrl: null }, side, config.gameplay).fighter

  return { config, fighters, bots, add }
}

/** Menerapkan pesan join yang dihasilkan bots.fill langsung ke registry. */
const applyJoins = (
  messages: ReturnType<PracticeFighters['fill']>,
  fighters: FighterRegistry,
  config: BattleArenaConfig,
): void => {
  for (const message of messages) {
    const side: SideId = message.text === config.sides.a.keyword ? 'a' : 'b'
    fighters.join(
      { platform: message.platform, username: message.username, avatarUrl: message.avatarUrl },
      side,
      config.gameplay,
    )
  }
}

describe('PracticeFighters.fill', () => {
  beforeEach(() => resetEntityIds())

  it('fills both sides up to the minimum when the arena is empty', () => {
    const { bots, fighters, config } = setup()
    const messages = bots.fill(fighters, config, 0)
    expect(messages).toHaveLength(PRACTICE_MIN_PER_SIDE * 2)
    applyJoins(messages, fighters, config)
    expect(fighters.countOnSide('a')).toBe(PRACTICE_MIN_PER_SIDE)
    expect(fighters.countOnSide('b')).toBe(PRACTICE_MIN_PER_SIDE)
  })

  it('marks every bot as the practice platform', () => {
    const { bots, fighters, config } = setup()
    expect(bots.fill(fighters, config, 0).every((m) => m.platform === 'practice')).toBe(true)
  })

  it('joins through the configured keyword of each side', () => {
    const { bots, fighters, config } = setup()
    const texts = new Set(bots.fill(fighters, config, 0).map((m) => m.text))
    expect(texts).toEqual(new Set(['messi', 'ronaldo']))
  })

  it('stamps the message with the time it was generated', () => {
    const { bots, fighters, config } = setup()
    expect(bots.fill(fighters, config, 4321)[0]?.timestampMs).toBe(4321)
  })

  it('counts real fighters towards the minimum', () => {
    const { bots, fighters, config, add } = setup()
    add('real1', 'a')
    add('real2', 'a')
    const messages = bots.fill(fighters, config, 0)
    expect(messages.filter((m) => m.text === 'messi')).toHaveLength(PRACTICE_MIN_PER_SIDE - 2)
    expect(messages.filter((m) => m.text === 'ronaldo')).toHaveLength(PRACTICE_MIN_PER_SIDE)
  })

  it('ignores dead fighters when measuring how empty a side is', () => {
    const { bots, fighters, config, add } = setup()
    const dead = add('real1', 'a')
    if (dead !== null) dead.alive = false
    expect(bots.fill(fighters, config, 0).filter((m) => m.text === 'messi')).toHaveLength(
      PRACTICE_MIN_PER_SIDE,
    )
  })

  it('produces nothing once both sides are full enough', () => {
    const { bots, fighters, config } = setup()
    applyJoins(bots.fill(fighters, config, 0), fighters, config)
    expect(bots.fill(fighters, config, 0)).toEqual([])
  })

  it('never asks for more fighters than the side cap allows', () => {
    const { bots, fighters, config } = setup()
    config.gameplay.maxFightersPerSide = 2
    const messages = bots.fill(fighters, config, 0)
    expect(messages.filter((m) => m.text === 'messi')).toHaveLength(2)
  })

  it('gives every bot a unique username across calls', () => {
    const { bots, fighters, config } = setup()
    const first = bots.fill(fighters, config, 0)
    applyJoins(first, fighters, config)
    fighters.clear()
    const second = bots.fill(fighters, config, 0)
    const names = new Set([...first, ...second].map((m) => m.username))
    expect(names.size).toBe(first.length + second.length)
  })
})

describe('PracticeFighters.releaseOne', () => {
  beforeEach(() => resetEntityIds())

  it('removes exactly one bot from the requested side and reports its key', () => {
    const { bots, fighters, add } = setup()
    add('bot1', 'a', 'practice')
    add('bot2', 'a', 'practice')
    add('bot3', 'b', 'practice')

    const released = bots.releaseOne(fighters, 'a')
    expect(released).toMatch(/^practice:/)
    expect(fighters.countOnSide('a')).toBe(1)
    expect(fighters.countOnSide('b')).toBe(1)
  })

  it('never removes a real viewer', () => {
    const { bots, fighters, add } = setup()
    add('real', 'a')
    expect(bots.releaseOne(fighters, 'a')).toBeNull()
    expect(fighters.countOnSide('a')).toBe(1)
  })

  it('returns null when that side has no bots left', () => {
    const { bots, fighters } = setup()
    expect(bots.releaseOne(fighters, 'b')).toBeNull()
  })
})
