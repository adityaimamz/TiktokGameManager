import type { BattleArenaConfig } from '../../config/index.js'
import type { InterpolatedUltimate } from '../interpolate.js'
import { tierFor } from '../ultimate.js'
import type { UltimatePhase } from '../ultimate.js'
import { nukeTypeFromIndex } from '../../snapshot.js'

/**
 * Kurva fase jalur FX — DILONGGARKAN dari @lga/shared, dan itu keputusan yang disengaja.
 *
 * Ledakan berlapis butuh panggung: impact 182 ms cukup untuk satu kilatan, tidak cukup untuk
 * bola api yang mengembang, dua ring kejut, lalu kolom yang naik. Angka di sini memberi impact
 * ~24% kurva pada durasi 3100 ms (≈745 ms) tanpa menyentuh CHARGE_END/IMPACT_AT milik engine.
 *
 * KONSEKUENSINYA MENGIKAT: engine menghitung tick pendaratan dari IMPACT_AT di @lga/shared.
 * Selama FX_IMPACT_AT ≠ IMPACT_AT, damage mendarat pada progress yang BERBEDA dari kilatan
 * yang terlihat. Dua pilihan, dan hanya dua: naikkan IMPACT_AT di @lga/shared ke 0.5 (engine
 * dan renderer bergerak bersama), atau terima jeda ~150 ms antara HP turun dan ledakan.
 * Jangan tinggalkan keduanya tak diputuskan.
 */
export const FX_CHARGE_END = 0.16
export const FX_IMPACT_AT = 0.5
export const FX_IMPACT_END = 0.74

/** Durasi jalur FX untuk keempat varian lama. */
export const FX_DURATION_MS = 3100
/** Durasi dua varian baru: keduanya punya fase tarik/rantai yang butuh waktu lebih. */
export const FX_DURATION_MS_NEW = 3500

export function fxPhaseAt(progress: number): UltimatePhase {
  if (progress < FX_CHARGE_END) return 'charge'
  if (progress < FX_IMPACT_AT) return 'travel'
  if (progress < FX_IMPACT_END) return 'impact'
  return 'aftermath'
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

const SPAN: Record<UltimatePhase, { from: number; to: number }> = {
  charge: { from: 0, to: FX_CHARGE_END },
  travel: { from: FX_CHARGE_END, to: FX_IMPACT_AT },
  impact: { from: FX_IMPACT_AT, to: FX_IMPACT_END },
  aftermath: { from: FX_IMPACT_END, to: 1 },
}

export function fxPhaseProgress(progress: number): number {
  const span = SPAN[fxPhaseAt(progress)]
  const width = span.to - span.from
  if (width <= 0) return 1
  return clamp01((progress - span.from) / width)
}

/** Puncak kilatan jalur FX, dan peluruhannya. Lebih tinggi dan lebih tajam dari jalur lama. */
const FLASH_PEAK = 0.6
const FLASH_DECAY = 9
/**
 * Singularity MENELAN cahaya, jadi kilatan putih justru merusak bacaannya. Ia tetap dapat
 * satu porsi kecil supaya runtuhnya masih terasa, bukan nol.
 */
const SINGULARITY_FLASH = 0.14

/**
 * Kilatan arena untuk satu frame jalur FX. DIJEPIT, bukan dijumlah — alasan yang sama dengan
 * `flashAlpha` di ultimate.ts: dua ultimate berdekatan tidak boleh memutihkan seluruh arena.
 */
export function fxFlashAlpha(
  ultimates: readonly InterpolatedUltimate[],
  count: number,
  config: BattleArenaConfig,
  reducedMotion: boolean,
): number {
  const ceiling = reducedMotion ? config.overlay.flashCeilingReducedMotion : 0.5

  let total = 0
  for (let i = 0; i < count; i++) {
    const u = ultimates[i]
    if (u === undefined || u.stale === 1) continue
    if (fxPhaseAt(u.progress) !== 'impact') continue
    const scale = nukeTypeFromIndex(u.variant) === 'singularity' ? SINGULARITY_FLASH : 1
    total +=
      FLASH_PEAK *
      scale *
      (1 - fxPhaseProgress(u.progress)) ** FLASH_DECAY *
      tierFor(u.tier, config).calloutIntensity
  }

  return Math.min(total, ceiling)
}
