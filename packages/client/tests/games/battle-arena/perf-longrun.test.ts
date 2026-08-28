import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { TICK_MS } from '../../../src/games/battle-arena/arena.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../src/games/battle-arena/config/index.js'
import { BattleArenaEngine } from '../../../src/games/battle-arena/engine.js'

/**
 * Sesi 60 menit terkompresi (Req 20 AC3), dan itu puluhan detik CPU — terlalu mahal untuk
 * dibayar tiap kali seseorang menjalankan `npm test`.
 *
 * Jalankan sengaja:
 *   PowerShell:  $env:LGA_LONG_RUN=1; npx vitest run packages/client/src/games/battle-arena/perf-longrun.test.ts
 *   bash:        LGA_LONG_RUN=1 npx vitest run packages/client/src/games/battle-arena/perf-longrun.test.ts
 *
 * Gerbangnya env, bukan `--expose-gc`: Vitest menjalankan test di worker terpisah, dan flag
 * Node di proses induk belum tentu sampai ke sana sementara variabel environment selalu
 * sampai. Tambahkan `--expose-gc` lewat NODE_OPTIONS untuk angka yang lebih bersih; tanpa itu
 * pengukurannya lebih berderau tapi anggaran 50 MB masih jauh lebih longgar dari deraunya.
 */
const ENABLED = process.env['LGA_LONG_RUN'] === '1'

const PER_SIDE = 100
const HOUR_TICKS = (60 * 60 * 1000) / TICK_MS
const HEAP_BUDGET_BYTES = 50 * 1024 * 1024

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

/** Best-effort: `gc` hanya ada saat Node dijalankan dengan `--expose-gc`. */
const collect = (): void => {
  const maybeGc = (globalThis as { gc?: () => void }).gc
  if (typeof maybeGc === 'function') maybeGc()
}

describe.skipIf(!ENABLED)('Req 20 AC3 — sesi 60 menit', () => {
  it(
    'tidak menumbuhkan heap lebih dari 50 MB',
    () => {
      const clock = createManualClock(0)
      const engine = new BattleArenaEngine({ clock, seed: 20, config: perfConfig() })

      engine.start()
      fillBothSides(engine)
      for (let i = 0; i < 100; i++) {
        clock.advance(TICK_MS)
        engine.update()
      }

      collect()
      const before = process.memoryUsage().heapUsed

      for (let i = 0; i < HOUR_TICKS; i++) {
        clock.advance(TICK_MS)
        engine.update()
      }

      collect()
      const grew = process.memoryUsage().heapUsed - before

      console.log(
        `[Req 20 AC3] ${HOUR_TICKS} tick → heap +${(grew / 1024 / 1024).toFixed(1)} MB` +
          (typeof (globalThis as { gc?: () => void }).gc === 'function'
            ? ''
            : ' (tanpa --expose-gc, angka berderau)'),
      )

      expect(grew).toBeLessThan(HEAP_BUDGET_BYTES)
      // Kebocoran sesungguhnya di engine ini berbentuk array yang tidak pernah dilepas.
      // Itu terbaca langsung, tanpa perlu menebak lewat byte.
      expect(engine.getState().fighters.list().length).toBe(PER_SIDE * 2)
    },
    600_000,
  )
})
