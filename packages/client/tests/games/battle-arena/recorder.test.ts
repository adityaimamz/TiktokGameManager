import { describe, expect, it } from 'vitest'
import type { ChatPlatform, MatchRecord } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { EngineEvent } from '../../../src/games/battle-arena/events.js'
import { MatchRecorder } from '../../../src/games/battle-arena/recorder.js'
import { createBattleArenaState } from '../../../src/games/battle-arena/state.js'
import type { SideId } from '../../../src/games/battle-arena/types.js'

function createRig() {
  const clock = createManualClock(1_000)
  const state = createBattleArenaState({ rng: createRng(7), clock })
  const submitted: MatchRecord[] = []
  let nowMs = 1_000

  const recorder = new MatchRecorder({
    getState: () => state,
    now: () => nowMs,
    submit: (record) => submitted.push(record),
  })

  const join = (username: string, side: SideId, platform: ChatPlatform = 'tiktok') => {
    state.fighters.join(
      { platform, username, avatarUrl: platform === 'tiktok' ? `https://x/${username}.jpg` : null },
      side,
      defaultConfig().gameplay,
    )
  }

  return {
    recorder,
    state,
    submitted,
    join,
    setNow: (ms: number) => {
      nowMs = ms
    },
    emit: (event: EngineEvent) => recorder.onEvent(event),
  }
}

const started = (): EngineEvent => ({
  type: 'stateChanged',
  from: 'idle',
  to: 'waitingFighters',
  atMs: 1_000,
})

const ended = (winner: SideId = 'a'): EngineEvent => ({ type: 'matchEnded', winner })

describe('MatchRecorder', () => {
  it('submits nothing until the match ends', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('budi', 'a')
    rig.emit({ type: 'roundEnded', winner: 'a', roundIndex: 0 })

    expect(rig.submitted).toEqual([])
  })

  it('submits one record when the match ends', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('budi', 'a')
    rig.setNow(61_000)
    rig.emit(ended('a'))

    expect(rig.submitted).toHaveLength(1)
    expect(rig.submitted[0]?.gameId).toBe('battle-arena')
    expect(rig.submitted[0]?.winnerSide).toBe('a')
    expect(rig.submitted[0]?.startedAtMs).toBe(1_000)
    expect(rig.submitted[0]?.endedAtMs).toBe(61_000)
  })

  it('carries the rounds each side won', () => {
    const rig = createRig()
    rig.emit(started())
    rig.state.roundsWon.a = 3
    rig.state.roundsWon.b = 1
    rig.emit(ended('a'))

    expect(rig.submitted[0]?.roundsWonA).toBe(3)
    expect(rig.submitted[0]?.roundsWonB).toBe(1)
  })

  it('includes real viewers with their side and stats', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('budi', 'a')
    rig.join('siti', 'b')
    const budi = rig.state.fighters.get('tiktok:budi')
    if (budi === undefined) throw new Error('budi should be registered')
    budi.kills = 7
    budi.deaths = 2

    rig.emit(ended('a'))

    const players = rig.submitted[0]?.players ?? []
    expect(players).toHaveLength(2)
    const recorded = players.find((player) => player.username === 'budi')
    expect(recorded).toEqual({
      platform: 'tiktok',
      username: 'budi',
      avatarUrl: 'https://x/budi.jpg',
      side: 'a',
      kills: 7,
      deaths: 2,
    })
  })

  it('excludes demo, practice and creator fighters (P5)', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('budi', 'a')
    rig.join('bot-1', 'a', 'practice')
    rig.join('sim-1', 'b', 'demo')
    rig.join('button', 'b', 'creator')

    rig.emit(ended('a'))

    expect(rig.submitted[0]?.players.map((player) => player.username)).toEqual(['budi'])
  })

  it('counts every fighter in totalFighters, bots included', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('budi', 'a')
    rig.join('bot-1', 'a', 'practice')

    rig.emit(ended('a'))

    expect(rig.submitted[0]?.totalFighters).toBe(2)
    expect(rig.submitted[0]?.players).toHaveLength(1)
  })

  it('records a bots-only match with an empty player list', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('bot-1', 'a', 'practice')
    rig.emit(ended('b'))

    expect(rig.submitted).toHaveLength(1)
    expect(rig.submitted[0]?.players).toEqual([])
  })

  it('does not submit a match it never saw start', () => {
    const rig = createRig()
    rig.join('budi', 'a')
    rig.emit(ended('a'))

    expect(rig.submitted).toEqual([])
  })

  it('records a second match without carrying the first one over', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('budi', 'a')
    rig.setNow(61_000)
    rig.emit(ended('a'))

    rig.setNow(70_000)
    rig.emit({ type: 'stateChanged', from: 'victory', to: 'waitingFighters', atMs: 70_000 })
    rig.setNow(120_000)
    rig.emit(ended('b'))

    expect(rig.submitted).toHaveLength(2)
    expect(rig.submitted[1]?.startedAtMs).toBe(70_000)
    expect(rig.submitted[1]?.winnerSide).toBe('b')
  })

  it('ignores every other engine event', () => {
    const rig = createRig()
    rig.emit(started())
    rig.emit({ type: 'actionApplied', action: { type: 'damage', targetKey: 'x', value: 1 } as never })
    rig.emit({ type: 'realViewerArrived', removedDemoFighters: 2 })

    expect(rig.submitted).toEqual([])
  })
})

describe('koin gift di record', () => {
  /*
   * Kebalikan dari aturan lama, dan disengaja (spec Plan 13 §3).
   *
   * Koin sepanjang masa ditulis `LiveLedger` lewat jalur progres; `match_players` tidak punya
   * kolomnya. Mengirimnya dari sini berarti tiap gift dihitung dua kali — sekali oleh flush
   * berkala, sekali lagi saat match berakhir.
   */
  it('tidak membawa koin gift sama sekali', () => {
    const rig = createRig()
    rig.emit(started())
    rig.join('andi', 'a')
    rig.state.fighters.addGiftCoins({ platform: 'tiktok', username: 'andi', avatarUrl: null }, 500)

    rig.emit(ended('a'))

    const andi = rig.submitted[0]?.players.find((entry) => entry.username === 'andi')
    expect(andi).toBeDefined()
    expect(andi).not.toHaveProperty('giftCoins')
  })
})
