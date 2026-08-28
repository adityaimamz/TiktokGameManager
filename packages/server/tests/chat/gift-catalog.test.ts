import { describe, expect, it } from 'vitest'
import { readGiftCatalog, readGiftFromEvent } from '../../src/chat/gift-catalog.js'

describe('readGiftCatalog', () => {
  it('membaca bentuk { gifts: [...] } milik connector', () => {
    const entries = readGiftCatalog({
      gifts: [
        { id: 5655, name: 'Rose', diamond_count: 1, image: { url_list: ['https://x/rose.png'] } },
      ],
    })

    expect(entries).toEqual([{ id: 5655, name: 'Rose', coins: 1, iconUrl: 'https://x/rose.png' }])
  })

  it('menerima array telanjang', () => {
    const entries = readGiftCatalog([{ name: 'Galaxy', diamond_count: 1000 }])
    expect(entries).toEqual([{ id: null, name: 'Galaxy', coins: 1000, iconUrl: null }])
  })

  it('menerima penamaan camelCase', () => {
    expect(readGiftCatalog([{ name: 'Corgi', diamondCount: 299 }])[0]?.coins).toBe(299)
  })

  it('membuang entri tanpa nama', () => {
    expect(readGiftCatalog([{ diamond_count: 5 }, { name: '', diamond_count: 5 }])).toEqual([])
  })

  it('mengembalikan daftar kosong untuk payload yang tidak berbentuk', () => {
    for (const payload of [null, undefined, 42, 'gifts', {}]) {
      expect(readGiftCatalog(payload)).toEqual([])
    }
  })

  it('tidak melempar saat field bertipe salah', () => {
    const entries = readGiftCatalog([
      { id: 'abc', name: 'Rose', diamond_count: 'satu', image: { url_list: 'bukan array' } },
    ])
    expect(entries).toEqual([{ id: null, name: 'Rose', coins: 0, iconUrl: null }])
  })
})

describe('readGiftFromEvent', () => {
  /** Bentuk `gift` di dalam payload event — protobuf, jadi camelCase dan `urlList`. */
  const event = {
    giftId: '5655',
    repeatCount: 3,
    gift: {
      id: '5655',
      name: 'Heart Me',
      diamondCount: 1,
      image: { urlList: ['https://x/heart.png'] },
    },
  }

  it('membaca nama, koin SATUAN, dan ikon dari sebuah event gift', () => {
    // Koin SATUAN, bukan dikali repeatCount: katalog menjawab "berapa harga satu",
    // sementara `giftCoins` di ChatMessage menjawab "berapa yang barusan dikirim".
    expect(readGiftFromEvent(event)).toEqual({
      id: 5655,
      name: 'Heart Me',
      coins: 1,
      iconUrl: 'https://x/heart.png',
    })
  })

  it('menerima ikon di `icon` maupun penamaan snake_case', () => {
    expect(
      readGiftFromEvent({ gift: { name: 'Rose', icon: { url_list: ['https://x/r.png'] } } })
        ?.iconUrl,
    ).toBe('https://x/r.png')
  })

  it('mengembalikan null untuk apa pun yang tidak membawa nama gift', () => {
    for (const payload of [null, undefined, 42, {}, { gift: {} }, { gift: { name: '  ' } }]) {
      expect(readGiftFromEvent(payload)).toBeNull()
    }
  })
})
