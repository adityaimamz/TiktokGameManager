import { describe, expect, it } from 'vitest'
import { WIRE_VERSION } from '../src/index.js'

describe('shared', () => {
  it('exposes a wire version', () => {
    expect(WIRE_VERSION).toBe(2)
  })
})
