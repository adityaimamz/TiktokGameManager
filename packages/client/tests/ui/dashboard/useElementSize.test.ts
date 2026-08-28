import { describe, expect, it } from 'vitest'
import { fitPortrait } from '../../../src/ui/dashboard/useElementSize.js'

describe('fitPortrait', () => {
  it('is bound by height in a wide space, and stays 9:16', () => {
    const size = fitPortrait({ width: 900, height: 600 }, 2000)

    expect(size.height).toBe(600)
    expect(size.width).toBe(338) // 600 * 9/16
  })

  it('is bound by width in a narrow space', () => {
    const size = fitPortrait({ width: 270, height: 900 }, 2000)

    expect(size.height).toBe(480) // 270 * 16/9
    expect(size.width).toBe(270)
  })

  it('never grows past the cap, so the monitor stays a monitor on a huge screen', () => {
    expect(fitPortrait({ width: 4000, height: 4000 }, 720).height).toBe(720)
  })

  it('collapses to zero rather than going negative before the first measurement', () => {
    expect(fitPortrait({ width: 0, height: 0 }, 720)).toEqual({ width: 0, height: 0 })
  })
})
