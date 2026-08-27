import { SIDE_A, SIDE_B } from '@lga/shared'
import { ARENA_MIDLINE } from '../../arena.js'
import type { RenderDeps } from '../deps.js'
import type { InterpolatedFighter, InterpolatedUltimate } from '../interpolate.js'
import { arenaLengthX, arenaX, arenaY } from '../layout.js'
import { tierFor } from '../ultimate.js'
import type { Impulse } from '../ultimate-impulse.js'
import { nukeTypeFromIndex } from '../../snapshot.js'
import { FX_CHARGE_END, FX_IMPACT_AT, FX_IMPACT_END } from './fx-timing.js'
import { fxClamp } from './fx-state.js'
import { singGeom } from './variants/singularity-fx.js'

/**
 * Bagaimana ultimate jalur FX menggeser dan menyilaukan fighter yang terkena.
 *
 * Pengganti `UltimateImpulse` untuk jalur FX, dengan antarmuka yang SAMA (`observe` + `for`)
 * supaya `canvas.ts` tidak perlu tahu jalur mana yang sedang berjalan. Tiga perbedaan:
 * jendela peluruhannya memakai batas FX, dorongan bomb lebih jauh (5.5% lebar arena, dikali
 * pengali tier), dan singularity ikut dilayani — ia MEMUTAR fighter masuk, bukan mendorongnya.
 *
 * `chainFreeze` TIDAK ada di sini: efeknya menahan gerak, bukan menggeser posisi, dan itu
 * dibaca engine dari `UltimateFxState.freeze`.
 */

/** Sejauh apa bomb mendorong pada puncaknya, persen lebar arena. */
const PUSH_PCT = 5.5

export class UltimateFxImpulse {
  private readonly bySlot = new Map<number, Impulse>()
  private readonly pool: Impulse[] = []
  private used = 0

  observe(ultimates: readonly InterpolatedUltimate[], count: number, deps: RenderDeps): void {
    this.bySlot.clear()
    this.used = 0

    for (let i = 0; i < count; i++) {
      const u = ultimates[i]
      if (u === undefined || u.stale === 1) continue
      const type = nukeTypeFromIndex(u.variant)
      if (type === 'singularity') {
        this.singularity(u, deps)
        continue
      }
      if (type !== 'bomb' && type !== 'lightning') continue
      if (u.progress < FX_IMPACT_AT || u.progress >= FX_IMPACT_END) continue

      const decay = 1 - (u.progress - FX_IMPACT_AT) / (FX_IMPACT_END - FX_IMPACT_AT)
      const reach =
        type === 'bomb'
          ? arenaLengthX(deps.layout, PUSH_PCT) * decay * tierFor(u.tier, deps.config).radiusMultiplier
          : 0
      const flash = type === 'lightning' ? decay : 0
      const anchor = this.anchorOf(u, deps)

      for (const slot of u.targetSlots) {
        if (slot < 0) break
        const fighter = this.fighterOf(deps, slot)
        if (fighter === undefined) continue

        const dx = arenaX(deps.layout, fighter.x) - anchor.x
        const dy = arenaY(deps.layout, fighter.y) - anchor.y
        const len = Math.sqrt(dx * dx + dy * dy)
        // Fighter yang berdiri PERSIS di titik ledak tidak punya arah dorong; kedipannya tetap.
        const scale = len < 1e-6 ? 0 : reach / len
        if (scale === 0 && flash === 0) continue
        this.bySlot.set(slot, this.take(dx * scale, dy * scale, flash))
      }
    }
  }

  for(slot: number): Impulse | undefined {
    return this.bySlot.get(slot)
  }

