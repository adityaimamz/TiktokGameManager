import { NO_SLOT, ULTIMATE_MAX_TARGETS } from '@lga/shared'
import type {
  SnapshotFighter,
  SnapshotProjectile,
  SnapshotUltimate,
  SnapshotView,
} from '@lga/shared'
import { TICK_MS } from '../arena.js'

/**
 * Menjembatani tick 20 Hz dengan layar 60 Hz (§15 butir 4).
 *
 * Fighter dicocokkan antar-snapshot lewat slotIndex; itulah alasan slot harus stabil
 * sepanjang hidup seorang fighter. Projectile tidak punya identitas di snapshot, jadi ia
 * dimajukan dari kecepatannya sendiri.
 */

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

const TAU = Math.PI * 2

/** Memutar lewat jalur terpendek, supaya blob tidak berputar penuh saat ganti target. */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI
  return a + delta * t
}

/** Pecahan tick yang sudah berlalu, 0–1. Snapshot yang telat diklem, bukan diekstrapolasi. */
export function alphaFromElapsed(elapsedMs: number, tickMs: number = TICK_MS): number {
  if (!(elapsedMs > 0)) return 0
  const alpha = elapsedMs / tickMs
  return alpha > 1 ? 1 : alpha
}

export type InterpolatedFighter = SnapshotFighter

function blank(): InterpolatedFighter {
  return {
    slotIndex: -1,
    x: 0,
    y: 0,
    hp: 0,
    maxHp: 0,
    side: 0,
    alive: 0,
    facingAngle: 0,
    targetSlot: -1,
    kills: 0,
    giftCoins: 0,
  }
}

/**
 * Mengisi `out` dengan fighter versi antara, mengembalikan jumlah yang berlaku.
 *
 * `out` boleh lebih panjang dari nilai kembalian — sama seperti SnapshotView, ia dipakai
 * ulang antar-frame dan tidak pernah dipendekkan.
 */
export function interpolateFighters(
  previous: SnapshotView,
  current: SnapshotView,
  alpha: number,
  out: InterpolatedFighter[],
): number {
  const bySlot = new Map<number, SnapshotFighter>()
  for (let i = 0; i < previous.header.fighterCount; i++) {
    const f = previous.fighters[i]
    if (f !== undefined) bySlot.set(f.slotIndex, f)
  }

  const count = current.header.fighterCount
  while (out.length < count) out.push(blank())

  for (let i = 0; i < count; i++) {
    const cur = current.fighters[i]
    if (cur === undefined) continue
    const target = out[i] as InterpolatedFighter
    const prev = bySlot.get(cur.slotIndex)

    target.slotIndex = cur.slotIndex
    target.hp = cur.hp
    target.maxHp = cur.maxHp
    target.side = cur.side
    target.alive = cur.alive
    target.targetSlot = cur.targetSlot
    target.kills = cur.kills
    target.giftCoins = cur.giftCoins

    // Slot baru, atau fighter yang baru mati/hidup lagi: perpindahannya memang teleportasi
    // (join, rejoin, spawn ulang awal ronde). Melembutkannya akan terlihat seperti melayang.
    if (prev === undefined || prev.alive !== cur.alive) {
      target.x = cur.x
      target.y = cur.y
      target.facingAngle = cur.facingAngle
      continue
    }

    target.x = lerp(prev.x, cur.x, alpha)
    target.y = lerp(prev.y, cur.y, alpha)
    target.facingAngle = lerpAngle(prev.facingAngle, cur.facingAngle, alpha)
  }

  return count
}

export interface Point {
  x: number
  y: number
}

export function extrapolateProjectile(
  projectile: SnapshotProjectile,
  alpha: number,
  out: Point,
): void {
  out.x = projectile.x + projectile.vx * alpha
  out.y = projectile.y + projectile.vy * alpha
}

export type InterpolatedUltimate = SnapshotUltimate

function blankUltimate(): InterpolatedUltimate {
  return {
    casterSlot: -1,
    variant: 0,
    tier: 0,
    originX: 0,
    originY: 0,
    targetX: 0,
    targetY: 0,
    progress: 0,
    killCount: 0,
    totalDamage: 0,
    stale: 0,
    slot: -1,
    staggerProgress: 0,
    msPerProgress: 0,
    targetSlots: new Array<number>(ULTIMATE_MAX_TARGETS).fill(NO_SLOT),
  }
}

/**
 * Mengisi `out` dengan ultimate versi antara, mengembalikan jumlah yang berlaku.
 *
 * Pencocokan lewat `slot` — identitas stabil seumur hidup record. Indeks array tidak bisa
 * dipakai: satu ultimate yang selesai menggeser sisanya, dan dua ultimate berbeda akan
 * diinterpolasi menjadi satu (§7.1).
 *
 * Hanya `progress` dan origin yang dilerp. Sisanya diskret — melerp `killCount` menghasilkan
 * "1,5 kill" di baris hasil callout.
 */
export function interpolateUltimates(
  previous: SnapshotView,
  current: SnapshotView,
  alpha: number,
  out: InterpolatedUltimate[],
): number {
  const bySlot = new Map<number, SnapshotUltimate>()
  for (let i = 0; i < previous.header.ultimateCount; i++) {
    const u = previous.ultimates[i]
    if (u !== undefined) bySlot.set(u.slot, u)
  }

  const count = current.header.ultimateCount
  while (out.length < count) out.push(blankUltimate())

  for (let i = 0; i < count; i++) {
    const cur = current.ultimates[i]
    if (cur === undefined) continue
    const target = out[i] as InterpolatedUltimate
    const prev = bySlot.get(cur.slot)

    target.slot = cur.slot
    target.casterSlot = cur.casterSlot
    target.variant = cur.variant
    target.tier = cur.tier
    target.targetX = cur.targetX
    target.targetY = cur.targetY
    target.killCount = cur.killCount
    target.totalDamage = cur.totalDamage
    target.stale = cur.stale
    // Diskret, seperti killCount. Melerp nomor slot menghasilkan "slot 3,5" — dan rudal yang
    // mengejar fighter yang tidak ada. Disalin element-wise ke array yang sudah ada supaya
    // jalur 60 fps ini tetap nol alokasi.
    target.staggerProgress = cur.staggerProgress
    target.msPerProgress = cur.msPerProgress
    for (let t = 0; t < ULTIMATE_MAX_TARGETS; t++) {
      target.targetSlots[t] = cur.targetSlots[t] ?? NO_SLOT
    }

    // Slot yang belum pernah terlihat: gambar apa adanya. Melerpnya dari record kosong
    // akan membuat ultimate lahir di pojok arena dan melesat ke tempatnya.
    if (prev === undefined) {
      target.progress = cur.progress
      target.originX = cur.originX
      target.originY = cur.originY
      continue
    }

    target.progress = lerp(prev.progress, cur.progress, alpha)
    target.originX = lerp(prev.originX, cur.originX, alpha)
    target.originY = lerp(prev.originY, cur.originY, alpha)
  }

  return count
}
