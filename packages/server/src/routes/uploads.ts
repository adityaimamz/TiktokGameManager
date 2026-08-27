import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Router, raw } from 'express'
import { log } from '../log.js'

/** Tipe yang boleh diunggah, dan ekstensi yang server berikan untuk masing-masing. */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

/**
 * Penjaga nama berkas.
 *
 * Nama tidak pernah berasal dari klien — POST membangkitkannya — jadi regex ini menutup
 * satu-satunya celah yang tersisa: GET yang menebak nama. Path traversal jadi tidak mungkin
 * karena "../" tidak lolos pola ini sebelum menyentuh join().
 */
const SAFE_NAME = /^[a-f0-9]{16}\.(png|jpg|webp|gif|mp3|mp4|webm)$/

/**
 * Uji tulis sekali saat boot, dan alasannya kalau gagal.
 *
 * Ini yang menangkap kesalahan konfigurasi paling mahal di host cloud: `UPLOAD_DIR` yang
 * tidak menunjuk ke volume. Tanpa probe, gejalanya baru muncul berminggu-minggu kemudian
 * sebagai latar arena yang hilang sesudah redeploy — dengan config yang masih menunjuk ke
 * berkas yang sudah tidak ada, dan tanpa satu pun pesan kesalahan.
 *
 * Mengembalikan alasan, bukan melempar: pemanggilnya yang memutuskan seberapa keras
 * bereaksi, dan jawaban yang benar di sini adalah memperingatkan, bukan menjatuhkan siaran.
 */
export async function probeUploadDir(dir: string): Promise<string | null> {
  const probe = join(dir, '.write-probe')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(probe, '')
    await rm(probe)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function uploadRoutes(dir: string): Router {
  const router = Router()

  /*
   * 50mb, naik dari 10mb: satu klip filler jauh lebih besar daripada satu trek musik, yang
   * sendirinya sudah jauh lebih besar daripada satu latar arena. Angkanya diturunkan dari
   * kebutuhan — klip 20 detik pada 640x360 CRF 28 tanpa audio itu 1-2 MB — jadi 50 memberi
   * ruang untuk creator yang menempel 1080p apa adanya, tanpa membuka pintu untuk film.
   *
   * ponytail: express.raw() menahan seluruh berkas di memori; pindah ke stream ke disk kalau
   * 50mb terbukti menyakitkan.
   * ponytail: res.send(buffer) tidak melayani Range request, jadi video tidak bisa di-seek.
   * Panel filler hanya memutar dari awal sampai habis, jadi Range belum dibutuhkan.
   */
  router.post('/', raw({ type: Object.keys(EXTENSIONS), limit: '50mb' }), async (req, res) => {
    const contentType = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? ''
    const ext = EXTENSIONS[contentType]
    if (ext === undefined || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      // Daftarnya diturunkan dari EXTENSIONS, jadi pesannya tidak bisa basi lagi.
      res.status(400).json({ error: `expected one of: ${Object.keys(EXTENSIONS).join(', ')}` })
      return
    }

    const name = `${randomBytes(8).toString('hex')}.${ext}`
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, name), req.body)
    } catch (error) {
      log('error', 'could not store the upload', { err: error })
      res.status(500).json({ error: 'could not store the upload' })
      return
    }

    res.status(201).json({ url: `/api/uploads/${name}` })
  })

  router.get('/:name', async (req, res) => {
    const name = req.params.name
    if (!SAFE_NAME.test(name)) {
      res.status(404).json({ error: 'not found' })
      return
    }

    try {
      const bytes = await readFile(join(dir, name))
      res.type(CONTENT_TYPES[name.split('.')[1] ?? ''] ?? 'application/octet-stream')
      res.send(bytes)
    } catch {
      res.status(404).json({ error: 'not found' })
    }
  })

  return router
}
