import { describe, expect, it } from 'vitest'
import { MATCH_STATES } from '../../../src/games/battle-arena/state-machine.js'
import { leaveWarning, shouldWarnOnUnload } from '../../../src/ui/dashboard/unload.js'

describe('shouldWarnOnUnload', () => {
  it('stays quiet when there is nothing left to lose', () => {
    expect(shouldWarnOnUnload('idle')).toBe(false)
    expect(shouldWarnOnUnload('result')).toBe(false)
  })

  it('warns in every other state', () => {
    const warned = MATCH_STATES.filter(shouldWarnOnUnload)
    expect(warned).toEqual(['waitingFighters', 'countdown', 'battle', 'victory', 'reset'])
  })
})

describe('leaveWarning', () => {
  it('diam saat tidak ada match dan tidak ada koneksi', () => {
    expect(leaveWarning('idle', 'idle')).toBe(false)
    expect(leaveWarning('result', 'failed')).toBe(false)
  })

  it('bertanya saat match sedang berjalan walau tanpa koneksi', () => {
    expect(leaveWarning('battle', 'idle')).toBe(true)
  })

  it('bertanya saat koneksi hidup walau match belum mulai', () => {
    expect(leaveWarning('idle', 'connected')).toBe(true)
    expect(leaveWarning('result', 'reconnecting')).toBe(true)
  })

  it('tidak menganggap percobaan sambung pertama sebagai sesuatu yang bisa hilang', () => {
    expect(leaveWarning('idle', 'connecting')).toBe(false)
  })

  it('bertanya di setiap state yang sudah diperingatkan saat tab ditutup', () => {
    const warned = MATCH_STATES.filter((state) => leaveWarning(state, 'idle'))
    expect(warned).toEqual(MATCH_STATES.filter(shouldWarnOnUnload))
  })
})
