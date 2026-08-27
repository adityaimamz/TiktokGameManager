import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { GIFT_SEED } from '@lga/shared'
import type { GiftCatalogEntry } from '@lga/shared'
import { giftRoutes } from './gifts.js'

const appWith = (giftCatalog: readonly GiftCatalogEntry[]) => {
  const app = express()
  app.use(
    '/api/gifts',
    giftRoutes({
      get giftCatalog() {
        return [...giftCatalog]
      },
    }),
  )
  return app
}

describe('giftRoutes', () => {
  it('menjawab seed saat katalog masih kosong', async () => {
    const response = await request(appWith([])).get('/api/gifts')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(GIFT_SEED)
  })

  it('menjawab katalog room begitu ada', async () => {
    const room = [{ id: 1, name: 'Room Gift', coins: 7, iconUrl: null }]
    const response = await request(appWith(room)).get('/api/gifts')

    expect(response.body).toEqual(room)
  })
})

describe('katalog tersimpan', () => {
  const stored = [{ id: 5, name: 'Rose', coins: 1, iconUrl: 'https://cdn/rose.png' }]

  it('menjawab katalog database saat tidak ada koneksi', async () => {
    const app = express()
    app.use('/api/gifts', giftRoutes({ giftCatalog: [] }, async () => stored))

    const response = await request(app).get('/api/gifts')

    expect(response.body).toEqual(stored)
  })

  it('mempertahankan ikon tersimpan saat entri hidup datang tanpa gambar', async () => {
    const live = [{ id: 5, name: 'rose', coins: 2, iconUrl: null }]
    const app = express()
    app.use('/api/gifts', giftRoutes({ giftCatalog: live }, async () => stored))

    const response = await request(app).get('/api/gifts')

    expect(response.body).toEqual([{ id: 5, name: 'rose', coins: 2, iconUrl: 'https://cdn/rose.png' }])
  })

  it('jatuh ke katalog hidup saat database gagal dibaca', async () => {
    const live = [{ id: 1, name: 'Room Gift', coins: 7, iconUrl: null }]
    const app = express()
    app.use(
      '/api/gifts',
      giftRoutes({ giftCatalog: live }, async () => {
        throw new Error('no database')
      }),
    )

    const response = await request(app).get('/api/gifts')

    expect(response.body).toEqual(live)
  })
})
