// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderLoop, defaultCancel, defaultSchedule } from '../../../src/framework/loop/render-loop.js'

/**
 * Worker palsu: `postMessage` dari sisi worker dipicu manual lewat `tick()`.
 *
 * Yang diuji di sini bukan worker-nya melainkan penjadwalnya — bahwa halaman yang
 * tersembunyi berhenti memakai rAF dan tetap mendapat frame dari sumber lain.
 */
class FakeWorker {
  static made: FakeWorker[] = []
  onmessage: ((event: { data: number }) => void) | null = null

  constructor(readonly url: string) {
    FakeWorker.made.push(this)
  }

  terminate(): void {}

  tick(): void {
    this.onmessage?.({ data: 0 })
  }
}

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

let raf: ReturnType<typeof vi.fn>

beforeEach(() => {
  raf = vi.fn(() => 7)
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('Worker', FakeWorker)
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:fake',
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  setVisibility('visible')
})

describe('default frame scheduler', () => {
  it('uses requestAnimationFrame while the page is visible', () => {
    setVisibility('visible')
    const handle = defaultSchedule(() => {})
    expect(raf).toHaveBeenCalledTimes(1)
    expect(handle).toBe(7)
  })

  /**
   * Ini regresi yang membekukan overlay OBS: rAF berhenti total di halaman tersembunyi —
   * termasuk saat window browser cuma tertutup penuh oleh OBS — dan tab dashboard adalah
   * satu-satunya yang menjalankan tick.
   */
  it('keeps delivering frames while the page is hidden, without requestAnimationFrame', () => {
    setVisibility('hidden')
    const frames: number[] = []
    const loop = new RenderLoop({ onFrame: (t) => frames.push(t) })
    loop.start()

    expect(raf).not.toHaveBeenCalled()
    const worker = FakeWorker.made.at(-1)
    expect(worker).toBeDefined()

    worker?.tick()
    worker?.tick()
    expect(frames).toHaveLength(2)
    expect(frames[1]).toBeGreaterThanOrEqual(frames[0] as number)

    loop.stop()
    worker?.tick()
    expect(frames).toHaveLength(2)
  })

  it('cancels a pending hidden frame without touching cancelAnimationFrame', () => {
    setVisibility('hidden')
    const seen: number[] = []
    const handle = defaultSchedule((t) => seen.push(t))
    expect(handle).toBeLessThan(0)

    defaultCancel(handle)
    FakeWorker.made.at(-1)?.tick()
    expect(seen).toHaveLength(0)
    expect(cancelAnimationFrame).not.toHaveBeenCalled()
  })
})
