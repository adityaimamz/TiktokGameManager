import { describe, expect, it } from 'vitest'
import {
  IMPACT_AT,
  SIDE_A,
  SIDE_B,
  SNAPSHOT_HEADER_LENGTH,
  SnapshotHistory,
  createSnapshotView,
  snapshotLength,
} from '@lga/shared'
import type { SnapshotUltimate, SnapshotView } from '@lga/shared'
import { createRecordingContext } from '../../../testing/recording-context.js'
import { NUKE_TYPES, defaultConfig } from '../../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../../src/games/battle-arena/config/index.js'
import type { RosterEntry } from '../../../../src/games/battle-arena/snapshot.js'
import { AvatarCache } from '../../../../src/games/battle-arena/renderer/avatar-cache.js'
import {
  BattleArenaRenderer,
  drawArenaFlash,
  drawEffects,
  drawFighters,
  hpColor,
  truncate,
} from '../../../../src/games/battle-arena/renderer/canvas.js'
import type { RenderDeps } from '../../../../src/games/battle-arena/renderer/canvas.js'
import { DEATH_FADE_MS, DeathFade } from '../../../../src/games/battle-arena/renderer/death-fade.js'
import { HpDisplay } from '../../../../src/games/battle-arena/renderer/hp-display.js'
import { computeStageLayout, fighterDiameter } from '../../../../src/games/battle-arena/renderer/layout.js'
import { FIGHTER_SCALE_MAX, FIGHTER_SCALE_MIN, fighterScale } from '../../../../src/games/battle-arena/arena.js'
import { UltimateFxImpulse } from '../../../../src/games/battle-arena/renderer/fx/fx-impulse.js'
import type { InterpolatedFighter } from '../../../../src/games/battle-arena/renderer/interpolate.js'
import { depsFor, ultimateWith } from '../../../testing/ultimate-fixtures.js'

const deps = (
  config: BattleArenaConfig = defaultConfig(),
  over: Partial<RenderDeps> = {},
): RenderDeps => ({
  ...depsFor({ config }),
  avatars: new AvatarCache({ load: () => new Promise(() => {}) }),
  ...over,
})

const fighter = (over: Partial<InterpolatedFighter> = {}): InterpolatedFighter => ({
  slotIndex: 0,
  x: 25,
  y: 50,
  hp: 100,
  maxHp: 100,
  side: SIDE_A,
  alive: 1,
  facingAngle: 0,
  targetSlot: -1,
  kills: 0,
  giftCoins: 0,
  ...over,
})

const roster = (entries: Partial<RosterEntry>[]): Map<number, RosterEntry> => {
  const map = new Map<number, RosterEntry>()
  entries.forEach((entry, index) =>
    map.set(entry.slotIndex ?? index, {
      slotIndex: entry.slotIndex ?? index,
      username: entry.username ?? `viewer-${index}`,
      avatarUrl: entry.avatarUrl ?? null,
      side: entry.side ?? 'a',
      platform: entry.platform ?? 'tiktok',
    }),
  )
  return map
}

describe('hpColor', () => {
  it('goes green, yellow, red as HP drains (Req 33 AC5)', () => {
    expect(hpColor(1)).toBe(hpColor(0.8))
    expect(hpColor(0.6)).not.toBe(hpColor(0.4))
    expect(hpColor(0.4)).not.toBe(hpColor(0.1))
  })

  it('treats the boundaries as belonging to the healthier band', () => {
    expect(hpColor(0.5)).toBe(hpColor(0.9))
    expect(hpColor(0.25)).toBe(hpColor(0.4))
  })
})

describe('truncate', () => {
  it('leaves short names alone and shortens long ones', () => {
    expect(truncate('andi', 10)).toBe('andi')
    expect(truncate('averyverylongusername', 10)).toHaveLength(10)
  })
})

