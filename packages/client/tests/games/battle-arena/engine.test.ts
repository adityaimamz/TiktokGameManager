import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatMessage } from '@lga/shared'
import type { ChatPlatform } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { RESULT_AUTO_ADVANCE_MS, TICK_MS } from '../../../src/games/battle-arena/arena.js'
import { createBattleAction, sideTarget } from '../../../src/games/battle-arena/actions.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../src/games/battle-arena/config/index.js'
import { BattleArenaEngine } from '../../../src/games/battle-arena/engine.js'
import { PracticeFighters } from '../../../src/games/battle-arena/practice-fighters.js'
import type { EngineEvent } from '../../../src/games/battle-arena/events.js'

/** Ronde pendek: satu pukulan mematikan, jadi satu ronde selesai dalam beberapa detik simulasi. */
const fastConfig = (): BattleArenaConfig => {
  const config = defaultConfig()
  config.gameplay = {
    ...config.gameplay,
    baseHp: 10,
    baseDamage: 10,
    attackIntervalSec: 0.5,
    killsToWinRound: 1,
    roundsBestOf: 3,
    countdownDurationSec: 1,
    celebrationDurationSec: 2,
    practiceFighters: false,
  }
  return config
}

const setup = (config: BattleArenaConfig = fastConfig(), roster?: PracticeFighters) => {
  const clock = createManualClock(0)
  const events: EngineEvent[] = []
  const warn = vi.fn()
  const engine = new BattleArenaEngine({ clock, seed: 42, config, warn, roster, onEvent: (e) => events.push(e) })

  const step = (times = 1): void => {
    for (let i = 0; i < times; i++) {
      clock.advance(TICK_MS)
      engine.update()
    }
  }
  const stepUntil = (predicate: () => boolean, maxSteps = 6000): boolean => {
    for (let i = 0; i < maxSteps; i++) {
      if (predicate()) return true
      step()
    }
    return predicate()
  }
  const join = (username: string, keyword: string, platform: ChatPlatform = 'tiktok'): void => {
    engine.handleMessage(
      createChatMessage({ id: `${username}-${keyword}`, kind: 'textMessageEvent', platform, username, text: keyword }),
    )
  }

  return { clock, engine, events, warn, step, stepUntil, join }
}

