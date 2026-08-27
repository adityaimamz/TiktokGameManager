import { describe, expect, it } from 'vitest'
import { GIFT_SEED } from './gift.js'

describe('GIFT_SEED', () => {
  it('memberi sepuluh gift dengan nilai koin menaik', () => {
    expect(GIFT_SEED).toHaveLength(10)
    const coins = GIFT_SEED.map((g) => g.coins)
    expect([...coins].sort((a, b) => a - b)).toEqual(coins)
  })

  it('tidak mengarang id yang bisa bertabrakan dengan katalog room', () => {
    expect(GIFT_SEED.every((g) => g.id === null)).toBe(true)
  })

  it('memakai nama yang unik', () => {
    expect(new Set(GIFT_SEED.map((g) => g.name)).size).toBe(GIFT_SEED.length)
  })
})