describe('drawFighters', () => {
  it('draws one avatar circle per fighter', () => {
    const ctx = createRecordingContext()
    drawFighters(
      ctx,
      [fighter({ slotIndex: 0 }), fighter({ slotIndex: 1, x: 75, side: SIDE_B })],
      2,
      roster([{}, {}]),
      deps(),
    )

    expect(ctx.callsOf('arc').length).toBeGreaterThanOrEqual(2)
  })

  /*
   * D8: sebuah `ImpulseSource` adalah SATU-SATUNYA jalan ultimate mempengaruhi penggambaran
   * fighter. Petir mengisi `flash`, bom mengisi `dx`/`dy`, dan keduanya lewat pintu ini.
   * Pelaksananya `UltimateFxImpulse` sejak jalur gambar lama dibuang (Plan 8); yang diuji di
   * sini adalah ujung penerimanya — `drawFighters` benar-benar memutihkan yang ber-`flash`.
   */
  it('memutihkan fighter yang tersambar petir', () => {
    const impulse = new UltimateFxImpulse()
    const d = deps()
    impulse.observe(
      [
        ultimateWith({
          variant: NUKE_TYPES.indexOf('lightning'),
          progress: IMPACT_AT + 0.005,
          targetSlots: [0],
        }),
      ],
      1,
      { ...d, fighters: [fighter({ slotIndex: 0 })], fighterCount: 1 },
    )

    const white = (withImpulse: boolean): number => {
      const ctx = createRecordingContext()
      drawFighters(
        ctx,
        [fighter({ slotIndex: 0 })],
        1,
        roster([{}]),
        d,
        withImpulse ? impulse : undefined,
      )
      return ctx.callsOf('set:fillStyle').filter((c) => c.args[0] === '#ffffff').length
    }

    expect(white(true)).toBeGreaterThan(white(false))
  })

  it('sizes the HP bar against maxHp, not the configured base HP', () => {
    const config = defaultConfig()
    config.gameplay.baseHp = 200
    const ctx = createRecordingContext()
    const d = deps(config)
    drawFighters(ctx, [fighter({ hp: 400, maxHp: 800 })], 1, roster([{}]), d)

    // Bar penuh dan bar terisi punya lebar yang sama-sama dicatat; yang terisi setengahnya.
    const widths = ctx.callsOf('fillRect').map((call) => call.args[2] as number)
    const full = Math.max(...widths)
    expect(widths).toContainEqual(full / 2)
  })

  // Fighter mati kini diurus `describe('drawFighters and the dead')` di bawah: ia memudar
  // lewat DeathFade lalu berhenti digambar, bukan menetap pada satu alpha tetap.

  it('writes the fighter name only when the toggle is on', () => {
    const on = defaultConfig()
    on.ui.showFighterNames = true
    const off = defaultConfig()
    off.ui.showFighterNames = false

    const withNames = createRecordingContext()
    drawFighters(withNames, [fighter()], 1, roster([{ username: 'andi' }]), deps(on))
    const withoutNames = createRecordingContext()
    drawFighters(withoutNames, [fighter()], 1, roster([{ username: 'andi' }]), deps(off))

    const texts = (ctx: ReturnType<typeof createRecordingContext>) =>
      ctx.callsOf('fillText').map((call) => call.args[0])
    expect(texts(withNames)).toContain('andi')
    expect(texts(withoutNames)).not.toContain('andi')
  })

  it('falls back to the initial when no avatar bitmap is ready', () => {
    const ctx = createRecordingContext()
    drawFighters(
      ctx,
      [fighter()],
      1,
      roster([{ username: 'andi', avatarUrl: 'https://x.test/a.png' }]),
      deps(),
    )

    expect(ctx.callsOf('drawImage')).toHaveLength(0)
    expect(ctx.callsOf('fillText').map((call) => call.args[0])).toContain('A')
  })

  it('survives a fighter that is not in the roster yet', () => {
    const ctx = createRecordingContext()
    expect(() =>
      drawFighters(ctx, [fighter({ slotIndex: 99 })], 1, roster([]), deps()),
    ).not.toThrow()
  })
})

describe('drawEffects', () => {
  const viewWithEffects = (
    effects: {
      type: number
      x: number
      y: number
      progress: number
      intensity: number
      value: number
    }[],
  ): SnapshotView => {
    const view = createSnapshotView()
    view.header.effectCount = effects.length
    view.effects = effects
    return view
  }

  it('draws one shape per active effect', () => {
    const ctx = createRecordingContext()
    drawEffects(
      ctx,
      viewWithEffects([{ type: 0, x: 10, y: 10, progress: 0.3, intensity: 1, value: 0 }]),
      deps(),
    )

    expect(ctx.callsOf('arc').length).toBeGreaterThanOrEqual(1)
  })

  it('floats the damage number for a hit when the toggle is on', () => {
    const config = defaultConfig()
    config.ui.showFloatingDamage = true
    const ctx = createRecordingContext()
    drawEffects(
      ctx,
      viewWithEffects([{ type: 0, x: 10, y: 50, progress: 0.5, intensity: 1, value: 17 }]),
      deps(config),
    )

    expect(ctx.callsOf('fillText').map((call) => call.args[0])).toContain('17')
  })

  it('stays silent about damage when the toggle is off', () => {
    const config = defaultConfig()
    config.ui.showFloatingDamage = false
    const ctx = createRecordingContext()
    drawEffects(
      ctx,
      viewWithEffects([{ type: 0, x: 10, y: 50, progress: 0.5, intensity: 1, value: 17 }]),
      deps(config),
    )

    expect(ctx.callsOf('fillText').map((call) => call.args[0])).not.toContain('17')
  })

  it('lifts the number as the effect progresses', () => {
    const config = defaultConfig()
    config.ui.showFloatingDamage = true
    const early = createRecordingContext()
    const late = createRecordingContext()
    drawEffects(
      early,
      viewWithEffects([{ type: 0, x: 10, y: 50, progress: 0.1, intensity: 1, value: 5 }]),
      deps(config),
    )
    drawEffects(
      late,
      viewWithEffects([{ type: 0, x: 10, y: 50, progress: 0.9, intensity: 1, value: 5 }]),
      deps(config),
    )

    const y = (ctx: ReturnType<typeof createRecordingContext>) =>
      ctx.callsOf('fillText')[0]?.args[2] as number
    expect(y(late)).toBeLessThan(y(early))
  })

  it('ignores an unknown effect type instead of throwing', () => {
    const ctx = createRecordingContext()
    expect(() =>
      drawEffects(
        ctx,
        viewWithEffects([{ type: 99, x: 1, y: 1, progress: 0, intensity: 1, value: 0 }]),
        deps(),
      ),
    ).not.toThrow()
  })
})

