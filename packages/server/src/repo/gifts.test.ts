import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { allGifts, saveGifts } from './gifts.js'
import { describeDb, freshDb, truncateAll } from './testing.js'

describeDb('gifts repo', () => {
  let db: Db

  beforeAll(() => {
    db = freshDb()
  })

  beforeEach(async () => {
    await truncateAll(db)
  })

  afterAll(async () => {
    await truncateAll(db)
  })

  it('menyimpan katalog room berikut ikonnya, termurah lebih dulu', async () => {
    await saveGifts(db, [
      { id: 9, name: 'Lion', coins: 29999, iconUrl: 'https://cdn/lion.png' },
      { id: 1, name: 'Rose', coins: 1, iconUrl: 'https://cdn/rose.png' },
    ])

    expect(await allGifts(db)).toEqual([
      { id: 1, name: 'Rose', coins: 1, iconUrl: 'https://cdn/rose.png' },
      { id: 9, name: 'Lion', coins: 29999, iconUrl: 'https://cdn/lion.png' },
    ])
  })

  it('tidak pernah menghapus ikon yang sudah tersimpan dengan sebuah null', async () => {
    await saveGifts(db, [{ id: 1, name: 'Rose', coins: 1, iconUrl: 'https://cdn/rose.png' }])
    await saveGifts(db, [{ id: null, name: 'Rose', coins: 1, iconUrl: null }])

    expect(await allGifts(db)).toEqual([
      { id: 1, name: 'Rose', coins: 1, iconUrl: 'https://cdn/rose.png' },
    ])
  })

  it('menelan nama kembar dalam satu batch, bukan menggagalkan seluruh katalog', async () => {
    // `gift/list/` sungguhan mengirim nama yang sama lebih dari sekali. Satu
    // `INSERT … ON CONFLICT` atas batch itu ditolak Postgres dengan 21000 — dan karena
    // pemanggilnya menelan error, SELURUH katalog hilang tanpa jejak di dashboard.
    await saveGifts(db, [
      { id: 5655, name: 'Rose', coins: 1, iconUrl: null },
      { id: 5656, name: 'Rose', coins: 1, iconUrl: 'https://cdn/rose.png' },
    ])

    expect(await allGifts(db)).toEqual([
      { id: 5656, name: 'Rose', coins: 1, iconUrl: 'https://cdn/rose.png' },
    ])
  })
})
