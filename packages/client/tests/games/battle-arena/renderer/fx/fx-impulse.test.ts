import { describe, expect, it } from 'vitest'
import { SIDE_A, SIDE_B } from '@lga/shared'
import { NUKE_TYPES } from '../../../../../src/games/battle-arena/config/index.js'
import { depsFor, ultimateWith } from '../../../../testing/ultimate-fixtures.js'
import { UltimateFxImpulse } from '../../../../../src/games/battle-arena/renderer/fx/fx-impulse.js'
import { FX_IMPACT_AT } from '../../../../../src/games/battle-arena/renderer/fx/fx-timing.js'
import type { RenderDeps } from '../../../../../src/games/battle-arena/renderer/deps.js'

const singularityAt = (progress: number): ReturnType<typeof ultimateWith> =>
  ultimateWith({ variant: NUKE_TYPES.indexOf('singularity'), progress, targetSlots: [0] })

const magnitude = (impulse: { dx: number; dy: number } | undefined): number =>
  impulse === undefined ? 0 : Math.hypot(impulse.dx, impulse.dy)

/**
 * Satu sekutu diselipkan tepat di seberang garis tengah — jarak yang jelas ada di dalam radius
 * tarik (36% lebar arena), jadi tanpa saringan sisi ia PASTI ikut terhisap.
 */
function depsWithAlly(): { deps: RenderDeps; allySlot: number } {
  const deps = depsFor({ fighters: 6 })
  const allySlot = 5
  const ally = deps.fighters[allySlot]
  if (ally === undefined) throw new Error('fixture kehilangan slot sekutu')
  ally.side = SIDE_A
  ally.x = 46
  ally.y = 50
  return { deps, allySlot }
}

describe('UltimateFxImpulse — singularity', () => {
  /*
   * Bug yang melahirkan test ini: tarikannya menyapu SEMUA fighter dalam radius, dan karena
   * pusat orb berangkat dari sisi caster sendiri, separuh regu sendiri ikut terhisap. Damage-nya
   * tidak pernah menyentuh mereka, jadi gambarnya berbohong soal siapa yang kena.
   */
  it('tidak menarik fighter sisi sendiri', () => {
    const { deps, allySlot } = depsWithAlly()
    const impulse = new UltimateFxImpulse()

    for (const progress of [0.3, FX_IMPACT_AT + 0.02, 0.8]) {
      impulse.observe([singularityAt(progress)], 1, deps)
      expect(magnitude(impulse.for(allySlot))).toBe(0)
    }
  })

  it('tetap menarik fighter sisi lawan', () => {
    const { deps } = depsWithAlly()
    const impulse = new UltimateFxImpulse()
    impulse.observe([singularityAt(FX_IMPACT_AT + 0.02)], 1, deps)

    const pulled = deps.fighters
      .slice(0, deps.fighterCount)
      .filter((f) => f.side === SIDE_B)
      .filter((f) => magnitude(impulse.for(f.slotIndex)) > 0)

    expect(pulled.length).toBeGreaterThan(0)
  })

  /** Caster di sisi B: yang tersedot harus sisi A, bukan lagi sisi B. */
  it('membalik sisi korban saat yang menembak sisi seberang', () => {
    const { deps, allySlot } = depsWithAlly()
    const impulse = new UltimateFxImpulse()
    impulse.observe(
      [
        ultimateWith({
          variant: NUKE_TYPES.indexOf('singularity'),
          progress: FX_IMPACT_AT + 0.02,
          originX: 75,
          targetX: 25,
          targetSlots: [],
        }),
      ],
      1,
      deps,
    )

    expect(magnitude(impulse.for(allySlot))).toBeGreaterThan(0)
    expect(magnitude(impulse.for(0))).toBe(0)
  })
})
