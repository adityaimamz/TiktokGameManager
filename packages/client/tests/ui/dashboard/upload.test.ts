import { describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_BYTES } from '@lga/shared'
import { setUploadErrorHandler, uploadFile } from '../../../src/ui/dashboard/upload.js'

const file = (): File =>
  new File([new Uint8Array([1, 2, 3])], 'apa-saja.png', { type: 'image/png' })

describe('uploadFile', () => {
  it('mengirim berkas mentah dengan content-type miliknya dan mengembalikan url', async () => {
    // Argumen dibaca dari spy, bukan dari variabel yang ditulis di dalam callback: TypeScript
    // mempersempit variabel semacam itu ke `null` karena ia tidak tahu callback-nya berjalan.
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: '/api/uploads/abc.png' }),
    }))
    const url = await uploadFile(file(), fetchImpl as unknown as typeof fetch)

    expect(url).toBe('/api/uploads/abc.png')
    const [input, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(input).toBe('/api/uploads')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('image/png')
  })

  it('mengembalikan null saat server menolak, bukan melempar', async () => {
    const url = await uploadFile(file(), (async () => ({
      ok: false,
      json: async () => ({ error: 'nope' }),
    })) as unknown as typeof fetch)

    expect(url).toBeNull()
  })

  it('menolak berkas kebesaran TANPA mengunggahnya sama sekali', async () => {
    // Yang dibeli penjaga ini bukan pesan galat: ia menghemat belasan menit unggahan yang
    // sudah pasti dijawab 413.
    const fetchImpl = vi.fn()
    const big = new File([], 'film.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })

    const url = await uploadFile(big, fetchImpl as unknown as typeof fetch)

    expect(url).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('mengembalikan null saat jaringan mati', async () => {
    const url = await uploadFile(file(), (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch)

    expect(url).toBeNull()
  })
})

describe('setUploadErrorHandler', () => {
  it('memberi tahu handler saat server menolak', async () => {
    const seen: string[] = []
    setUploadErrorHandler((message) => seen.push(message))

    await uploadFile(
      file(),
      (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
    )

    setUploadErrorHandler(null)
    expect(seen).toHaveLength(1)
  })

  it('menyebut UKURAN saat berkasnya kebesaran, bukan kalimat umum', async () => {
    const seen: string[] = []
    setUploadErrorHandler((message) => seen.push(message))
    const big = new File([], 'film.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })

    await uploadFile(big, (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch)

    setUploadErrorHandler(null)
    expect(seen[0]).toContain('50 MB')
  })

  it('menyebut UKURAN saat server menjawab 413', async () => {
    const seen: string[] = []
    setUploadErrorHandler((message) => seen.push(message))

    await uploadFile(
      file(),
      (async () => ({ ok: false, status: 413, json: async () => ({}) })) as unknown as typeof fetch,
    )

    setUploadErrorHandler(null)
    expect(seen[0]).toContain('50 MB')
  })

  it('diam saat unggahan berhasil', async () => {
    const seen: string[] = []
    setUploadErrorHandler((message) => seen.push(message))

    await uploadFile(
      file(),
      (async () => ({
        ok: true,
        json: async () => ({ url: '/api/uploads/a.png' }),
      })) as unknown as typeof fetch,
    )

    setUploadErrorHandler(null)
    expect(seen).toEqual([])
  })

  it('tetap mengembalikan null tanpa handler terpasang', async () => {
    setUploadErrorHandler(null)

    const url = await uploadFile(file(), (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch)

    expect(url).toBeNull()
  })
})
