import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import type { ChatMessageInit } from '@lga/shared'
import {
  CHAT_LOG_MAX,
  CHAT_RATE_BARS,
  chatLogEntry,
  chatRateBars,
  chatRateLabel,
  pruneTimestamps,
  pushChatLog,
} from '../../../../src/ui/dashboard/sections/chat-log.js'
import type { ChatLogEntry } from '../../../../src/ui/dashboard/sections/chat-log.js'

const message = (init: Partial<ChatMessageInit>) =>
  createChatMessage({
    id: 'm1',
    kind: 'textMessageEvent',
    platform: 'tiktok',
    username: 'dwiiap',
    ...init,
  } as ChatMessageInit)

describe('chatLogEntry', () => {
  it('carries a comment through as text', () => {
    const entry = chatLogEntry(message({ text: 'a' }))

    expect(entry.text).toBe('a')
    expect(entry.meta).toBeNull()
    expect(entry.initials).toBe('DW')
    expect(entry.synthetic).toBe(false)
  })

  it('describes the events that have no text of their own', () => {
    expect(chatLogEntry(message({ kind: 'likeEvent', likeCount: 30 })).meta).toBe(
      'mengirim 30 suka',
    )
    expect(chatLogEntry(message({ kind: 'giftEvent', giftName: 'Rose', giftCount: 2 })).meta).toBe(
      'mengirim 2× Rose',
    )
    expect(chatLogEntry(message({ kind: 'memberEvent' })).meta).toBe('bergabung ke live')
    expect(chatLogEntry(message({ kind: 'followEvent' })).meta).toBe('mulai mengikuti')
    expect(chatLogEntry(message({ kind: 'shareEvent' })).meta).toBe('membagikan live')
  })

  it('marks synthetic viewers so they can never be mistaken for real ones', () => {
    const entry = chatLogEntry(message({ platform: 'demo', username: 'viewer_412', text: 'a' }))

    expect(entry.synthetic).toBe(true)
    expect(entry.initials).toBe('S')
  })
})

describe('pushChatLog', () => {
  it('keeps the newest first and never grows past the cap', () => {
    let list: ChatLogEntry[] = []
    for (let i = 0; i < CHAT_LOG_MAX + 10; i++) {
      list = pushChatLog(list, chatLogEntry(message({ id: `m${i}`, text: String(i) })))
    }

    expect(list).toHaveLength(CHAT_LOG_MAX)
    expect(list[0]?.text).toBe(String(CHAT_LOG_MAX + 9))
  })
})

describe('chat rate', () => {
  it('drops everything older than the window', () => {
    expect(pruneTimestamps([0, 30_000, 59_999, 60_000], 60_000)).toEqual([30_000, 59_999, 60_000])
  })

  it('counts what is left, per minute', () => {
    expect(chatRateLabel([1, 2, 3], 1000)).toBe('3 / menit')
  })

  it('says so plainly when nothing is coming in', () => {
    expect(chatRateLabel([], 1000)).toBe('diam')
  })
})

describe('chatRateBars', () => {
  it('is flat when nothing has come in', () => {
    expect(chatRateBars([], 60_000)).toEqual(new Array(CHAT_RATE_BARS).fill(0))
  })

  it('puts the most recent seconds in the last bucket, normalised to the busiest', () => {
    // now = 60_000, ember 5 detik: 59_000 baru saja, 2_000 hampir keluar jendela.
    const bars = chatRateBars([59_000, 58_000, 2_000], 60_000)

    expect(bars[CHAT_RATE_BARS - 1]).toBe(1)
    expect(bars[0]).toBe(0.5)
    expect(bars.slice(1, CHAT_RATE_BARS - 1)).toEqual(new Array(CHAT_RATE_BARS - 2).fill(0))
  })

  it('ignores anything outside the window the label already counts', () => {
    expect(chatRateBars([0, 61_000], 60_000)).toEqual(new Array(CHAT_RATE_BARS).fill(0))
  })
})
