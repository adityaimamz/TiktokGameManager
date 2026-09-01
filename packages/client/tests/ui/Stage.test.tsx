// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SIDE_A, SNAPSHOT_HEADER_LENGTH, SnapshotHistory, snapshotLength } from '@lga/shared'
import { defaultConfig } from '../../src/games/battle-arena/config/index.js'
import { BattleArenaRenderer } from '../../src/games/battle-arena/renderer/canvas.js'
import { UltimateFxPost } from '../../src/games/battle-arena/renderer/fx/index.js'
import { computeStageLayout } from '../../src/games/battle-arena/renderer/layout.js'
import { Stage } from '../../src/ui/Stage.js'

afterEach(cleanup)
afterEach(() => vi.restoreAllMocks())
// `Object.defineProperty` tidak dicabut `restoreAllMocks`; tanpa baris ini, test pertama yang
// memalsukan dpr mewariskannya ke seluruh berkas.
afterEach(() => Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true }))

const snapshot = (tick: number): Float32Array => {
  const buf = new Float32Array(snapshotLength(1, 0, 0))
  buf.set([tick, tick * 50, 3, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0], 0)
  buf.set([0, 25, 50, 80, 100, SIDE_A, 1, 0, -1, 2], SNAPSHOT_HEADER_LENGTH)
  return buf
}

const stage = (over: Partial<Parameters<typeof Stage>[0]> = {}) => {
  const history = new SnapshotHistory()
  history.push(snapshot(1))
  const props = {
    renderer: new BattleArenaRenderer({ layout: computeStageLayout(1600, 900, 'landscape') }),
    history,
    config: defaultConfig(),
    roster: new Map(),
    kills: [],
    joins: [],
    gifts: [],
    size: { width: 1600, height: 900 },
    getAlpha: () => 0,
    getNowMs: () => 0,
    scheduleFrame: () => 1,
    cancelFrame: () => {},
    ...over,
  }
  return render(<Stage {...props} />)
}

describe('Stage', () => {
  it('puts a canvas, the HUD and the legend on one surface', () => {
    stage()

    expect(screen.getByTestId('stage-canvas')).toBeTruthy()
    expect(screen.getByTestId('score-bar')).toBeTruthy()
    expect(screen.getByTestId('action-legend')).toBeTruthy()
  })

  it('survives a browser that hands back no 2d context', () => {
    // jsdom persis begitu: getContext('2d') mengembalikan null.
    expect(() => stage()).not.toThrow()
  })

  it('sizes the canvas to the stage box, not to the container', () => {
    stage({ size: { width: 2000, height: 900 } })

    const canvas = screen.getByTestId('stage-canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(2000)
    expect(canvas.height).toBe(900)
  })

  it('menghormati maxDpr — preview ruang kendali tidak menggambar pada dpr layar', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })

    stage({ size: { width: 400, height: 700 }, maxDpr: 1 })

    const canvas = screen.getByTestId('stage-canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(700)
  })

  // Gerbang, bukan cakupan: ia gagal kalau kelak ada yang menjadikan maxDpr bawaan 1 dan
  // diam-diam menurunkan ketajaman overlay — satu-satunya permukaan yang dilihat penonton.
  it('tetap menjepit di 2 saat maxDpr tidak diisi — overlay tidak berubah', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true })

    stage({ size: { width: 400, height: 700 } })

    const canvas = screen.getByTestId('stage-canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(800)
  })

  it('keeps the legend inert unless it was asked to be interactive', () => {
    stage()
    expect(screen.queryAllByRole('button')).toHaveLength(0)

    cleanup()
    stage({ interactive: true, onFire: vi.fn() })
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('leaves the WebGL canvas out entirely when flatFx is set', () => {
    // Dipalsukan true: jsdom mengembalikan false, jadi tanpa ini test lulus tanpa membuktikan apa pun.
    vi.spyOn(UltimateFxPost, 'isSupported').mockReturnValue(true)

    stage({ flatFx: true })

    expect(screen.queryByTestId('stage-canvas-gl')).toBeNull()
    // Saat jalur FX hidup, kanvas 2D disembunyikan dan hanya jadi sumber texture.
    expect((screen.getByTestId('stage-canvas') as HTMLCanvasElement).style.display).toBe('block')
  })

  it('still puts up the WebGL canvas when flatFx is absent', () => {
    vi.spyOn(UltimateFxPost, 'isSupported').mockReturnValue(true)

    stage()

    expect(screen.getByTestId('stage-canvas-gl')).toBeTruthy()
  })
})

describe('reduced motion', () => {
  const spiedRenderer = () => {
    const renderer = new BattleArenaRenderer({
      layout: computeStageLayout(1600, 900, 'landscape'),
    })
    return { renderer, spy: vi.spyOn(renderer, 'setReducedMotion') }
  }

  it('meneruskan preferensi ke renderer', () => {
    const { renderer, spy } = spiedRenderer()
    stage({ renderer, reducedMotion: true })
    expect(spy).toHaveBeenCalledWith(true)
  })

  it('bawaannya mati saat prop tidak diberikan', () => {
    const { renderer, spy } = spiedRenderer()
    stage({ renderer })
    expect(spy).toHaveBeenCalledWith(false)
  })

  it('menggambar panel filler di band bawah saat creator menyalakannya', () => {
    const config = defaultConfig()
    config.filler = { enabled: true, items: [{ url: '/a.mp4', kind: 'video' }], imageDurationSec: 15 }

    stage({ config })

    expect(screen.getByTestId('filler-panel')).toBeTruthy()
  })

  it('tidak menggambar panel filler saat creator belum menyalakannya', () => {
    stage()

    expect(screen.queryByTestId('filler-panel')).toBeNull()
  })
})
