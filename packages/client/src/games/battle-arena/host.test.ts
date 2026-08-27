import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import { createManualClock } from '../../framework/clock.js'
import { GameSignals } from '../../platform/signals/index.js'
import type { SignalChannel } from '../../platform/signals/index.js'
import { TICK_MS } from './arena.js'
import { defaultConfig } from './config/index.js'
import type { BattleArenaConfig } from './config/index.js'
import { BattleArenaHost } from './host.js'
import type { BattleArenaSignals } from './host.js'
import { PracticeFighters } from './practice-fighters.js'
import type { RosterPayload } from './snapshot.js'
import type { FeedEntry } from './renderer/hud/feed.js'

/**
 * GameSignals punya tiga parameter tipe dan tidak ada satu pun yang bisa disimpulkan dari
 * konstruktornya — tanpa argumen tipe eksplisit ia jadi GameSignals<unknown, unknown, unknown>
 * dan tidak sah diserahkan ke host.
 */
const signalsFor = (channel: SignalChannel, now: () => number): BattleArenaSignals =>
  new GameSignals<RosterPayload, BattleArenaConfig, FeedEntry>({ channel, now })

/** Kanal yang mencatat setiap kiriman, supaya frekuensi siaran bisa di-assert. */
const spyChannel = () => {
  const posts: { topic: string; payload: unknown }[] = []
  let closed = false
  const channel: SignalChannel = {
    mode: 'broadcast',
    post: (topic, payload) => posts.push({ topic, payload }),
    subscribe: () => () => {},
    close: () => {
      closed = true
    },
  }
  return {
    channel,
    posts,
    get closed() {
      return closed
    },
    countOf: (topic: string) => posts.filter((post) => post.topic === topic).length,
  }
}

const matchConfig = (): BattleArenaConfig => {
  const config = defaultConfig()
  config.sides.a = { ...config.sides.a, keyword: 'messi' }
  config.sides.b = { ...config.sides.b, keyword: 'ronaldo' }
  config.gameplay = {
    ...config.gameplay,
    baseHp: 40,
    baseDamage: 20,
    attackIntervalSec: 0.5,
    killsToWinRound: 2,
    countdownDurationSec: 1,
    practiceFighters: false,
  }
  return config
}

const setup = (config = matchConfig()) => {
  const clock = createManualClock(0)
  const spy = spyChannel()
  const signals = signalsFor(spy.channel, () => clock.now())
  const host = new BattleArenaHost({ clock, signals, seed: 42, config })
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
  const frames = (count: number): void => {
    for (let i = 0; i < count; i++) {
      clock.advance(TICK_MS / 3)
      host.frame()
    }
  }
  const framesUntil = (predicate: () => boolean, max = 500): boolean => {
    for (let i = 0; i < max; i++) {
      if (predicate()) return true
      clock.advance(TICK_MS / 3)
      host.frame()
    }
    return predicate()
  }
  return { clock, spy, host, join, frames, framesUntil }
}

describe('BattleArenaHost', () => {
  it('broadcasts the config once on start, so a late overlay knows the rules', () => {
    const { spy, host } = setup()
    host.start()

    expect(spy.countOf('config')).toBe(1)
  })

  it('hands the interpolation alpha back to whoever owns the render loop', () => {
    const { clock, host, join, framesUntil } = setup()
    host.start()
    join('andi', 'messi')
    join('budi', 'ronaldo')
    expect(framesUntil(() => host.engine.matchState === 'battle')).toBe(true)

    clock.advance(TICK_MS / 4)

    expect(host.frame()).toBeCloseTo(0.25, 5)
  })

  it('broadcasts a snapshot per tick, not per frame', () => {
    const { spy, host, join, frames } = setup()
    host.start()
    join('andi', 'messi')
    join('budi', 'ronaldo')

    frames(30) // 30 frame = 10 tick
    const snapshots = spy.countOf('snapshot')

    expect(snapshots).toBeGreaterThan(0)
    expect(snapshots).toBeLessThanOrEqual(12)
  })

  it('broadcasts once when the match state changes even though no tick ran', () => {
    const { spy, host } = setup()
    host.start()
    host.frame()

    expect(spy.countOf('snapshot')).toBe(1)
  })

  it('broadcasts the roster when someone joins and stays quiet afterwards', () => {
    const { spy, host, join, frames } = setup()
    host.start()
    join('andi', 'messi')
    join('budi', 'ronaldo')
    frames(6)
    const afterJoins = spy.countOf('roster')

    frames(30)
    expect(afterJoins).toBeGreaterThan(0)
    expect(spy.countOf('roster')).toBe(afterJoins)
  })

  it('turns kills into feed entries', () => {
    const { spy, host, join, frames } = setup()
    host.start()
    join('andi', 'messi')
    join('budi', 'ronaldo')

    frames(600)

    const kills = spy.posts.filter(
      (post) => post.topic === 'feed' && (post.payload as { kind: string }).kind === 'kill',
    )
    expect(kills.length).toBeGreaterThan(0)
  })

  it('broadcasts the config again when the creator changes a setting', () => {
    const { spy, host } = setup()
    host.start()
    const config = matchConfig()
    config.gameplay.baseHp = 500

    host.setConfig(config)

    expect(spy.countOf('config')).toBe(2)
    expect(host.engine.getConfig().gameplay.baseHp).toBe(500)
  })

  it('fills the arena with practice fighters when asked to', () => {
    const config = matchConfig()
    config.gameplay.practiceFighters = true
    const clock = createManualClock(0)
    const spy = spyChannel()
    const host = new BattleArenaHost({
      clock,
      signals: signalsFor(spy.channel, () => clock.now()),
      seed: 7,
      config,
      roster: new PracticeFighters(),
    })

    host.start()
    for (let i = 0; i < 10; i++) {
      clock.advance(TICK_MS)
      host.frame()
    }

    expect(host.engine.getState().fighters.count).toBeGreaterThan(0)
  })

  it('hands engine events to the caller as well as to the feed', () => {
    const clock = createManualClock(0)
    const spy = spyChannel()
    const seen: string[] = []
    const host = new BattleArenaHost({
      clock,
      signals: signalsFor(spy.channel, () => clock.now()),
      config: matchConfig(),
      onEvent: (event) => seen.push(event.type),
    })

    host.start()

    expect(seen).toContain('stateChanged')
  })

  it('keeps the last snapshot and roster available to the tab that owns it', () => {
    const { host, join, frames } = setup()
    host.start()
    join('andi', 'messi')
    frames(6)

    expect(host.lastSnapshot).not.toBeNull()
    expect(host.currentRoster.get(0)?.username).toBe('andi')
  })

  it('flushes the pending snapshot and closes the channel on dispose', () => {
    const { spy, host, frames } = setup()
    host.start()
    frames(3)

    host.dispose()

    expect(spy.closed).toBe(true)
  })
})
