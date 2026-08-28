import { describe, expect, it } from 'vitest'
import { createSnapshotView } from '@lga/shared'
import type { SnapshotView } from '@lga/shared'
import { createRecordingContext } from '../../../testing/recording-context.js'
import { EFFECT_TYPES, defaultConfig } from '../../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig, NukeType } from '../../../../src/games/battle-arena/config/index.js'
import { AvatarCache } from '../../../../src/games/battle-arena/renderer/avatar-cache.js'
import { clearStage, drawEffects, drawProjectiles, drawZones, shakeOffset } from '../../../../src/games/battle-arena/renderer/canvas.js'
import { DeathFade } from '../../../../src/games/battle-arena/renderer/death-fade.js'
import { HpDisplay } from '../../../../src/games/battle-arena/renderer/hp-display.js'
import { PROJECTILE_RADIUS } from '../../../../src/games/battle-arena/arena.js'
import { arenaLengthY, computeStageLayout } from '../../../../src/games/battle-arena/renderer/layout.js'
import { depsFor } from '../../../testing/ultimate-fixtures.js'
import type { RenderDeps } from '../../../../src/games/battle-arena/renderer/canvas.js'

const deps = (config: BattleArenaConfig = defaultConfig()): RenderDeps => ({
  ...depsFor({ config }),
  avatars: new AvatarCache({ load: () => new Promise(() => {}) }),
  reducedMotion: false,
})

const viewWithProjectiles = (
  projectiles: { x: number; y: number; vx: number; vy: number; kind: number; age?: number }[],
): SnapshotView => {
  const view = createSnapshotView()
  view.header.projectileCount = projectiles.length
  // Umur bawaan: sudah lama terbang, jadi berkasnya panjang penuh kecuali sebuah test
  // memang sedang menguji tembakan yang baru lahir.
  view.projectiles = projectiles.map((p) => ({ age: 500, ...p }))
  return view
}

/** Panjang ruas berkas yang tergambar, dalam piksel. */
const beamLengthOf = (ctx: ReturnType<typeof createRecordingContext>): number => {
  const [mx, my] = ctx.callsOf('moveTo')[0]?.args ?? []
  const [lx, ly] = ctx.callsOf('lineTo')[0]?.args ?? []
  return Math.hypot(Number(lx) - Number(mx), Number(ly) - Number(my))
}

describe('clearStage', () => {
  it('wipes the whole canvas so nothing from last frame survives', () => {
    const ctx = createRecordingContext()
    clearStage(ctx)

    expect(ctx.callsOf('clearRect')[0]?.args).toEqual([0, 0, 1600, 900])
  })
})

