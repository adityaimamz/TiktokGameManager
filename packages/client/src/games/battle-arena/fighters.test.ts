import { beforeEach, describe, expect, it } from 'vitest'
import { createManualClock } from '../../framework/clock.js'
import { createRng } from '../../framework/rng.js'
import { resetEntityIds } from '../../framework/entity/factory.js'
import { ARENA_MIDLINE } from './arena.js'
import { defaultConfig } from './config/index.js'
import type { GameplayConfig } from './config/index.js'
import { FighterRegistry } from './fighters.js'
import type { ActorIdentity } from './types.js'

const gameplay = (overrides: Partial<GameplayConfig> = {}): GameplayConfig => ({
  ...defaultConfig().gameplay,
  ...overrides,
})

const viewer = (username: string, platform: ActorIdentity['platform'] = 'tiktok'): ActorIdentity => ({
  platform,
  username,
  avatarUrl: null,
})

const makeRegistry = () => new FighterRegistry({ rng: createRng(42), clock: createManualClock(1000) })

describe('FighterRegistry.join', () => {
  beforeEach(() => resetEntityIds())

  it('spawns a fighter with the configured base stats', () => {
    const registry = makeRegistry()
    const result = registry.join(viewer('andi'), 'a', gameplay())
    expect(result.outcome).toBe('joined')
    const f = result.fighter
    expect(f?.hp).toBe(200)
    expect(f?.maxHp).toBe(200)
    expect(f?.damage).toBe(10)
    expect(f?.attackIntervalMs).toBe(1000)
    expect(f?.kills).toBe(0)
    expect(f?.deaths).toBe(0)
    expect(f?.alive).toBe(true)
    expect(f?.side).toBe('a')
    expect(f?.aiState).toBe('cooldown')
    expect(f?.joinedAtMs).toBe(1000)
    expect(registry.count).toBe(1)
  })

  it('spawns into the correct half', () => {
    const registry = makeRegistry()
    const a = registry.join(viewer('andi'), 'a', gameplay()).fighter
    const b = registry.join(viewer('budi'), 'b', gameplay()).fighter
    expect(a?.position.x).toBeLessThan(ARENA_MIDLINE)
    expect(b?.position.x).toBeGreaterThan(ARENA_MIDLINE)
  })

  it('never gives a viewer two fighters at once', () => {
    const registry = makeRegistry()
    registry.join(viewer('andi'), 'a', gameplay())
    const again = registry.join(viewer('andi'), 'a', gameplay())
    expect(again.outcome).toBe('alreadyOnSide')
    expect(registry.count).toBe(1)
  })

  it('moves a viewer to the other side while preserving kills and deaths', () => {
    const registry = makeRegistry()
    const first = registry.join(viewer('andi'), 'a', gameplay()).fighter
    if (first === null) throw new Error('expected a fighter')
    first.kills = 4
    first.deaths = 2

    const moved = registry.join(viewer('andi'), 'b', gameplay())
    expect(moved.outcome).toBe('switched')
    expect(moved.fighter?.side).toBe('b')
    expect(moved.fighter?.kills).toBe(4)
    expect(moved.fighter?.deaths).toBe(2)
    expect(moved.fighter?.hp).toBe(200)
    expect(registry.count).toBe(1)
  })

  it('revives a dead viewer who types the keyword again (D2)', () => {
    const registry = makeRegistry()
    const f = registry.join(viewer('andi'), 'a', gameplay()).fighter
    if (f === null) throw new Error('expected a fighter')
    f.hp = 0
    f.alive = false
    f.deaths = 3

    const rejoined = registry.join(viewer('andi'), 'a', gameplay())
    expect(rejoined.outcome).toBe('rejoined')
    expect(rejoined.fighter?.alive).toBe(true)
    expect(rejoined.fighter?.hp).toBe(200)
    expect(rejoined.fighter?.deaths).toBe(3)
    expect(registry.count).toBe(1)
  })

  it('refuses a join once the side is full', () => {
    const registry = makeRegistry()
    const config = gameplay({ maxFightersPerSide: 2 })
    registry.join(viewer('a1'), 'a', config)
    registry.join(viewer('a2'), 'a', config)
    const rejected = registry.join(viewer('a3'), 'a', config)
    expect(rejected.outcome).toBe('sideFull')
    expect(rejected.fighter).toBeNull()
    expect(registry.countOnSide('a')).toBe(2)
  })

  it('counts dead fighters against the side cap', () => {
    const registry = makeRegistry()
    const config = gameplay({ maxFightersPerSide: 1 })
    const f = registry.join(viewer('a1'), 'a', config).fighter
    if (f === null) throw new Error('expected a fighter')
    f.alive = false
    expect(registry.join(viewer('a2'), 'a', config).outcome).toBe('sideFull')
  })

  it('keeps the old fighter when moving to a side that is already full', () => {
    const registry = makeRegistry()
    const config = gameplay({ maxFightersPerSide: 1 })
    registry.join(viewer('andi'), 'a', config)
    registry.join(viewer('budi'), 'b', config)
    expect(registry.join(viewer('andi'), 'b', config).outcome).toBe('sideFull')
    expect(registry.get('tiktok:andi')?.side).toBe('a')
  })
})