describe('BattleArenaEngine lifecycle', () => {
  beforeEach(() => resetEntityIds())

  it('starts idle', () => {
    const { engine } = setup()
    expect(engine.matchState).toBe('idle')
    expect(engine.id).toBe('battle-arena')
  })

  it('moves to waitingFighters on start', () => {
    const { engine } = setup()
    engine.start()
    expect(engine.matchState).toBe('waitingFighters')
  })

  it('warns instead of restarting a running match', () => {
    const { engine, warn } = setup()
    engine.start()
    engine.start()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(engine.matchState).toBe('waitingFighters')
  })

  it('ignores join messages while idle (Req 4 AC6)', () => {
    const { engine, join, step } = setup()
    join('andi', 'a')
    step()
    expect(engine.getState().fighters.count).toBe(0)
  })

  it('applies a join while still waiting for fighters, before any tick runs', () => {
    const { engine, join, step } = setup()
    engine.start()
    join('andi', 'a')
    step()
    expect(engine.getState().fighters.count).toBe(1)
    expect(engine.getState().tick).toBe(0)
  })

  it('waits for at least one fighter on each side before counting down', () => {
    const { engine, join, step } = setup()
    engine.start()
    join('andi', 'a')
    step(5)
    expect(engine.matchState).toBe('waitingFighters')
    join('budi', 'b')
    step()
    expect(engine.matchState).toBe('countdown')
    expect(engine.getState().roundIndex).toBe(1)
  })

  /*
   * Bunyi 3-2-1 menempel di sini. `stateChanged` hanya menandai masuknya countdown, jadi
   * tanpa event ini knop "Hitung mundur" di panel SOUND mengatur bunyi yang tidak ada.
   */
  it('beeps once per second of the countdown, ending on zero', () => {
    const config = fastConfig()
    config.gameplay = { ...config.gameplay, countdownDurationSec: 3 }
    const { engine, join, stepUntil, events } = setup(config)
    engine.start()
    join('andi', 'a')
    join('budi', 'b')
    stepUntil(() => engine.matchState === 'battle')

    const seconds = events.flatMap((e) => (e.type === 'countdownTick' ? [e.secondsLeft] : []))
    expect(seconds).toEqual([3, 2, 1, 0])
  })

  it('runs no simulation ticks until the countdown finishes', () => {
    const { engine, join, step } = setup()
    engine.start()
    join('andi', 'a')
    join('budi', 'b')
    step()
    expect(engine.matchState).toBe('countdown')
    step(10)
    expect(engine.getState().tick).toBe(0)
    step(12)
    expect(engine.matchState).toBe('battle')
  })

  it('ticks the simulation once the battle starts', () => {
    const { engine, join, step, stepUntil } = setup()
    engine.start()
    join('andi', 'a')
    join('budi', 'b')
    step()
    stepUntil(() => engine.matchState === 'battle')
    step(5)
    expect(engine.getState().tick).toBeGreaterThan(0)
  })

  it('reports the interpolation alpha left over from the tick it just ran', () => {
    const { clock, engine, stepUntil, join } = setup()
    engine.start()
    join('ana', 'a')
    join('bob', 'b')
    expect(stepUntil(() => engine.matchState === 'battle')).toBe(true)

    // Setengah tick berlalu tanpa satu pun tick jatuh tempo: sisa akumulator persis 0.5.
    clock.advance(TICK_MS / 2)

    expect(engine.update()).toBeCloseTo(0.5, 5)
  })

  it('reports zero alpha outside battle, where no tick runs at all', () => {
    const { engine } = setup()
    engine.start()

    expect(engine.update()).toBe(0)
  })
})

