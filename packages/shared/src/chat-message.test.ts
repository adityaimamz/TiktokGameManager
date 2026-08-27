import { describe, expect, it } from 'vitest'
import { createChatMessage, isSyntheticPlatform } from './chat-message.js'

describe('createChatMessage', () => {
  it('keeps the fields the caller provided', () => {
    const m = createChatMessage({
      id: 'm1',
      kind: 'textMessageEvent',
      platform: 'tiktok',
      username: 'andi',
      avatarUrl: 'https://example.test/a.png',
      timestampMs: 1234,
      text: 'messi',
    })
    expect(m.id).toBe('m1')
    expect(m.kind).toBe('textMessageEvent')
    expect(m.platform).toBe('tiktok')
    expect(m.username).toBe('andi')
    expect(m.avatarUrl).toBe('https://example.test/a.png')
    expect(m.timestampMs).toBe(1234)
    expect(m.text).toBe('messi')
  })

  it('fills neutral values for the fields the caller omitted', () => {
    const m = createChatMessage({ id: 'm2', kind: 'likeEvent', platform: 'demo', username: 'budi' })
    expect(m.avatarUrl).toBeNull()
    expect(m.timestampMs).toBe(0)
    expect(m.text).toBe('')
    expect(m.likeCount).toBe(0)
    expect(m.giftName).toBeNull()
    expect(m.giftCount).toBe(0)
    expect(m.giftCoins).toBe(0)
  })

  it('carries like and gift payloads', () => {
    const like = createChatMessage({ id: 'm3', kind: 'likeEvent', platform: 'tiktok', username: 'c', likeCount: 15 })
    expect(like.likeCount).toBe(15)

    const gift = createChatMessage({
      id: 'm4',
      kind: 'giftEvent',
      platform: 'tiktok',
      username: 'd',
      giftName: 'Rose',
      giftCount: 3,
      giftCoins: 15,
    })
    expect(gift.giftName).toBe('Rose')
    expect(gift.giftCount).toBe(3)
    expect(gift.giftCoins).toBe(15)
  })
})

describe('isSyntheticPlatform', () => {
  it('treats demo, practice and creator as synthetic', () => {
    expect(isSyntheticPlatform('demo')).toBe(true)
    expect(isSyntheticPlatform('practice')).toBe(true)
    expect(isSyntheticPlatform('creator')).toBe(true)
  })

  it('treats tiktok as a real viewer platform', () => {
    expect(isSyntheticPlatform('tiktok')).toBe(false)
  })
})
