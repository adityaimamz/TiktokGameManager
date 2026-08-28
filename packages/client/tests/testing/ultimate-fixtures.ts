import { NO_SLOT, SIDE_B, ULTIMATE_MAX_TARGETS } from '@lga/shared'
import type { SnapshotUltimate } from '@lga/shared'
import { defaultConfig } from '../../src/games/battle-arena/config/index.js'
import { AvatarCache } from '../../src/games/battle-arena/renderer/avatar-cache.js'
import { DeathFade } from '../../src/games/battle-arena/renderer/death-fade.js'
import { HpDisplay } from '../../src/games/battle-arena/renderer/hp-display.js'
import { computeStageLayout } from '../../src/games/battle-arena/renderer/layout.js'
import type { RenderDeps } from '../../src/games/battle-arena/renderer/deps.js'
import type { InterpolatedFighter } from '../../src/games/battle-arena/renderer/interpolate.js'

/**
 * Fixture record ultimate untuk test.
 *
 * Tinggal di `src/testing/` — yang sudah dilarang depcruise diimpor kode produksi — dan
 * bukan di sebelah salah satu berkas test, supaya setiap test yang membangun
 * `SnapshotUltimate` memakai bentuk yang persis sama. Bentuk yang berbeda-beda antar-berkas
 * test adalah cara paling cepat membuat satu varian lulus karena fixture-nya kebetulan lebih
 * longgar daripada tetangganya.
 */

/** Daftar slot sepanjang ULTIMATE_MAX_TARGETS, dipadatkan dari depan dengan NO_SLOT. */
export function padSlots(slots: readonly number[] = []): number[] {
  const out = new Array<number>(ULTIMATE_MAX_TARGETS).fill(NO_SLOT)
  slots.forEach((slot, i) => {
    if (i < ULTIMATE_MAX_TARGETS) out[i] = slot
  })
  return out
}

/**
 * Satu ultimate, dengan bawaan yang masuk akal.
 *
 * `targetSlots` selalu DIPADATKAN ke panjang penuh, persis seperti yang dilakukan decoder —
 * test yang memberi array pendek akan lolos padahal produksi selalu menerima yang panjangnya
 * penuh, dan perbedaan itu justru yang menyembunyikan bug ekor daftar.
 */
export function ultimateWith(over: Partial<SnapshotUltimate> = {}): SnapshotUltimate {
  return {
    casterSlot: 0,
    variant: 0,
    tier: 0,
    originX: 25,
    originY: 50,
    targetX: 75,
    targetY: 50,
    progress: 0.4,
    killCount: 0,
    totalDamage: 0,
    stale: 0,
    slot: 0,
    staggerProgress: 0.02,
    msPerProgress: 2600,
    ...over,
    targetSlots: padSlots(over.targetSlots),
  }
}

/** Fighter berjajar di separuh kanan arena, satu per slot. */
export function fightersFor(
  count: number,
  deadSlots: readonly number[] = [],
): InterpolatedFighter[] {
  const list: InterpolatedFighter[] = []
  for (let i = 0; i < count; i++) {
    list.push({
      slotIndex: i,
      x: 60 + (i % 5) * 7,
      y: 25 + Math.floor(i / 5) * 13,
      hp: 200,
      maxHp: 200,
      side: SIDE_B,
      alive: deadSlots.includes(i) ? 0 : 1,
      facingAngle: 0,
      targetSlot: NO_SLOT,
      kills: 0,
      giftCoins: 0,
    })
  }
  return list
}

/**
 * Konteks satu frame yang lengkap.
 *
 * Ditulis sekali di sini, bukan di tiap berkas test, supaya ketiga test varian memakai bentuk
 * `RenderDeps` yang persis sama — bentuk yang berbeda-beda antar-berkas adalah cara paling
 * cepat membuat satu varian lulus karena fixture-nya kebetulan lebih longgar.
 */
export function depsFor(
  options: {
    fighters?: number
    deadSlots?: readonly number[]
    reducedMotion?: boolean
    config?: RenderDeps['config']
  } = {},
): RenderDeps {
  const fighters = fightersFor(options.fighters ?? 0, options.deadSlots ?? [])
  return {
    layout: computeStageLayout(1600, 900, 'landscape'),
    config: options.config ?? defaultConfig(),
    avatars: new AvatarCache(),
    nowMs: 0,
    deathFade: new DeathFade(),
    hpDisplay: new HpDisplay(),
    sizeDisplay: new HpDisplay(),
    reducedMotion: options.reducedMotion ?? false,
    fighters,
    fighterCount: fighters.length,
  }
}
