import { describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../framework/clock.js'
import { ALLOWED_TRANSITIONS, MATCH_STATES, MatchStateMachine } from './state-machine.js'

const setup = () => {
  const clock = createManualClock(1000)
  const warn = vi.fn()
  const transitions: string[] = []
  const machine = new MatchStateMachine({
    clock,
    warn,
    onTransition: (from, to) => transitions.push(`${from}->${to}`),
  })
  return { clock, warn, transitions, machine }
}

describe('MATCH_STATES', () => {
  it('lists the seven states in the order Req 23 AC1 specifies', () => {
    expect(MATCH_STATES).toEqual([
      'idle',
      'waitingFighters',
      'countdown',
      'battle',
      'victory',
      'result',
      'reset',
    ])
  })

  it('declares a transition table for every state', () => {
    for (const state of MATCH_STATES) expect(ALLOWED_TRANSITIONS[state]).toBeDefined()
  })

  it('lets Victory branch to either the next round or the result screen', () => {
    expect(ALLOWED_TRANSITIONS.victory).toContain('countdown')
    expect(ALLOWED_TRANSITIONS.victory).toContain('result')
  })
})

describe('MatchStateMachine', () => {
  it('starts idle at the current clock time', () => {
    const { machine } = setup()
    expect(machine.state).toBe('idle')
    expect(machine.enteredAtMs).toBe(1000)
    expect(machine.elapsedMs).toBe(0)
  })

  it('walks the happy path of a single round', () => {
    const { machine, transitions } = setup()
    expect(machine.transition('waitingFighters')).toBe(true)
    expect(machine.transition('countdown')).toBe(true)
    expect(machine.transition('battle')).toBe(true)
    expect(machine.transition('victory')).toBe(true)
    expect(machine.transition('result')).toBe(true)
    expect(machine.transition('reset')).toBe(true)
    expect(machine.transition('idle')).toBe(true)
    expect(transitions).toEqual([
      'idle->waitingFighters',
      'waitingFighters->countdown',
      'countdown->battle',
      'battle->victory',
      'victory->result',
      'result->reset',
      'reset->idle',
    ])
  })

  it('loops from Victory back into Countdown for the next round', () => {
    const { machine } = setup()
    machine.transition('waitingFighters')
    machine.transition('countdown')
    machine.transition('battle')
    machine.transition('victory')
    expect(machine.transition('countdown')).toBe(true)
    expect(machine.state).toBe('countdown')
  })

  it('rejects an illegal transition, warns, and leaves the state untouched', () => {
    const { machine, warn, transitions } = setup()
    expect(machine.transition('battle')).toBe(false)
    expect(machine.state).toBe('idle')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('idle')
    expect(warn.mock.calls[0]?.[0]).toContain('battle')
    expect(transitions).toEqual([])
  })

  it('rejects a transition to the state it is already in', () => {
    const { machine } = setup()
    expect(machine.transition('idle')).toBe(false)
  })

  it('reports canTransition without changing anything', () => {
    const { machine } = setup()
    expect(machine.canTransition('waitingFighters')).toBe(true)
    expect(machine.canTransition('victory')).toBe(false)
    expect(machine.state).toBe('idle')
  })

  it('lets the creator abandon a match from any live state', () => {
    for (const from of ['waitingFighters', 'countdown', 'battle', 'victory'] as const) {
      const { machine } = setup()
      machine.transition('waitingFighters')
      if (from !== 'waitingFighters') machine.transition('countdown')
      if (from === 'battle' || from === 'victory') machine.transition('battle')
      if (from === 'victory') machine.transition('victory')
      expect(machine.state).toBe(from)
      expect(machine.transition('reset')).toBe(true)
    }
  })

  it('tracks how long it has been in the current state', () => {
    const { clock, machine } = setup()
    machine.transition('waitingFighters')
    clock.advance(750)
    expect(machine.elapsedMs).toBe(750)
    machine.transition('countdown')
    expect(machine.elapsedMs).toBe(0)
    expect(machine.enteredAtMs).toBe(1750)
  })

  it('restores a persisted state without validating the jump', () => {
    const { machine, transitions } = setup()
    machine.restore('battle', 12_345)
    expect(machine.state).toBe('battle')
    expect(machine.enteredAtMs).toBe(12_345)
    expect(transitions).toEqual([])
  })
})
