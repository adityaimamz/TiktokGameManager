import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import type { ChatMessage } from '@lga/shared'
import { DEFAULT_ALERTS } from './cues.js'
import type { AlertRule, CatalogEntry } from './cues.js'
import { createAlertWatcher, fillTemplate } from './alerts.js'

const rules = (over: Partial<AlertRule> & { kind: AlertRule['kind'] }): AlertRule[] =>
  DEFAULT_ALERTS.map((rule) => (rule.kind === over.kind ? { ...rule, ...over } : { ...rule }))

const gift = (coins: number): ChatMessage =>
  createChatMessage({
    id: 'g1',
    kind: 'giftEvent',
    platform: 'tiktok',
    username: 'budi',
    giftName: 'Rose',
    giftCount: 10,
    giftCoins: coins,
  })

const likes = (count: number): ChatMessage =>
  createChatMessage({
    id: 'l1',
    kind: 'likeEvent',
    platform: 'tiktok',
    username: 'andi',
    likeCount: count,
  })

const watcher = (rulesList: AlertRule[], cues: CatalogEntry[] = []) =>
  createAlertWatcher({ getRules: () => rulesList, getCues: () => cues })

describe('createAlertWatcher', () => {
  it('melepas alert saat gift mencapai ambang koin, dan diam di bawahnya', () => {
    const w = watcher(rules({ kind: 'gift', threshold: 500 }))

    expect(w.onMessage(gift(499))).toBeNull()
    expect(w.onMessage(gift(500))?.text).toBe('budi mengirim Rose ×10!')
  })

  it('menyalakan milestone like sekali per kelipatan, meski satu event membawa puluhan like', () => {
    const w = watcher(rules({ kind: 'likes', threshold: 100 }))

    expect(w.onMessage(likes(60))).toBeNull()
    // 60 + 60 = 120: satu kelipatan terlewati, satu alert.
    expect(w.onMessage(likes(60))?.text).toBe('100 like tercapai!')
    expect(w.onMessage(likes(30))).toBeNull()
  })

  it('rule yang dimatikan tidak pernah menyala', () => {
    const w = watcher(rules({ kind: 'gift', threshold: 1, enabled: false }))

    expect(w.onMessage(gift(9999))).toBeNull()
  })

  it('menghitung like meski rule-nya mati, jadi menyalakannya tidak meledakkan alert susulan', () => {
    const list = rules({ kind: 'likes', threshold: 100, enabled: false })
    const w = watcher(list)

    w.onMessage(likes(500))
    list[1] = { ...(list[1] as AlertRule), enabled: true }

    expect(w.onMessage(likes(10))).toBeNull()
  })

  it('memberi media dari katalog saat cueId dikenal', () => {
    const cue: CatalogEntry = {
      id: 'gif-1',
      kind: 'gif',
      label: 'tepuk tangan',
      url: '/api/uploads/abc.gif',
      volume: 1,
    }
    const w = watcher(rules({ kind: 'gift', threshold: 1, cueId: 'gif-1' }), [cue])

    const alert = w.onMessage(gift(5))
    expect(alert?.kind).toBe('gif')
    expect(alert?.url).toBe('/api/uploads/abc.gif')
  })

  it('tetap melepas alert tanpa media saat cue-nya sudah dihapus creator', () => {
    const w = watcher(rules({ kind: 'gift', threshold: 1, cueId: 'sudah-dihapus' }))

    const alert = w.onMessage(gift(5))
    expect(alert).not.toBeNull()
    expect(alert?.url).toBeNull()
    expect(alert?.kind).toBe('gif')
  })

  it('melepas alert follow dan share dari kind pesannya', () => {
    const w = watcher([...DEFAULT_ALERTS.map((rule) => ({ ...rule, enabled: true }))])

    const follow = w.onMessage(
      createChatMessage({ id: 'f1', kind: 'followEvent', platform: 'tiktok', username: 'siti' }),
    )
    const share = w.onMessage(
      createChatMessage({ id: 's1', kind: 'shareEvent', platform: 'tiktok', username: 'tono' }),
    )

    expect(follow?.text).toBe('siti baru follow!')
    expect(share?.text).toBe('tono membagikan live ini!')
  })

  it('mengabaikan komentar biasa', () => {
    const w = watcher([...DEFAULT_ALERTS])

    const message = createChatMessage({
      id: 'c1',
      kind: 'textMessageEvent',
      platform: 'tiktok',
      username: 'budi',
      text: 'a',
    })

    expect(w.onMessage(message)).toBeNull()
  })

  it('memberi id yang berbeda pada tiap pelepasan', () => {
    const w = watcher(rules({ kind: 'gift', threshold: 1 }))

    expect(w.onMessage(gift(5))?.id).not.toBe(w.onMessage(gift(5))?.id)
  })

  it('membawa avatar pengirim supaya banner bisa menampilkannya', () => {
    const w = watcher(rules({ kind: 'gift', threshold: 1 }))
    const message = createChatMessage({
      id: 'g2',
      kind: 'giftEvent',
      platform: 'tiktok',
      username: 'budi',
      avatarUrl: 'https://x/y.png',
      giftName: 'Rose',
      giftCount: 1,
      giftCoins: 5,
    })

    expect(w.onMessage(message)?.avatarUrl).toBe('https://x/y.png')
  })
})

describe('fillTemplate', () => {
  it('mengganti kedua placeholder, berapa kali pun muncul', () => {
    expect(fillTemplate('{user} → {value} ({user})', 'budi', '10')).toBe('budi → 10 (budi)')
  })
})
