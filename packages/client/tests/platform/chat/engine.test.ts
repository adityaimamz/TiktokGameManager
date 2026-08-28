import { describe, expect, it, vi } from 'vitest'
import { createChatMessage } from '@lga/shared'
import type { ChatMessage, ChatPlatform } from '@lga/shared'
import { ChatEngine } from '../../../src/platform/chat/engine.js'
import type { ChatSource } from '../../../src/platform/chat/source.js'

/** Sumber palsu yang hanya memancarkan pesan saat test menyuruhnya. */
const createFakeSource = (id: string, platform: ChatPlatform = 'demo') => {
  let emit: ((m: ChatMessage) => void) | null = null
  let connectCount = 0
  let disconnectCount = 0
  const source: ChatSource = {
    id,
    platform,
    connect(fn) {
      emit = fn
      connectCount++
    },
    disconnect() {
      emit = null
      disconnectCount++
    },
  }
  return {
    source,
    push(text: string) {
      emit?.(createChatMessage({ id: `${id}-${text}`, kind: 'textMessageEvent', platform, username: 'u', text }))
    },
    get connectCount() {
      return connectCount
    },
    get disconnectCount() {
      return disconnectCount
    },
    get isConnected() {
      return emit !== null
    },
  }
}

describe('ChatEngine', () => {
  it('starts with no sources and not running', () => {
    const engine = new ChatEngine()
    expect(engine.sourceIds).toEqual([])
    expect(engine.isRunning).toBe(false)
  })

  it('rejects two sources with the same id', () => {
    const engine = new ChatEngine()
    engine.addSource(createFakeSource('sim').source)
    expect(() => engine.addSource(createFakeSource('sim').source)).toThrow(/sim/)
  })

  it('does not connect a source before start()', () => {
    const engine = new ChatEngine()
    const fake = createFakeSource('sim')
    engine.addSource(fake.source)
    expect(fake.isConnected).toBe(false)
  })

  it('connects every source on start and disconnects them on stop', () => {
    const engine = new ChatEngine()
    const a = createFakeSource('a')
    const b = createFakeSource('b')
    engine.addSource(a.source)
    engine.addSource(b.source)
    engine.start()
    expect(a.connectCount).toBe(1)
    expect(b.connectCount).toBe(1)
    engine.stop()
    expect(a.disconnectCount).toBe(1)
    expect(b.disconnectCount).toBe(1)
    expect(engine.isRunning).toBe(false)
  })

  it('connects a source added while already running', () => {
    const engine = new ChatEngine()
    engine.start()
    const late = createFakeSource('late')
    engine.addSource(late.source)
    expect(late.isConnected).toBe(true)
  })

  it('delivers messages from every source to every subscriber', () => {
    const engine = new ChatEngine()
    const a = createFakeSource('a')
    const b = createFakeSource('b')
    engine.addSource(a.source)
    engine.addSource(b.source)
    const seen1: string[] = []
    const seen2: string[] = []
    engine.subscribe((m) => seen1.push(m.text))
    engine.subscribe((m) => seen2.push(m.text))
    engine.start()
    a.push('one')
    b.push('two')
    expect(seen1).toEqual(['one', 'two'])
    expect(seen2).toEqual(['one', 'two'])
    expect(engine.messageCount).toBe(2)
  })

  it('stops delivering after unsubscribe', () => {
    const engine = new ChatEngine()
    const a = createFakeSource('a')
    engine.addSource(a.source)
    const seen: string[] = []
    const unsubscribe = engine.subscribe((m) => seen.push(m.text))
    engine.start()
    a.push('one')
    unsubscribe()
    a.push('two')
    expect(seen).toEqual(['one'])
  })

  it('ignores messages arriving while stopped', () => {
    const engine = new ChatEngine()
    const a = createFakeSource('a')
    engine.addSource(a.source)
    const seen: string[] = []
    engine.subscribe((m) => seen.push(m.text))
    engine.start()
    engine.stop()
    a.push('late')
    expect(seen).toEqual([])
  })

  it('isolates a throwing subscriber so the others still receive the message', () => {
    const onError = vi.fn()
    const engine = new ChatEngine({ onError })
    const a = createFakeSource('a')
    engine.addSource(a.source)
    engine.subscribe(() => {
      throw new Error('boom')
    })
    const seen: string[] = []
    engine.subscribe((m) => seen.push(m.text))
    engine.start()
    a.push('one')
    expect(seen).toEqual(['one'])
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('disconnects and forgets a removed source', () => {
    const engine = new ChatEngine()
    const a = createFakeSource('a')
    engine.addSource(a.source)
    engine.start()
    engine.removeSource('a')
    expect(a.disconnectCount).toBe(1)
    expect(engine.sourceIds).toEqual([])
    const seen: string[] = []
    engine.subscribe((m) => seen.push(m.text))
    a.push('after-removal')
    expect(seen).toEqual([])
  })
})