describe('FighterRegistry slots', () => {
  beforeEach(() => resetEntityIds())

  it('hands out slots from zero upwards', () => {
    const registry = makeRegistry()
    expect(registry.join(viewer('a1'), 'a', gameplay()).fighter?.slotIndex).toBe(0)
    expect(registry.join(viewer('a2'), 'a', gameplay()).fighter?.slotIndex).toBe(1)
    expect(registry.join(viewer('a3'), 'a', gameplay()).fighter?.slotIndex).toBe(2)
  })

  it('reuses the lowest freed slot', () => {
    const registry = makeRegistry()
    registry.join(viewer('a1'), 'a', gameplay())
    registry.join(viewer('a2'), 'a', gameplay())
    registry.join(viewer('a3'), 'a', gameplay())
    registry.remove('tiktok:a2')
    expect(registry.join(viewer('a4'), 'a', gameplay()).fighter?.slotIndex).toBe(1)
  })
})

describe('FighterRegistry bookkeeping', () => {
  beforeEach(() => resetEntityIds())

  it('counts by side, aliveness and platform', () => {
    const registry = makeRegistry()
    registry.join(viewer('a1'), 'a', gameplay())
    const dead = registry.join(viewer('a2'), 'a', gameplay()).fighter
    if (dead !== null) dead.alive = false
    registry.join(viewer('bot1', 'practice'), 'a', gameplay())
    registry.join(viewer('b1'), 'b', gameplay())

    expect(registry.countOnSide('a')).toBe(3)
    expect(registry.countOnSide('a', { aliveOnly: true })).toBe(2)
    expect(registry.countOnSide('a', { platform: 'practice' })).toBe(1)
    expect(registry.countOnSide('b')).toBe(1)
  })

  it('removes every fighter of one platform and reports how many', () => {
    const registry = makeRegistry()
    registry.join(viewer('d1', 'demo'), 'a', gameplay())
    registry.join(viewer('d2', 'demo'), 'b', gameplay())
    registry.join(viewer('real'), 'a', gameplay())
    expect(registry.removeByPlatform('demo')).toBe(2)
    expect(registry.count).toBe(1)
    expect(registry.get('tiktok:real')).toBeDefined()
  })

  it('remembers the stats of a viewer who left the arena', () => {
    const registry = makeRegistry()
    const f = registry.join(viewer('andi'), 'a', gameplay()).fighter
    if (f === null) throw new Error('expected a fighter')
    f.kills = 7
    f.deaths = 1
    registry.remove('tiktok:andi')
    expect(registry.statsFor('tiktok:andi')).toEqual({ kills: 7, deaths: 1, giftCoins: 0 })

    const back = registry.join(viewer('andi'), 'b', gameplay())
    expect(back.fighter?.kills).toBe(7)
    expect(back.fighter?.deaths).toBe(1)
  })

  it('reports zeroes for a viewer it has never seen', () => {
    expect(makeRegistry().statsFor('tiktok:nobody')).toEqual({ kills: 0, deaths: 0, giftCoins: 0 })
  })

  it('clear empties the registry and forgets the stats', () => {
    const registry = makeRegistry()
    const f = registry.join(viewer('andi'), 'a', gameplay()).fighter
    if (f !== null) f.kills = 3
    registry.clear()
    expect(registry.count).toBe(0)
    expect(registry.statsFor('tiktok:andi')).toEqual({ kills: 0, deaths: 0, giftCoins: 0 })
  })
})

describe('FighterRegistry.restoreForNewRound', () => {
  beforeEach(() => resetEntityIds())

  it('revives everyone at full HP while keeping cumulative stats and grown maxHp', () => {
    const registry = makeRegistry()
    const f = registry.join(viewer('andi'), 'a', gameplay()).fighter
    if (f === null) throw new Error('expected a fighter')
    f.maxHp = 260
    f.hp = 0
    f.alive = false
    f.kills = 5
    f.deaths = 2
    f.targetKey = 'tiktok:someone'
    f.velocity.x = 9

    registry.restoreForNewRound(gameplay())

    expect(f.alive).toBe(true)
    expect(f.hp).toBe(260)
    expect(f.maxHp).toBe(260)
    expect(f.kills).toBe(5)
    expect(f.deaths).toBe(2)
    expect(f.targetKey).toBeNull()
    expect(f.aiState).toBe('cooldown')
    expect(f.velocity).toEqual({ x: 0, y: 0 })
  })

  it('keeps every fighter on the side it joined', () => {
    const registry = makeRegistry()
    registry.join(viewer('a1'), 'a', gameplay())
    registry.join(viewer('b1'), 'b', gameplay())
    registry.restoreForNewRound(gameplay())
    expect(registry.get('tiktok:a1')?.position.x).toBeLessThan(ARENA_MIDLINE)
    expect(registry.get('tiktok:b1')?.position.x).toBeGreaterThan(ARENA_MIDLINE)
  })
})

describe('gift coins', () => {
  beforeEach(() => resetEntityIds())

  it('menumpuk koin pada fighter yang ada', () => {
    const registry = makeRegistry()
    registry.join(viewer('andi'), 'a', gameplay())

    registry.addGiftCoins(viewer('andi'), 30)
    registry.addGiftCoins(viewer('andi'), 12)

    expect(registry.get('tiktok:andi')?.giftCoins).toBe(42)
  })

  it('mengabaikan koin dari viewer yang tidak punya fighter', () => {
    const registry = makeRegistry()
    expect(() => registry.addGiftCoins(viewer('hantu'), 100)).not.toThrow()
    expect(registry.count).toBe(0)
  })

  it('membawa koin melewati kematian dan pindah sisi', () => {
    const registry = makeRegistry()
    registry.join(viewer('andi'), 'a', gameplay())
    registry.addGiftCoins(viewer('andi'), 75)

    registry.join(viewer('andi'), 'b', gameplay())

    expect(registry.get('tiktok:andi')?.giftCoins).toBe(75)
  })
})
