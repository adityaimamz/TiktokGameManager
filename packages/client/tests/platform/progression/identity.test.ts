import { describe, expect, it } from 'vitest'
import { identityKey, isPersistableIdentity } from '../../../src/platform/progression/identity.js'

describe('identityKey', () => {
  it('joins platform and username', () => {
    expect(identityKey('tiktok', 'Budi')).toBe('tiktok:budi')
  })

  it('folds case, because TikTok treats usernames case-insensitively', () => {
    expect(identityKey('tiktok', 'BUDI')).toBe(identityKey('tiktok', 'budi'))
  })

  it('trims surrounding whitespace and a leading @', () => {
    expect(identityKey('tiktok', '  @Budi ')).toBe('tiktok:budi')
  })

  it('keeps the same name on two platforms apart', () => {
    expect(identityKey('tiktok', 'budi')).not.toBe(identityKey('demo', 'budi'))
  })

  it('refuses a username that normalises to nothing', () => {
    expect(() => identityKey('tiktok', '')).toThrow(TypeError)
    expect(() => identityKey('tiktok', '   ')).toThrow(TypeError)
    expect(() => identityKey('tiktok', '@')).toThrow(TypeError)
    expect(() => identityKey('tiktok', ' @@ ')).toThrow(TypeError)
  })

  it('names the offending platform in the error, so the caller is findable', () => {
    expect(() => identityKey('tiktok', '')).toThrow(/tiktok/)
  })
})

describe('isPersistableIdentity', () => {
  it('accepts only real viewers', () => {
    expect(isPersistableIdentity('tiktok')).toBe(true)
  })

  it('rejects every synthetic platform', () => {
    expect(isPersistableIdentity('demo')).toBe(false)
    expect(isPersistableIdentity('practice')).toBe(false)
    expect(isPersistableIdentity('creator')).toBe(false)
  })
})
