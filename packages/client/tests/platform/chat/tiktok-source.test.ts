import { describe, expect, it } from 'vitest'
import { WIRE_VERSION, createChatMessage, idleStatus } from '@lga/shared'
import type { ChatMessage, ConnectionStatus, ServerEvent } from '@lga/shared'
import { TikTokChatSource } from '../../../src/platform/chat/tiktok-source.js'
import type { SocketLike } from '../../../src/platform/chat/tiktok-source.js'

/** Soket palsu: test yang memutuskan pesan apa yang tiba dan kapan ia tertutup. */
function createFakeSocket(url: string) {
  const socket: SocketLike = {
    url,
    close: () => {
      socket.onclose?.()
    },
    onmessage: null,
    onclose: null,
    onerror: null,
  }
  return socket
}

function createRig() {
  const sockets: SocketLike[] = []
  const timers: { fn: () => void; ms: number }[] = []
  const received: ChatMessage[] = []
  const statuses: ConnectionStatus[] = []

  const source = new TikTokChatSource({
    url: 'ws://localhost:3001/ws',
    createSocket: (url) => {
      const socket = createFakeSocket(url)
      sockets.push(socket)
      return socket
    },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimer: () => {
      timers.length = 0
    },
    onStatus: (status) => statuses.push(status),
  })

  return {
    source,
    sockets,
    timers,
    received,
    statuses,
    start: () => source.connect((message) => received.push(message)),
    latest: () => {
      const socket = sockets[sockets.length - 1]
      if (socket === undefined) throw new Error('no socket was opened')
      return socket
    },
    deliver: (event: ServerEvent) => {
      const socket = sockets[sockets.length - 1]
      socket?.onmessage?.({ data: JSON.stringify(event) })
    },
    deliverRaw: (data: string) => {
      const socket = sockets[sockets.length - 1]
      socket?.onmessage?.({ data })
    },
    fireTimers: () => {
      const pending = [...timers]
      timers.length = 0
      for (const timer of pending) timer.fn()
    },
  }
}

const chatEvent = (): ServerEvent => ({
  v: WIRE_VERSION,
  type: 'chat',
  message: createChatMessage({
    id: 'm1',
    kind: 'textMessageEvent',
    platform: 'tiktok',
    username: 'budi',
    text: 'team a',
  }),
})

describe('TikTokChatSource', () => {
  it('identifies itself as the tiktok source', () => {
    const rig = createRig()
    expect(rig.source.id).toBe('tiktok')
    expect(rig.source.platform).toBe('tiktok')
  })

  it('opens a socket to the configured url on connect', () => {
    const rig = createRig()
    rig.start()
    expect(rig.sockets).toHaveLength(1)
    expect(rig.latest().url).toBe('ws://localhost:3001/ws')
  })

  it('emits the chat messages the server sends', () => {
    const rig = createRig()
    rig.start()
    rig.deliver(chatEvent())

    expect(rig.received).toHaveLength(1)
    expect(rig.received[0]?.username).toBe('budi')
    expect(rig.received[0]?.text).toBe('team a')
  })

  it('reports status updates without emitting them as chat', () => {
    const rig = createRig()
    rig.start()
    const status = { ...idleStatus(), state: 'connected' as const, username: 'budi' }
    rig.deliver({ v: WIRE_VERSION, type: 'status', status })

    expect(rig.statuses).toEqual([status])
    expect(rig.received).toEqual([])
  })

  it('drops messages stamped with a wire version it does not know', () => {
    const rig = createRig()
    rig.start()
    rig.deliver({ ...chatEvent(), v: WIRE_VERSION + 1 })
    expect(rig.received).toEqual([])
  })

  it('survives a frame that is not JSON at all', () => {
    const rig = createRig()
    rig.start()
    expect(() => rig.deliverRaw('<html>proxy error</html>')).not.toThrow()
    expect(rig.received).toEqual([])
  })

  it('reopens the socket with backoff after the server drops it', () => {
    const rig = createRig()
    rig.start()
    rig.latest().onclose?.()

    expect(rig.timers.map((timer) => timer.ms)).toEqual([5_000])
    rig.fireTimers()
    expect(rig.sockets).toHaveLength(2)
  })

  it('doubles the delay while the server stays down', () => {
    const rig = createRig()
    rig.start()
    rig.latest().onclose?.()
    rig.fireTimers()
    rig.latest().onclose?.()

    expect(rig.timers.map((timer) => timer.ms)).toEqual([10_000])
  })

  it('resets the backoff once a message actually arrives', () => {
    const rig = createRig()
    rig.start()
    rig.latest().onclose?.()
    rig.fireTimers()
    rig.deliver(chatEvent())
    rig.latest().onclose?.()

    expect(rig.timers.map((timer) => timer.ms)).toEqual([5_000])
  })

  it('stops reconnecting after disconnect', () => {
    const rig = createRig()
    rig.start()
    rig.source.disconnect()
    rig.latest().onclose?.()

    expect(rig.timers).toEqual([])
    rig.fireTimers()
    expect(rig.sockets).toHaveLength(1)
  })

  it('emits nothing that arrives after disconnect', () => {
    const rig = createRig()
    rig.start()
    const socket = rig.latest()
    rig.source.disconnect()
    socket.onmessage?.({ data: JSON.stringify(chatEvent()) })

    expect(rig.received).toEqual([])
  })

  it('membawa kunci di query soket, karena soket tidak bisa memasang header', () => {
    const urls: string[] = []
    const source = new TikTokChatSource({
      url: 'ws://localhost:3001/ws',
      appKey: 'rahasia',
      createSocket: (url) => {
        urls.push(url)
        return createFakeSocket(url)
      },
    })

    source.connect(() => {})

    expect(urls).toEqual(['ws://localhost:3001/ws?k=rahasia'])
  })

  it('membiarkan URL apa adanya saat server tidak berkunci', () => {
    const urls: string[] = []
    const source = new TikTokChatSource({
      url: 'ws://localhost:3001/ws',
      createSocket: (url) => {
        urls.push(url)
        return createFakeSocket(url)
      },
    })

    source.connect(() => {})

    expect(urls).toEqual(['ws://localhost:3001/ws'])
  })
})
