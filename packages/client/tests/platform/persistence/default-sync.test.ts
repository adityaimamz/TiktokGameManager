import { describe, expect, it, vi } from 'vitest'
import { LocalStore } from '../../../src/platform/persistence/local-store.js'
import type { StorageLike } from '../../../src/platform/persistence/local-store.js'
import { ServerStore } from '../../../src/platform/persistence/server-store.js'
import {
  createSharedConfigPusher,
  pullSharedDefault,
} from '../../../src/platform/persistence/default-sync.js'

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** Timer sinkron: menulis langsung tanpa menunggu debounce, seperti test `LocalStore` lain. */
const immediate = { setTimer: (fn: () => void) => (fn(), 0), clearTimer: () => {} }

function fakeServer(opts: {
  shared?: unknown
  onSave?: (key: string, value: unknown) => void
} = {}): ServerStore {
  return new ServerStore({
    fetch: async (input, init) => {
      const url = String(input)
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { value: unknown }
        opts.onSave?.(url, body.value)
        return new Response(null, { status: 204 })
      }
      if (opts.shared === undefined) return new Response(null, { status: 404 })
      return new Response(JSON.stringify({ value: opts.shared }), { status: 200 })
    },
  })
}

const KEY = 'battle-arena.config'
const validate = (raw: unknown): { n: number } => raw as { n: number }

describe('pullSharedDefault', () => {
  it('mengadopsi default bersama meski device ini sudah punya config sendiri', async () => {
    const storage = memoryStorage({ [`lga:${KEY}`]: JSON.stringify({ n: 1 }) })
    const store = new LocalStore({ storage, ...immediate })
    const server = fakeServer({ shared: { n: 999 } })
    let received: { n: number } | null = null

    await pullSharedDefault(store, server, KEY, validate, (value) => {
      received = value
    })

    expect(received).toEqual({ n: 999 })
    expect(store.read(KEY, null)).toEqual({ n: 999 })
  })

  it('mewarisi default bersama ke device yang belum pernah dikonfigurasi', async () => {
    const store = new LocalStore({ storage: memoryStorage(), ...immediate })
    const server = fakeServer({ shared: { n: 42 } })
    let received: { n: number } | null = null

    await pullSharedDefault(store, server, KEY, validate, (value) => {
      received = value
    })

    expect(received).toEqual({ n: 42 })
  })

  it('membenihi server dari config device ini saat belum ada default bersama sama sekali', async () => {
    const storage = memoryStorage({ [`lga:${KEY}`]: JSON.stringify({ n: 7 }) })
    const store = new LocalStore({ storage, ...immediate })
    const saved: [string, unknown][] = []
    const server = fakeServer({ onSave: (url, value) => saved.push([url, value]) })

    await pullSharedDefault(store, server, KEY, validate, () => {})

    expect(saved).toEqual([[`/api/config/${KEY}`, { n: 7 }]])
  })

  it('tidak melakukan apa pun saat device baru dan belum ada default bersama', async () => {
    const store = new LocalStore({ storage: memoryStorage(), ...immediate })
    const saved: unknown[] = []
    const server = fakeServer({ onSave: (_url, value) => saved.push(value) })
    let called = false

    await pullSharedDefault(store, server, KEY, validate, () => {
      called = true
    })

    expect(called).toBe(false)
    expect(saved).toEqual([])
  })
})

describe('createSharedConfigPusher', () => {
  it('mendebounce beberapa push berturut-turut jadi satu request dengan nilai terakhir', async () => {
    vi.useFakeTimers()
    try {
      const saved: unknown[] = []
      const server = fakeServer({ onSave: (_url, value) => saved.push(value) })
      const pusher = createSharedConfigPusher(server, KEY, 500)

      pusher.push({ n: 1 })
      pusher.push({ n: 2 })
      pusher.push({ n: 3 })
      expect(saved).toEqual([])

      await vi.advanceTimersByTimeAsync(500)
      expect(saved).toEqual([{ n: 3 }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('flush() mengirim segera tanpa menunggu debounce', async () => {
    const saved: unknown[] = []
    const server = fakeServer({ onSave: (_url, value) => saved.push(value) })
    const pusher = createSharedConfigPusher(server, KEY, 500)

    pusher.push({ n: 5 })
    await pusher.flush()

    expect(saved).toEqual([{ n: 5 }])
  })

  it('flush() tanpa push yang tertunda tidak mengirim apa pun', async () => {
    const saved: unknown[] = []
    const server = fakeServer({ onSave: (_url, value) => saved.push(value) })
    const pusher = createSharedConfigPusher(server, KEY, 500)

    await pusher.flush()

    expect(saved).toEqual([])
  })
})
