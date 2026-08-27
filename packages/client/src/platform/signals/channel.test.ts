import { describe, expect, it, vi } from 'vitest'
import { MAX_POLL_INTERVAL_MS, createSignalChannel, storageKeyFor } from './channel.js'
import type { BroadcastLike, SignalMessage, StorageLike } from './channel.js'

/** Bus BroadcastChannel palsu: pesan sampai ke semua channel LAIN bernama sama. */
const createBus = () => {
  const channels: { name: string; channel: BroadcastLike }[] = []
  const factory = (name: string): BroadcastLike => {
    const channel: BroadcastLike = {
      onmessage: null,
      postMessage(data) {
        for (const other of channels) {
          if (other.name === name && other.channel !== channel) other.channel.onmessage?.({ data })
        }
      },
      close() {
        const index = channels.findIndex((entry) => entry.channel === channel)
        if (index >= 0) channels.splice(index, 1)
      },
    }
    channels.push({ name, channel })
    return channel
  }
  return {
    factory,
    get size() {
      return channels.length
    },
  }
}

const createStorage = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

/** Penjadwal poll manual: test yang menentukan kapan detaknya. */
const createPoller = () => {
  const jobs: (() => void)[] = []
  const intervals: number[] = []
  return {
    intervals,
    schedule: (fn: () => void, ms: number) => {
      jobs.push(fn)
      intervals.push(ms)
      return jobs.length
    },
    cancel: () => {},
    tick: () => jobs.forEach((job) => job()),
  }
}

describe('createSignalChannel in broadcast mode', () => {
  it('delivers a posted message to another channel of the same name', () => {
    const bus = createBus()
    const received: SignalMessage[] = []
    const a = createSignalChannel({ name: 'lga', broadcast: bus.factory })
    const b = createSignalChannel({ name: 'lga', broadcast: bus.factory })
    b.subscribe((message) => received.push(message))

    a.post('roster', { entries: [] })

    expect(a.mode).toBe('broadcast')
    expect(received).toEqual([{ topic: 'roster', payload: { entries: [] } }])
  })

  it('does not echo a message back to its sender', () => {
    const bus = createBus()
    const received: SignalMessage[] = []
    const a = createSignalChannel({ name: 'lga', broadcast: bus.factory })
    a.subscribe((message) => received.push(message))

    a.post('config', { schemaVersion: 1 })

    expect(received).toEqual([])
  })

  it('stops delivering after unsubscribe, and closes the underlying channel', () => {
    const bus = createBus()
    const received: SignalMessage[] = []
    const a = createSignalChannel({ name: 'lga', broadcast: bus.factory })
    const b = createSignalChannel({ name: 'lga', broadcast: bus.factory })
    const off = b.subscribe((message) => received.push(message))

    off()
    a.post('roster', 1)
    expect(received).toEqual([])

    b.close()
    expect(bus.size).toBe(1)
  })

  it('isolates a throwing subscriber from the rest', () => {
    const bus = createBus()
    const seen: string[] = []
    const onError = vi.fn()
    const a = createSignalChannel({ name: 'lga', broadcast: bus.factory })
    const b = createSignalChannel({ name: 'lga', broadcast: bus.factory, onError })
    b.subscribe(() => {
      throw new Error('boom')
    })
    b.subscribe((message) => seen.push(message.topic))

    a.post('roster', 1)

    expect(seen).toEqual(['roster'])
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('createSignalChannel in storage mode', () => {
  const options = (storage: StorageLike, poller: ReturnType<typeof createPoller>) => ({
    name: 'lga',
    broadcast: () => null,
    storage,
    topics: ['snapshot'],
    schedulePoll: poller.schedule,
    cancelPoll: poller.cancel,
    now: () => 0,
  })

  it('falls back to polling when BroadcastChannel is unavailable', () => {
    const storage = createStorage()
    const poller = createPoller()
    const channel = createSignalChannel(options(storage, poller))

    expect(channel.mode).toBe('storage')
    expect(poller.intervals[0]).toBeLessThanOrEqual(MAX_POLL_INTERVAL_MS)
  })

  it('clamps a too-slow poll interval down to one second', () => {
    const storage = createStorage()
    const poller = createPoller()
    createSignalChannel({ ...options(storage, poller), pollIntervalMs: 5000 })

    expect(poller.intervals[0]).toBe(MAX_POLL_INTERVAL_MS)
  })

  it('carries a message to another channel on the next poll', () => {
    const storage = createStorage()
    const writerPoller = createPoller()
    const readerPoller = createPoller()
    const received: SignalMessage[] = []
    const writer = createSignalChannel(options(storage, writerPoller))
    const reader = createSignalChannel(options(storage, readerPoller))
    reader.subscribe((message) => received.push(message))

    writer.post('snapshot', [1, 2, 3])
    expect(received).toEqual([])

    readerPoller.tick()
    expect(received).toEqual([{ topic: 'snapshot', payload: [1, 2, 3] }])

    readerPoller.tick()
    expect(received).toHaveLength(1)
  })

  it('never replays a channel own message back to itself', () => {
    const storage = createStorage()
    const poller = createPoller()
    const received: SignalMessage[] = []
    const channel = createSignalChannel(options(storage, poller))
    channel.subscribe((message) => received.push(message))

    channel.post('snapshot', [1])
    poller.tick()

    expect(received).toEqual([])
  })

  it('uses the topic codec on the way out and on the way in', () => {
    const storage = createStorage()
    const writerPoller = createPoller()
    const readerPoller = createPoller()
    const codecs = {
      snapshot: {
        toJson: (payload: unknown) => Array.from(payload as Float32Array),
        fromJson: (raw: unknown) => Float32Array.from(raw as number[]),
      },
    }
    const received: SignalMessage[] = []
    const writer = createSignalChannel({ ...options(storage, writerPoller), codecs })
    const reader = createSignalChannel({ ...options(storage, readerPoller), codecs })
    reader.subscribe((message) => received.push(message))

    writer.post('snapshot', Float32Array.from([1.5, 2.5]))
    readerPoller.tick()

    expect(storage.getItem(storageKeyFor('lga', 'snapshot'))).toContain('[1.5,2.5]')
    expect(received[0]?.payload).toBeInstanceOf(Float32Array)
    expect(Array.from(received[0]?.payload as Float32Array)).toEqual([1.5, 2.5])
  })

  it('survives corrupt storage without throwing', () => {
    const storage = createStorage()
    const poller = createPoller()
    const received: SignalMessage[] = []
    const channel = createSignalChannel(options(storage, poller))
    channel.subscribe((message) => received.push(message))

    storage.map.set(storageKeyFor('lga', 'snapshot'), '{not json')
    expect(() => poller.tick()).not.toThrow()
    expect(received).toEqual([])
  })
})

describe('createSignalChannel with nothing available', () => {
  it('degrades to a silent channel instead of failing', () => {
    const channel = createSignalChannel({ name: 'lga', broadcast: () => null, storage: null })

    expect(channel.mode).toBe('none')
    expect(() => channel.post('roster', 1)).not.toThrow()
    channel.close()
  })
})