  /**
   * Singularity menyentuh semua fighter SISI SASARAN dalam radiusnya, bukan hanya slot yang
   * terdaftar di `targetSlots` — itu inti efeknya. Selama tarikan, tiap fighter diletakkan pada
   * spiral menuju pusat; saat ledakan keluar, posisinya dilepas kembali sambil terdorong menjauh.
   *
   * SISINYA WAJIB DISARING, dan bukan karena kerapian: radius tariknya 36% lebar arena (sampai
   * 64% di tier teratas) sementara pusatnya BERANGKAT dari sisi caster sendiri dan baru tiba di
   * sasaran pada akhir travel. Tanpa saringan ini, separuh regu sendiri ikut terhisap sepanjang
   * perjalanan orb — padahal damage-nya tidak pernah menyentuh mereka (`combat.ts` menyaring
   * `u.targetSide` di ketiga jalurnya), jadi gambarnya berbohong tentang siapa yang kena.
   *
   * Sisi korban dibaca dari separuh arena yang memuat titik bidik: fighter tidak pernah
   * menyeberangi garis tengah, jadi itu setara dengan "lawan si caster" tanpa perlu field baru
   * di snapshot.
   */
  private singularity(u: InterpolatedUltimate, deps: RenderDeps): void {
    if (u.progress < FX_CHARGE_END) return
    const g = singGeom(u, deps)
    const victimSide = u.targetX > ARENA_MIDLINE ? SIDE_B : SIDE_A

    for (let i = 0; i < deps.fighterCount; i++) {
      const fighter = deps.fighters[i]
      if (fighter === undefined || fighter.side !== victimSide) continue

      const fx = arenaX(deps.layout, fighter.x)
      const fy = arenaY(deps.layout, fighter.y)
      const dx = fx - g.x
      const dy = fy - g.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      if (len > g.R) continue
      const near = 1 - len / g.R

      if (u.progress < FX_IMPACT_AT) {
        // Fase travel: baru terasa tertarik, belum kehilangan pijakan.
        const k = g.tt * near * 0.22
        this.bySlot.set(fighter.slotIndex, this.take(-dx * k, -dy * k, 0))
        continue
      }

      const s = g.pull
      // Yang lebih dekat dipegang lebih kuat: itu yang membuat orbitnya terbaca berlapis.
      const grip = 0.3 + 0.7 * near
      const ang = Math.atan2(dy, dx) + s * s * 5.4 + s * 0.8
      const rad = len * (1 - 0.62 * s * grip)
      const px = g.x + Math.cos(ang) * rad
      const py = g.y + Math.sin(ang) * rad * 0.8

      if (u.progress >= FX_IMPACT_END) {
        const kk = fxClamp((u.progress - FX_IMPACT_END) / 0.22, 0, 1)
        const os = Math.sin(kk * Math.PI) * arenaLengthX(deps.layout, 4) * near
        this.bySlot.set(
          fighter.slotIndex,
          this.take(
            (px - fx) * (1 - kk) + (dx / len) * os,
            (py - fy) * (1 - kk) + (dy / len) * os * 0.8,
            (1 - kk) * 0.9 * near,
          ),
        )
        continue
      }

      this.bySlot.set(fighter.slotIndex, this.take(px - fx, py - fy, g.coll * 0.85 * near))
    }
  }

  private take(dx: number, dy: number, flash: number): Impulse {
    while (this.pool.length <= this.used) this.pool.push({ dx: 0, dy: 0, flash: 0 })
    const impulse = this.pool[this.used++] as Impulse
    impulse.dx = dx
    impulse.dy = dy
    impulse.flash = flash
    return impulse
  }

  private fighterOf(deps: RenderDeps, slot: number): InterpolatedFighter | undefined {
    for (let i = 0; i < deps.fighterCount; i++) {
      const f = deps.fighters[i]
      if (f !== undefined && f.slotIndex === slot) return f
    }
    return undefined
  }

  private anchorOf(u: InterpolatedUltimate, deps: RenderDeps): { x: number; y: number } {
    const first = u.targetSlots[0]
    const fighter = first === undefined || first < 0 ? undefined : this.fighterOf(deps, first)
    return fighter === undefined
      ? { x: arenaX(deps.layout, u.targetX), y: arenaY(deps.layout, u.targetY) }
      : { x: arenaX(deps.layout, fighter.x), y: arenaY(deps.layout, fighter.y) }
  }
}
