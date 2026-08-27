import { describe, expect, it } from 'vitest'
import { WIRE_VERSION } from '@lga/shared'
import { SignalHub, readClientSignal } from './signal-hub.js'
import type { OverlaySocket } from './signal-hub.js'

const OPEN = 1
const CLOSED = 3

function fakeSocket(readyState = OPEN) {
  const sent: (string | Buffer)[] = []
  const socket: OverlaySocket = {
    get readyState() {
      return readyState
    },
    send: (data) => {
      sent.push(data)
    },
  }
  return {
    socket,
    sent,
    json: () =>
      sent
        .filter((data): data is string => typeof data === 'string')
        .map((data) => JSON.parse(data) as Record<string, unknown>),
    binary: () => sent.filter((data): data is Buffer => Buffer.isBuffer(data)),
    close: () => {
      readyState = CLOSED
    },
  }
}

const snapshot = (values: number[]): Buffer => Buffer.from(Float32Array.from(values).buffer)

describe('SignalHub', () => {
  it('menyapa soket baru dengan hello supaya versinya disepakati lebih dulu', () => {
    const hub = new SignalHub()
    const overlay = fakeSocket()

    hub.add(overlay.socket)

    expect(overlay.json()).toEqual([{ v: WIRE_VERSION, type: 'hello' }])
  })

  it('meneruskan sinyal ke setiap overlay yang terbuka', () => {
    const hub = new SignalHub()
    const first = fakeSocket()
    const second = fakeSocket()
    hub.add(first.socket)
    hub.add(second.socket)
    first.sent.length = 0
    second.sent.length = 0

    hub.relaySignal('feed', { kind: 'kill' })

    const expected = { v: WIRE_VERSION, type: 'signal', topic: 'feed', payload: { kind: 'kill' } }
    expect(first.json()).toEqual([expected])
    expect(second.json()).toEqual([expected])
  })

  it('memutar ulang tiga topik keadaan ke overlay yang menyambung di tengah match', () => {
    const hub = new SignalHub()
    hub.relaySignal('config', { volume: 1 })
    hub.relaySignal('roster', { entries: [] })
    hub.relaySnapshot(snapshot([1, 2, 3]))

    const late = fakeSocket()
    hub.add(late.socket)

    expect(late.json()).toEqual([
      { v: WIRE_VERSION, type: 'hello' },
      { v: WIRE_VERSION, type: 'signal', topic: 'config', payload: { volume: 1 } },
      { v: WIRE_VERSION, type: 'signal', topic: 'roster', payload: { entries: [] } },
    ])
    expect(late.binary()).toEqual([snapshot([1, 2, 3])])
  })

  it('menahan hanya yang TERBARU dari tiap topik keadaan, bukan riwayatnya', () => {
    const hub = new SignalHub()
    hub.relaySignal('config', { volume: 1 })
    hub.relaySignal('config', { volume: 2 })
    hub.relaySnapshot(snapshot([1]))
    hub.relaySnapshot(snapshot([2]))

    const late = fakeSocket()
    hub.add(late.socket)

    expect(late.json()).toEqual([
      { v: WIRE_VERSION, type: 'hello' },
      { v: WIRE_VERSION, type: 'signal', topic: 'config', payload: { volume: 2 } },
    ])
    expect(late.binary()).toEqual([snapshot([2])])
  })

  it('TIDAK PERNAH memutar ulang feed maupun media — keduanya kejadian, bukan keadaan', () => {
    const hub = new SignalHub()
    hub.relaySignal('feed', { kind: 'kill', at: 1 })
    hub.relaySignal('media', { kind: 'alert', id: 'gift' })

    const late = fakeSocket()
    hub.add(late.socket)

    expect(late.json()).toEqual([{ v: WIRE_VERSION, type: 'hello' }])
  })

  it('menyalin snapshot sebelum menahannya, karena buffer ws dipakai ulang', () => {
    const hub = new SignalHub()
    const buffer = snapshot([7, 8])
    hub.relaySnapshot(buffer)
    // Frame berikutnya menimpa byte yang sama di buffer pool `ws`.
    buffer.fill(0)

    const late = fakeSocket()
    hub.add(late.socket)

    expect(late.binary()).toEqual([snapshot([7, 8])])
  })

  it('melaporkan jumlah overlay tiap kali berubah, dan hanya saat berubah', () => {
    const counts: number[] = []
    const hub = new SignalHub({ onCount: (count) => counts.push(count) })
    const overlay = fakeSocket()

    hub.add(overlay.socket)
    hub.remove(overlay.socket)
    hub.remove(overlay.socket)

    expect(counts).toEqual([1, 0])
    expect(hub.size).toBe(0)
  })

  it('melewati soket yang sudah tidak terbuka', () => {
    const hub = new SignalHub()
    const overlay = fakeSocket()
    hub.add(overlay.socket)
    overlay.sent.length = 0
    overlay.close()

    hub.relaySignal('config', {})

    expect(overlay.sent).toEqual([])
  })

  it('melepas soket yang melempar alih-alih menjatuhkan siaran ke soket lain', () => {
    const hub = new SignalHub({ onDropped: () => {} })
    const broken: OverlaySocket = {
      readyState: OPEN,
      send: () => {
        throw new Error('EPIPE')
      },
    }
    hub.add(broken)

    hub.relaySignal('config', {})

    expect(hub.size).toBe(0)
  })
})

describe('readClientSignal', () => {
  it('menerima frame signal yang versinya cocok', () => {
    const raw = JSON.stringify({ v: WIRE_VERSION, type: 'signal', topic: 'roster', payload: [1] })

    expect(readClientSignal(raw)).toEqual({ topic: 'roster', payload: [1] })
  })

  it('membuang versi asing, tipe lain, dan sampah, tanpa melempar', () => {
    expect(readClientSignal(JSON.stringify({ v: 99, type: 'signal', topic: 'x' }))).toBeNull()
    expect(readClientSignal(JSON.stringify({ v: WIRE_VERSION, type: 'hello' }))).toBeNull()
    expect(readClientSignal('<html>proxy salah konfigurasi</html>')).toBeNull()
    expect(readClientSignal(null)).toBeNull()
  })
})
