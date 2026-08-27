import { describe, expect, it } from 'vitest'
import { MATCH_STATES } from '../../games/battle-arena/state-machine.js'
import { shouldWarnOnUnload } from './unload.js'

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