describe('drawZones', () => {
  it('paints the top and bottom bands solid black over their own rects', () => {
    const ctx = createRecordingContext()
    const d = deps()
    drawZones(ctx, d)

    const rects = ctx.callsOf('fillRect').map((call) => call.args)
    expect(rects).toContainEqual([
      d.layout.top.x,
      d.layout.top.y,
      d.layout.top.width,
      d.layout.top.height,
    ])
    expect(rects).toContainEqual([
      d.layout.bottom.x,
      d.layout.bottom.y,
      d.layout.bottom.width,
      d.layout.bottom.height,
    ])
    expect(ctx.callsOf('set:fillStyle').some((call) => call.args[0] === '#000000')).toBe(true)
  })

  it('applies overlay transparency to the background layers and restores it after', () => {
    const config = defaultConfig()
    config.overlay.transparency = 50
    const ctx = createRecordingContext()
    drawZones(ctx, deps(config))

    const alphas = ctx.callsOf('set:globalAlpha').map((call) => call.args[0])
    expect(alphas[0]).toBeCloseTo(0.5, 6)
    expect(alphas[alphas.length - 1]).toBe(1)
  })

  it('leaves the arena unpainted when the background is transparent', () => {
    const config = defaultConfig()
    config.overlay.arenaBackground = { kind: 'transparent' }
    const ctx = createRecordingContext()
    const d = deps(config)
    drawZones(ctx, d)

    // Lebar wajib ikut diperiksa: tint sisi A juga mulai di arena.x dengan tinggi arena,
    // hanya selebar separuh. Tanpa cek lebar, test ini tidak pernah bisa gagal.
    const arenaFill = ctx
      .callsOf('fillRect')
      .find(
        (call) =>
          call.args[0] === d.layout.arena.x &&
          call.args[2] === d.layout.arena.width &&
          call.args[3] === d.layout.arena.height,
      )
    expect(arenaFill).toBeUndefined()
  })

  it('fills the arena with the configured colour otherwise', () => {
    const config = defaultConfig()
    config.overlay.arenaBackground = { kind: 'color', value: '#101820' }
    const ctx = createRecordingContext()
    const d = deps(config)
    drawZones(ctx, d)

    expect(ctx.callsOf('fillRect')).toContainEqual({
      op: 'fillRect',
      args: [d.layout.arena.x, d.layout.arena.y, d.layout.arena.width, d.layout.arena.height],
    })
  })

  it('tints each half with its own side colour', () => {
    const config = defaultConfig()
    config.sides.a.color = '#ff0000'
    config.sides.b.color = '#0000ff'
    const ctx = createRecordingContext()
    const d = deps(config)
    drawZones(ctx, d)

    const half = d.layout.arena.width / 2
    const rects = ctx.callsOf('fillRect').map((call) => call.args)
    expect(rects).toContainEqual([d.layout.arena.x, d.layout.arena.y, half, d.layout.arena.height])
    expect(rects).toContainEqual([
      d.layout.arena.x + half,
      d.layout.arena.y,
      half,
      d.layout.arena.height,
    ])
    const colours = ctx.callsOf('set:fillStyle').map((call) => call.args[0])
    expect(colours).toContain('#ff0000')
    expect(colours).toContain('#0000ff')
  })

  it('draws a side background image instead of the tint when one is loaded', () => {
    const config = defaultConfig()
    config.sides.a.backgroundImage = 'https://x.test/a.png'
    const image = { width: 10, height: 10 } as unknown as CanvasImageSource
    const ctx = createRecordingContext()
    drawZones(ctx, { ...deps(config), image: () => image })

    expect(ctx.callsOf('drawImage')).toHaveLength(1)
  })

  it('draws the midline down the middle of the arena', () => {
    const ctx = createRecordingContext()
    const d = deps()
    drawZones(ctx, d)

    const mid = d.layout.arena.x + d.layout.arena.width / 2
    const moves = ctx.callsOf('moveTo').map((call) => call.args[0])
    expect(moves).toContain(mid)
  })
})