describe('BattleArenaEngine rounds', () => {
  beforeEach(() => resetEntityIds())

  const startBattle = () => {
    const harness = setup()
    harness.engine.start()
    harness.join('andi', 'a')
    harness.join('budi', 'b')
    harness.step()
    harness.stepUntil(() => harness.engine.matchState === 'battle')
    return harness
  }

  it('ends the round and credits the winning side', () => {
    const { engine, events, stepUntil } = startBattle()
    expect(stepUntil(() => engine.matchState === 'victory')).toBe(true)

    const roundEnded = events.find((e) => e.type === 'roundEnded')
    expect(roundEnded).toBeDefined()
    const winner = engine.getState().roundWinner
    expect(winner === 'a' || winner === 'b').toBe(true)
    if (winner !== null) expect(engine.getState().roundsWon[winner]).toBe(1)
  })

  it('starts the next round after the celebration, with fighters revived and the score cleared', () => {
    const { engine, stepUntil } = startBattle()
    stepUntil(() => engine.matchState === 'victory')
    expect(stepUntil(() => engine.matchState === 'countdown')).toBe(true)

    const state = engine.getState()
    expect(state.roundIndex).toBe(2)
    expect(state.roundScore).toEqual({ a: 0, b: 0 })
    expect(state.roundWinner).toBeNull()
    expect(state.fighters.list().every((f) => f.alive && f.hp === f.maxHp)).toBe(true)
  })

  it('keeps cumulative kills and deaths across rounds', () => {
    const { engine, stepUntil } = startBattle()
    stepUntil(() => engine.matchState === 'victory')

    const sum = (key: 'kills' | 'deaths') =>
      engine.getState().fighters.list().reduce((total, f) => total + f[key], 0)
    const killsAtVictory = sum('kills')
    expect(killsAtVictory).toBeGreaterThan(0)
    expect(sum('deaths')).toBe(killsAtVictory)

    stepUntil(() => engine.matchState === 'countdown')
    expect(sum('kills')).toBe(killsAtVictory)
    expect(sum('deaths')).toBe(killsAtVictory)
  })

  it('goes to Result once one side has won the majority of rounds', () => {
    const { engine, events, stepUntil } = startBattle()
    expect(stepUntil(() => engine.matchState === 'result')).toBe(true)

    const state = engine.getState()
    expect(state.matchWinner).not.toBeNull()
    if (state.matchWinner !== null) expect(state.roundsWon[state.matchWinner]).toBe(2)
    expect(events.some((e) => e.type === 'matchEnded')).toBe(true)
  })

  /*
   * Siaran tidak boleh berhenti di layar kosong: match yang selesai wajar melewati Reset —
   * skor benar-benar dibersihkan — lalu langsung membuka lobi match berikutnya. Roster-nya
   * IKUT: penonton yang sudah bermain tidak boleh diminta mengetik keyword lagi tiap match,
   * dan karena kedua sisi sudah terisi, lobinya langsung maju ke countdown.
   */
  it('loops from Result through Reset into a fresh lobby that keeps the roster', () => {
    const { clock, engine, stepUntil } = startBattle()
    stepUntil(() => engine.matchState === 'result')
    const before = engine.getState().fighters.count
    clock.advance(RESULT_AUTO_ADVANCE_MS)
    engine.update()
    expect(engine.matchState).toBe('countdown')
    expect(engine.getState().fighters.count).toBe(before)
    expect(engine.getState().roundsWon).toEqual({ a: 0, b: 0 })
    for (const f of engine.getState().fighters.list()) expect(f.kills).toBe(0)
  })

  it('lets the creator confirm the result without waiting, and loops the same way', () => {
    const { engine, stepUntil } = startBattle()
    stepUntil(() => engine.matchState === 'result')
    engine.confirmResult()
    expect(engine.matchState).toBe('countdown')
  })

  /* Yang TIDAK ikut looping: creator yang mengakhiri sesi sendiri. */
  it('stays idle after a creator reset instead of opening a new lobby', () => {
    const { engine, stepUntil, step } = startBattle()
    stepUntil(() => engine.matchState === 'result')
    engine.reset()
    step(3)
    expect(engine.matchState).toBe('idle')
  })
})

describe('BattleArenaEngine controls', () => {
  beforeEach(() => resetEntityIds())

  it('stop() pauses ticking without changing the state', () => {
    const { engine, join, step, stepUntil } = setup()
    engine.start()
    join('andi', 'a')
    join('budi', 'b')
    step()
    stepUntil(() => engine.matchState === 'battle')
    step(3)
    const frozenAt = engine.getState().tick
    engine.stop()
    step(20)
    expect(engine.matchState).toBe('battle')
    expect(engine.getState().tick).toBe(frozenAt)
  })

  it('reset() empties the arena and returns to idle from mid-battle', () => {
    const { engine, join, step, stepUntil } = setup()
    engine.start()
    join('andi', 'a')
    join('budi', 'b')
    step()
    stepUntil(() => engine.matchState === 'battle')
    engine.reset()
    expect(engine.matchState).toBe('idle')
    expect(engine.getState().fighters.count).toBe(0)
    expect(engine.getState().tick).toBe(0)
  })

  it('accepts a directly enqueued action, such as a dashboard barrage', () => {
    const { engine, join, step } = setup()
    engine.start()
    join('andi', 'a')
    join('budi', 'b')
    step()
    engine.enqueue(createBattleAction({ type: 'damage', target: sideTarget('b'), value: 3 }))
    step()
    const budi = engine.getState().fighters.get('tiktok:budi')
    expect(budi?.hp).toBe(7)
  })

  it('applies a config change from the next evaluation onwards', () => {
    const { engine, join, step } = setup()
    engine.start()
    join('andi', 'a')
    join('budi', 'b')
    step()
    expect(engine.matchState).toBe('countdown')

    const slower = { ...engine.getConfig(), gameplay: { ...engine.getConfig().gameplay, countdownDurationSec: 10 } }
    engine.setConfig(slower)

    // Countdown dimasuki pada clock 50 ms; dengan durasi baru 10 detik ia baru berakhir
    // pada clock 10.050 ms, yaitu 200 tick setelah masuk.
    step(40)
    expect(engine.matchState).toBe('countdown')
    step(159)
    expect(engine.matchState).toBe('countdown')
    step(1)
    expect(engine.matchState).toBe('battle')
  })
})

