import type { RenderDeps } from '../../deps.js'
import { arenaLengthX, scaled } from '../../layout.js'
import { layeredGlow } from '../../glow.js'
import type { InterpolatedUltimate } from '../../interpolate.js'
import type { FrameTarget } from '../../ultimate-draw.js'
import { drawUltimateFxArt } from '../fx-art.js'
import type { UltimateFxArt } from '../fx-art.js'
import { detonate, drawFxCharge, drawFxReticle, fireball, shockRing } from '../fx-paint.js'
import { fxClamp, hexRgb } from '../fx-state.js'
import type { UltimateFxState } from '../fx-state.js'
import { FX_CHARGE_END, FX_IMPACT_AT } from '../fx-timing.js'

/**
 * Bomb, versi FX — dan ini varian yang paling banyak berubah.
 *
 * Ledakannya BERTAHAP, bukan satu kilatan: inti putih, bola api yang mengembang lalu runtuh,
 * dua ring kejut dengan kecepatan berbeda, kolom yang naik, lalu tiga ledakan sekunder pada
 * 150/320/520 ms. Urutan itulah yang memberi rasa tekanan; menggambar semuanya bersamaan
 * mengembalikannya jadi kilatan datar.
 */
const art: UltimateFxArt = (ctx, f, deps, fx, dt) => {
  if (f.phase === 'charge') {
    drawFxCharge(ctx, f, deps, fx, dt)
    return
  }
  const u = f.source
  const st = fx.bag(u)
  const nuke = deps.config.gameplay.nuke
  const target = f.targetCount > 0 ? (f.targets[0] as FrameTarget) : { x: f.tx, y: f.ty }
  const base = arenaLengthX(deps.layout, nuke.blastRadiusPct) * f.tier.radiusMultiplier

  if (f.phase === 'travel') {
    const t = Math.min(1, Math.max(0, (f.progress - FX_CHARGE_END) / (FX_IMPACT_AT - FX_CHARGE_END)))
    const radius = arenaLengthX(deps.layout, 2.6) * f.tier.radiusMultiplier
    const gx = fxClamp(f.ox + (target.x - f.ox) * t, f.left, f.right)
    const gy = fxClamp(f.oy + (target.y - f.oy) * t, f.top, f.bottom)
    const maxLift = (f.bottom - f.top) * 0.38
    const lift = Math.sin(Math.PI * t) * maxLift
    const cy = fxClamp(gy - lift, f.top, f.bottom)

    // impact marker: shrinking crosshair ring with countdown ticks
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.25 + t * 0.55
    ctx.strokeStyle = f.colour; ctx.lineWidth = scaled(deps.layout, 2)
    ctx.beginPath(); ctx.ellipse(target.x, target.y, radius * (5 - t * 3.4), radius * (5 - t * 3.4) * 0.6, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = (0.2 + t * 0.6) * (0.4 + 0.6 * Math.abs(Math.sin(fx.clock * 0.02)))
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 1.2)
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4) + t * 2
      const r0 = radius * (5 - t * 3.4) * 1.12, r1 = r0 + scaled(deps.layout, 7)
      ctx.beginPath()
      ctx.moveTo(target.x + Math.cos(a) * r0, target.y + Math.sin(a) * r0 * 0.6)
      ctx.lineTo(target.x + Math.cos(a) * r1, target.y + Math.sin(a) * r1 * 0.6)
      ctx.stroke()
    }
    ctx.restore()

    // shadow (the height cue — kept, thickened)
    const high = lift / maxLift, shrink = 1 - high * 0.55
    ctx.save()
    ctx.globalAlpha = 0.5 * (1 - high * 0.6); ctx.fillStyle = '#000000'
    ctx.beginPath(); ctx.ellipse(gx, gy, radius * 1.6 * shrink, radius * 0.62 * shrink, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // spinning shell with ember trail
    ctx.save()
    ctx.translate(gx, cy); ctx.rotate(t * 3 * Math.PI * 2)
    ctx.fillStyle = '#2b2f3a'
    ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.5, radius * 0.9, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#454b5c'
    ctx.beginPath(); ctx.ellipse(-radius * 0.4, -radius * 0.2, radius * 0.6, radius * 0.3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    layeredGlow(ctx, gx, cy, radius * (1 + 0.16 * Math.sin(fx.clock * 0.03)), f.colour, 0.95)
    fx.light(gx, cy, arenaLengthX(deps.layout, 12), 0.5, hexRgb(f.colour), 40)
    for (let s = 0; s < 2; s++) {
      fx.spark(gx, cy, fx.rr(-70, 70), fx.rr(-40, 90), fx.rr(260, 620),
        scaled(deps.layout, fx.rr(1.6, 3.4)), hexRgb(f.colour), 160, 1.4, 1)
    }
    if (fx.rnd() < dt / 40) fx.puff(gx, cy, fx.rr(-20, 20), fx.rr(0, 30), 700, radius * 0.5, radius, 0.4)
    drawFxReticle(ctx, f, deps, fx)
    return
  }

  if (f.phase === 'impact') {
    const p = f.local
    if (fx.once(u, 'boom')) {
      detonate(fx, deps, target.x, target.y, base, f.colour, 1.35 * f.tier.radiusMultiplier)
      // secondary detonations, staggered — "ledakan bertahap"
      st.stages = [
        { t: 150, d: 0.55, done: false },
        { t: 320, d: 0.4, done: false },
        { t: 520, d: 0.3, done: false },
      ]
      st.born = fx.clock
    }
    if (st.stages.length > 0) {
      for (const s of st.stages) {
        if (!s.done && fx.clock - st.born > s.t) {
          s.done = true
          const a = fx.rr(0, Math.PI * 2), d = base * fx.rr(0.6, 1.5)
          detonate(fx, deps, target.x + Math.cos(a) * d, target.y + Math.sin(a) * d * 0.6, base * s.d, f.colour, s.d)
        }
      }
    }
    // stage 1: white core
    if (p < 0.1) layeredGlow(ctx, target.x, target.y, base * (2 - p * 6), '#ffffff', 1 - p / 0.1)
    // stage 2: fireball swell then collapse
    const swell = p < 0.55 ? Math.sin((p / 0.55) * Math.PI) ** 0.7 : 0
    if (swell > 0) fireball(ctx, fx, target.x, target.y, base * (0.42 + swell * 1.3), f.colour, Math.min(1, swell * 1.5))
    // stage 3: twin shockwave rings
    if (p < 0.7) {
      const r1 = p / 0.7
      shockRing(ctx, target.x, target.y, base * (0.6 + r1 * 4.2), scaled(deps.layout, 5) * (1 - r1), (1 - r1) * 0.9, f.colour)
    }
    if (p > 0.12 && p < 0.9) {
      const r2 = (p - 0.12) / 0.78
      shockRing(ctx, target.x, target.y, base * (0.4 + r2 * 2.6), scaled(deps.layout, 2.4) * (1 - r2), (1 - r2) * 0.55, '#ffd7a0')
    }
    // stage 4: rising column
    if (p > 0.25) {
      const c2 = (p - 0.25) / 0.75
      fireball(ctx, fx, target.x, target.y - base * c2 * 2.2, base * (0.9 - c2 * 0.4), f.colour, (1 - c2) * 0.55)
      if (fx.rnd() < dt / 18) {
        fx.puff(target.x + fx.rr(-base * 0.4, base * 0.4), target.y - base * c2 * 2.2,
          fx.rr(-20, 20), -fx.rr(30, 80), fx.rr(1200, 2000), base * 0.5, base * 0.9, fx.rr(0.35, 0.7))
      }
    }
    return
  }

  if (f.phase === 'aftermath') {
    const k = 1 - f.local
    fireball(ctx, fx, target.x, target.y - base * (0.6 + f.local * 1.4), base * (0.55 * k + 0.1), f.colour, k * 0.35)
    if (fx.rnd() < dt / 60) {
      fx.spark(target.x + fx.rr(-base, base), target.y + fx.rr(-base * 0.5, base * 0.5),
        fx.rr(-20, 20), -fx.rr(30, 90), fx.rr(700, 1400), scaled(deps.layout, fx.rr(1.4, 2.8)), [1, 0.6, 0.3], -20, 0.6, 1)
    }
    fx.light(target.x, target.y, base * 2.6, 0.3 * k, hexRgb('#ff8a3c'), 60)
  }
}

export function drawBombFx(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): void {
  drawUltimateFxArt(ctx, u, deps, fx, dt, art)
}
