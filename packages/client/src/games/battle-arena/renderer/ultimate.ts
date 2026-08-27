import { CHARGE_END, IMPACT_AT, IMPACT_END } from '@lga/shared'
import type { BattleArenaConfig, NukeTier } from '../config/index.js'
import type { InterpolatedUltimate } from './interpolate.js'

/**
 * Fase satu ultimate sebagai angka murni.
 *
 * Batasnya TIDAK ditulis ulang di sini — ia diimpor dari @lga/shared, tempat engine
 * menghitung tick pendaratannya dari angka yang sama. Menyalin 0.45 ke berkas ini berarti
 * HP bisa turun sebelum atau sesudah ledakan terlihat, dan tidak ada test yang menangkapnya.
 */
export type UltimatePhase = 'charge' | 'travel' | 'impact' | 'aftermath'

/** Batas milik fase SESUDAHNYA: damage mendarat tepat di IMPACT_AT, jadi frame itu harus impact. */
export function ultimatePhaseAt(progress: number): UltimatePhase {
  if (progress < CHARGE_END) return 'charge'
  if (progress < IMPACT_AT) return 'travel'
  if (progress < IMPACT_END) return 'impact'
  return 'aftermath'
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

const PHASE_SPAN: Record<UltimatePhase, { from: number; to: number }> = {
  charge: { from: 0, to: CHARGE_END },
  travel: { from: CHARGE_END, to: IMPACT_AT },
  impact: { from: IMPACT_AT, to: IMPACT_END },
  aftermath: { from: IMPACT_END, to: 1 },
}

/**
 * Kemajuan 0–1 DI DALAM fase yang sedang berjalan.
 *
 * Setiap fase menggambar sesuatu yang bergerak dari 0 ke 1 di dalam dirinya sendiri —
 * reticle menutup sepanjang travel, kilatan memudar sepanjang impact. Tanpa fungsi ini,
 * aritmetika batas fase tersalin empat kali.
 */
export function phaseProgress(progress: number): number {
  const span = PHASE_SPAN[ultimatePhaseAt(progress)]
  const width = span.to - span.from
  if (width <= 0) return 1
  return clamp01((progress - span.from) / width)
}

/** Tier netral: dipakai saat creator mengosongkan daftar tier sama sekali. */
const NEUTRAL_TIER: NukeTier = {
  minCoins: 0,
  durationMultiplier: 1,
  densityMultiplier: 1,
  radiusMultiplier: 1,
  calloutIntensity: 1,
}

/**
 * Entri tier yang selalu ada.
 *
 * Indeks dijepit karena record yang sudah di udara membawa indeks dari config LAMA:
 * creator yang memendekkan daftarnya di tengah sesi akan membuat pengalinya NaN, dan
 * ultimate menghilang dari layar tanpa satu pesan error pun.
 */
export function tierFor(tier: number, config: BattleArenaConfig): NukeTier {
  const tiers = config.gameplay.nuke.tiers
  if (tiers.length === 0) return NEUTRAL_TIER
  const index = Math.min(tiers.length - 1, Math.max(0, Math.round(tier)))
  return tiers[index] ?? NEUTRAL_TIER
}

/** Puncak kilatan satu ultimate bertier 0, sebelum dijepit plafon. */
const FLASH_PEAK = 0.5

/**
 * Pangkat peluruhan kilatan.
 *
 * Peluruhan linier menyebar puncaknya ke SELURUH fase impact; pada 182 ms itu berarti layar
 * memutih selama sebelas frame. Freeze frame dan slow-motion dilarang — permainan harus terus
 * berjalan — jadi bobot sebuah ledakan dipikul KONTRAS, dan kontras menuntut kilatannya habis
 * dalam satu-dua frame lalu menyerahkan panggung kembali ke arena yang masih bergerak.
 */
const FLASH_DECAY = 8

/**
 * Alpha kilatan gabungan untuk satu frame.
 *
 * DIJEPIT, bukan dijumlah (spec §7.6). Dua ultimate yang meledak berdekatan akan
 * menjumlahkan dua puncak dan memutihkan seluruh arena; menjepitnya membuat puncak kedua
 * tetap terasa tanpa pernah melewati angka yang disetel creator.
 *
 * `count` dibaca, bukan `ultimates.length`: array itu dipakai ulang antar-frame dan boleh
 * lebih panjang dari jumlah yang berlaku — peringatan yang sama dengan SnapshotView.
 */
export function flashAlpha(
  ultimates: readonly InterpolatedUltimate[],
  count: number,
  config: BattleArenaConfig,
  reducedMotion: boolean,
): number {
  const ceiling = reducedMotion
    ? config.overlay.flashCeilingReducedMotion
    : config.overlay.flashCeiling

  let total = 0
  for (let i = 0; i < count; i++) {
    const u = ultimates[i]
    if (u === undefined || u.stale === 1) continue
    if (ultimatePhaseAt(u.progress) !== 'impact') continue

    // Paling terang di awal impact, padam dalam satu-dua frame — bukan di ujung fasenya.
    total +=
      FLASH_PEAK *
      (1 - phaseProgress(u.progress)) ** FLASH_DECAY *
      tierFor(u.tier, config).calloutIntensity
  }

  return Math.min(total, ceiling)
}
