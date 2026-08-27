import { describe, expect, it } from 'vitest'
import { WIRE_VERSION, idleStatus, createChatMessage } from '@lga/shared'
import type { ChatMessage } from '@lga/shared'
import { WsHub } from './ws.js'
import type { SocketLike } from './ws.js'

const OPEN = 1
const CLOSED = 3

function createFakeSocket(readyState = OPEN) {
  const sent: string[] = []
  const socket: SocketLike = {
    get readyState() {
      return readyState
    },
    send: (data: string) => {
      sent.push(data)
    },
  }
  return {
    socket,
    sent,
    parsed: () => sent.map((raw) => JSON.parse(raw) as Record<string, unknown>),
    close: () => {
      readyState = CLOSED
    },
  }
}

const message = (): ChatMessage =>
  createChatMessage({ id: 'm1', kind: 'textMessageEvent', platform: 'tiktok', username: 'budi' })

describe('WsHub', () => {
  it('sends the current status and the overlay count the moment a socket joins', () => {
    const status = { ...idleStatus(), state: 'connected' as const, username: 'budi' }
    const hub = new WsHub({ getStatus: () => status, getOverlays: () => 2 })
    const client = createFakeSocket()

    hub.add(client.socket)

    expect(client.parsed()).toEqual([
      { v: WIRE_VERSION, type: 'status', status },
      { v: WIRE_VERSION, type: 'overlays', count: 2 },
    ])
  })

  it('melaporkan nol overlay saat tidak ada yang memberi tahu', () => {
    const hub = new WsHub({ getStatus: idleStatus })
    const client = createFakeSocket()

    hub.add(client.socket)

    expect(client.parsed()[1]).toEqual({ v: WIRE_VERSION, type: 'overlays', count: 0 })
  })

  it('menyiarkan jumlah overlay yang berubah ke setiap dashboard', () => {
    const hub = new WsHub({ getStatus: idleStatus })
    const client = createFakeSocket()
    hub.add(client.socket)
    client.sent.length = 0

    hub.broadcastOverlays(3)

    expect(client.parsed()).toEqual([{ v: WIRE_VERSION, type: 'overlays', count: 3 }])
  })

  it('broadcasts chat to every open socket', () => {
    const hub = new WsHub({ getStatus: idleStatus })
    const first = createFakeSocket()
    const second = createFakeSocket()
    hub.add(first.socket)
    hub.add(second.socket)
    first.sent.length = 0
    second.sent.length = 0

    hub.broadcastChat(message())

    expect(first.parsed()).toEqual([{ v: WIRE_VERSION, type: 'chat', message: message() }])
    expect(second.parsed()).toEqual([{ v: WIRE_VERSION, type: 'chat', message: message() }])
  })

  it('skips sockets that are no longer open', () => {
    const hub = new WsHub({ getStatus: idleStatus })
    const client = createFakeSocket()
    hub.add(client.socket)
    client.sent.length = 0
    client.close()

    hub.broadcastChat(message())

    expect(client.sent).toEqual([])
  })

  it('stops sending to a removed socket', () => {
    const hub = new WsHub({ getStatus: idleStatus })
    const client = createFakeSocket()
    hub.add(client.socket)
    hub.remove(client.socket)
    client.sent.length = 0

    hub.broadcastStatus(idleStatus())

    expect(client.sent).toEqual([])
    expect(hub.size).toBe(0)
  })

  it('drops a socket whose send throws instead of taking the whole broadcast down', () => {
    const hub = new WsHub({ getStatus: idleStatus })
    const healthy = createFakeSocket()
    const broken: SocketLike = {
      readyState: OPEN,
      send: () => {
        throw new Error('socket exploded')
      },
    }
    hub.add(broken)
    hub.add(healthy.socket)
    healthy.sent.length = 0

    hub.broadcastChat(message())

    expect(healthy.parsed()).toHaveLength(1)
    expect(hub.size).toBe(1)
  })

  it('counts only the sockets it currently holds', () => {
    const hub = new WsHub({ getStatus: idleStatus })
    expect(hub.size).toBe(0)
    const client = createFakeSocket()
    hub.add(client.socket)
    expect(hub.size).toBe(1)
    hub.add(client.socket)
    expect(hub.size).toBe(1)
  })
})
