import { useEffect, useRef, useState } from 'react'
import { RenderLoop } from '../framework/loop/render-loop.js'
import type { FrameCanceller, FrameScheduler } from '../framework/loop/render-loop.js'

export interface UseStageFrameOptions {
  /** Menggambar satu frame. TIDAK boleh menjalankan logika game. */
  onFrame: (timestampMs: number) => void
  /** Jarak minimum antar-render ulang HUD. Default 50 ms, sama dengan satu tick. */
  hudIntervalMs?: number
  scheduleFrame?: FrameScheduler
  cancelFrame?: FrameCanceller
}

/**
 * Menjalankan render loop dan mengembalikan penanda yang berubah pelan.
 *
 * Canvas digambar tiap frame; pohon React hanya dirender ulang saat penanda berubah.
 * Merender ulang HUD 60 kali per detik dengan 200 fighter adalah cara tercepat
 * kehilangan target Req 20.
 */
export function useStageFrame(opts: UseStageFrameOptions): number {
  const [hudTick, setHudTick] = useState(0)
  const onFrame = useRef(opts.onFrame)
  onFrame.current = opts.onFrame

  const interval = opts.hudIntervalMs ?? 50
  const { scheduleFrame, cancelFrame } = opts

  useEffect(() => {
    let lastHudAtMs = Number.NEGATIVE_INFINITY
    const loop = new RenderLoop({
      onFrame: (timestampMs) => {
        onFrame.current(timestampMs)
        if (timestampMs - lastHudAtMs < interval) return
        lastHudAtMs = timestampMs
        setHudTick((tick) => tick + 1)
      },
      scheduleFrame,
      cancelFrame,
    })
    loop.start()
    return () => loop.stop()
  }, [interval, scheduleFrame, cancelFrame])

  return hudTick
}
