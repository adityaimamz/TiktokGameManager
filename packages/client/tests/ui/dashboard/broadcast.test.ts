import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import type { ConnectionStatus } from '@lga/shared'
import { BROADCAST_WORD, broadcastState, liveDuration } from '../../../src/ui/dashboard/broadcast.js'

const connected = (): ConnectionStatus => ({
  ...idleStatus(),
  state: 'connected',
  username: 'raya',
})

describe('broadcastState', () => {
  it('is live whenever the server holds a TikTok connection', () => {
    expect(broadcastState(connected(), false)).toBe('live')
  })

  it('stays live even while the simulator also runs', () => {
    expect(broadcastState(connected(), true)).toBe('live')
  })

  it('is a rehearsal when only synthetic viewers are playing', () => {
    expect(broadcastState(idleStatus(), true)).toBe('rehearsal')
  })

  it('is idle with neither', () => {
    expect(broadcastState(idleStatus(), false)).toBe('idle')
  })

  it('names all three realities for the top bar', () => {
    expect(BROADCAST_WORD).toEqual({ idle: 'Diam', rehearsal: 'Gladi', live: 'Siaran' })
  })
})

describe('liveDuration', () => {
  const status = (over: Partial<ConnectionStatus> = {}): ConnectionStatus => ({
    ...idleStatus(),
    ...over,
  })

  it('diam sebelum ada koneksi yang pernah berhasil', () => {
    expect(liveDuration(status(), 10_000)).toBeNull()
  })

  it('mencetak jam:menit:detik sejak sambungan pertama', () => {
    expect(liveDuration(status({ connectedAtMs: 1_000 }), 3_801_000)).toBe('1:03:20')
  })

  it('tetap berjalan selama sambung ulang', () => {
    expect(liveDuration(status({ state: 'reconnecting', connectedAtMs: 0 }), 65_000)).toBe('1:05')
  })

  it('tidak pernah negatif kalau jam client tertinggal dari jam server', () => {
    expect(liveDuration(status({ connectedAtMs: 9_000 }), 1_000)).toBe('0:00')
  })
})
