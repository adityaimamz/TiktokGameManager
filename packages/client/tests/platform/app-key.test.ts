import { describe, expect, it } from 'vitest'
import { appKeyFromSearch, takeAppKey } from '../../src/platform/app-key.js'

function fakeStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed))
  return {
    items,
    storage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, value)
      },
    },
  }
}

describe('appKeyFromSearch', () => {
  it('membaca k dari query, dengan atau tanpa tanda tanya', () => {
    expect(appKeyFromSearch('?stage=1&k=rahasia')).toBe('rahasia')
    expect(appKeyFromSearch('k=rahasia')).toBe('rahasia')
  })

  it('mengembalikan null saat tidak ada kunci', () => {
    expect(appKeyFromSearch('?stage=1')).toBeNull()
    expect(appKeyFromSearch('?k=')).toBeNull()
    expect(appKeyFromSearch('')).toBeNull()
  })
})

describe('takeAppKey', () => {
  it('menyimpan kunci dari URL lalu menghapusnya dari URL', () => {
    const scrubbed: string[] = []
    const { items, storage } = fakeStorage()

    const key = takeAppKey({
      search: '?k=rahasia&tab=stats',
      storage,
      scrub: (s) => scrubbed.push(s),
    })

    expect(key).toBe('rahasia')
    expect(items.get('lga:app-key')).toBe('rahasia')
    expect(scrubbed).toEqual(['?tab=stats'])
  })

  it('membersihkan URL sampai kosong saat k satu-satunya query', () => {
    const scrubbed: string[] = []
    takeAppKey({
      search: '?k=rahasia',
      storage: fakeStorage().storage,
      scrub: (s) => scrubbed.push(s),
    })

    expect(scrubbed).toEqual([''])
  })

  it('memakai kunci yang tersimpan saat URL tidak membawanya, tanpa menyentuh URL', () => {
    const scrubbed: string[] = []
    const { storage } = fakeStorage({ 'lga:app-key': 'tersimpan' })

    const key = takeAppKey({ search: '?tab=stats', storage, scrub: (s) => scrubbed.push(s) })

    expect(key).toBe('tersimpan')
    expect(scrubbed).toEqual([])
  })

  it('mengembalikan null saat tidak ada kunci di mana pun, termasuk tanpa storage', () => {
    expect(takeAppKey({ search: '', storage: fakeStorage().storage })).toBeNull()
    expect(takeAppKey({ search: '', storage: null })).toBeNull()
  })

  it('kunci baru di URL menimpa yang tersimpan', () => {
    const { items, storage } = fakeStorage({ 'lga:app-key': 'lama' })

    expect(takeAppKey({ search: '?k=baru', storage })).toBe('baru')
    expect(items.get('lga:app-key')).toBe('baru')
  })
})
