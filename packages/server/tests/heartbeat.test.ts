import { describe, expect, it } from 'vitest'
import { startHeartbeat } from '../src/heartbeat.js'
import type { PingableSocket } from '../src/heartbeat.js'

/** Soket palsu yang bisa dipilih untuk menjawab pong atau diam. */
function fakeSocket(answers: boolean): PingableSocket & { pings: number; killed: boolean } {
  const listeners: Array<() => void> = []
  return {
    pings: 0,
    killed: false,
    ping() {
      this.pings += 1
      if (answers) for (const fn of listeners) fn()
    },
    terminate() {
      this.killed = true
    },
    on(_event: 'pong', listener: () => void) {
      listeners.push(listener)
    },
  }
}

/** Interval manual: test memajukan siklus sendiri, tanpa menunggu tiga puluh detik. */
function manualTimer(): { run: () => void; schedule: (fn: () => void) => unknown } {
  let tick: (() => void) | null = null
  return {
    run: () => tick?.(),
    schedule: (fn: () => void) => {
      tick = fn
      return 'handle'
    },
  }
}

describe('startHeartbeat', () => {
  it('memberi soket baru satu siklus tenggang sebelum menuntut pong', () => {
    const socket = fakeSocket(false)
    const timer = manualTimer()

    startHeartbeat({ sockets: () => [socket], schedule: timer.schedule, cancel: () => {} })
    timer.run()

    expect(socket.pings).toBe(1)
    expect(socket.killed).toBe(false)
  })

  it('membuang soket yang melewatkan pong pada siklus berikutnya', () => {
    const socket = fakeSocket(false)
    const timer = manualTimer()

    startHeartbeat({ sockets: () => [socket], schedule: timer.schedule, cancel: () => {} })
    timer.run()
    timer.run()

    expect(socket.killed).toBe(true)
  })

  it('membiarkan soket yang menjawab pong hidup selamanya', () => {
    const socket = fakeSocket(true)
    const timer = manualTimer()

    startHeartbeat({ sockets: () => [socket], schedule: timer.schedule, cancel: () => {} })
    timer.run()
    timer.run()
    timer.run()

    expect(socket.killed).toBe(false)
    expect(socket.pings).toBe(3)
  })

  it('berhenti mem-ping soket yang sudah dibuang dari kumpulan', () => {
    const socket = fakeSocket(true)
    let live: PingableSocket[] = [socket]
    const timer = manualTimer()

    startHeartbeat({ sockets: () => live, schedule: timer.schedule, cancel: () => {} })
    timer.run()
    live = []
    timer.run()

    expect(socket.pings).toBe(1)
  })

  it('membatalkan intervalnya saat penghenti dipanggil', () => {
    const timer = manualTimer()
    let cancelledWith: unknown = null

    const stop = startHeartbeat({
      sockets: () => [],
      schedule: timer.schedule,
      cancel: (handle) => {
        cancelledWith = handle
      },
    })
    stop()

    expect(cancelledWith).toBe('handle')
  })
})
