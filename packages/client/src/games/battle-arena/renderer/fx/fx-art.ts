import type { RenderDeps } from '../deps.js'
import type { InterpolatedFighter, InterpolatedUltimate } from '../interpolate.js'
import { arenaX, arenaY } from '../layout.js'
import { tierFor } from '../ultimate.js'
import type { FrameTarget, UltimateFrame } from '../ultimate-draw.js'
import { nukeTypeFromIndex } from '../../snapshot.js'
import { fxPhaseAt, fxPhaseProgress } from './fx-timing.js'
import type { UltimateFxState } from './fx-state.js'

/**
 * Kerangka bersama jalur FX — sepadan `drawUltimateArt`, dengan DUA perbedaan yang disengaja.
 *
 * Pertama, batas fasenya dari `fx-timing.ts`, bukan dari @lga/shared. Kedua, seni varian
 * menerima `fx` dan `dt`: efek berlapis butuh state yang hidup melewati batas fase (partikel
 * yang masih terbang saat impact berakhir) dan butuh tahu berapa lama frame terakhir supaya
 * laju kelahiran partikel tidak berubah bersama frame rate.
 *
 * Charge, reticle, vignette TIDAK dipanggil dari sini. Di jalur FX setiap varian punya charge
 * yang berbeda — singularity melengkungkan lantai, chainFreeze membekukannya — jadi kerangka
 * hanya menyiapkan frame dan menyerahkan seluruh fase ke varian.
 */

export interface UltimateFxArt {
  (
    ctx: CanvasRenderingContext2D,
    f: UltimateFrame,
    deps: RenderDeps,
    fx: UltimateFxState,
    dt: number,
  ): void
}

const targetScratch: FrameTarget[] = []

export function fighterOf(deps: RenderDeps, slot: number): InterpolatedFighter | undefined {
  if (slot < 0) return undefined
  for (let i = 0; i < deps.fighterCount; i++) {
    const f = deps.fighters[i]
    if (f !== undefined && f.slotIndex === slot) return f
  }
  return undefined
}

/**
 * Slot → piksel. Sama seperti `resolveTargets` di ultimate-draw.ts: slot yang hilang dari
 * registry jatuh ke pusat zona, karena rudal yang kehilangan sasaran tetap harus meledak
 * di suatu tempat.
 */
function resolveTargets(u: InterpolatedUltimate, deps: RenderDeps, f: UltimateFrame): void {
  let count = 0
  for (let i = 0; i < u.targetSlots.length; i++) {
    const slot = u.targetSlots[i]
    if (slot === undefined || slot < 0) break

    while (targetScratch.length <= count) targetScratch.push({ x: 0, y: 0, alive: false })
    const out = targetScratch[count] as FrameTarget
    const fighter = fighterOf(deps, slot)
    if (fighter === undefined) {
      out.x = f.tx
      out.y = f.ty
      out.alive = false
    } else {
      out.x = arenaX(deps.layout, fighter.x)
      out.y = arenaY(deps.layout, fighter.y)
      out.alive = fighter.alive === 1
    }
    count++
  }
  f.targets = targetScratch
  f.targetCount = count
}

export function fxFrameOf(u: InterpolatedUltimate, deps: RenderDeps): UltimateFrame {
  const { layout, config } = deps
  const { arena } = layout

  const frame: UltimateFrame = {
    colour: config.sides[u.targetX > 50 ? 'a' : 'b'].color,
    ox: arenaX(layout, u.originX),
    oy: arenaY(layout, u.originY),
    tx: arenaX(layout, u.targetX),
    ty: arenaY(layout, u.targetY),
    left: arena.x,
    right: arena.x + arena.width,
    top: arena.y,
    bottom: arena.y + arena.height,
    phase: u.stale === 1 ? 'aftermath' : fxPhaseAt(u.progress),
    local: fxPhaseProgress(u.progress),
    progress: u.progress,
    targets: targetScratch,
    targetCount: 0,
    source: u,
    tier: tierFor(u.tier, config),
  }

  resolveTargets(u, deps, frame)
  return frame
}

export function drawUltimateFxArt(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
  art: UltimateFxArt,
): void {
  /*
   * Record stale TIDAK digambar sama sekali di jalur ini.
   *
   * Ronde sudah berakhir dan damage-nya hangus; menggambar charge atau sesuatu yang melesat
   * berarti menjanjikan ledakan yang tidak akan datang. Partikel dan kawah yang SUDAH terbang
   * tetap memudar sendiri — mereka hidup di `UltimateFxState`, bukan di sini.
   */
  if (u.stale === 1) return

  const f = fxFrameOf(u, deps)
  ctx.save()
  art(ctx, f, deps, fx, dt)
  ctx.restore()
}
