import type { RenderDeps } from '../../deps.js'
import { arenaLengthX, scaled } from '../../layout.js'
import { layeredGlow } from '../../glow.js'
import type { InterpolatedUltimate } from '../../interpolate.js'
import type { FrameTarget } from '../../ultimate-draw.js'
import { drawUltimateFxArt } from '../fx-art.js'
import type { UltimateFxArt } from '../fx-art.js'
import { detonate, drawFxCharge, drawFxReticle, fireball } from '../fx-paint.js'
import { hexRgb } from '../fx-state.js'
import type { UltimateFxState } from '../fx-state.js'
import { FX_IMPACT_AT } from '../fx-timing.js'

/**
 * Laser, versi FX.
 *
 * Berkasnya menyala 520 ms MENEMBUS batas travel→impact, dan itu sebabnya ia tidak bersandar
 * pada cabang fase seperti varian lain: `age` dihitung dari jendelanya sendiri di sekitar
 * FX_IMPACT_AT. Amplitudo panasnya dititipkan ke `fx.beam` — pass distorsi di lapisan GL yang
 * mengubahnya jadi udara bergetar di sepanjang berkas.
 */
const art: UltimateFxArt = (ctx, f, deps, fx, dt) => {
  if (f.phase === 'charge') {
    drawFxCharge(ctx, f, deps, fx, dt)
    return
  }
  const u = f.source
  const nuke = deps.config.gameplay.nuke
  const aim = f.targetCount > 0 ? (f.targets[0] as FrameTarget) : { x: f.tx, y: f.ty }
  const base = arenaLengthX(deps.layout, nuke.blastRadiusPct) * f.tier.radiusMultiplier
  const half = 520 / 2 / u.msPerProgress
  const age = (f.progress - (FX_IMPACT_AT - half)) / (half * 2)
  const firing = age >= 0 && age < 1

  const dx = aim.x - f.ox, dy = aim.y - f.oy
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len, uy = dy / len

  if (f.phase === 'travel' && !firing) {
    // thin aim line + charge-up sparks running along it
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.12 + f.local * 0.3
    ctx.strokeStyle = f.colour; ctx.lineWidth = scaled(deps.layout, 1)
    ctx.setLineDash([scaled(deps.layout, 9), scaled(deps.layout, 7)])
    ctx.lineDashOffset = -fx.clock * 0.12
    ctx.beginPath(); ctx.moveTo(f.ox, f.oy); ctx.lineTo(aim.x, aim.y); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
    layeredGlow(ctx, f.ox, f.oy, arenaLengthX(deps.layout, 1.4 + f.local * 3) * f.tier.radiusMultiplier, f.colour, 0.5 + f.local * 0.5)
    if (fx.rnd() < dt / 30) {
      const t = fx.rnd()
      fx.spark(f.ox + ux * len * t, f.oy + uy * len * t, -ux * 260, -uy * 260,
        fx.rr(150, 320), scaled(deps.layout, fx.rr(1.4, 3)), hexRgb(f.colour), 0, 1, 1)
    }
    drawFxReticle(ctx, f, deps, fx)
    fx.light(f.ox, f.oy, arenaLengthX(deps.layout, 10), 0.2 + f.local * 0.3, hexRgb(f.colour), 40)
    return
  }

  if (firing) {
    const env = age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88
    const wobble = Math.sin(age * 44) * scaled(deps.layout, 1.6)
    const nx = -uy * wobble, ny = ux * wobble
    const core = scaled(deps.layout, 2.8) * (0.8 + f.tier.radiusMultiplier * 0.2) * env

    if (fx.once(u, 'fire')) {
      fx.wave((f.ox + aim.x) / 2, (f.oy + aim.y) / 2, 500, 0.42, 0.06)
      fx.kick(scaled(deps.layout, 7))
    }

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    // outer haze
    ctx.globalAlpha = env * 0.13; ctx.lineCap = 'round'
    ctx.strokeStyle = f.colour; ctx.lineWidth = core * 7
    ctx.beginPath(); ctx.moveTo(f.ox, f.oy); ctx.lineTo(aim.x + nx, aim.y + ny); ctx.stroke()
    ctx.globalAlpha = env * 0.3; ctx.lineWidth = core * 3.4
    ctx.beginPath(); ctx.moveTo(f.ox, f.oy); ctx.lineTo(aim.x + nx, aim.y + ny); ctx.stroke()
    ctx.globalAlpha = env * 0.7; ctx.strokeStyle = '#dff0ff'; ctx.lineWidth = core * 1.6
    ctx.beginPath(); ctx.moveTo(f.ox, f.oy); ctx.lineTo(aim.x + nx, aim.y + ny); ctx.stroke()
    ctx.globalAlpha = env; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = core * 0.7
    ctx.beginPath(); ctx.moveTo(f.ox, f.oy); ctx.lineTo(aim.x + nx, aim.y + ny); ctx.stroke()
    // travelling energy nodes along the beam
    for (let i = 0; i < 7; i++) {
      const t = ((i / 7) + age * 2.2) % 1
      const x = f.ox + ux * len * t, y = f.oy + uy * len * t
      ctx.globalAlpha = env * 0.8
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(x + nx * t, y + ny * t, core * (0.9 + 0.5 * Math.sin(t * 9)), 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()

    fx.beam = { x0: f.ox, y0: f.oy, x1: aim.x, y1: aim.y, amp: 0.5 * env }
    fx.light(f.ox, f.oy, arenaLengthX(deps.layout, 10), 0.5 * env, hexRgb(f.colour), 40)
    fx.light(aim.x, aim.y, base * 2, 0.7 * env, hexRgb(f.colour), 40)
    fx.light((f.ox + aim.x) / 2, (f.oy + aim.y) / 2, arenaLengthX(deps.layout, 20), 0.18 * env, hexRgb(f.colour), 40)
    fx.kick(scaled(deps.layout, 2.4 * env))

    // muzzle + impact splash
    layeredGlow(ctx, f.ox, f.oy, arenaLengthX(deps.layout, 4) * f.tier.radiusMultiplier * env, '#ffffff', env)
    fireball(ctx, fx, aim.x, aim.y, base * (0.3 + env * 0.42), f.colour, env * 0.6)
    for (let s = 0; s < 3; s++) {
      const a = fx.rr(-1.2, 1.2)
      fx.spark(aim.x, aim.y, -ux * fx.rr(150, 520) * Math.cos(a) + fx.rr(-90, 90),
        -uy * fx.rr(150, 520) + fx.rr(-260, 60), fx.rr(280, 700),
        scaled(deps.layout, fx.rr(1.6, 4)), fx.rnd() < 0.5 ? [1, 0.95, 0.8] : hexRgb(f.colour), 320, 1.4, 1)
    }
    if (age > 0.5 && fx.once(u, 'burst')) {
      detonate(fx, deps, aim.x, aim.y, base * 0.8, f.colour, 0.6 * f.tier.radiusMultiplier)
    }
    return
  }

  if (f.phase === 'impact' || f.phase === 'aftermath') {
    const k = f.phase === 'impact' ? 1 - f.local : 1 - f.local
    // lingering scorched column of embers
    layeredGlow(ctx, aim.x, aim.y, base * 0.5 * k, f.colour, k * 0.7)
    if (fx.rnd() < dt / 40) {
      fx.spark(aim.x + fx.rr(-base * 0.5, base * 0.5), aim.y,
        fx.rr(-15, 15), -fx.rr(40, 120), fx.rr(600, 1200),
        scaled(deps.layout, fx.rr(1.2, 2.6)), [1, 0.72, 0.4], -30, 0.6, 1)
    }
    fx.light(aim.x, aim.y, base * 2, 0.35 * k, hexRgb(f.colour), 50)
  }
}

export function drawLaserFx(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): void {
  drawUltimateFxArt(ctx, u, deps, fx, dt, art)
}
