import { describe, expect, it } from 'vitest'
import { BACKOFF_BASE_MS, WIRE_VERSION } from '@lga/shared'
import { createWsSignalChannel } from '../../../src/platform/signals/ws-channel.js'
import type { WsSignalChannelOptions, WsSocketLike } from '../../../src/platform/signals/ws-channel.js'
import type { SignalMessage } from '../../../src/platform/signals/channel.js'

const OPEN = 1

function fakeSocket(url: string) {
  const sent: unknown[] = []
  const state = { closed: false }
  const socket: WsSocketLike = {
    binaryType: 'blob',
    readyState: OPEN,
    send: (data) => {
      sent.push(data)
    },
    close: () => {
      state.closed = true
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  }
  return {
    url,
    socket,
    sent,
    state,
    json: () =>
      sent
        .filter((data): data is string => typeof data === 'string')
        .map((data) => JSON.parse(data) as Record<string, unknown>),
    binary: () => sent.filter((data): data is Float32Array => data instanceof Float32Array),
    /** Server mengirim frame JSON. */
    says: (event: unknown) => socket.onmessage?.({ data: JSON.stringify(event) }),
    /** Server mengirim frame biner; peramban menyerahkannya sebagai ArrayBuffer. */
    sendsBinary: (values: number[]) =>
      socket.onmessage?.({ data: Float32Array.from(values).buffer }),
  }
}

function harness(opts: Partial<WsSignalChannelOptions> = {}) {
  const sockets: ReturnType<typeof fakeSocket>[] = []
  const timers: { fn: () => void; ms: number }[] = []
  const channel = createWsSignalChannel({
    binaryTopic: 'snapshot',
    url: 'ws://test/ws',
    createSocket: (url) => {
      const fake = fakeSocket(url)
      sockets.push(fake)
      return fake.socket
    },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimer: () => {},
    ...opts,
  })
  const last = (): ReturnType<typeof fakeSocket> => {
    const socket = sockets[sockets.length - 1]
    if (socket === undefined) throw new Error('belum ada soket yang dibuat')
    return socket
  }
  return { channel, sockets, timers, last }
}

/** Membuka gerbang kirim: relay diam sampai server melapor ada yang mendengarkan. */
function withOneOverlay(h: ReturnType<typeof harness>): void {
  h.last().says({ v: WIRE_VERSION, type: 'overlays', count: 1 })
}

describe('createWsSignalChannel', () => {
  it('membuka soket segera dan melaporkan mode ws', () => {
    const h = harness()

    expect(h.channel.mode).toBe('ws')
    expect(h.sockets).toHaveLength(1)
  })

  it('membawa peran dan kunci di query soket', () => {
    const h = harness({ role: 'overlay', appKey: 'rahasia' })

    expect(h.last().url).toBe('ws://test/ws?role=overlay&k=rahasia')
  })

  it('tidak mengirim apa pun selama tidak ada overlay yang mendengarkan', () => {
    const h = harness()

    h.channel.post('roster', { entries: [] })
    h.channel.post('snapshot', Float32Array.from([1, 2]))

    expect(h.last().sent).toEqual([])
  })

  it('mengirim topik non-biner sebagai ClientEvent begitu ada overlay', () => {
    const h = harness()
    withOneOverlay(h)

    h.channel.post('roster', { entries: [] })

    expect(h.last().json()).toEqual([
      { v: WIRE_VERSION, type: 'signal', topic: 'roster', payload: { entries: [] } },
    ])
  })

  it('mengirim topik biner sebagai frame biner telanjang, tanpa header', () => {
    const h = harness()
    withOneOverlay(h)
    const buffer = Float32Array.from([1.5, 2.5, 3.5])

    h.channel.post('snapshot', buffer)

    expect(h.last().binary()).toEqual([buffer])
    expect(h.last().json()).toEqual([])
  })

  it('kembali diam saat overlay terakhir pergi', () => {
    const h = harness()
    withOneOverlay(h)
    h.last().says({ v: WIRE_VERSION, type: 'overlays', count: 0 })

    h.channel.post('roster', { entries: [] })

    expect(h.last().sent).toEqual([])
  })

  it('memberi tahu pemanggil berapa overlay yang terhubung', () => {
    const counts: number[] = []
    const h = harness({ onOverlays: (count) => counts.push(count) })

    h.last().says({ v: WIRE_VERSION, type: 'overlays', count: 3 })

    expect(counts).toEqual([3])
  })

  it('mengubah frame biner masuk menjadi pesan topik biner', () => {
    const h = harness()
    const seen: SignalMessage[] = []
    h.channel.subscribe((message) => seen.push(message))

    h.last().sendsBinary([4, 5])

    expect(seen).toEqual([{ topic: 'snapshot', payload: Float32Array.from([4, 5]) }])
  })

  it('meneruskan frame signal masuk apa adanya', () => {
    const h = harness()
    const seen: SignalMessage[] = []
    h.channel.subscribe((message) => seen.push(message))

    h.last().says({ v: WIRE_VERSION, type: 'signal', topic: 'config', payload: { volume: 1 } })

    expect(seen).toEqual([{ topic: 'config', payload: { volume: 1 } }])
  })

  it('mengabaikan frame yang bukan urusannya tanpa menjatuhkan apa pun', () => {
    const h = harness()
    const seen: SignalMessage[] = []
    h.channel.subscribe((message) => seen.push(message))

    h.last().says({ v: WIRE_VERSION, type: 'chat', message: { id: 'm1' } })
    h.last().socket.onmessage?.({ data: 'bukan json sama sekali' })

    expect(seen).toEqual([])
  })

  it('menutup soket dan berhenti selamanya saat versinya asing', () => {
    const h = harness()

    h.last().says({ v: WIRE_VERSION + 99, type: 'hello' })

    expect(h.last().state.closed).toBe(true)

    // Tidak pernah mengirim biner ke server yang versinya tidak dikenal…
    h.channel.post('snapshot', Float32Array.from([1]))
    expect(h.last().sent).toEqual([])

    // …dan tidak menyambung ulang untuk mengulangi kegagalan yang sama.
    h.last().socket.onclose?.()
    expect(h.timers).toEqual([])
    expect(h.sockets).toHaveLength(1)
  })

  it('menyambung ulang dengan backoff yang sama seperti sumber chat', () => {
    const h = harness()

    h.last().socket.onclose?.()

    expect(h.timers[0]?.ms).toBe(BACKOFF_BASE_MS)
    h.timers[0]?.fn()
    expect(h.sockets).toHaveLength(2)
  })

  it('berhenti menyambung ulang setelah ditutup pemanggilnya', () => {
    const h = harness()

    h.channel.close()
    h.last().socket.onclose?.()

    expect(h.last().state.closed).toBe(true)
    expect(h.timers).toEqual([])
  })
})