describe('BattleArenaEngine and synthetic viewers', () => {
  beforeEach(() => resetEntityIds())

  it('clears every demo fighter when the first real viewer speaks (Req 18 AC8)', () => {
    const { engine, events, join, step } = setup()
    engine.start()
    join('demo1', 'a', 'demo')
    join('demo2', 'b', 'demo')
    step()
    expect(engine.getState().fighters.count).toBe(2)

    join('realviewer', 'a', 'tiktok')
    step()

    expect(engine.getState().fighters.get('demo:demo1')).toBeUndefined()
    expect(engine.getState().fighters.get('demo:demo2')).toBeUndefined()
    expect(engine.getState().fighters.get('tiktok:realviewer')).toBeDefined()
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'realViewerArrived', removedDemoFighters: 2 }),
    )
  })

  it('clears demo fighters only once', () => {
    const { engine, events, join, step } = setup()
    engine.start()
    join('demo1', 'a', 'demo')
    step()
    join('real1', 'a', 'tiktok')
    join('real2', 'b', 'tiktok')
    step()
    expect(events.filter((e) => e.type === 'realViewerArrived')).toHaveLength(1)
  })

  it('tops up practice fighters through the roster filler while waiting', () => {
    const clock = createManualClock(0)
    const config = fastConfig()
    config.gameplay.practiceFighters = true
    const filled: number[] = []
    const engine = new BattleArenaEngine({
      clock,
      seed: 1,
      config,
      roster: {
        fill: (fighters) => {
          filled.push(fighters.count)
          return []
        },
        releaseOne: () => null,
      },
    })
    engine.start()
    clock.advance(TICK_MS)
    engine.update()
    expect(filled.length).toBeGreaterThan(0)
  })

  it('releases one practice bot for each real viewer joining that side', () => {
    const clock = createManualClock(0)
    const config = fastConfig()
    config.gameplay.practiceFighters = true
    const released: string[] = []
    const engine = new BattleArenaEngine({
      clock,
      seed: 1,
      config,
      roster: {
        fill: () => [],
        releaseOne: (_fighters, side) => {
          released.push(side)
          return null
        },
      },
    })
    engine.start()
    engine.handleMessage(
      createChatMessage({ id: 'm', kind: 'textMessageEvent', platform: 'tiktok', username: 'andi', text: 'a' }),
    )
    clock.advance(TICK_MS)
    engine.update()
    expect(released).toEqual(['a'])
  })
})

describe('kursi arena saat sisi mentok', () => {
  beforeEach(() => resetEntityIds())

  it('menerima viewer sungguhan meski bot practice sudah memenuhi cap', () => {
    // Cap ≤ PRACTICE_MIN_PER_SIDE: bot mengisi sisi sampai penuh, dan `releaseOne` baru
    // berjalan SESUDAH join berhasil — jadi tanpa pembebasan kursi di registry, bot tidak
    // pernah sempat mundur dan penonton sungguhan tidak pernah bisa masuk.
    const config = fastConfig()
    config.gameplay = { ...config.gameplay, maxFightersPerSide: 3, practiceFighters: true, countdownDurationSec: 5 }
    const { engine, join, step } = setup(config, new PracticeFighters())
    engine.start()
    step(2)
    expect(engine.getState().fighters.countOnSide('a')).toBe(3)

    join('penonton', config.sides.a.keyword)
    step()
    expect(engine.getState().fighters.get('tiktok:penonton')).toBeDefined()
    // Satu bot saja yang mundur: registry membebaskan kursinya, jadi `releaseOne` tidak
    // boleh melepas satu lagi di atasnya.
    expect(engine.getState().fighters.countOnSide('a')).toBe(3)
  })
})

