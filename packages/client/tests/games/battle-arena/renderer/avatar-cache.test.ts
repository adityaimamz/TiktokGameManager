import { describe, expect, it, vi } from 'vitest'
import { AvatarCache, initialFor } from '../../../../src/games/battle-arena/renderer/avatar-cache.js'

const fakeBitmap = (tag = 'b'): ImageBitmap => ({ tag, close: () => {} }) as unknown as ImageBitmap

/** Loader yang penyelesaiannya dikendalikan test. */
const deferredLoader = () => {
  const resolvers: ((bitmap: ImageBitmap) => void)[] = []
  const rejecters: ((error: unknown) => void)[] = []
  const load = vi.fn(
    (_url: string) =>
      new Promise<ImageBitmap>((resolve, reject) => {
        resolvers.push(resolve)
        rejecters.push(reject)
      }),
  )
  return { load, resolvers, rejecters }
}

describe('initialFor', () => {
  it('takes the first letter, upper-cased', () => {
    expect(initialFor('andi')).toBe('A')
    expect(initialFor('  budi')).toBe('B')
    expect(initialFor('9lives')).toBe('9')
  })

  it('falls back to a question mark when there is no letter or digit', () => {
    expect(initialFor('')).toBe('?')
    expect(initialFor('***')).toBe('?')
  })
})

describe('AvatarCache', () => {
  it('answers immediately with an initial while the bitmap is still loading', () => {
    const { load } = deferredLoader()
    const cache = new AvatarCache({ load })

    expect(cache.get('https://x.test/a.png', 'andi')).toEqual({ kind: 'initial', letter: 'A' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.pendingCount).toBe(1)
  })

  it('serves the bitmap once it has arrived', async () => {
    const { load, resolvers } = deferredLoader()
    const cache = new AvatarCache({ load })
    cache.get('https://x.test/a.png', 'andi')

    resolvers[0]?.(fakeBitmap())
    await Promise.resolve()

    expect(cache.get('https://x.test/a.png', 'andi').kind).toBe('bitmap')
    expect(cache.pendingCount).toBe(0)
  })

  it('loads each URL exactly once, however many frames ask for it', () => {
    const { load } = deferredLoader()
    const cache = new AvatarCache({ load })

    for (let frame = 0; frame < 60; frame++) cache.get('https://x.test/a.png', 'andi')

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('never retries a URL that failed', async () => {
    const { load, rejecters } = deferredLoader()
    const onError = vi.fn()
    const cache = new AvatarCache({ load, onError })
    cache.get('https://x.test/a.png', 'andi')

    rejecters[0]?.(new Error('404'))
    await Promise.resolve()
    await Promise.resolve()

    expect(cache.get('https://x.test/a.png', 'andi')).toEqual({ kind: 'initial', letter: 'A' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('does not even try when the URL is null or blank', () => {
    const { load } = deferredLoader()
    const cache = new AvatarCache({ load })

    expect(cache.get(null, 'andi')).toEqual({ kind: 'initial', letter: 'A' })
    expect(cache.get('   ', 'budi')).toEqual({ kind: 'initial', letter: 'B' })
    expect(load).not.toHaveBeenCalled()
  })

  it('evicts the least recently used entry and closes its bitmap', async () => {
    const { load, resolvers } = deferredLoader()
    const closed: string[] = []
    const bitmapNamed = (tag: string): ImageBitmap =>
      ({ close: () => closed.push(tag) }) as unknown as ImageBitmap
    const cache = new AvatarCache({ load, maxEntries: 2 })

    cache.get('a', 'andi')
    cache.get('b', 'budi')
    resolvers[0]?.(bitmapNamed('a'))
    resolvers[1]?.(bitmapNamed('b'))
    await Promise.resolve()

    cache.get('a', 'andi') // 'a' jadi yang terbaru dipakai
    cache.get('c', 'cinta')

    expect(cache.size).toBe(2)
    expect(closed).toEqual(['b'])
  })

  it('drops everything on clear', async () => {
    const { load, resolvers } = deferredLoader()
    const cache = new AvatarCache({ load })
    cache.get('a', 'andi')
    resolvers[0]?.(fakeBitmap())
    await Promise.resolve()

    cache.clear()

    expect(cache.size).toBe(0)
  })
})
