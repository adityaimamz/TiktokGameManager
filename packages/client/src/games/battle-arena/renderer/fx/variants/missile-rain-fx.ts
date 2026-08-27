import type { RenderDeps } from '../../deps.js'
import { arenaLengthX, scaled } from '../../layout.js'
import { layeredGlow } from '../../glow.js'
import type { InterpolatedUltimate } from '../../interpolate.js'
import type { FrameTarget } from '../../ultimate-draw.js'
import { drawUltimateFxArt } from '../fx-art.js'
import type { UltimateFxArt } from '../fx-art.js'
import { detonate, drawFxCharge, drawFxReticle, fireball, missileHead, shockRing } from '../fx-paint.js'
import { fxClamp, hexRgb } from '../fx-state.js'
import type { UltimateFxState } from '../fx-state.js'
import { FX_IMPACT_AT } from '../fx-timing.js'

/**
 * Salvo rudal, versi FX.
 *
 * Yang membedakannya dari versi lama bukan jumlah rudalnya, tapi apa yang terjadi di ujung:
 * tiap hulu ledak memanggil `detonate()` sendiri, jadi delapan rudal berarti delapan kawah,
 * delapan shockwave, dan delapan gelombang percikan yang saling menumpuk. Ekornya bukan
 * sekadar glow — ada kerucut nyala pendorong, asap yang tertinggal, dan bara yang berhamburan.
 */
const art: UltimateFxArt = (ctx, f, deps, fx, dt) => {
  if (f.phase === 'charge') {
    drawFxCharge(ctx, f, deps, fx, dt)
    return
  }
  const u = f.source
  const nuke = deps.config.gameplay.nuke
  const radius = arenaLengthX(deps.layout, 1.5) * f.tier.radiusMultiplier
  for (let i = 0; i < f.targetCount; i++) {
    const target = (f.targets[i] as FrameTarget)
    const arrive = FX_IMPACT_AT + i * u.staggerProgress
    if (f.progress < arrive) {
      const head = missileHead(f, deps, i, target)
      if (head === null) continue
      const hx = fxClamp(head.x, f.left, f.right), hy = fxClamp(head.y, f.top, f.bottom)

      // exhaust cone (2D) + GL embers and smoke
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const flick = 0.7 + 0.3 * Math.abs(Math.sin(f.progress * 120 + i * 1.7))
      for (let s = 1; s <= 5; s++) {
        const back = radius * 1.2 * s
        ctx.globalAlpha = (0.5 / s) * flick
        ctx.fillStyle = s < 3 ? '#ffe9b8' : f.colour
        ctx.beginPath()
        ctx.arc(hx - head.hx * back, hy - head.hy * back, radius * (0.95 - s * 0.13) * flick, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      layeredGlow(ctx, hx, hy, radius * 1.25, f.colour, 1)
      layeredGlow(ctx, hx, hy, radius * 0.5, '#ffffff', 1)

      // body
      ctx.save()
      ctx.translate(hx, hy); ctx.rotate(Math.atan2(head.hy, head.hx))
      ctx.fillStyle = '#e8edf7'
      ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.5, radius * 0.5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#20242f'
      ctx.beginPath(); ctx.ellipse(-radius * 0.7, 0, radius * 0.55, radius * 0.42, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      fx.light(hx, hy, arenaLengthX(deps.layout, 7), 0.5, hexRgb(f.colour), 40)
      if (fx.rnd() < dt / 26) {
        fx.puff(hx - head.hx * radius * 2, hy - head.hy * radius * 2,
          -head.hx * 20 + fx.rr(-12, 12), -head.hy * 20 + fx.rr(-12, 12),
          fx.rr(500, 900), radius * 0.8, radius * 1.6, 0.45)
      }
      for (let s = 0; s < 2; s++) {
        fx.spark(hx - head.hx * radius * 1.8, hy - head.hy * radius * 1.8,
          -head.hx * fx.rr(30, 130) + fx.rr(-40, 40), -head.hy * fx.rr(30, 130) + fx.rr(-40, 40),
          fx.rr(120, 300), scaled(deps.layout, fx.rr(1.4, 3.2)), [1, 0.82, 0.5], 60, 2.2, 1)
      }
      continue
    }

    const age = (f.progress - arrive) / 0.2
    if (fx.once(u, 'boom' + i)) {
      detonate(fx, deps, target.x, target.y, arenaLengthX(deps.layout, nuke.blastRadiusPct) * f.tier.radiusMultiplier * 0.8,
        f.colour, 0.62 * f.tier.radiusMultiplier)
    }
    if (age >= 1) continue
    const base = arenaLengthX(deps.layout, nuke.blastRadiusPct) * f.tier.radiusMultiplier
    if (age < 0.5) fireball(ctx, fx, target.x, target.y, base * (0.35 + age * 1.5), f.colour, 1 - age * 1.8)
    shockRing(ctx, target.x, target.y, base * (0.5 + age * 2.6), scaled(deps.layout, 3) * (1 - age), (1 - age) * 0.8, f.colour)
  }
  if (f.phase === 'travel') drawFxReticle(ctx, f, deps, fx)
}

export function drawMissileRainFx(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): void {
  drawUltimateFxArt(ctx, u, deps, fx, dt, art)
}