describe('daftar tunggu dan komentar tertampung', () => {
  beforeEach(() => resetEntityIds())

  const keyword = (side: 'a' | 'b') => defaultConfig().sides[side].keyword

  it('memasukkan yang antre begitu ada kursi, tanpa ia mengetik ulang', () => {
    const config = fastConfig()
    config.gameplay = { ...config.gameplay, maxFightersPerSide: 1 }
    const { engine, join, step } = setup(config)
    engine.start()
    join('duluan', keyword('a'))
    join('nunggu', keyword('a'))
    step()
    expect(engine.getState().fighters.get('tiktok:nunggu')).toBeUndefined()

    // Kursi kosong tanpa satu pun komentar baru: yang duluan pindah ke sisi seberang.
    join('duluan', keyword('b'))
    step(2)
    expect(engine.getState().fighters.get('tiktok:nunggu')?.side).toBe('a')
  })

  it('tidak mengantre dua kali dan memakai keyword terakhir yang diketik', () => {
    const config = fastConfig()
    config.gameplay = { ...config.gameplay, maxFightersPerSide: 1 }
    const { engine, join, step } = setup(config)
    engine.start()
    join('duluan-a', keyword('a'))
    join('duluan-b', keyword('b'))
    join('nunggu', keyword('a'))
    join('nunggu', keyword('a'))
    join('nunggu', keyword('b'))
    step()

    // Kursi sisi b baru terbuka saat penghuninya mati — mayat pun disuruh mundur, aturan
    // yang sama persis dengan yang dipakai komentar baru.
    const duluanB = engine.getState().fighters.get('tiktok:duluan-b')
    if (duluanB === undefined) throw new Error('expected a fighter')
    duluanB.alive = false
    step(2)
    expect(engine.getState().fighters.get('tiktok:nunggu')?.side).toBe('b')
  })

  it('menerapkan komentar yang datang selama layar hasil di lobi berikutnya', () => {
    const { clock, engine, join, stepUntil } = setup()
    engine.start()
    join('a1', keyword('a'))
    join('b1', keyword('b'))
    stepUntil(() => engine.matchState === 'result')

    join('penonton-telat', keyword('a'))
    expect(engine.getState().fighters.get('tiktok:penonton-telat')).toBeUndefined()

    clock.advance(RESULT_AUTO_ADVANCE_MS)
    engine.update()
    engine.update()
    expect(engine.getState().fighters.get('tiktok:penonton-telat')).toBeDefined()
  })

  it('tidak menampung gift maupun like — keduanya akan meledak di match yang salah', () => {
    const { clock, engine, events, stepUntil } = setup()
    engine.start()
    engine.handleMessage(
      createChatMessage({ id: 'a1', kind: 'textMessageEvent', platform: 'tiktok', username: 'a1', text: keyword('a') }),
    )
    engine.handleMessage(
      createChatMessage({ id: 'b1', kind: 'textMessageEvent', platform: 'tiktok', username: 'b1', text: keyword('b') }),
    )
    stepUntil(() => engine.matchState === 'result')

    engine.handleMessage(
      createChatMessage({
        id: 'gift-telat',
        kind: 'giftEvent',
        platform: 'tiktok',
        username: 'a1',
        giftName: 'Galaxy',
        giftCount: 1,
        giftCoins: 1000,
      }),
    )
    const before = events.length
    clock.advance(RESULT_AUTO_ADVANCE_MS)
    engine.update()
    engine.update()
    expect(events.slice(before).some((e) => e.type === 'actionApplied')).toBe(false)
  })
})

