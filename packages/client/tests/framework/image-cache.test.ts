import { describe, expect, it } from 'vitest'
import { createImageCache } from '../../src/framework/image-cache.js'
import type { ImageLike, ScaleTarget } from '../../src/framework/image-cache.js'

const ready = (): ImageLike => ({ complete: true, naturalWidth: 10 })
const loading = (): ImageLike => ({ complete: false, naturalWidth: 0 })

/**
 * Target skala palsu.
 *
 * Berkas ini berjalan di environment node — `document` tidak ada — jadi target canvas-nya
 * diinjeksi, persis seperti `load` sudah diinjeksi sejak dulu.
 */
const fakeTarget = () => {
  const drawn: unknown[][] = []
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement
  const ctx = {
    imageSmoothingQuality: 'low' as ImageSmoothingQuality,
    drawImage: (...args: unknown[]) => drawn.push(args),
  } as unknown as CanvasRenderingContext2D
  return { target: { canvas, ctx } satisfies ScaleTarget, drawn, canvas, ctx }
}

describe('createImageCache', () => {
  it('memuat sebuah url tepat sekali, berapa pun frame yang memintanya', () => {
    let loads = 0
    const image = createImageCache(() => {
      loads++
      return ready()
    })

    image('/api/uploads/a.png', 10, 10)
    image('/api/uploads/a.png', 10, 10)
    image('/api/uploads/a.png', 10, 10)

    expect(loads).toBe(1)
  })

  it('mengembalikan null selama gambar belum siap — frame tidak pernah menunggu', () => {
    const image = createImageCache(loading)
    expect(image('/api/uploads/a.png', 10, 10)).toBeNull()
  })

  it('mengembalikan gambar begitu siap', () => {
    const image = createImageCache(ready)
    expect(image('/api/uploads/a.png', 10, 10)).not.toBeNull()
  })

  it('memisahkan url yang berbeda', () => {
    const seen: string[] = []
    const image = createImageCache((url) => {
      seen.push(url)
      return ready()
    })

    image('/a.png', 10, 10)
    image('/b.png', 10, 10)

    expect(seen).toEqual(['/a.png', '/b.png'])
  })
})

/**
 * Penskalaan terjadi SEKALI per ukuran, bukan tiap frame.
 *
 * Sebelum ini cache menyimpan gambar pada resolusi aslinya, dan `drawImage(img, x, y, w, h)`
 * di renderer meresample foto 4000×3000 enam puluh kali per detik — sampai tiga kali per
 * frame, karena arena dan kedua sisi masing-masing punya latarnya sendiri.
 */
describe('createImageCache — salinan berskala', () => {
  it('menskalakan sekali untuk ukuran yang sama, berapa pun frame yang memintanya', () => {
    const t = fakeTarget()
    const image = createImageCache(ready, () => t.target)

    image('/a.png', 400, 300)
    image('/a.png', 400, 300)
    image('/a.png', 400, 300)

    expect(t.drawn).toHaveLength(1)
    expect(t.canvas.width).toBe(400)
    expect(t.canvas.height).toBe(300)
  })

  it('menskalakan ulang saat ukurannya berubah', () => {
    const t = fakeTarget()
    const image = createImageCache(ready, () => t.target)

    image('/a.png', 400, 300)
    image('/a.png', 800, 600)

    expect(t.drawn).toHaveLength(2)
    expect(t.canvas.width).toBe(800)
  })

  it('mengembalikan canvas berskala, bukan gambar aslinya', () => {
    const t = fakeTarget()
    const image = createImageCache(ready, () => t.target)

    expect(image('/a.png', 400, 300)).toBe(t.canvas)
  })

  it('menyetel imageSmoothingQuality SESUDAH mengubah ukuran canvas', () => {
    // Mengubah `canvas.width` MERESET seluruh state context-nya. Menyetel kualitas sebelum
    // resize berarti ia diam-diam kembali ke bawaan tepat sebelum satu-satunya drawImage
    // yang menentukan ketajaman latar.
    const t = fakeTarget()
    const image = createImageCache(ready, () => t.target)

    image('/a.png', 400, 300)

    expect(t.ctx.imageSmoothingQuality).toBe('high')
  })

  it('membuat target-nya sekali saja, bukan tiap ukuran baru', () => {
    let targets = 0
    const t = fakeTarget()
    const image = createImageCache(ready, () => {
      targets++
      return t.target
    })

    image('/a.png', 400, 300)
    image('/a.png', 800, 600)

    expect(targets).toBe(1)
  })

  it('jatuh ke gambar aslinya kalau tidak ada canvas — node, atau context yang ditolak', () => {
    const image = createImageCache(ready, () => null)
    expect(image('/a.png', 400, 300)).not.toBeNull()
  })

  it('membulatkan ukuran pecahan dan tidak pernah menerima nol', () => {
    const t = fakeTarget()
    const image = createImageCache(ready, () => t.target)

    image('/a.png', 400.4, 0)

    expect(t.canvas.width).toBe(400)
    expect(t.canvas.height).toBe(1)
  })
})
