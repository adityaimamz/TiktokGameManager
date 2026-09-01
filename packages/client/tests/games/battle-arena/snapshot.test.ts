import { beforeEach, describe, expect, it } from 'vitest'
import { SIDE_A, SIDE_B, SIDE_C, SIDE_D, decodeSnapshot } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { NUKE_TYPES, defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { spawnGameEffect } from '../../../src/games/battle-arena/effects.js'
import { fireProjectile } from '../../../src/games/battle-arena/projectiles.js'
import {
  RosterPublisher,
  SnapshotWriter,
  effectTypeIndex,
  matchStateIndex,
  sideFromIndex,
  sideIndex,
} from '../../../src/games/battle-arena/snapshot.js'
import {
  createBattleArenaState,
  recordSessionGift,
} from '../../../src/games/battle-arena/state.js'
import type { Fighter, SideId } from '../../../src/games/battle-arena/types.js'
import { enqueueUltimate, releaseUltimates } from '../../../src/games/battle-arena/ultimate.js'

const setup = () => {
  const clock = createManualClock(0)
  const state = createBattleArenaState({ rng: createRng(5), clock })
  const config = defaultConfig()
  const add = (username: string, side: SideId): Fighter => {
    const f = state.fighters.join(
      { platform: 'tiktok', username, avatarUrl: null },
      side,
      config.gameplay,
    ).fighter
    if (f === null) throw new Error('expected a fighter')
    return f
  }
  return { clock, state, config, add }
}

describe('sideIndex and matchStateIndex', () => {
  it('encodes all 4 sides as distinct numbers and maps them back', () => {
    expect(sideIndex('a')).toBe(SIDE_A)
    expect(sideIndex('b')).toBe(SIDE_B)
    expect(sideIndex('c')).toBe(SIDE_C)
    expect(sideIndex('d')).toBe(SIDE_D)

    expect(sideFromIndex(SIDE_A)).toBe('a')
    expect(sideFromIndex(SIDE_B)).toBe('b')
    expect(sideFromIndex(SIDE_C)).toBe('c')
    expect(sideFromIndex(SIDE_D)).toBe('d')
  })

  it('encodes the match state as its position in MATCH_STATES', () => {
    expect(matchStateIndex('idle')).toBe(0)
    expect(matchStateIndex('battle')).toBe(3)
  })

  it('encodes effect types as their position in EFFECT_TYPES', () => {
    expect(effectTypeIndex('hit')).toBe(0)
    expect(effectTypeIndex('nope')).toBe(-1)
  })
})

describe('SnapshotWriter', () => {
  beforeEach(() => resetEntityIds())

  it('writes the header from match state', () => {
    const { state, clock } = setup()
    state.matchState = 'battle'
    state.tick = 12
    state.roundScore.a = 3
    state.roundScore.b = 1
    state.roundScore.c = 4
    state.roundScore.d = 2
    state.roundsWon.a = 1
    clock.advance(700)

    const view = decodeSnapshot(new SnapshotWriter().write(state, clock.now()))

    expect(view.header.tick).toBe(12)
    expect(view.header.timestampMs).toBe(700)
    expect(view.header.matchState).toBe(matchStateIndex('battle'))
    expect(view.header.roundScoreA).toBe(3)
    expect(view.header.roundScoreB).toBe(1)
    expect(view.header.roundScoreC).toBe(4)
    expect(view.header.roundScoreD).toBe(2)
    expect(view.header.roundsWonA).toBe(1)
    expect(view.header.roundsWonB).toBe(0)
    expect(view.header.roundsWonC).toBe(0)
    expect(view.header.roundsWonD).toBe(0)
    expect(view.header.fighterCount).toBe(0)
    expect(view.header.roundWinner).toBe(-1)
  })

  it('records the winning side once the round has been decided', () => {
    const { state } = setup()
    state.roundWinner = 'b'

    expect(decodeSnapshot(new SnapshotWriter().write(state, 0)).header.roundWinner).toBe(SIDE_B)
  })

  it('writes one record per fighter, dead ones included', () => {
    const { state, add } = setup()
    const alive = add('andi', 'a')
    const dead = add('budi', 'b')
    dead.alive = false
    dead.hp = 0

    const view = decodeSnapshot(new SnapshotWriter().write(state, 0))

    expect(view.header.fighterCount).toBe(2)
    const first = view.fighters[0]
    expect(first?.slotIndex).toBe(alive.slotIndex)
    expect(first?.side).toBe(SIDE_A)
    expect(first?.alive).toBe(1)
    expect(first?.maxHp).toBe(200)
    expect(view.fighters[1]?.alive).toBe(0)
  })

  it('resolves the target key to the target slot, or -1 when there is none', () => {
    const { state, add } = setup()
    const hunter = add('andi', 'a')
    const prey = add('budi', 'b')
    hunter.targetKey = prey.key

    const view = decodeSnapshot(new SnapshotWriter().write(state, 0))

    expect(view.fighters[0]?.targetSlot).toBe(prey.slotIndex)
    expect(view.fighters[1]?.targetSlot).toBe(-1)
  })

  it('carries kills so the leaderboard does not need the roster', () => {
    const { state, add } = setup()
    add('andi', 'a').kills = 4

    expect(decodeSnapshot(new SnapshotWriter().write(state, 0)).fighters[0]?.kills).toBe(4)
  })

  it('writes projectiles with the velocity the renderer extrapolates from', () => {
    const { state, add } = setup()
    const p = fireProjectile(state.projectiles, add('andi', 'a'), add('budi', 'b'))

    const view = decodeSnapshot(new SnapshotWriter().write(state, 0))

    expect(view.header.projectileCount).toBe(1)
    expect(view.projectiles[0]?.x).toBeCloseTo(p.position.x, 3)
    expect(view.projectiles[0]?.vx).toBeCloseTo(p.velocity.x, 3)
    expect(view.projectiles[0]?.kind).toBe(SIDE_A)
  })

  it('writes effects with their progress resolved at encode time', () => {
    const { state, config, clock } = setup()
    spawnGameEffect(state.effects, config, { type: 'hit', x: 10, y: 20, value: 25 })
    clock.advance(125)

    const view = decodeSnapshot(new SnapshotWriter().write(state, clock.now()))

    expect(view.header.effectCount).toBe(1)
    expect(view.effects[0]?.type).toBe(effectTypeIndex('hit'))
    expect(view.effects[0]?.value).toBe(25)
    expect(view.effects[0]?.progress).toBeCloseTo(0.5, 2)
  })

  it('reuses one buffer across ticks and only grows when it must', () => {
    const { state, add } = setup()
    const writer = new SnapshotWriter(64)
    const first = writer.write(state, 0)
    const capacityAfterEmpty = writer.capacity

    expect(first.buffer).toBe(writer.write(state, 0).buffer)

    for (let i = 0; i < 40; i++) add(`viewer-${i}`, i % 2 === 0 ? 'a' : 'b')
    writer.write(state, 0)
    expect(writer.capacity).toBeGreaterThan(capacityAfterEmpty)

    const grown = writer.capacity
    writer.write(state, 0)
    expect(writer.capacity).toBe(grown)
  })
})

describe('RosterPublisher', () => {
  beforeEach(() => resetEntityIds())

  it('publishes an empty roster the first time it is asked', () => {
    const { state } = setup()

    expect(new RosterPublisher().next(state)).toEqual({
      version: 1,
      entries: [],
      topGifters: [],
    })
  })

  it('publishes the roster the first time it is asked', () => {
    const { state, add } = setup()
    add('andi', 'a')

    const payload = new RosterPublisher().next(state)

    expect(payload?.version).toBe(1)
    expect(payload?.entries).toEqual([
      { slotIndex: 0, username: 'andi', avatarUrl: null, side: 'a', platform: 'tiktok' },
    ])
  })

  it('stays silent while the roster is unchanged', () => {
    const { state, add } = setup()
    add('andi', 'a')
    const publisher = new RosterPublisher()

    expect(publisher.next(state)).not.toBeNull()
    expect(publisher.next(state)).toBeNull()
  })

  it('publishes again when someone joins, leaves or switches side', () => {
    const { state, config, add } = setup()
    add('andi', 'a')
    const publisher = new RosterPublisher()
    publisher.next(state)

    add('budi', 'b')
    expect(publisher.next(state)?.version).toBe(2)

    state.fighters.join({ platform: 'tiktok', username: 'budi', avatarUrl: null }, 'a', config.gameplay)
    expect(publisher.next(state)?.version).toBe(3)

    state.fighters.remove('tiktok:andi')
    expect(publisher.next(state)?.version).toBe(4)
  })

  it('says nothing about who is alive — that is the snapshot job', () => {
    const { state, add } = setup()
    const fighter = add('andi', 'a')
    const publisher = new RosterPublisher()
    publisher.next(state)

    fighter.alive = false
    expect(publisher.next(state)).toBeNull()
  })

  it('sorts entries by slot so both tabs agree on the order', () => {
    const { state, add } = setup()
    add('andi', 'a')
    add('budi', 'b')
    state.fighters.remove('tiktok:andi')
    add('cinta', 'a')

    const entries = new RosterPublisher().next(state)?.entries ?? []
    expect(entries.map((e) => e.slotIndex)).toEqual([0, 1])
    expect(entries.map((e) => e.username)).toEqual(['cinta', 'budi'])
  })

  it('publishes the five session gifters in rank order and updates when rank five changes', () => {
    const { state } = setup()
    const publisher = new RosterPublisher()
    const gift = (username: string, coins: number): void =>
      recordSessionGift(state, { platform: 'tiktok', username, avatarUrl: null }, coins)

    gift('andi', 60)
    gift('budi', 50)
    gift('cinta', 40)
    gift('dina', 30)
    gift('eka', 20)
    gift('fajar', 10)

    expect(publisher.next(state)?.topGifters.map((entry) => entry.username)).toEqual([
      'andi',
      'budi',
      'cinta',
      'dina',
      'eka',
    ])
    expect(publisher.next(state)).toBeNull()

    gift('fajar', 15)
    expect(publisher.next(state)?.topGifters.map((entry) => entry.username)).toEqual([
      'andi',
      'budi',
      'cinta',
      'dina',
      'fajar',
    ])
  })
})

describe('koin gift', () => {
  it('menulis giftCoins di float ke-11 tiap fighter', () => {
    const { state, add } = setup()
    const fighter = add('andi', 'a')
    state.fighters.addGiftCoins({ platform: 'tiktok', username: 'andi', avatarUrl: null }, 700)

    const view = decodeSnapshot(new SnapshotWriter().write(state, 1000).slice())

    expect(fighter.giftCoins).toBe(700)
    expect(view.fighters[0]?.giftCoins).toBe(700)
  })
})

describe('encode ultimate (Plan 6a)', () => {
  it('round-trip utuh lewat encode → decode', () => {
    const state = createBattleArenaState({ rng: createRng(3), clock: createManualClock() })
    const config = defaultConfig()
    state.tick = 5
    enqueueUltimate(state, {
      gifterKey: 'tiktok:andi',
      casterSlot: 2,
      side: 'a',
      targetSide: 'b',
      nukeType: 'laser',
      damage: 50,
      giftCoins: 1500,
      queuedAtTick: 5,
      originX: 20,
      originY: 40,
    })
    releaseUltimates(state, config, 5)
    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    u.killCount = 3
    u.totalDamage = 150

    const view = decodeSnapshot(new SnapshotWriter().write(state, 1000).slice())

    expect(view.header.ultimateCount).toBe(1)
    expect(view.ultimates[0]).toMatchObject({
      casterSlot: 2,
      variant: NUKE_TYPES.indexOf('laser'),
      tier: 2,
      originX: 20,
      originY: 40,
      targetX: 75,
      targetY: 25,
      killCount: 3,
      totalDamage: 150,
      stale: 0,
      slot: 0,
    })
  })

  it('progress diturunkan dari tick state, bukan dari jam dinding', () => {
    const state = createBattleArenaState({ rng: createRng(3), clock: createManualClock() })
    const config = defaultConfig()
    enqueueUltimate(state, {
      gifterKey: 'tiktok:andi',
      casterSlot: 0,
      side: 'a',
      targetSide: 'b',
      nukeType: 'bomb',
      damage: 50,
      giftCoins: 0,
      queuedAtTick: 0,
    })
    releaseUltimates(state, config, 0)

    const writer = new SnapshotWriter()
    const first = decodeSnapshot(writer.write(state, 1000).slice()).ultimates[0]?.progress
    state.tick = 10
    const later = decodeSnapshot(writer.write(state, 1000).slice()).ultimates[0]?.progress

    expect(first).toBe(0)
    expect(later).toBeGreaterThan(0)

    // Jam dinding melompat jauh, tick tidak: progress tidak boleh bergerak.
    const frozen = decodeSnapshot(writer.write(state, 999_000).slice()).ultimates[0]?.progress
    expect(frozen).toBe(later)
  })
})
