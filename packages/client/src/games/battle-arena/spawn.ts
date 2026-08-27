import type { Vec2 } from '../../framework/entity/entity.js'
import type { Rng } from '../../framework/rng.js'
import { FIGHTER_EDGE_MARGIN, FIGHTER_HIT_RADIUS, sideHalfBounds } from './arena.js'
import type { SideId } from './types.js'

/** Percobaan penempatan sebelum jatuh ke kandidat paling lapang (Req 6 AC4). */
export const SPAWN_ATTEMPTS = 10

/** Fighter yang sudah berdiri di arena, beserta seberapa besar ia sekarang. */
export interface Occupant {
  x: number
  y: number
  radius: number
}

export interface SpawnPositionOptions {
  rng: Rng
  side: SideId
  /** Posisi seluruh fighter yang sudah ada di arena — kedua sisi, bukan hanya sisi ini. */
  occupied: readonly Occupant[]
  /** Radius fighter yang sedang ditempatkan; ia sendiri bisa saja sudah besar. */
  radius?: number
  attempts?: number
  /** Sela BERSIH antar-tepi, di atas jumlah kedua radius. */
  clearance?: number
}

/**
 * Sela tersempit antara tepi kandidat dan tepi tetangga terdekatnya.
 *
 * Jarak antar-PUSAT tidak lagi cukup begitu fighter punya ukuran berbeda-beda: dua blob
 * besar yang pusatnya terpisah sekian persen tetap bertumpuk, sementara dua blob kecil
 * pada jarak sama justru berjauhan. Yang dijaga karena itu jarak antar-TEPI.
 *
 * Masih diukur dalam persen mentah, tanpa koreksi aspek — ini heuristik tata letak, bukan
 * uji tabrakan. Akibatnya sebarannya lebih longgar mendatar daripada menegak, dan itu
 * memang tidak apa-apa di sini.
 */
function nearestClearance(p: Vec2, radius: number, occupied: readonly Occupant[]): number {
  let nearest = Number.POSITIVE_INFINITY
  for (const o of occupied) {
    const gap = Math.hypot(p.x - o.x, p.y - o.y) - radius - o.radius
    if (gap < nearest) nearest = gap
  }
  return nearest
}

/**
 * Titik spawn di separuh sisi sendiri, sejauh mungkin dari fighter lain.
 *
 * Berhenti menggambar kandidat begitu satu memenuhi jarak minimum, sehingga arena yang
 * masih lengang hanya memakai dua angka acak. Saat separuh arena sudah padat dan
 * kesepuluh kandidat melanggar, yang dipilih adalah yang PALING LAPANG — menumpuk di
 * satu titik akan membuat fighter saling menutupi di layar.
 */
export function findSpawnPosition(opts: SpawnPositionOptions): Vec2 {
  const attempts = opts.attempts ?? SPAWN_ATTEMPTS
  const radius = opts.radius ?? FIGHTER_HIT_RADIUS
  const clearance = opts.clearance ?? FIGHTER_EDGE_MARGIN
  const bounds = sideHalfBounds(opts.side, radius / FIGHTER_HIT_RADIUS)

  let best: Vec2 = { x: bounds.minX, y: bounds.minY }
  let bestClearance = Number.NEGATIVE_INFINITY

  for (let i = 0; i < attempts; i++) {
    const candidate: Vec2 = {
      x: opts.rng.range(bounds.minX, bounds.maxX),
      y: opts.rng.range(bounds.minY, bounds.maxY),
    }
    const gap = nearestClearance(candidate, radius, opts.occupied)
    if (gap >= clearance) return candidate
    if (gap > bestClearance) {
      bestClearance = gap
      best = candidate
    }
  }

  return best
}
