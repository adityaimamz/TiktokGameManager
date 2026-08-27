import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMIT, MAX_LIMIT, parseLimit } from './query.js'

describe('parseLimit', () => {
  it('takes a sane number as given', () => {
    expect(parseLimit('50')).toBe(50)
  })

  it('falls back to the default for anything it cannot read', () => {
    expect(parseLimit('abc')).toBe(DEFAULT_LIMIT)
    expect(parseLimit(undefined)).toBe(DEFAULT_LIMIT)
    // Express memberi array saat parameter yang sama muncul dua kali.
    expect(parseLimit(['5'])).toBe(DEFAULT_LIMIT)
  })

  it('clamps rather than refusing, in both directions', () => {
    expect(parseLimit('0')).toBe(DEFAULT_LIMIT)
    expect(parseLimit('-3')).toBe(DEFAULT_LIMIT)
    expect(parseLimit('9999')).toBe(MAX_LIMIT)
  })
})
