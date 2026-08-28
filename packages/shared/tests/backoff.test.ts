import { describe, expect, it } from 'vitest'
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, nextDelayMs } from '../src/backoff.js'

describe('nextDelayMs', () => {
  it('doubles from 5s and stops at 60s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(nextDelayMs)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ])
  })

  it('treats a zeroth or negative attempt as the first', () => {
    expect(nextDelayMs(0)).toBe(BACKOFF_BASE_MS)
    expect(nextDelayMs(-3)).toBe(BACKOFF_BASE_MS)
  })

  it('never exceeds the ceiling for absurd attempt counts', () => {
    expect(nextDelayMs(1_000)).toBe(BACKOFF_MAX_MS)
  })
})