describe('drawProjectiles', () => {
  it('draws one circle per active projectile', () => {
    const ctx = createRecordingContext()
    drawProjectiles(
      ctx,
      viewWithProjectiles([
        { x: 10, y: 10, vx: 0, vy: 0, kind: 0 },
        { x: 20, y: 20, vx: 0, vy: 0, kind: 1 },
      ]),
      0,
      deps(),
    )

    expect(ctx.callsOf('arc')).toHaveLength(2)
  })

  it('extrapolates the position by alpha before drawing', () => {
    const ctx = createRecordingContext()
    const d = deps()
    drawProjectiles(ctx, viewWithProjectiles([{ x: 10, y: 50, vx: 4, vy: 0, kind: 0 }]), 0.5, d)

    const [x] = ctx.callsOf('arc')[0]?.args ?? []
    const expected = d.layout.arena.x + (12 / 100) * d.layout.arena.width
    expect(x).toBeCloseTo(expected, 4)
  })

  it('colours the trail by the side that fired it', () => {
    const config = defaultConfig()
    config.sides.a.color = '#ff0000'
    config.sides.b.color = '#0000ff'
    const ctx = createRecordingContext()
    drawProjectiles(
      ctx,
      viewWithProjectiles([
        { x: 10, y: 10, vx: 0, vy: 0, kind: 0 },
        { x: 20, y: 20, vx: 0, vy: 0, kind: 1 },
      ]),
      0,
      deps(config),
    )

    const colours = ctx.callsOf('set:fillStyle').map((call) => call.args[0])
    expect(colours).toContain('#ff0000')
    expect(colours).toContain('#0000ff')
  })

  /**
   * Setipis hitbox-nya, dan sependek satu berkas.
   *
   * Sebelum ini ekornya empat kali langkah satu tick — 20% lebar arena — dengan lebar 27 px,
   * dan yang tampil di layar adalah coretan gemuk, bukan tembakan. Dikunci sebagai relasi
   * terhadap hitbox dan terhadap lebar arena, bukan sebagai dua angka lepas.
   */
  it('menggambar inti berkas setebal diameter hitbox-nya', () => {
    const ctx = createRecordingContext()
    const d = deps()
    drawProjectiles(ctx, viewWithProjectiles([{ x: 10, y: 50, vx: 4, vy: 0, kind: 0 }]), 0, d)

    const widths = ctx.callsOf('set:lineWidth').map((call) => call.args[0])
    expect(widths).toContain(arenaLengthY(d.layout, PROJECTILE_RADIUS) * 2)
  })

  it('menggambar berkas pendek, bukan ekor melintasi separuh arena', () => {
    const ctx = createRecordingContext()
    const d = deps()
    drawProjectiles(ctx, viewWithProjectiles([{ x: 10, y: 50, vx: 4, vy: 0, kind: 0 }]), 0, d)

    const length = beamLengthOf(ctx)

    expect(length).toBeGreaterThan(0)
    expect(length).toBeLessThan(d.layout.arena.width * 0.1)
  })

  /**
   * Berkas tumbuh dari titik lepasnya, tidak menjulur ke belakang penembaknya.
   *
   * Bug yang ditutup: pada frame pertama kepala peluru masih persis di pusat blob, jadi
   * berkas sepanjang penuh keluar di sisi seberang fighter — terlihat seperti tembakan
   * yang lahir dari punggungnya.
   */
  it('tidak menggambar berkas apa pun pada frame peluru itu lahir', () => {
    const ctx = createRecordingContext()
    const view = viewWithProjectiles([{ x: 10, y: 50, vx: 4, vy: 0, kind: 0, age: 0 }])
    drawProjectiles(ctx, view, 0, deps())

    expect(beamLengthOf(ctx)).toBe(0)
  })

  it('memanjangkan berkas hanya sejauh jarak yang sudah ditempuh', () => {
    const ctx = createRecordingContext()
    const d = deps()
    const view = viewWithProjectiles([{ x: 10, y: 50, vx: 4, vy: 0, kind: 0, age: 0 }])
    drawProjectiles(ctx, view, 0.5, d)

    // Setengah langkah tick: kepala sudah 2% lebar arena dari titik lepas, dan ekornya
    // mendarat persis di titik itu — tidak sedikit pun di belakangnya.
    expect(beamLengthOf(ctx)).toBeCloseTo(d.layout.arena.width * 0.02, 4)
  })

  it('honours the count, not the array length', () => {
    const ctx = createRecordingContext()
    const view = viewWithProjectiles([
      { x: 10, y: 10, vx: 0, vy: 0, kind: 0 },
      { x: 20, y: 20, vx: 0, vy: 0, kind: 0 },
    ])
    view.header.projectileCount = 1

    drawProjectiles(ctx, view, 0, deps())

    expect(ctx.callsOf('arc')).toHaveLength(1)
  })
})

const viewWithEffect = (type: number, progress: number, intensity = 1): SnapshotView => {
  const view = createSnapshotView()
  view.header.effectCount = 1
  view.effects = [{ type, x: 40, y: 30, progress, intensity, value: 0 }]
  return view
}

