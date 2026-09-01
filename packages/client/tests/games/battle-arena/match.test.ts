import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { TICK_MS } from '../../../src/games/battle-arena/arena.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../src/games/battle-arena/config/index.js'
import { BattleArenaEngine } from '../../../src/games/battle-arena/engine.js'
import { PracticeFighters } from '../../../src/games/battle-arena/practice-fighters.js'
import type { SideId } from '../../../src/games/battle-arena/types.js'

const FIGHTERS_PER_SIDE = 6
const MAX_STEPS = 40_000

/** Ronde yang cukup pendek untuk selesai di dalam test, tapi tetap butuh pertarungan sungguhan. */
const matchConfig = (): BattleArenaConfig => {
  const config = defaultConfig()
  config.sides.a = { ...config.sides.a, name: 'Team Messi', keyword: 'messi' }
  config.sides.b = { ...config.sides.b, name: 'Team Ronaldo', keyword: 'ronaldo' }
  config.gameplay = {
    ...config.gameplay,
    baseHp: 60,
    baseDamage: 10,
    attackIntervalSec: 1,
    killsToWinRound: 5,
    roundsBestOf: 3,
    countdownDurationSec: 1,
    celebrationDurationSec: 2,
    practiceFighters: false,
  }
  return config
}

const KEYWORD = { a: 'messi', b: 'ronaldo' } as const

const join = (engine: BattleArenaEngine, side: 'a' | 'b', username: string): void => {
  engine.handleMessage(
    createChatMessage({
      id: username,
      kind: 'textMessageEvent',
      platform: 'tiktok',
      username,
      text: KEYWORD[side],
    }),
  )
}

interface MatchSummary {
  winner: SideId | null
  roundsWon: Record<SideId, number>
  roundIndex: number
  steps: number
  fighters: { key: string; kills: number; deaths: number }[]
}

const runMatch = (seed: number): MatchSummary => {
  const clock = createManualClock(0)
  const engine = new BattleArenaEngine({ clock, seed, config: matchConfig() })

  engine.start()
  for (let i = 1; i <= FIGHTERS_PER_SIDE; i++) {
    for (const [side, keyword] of [
      ['a', 'messi'],
      ['b', 'ronaldo'],
    ] as const) {
      engine.handleMessage(
        createChatMessage({
          id: `${side}${i}`,
          kind: 'textMessageEvent',
          platform: 'tiktok',
          username: `viewer-${side}${i}`,
          text: keyword,
        }),
      )
    }
  }

  let steps = 0
  while (engine.getState().matchWinner === null && steps < MAX_STEPS) {
    clock.advance(TICK_MS)
    engine.update()
    steps++
  }

  const state = engine.getState()
  return {
    winner: state.matchWinner,
    roundsWon: { ...state.roundsWon },
    roundIndex: state.roundIndex,
    steps,
    fighters: state.fighters
      .list()
      .map((f) => ({ key: f.key, kills: f.kills, deaths: f.deaths }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  }
}

describe('a full Battle Arena match, headless', () => {
  it('draws nothing: the whole engine runs without a DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(runMatch(42).winner).not.toBeNull()
  })

  it('plays a best-of-three to completion and produces a winner', () => {
    const summary = runMatch(42)
    expect(summary.winner).not.toBeNull()
    expect(summary.steps).toBeLessThan(MAX_STEPS)
    if (summary.winner !== null) expect(summary.roundsWon[summary.winner]).toBe(2)
    expect(summary.roundIndex).toBeGreaterThanOrEqual(2)
  })

  it('keeps every fighter in the arena across rounds', () => {
    expect(runMatch(42).fighters).toHaveLength(FIGHTERS_PER_SIDE * 2)
  })

  it('books one death for every kill', () => {
    const summary = runMatch(42)
    const kills = summary.fighters.reduce((sum, f) => sum + f.kills, 0)
    const deaths = summary.fighters.reduce((sum, f) => sum + f.deaths, 0)
    expect(kills).toBe(deaths)
    expect(kills).toBeGreaterThan(0)
  })

  it('replays identically from the same seed', () => {
    expect(runMatch(42)).toEqual(runMatch(42))
  })

  it('plays out differently from a different seed', () => {
    expect(runMatch(7)).not.toEqual(runMatch(42))
  })
})

/*
 * Target kill adalah SATU-SATUNYA kondisi menang, dan ronde yang targetnya tak terjangkau
 * memang MENUNGGU — keputusan creator, bukan bug yang belum ditambal. Jalan keluarnya dua,
 * keduanya dari luar simulasi: viewer mengetik ulang keyword-nya, atau creator menekan
 * Restart. Kedua test di bawah menahan keputusan itu supaya tidak "diperbaiki" diam-diam.
 */
describe('a match whose kill target can never be reached', () => {
  const STALL_STEPS = 5_000

  /** 3 lawan 3 dengan target 99 kill: satu sisi pasti habis jauh sebelum targetnya. */
  const stalled = () => {
    const clock = createManualClock(0)
    const config = matchConfig()
    config.gameplay.killsToWinRound = 99
    const engine = new BattleArenaEngine({ clock, seed: 11, config })

    engine.start()
    for (let i = 1; i <= 3; i++) {
      join(engine, 'a', `viewer-a${i}`)
      join(engine, 'b', `viewer-b${i}`)
    }

    const run = (steps: number): void => {
      for (let i = 0; i < steps; i++) {
        clock.advance(TICK_MS)
        engine.update()
      }
    }

    run(STALL_STEPS)
    return { engine, run }
  }

  it('menunggu alih-alih menyerahkan ronde kepada sisi yang tersisa', () => {
    const state = stalled().engine.getState()

    // Satu sisi memang sudah habis — persis keadaan yang dulu mengakhiri ronde.
    const alive = {
      a: state.fighters.countOnSide('a', { aliveOnly: true }),
      b: state.fighters.countOnSide('b', { aliveOnly: true }),
    }
    expect(Math.min(alive.a, alive.b)).toBe(0)

    expect(state.roundWinner).toBeNull()
    expect(state.matchWinner).toBeNull()
    expect(state.matchState).toBe('battle')
  })

  /*
   * Yang diperiksa adalah TOTAL kill, bukan kill sisi yang tersisa: pendatang baru boleh saja
   * memenangkan pertukaran itu dan justru dialah yang mencetak. Yang penting skor bergerak
   * lagi — ronde tidak mati, ia hanya kehabisan sasaran.
   */
  it('lanjut lagi begitu ada yang mengetik ulang keyword-nya', () => {
    const { engine, run } = stalled()
    const state = engine.getState()
    const wiped = state.fighters.countOnSide('a', { aliveOnly: true }) === 0 ? 'a' : 'b'
    const before = state.roundScore.a + state.roundScore.b

    join(engine, wiped, 'viewer-rejoin')
    run(STALL_STEPS)

    const after = engine.getState().roundScore
    expect(after.a + after.b).toBeGreaterThan(before)
  })
})

describe('a full match driven by practice fighters alone', () => {
  it('starts, fights and finishes with no viewers at all', () => {
    const clock = createManualClock(0)
    const config = matchConfig()
    config.gameplay.practiceFighters = true
    const engine = new BattleArenaEngine({ clock, seed: 3, config, roster: new PracticeFighters() })

    engine.start()
    let steps = 0
    while (engine.getState().matchWinner === null && steps < MAX_STEPS) {
      clock.advance(TICK_MS)
      engine.update()
      steps++
    }

    expect(engine.getState().matchWinner).not.toBeNull()
    expect(engine.getState().fighters.list().every((f) => f.platform === 'practice')).toBe(true)
  })
})
