import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import type { ConnectionStatus } from '@lga/shared'
import { statsView } from './stats-view.js'

const connected = (viewerCount: number): ConnectionStatus => ({
  ...idleStatus(),
  state: 'connected',
  viewerCount,
})

describe('statsView', () => {
  it('reads the big numbers the way the creator does from 60cm away', () => {
    const view = statsView({
      status: connected(2481),
      comments: 9317,
      joinedFighters: 604,
      sessionMs: 41 * 60_000,
    })

    expect(view.viewers).toBe('2.481')
    expect(view.comments).toBe('9.317')
    expect(view.summary).toBe('Sesi berjalan 41 menit · 604 fighter bergabung')
    expect(view.dim).toBe(false)
  })

  it('dims the numbers while nobody real is watching', () => {
    const view = statsView({ status: idleStatus(), comments: 0, joinedFighters: 0, sessionMs: 0 })

    expect(view.viewers).toBe('0')
    expect(view.dim).toBe(true)
    expect(view.summary).toBe('Sesi berjalan kurang dari semenit · 0 fighter bergabung')
  })
})