describe('shakeOffset', () => {
  it('tidak menggeser apa pun saat creator mematikan screen shake', () => {
    const config = defaultConfig()
    config.ui.screenShake = false
    // 8 = indeks 'nuke' pada EFFECT_TYPES.
    expect(shakeOffset(viewWithEffect(8, 0), config, false)).toEqual({ x: 0, y: 0 })
  })

  it('menggeser saat ada nuke yang baru lahir', () => {
    const offset = shakeOffset(viewWithEffect(8, 0), defaultConfig(), false)
    expect(Math.abs(offset.x) + Math.abs(offset.y)).toBeGreaterThan(0)
  })

  it('meredam sampai nol seiring efek menua', () => {
    const config = defaultConfig()
    const muda = shakeOffset(viewWithEffect(8, 0.1), config, false)
    const tua = shakeOffset(viewWithEffect(8, 0.9), config, false)

    expect(Math.abs(muda.x)).toBeGreaterThan(Math.abs(tua.x))
    expect(shakeOffset(viewWithEffect(8, 1), config, false)).toEqual({ x: 0, y: 0 })
  })

  it('mengabaikan efek yang bukan guncangan', () => {
    // 0 = indeks 'hit'.
    expect(shakeOffset(viewWithEffect(0, 0), defaultConfig(), false)).toEqual({ x: 0, y: 0 })
  })

  it('memberi hasil yang sama untuk masukan yang sama — tanpa Math.random', () => {
    const config = defaultConfig()
    expect(shakeOffset(viewWithEffect(8, 0.3), config, false)).toEqual(
      shakeOffset(viewWithEffect(8, 0.3), config, false),
    )
  })

  it('reduced motion mematikan guncangan sepenuhnya', () => {
    const config = defaultConfig()
    config.ui.screenShake = true

    expect(shakeOffset(viewWithEffect(8, 0), config, false)).not.toEqual({ x: 0, y: 0 })
    expect(shakeOffset(viewWithEffect(8, 0), config, true)).toEqual({ x: 0, y: 0 })
  })
})

describe('drawEffects untuk nuke', () => {
  const viewWithNuke = (): SnapshotView => {
    const view = createSnapshotView()
    view.header.effectCount = 1
    view.effects = [
      { type: EFFECT_TYPES.indexOf('nuke'), x: 75, y: 50, progress: 0.25, intensity: 1, value: 0 },
    ]
    return view
  }

  const callsFor = (type: NukeType) => {
    const config = defaultConfig()
    config.gameplay.nuke.type = type
    const ctx = createRecordingContext()
    drawEffects(ctx, viewWithNuke(), deps(config))
    return ctx
  }

  /*
   * Sejak Plan 6a engine tidak pernah lagi men-spawn efek bertipe 'nuke' — ultimate hidup di
   * `state.activeUltimates` dan digambar `drawUltimates`. Anggota 'nuke' di EFFECT_TYPES tetap
   * ada (menghapusnya menggeser indeks tipe efek yang tersimpan di config creator), jadi yang
   * diuji di sini tinggal satu hal: kalau ada yang men-spawn-nya lagi, ia jatuh ke jalur
   * lingkaran yang sama seperti efek lain, bukan ke gambar khusus yang sudah dibuang.
   */
  it('jatuh ke jalur lingkaran yang sama untuk setiap tipe nuke di config', () => {
    for (const type of ['missileRain', 'laser', 'bomb', 'lightning'] as NukeType[]) {
      const ctx = callsFor(type)
      expect(ctx.callsOf('arc')).toHaveLength(1)
      expect(ctx.callsOf('stroke')).toHaveLength(1)
      expect(ctx.callsOf('fillRect')).toHaveLength(0)
      expect(ctx.callsOf('lineTo')).toHaveLength(0)
    }
  })

  it('tidak mengubah cara efek lain digambar', () => {
    const view = createSnapshotView()
    view.header.effectCount = 1
    view.effects = [
      { type: EFFECT_TYPES.indexOf('heal'), x: 25, y: 50, progress: 0.5, intensity: 1, value: 0 },
    ]
    const ctx = createRecordingContext()

    drawEffects(ctx, view, deps())

    expect(ctx.callsOf('arc')).toHaveLength(1)
    expect(ctx.callsOf('stroke')).toHaveLength(1)
  })
})
