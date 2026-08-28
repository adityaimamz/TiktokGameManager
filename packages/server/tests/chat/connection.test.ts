import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@lga/shared'
import type { TikTokClient } from '../../src/chat/client.js'
import { TikTokConnection } from '../../src/chat/connection.js'

/** Emitter palsu yang hanya melakukan sesuatu saat test menyuruhnya. */
function createFakeClient(fetchGifts: () => Promise<unknown> = async () => []) {
  const handlers = new Map<string, (payload: unknown) => void>()
  let resolveConnect: ((value: { roomId: string }) => void) | null = null
  let rejectConnect: ((reason: unknown) => void) | null = null
  let disconnectCount = 0

  const client: TikTokClient = {
    connect: () =>
      new Promise<{ roomId: string }>((resolve, reject) => {
        resolveConnect = resolve
        rejectConnect = reject
      }),
    disconnect: () => {
      disconnectCount++
    },
    on: (event, handler) => {
      handlers.set(event, handler)
    },
    fetchGifts,
  }

  return {
    client,
    succeed: (roomId = 'room-1') => resolveConnect?.({ roomId }),
    fail: (message: string) => rejectConnect?.(new Error(message)),
    emit: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    get disconnectCount() {
      return disconnectCount
    },
  }
}

/** Timer palsu: test yang memutuskan kapan waktu maju, bukan jam dinding. */
function createFakeTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>()
  let nextHandle = 1
  return {
    setTimer: (fn: () => void, ms: number) => {
      const handle = nextHandle++
      pending.set(handle, { fn, ms })
      return handle
    },
    clearTimer: (handle: unknown) => {
      pending.delete(handle as number)
    },
    get pendingDelays(): number[] {
      return [...pending.values()].map((entry) => entry.ms)
    },
    /** Menjalankan semua timer tertunda, seolah waktunya sudah tiba. */
    fire: () => {
      const entries = [...pending.values()]
      pending.clear()
      for (const entry of entries) entry.fn()
    },
  }
}

function createRig(fetchGifts?: () => Promise<unknown>) {
  const timers = createFakeTimers()
  const clients: ReturnType<typeof createFakeClient>[] = []
  const statuses: string[] = []
  const messages: ChatMessage[] = []
  let nowMs = 1_000

  const connection = new TikTokConnection({
    createClient: () => {
      const fake = createFakeClient(fetchGifts)
      clients.push(fake)
      return fake.client
    },
    now: () => nowMs++,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onStatus: (status) => statuses.push(status.state),
    onMessage: (message) => messages.push(message),
  })

  return {
    connection,
    timers,
    statuses,
    messages,
    latest: () => {
      const client = clients[clients.length - 1]
      if (client === undefined) throw new Error('no client was created')
      return client
    },
    clientCount: () => clients.length,
  }
}

