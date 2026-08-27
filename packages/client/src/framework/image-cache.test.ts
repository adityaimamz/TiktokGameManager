import { describe, expect, it } from 'vitest'
import { createImageCache } from './image-cache.js'
import type { ImageLike } from './image-cache.js'

const ready = (): ImageLike => ({ complete: true, naturalWidth: 10 })
const loading = (): ImageLike => ({ complete: false, naturalWidth: 0 })

describe('createImageCache', () => {
  it('memuat sebuah url tepat sekali, berapa pun frame yang memintanya', () => {
    let loads = 0
    const image = createImageCache(() => {
      loads++
      return ready()
    })

    image('/api/uploads/a.png')
    image('/api/uploads/a.png')
    image('/api/uploads/a.png')

    expect(loads).toBe(1)
  })

  it('mengembalikan null selama gambar belum siap — frame tidak pernah menunggu', () => {
    const image = createImageCache(loading)
    expect(image('/api/uploads/a.png')).toBeNull()
  })

  it('mengembalikan gambar begitu siap', () => {
    const image = createImageCache(ready)
    expect(image('/api/uploads/a.png')).not.toBeNull()
  })

  it('memisahkan url yang berbeda', () => {
    const seen: string[] = []
    const image = createImageCache((url) => {
      seen.push(url)
      return ready()
    })

    image('/a.png')
    image('/b.png')

    expect(seen).toEqual(['/a.png', '/b.png'])
  })
})
