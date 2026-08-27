import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import type { ConnectionStatus } from '@lga/shared'
import { BROADCAST_WORD, broadcastState } from './broadcast.js'

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
