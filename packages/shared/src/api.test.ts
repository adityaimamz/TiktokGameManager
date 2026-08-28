import { describe, expect, it } from 'vitest'
import {
  APP_KEY_HEADER,
  APP_KEY_QUERY,
  OVERLAY_ROLE,
  OVERLAY_ROLE_QUERY,
  WIRE_VERSION,
  idleStatus,
} from './index.js'
import type { ClientEvent, ServerEvent } from './index.js'

describe('idleStatus', () => {
  it('describes a connection that has never been attempted', () => {
    expect(idleStatus()).toEqual({
      state: 'idle',
      username: null,
      roomId: null,
      viewerCount: 0,
      error: null,
      attempt: 0,
      connectedAtMs: null,
    })
  })

  it('returns a fresh object each call so callers can mutate their copy', () => {
    const first = idleStatus()
    first.viewerCount = 42
    expect(idleStatus().viewerCount).toBe(0)
  })
})

describe('WIRE_VERSION', () => {
  it('is a positive integer that server and client both stamp on messages', () => {
    expect(Number.isInteger(WIRE_VERSION)).toBe(true)
    expect(WIRE_VERSION).toBeGreaterThan(0)
  })

  it('naik ke 2 karena ServerEvent bertambah signal, overlays, dan hello', () => {
    expect(WIRE_VERSION).toBe(2)
  })
})

describe('ServerEvent', () => {
  it('membedakan ketiga anggota barunya lewat type', () => {
    const events: ServerEvent[] = [
      { v: WIRE_VERSION, type: 'hello' },
      { v: WIRE_VERSION, type: 'overlays', count: 2 },
      { v: WIRE_VERSION, type: 'signal', topic: 'roster', payload: { entries: [] } },
    ]

    expect(events.map((event) => event.type)).toEqual(['hello', 'overlays', 'signal'])
  })
})

describe('ClientEvent', () => {
  it('hanya punya satu bentuk: signal dengan topik dan payload apa adanya', () => {
    const event: ClientEvent = {
      v: WIRE_VERSION,
      type: 'signal',
      topic: 'config',
      payload: { anything: true },
    }

    expect(JSON.parse(JSON.stringify(event))).toEqual(event)
  })
})

describe('nama kunci dan peran', () => {
  it('dieja sekali di sini, bukan di client dan server masing-masing', () => {
    expect(APP_KEY_HEADER).toBe('x-app-key')
    expect(APP_KEY_QUERY).toBe('k')
    expect(`${OVERLAY_ROLE_QUERY}=${OVERLAY_ROLE}`).toBe('role=overlay')
  })
})
