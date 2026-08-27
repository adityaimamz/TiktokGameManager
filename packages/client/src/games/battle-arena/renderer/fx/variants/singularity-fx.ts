import type { RenderDeps } from '../../deps.js'
import { arenaLengthX, arenaX, arenaY, scaled } from '../../layout.js'
import { layeredGlow } from '../../glow.js'
import type { InterpolatedUltimate } from '../../interpolate.js'
import { tierFor } from '../../ultimate.js'
import { drawUltimateFxArt, fighterOf } from '../fx-art.js'
import type { UltimateFxArt } from '../fx-art.js'
import { addFxScorch, drawFxCharge, drawFxReticle } from '../fx-paint.js'
import { fxClamp, hexRgb, rgba } from '../fx-state.js'
import type { UltimateFxState } from '../fx-state.js'
import { FX_CHARGE_END, FX_IMPACT_AT, FX_IMPACT_END } from '../fx-timing.js'

/**
 * Singularity — kebalikan bomb: ia MENARIK, lalu meledak keluar.
 *
 * Semua efek lain di lapisan ini menambahkan cahaya; yang ini menguranginya. Orb-nya digambar
 * dengan gradien hitam di atas arena, shockwave-nya berkekuatan NEGATIF (piksel tertarik masuk,
 * bukan terdorong), dan `fx.pull` menyedot partikel serta asap yang sedang terbang. Kilatan
 * arenanya dipangkas di fx-timing.ts karena alasan yang sama.
 *
 * Empat tahap: charge (lantai melengkung) → travel (orb melayang ke sasaran) → impact (tarikan
 * penuh lalu runtuh jadi satu titik putih) → aftermath (ledakan keluar).
 */
export interface SingularityGeom {
  ox: number
  oy: number
  tx: number
  ty: number
  /** Kemajuan perjalanan orb, 0–1. */
  tt: number
  x: number
  y: number
  /** Kekuatan tarikan, 0–1. */
  pull: number
  /** Kemajuan keruntuhan jadi titik, 0–1. */
  coll: number
  /** Kemajuan ledakan keluar, 0–1. */
  blow: number
  /** Radius jangkauan tarikan, piksel. */
  R: number
  core: number
}

export function singGeom(u: InterpolatedUltimate, deps: RenderDeps): SingularityGeom {
  const p = u.progress
  const radiusMultiplier = tierFor(u.tier, deps.config).radiusMultiplier
  const ox = arenaX(deps.layout, u.originX)
  const oy = arenaY(deps.layout, u.originY)
  const anchor = fighterOf(deps, u.targetSlots[0] ?? -1)
  const tx = anchor === undefined ? arenaX(deps.layout, u.targetX) : arenaX(deps.layout, anchor.x)
  const ty = anchor === undefined ? arenaY(deps.layout, u.targetY) : arenaY(deps.layout, anchor.y)
  const tt = fxClamp((p - FX_CHARGE_END) / (FX_IMPACT_AT - FX_CHARGE_END), 0, 1)
  // Ease in-out: orb berangkat pelan, melesat di tengah, lalu berhenti di sasaran.
  const e = tt < 0.5 ? 2 * tt * tt : 1 - 2 * (1 - tt) * (1 - tt)
  const span = FX_IMPACT_END - FX_IMPACT_AT
  // 84% fase impact untuk menarik, 16% terakhir untuk runtuh. Keruntuhannya harus SINGKAT.
  const collapseStart = FX_IMPACT_AT + span * 0.84
  return {
    ox,
    oy,
    tx,
    ty,
    tt,
    x: ox + (tx - ox) * e,
    y: oy + (ty - oy) * e,
    pull: fxClamp((p - FX_IMPACT_AT) / (span * 0.84), 0, 1),
    coll: fxClamp((p - collapseStart) / (span * 0.16), 0, 1),
    blow: p >= FX_IMPACT_END ? fxClamp((p - FX_IMPACT_END) / 0.16, 0, 1) : 0,
    R: arenaLengthX(deps.layout, 36) * radiusMultiplier,
    core: arenaLengthX(deps.layout, 4.6) * radiusMultiplier,
  }
}