describe('BattleArenaRenderer', () => {
  const snapshotWithOneFighter = (x: number): Float32Array => {
    const buf = new Float32Array(snapshotLength(1, 0, 0))
    buf.set([1, 0, 3, 0, 0, 0, 0, 1, 0, 0, -1], 0)
    buf.set([0, x, 50, 100, 100, SIDE_A, 1, 0, -1, 0], SNAPSHOT_HEADER_LENGTH)
    return buf
  }

  it('draws the layers back to front', () => {
    const history = new SnapshotHistory()
    history.push(snapshotWithOneFighter(20))
    const ctx = createRecordingContext()
    const renderer = new BattleArenaRenderer({ layout: computeStageLayout(1600, 900, 'landscape') })
    renderer.setHistory(history)
    renderer.setRoster([
      { slotIndex: 0, username: 'andi', avatarUrl: null, side: 'a', platform: 'tiktok' },
    ])

    renderer.render(ctx, history.current, defaultConfig(), 0)

    expect(ctx.firstIndexOf('clearRect')).toBe(0)
    expect(ctx.firstIndexOf('fillRect')).toBeGreaterThan(ctx.firstIndexOf('clearRect'))
    expect(ctx.firstIndexOf('arc')).toBeGreaterThan(ctx.firstIndexOf('moveTo'))
  })

  it('interpolates between the two snapshots it was given', () => {
    const history = new SnapshotHistory()
    history.push(snapshotWithOneFighter(20))
    history.push(snapshotWithOneFighter(40))
    const ctx = createRecordingContext()
    const layout = computeStageLayout(1600, 900, 'landscape')
    const renderer = new BattleArenaRenderer({ layout })
    renderer.setHistory(history)

    renderer.render(ctx, history.current, defaultConfig(), 0.5)

    const expected = layout.arena.x + 0.3 * layout.arena.width
    const drawnAt = ctx.callsOf('arc')[0]?.args[0] as number
    expect(drawnAt).toBeCloseTo(expected, 3)
  })

  it('draws without interpolation when no history was supplied', () => {
    const view = createSnapshotView()
    const ctx = createRecordingContext()
    const renderer = new BattleArenaRenderer({ layout: computeStageLayout(1600, 900, 'landscape') })

    expect(() => renderer.render(ctx, view, defaultConfig(), 0.5)).not.toThrow()
  })
})

/** Op menggambar sungguhan; penetapan properti seperti `set:globalAlpha` tidak dihitung. */
const drawOps = (ctx: ReturnType<typeof createRecordingContext>): string[] =>
  ctx.ops().filter((op) => !op.startsWith('set:'))

