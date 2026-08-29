import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import { createApp } from '../../src/app.js'
import type { ChatConnection } from '../../src/routes/chat.js'
import type { Repos } from '../../src/repo/types.js'

const silentConnection: ChatConnection = {
  status: idleStatus(),
  connect: async () => idleStatus(),
  disconnect: () => {},
}

const noopRepos: Omit<Repos, 'getDefaultConfig' | 'setDefaultConfig'> = {
  recordMatch: async () => ({ matchId: 1 }),
  recordProgress: async () => 0,
  recentMatches: async () => [],
  topPlayers: async () => [],
  recordAnalytics: async () => 0,
  saveGifts: async () => 0,
  allGifts: async () => [],
}

function fakeRepos(store: Map<string, unknown> = new Map()): Repos {
  return {
    ...noopRepos,
    getDefaultConfig: async (key) => store.get(key) ?? null,
    setDefaultConfig: async (key, value) => {
      store.set(key, value)
    },
  }
}

const appWith = (repos: Repos | null) =>
  createApp({ connection: silentConnection, gifts: { giftCatalog: [] }, repos })

describe('config routes', () => {
  it('menjawab 404 untuk kunci yang belum pernah ditulis', async () => {
    const response = await request(appWith(fakeRepos())).get('/api/config/battle-arena.config')
    // Bukan sekadar status: fallback 404 generik `/api` juga menjawab 404, dan tanpa memeriksa
    // body test ini bisa hijau tanpa route-nya pernah ada.
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not set' })
  })

  it('menulis lalu membaca nilai yang sama', async () => {
    const app = appWith(fakeRepos())
    const value = { gameplay: { baseHp: 777 } }

    const write = await request(app).post('/api/config/battle-arena.config').send({ value })
    expect(write.status).toBe(204)

    const read = await request(app).get('/api/config/battle-arena.config')
    expect(read.status).toBe(200)
    expect(read.body).toEqual({ value })
  })

  it('menimpa nilai yang sudah ada — sinkron terus-menerus, bukan salin sekali', async () => {
    const app = appWith(fakeRepos())

    await request(app).post('/api/config/battle-arena.config').send({ value: { n: 1 } })
    await request(app).post('/api/config/battle-arena.config').send({ value: { n: 2 } })

    const read = await request(app).get('/api/config/battle-arena.config')
    expect(read.body).toEqual({ value: { n: 2 } })
  })

  it('menolak POST tanpa field value', async () => {
    const response = await request(appWith(fakeRepos())).post('/api/config/battle-arena.config').send({})
    expect(response.status).toBe(400)
  })

  it('menjawab 503 untuk GET dan POST saat tidak ada database', async () => {
    expect((await request(appWith(null)).get('/api/config/battle-arena.config')).status).toBe(503)
    expect(
      (await request(appWith(null)).post('/api/config/battle-arena.config').send({ value: 1 })).status,
    ).toBe(503)
  })
})
