import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import { createApp } from './app.js'
import type { ChatConnection } from './routes/chat.js'

/** Koneksi yang tidak pernah dipakai — task ini hanya menguji kerangka app. */
const silentConnection: ChatConnection = {
  status: idleStatus(),
  connect: async () => idleStatus(),
  disconnect: () => {},
}

describe('createApp', () => {
  it('answers the health probe with the addresses other devices can reach', async () => {
    const response = await request(createApp({ connection: silentConnection, gifts: { giftCatalog: [] }, repos: null })).get(
      '/api/health',
    )
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(Array.isArray(response.body.lanUrls)).toBe(true)
  })

  it('answers 404 as JSON for unknown api routes', async () => {
    const response = await request(createApp({ connection: silentConnection, gifts: { giftCatalog: [] }, repos: null })).get(
      '/api/nope',
    )
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })


  it('answers preflight with the configured origin, and stays header-free without one', async () => {
    const withCors = createApp({
      connection: silentConnection,
      gifts: { giftCatalog: [] },
      repos: null,
      corsOrigin: 'https://arena.vercel.app',
    })
    const preflight = await request(withCors).options('/api/chat/connect')
    expect(preflight.status).toBe(204)
    expect(preflight.headers['access-control-allow-origin']).toBe('https://arena.vercel.app')

    const plain = createApp({ connection: silentConnection, gifts: { giftCatalog: [] }, repos: null })
    const response = await request(plain).get('/api/health')
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('serves the built client without shadowing the api 404', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lga-dist-'))
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>arena</title>')
    const app = createApp({
      connection: silentConnection,
      gifts: { giftCatalog: [] },
      repos: null,
      clientDist: dir,
    })

    const page = await request(app).get('/')
    expect(page.status).toBe(200)
    expect(page.text).toContain('arena')

    const missing = await request(app).get('/api/nope')
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: 'not found' })

    // Halaman overlay OBS. Tidak ada berkas di path ini; tanpa route-nya, siaran
    // creator menampilkan 404 Express, bukan arena.
    const overlay = await request(app).get('/overlay')
    expect(overlay.status).toBe(200)
    expect(overlay.text).toContain('arena')

    // Ruang kendali per game: alamat yang di-bookmark creator, dan juga tanpa berkas.
    const control = await request(app).get('/game/battle-arena')
    expect(control.status).toBe(200)
    expect(control.text).toContain('arena')

    // Dan hanya path itu: salah ketik tetap 404, bukan diam-diam memuat dashboard.
    expect((await request(app).get('/overlays')).status).toBe(404)
    expect((await request(app).get('/game')).status).toBe(404)
    expect((await request(app).get('/game/battle-arena/config')).status).toBe(404)
  })

  it('membiarkan /api terbuka saat APP_KEY tidak diset', async () => {
    const app = createApp({ connection: silentConnection, gifts: { giftCatalog: [] }, repos: null })

    expect((await request(app).get('/api/gifts')).status).not.toBe(401)
  })

  it('menolak /api tanpa kunci saat APP_KEY diset', async () => {
    const app = createApp({
      connection: silentConnection,
      gifts: { giftCatalog: [] },
      repos: null,
      appKey: 'rahasia',
    })

    const denied = await request(app).get('/api/gifts')
    expect(denied.status).toBe(401)
    expect(denied.body).toEqual({ error: 'unauthorized' })
  })

  it('menerima kunci lewat header maupun query', async () => {
    const app = createApp({
      connection: silentConnection,
      gifts: { giftCatalog: [] },
      repos: null,
      appKey: 'rahasia',
    })

    expect((await request(app).get('/api/gifts').set('x-app-key', 'rahasia')).status).toBe(200)
    expect((await request(app).get('/api/gifts?k=rahasia')).status).toBe(200)
  })

  it('membiarkan health probe terbuka meski kunci diset, karena host deploy memanggilnya tanpa kunci', async () => {
    const app = createApp({
      connection: silentConnection,
      gifts: { giftCatalog: [] },
      repos: null,
      appKey: 'rahasia',
    })

    expect((await request(app).get('/api/health')).status).toBe(200)
  })

  it('tetap menyajikan halaman statis tanpa kunci, supaya dashboard bisa meminta kunci', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lga-dist-'))
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>arena</title>')
    const app = createApp({
      connection: silentConnection,
      gifts: { giftCatalog: [] },
      repos: null,
      appKey: 'rahasia',
      clientDist: dir,
    })

    expect((await request(app).get('/index.html')).status).toBe(200)
  })
})