describe('drawFighters and the dead', () => {
  const fadedOut = (): DeathFade => {
    const fade = new DeathFade()
    fade.observe([fighter({ alive: 1 })], 1, 0)
    fade.observe([fighter({ alive: 0 })], 1, 0)
    return fade
  }

  it('stops drawing a fighter once its fade has run out (Req 10 AC2)', () => {
    const ctx = createRecordingContext()

    drawFighters(
      ctx,
      [fighter({ alive: 0 })],
      1,
      roster([{ username: 'budi' }]),
      deps(defaultConfig(), { deathFade: fadedOut(), nowMs: DEATH_FADE_MS }),
    )

    expect(drawOps(ctx)).toEqual([])
  })

  it('still draws a fighter in the middle of its fade, but see-through', () => {
    const ctx = createRecordingContext()

    drawFighters(
      ctx,
      [fighter({ alive: 0 })],
      1,
      roster([{ username: 'budi' }]),
      deps(defaultConfig(), { deathFade: fadedOut(), nowMs: DEATH_FADE_MS / 2 }),
    )

    expect(drawOps(ctx).length).toBeGreaterThan(0)
    expect(ctx.callsOf('set:globalAlpha').map((call) => call.args[0])).toContain(0.5)
  })

  it('never draws a fighter that was already dead when the renderer was built', () => {
    const ctx = createRecordingContext()
    const fade = new DeathFade()
    // Tidak ada observe() dengan alive: 1 — persis keadaan sesudah resize jendela.
    fade.observe([fighter({ alive: 0 })], 1, 0)

    drawFighters(
      ctx,
      [fighter({ alive: 0 })],
      1,
      roster([{ username: 'budi' }]),
      deps(defaultConfig(), { deathFade: fade, nowMs: 1 }),
    )

    expect(drawOps(ctx)).toEqual([])
  })

  it('draws a live fighter at full opacity', () => {
    const ctx = createRecordingContext()

    drawFighters(
      ctx,
      [fighter({ alive: 1 })],
      1,
      roster([{ username: 'budi' }]),
      deps(defaultConfig(), { deathFade: new DeathFade(), nowMs: 0 }),
    )

    expect(drawOps(ctx).length).toBeGreaterThan(0)
  })
})


describe('drawArenaFlash', () => {
  it('tidak menggambar apa pun pada alpha nol', () => {
    const ctx = createRecordingContext()
    drawArenaFlash(ctx, 0, deps())
    expect(ctx.callsOf('fillRect')).toEqual([])
  })

  /*
   * Overlay OBS transparan. Memadamkan seluruh bidang berarti mengecat kotak di atas
   * siaran creator, bukan menyinari arenanya (spec §7.6).
   */
  it('dikurung persis di layout.arena, tidak seluruh panggung', () => {
    const ctx = createRecordingContext()
    const d = deps()
    drawArenaFlash(ctx, 0.4, d)

    expect(ctx.callsOf('fillRect')[0]?.args).toEqual([
      d.layout.arena.x,
      d.layout.arena.y,
      d.layout.arena.width,
      d.layout.arena.height,
    ])
  })
})

/**
 * Blob digambar sebesar HP BERJALAN-nya, lewat `fighterScale` yang sama dengan hitbox.
 *
 * Dua `arc` pertama tiap fighter adalah CINCIN HP (radius + lebar garisnya); yang ketiga
 * barulah badan blob-nya, digambar tepat pada `radius`. Dikunci sebagai relasi terhadap
 * `fighterScale`, bukan sebagai angka piksel: satu rumus di arena.ts menggerakkan gambar
 * DAN kotak tabrak, dan test yang menuliskan ulang angkanya justru mengizinkan keduanya
 * berpisah.
 */
describe('ukuran fighter mengikuti HP', () => {
  const radiusDrawn = (hp: number, maxHp: number): number => {
    const ctx = createRecordingContext()
    const d = deps()
    drawFighters(ctx, [fighter({ hp, maxHp })], 1, roster([{}]), d)
    return Number(ctx.callsOf('arc')[2]?.args[2])
  }

  const base = defaultConfig().gameplay.baseHp

  it('menggambar fighter berukuran dasar tepat sebesar diameter acuan', () => {
    expect(radiusDrawn(base, base)).toBeCloseTo(fighterDiameter(deps().layout) / 2, 6)
  })

  it('membesarkan yang HP-nya di atas baseHp, dengan kurva akar kuadrat', () => {
    const grown = radiusDrawn(base * 2, base * 2)
    expect(grown).toBeCloseTo((fighterDiameter(deps().layout) / 2) * Math.SQRT2, 6)
    expect(fighterScale(base * 2, base)).toBeCloseTo(Math.SQRT2, 6)
  })

  it('mengecilkan yang sekarat, tapi tidak sampai lenyap', () => {
    const dying = radiusDrawn(1, base)
    const full = radiusDrawn(base, base)
    expect(dying).toBeLessThan(full)
    expect(dying).toBeCloseTo(full * FIGHTER_SCALE_MIN, 6)
  })

  it('berhenti di atap meski HP-nya jauh melewatinya', () => {
    const huge = radiusDrawn(base * 100, base * 100)
    expect(huge).toBeCloseTo((fighterDiameter(deps().layout) / 2) * FIGHTER_SCALE_MAX, 6)
  })
})
