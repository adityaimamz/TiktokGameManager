import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { uploadRoutes } from '../../src/routes/uploads.js'

async function appWithUploads(): Promise<{ app: express.Express; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'lga-uploads-'))
  const app = express()
  app.use('/api/uploads', uploadRoutes(dir))
  return { app, dir }
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

describe('uploadRoutes', () => {
  it('menyimpan gambar dan mengembalikan url yang bisa diambil kembali', async () => {
    const { app } = await appWithUploads()

    const posted = await request(app).post('/api/uploads').set('content-type', 'image/png').send(PNG)

    expect(posted.status).toBe(201)
    expect(posted.body.url).toMatch(/^\/api\/uploads\/[a-f0-9]{16}\.png$/)

    const fetched = await request(app).get(posted.body.url).buffer(true)
    expect(fetched.status).toBe(200)
    expect(fetched.headers['content-type']).toContain('image/png')
  })

  it('menolak tipe berkas yang tidak diizinkan', async () => {
    const { app } = await appWithUploads()

    const response = await request(app)
      .post('/api/uploads')
      .set('content-type', 'application/pdf')
      .send(Buffer.from('%PDF-'))

    expect(response.status).toBe(400)
  })

  it('menyimpan gif dan mengembalikannya sebagai image/gif', async () => {
    const { app } = await appWithUploads()
    const GIF = Buffer.from('4749463839614001', 'hex')

    const posted = await request(app).post('/api/uploads').set('content-type', 'image/gif').send(GIF)

    expect(posted.status).toBe(201)
    expect(posted.body.url).toMatch(/^\/api\/uploads\/[a-f0-9]{16}\.gif$/)

    const fetched = await request(app).get(posted.body.url).buffer(true)
    expect(fetched.status).toBe(200)
    expect(fetched.headers['content-type']).toContain('image/gif')
  })

  it('menyimpan mp3 — soundboard mengunggah bunyi lewat route yang sama', async () => {
    const { app } = await appWithUploads()
    const MP3 = Buffer.from('494433030000000000', 'hex')

    const posted = await request(app)
      .post('/api/uploads')
      .set('content-type', 'audio/mpeg')
      .send(MP3)

    expect(posted.status).toBe(201)
    expect(posted.body.url).toMatch(/^\/api\/uploads\/[a-f0-9]{16}\.mp3$/)

    const fetched = await request(app).get(posted.body.url).buffer(true)
    expect(fetched.status).toBe(200)
    expect(fetched.headers['content-type']).toContain('audio/mpeg')
  })

  it('menolak badan kosong', async () => {
    const { app } = await appWithUploads()

    const response = await request(app)
      .post('/api/uploads')
      .set('content-type', 'image/png')
      .send(Buffer.alloc(0))

    expect(response.status).toBe(400)
  })

  it('tidak pernah memakai nama berkas kiriman klien', async () => {
    const { app, dir } = await appWithUploads()

    await request(app)
      .post('/api/uploads')
      .set('content-type', 'image/png')
      .set('x-filename', '../../etc/passwd')
      .send(PNG)

    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^[a-f0-9]{16}\.png$/)
  })

  it('menolak nama yang tidak lolos regex penjaga, termasuk upaya path traversal', async () => {
    const { app } = await appWithUploads()

    expect((await request(app).get('/api/uploads/..%2F..%2Fpackage.json')).status).toBe(404)
    expect((await request(app).get('/api/uploads/tebakan.png')).status).toBe(404)
  })

  it('menjawab 404 untuk berkas yang namanya sah tapi tidak ada', async () => {
    const { app } = await appWithUploads()

    const response = await request(app).get('/api/uploads/0123456789abcdef.png')

    expect(response.status).toBe(404)
  })
})

describe('uploadRoutes — video', () => {
  it('menyimpan mp4 dan mengembalikannya sebagai video/mp4', async () => {
    const { app } = await appWithUploads()
    const MP4 = Buffer.from('00000018667479706d703432', 'hex')

    const posted = await request(app).post('/api/uploads').set('content-type', 'video/mp4').send(MP4)

    expect(posted.status).toBe(201)
    expect(posted.body.url).toMatch(/^\/api\/uploads\/[a-f0-9]{16}\.mp4$/)

    const fetched = await request(app).get(posted.body.url).buffer(true)
    expect(fetched.status).toBe(200)
    expect(fetched.headers['content-type']).toContain('video/mp4')
  })

  it('menyimpan webm dan mengembalikannya sebagai video/webm', async () => {
    const { app } = await appWithUploads()
    const WEBM = Buffer.from('1a45dfa3', 'hex')

    const posted = await request(app)
      .post('/api/uploads')
      .set('content-type', 'video/webm')
      .send(WEBM)

    expect(posted.status).toBe(201)

    const fetched = await request(app).get(posted.body.url).buffer(true)
    expect(fetched.headers['content-type']).toContain('video/webm')
  })

  it('menolak nama berkas yang mencoba keluar dari direktori unggahan', async () => {
    const { app } = await appWithUploads()

    const response = await request(app).get('/api/uploads/..%2F..%2Fetc%2Fpasswd')

    expect(response.status).toBe(404)
  })
})