describe('koin gift', () => {
  beforeEach(() => resetEntityIds())

  it('mencatat koin gift walau tidak ada satu rule pun yang cocok', () => {
    const { engine, join, step } = setup()
    engine.start()
    join('andi', 'a')
    step()

    engine.handleMessage(
      createChatMessage({
        id: 'g1',
        kind: 'giftEvent',
        platform: 'tiktok',
        username: 'andi',
        giftName: 'Gift Yang Tidak Ada Rule-nya',
        giftCount: 2,
        giftCoins: 400,
      }),
    )

    expect(engine.getState().fighters.get('tiktok:andi')?.giftCoins).toBe(400)
  })
})

describe('ultimate saat ronde berakhir (Plan 6a)', () => {
  beforeEach(() => resetEntityIds())

  /** Ultimate sengaja dibuat panjang supaya ronde dijamin selesai lebih dulu. */
  const slowUltimate = (): BattleArenaConfig => {
    const config = fastConfig()
    config.gameplay.nuke = { ...config.gameplay.nuke, durationMs: 3000 }
    return config
  }

  const nuke = (username: string) =>
    createBattleAction({
      type: 'nuke',
      target: sideTarget('b'),
      value: 50,
      actor: { platform: 'tiktok' as const, username, avatarUrl: null },
      giftName: 'Lion',
      giftCoins: 10,
    })

  const inBattle = (config: BattleArenaConfig = slowUltimate()) => {
    const harness = setup(config)
    harness.engine.start()
    harness.join('andi', 'a')
    harness.join('cici', 'b')
    harness.stepUntil(() => harness.engine.matchState === 'battle')
    return harness
  }

  it('ultimate yang masih di udara ditandai stale, bukan dihapus', () => {
    const { engine, step, stepUntil } = inBattle()
    const state = engine.getState()

    engine.enqueue(nuke('andi'))
    step(2)
    expect(state.activeUltimates).toHaveLength(1)

    stepUntil(() => engine.matchState === 'victory')

    expect(state.activeUltimates).toHaveLength(1)
    expect(state.activeUltimates[0]?.stale).toBe(true)
    expect(state.activeUltimates[0]?.expiresAtTick).not.toBeNull()
  })

  it('damage yang belum mendarat hangus — tidak ada HP yang turun setelah ronde berakhir', () => {
    const { engine, step, stepUntil } = inBattle()
    const state = engine.getState()

    engine.enqueue(nuke('andi'))
    step(2)
    stepUntil(() => engine.matchState === 'victory')

    const hpAfterRound = [...state.fighters.values()].map((f) => f.hp)
    step(10)

    expect([...state.fighters.values()].map((f) => f.hp)).toEqual(hpAfterRound)
  })

  it('antrean yang belum dilepas tetap menghasilkan record stale, satu per entri', () => {
    const config = slowUltimate()
    config.gameplay.nuke = { ...config.gameplay.nuke, hardCap: 1 }
    const { engine, step, stepUntil } = inBattle(config)
    const state = engine.getState()

    for (const name of ['gifter1', 'gifter2', 'gifter3']) engine.enqueue(nuke(name))
    step(2)
    expect(state.activeUltimates).toHaveLength(1)
    expect(state.pendingUltimates).toHaveLength(2)

    stepUntil(() => engine.matchState === 'victory')

    expect(state.pendingUltimates).toHaveLength(0)
    expect(state.activeUltimates).toHaveLength(3)
    expect(state.activeUltimates.every((u) => u.stale)).toBe(true)
  })

  it('ronde berikutnya mulai bersih — callout ronde lalu tidak menggantung', () => {
    const { engine, step, stepUntil } = inBattle()
    const state = engine.getState()

    engine.enqueue(nuke('andi'))
    step(2)
    stepUntil(() => engine.matchState === 'victory')
    expect(state.activeUltimates).toHaveLength(1)

    stepUntil(() => engine.matchState === 'countdown')

    expect(state.activeUltimates).toHaveLength(0)
  })
})
