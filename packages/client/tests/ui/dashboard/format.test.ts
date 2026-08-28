import { describe, expect, it } from 'vitest'
import { formatClock, formatCount, formatDuration } from '../../../src/ui/dashboard/format.js'

describe('formatCount', () => {
  it('groups thousands the way the creator reads them', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(2481)).toBe('2.481')
    expect(formatCount(9317)).toBe('9.317')
    expect(formatCount(1234567)).toBe('1.234.567')
  })

  it('rounds rather than printing a fraction of a viewer', () => {
    expect(formatCount(1234.6)).toBe('1.235')
  })
})

describe('formatDuration', () => {
  it('does not pretend to a precision it does not have', () => {
    expect(formatDuration(0)).toBe('kurang dari semenit')
    expect(formatDuration(59_000)).toBe('kurang dari semenit')
  })

  it('counts minutes, then hours', () => {
    expect(formatDuration(41 * 60_000)).toBe('41 menit')
    expect(formatDuration(60 * 60_000)).toBe('1 jam')
    expect(formatDuration(65 * 60_000)).toBe('1 jam 5 menit')
  })
})

describe('formatClock', () => {
  it('keeps the seconds that separate one short match from another', () => {
    expect(formatClock(42_000)).toBe('0:42')
    expect(formatClock(55_000)).toBe('0:55')
  })

  it('pads the seconds so the column stays aligned', () => {
    expect(formatClock(252_000)).toBe('4:12')
    expect(formatClock(240_000)).toBe('4:00')
  })

  it('grows an hours field only when there is one', () => {
    expect(formatClock(3_800_000)).toBe('1:03:20')
  })

  it('reads a negative duration as zero rather than as a minus sign', () => {
    expect(formatClock(-5_000)).toBe('0:00')
  })
})
