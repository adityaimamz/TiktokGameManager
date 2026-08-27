import type { RenderDeps } from '../deps.js'
import type { InterpolatedUltimate } from '../interpolate.js'
import { nukeTypeFromIndex } from '../../snapshot.js'
import type { UltimateFxState } from './fx-state.js'
import { drawMissileRainFx } from './variants/missile-rain-fx.js'
import { drawBombFx } from './variants/bomb-fx.js'
import { drawLaserFx } from './variants/laser-fx.js'
import { drawLightningFx } from './variants/lightning-fx.js'
import { drawSingularity } from './variants/singularity-fx.js'
import { drawChainFreeze } from './variants/chain-freeze-fx.js'

export { UltimateFxState, FX_TUNING_DEFAULT, hexRgb, rgba, fxClamp } from './fx-state.js'
export type { FxTuning, FxFreeze, Rgb } from './fx-state.js'
export {
  FX_CHARGE_END,
  FX_DURATION_MS,
  FX_DURATION_MS_NEW,
  FX_IMPACT_AT,
  FX_IMPACT_END,
  fxFlashAlpha,
  fxPhaseAt,
  fxPhaseProgress,
} from './fx-timing.js'
export { drawUltimateFxArt, fxFrameOf, fighterOf } from './fx-art.js'
export type { UltimateFxArt } from './fx-art.js'
export { drawFxDecals, drawFxSmoke } from './fx-paint.js'
export { UltimateFxImpulse } from './fx-impulse.js'
export { UltimateFxPost } from './fx-post.js'
export { drawMissileRainFx, drawBombFx, drawLaserFx, drawLightningFx, drawSingularity, drawChainFreeze }

/**
 * Satu pintu untuk keenam varian jalur FX.
 *
 * Mengembalikan false untuk varian yang tidak dikenal — pemanggil MELEWATINYA, bukan
 * menjatuhkan overlay: snapshot dari config masa depan tidak boleh mematikan siaran.
 */
export function drawUltimateFx(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): boolean {
  switch (nukeTypeFromIndex(u.variant)) {
    case 'missileRain':
      drawMissileRainFx(ctx, u, deps, fx, dt)
      return true
    case 'bomb':
      drawBombFx(ctx, u, deps, fx, dt)
      return true
    case 'laser':
      drawLaserFx(ctx, u, deps, fx, dt)
      return true
    case 'lightning':
      drawLightningFx(ctx, u, deps, fx, dt)
      return true
    case 'singularity':
      drawSingularity(ctx, u, deps, fx, dt)
      return true
    case 'chainFreeze':
      drawChainFreeze(ctx, u, deps, fx, dt)
      return true
    default:
      return false
  }
}
