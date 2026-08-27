import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import { createManualClock } from '../../framework/clock.js'
import { TICK_MS } from './arena.js'
import { defaultConfig } from './config/index.js'
import type { BattleArenaConfig } from './config/index.js'
import { BattleArenaEngine } from './engine.js'

/** Plafon Req 20 AC4: 100 per sisi. */
const PER_SIDE = 100
/** 30 detik simulasi — cukup panjang untuk melewati derau, cukup pendek untuk suite. */
const MEASURED_TICKS = 600
/** Tick pemanasan: countdown lewat, semua fighter sudah spawn dan mulai menembak. */
const WARMUP_TICKS = 100

/**
 * Ronde tidak boleh selesai di tengah pengukuran — kalau selesai, yang terukur adalah
 * arena yang separuh kosong, dan angkanya berbohong ke arah yang menyenangkan.
 *
 * `baseHp` dan `killsToWinRound` karena itu dipatok di plafon rentangnya yang sah
 * (`config/schema.ts`), bukan di angka mustahil yang akan ditolak validasi.
 */
const perfConfig = (): BattleArenaConfig => {
  const config = defaultConfig()
  config.gameplay = {
    ...config.gameplay,
    maxFightersPerSide: PER_SIDE,
    baseHp: 9999,
    baseDamage: 1,
    killsToWinRound: 999,
    countdownDurationSec: 1,
    practiceFighters: false,
  }
  return config
}

/** Keyword bawaan kedua sisi adalah 'a' dan 'b' (`config/defaults.ts`). */
const fillBothSides = (engine: BattleArenaEngine): void => {
  for (let i = 1; i <= PER_SIDE; i++) {
    for (const side of ['a', 'b'] as const) {
      engine.handleMessage(
        createChatMessage({
          id: `${side}${i}`,
          kind: 'textMessageEvent',
          platform: 'tiktok',
          username: `viewer-${side}${i}`,
          text: side,
        }),
      )
    }
  }
}

const advance = (
  engine: BattleArenaEngine,
  clock: { advance: (ms: number) => void },
  ticks: number,
): void => {
  for (let i = 0; i < ticks; i++) {
    clock.advance(TICK_MS)
    engine.update()
  }
}

describe('Req 20 — 200 fighter di satu arena', () => {
  it('menjalankan satu tick jauh di bawah anggaran 50 ms', () => {
    const clock = createManualClock(0)
    const engine = new BattleArenaEngine({ clock, seed: 20, config: perfConfig() })

    engine.start()
    fillBothSides(engine)
    advance(engine, clock, WARMUP_TICKS)

    // Kalau arenanya tidak benar-benar penuh, yang diukur bukan yang dijanjikan Req 20.
    expect(engine.getState().fighters.list().length).toBe(PER_SIDE * 2)

    const startedAt = performance.now()
    advance(engine, clock, MEASURED_TICKS)
    const msPerTick = (performance.now() - startedAt) / MEASURED_TICKS

    // Dicetak supaya angkanya bisa disalin ke spec §5 — assertion-nya cuma pagar.
    console.log(`[Req 20 AC1] ${PER_SIDE * 2} fighter → ${msPerTick.toFixed(3)} ms/tick`)

    expect(msPerTick).toBeLessThan(TICK_MS)
  })

  it('tidak menjatuhkan satu fighter pun selama pengukuran', () => {
    const clock = createManualClock(0)
    const engine = new BattleArenaEngine({ clock, seed: 20, config: perfConfig() })

    engine.start()
    fillBothSides(engine)
    advance(engine, clock, WARMUP_TICKS + MEASURED_TICKS)

    // Req 20 AC4: melampaui plafon tidak boleh membuat engine crash atau kehilangan entitas.
    expect(engine.getState().fighters.list().length).toBe(PER_SIDE * 2)
  })
})
