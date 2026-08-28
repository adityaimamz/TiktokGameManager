import { beforeEach, describe, expect, it } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { createBattleArenaState, resetMatch, roundsNeeded, startNewRound } from '../../../src/games/battle-arena/state.js'
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
    expect(state.roundScore).toEqual({ a: 0, b: 0 })
    expect(state.roundsWon).toEqual({ a: 0, b: 0 })
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
    expect(state.roundScore).toEqual({ a: 0, b: 0 })
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
    expect(state.roundsWon).toEqual({ a: 0, b: 2 })
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

    resetMatch(state)

    expect(state.fighters.count).toBe(0)
    expect(state.roundScore).toEqual({ a: 0, b: 0 })
    expect(state.roundsWon).toEqual({ a: 0, b: 0 })
    expect(state.roundIndex).toBe(0)
    expect(state.roundWinner).toBeNull()
    expect(state.matchWinner).toBeNull()
    expect(state.tick).toBe(0)
    expect(state.projectiles.activeCount).toBe(0)
    expect(state.effects.activeCount).toBe(0)
  })
})
