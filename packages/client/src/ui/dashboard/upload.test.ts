import { describe, expect, it, vi } from 'vitest'
import { setUploadErrorHandler, uploadFile } from './upload.js'

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
