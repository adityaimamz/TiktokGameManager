// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useStageFrame } from '../../src/ui/useStageFrame.js'

afterEach(cleanup)

/** Penjadwal frame manual: test yang menentukan kapan frame terjadi. */
const manualFrames = () => {
  const queue: ((timestampMs: number) => void)[] = []
  return {
    schedule: (cb: (timestampMs: number) => void) => {
      queue.push(cb)
      return queue.length
    },
    cancel: () => {},
    run: (timestampMs: number) => {
      const next = queue.shift()
      next?.(timestampMs)
    },
    get pending() {
      return queue.length
    },
  }
}

function Probe({
  frames,
  onFrame,
  hudIntervalMs,
}: {
  frames: ReturnType<typeof manualFrames>
  onFrame: (nowMs: number) => void
  hudIntervalMs?: number
}): ReactElement {
  const hudTick = useStageFrame({
    onFrame,
    hudIntervalMs,
    scheduleFrame: frames.schedule,
    cancelFrame: frames.cancel,
  })
  return <span data-testid="hud-tick">{hudTick}</span>
}

describe('useStageFrame', () => {
  it('calls onFrame on every animation frame', () => {
    const frames = manualFrames()
    const onFrame = vi.fn()
    render(<Probe frames={frames} onFrame={onFrame} />)

    frames.run(0)
    frames.run(16)
    frames.run(32)

    expect(onFrame).toHaveBeenCalledTimes(3)
    expect(onFrame).toHaveBeenLastCalledWith(32)
  })

  it('re-renders the HUD far less often than it draws', () => {
    const frames = manualFrames()
    render(<Probe frames={frames} onFrame={() => {}} hudIntervalMs={50} />)

    // act() wajib: setHudTick di dalam callback frame tidak di-flush React 18 sampai
    // update-nya keluar dari batch, jadi tanpa ini pembacaan textContent selalu basi.
    act(() => {
      frames.run(0)
      frames.run(16)
      frames.run(32)
    })
    const early = screen.getByTestId('hud-tick').textContent

    act(() => frames.run(60))
    expect(screen.getByTestId('hud-tick').textContent).not.toBe(early)
  })

  it('stops scheduling once unmounted', () => {
    const frames = manualFrames()
    const onFrame = vi.fn()
    const view = render(<Probe frames={frames} onFrame={onFrame} />)

    view.unmount()
    frames.run(0)

    expect(onFrame).not.toHaveBeenCalled()
  })
})
