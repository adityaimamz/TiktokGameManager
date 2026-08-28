import { describe, expect, it } from 'vitest'
import { createRecordingContext } from '../../../testing/recording-context.js'
import { GLOW_LAYERS, layeredGlow, strokeLayer } from '../../../../src/games/battle-arena/renderer/glow.js'
import type { GlowPalette } from '../../../../src/games/battle-arena/renderer/glow.js'

const radiiOf = (ctx: ReturnType<typeof createRecordingContext>): number[] =>
  ctx.callsOf('arc').map((c) => c.args[2] as number)

describe('layeredGlow', () => {
  it('menggambar tiga lapis: glow terlebar, badan, lalu core terkecil', () => {
    const ctx = createRecordingContext()
    layeredGlow(ctx, 100, 100, 12, '#ff0044', 1)

    const radii = radiiOf(ctx)
    expect(radii).toHaveLength(3)
    expect(radii[0]).toBeGreaterThan(radii[1] as number)
    expect(radii[1]).toBeGreaterThan(radii[2] as number)
  })

  /*
   * Aturan performa yang mengikat (spec D10). Menolak cache berarti ini digambar ulang tiap
   * frame; pada ratusan partikel, fill ber-blur menghabiskan seluruh anggaran 4 ms sendirian.
   */
  it('TIDAK PERNAH menyetel shadowBlur', () => {
    const ctx = createRecordingContext()
    layeredGlow(ctx, 100, 100, 12, '#ff0044', 1)
    expect(ctx.callsOf('set:shadowBlur')).toHaveLength(0)
  })

  it('membuat core mendekati putih dan lapisan luar memakai warna sisi', () => {
    const ctx = createRecordingContext()
    layeredGlow(ctx, 100, 100, 12, '#ff0044', 1)

    const fills = ctx.callsOf('set:fillStyle').map((c) => c.args[0])
    expect(fills[0]).toBe('#ff0044')
    expect(fills[1]).toBe('#ff0044')
    expect(fills[2]).toBe('#ffffff')
  })

  it('makin ke dalam makin pekat', () => {
    const ctx = createRecordingContext()
    layeredGlow(ctx, 100, 100, 12, '#ff0044', 1)

    const alphas = ctx.callsOf('set:globalAlpha').map((c) => c.args[0] as number)
    expect(alphas[0]).toBeLessThan(alphas[1] as number)
    expect(alphas[1]).toBeLessThan(alphas[2] as number)
  })

  it('menumpuk cahaya, tidak menimpanya', () => {
    const ctx = createRecordingContext()
    layeredGlow(ctx, 100, 100, 12, '#ff0044', 1)
    expect(ctx.callsOf('set:globalCompositeOperation')[0]?.args[0]).toBe('lighter')
  })

  it('menskalakan seluruh lapisan dengan alpha pemanggil', () => {
    const dim = createRecordingContext()
    const bright = createRecordingContext()
    layeredGlow(dim, 100, 100, 12, '#ff0044', 0.25)
    layeredGlow(bright, 100, 100, 12, '#ff0044', 1)

    const first = (c: ReturnType<typeof createRecordingContext>): number =>
      c.callsOf('set:globalAlpha')[0]?.args[0] as number
    expect(first(dim)).toBeLessThan(first(bright))
  })

  it('tidak menggambar apa pun saat tak terlihat', () => {
    const invisible = createRecordingContext()
    layeredGlow(invisible, 100, 100, 12, '#ff0044', 0)
    expect(invisible.calls).toHaveLength(0)

    const nothing = createRecordingContext()
    layeredGlow(nothing, 100, 100, 0, '#ff0044', 1)
    expect(nothing.calls).toHaveLength(0)
  })
})

describe('strokeLayer', () => {
  const palette: GlowPalette = ['#ff0000', '#9fd0ff', '#ffffff']

  const styleFor = (
    layer: number,
    prop: string,
    coreWidth = 4,
  ): number | string | undefined => {
    const ctx = createRecordingContext()
    strokeLayer(ctx, layer, palette, coreWidth, 1)
    return ctx.callsOf(`set:${prop}`)[0]?.args[0] as number | string | undefined
  }

  it('melebar ke luar dan meredup: lapis nol paling lebar dan paling pudar', () => {
    const widths: number[] = []
    const alphas: number[] = []
    for (let l = 0; l < GLOW_LAYERS; l++) {
      widths.push(styleFor(l, 'lineWidth') as number)
      alphas.push(styleFor(l, 'globalAlpha') as number)
    }

    expect(widths[0]).toBeGreaterThan(widths[1] as number)
    expect(widths[1]).toBeGreaterThan(widths[2] as number)
    expect(alphas[0]).toBeLessThan(alphas[1] as number)
    expect(alphas[1]).toBeLessThan(alphas[2] as number)
  })

  it('core memakai warna ketiga palet, glow memakai yang pertama', () => {
    expect(styleFor(0, 'strokeStyle')).toBe('#ff0000')
    expect(styleFor(GLOW_LAYERS - 1, 'strokeStyle')).toBe('#ffffff')
  })

  /* Aturan performa yang sama dengan layeredGlow (spec D10). */
  it('TIDAK PERNAH menyetel shadowBlur', () => {
    const ctx = createRecordingContext()
    for (let l = 0; l < GLOW_LAYERS; l++) strokeLayer(ctx, l, palette, 4, 1)
    expect(ctx.callsOf('set:shadowBlur')).toHaveLength(0)
  })

  /*
   * `coreWidth` adalah lebar lapis TERDALAM, bukan terluar — laser diminta tipis, dan
   * satu-satunya angka yang punya arti di sana adalah setebal apa core-nya.
   */
  it('lebar core adalah lebar yang diminta, tidak dikalikan', () => {
    expect(styleFor(GLOW_LAYERS - 1, 'lineWidth', 2.5)).toBe(2.5)
  })

  it('menumpuk cahaya, tidak menimpanya', () => {
    expect(styleFor(0, 'globalCompositeOperation')).toBe('lighter')
  })
})
