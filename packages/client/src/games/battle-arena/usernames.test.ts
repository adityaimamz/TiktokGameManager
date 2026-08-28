import { describe, expect, it } from 'vitest'
import { viewerName } from './usernames.js'

describe('viewerName', () => {
  it('stays unique and alphanumeric well past the end of the seed list', () => {
    const names = Array.from({ length: 500 }, (_, i) => viewerName(i))
    expect(new Set(names).size).toBe(names.length)
    expect(names.every((n) => /^[a-z0-9]{3,16}$/.test(n))).toBe(true)
  })
})
