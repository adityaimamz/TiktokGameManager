import { describe, expect, it } from 'vitest'
import { SERVICE_RESTART, shutdown } from './shutdown.js'
import type { ShutdownDeps } from './shutdown.js'

/** Kerangka dep yang setiap test tinggal menimpa bagian yang ia pedulikan. */
function deps(over: Partial<ShutdownDeps> = {}): ShutdownDeps {
  return {
    stopHeartbeat: () => {},
    closeSockets: () => {},
    closeServer: (done) => done(),
    exit: () => {},
    setTimer: () => 'timer',
    clearTimer: () => {},
    ...over,
  }
}

describe('shutdown', () => {
  it('menghentikan heartbeat dan menutup soket sebelum menutup server', () => {
    const order: string[] = []

    shutdown(
      deps({
        stopHeartbeat: () => order.push('heartbeat'),
        closeSockets: () => order.push('sockets'),
        closeServer: (done) => {
          order.push('server')
          done()
        },
        exit: () => order.push('exit'),
      }),
    )

    expect(order).toEqual(['heartbeat', 'sockets', 'server', 'exit'])
  })

  it('keluar dengan kode yang diminta saat server menutup tepat waktu', () => {
    const codes: number[] = []

    shutdown(deps({ code: 1, exit: (code) => codes.push(code) }))

    expect(codes).toEqual([1])
  })

  it('keluar dengan kode 1 saat server tidak pernah selesai menutup', () => {
    const codes: number[] = []
    let fire: (() => void) | null = null

    shutdown(
      deps({
        closeServer: () => {},
        setTimer: (fn) => {
          fire = fn
          return 'timer'
        },
        exit: (code) => codes.push(code),
      }),
    )
    expect(codes).toEqual([])
    ;(fire as (() => void) | null)?.()

    expect(codes).toEqual([1])
  })

  it('keluar tepat sekali walau batas waktu dan penutupan bertabrakan', () => {
    const codes: number[] = []
    let fire: (() => void) | null = null
    let finish: (() => void) | null = null

    shutdown(
      deps({
        closeServer: (done) => {
          finish = done
        },
        setTimer: (fn) => {
          fire = fn
          return 'timer'
        },
        exit: (code) => codes.push(code),
      }),
    )
    ;(finish as (() => void) | null)?.()
    ;(fire as (() => void) | null)?.()

    expect(codes).toEqual([0])
  })

  it('membatalkan batas waktunya saat penutupan berhasil', () => {
    let cleared: unknown = null

    shutdown(
      deps({
        clearTimer: (handle) => {
          cleared = handle
        },
      }),
    )

    expect(cleared).toBe('timer')
  })

  it('memakai 1012 — service restart — sebagai kode penutupan soket', () => {
    expect(SERVICE_RESTART).toBe(1012)
  })
})
