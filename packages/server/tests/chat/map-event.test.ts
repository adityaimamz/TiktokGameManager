import { describe, expect, it } from 'vitest'
import { mapTikTokEvent, readViewerCount } from '../../src/chat/map-event.js'

const ctx = { id: 'm1', nowMs: 1_700_000_000_000 }

/**
 * Bentuk user persis seperti yang `tiktok-live-connector@2.x` kirimkan: protobuf yang
 * sudah di-decode, TANPA perataan apa pun. Tidak ada `uniqueId` di sana — handle-nya
 * bernama `displayId` — dan itulah yang membuat versi lama mapper ini mengembalikan
 * `null` untuk SETIAP event di live sungguhan.
 */
const user = {
  id: '123',
  displayId: 'budi',
  nickname: 'Budi',
  avatarThumb: { urlList: ['https://x/a.jpg'] },
}

describe('mapTikTokEvent', () => {
  it('maps a chat event to a textMessageEvent', () => {
    const message = mapTikTokEvent('chat', { user, content: 'team a' }, ctx)
    expect(message).toEqual({
      id: 'm1',
      kind: 'textMessageEvent',
      platform: 'tiktok',
      username: 'budi',
      avatarUrl: 'https://x/a.jpg',
      timestampMs: ctx.nowMs,
      text: 'team a',
      likeCount: 0,
      giftName: null,
      giftCount: 0,
      giftCoins: 0,
    })
  })

  it('falls back to the nickname when the handle is missing', () => {
    const message = mapTikTokEvent('chat', { user: { nickname: 'Budi' }, content: 'a' }, ctx)
    expect(message?.username).toBe('Budi')
  })

  it('maps a like event and carries the count', () => {
    const message = mapTikTokEvent('like', { user, count: 15, total: '900' }, ctx)
    expect(message?.kind).toBe('likeEvent')
    expect(message?.likeCount).toBe(15)
    expect(message?.text).toBe('')
  })

  it('maps a gift event with name, count and coins', () => {
    const message = mapTikTokEvent(
      'gift',
      { user, gift: { name: 'Rose', diamondCount: 5, combo: false }, repeatCount: 3 },
      ctx,
    )
    expect(message?.kind).toBe('giftEvent')
    expect(message?.giftName).toBe('Rose')
    expect(message?.giftCount).toBe(3)
    expect(message?.giftCoins).toBe(15)
  })

  it('drops every frame of a combo streak but the last', () => {
    const streak = (repeatCount: number, repeatEnd: number): unknown => ({
      user,
      gift: { name: 'Rose', diamondCount: 1, combo: true },
      repeatCount,
      repeatEnd,
    })
    expect(mapTikTokEvent('gift', streak(1, 0), ctx)).toBeNull()
    expect(mapTikTokEvent('gift', streak(2, 0), ctx)).toBeNull()
    expect(mapTikTokEvent('gift', streak(3, 1), ctx)?.giftCoins).toBe(3)
  })

  it('maps follow, member and share to their own kinds', () => {
    expect(mapTikTokEvent('follow', { user }, ctx)?.kind).toBe('followEvent')
    expect(mapTikTokEvent('member', { user }, ctx)?.kind).toBe('memberEvent')
    expect(mapTikTokEvent('share', { user }, ctx)?.kind).toBe('shareEvent')
  })

  it('returns null for an event name it does not know', () => {
    expect(mapTikTokEvent('roomUser', { total: '9' }, ctx)).toBeNull()
    expect(mapTikTokEvent('subscribe', { user }, ctx)).toBeNull()
  })

  it('returns null when the payload carries no username', () => {
    expect(mapTikTokEvent('chat', { content: 'hello' }, ctx)).toBeNull()
    expect(mapTikTokEvent('chat', { user: {}, content: 'hello' }, ctx)).toBeNull()
    expect(mapTikTokEvent('chat', null, ctx)).toBeNull()
    expect(mapTikTokEvent('chat', 'not an object', ctx)).toBeNull()
  })

  it('falls back to neutral values for missing or wrongly typed fields', () => {
    const message = mapTikTokEvent('chat', { user: { displayId: 'budi' }, content: 42 }, ctx)
    expect(message?.text).toBe('')
    expect(message?.avatarUrl).toBeNull()
  })

  it('treats a missing repeatCount as one gift', () => {
    const message = mapTikTokEvent('gift', { user, gift: { name: 'Rose', diamondCount: 5 } }, ctx)
    expect(message?.giftCount).toBe(1)
    expect(message?.giftCoins).toBe(5)
  })
})

describe('readViewerCount', () => {
  it('reads the count from a roomUser payload', () => {
    expect(readViewerCount({ total: '128' })).toBe(128)
  })

  it('returns null for anything it cannot read', () => {
    expect(readViewerCount({})).toBeNull()
    expect(readViewerCount({ total: '' })).toBeNull()
    expect(readViewerCount({ total: 128 })).toBeNull()
    expect(readViewerCount(null)).toBeNull()
  })
})
