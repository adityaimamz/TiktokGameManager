import { describe, expect, it } from 'vitest'
import {
  ALL_TARGET,
  createBattleAction,
  fighterTarget,
  parseTarget,
  sideTarget,
  targetFromKind,
} from '../../../src/games/battle-arena/actions.js'
import type { ActorIdentity } from '../../../src/games/battle-arena/types.js'

const actor: ActorIdentity = { platform: 'tiktok', username: 'andi', avatarUrl: null }

describe('target strings', () => {
  it('round-trips a fighter target', () => {
    expect(parseTarget(fighterTarget(actor))).toEqual({ kind: 'fighter', key: 'tiktok:andi' })
  })

  it('round-trips a side target', () => {
    expect(parseTarget(sideTarget('b'))).toEqual({ kind: 'side', side: 'b' })
  })

  it('round-trips the all target', () => {
    expect(parseTarget('all')).toEqual({ kind: 'all' })
  })

  it('reports an unrecognised target instead of throwing', () => {
    expect(parseTarget('nonsense')).toEqual({ kind: 'unknown' })
    expect(parseTarget('side:z')).toEqual({ kind: 'unknown' })
  })
})

describe('targetFromKind', () => {
  it('maps sender to the actor own fighter', () => {
    expect(targetFromKind('sender', actor)).toBe('fighter:tiktok:andi')
  })

  it('maps each side kind to its side target', () => {
    expect(targetFromKind('sideA', actor)).toBe('side:a')
    expect(targetFromKind('sideB', actor)).toBe('side:b')
  })

  it('maps all to the all target', () => {
    expect(targetFromKind('all', actor)).toBe('all')
  })

  it('falls back to the all target when sender is asked for without an actor', () => {
    expect(targetFromKind('sender', null)).toBe('all')
  })
})

describe('target relatif', () => {
  it('menyandikan kunci aktor ke dalam string target', () => {
    expect(targetFromKind('enemySide', actor)).toBe('enemySide:tiktok:andi')
    expect(targetFromKind('ownSide', actor)).toBe('ownSide:tiktok:andi')
    expect(targetFromKind('randomAlly', actor)).toBe('randomAlly:tiktok:andi')
    expect(targetFromKind('randomEnemy', actor)).toBe('randomEnemy:tiktok:andi')
  })

  // Tanpa aktor tidak ada sisi yang bisa dihitung relatif terhadap apa pun; jatuh ke 'all'
  // mengikuti perilaku 'sender' yang sudah ada.
  it('jatuh ke ALL_TARGET tanpa aktor', () => {
    expect(targetFromKind('enemySide', null)).toBe(ALL_TARGET)
  })

  it('membaca kembali scope dan kunci', () => {
    expect(parseTarget('enemySide:tiktok:andi')).toEqual({
      kind: 'relative',
      scope: 'enemySide',
      key: 'tiktok:andi',
    })
  })

  // Kunci fighter memuat titik dua; pemisahan HARUS pada titik dua pertama saja.
  it('mempertahankan titik dua di dalam kunci', () => {
    expect(parseTarget('randomEnemy:tiktok:budi:x')).toEqual({
      kind: 'relative',
      scope: 'randomEnemy',
      key: 'tiktok:budi:x',
    })
  })

  it('tetap membaca target lama tanpa berubah', () => {
    expect(parseTarget('side:a')).toEqual({ kind: 'side', side: 'a' })
    expect(parseTarget('fighter:tiktok:andi')).toEqual({ kind: 'fighter', key: 'tiktok:andi' })
    expect(parseTarget('all')).toEqual({ kind: 'all' })
    expect(parseTarget('ownSide')).toEqual({ kind: 'unknown' })
  })
})

describe('createBattleAction', () => {
  it('defaults value, duration and actor', () => {
    const a = createBattleAction({ type: 'damage', target: 'side:a' })
    expect(a.value).toBe(0)
    expect(a.duration).toBe(0)
    expect(a.actor).toBeNull()
  })

  it('keeps the values the caller provided', () => {
    const a = createBattleAction({ type: 'grow', target: fighterTarget(actor), value: 3, duration: 250, actor })
    expect(a).toEqual({
      type: 'grow',
      target: 'fighter:tiktok:andi',
      value: 3,
      duration: 250,
      actor,
      ruleId: null,
      giftName: null,
      giftCoins: 0,
    })
  })
})

describe('createBattleAction and its origin fields', () => {
  it('defaults both origin fields to null so a pooled read never lies', () => {
    const action = createBattleAction({ type: 'heal', target: ALL_TARGET })

    expect(action.ruleId).toBeNull()
    expect(action.giftName).toBeNull()
  })

  it('carries the rule and gift it came from', () => {
    const action = createBattleAction({
      type: 'damage',
      target: ALL_TARGET,
      ruleId: 'gift-barrage',
      giftName: 'Rose',
    })

    expect(action.ruleId).toBe('gift-barrage')
    expect(action.giftName).toBe('Rose')
  })
})
