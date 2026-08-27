import type { RenderDeps } from '../../deps.js'
import { arenaLengthX, scaled } from '../../layout.js'
import { layeredGlow } from '../../glow.js'
import type { InterpolatedUltimate } from '../../interpolate.js'
import type { FrameTarget } from '../../ultimate-draw.js'
import { BOLT_POINTS, boltPath } from '../../bolt.js'
import { drawUltimateFxArt } from '../fx-art.js'
import type { UltimateFxArt } from '../fx-art.js'
import { drawFxCharge, drawFxReticle, strokeBolt } from '../fx-paint.js'
import { hexRgb } from '../fx-state.js'
import type { UltimateFxState } from '../fx-state.js'
import { FX_IMPACT_AT } from '../fx-timing.js'

/**
 * Petir, versi FX.
 *
 * Sambaran utamanya lebih tebal dan membawa NODE TERANG yang berjalan sepanjang jalurnya —
 * itu yang membuat petir terbaca sebagai arus, bukan sebagai garis. Arc ke sasaran kedua dan
 * seterusnya berangkat BERGILIRAN, 120 ms selisih, masing-masing dengan percikan sendiri saat
 * mendarat.
 */
const art: UltimateFxArt = (ctx, f, deps, fx, dt) => {
  if (f.phase === 'charge') {
    drawFxCharge(ctx, f, deps, fx, dt)
    return
  }
  const u = f.source
  const nuke = deps.config.gameplay.nuke
  const aim = f.targetCount > 0 ? (f.targets[0] as FrameTarget) : { x: f.tx, y: f.ty }
  const amplitude = arenaLengthX(deps.layout, 4.6) * f.tier.radiusMultiplier
  const shape = Math.floor((f.progress * u.msPerProgress) / 50)
  const core = scaled(deps.layout, 4.2) * (0.75 + f.tier.radiusMultiplier * 0.25)
  const reach = f.progress >= FX_IMPACT_AT ? 1 : Math.min(1, f.local)
  const flicker = 0.75 + 0.25 * Math.abs(Math.sin(shape * 2.399))

  boltPath(f.ox, f.oy, aim.x, aim.y, amplitude, shape, fx.boltMain)
  strokeBolt(ctx, f, fx.boltMain, reach, core, flicker, '#c7e6ff')

  const bp = BOLT_POINTS
  const pulseT = (shape % 10) / 10
  const pi = Math.min(bp - 1, Math.round(pulseT * (bp - 1) * reach))
  layeredGlow(ctx, (fx.boltMain[pi * 2] as number), (fx.boltMain[pi * 2 + 1] as number), core * 1.6, '#ffffff', flicker)

  const branches = Math.max(2, Math.round(nuke.lightning.branches * f.tier.densityMultiplier * 1.6))
  for (let b2 = 1; b2 <= branches; b2++) {
    const at = ((b2 * 5) % (bp - 2)) + 1
    if (at / (bp - 1) > reach) continue
    const bx = (fx.boltMain[at * 2] as number), by = (fx.boltMain[at * 2 + 1] as number)
    const spread = amplitude * (1.8 + (b2 % 3) * 0.9)
    boltPath(bx, by, bx + Math.cos(b2 * 2.399) * spread, by + Math.sin(b2 * 2.399) * spread,
      amplitude * 0.6, shape * 17 + b2, fx.boltBranch)
    strokeBolt(ctx, f, fx.boltBranch, 1, core * 0.4, flicker * 0.65, '#9fd0ff')
    fx.light(bx, by, arenaLengthX(deps.layout, 6), 0.3 * flicker, hexRgb(f.colour), 40)
  }

  if (f.progress >= FX_IMPACT_AT - 0.002 && fx.once(u, 'zap')) {
    fx.kick(scaled(deps.layout, 8))
    fx.light(f.ox, f.oy, arenaLengthX(deps.layout, 16), 1.2, hexRgb(f.colour), 90)
  }

  const age = (f.progress - FX_IMPACT_AT) / 0.16
  if (age >= 0 && age < 1) {
    for (let i = 1; i < f.targetCount; i++) {
      const delay = (i - 1) * 0.12
      const local = (age - delay) / (1 - delay)
      if (local < 0 || local >= 1) continue
      const t = (f.targets[i] as FrameTarget)
      boltPath(aim.x, aim.y, t.x, t.y, amplitude * 0.7, shape * 29 + i, fx.boltArc)
      const arcReach = Math.min(1, local * 3)
      strokeBolt(ctx, f, fx.boltArc, arcReach, core * 0.55, (1 - local) * flicker, '#c7e6ff')
      if (arcReach >= 1 && fx.once(u, 'arc' + i)) {
        fx.light(t.x, t.y, arenaLengthX(deps.layout, 9), 0.7, hexRgb(f.colour), 50)
        for (let s = 0; s < 8; s++) {
          const a = fx.rr(0, Math.PI * 2)
          fx.spark(t.x, t.y, Math.cos(a) * fx.rr(60, 220), Math.sin(a) * fx.rr(60, 220),
            fx.rr(180, 420), scaled(deps.layout, fx.rr(1.2, 2.6)), [0.75, 0.88, 1], 200, 2, 1)
        }
      }
    }
  }

  if (f.phase === 'impact') {
    const p = f.local
    layeredGlow(ctx, aim.x, aim.y, arenaLengthX(deps.layout, nuke.blastRadiusPct) * f.tier.radiusMultiplier * (0.5 + p), f.colour, (1 - p) * 0.9)
    if (fx.once(u, 'burst')) {
      for (let s = 0; s < 26; s++) {
        const a = fx.rr(0, Math.PI * 2)
        fx.spark(aim.x, aim.y, Math.cos(a) * fx.rr(120, 420), Math.sin(a) * fx.rr(120, 420) * 0.7,
          fx.rr(220, 520), scaled(deps.layout, fx.rr(1.4, 3.2)), fx.rnd() < 0.5 ? [1, 1, 1] : hexRgb(f.colour), 260, 2, 1)
      }
    }
  }
  if (f.phase === 'aftermath') {
    const k = 1 - f.local
    layeredGlow(ctx, aim.x, aim.y, arenaLengthX(deps.layout, 6) * k, f.colour, k * 0.4)
  }

  if (fx.rnd() < dt / 30) {
    const idx = Math.min(16, Math.round(fx.rnd() * 16 * reach))
    fx.spark((fx.boltMain[idx * 2] as number), (fx.boltMain[idx * 2 + 1] as number), fx.rr(-40, 40), fx.rr(-40, 40),
      fx.rr(120, 260), scaled(deps.layout, fx.rr(1, 2.2)), [0.8, 0.9, 1], 0, 3, 1)
  }

  if (f.phase === 'travel') drawFxReticle(ctx, f, deps, fx)
}

export function drawLightningFx(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): void {
  drawUltimateFxArt(ctx, u, deps, fx, dt, art)
}
