import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import { GIFTERS_MAX, pushGifter, sinceLabel } from '../../../../src/ui/dashboard/sections/gifter-list.js'

const gift = (username: string, coins: number, count = 1, name = 'Rose', atMs = 1000) =>
  createChatMessage({
    id: `${username}-${atMs}`,
    kind: 'giftEvent',
    platform: 'tiktok',
    username,
    timestampMs: atMs,
    giftName: name,
    giftCount: count,
    giftCoins: coins,
  })

describe('pushGifter', () => {
  it('mengabaikan pesan yang bukan gift', () => {
    const message = createChatMessage({
      id: 'a',
      kind: 'textMessageEvent',
      platform: 'tiktok',
      username: 'andi',
      timestampMs: 1,
      text: 'halo',
    })
    expect(pushGifter([], message)).toHaveLength(0)
  })

  it('mencatat gifter pertama', () => {
    const [entry] = pushGifter([], gift('andi', 100, 2, 'Galaxy'))
    expect(entry).toMatchObject({
      username: 'andi',
      coins: 100,
      lastGiftName: 'Galaxy',
      lastGiftCount: 2,
      synthetic: false,
    })
  })

  it('menumpuk koin orang yang sama, bukan menambah baris', () => {
    let list = pushGifter([], gift('andi', 100))
    list = pushGifter(list, gift('andi', 50, 1, 'Rose', 2000))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ coins: 150, lastGiftAtMs: 2000 })
  })

  it('mengurutkan koin menurun', () => {
    let list = pushGifter([], gift('andi', 100))
    list = pushGifter(list, gift('budi', 900))
    expect(list.map((entry) => entry.username)).toEqual(['budi', 'andi'])
  })

  // Tanpa pemutus seri, dua gifter berimbang akan bertukar tempat tiap render.
  it('memutus seri dengan gift terbaru di atas', () => {
    let list = pushGifter([], gift('andi', 100, 1, 'Rose', 1000))
    list = pushGifter(list, gift('budi', 100, 1, 'Rose', 2000))
    expect(list.map((entry) => entry.username)).toEqual(['budi', 'andi'])
  })

  it('menandai viewer sintetis (Req 38 AC13)', () => {
    const message = createChatMessage({
      id: 'sim-1',
      kind: 'giftEvent',
      platform: 'demo',
      username: 'sim',
      timestampMs: 1,
      giftName: 'Rose',
      giftCount: 1,
      giftCoins: 1,
    })
    expect(pushGifter([], message)[0]?.synthetic).toBe(true)
  })

  it('memangkas di GIFTERS_MAX', () => {
    let list: ReturnType<typeof pushGifter> = []
    for (let i = 0; i < GIFTERS_MAX + 10; i++) list = pushGifter(list, gift(`v${i}`, i + 1))
    expect(list).toHaveLength(GIFTERS_MAX)
    // Yang dipangkas adalah yang paling sedikit menyumbang.
    expect(list.map((entry) => entry.username)).not.toContain('v0')
  })
})

describe('sinceLabel', () => {
  it('menyebut baru saja di bawah satu menit', () => {
    expect(sinceLabel(59_000, 60_000)).toBe('baru saja')
  })

  it('menyebut menit', () => {
    expect(sinceLabel(0, 5 * 60_000)).toBe('5 mnt')
  })

  it('menyebut jam', () => {
    expect(sinceLabel(0, 2 * 3_600_000)).toBe('2 jam')
  })
})
