import { describe, expect, it } from 'vitest'
import { fanoutChannel } from '../../../src/platform/signals/fanout.js'
import type { SignalChannel, SignalListener, SignalMessage } from '../../../src/platform/signals/channel.js'

function fakeChannel(mode: SignalChannel['mode'] = 'broadcast') {
  const posted: SignalMessage[] = []
  const listeners = new Set<SignalListener>()
  let closed = false
  const channel: SignalChannel = {
    mode,
    post: (topic, payload) => {
      posted.push({ topic, payload })
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => {
      closed = true
    },
  }
  return {
    channel,
    posted,
    listeners,
    isClosed: () => closed,
    emit: (message: SignalMessage) => listeners.forEach((listener) => listener(message)),
  }
}

describe('fanoutChannel', () => {
  it('meneruskan setiap post ke semua anggota', () => {
    const first = fakeChannel()
    const second = fakeChannel('ws')
    const fanout = fanoutChannel([first.channel, second.channel])

    fanout.post('roster', { entries: [] })

    expect(first.posted).toEqual([{ topic: 'roster', payload: { entries: [] } }])
    expect(second.posted).toEqual([{ topic: 'roster', payload: { entries: [] } }])
  })

  it('menggabungkan langganan dari semua anggota', () => {
    const first = fakeChannel()
    const second = fakeChannel('ws')
    const fanout = fanoutChannel([first.channel, second.channel])
    const seen: SignalMessage[] = []
    fanout.subscribe((message) => seen.push(message))

    first.emit({ topic: 'config', payload: 1 })
    second.emit({ topic: 'feed', payload: 2 })

    expect(seen).toEqual([
      { topic: 'config', payload: 1 },
      { topic: 'feed', payload: 2 },
    ])
  })

  it('melepas langganan di semua anggota sekaligus', () => {
    const first = fakeChannel()
    const second = fakeChannel('ws')
    const fanout = fanoutChannel([first.channel, second.channel])

    const off = fanout.subscribe(() => {})
    off()

    expect(first.listeners.size).toBe(0)
    expect(second.listeners.size).toBe(0)
  })

  it('menutup semua anggota', () => {
    const first = fakeChannel()
    const second = fakeChannel('ws')

    fanoutChannel([first.channel, second.channel]).close()

    expect(first.isClosed()).toBe(true)
    expect(second.isClosed()).toBe(true)
  })

  it('melaporkan mode anggota pertama, dan none saat tidak ada anggota', () => {
    expect(fanoutChannel([fakeChannel('storage').channel]).mode).toBe('storage')
    expect(fanoutChannel([]).mode).toBe('none')
  })
})