/** Orb itu sendiri: ia MENGURANGI cahaya, bukan menambah. */
function voidOrb(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
  k: number,
  spin: number,
): void {
  ctx.save()
  const g0 = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.6)
  g0.addColorStop(0, 'rgba(0,0,0,1)')
  g0.addColorStop(0.4, 'rgba(2,1,6,0.82)')
  g0.addColorStop(1, 'rgba(4,2,10,0)')
  ctx.fillStyle = g0
  ctx.beginPath(); ctx.arc(x, y, r * 3.6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#000000'
  ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, Math.PI * 2); ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = k
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 2.2)
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 0.5 * k
  ctx.strokeStyle = '#a982ff'; ctx.lineWidth = scaled(deps.layout, 3.5)
  ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 0.5 * k
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 1.1)
  ctx.beginPath(); ctx.arc(x, y, r * 1.45, spin, spin + 2.2); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, r * 1.85, spin + 3.3, spin + 4.5); ctx.stroke()
  ctx.globalAlpha = 0.22 * k
  ctx.strokeStyle = '#8f6bff'; ctx.lineWidth = scaled(deps.layout, 1)
  ctx.beginPath(); ctx.ellipse(x, y, r * 2.6, r * 1.1, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

/** Piringan akresi: sepuluh lengan spiral, berputar makin cepat saat tarikan menguat. */
function accretion(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
  k: number,
  spin: number,
  colour: string,
): void {
  if (k <= 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let arm = 0; arm < 10; arm++) {
    const a0 = spin * (1 + arm * 0.04) + arm * (Math.PI * 2 / 10)
    ctx.beginPath()
    for (let i = 0; i <= 26; i++) {
      const t = i / 26
      const rr = r * (0.3 + t * 3.2)
      const a = a0 - (1 - t) * 3.7
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.62
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.globalAlpha = 0.6 * k
    ctx.strokeStyle = colour; ctx.lineWidth = scaled(deps.layout, 3.4)
    ctx.stroke()
    ctx.globalAlpha = 0.95 * k
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 0.8)
    ctx.stroke()
  }
  ctx.restore()
}

/** Lantai arena yang melesak ke dalam sumur, garis-garisnya ikut membengkok. */
function dent(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
  k: number,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = '#8f6bff'
  for (let ring = 1; ring <= 5; ring++) {
    const sag = 1 - k * 0.42 * (1 - ring / 6)
    const rr = (r * ring) / 5 * sag
    ctx.globalAlpha = 0.34 * k * (1 - ring / 8)
    ctx.lineWidth = scaled(deps.layout, 1)
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.5, 0, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.globalAlpha = 0.26 * k
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    ctx.beginPath()
    for (let j = 0; j <= 10; j++) {
      const t = j / 10
      const rr = r * (1 - t)
      const bend = a + t * t * 1.1 * k
      const px = x + Math.cos(bend) * rr, py = y + Math.sin(bend) * rr * 0.5
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

const art: UltimateFxArt = (ctx, f, deps, fx, dt) => {
  const u = f.source
  const g = singGeom(u, deps)
  const A = deps.layout.arena
  const vio = '#9a6bff'
  const spin = fx.clock * 0.004

  if (f.phase === 'charge') {
    drawFxCharge(ctx, f, deps, fx, dt)
    const k = f.local
    dent(ctx, deps, g.ox, g.oy + scaled(deps.layout, 4), arenaLengthX(deps.layout, 12 + k * 13), Math.min(1, k * 1.3))
    voidOrb(ctx, deps, g.ox, g.oy, g.core * (0.22 + k * 0.5), k, spin * 2)
    fx.light(g.ox, g.oy, arenaLengthX(deps.layout, 7 + k * 7), 0.18 * k, [0.5, 0.32, 0.95], 50)
    if (fx.tick(u, 'cw', dt, 240)) fx.wave(g.ox, g.oy, 720, -0.32 * k, 0.06)
    if (fx.rnd() < dt / 20) {
      const a = fx.rr(0, Math.PI * 2), d = arenaLengthX(deps.layout, fx.rr(5, 15))
      fx.spark(g.ox + Math.cos(a) * d, g.oy + Math.sin(a) * d * 0.6,
        -Math.cos(a) * fx.rr(40, 130), -Math.sin(a) * fx.rr(30, 100) * 0.6,
        fx.rr(500, 950), scaled(deps.layout, fx.rr(1, 2.2)), [0.72, 0.56, 1], 0, 0.5, 1)
    }
    fx.pull = { x: g.ox, y: g.oy, r: arenaLengthX(deps.layout, 17), g: 90 * k }
    return
  }

  if (f.phase === 'travel') {
    const k = g.tt
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.2
    ctx.strokeStyle = rgba(vio, 0.7); ctx.lineWidth = scaled(deps.layout, 1.2)
    ctx.setLineDash([scaled(deps.layout, 5), scaled(deps.layout, 11)])
    ctx.beginPath(); ctx.moveTo(g.ox, g.oy); ctx.lineTo(g.x, g.y); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
    const r = g.core * (0.5 + k * 0.55)
    accretion(ctx, deps, g.x, g.y, r * 0.62, 0.3 + k * 0.35, spin * 2.4, vio)
    voidOrb(ctx, deps, g.x, g.y, r, 1, spin * 2)
    fx.light(g.x, g.y, arenaLengthX(deps.layout, 9), 0.2, [0.55, 0.36, 1], 50)
    if (fx.tick(u, 'tw', dt, 160)) fx.wave(g.x, g.y, 640, -0.36, 0.05)
    fx.pull = { x: g.x, y: g.y, r: arenaLengthX(deps.layout, 20), g: 160 }
    drawFxReticle(ctx, f, deps, fx)
    return
  }

  if (f.phase === 'impact') {
    const s = g.pull, cl = g.coll
    const r = g.core * (1 + s * 1.1) * (1 - cl * 0.94)
    if (fx.once(u, 'grab')) {
      fx.wave(g.x, g.y, 900, -0.8, 0.07)
      fx.light(g.x, g.y, arenaLengthX(deps.layout, 24), 0.5, [0.5, 0.3, 1], 260)
      fx.kick(scaled(deps.layout, 5))
    }
    if (cl < 0.15 && fx.tick(u, 'iw', dt, 130)) fx.wave(g.x, g.y, 780, -0.5 - s * 0.45, 0.055)
    fx.pull = { x: g.x, y: g.y, r: g.R, g: 420 + s * 1700 }

    const nDeb = Math.round(dt / 8)
    for (let i = 0; i < nDeb; i++) {
      const a = fx.rr(0, Math.PI * 2), d = g.R * fx.rr(0.4, 1)
      const tan = fx.rr(70, 200)
      fx.spark(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d * 0.62,
        -Math.cos(a) * fx.rr(20, 80) - Math.sin(a) * tan,
        (-Math.sin(a) * fx.rr(20, 80) + Math.cos(a) * tan) * 0.62,
        fx.rr(600, 1200), scaled(deps.layout, fx.rr(1, 2.6)),
        fx.rnd() < 0.4 ? [1, 1, 1] : [0.66, 0.46, 1], 0, 0.2, 1)
    }
    if (fx.rnd() < dt / 55) {
      const a = fx.rr(0, Math.PI * 2), d = g.R * fx.rr(0.5, 0.95)
      fx.puff(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d * 0.6,
        -Math.cos(a) * 80, -Math.sin(a) * 45, 600, arenaLengthX(deps.layout, 1.6), -arenaLengthX(deps.layout, 0.6), 0.5)
    }
    accretion(ctx, deps, g.x, g.y, r, (0.5 + s * 0.5) * (1 - cl), spin * (2 + s * 7), vio)
    voidOrb(ctx, deps, g.x, g.y, r, 1 - cl * 0.5, spin * 3)
    fx.light(g.x, g.y, arenaLengthX(deps.layout, 13 + s * 13), 0.3 * (1 - cl), [0.45, 0.28, 1], 50)
    fx.kick(scaled(deps.layout, 1.4 + s * 3.2))

    if (cl > 0) {
      const q = cl
      ctx.save()
      const vg = ctx.createRadialGradient(g.x, g.y, arenaLengthX(deps.layout, 3), g.x, g.y, arenaLengthX(deps.layout, 60))
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, 'rgba(0,0,0,' + (0.5 * q).toFixed(3) + ')')
      ctx.globalAlpha = 1
      ctx.fillStyle = vg
      ctx.fillRect(A.x, A.y, A.width, A.height)
      ctx.globalCompositeOperation = 'lighter'
      const pr = g.core * (0.34 * (1 - q) + 0.12)
      ctx.globalAlpha = Math.min(1, q * 1.5)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(g.x, g.y, pr, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 0.6 * q
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 1)
      ctx.beginPath(); ctx.arc(g.x, g.y, pr * (3 - q * 1.8), 0, Math.PI * 2); ctx.stroke()
      ctx.globalAlpha = 0.85 * q
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 1.4)
      const fl = arenaLengthX(deps.layout, 9) * q
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2) + 0.4
        ctx.beginPath()
        ctx.moveTo(g.x - Math.cos(a) * fl, g.y - Math.sin(a) * fl)
        ctx.lineTo(g.x + Math.cos(a) * fl, g.y + Math.sin(a) * fl)
        ctx.stroke()
      }
      ctx.restore()
      fx.light(g.x, g.y, arenaLengthX(deps.layout, 2 + 5 * (1 - q)), 0.5 * q, [1, 1, 1], 40)
    }
    return
  }

  const k = g.blow
  if (fx.once(u, 'blow')) {
    fx.kick(scaled(deps.layout, 21))
    fx.wave(g.x, g.y, 700, 0.95, 0.05)
    fx.wave(g.x, g.y, 1150, 0.55, 0.1)
    fx.light(g.x, g.y, arenaLengthX(deps.layout, 46), 1, [1, 1, 1], 200)
    fx.light(g.x, g.y, arenaLengthX(deps.layout, 30), 0.8, [0.62, 0.42, 1], 470)
    addFxScorch(fx, deps, g.x, g.y, arenaLengthX(deps.layout, 7), f.colour)
    for (let i = 0; i < 250; i++) {
      const a = fx.rr(0, Math.PI * 2), sp = fx.rr(130, 1150)
      fx.spark(g.x, g.y, Math.cos(a) * sp, Math.sin(a) * sp * 0.62,
        fx.rr(340, 1100), scaled(deps.layout, fx.rr(1, 3.6)),
        fx.rnd() < 0.45 ? [1, 1, 1] : fx.rnd() < 0.6 ? [0.7, 0.5, 1] : hexRgb(f.colour),
        fx.rr(60, 320), fx.rr(0.9, 2.2), 1)
    }
    for (let i = 0; i < 12; i++) {
      const a = fx.rr(0, Math.PI * 2), d = arenaLengthX(deps.layout, fx.rr(0.5, 6))
      fx.puff(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d * 0.6,
        Math.cos(a) * fx.rr(40, 160), -fx.rr(20, 70), fx.rr(1200, 2000),
        arenaLengthX(deps.layout, 1.8), arenaLengthX(deps.layout, 4), 0.6)
    }
  }
  if (k < 1) {
    const r = arenaLengthX(deps.layout, 4 + k * 30)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = (1 - k) ** 1.6
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 3 * (1 - k) + 0.6)
    ctx.beginPath(); ctx.ellipse(g.x, g.y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 0.45 * (1 - k) ** 2
    ctx.strokeStyle = vio; ctx.lineWidth = scaled(deps.layout, 7 * (1 - k) + 1)
    ctx.beginPath(); ctx.ellipse(g.x, g.y, r * 0.76, r * 0.47, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
    layeredGlow(ctx, g.x, g.y, arenaLengthX(deps.layout, 7) * (1 - k) + arenaLengthX(deps.layout, 1), '#c9b0ff', (1 - k) * 0.9)
  }
}

export function drawSingularity(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): void {
  drawUltimateFxArt(ctx, u, deps, fx, dt, art)
}