/** Melepas antrean microtask supaya `.then` di dalam `attempt()` sempat berjalan. */
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('TikTokConnection', () => {
  it('starts idle', () => {
    const rig = createRig()
    expect(rig.connection.status).toEqual({
      state: 'idle',
      username: null,
      roomId: null,
      viewerCount: 0,
      error: null,
      attempt: 0,
      connectedAtMs: null,
    })
  })

  it('reaches connected and reports the room id', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    expect(rig.connection.status.state).toBe('connecting')
    rig.latest().succeed('room-42')
    await connecting

    expect(rig.connection.status.state).toBe('connected')
    expect(rig.connection.status.username).toBe('budi')
    expect(rig.connection.status.roomId).toBe('room-42')
    expect(rig.statuses).toEqual(['connecting', 'connected'])
  })

  it('reports the failure reason and does not retry a rejected first attempt', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().fail('user is not live')
    await connecting

    expect(rig.connection.status.state).toBe('failed')
    expect(rig.connection.status.error).toBe('user is not live')
    expect(rig.timers.pendingDelays).toEqual([])
  })

  it('forwards chat events once connected', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting

    rig.latest().emit('chat', { user: { displayId: 'siti' }, content: 'team a' })

    expect(rig.messages).toHaveLength(1)
    expect(rig.messages[0]?.username).toBe('siti')
    expect(rig.messages[0]?.platform).toBe('tiktok')
    expect(rig.messages[0]?.text).toBe('team a')
  })

  it('gives every forwarded message a distinct id', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting

    rig.latest().emit('chat', { user: { displayId: 'siti' }, content: 'a' })
    rig.latest().emit('chat', { user: { displayId: 'siti' }, content: 'b' })

    expect(rig.messages[0]?.id).not.toBe(rig.messages[1]?.id)
  })

  it('drops events that arrive before the connection is established (Req 2 AC8)', () => {
    const rig = createRig()
    void rig.connection.connect('budi')
    rig.latest().emit('chat', { user: { displayId: 'siti' }, content: 'too early' })
    expect(rig.messages).toEqual([])
  })

  it('updates viewer count from roomUser without emitting a message', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting
    rig.statuses.length = 0

    rig.latest().emit('roomUser', { total: '128' })

    expect(rig.connection.status.viewerCount).toBe(128)
    expect(rig.messages).toEqual([])
    expect(rig.statuses).toEqual(['connected'])
  })

  it('schedules a backoff retry after a drop and recovers', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting

    rig.latest().emit('disconnected', undefined)

    expect(rig.connection.status.state).toBe('reconnecting')
    expect(rig.connection.status.attempt).toBe(1)
    expect(rig.timers.pendingDelays).toEqual([5_000])

    rig.timers.fire()
    expect(rig.clientCount()).toBe(2)
    rig.latest().succeed('room-7')
    await settle()

    expect(rig.connection.status.state).toBe('connected')
    expect(rig.connection.status.attempt).toBe(0)
    expect(rig.connection.status.roomId).toBe('room-7')
  })

  /*
   * Jam siaran, dan aturannya: diisi sekali, tidak pernah di-reset oleh sambung ulang.
   *
   * Angkanya tidak di-assert karena `createRig` memasang `now: () => nowMs++` — yang dijaga
   * adalah aturannya, bukan nilainya.
   */
  it('menandai kapan koneksi pertama berhasil', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting

    expect(typeof rig.connection.status.connectedAtMs).toBe('number')
  })

  it('belum menandai apa pun sebelum koneksi pertama berhasil', () => {
    const rig = createRig()
    void rig.connection.connect('budi')

    expect(rig.connection.status.connectedAtMs).toBeNull()
  })

  it('tidak me-reset jam saat sambung ulang berhasil', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting
    const first = rig.connection.status.connectedAtMs

    rig.latest().emit('disconnected', undefined)
    rig.timers.fire()
    rig.latest().succeed('room-7')
    await settle()

    expect(rig.connection.status.state).toBe('connected')
    expect(rig.connection.status.connectedAtMs).toBe(first)
  })

  it('melupakan jamnya setelah disconnect', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting

    rig.connection.disconnect()

    expect(rig.connection.status.connectedAtMs).toBeNull()
  })

  it('doubles the delay when a reconnect attempt also fails', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting

    rig.latest().emit('disconnected', undefined)
    rig.timers.fire()
    rig.latest().fail('still down')
    await settle()

    expect(rig.connection.status.state).toBe('reconnecting')
    expect(rig.connection.status.attempt).toBe(2)
    expect(rig.timers.pendingDelays).toEqual([10_000])
  })

  it('stops reconnecting when disconnect is called', async () => {
    const rig = createRig()
    const connecting = rig.connection.connect('budi')
    rig.latest().succeed()
    await connecting
    rig.latest().emit('disconnected', undefined)

    rig.connection.disconnect()

    expect(rig.connection.status.state).toBe('idle')
    expect(rig.timers.pendingDelays).toEqual([])
    rig.timers.fire()
    expect(rig.clientCount()).toBe(1)
  })

  it('drops the previous client when connecting to a different username', async () => {
    const rig = createRig()
    const first = rig.connection.connect('budi')
    rig.latest().succeed()
    await first
    const firstClient = rig.latest()

    const second = rig.connection.connect('siti')
    rig.latest().succeed()
    await second

    expect(firstClient.disconnectCount).toBe(1)
    expect(rig.connection.status.username).toBe('siti')
    expect(rig.clientCount()).toBe(2)
  })

  it('ignores a late success from a client that was already replaced', async () => {
    const rig = createRig()
    const abandoned = rig.connection.connect('budi')
    const abandonedClient = rig.latest()

    const second = rig.connection.connect('siti')
    rig.latest().succeed('room-siti')
    await second

    abandonedClient.succeed('room-budi')
    await abandoned

    expect(rig.connection.status.username).toBe('siti')
    expect(rig.connection.status.roomId).toBe('room-siti')
  })
})

describe('katalog gift', () => {
  it('mengambil katalog gift setelah tersambung', async () => {
    const rig = createRig(async () => ({ gifts: [{ name: 'Rose', diamond_count: 1 }] }))

    const connecting = rig.connection.connect('creator')
    rig.latest().succeed()
    await connecting
    await settle()

    expect(rig.connection.giftCatalog).toEqual([
      { id: null, name: 'Rose', coins: 1, iconUrl: null },
    ])
  })

  it('menambahkan gift yang benar-benar dikirim ke katalog', async () => {
    // `gift/list/` bisa gagal atau menjawab sebagian; hadiah yang lewat di depan mata
    // membawa nama, harga, dan gambarnya sendiri, jadi tidak ada alasan membuangnya.
    const rig = createRig(async () => [])

    const connecting = rig.connection.connect('creator')
    rig.latest().succeed()
    await connecting
    await settle()

    rig.latest().emit('gift', {
      user: { displayId: 'siti' },
      repeatCount: 2,
      gift: { id: '5655', name: 'Heart Me', diamondCount: 1, image: { urlList: ['https://x/h.png'] } },
    })

    expect(rig.connection.giftCatalog).toEqual([
      { id: 5655, name: 'Heart Me', coins: 1, iconUrl: 'https://x/h.png' },
    ])
  })

  it('tidak menggandakan gift yang dikirim berkali-kali', async () => {
    const rig = createRig(async () => ({ gifts: [{ name: 'Rose', diamond_count: 1 }] }))

    const connecting = rig.connection.connect('creator')
    rig.latest().succeed()
    await connecting
    await settle()

    const send = (): void =>
      rig.latest().emit('gift', {
        user: { displayId: 'siti' },
        gift: { name: 'rose', diamondCount: 1 },
      })
    send()
    send()

    expect(rig.connection.giftCatalog).toHaveLength(1)
  })

  it('tetap tersambung walau katalog gagal diambil', async () => {
    const rig = createRig(async () => {
      throw new Error('nope')
    })

    const connecting = rig.connection.connect('creator')
    rig.latest().succeed()
    const status = await connecting
    await settle()

    expect(status.state).toBe('connected')
    expect(rig.connection.giftCatalog).toEqual([])
  })
})
