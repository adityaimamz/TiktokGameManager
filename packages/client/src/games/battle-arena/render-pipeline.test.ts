import { describe, expect, it } from 'vitest'
import { SnapshotHistory, createChatMessage } from '@lga/shared'
import { createManualClock } from '../../framework/clock.js'
import { GameSignals, createSignalChannel, signalCodecs } from '../../platform/signals/index.js'
import type { StorageLike } from '../../platform/signals/index.js'
import { createRecordingContext } from '../../testing/recording-context.js'
import { TICK_MS } from './arena.js'
import { defaultConfig } from './config/index.js'
import type { BattleArenaConfig } from './config/index.js'
import { BattleArenaHost } from './host.js'
import { BattleArenaRenderer } from './renderer/canvas.js'
import { computeStageLayout } from './renderer/layout.js'
import type { RosterEntry, RosterPayload } from './snapshot.js'
import type { FeedEntry } from './renderer/hud/feed.js'

const matchConfig = (): BattleArenaConfig => {
  const config = defaultConfig()
  config.sides.a = { ...config.sides.a, keyword: 'messi' }
  config.sides.b = { ...config.sides.b, keyword: 'ronaldo' }
  config.gameplay = {
    ...config.gameplay,
    baseHp: 60,
    baseDamage: 10,
    attackIntervalSec: 1,
    killsToWinRound: 5,
    countdownDurationSec: 1,
    practiceFighters: false,
  }
  return config
}

const memoryStorage = (): StorageLike => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

/** Rig lengkap: satu tab menjalankan engine, satu tab lain hanya menggambar. */
const rig = () => {
  const clock = createManualClock(0)
  const storage = memoryStorage()
  const polls: (() => void)[] = []
  const channelOptions = {
    name: 'battle-arena-test',
    // Dipaksa ke jalur fallback: jalur yang paling mungkin rusak diam-diam justru yang ini.
    broadcast: () => null,
    storage,
    topics: ['snapshot', 'roster', 'config', 'feed'],
    codecs: signalCodecs,
    schedulePoll: (fn: () => void) => polls.push(fn),
    cancelPoll: () => {},
    now: () => clock.now(),
  }

  const hostSignals = new GameSignals<RosterPayload, BattleArenaConfig, FeedEntry>({
    channel: createSignalChannel(channelOptions),
    storage,
    now: () => clock.now(),
  })
  const overlaySignals = new GameSignals<RosterPayload, BattleArenaConfig, FeedEntry>({
    channel: createSignalChannel(channelOptions),
    storage,
    now: () => clock.now(),
  })

  const host = new BattleArenaHost({ clock, signals: hostSignals, seed: 42, config: matchConfig() })
  const history = new SnapshotHistory()
  const roster = new Map<number, RosterEntry>()
  overlaySignals.onSnapshot((buffer) => history.push(buffer))
  overlaySignals.onRoster((payload) => {
    roster.clear()
    for (const entry of payload.entries) roster.set(entry.slotIndex, entry)
  })

  const join = (username: string, keyword: string): void =>
    host.engine.handleMessage(
      createChatMessage({
        id: username,
        kind: 'textMessageEvent',
        platform: 'tiktok',
        username,
        text: keyword,
      }),
    )

  const run = (ticks: number): void => {
    for (let i = 0; i < ticks; i++) {
      clock.advance(TICK_MS)
      host.frame()
      polls.forEach((poll) => poll())
    }
  }

  return { clock, host, history, roster, join, run }
}

describe('the whole render pipeline', () => {
  it('carries a real match from the engine tab to the overlay tab', () => {
    const { host, history, roster, join, run } = rig()
    host.start()
    for (let i = 1; i <= 4; i++) {
      join(`a${i}`, 'messi')
      join(`b${i}`, 'ronaldo')
    }

    run(200)

    expect(history.hasData).toBe(true)
    expect(history.current.header.fighterCount).toBe(8)
    expect(roster.size).toBe(8)
    expect(host.engine.getState().tick).toBeGreaterThan(0)
  })

  it('draws every fighter the snapshot describes', () => {
    const { host, history, roster, join, run } = rig()
    host.start()
    join('andi', 'messi')
    join('budi', 'ronaldo')
    run(40)

    const ctx = createRecordingContext()
    const renderer = new BattleArenaRenderer({ layout: computeStageLayout(1600, 900, 'landscape') })
    renderer.setHistory(history)
    renderer.setRoster([...roster.values()])
    renderer.render(ctx, history.current, matchConfig(), 0.5)

    // Satu lingkaran isi dan satu lingkaran ring per fighter, minimum.
    expect(ctx.callsOf('arc').length).toBeGreaterThanOrEqual(
      history.current.header.fighterCount * 2,
    )
  })

  it('never mutates game state while drawing', () => {
    const { host, history, roster, join, run } = rig()
    host.start()
    join('andi', 'messi')
    join('budi', 'ronaldo')
    run(40)

    const fingerprint = () => {
      const state = host.engine.getState()
      return JSON.stringify({
        tick: state.tick,
        score: state.roundScore,
        fighters: state.fighters
          .list()
          .map((f) => [f.key, f.hp, f.position.x, f.position.y, f.kills, f.alive]),
      })
    }

    const before = fingerprint()
    const renderer = new BattleArenaRenderer({ layout: computeStageLayout(1600, 900, 'landscape') })
    renderer.setHistory(history)
    renderer.setRoster([...roster.values()])
    for (let frame = 0; frame < 30; frame++) {
      renderer.render(createRecordingContext(), history.current, matchConfig(), frame / 30)
    }

    expect(fingerprint()).toBe(before)
  })

  it('lets a freshly opened overlay restore the last snapshot from storage', () => {
    const { host, join, run } = rig()
    host.start()
    join('andi', 'messi')
    join('budi', 'ronaldo')
    run(40)
    host.dispose()

    // Tab overlay yang baru dibuka: kanal yang sama, belum menerima satu pesan pun.
    const { history } = rig()
    expect(history.hasData).toBe(false)
  })
})
