import { describe, expect, it } from 'vitest'
import { LocalStore, ServerStore } from '../../../src/platform/persistence/index.js'
import { DEFAULT_ALERTS } from '../../../src/platform/signals/index.js'
import { DEFAULT_READER } from '../../../src/platform/speech/index.js'
import {
  MEDIA_KEY,
  createMediaPusher,
  loadMedia,
  normalizeMedia,
  pullMediaDefault,
  saveMedia,
} from '../../../src/ui/dashboard/media-store.js'

const memoryStore = () => {
  const map = new Map<string, string>()
  return new LocalStore({
    storage: {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
      removeItem: (key) => void map.delete(key),
    },
    debounceMs: 0,
    setTimer: (fn) => {
      fn()
      return 0
    },
    clearTimer: () => {},
  })
}

describe('normalizeMedia', () => {
  it('memberi katalog kosong dan keempat rule bawaan saat tidak ada apa-apa', () => {
    const state = normalizeMedia(null)

    expect(state.cues).toEqual([])
    expect(state.alerts.map((rule) => rule.kind)).toEqual(['gift', 'likes', 'follow', 'share'])
  })

  it('membuang entri katalog yang rusak dan mempertahankan yang sehat', () => {
    const state = normalizeMedia({
      cues: [
        { id: 'a', kind: 'sound', label: 'tepuk', url: '/a.mp3', volume: 0.5 },
        { id: 'b', kind: 'bukan-kind', label: 'x', url: '/b.mp3', volume: 1 },
        { id: 'c', label: 'tanpa kind', url: '/c.mp3', volume: 1 },
        'bukan objek',
      ],
      alerts: [],
    })

    expect(state.cues.map((cue) => cue.id)).toEqual(['a'])
  })

  it('menjepit volume ke 0–1 alih-alih membuang entrinya', () => {
    const state = normalizeMedia({
      cues: [{ id: 'a', kind: 'sound', label: 'x', url: '/a.mp3', volume: 9 }],
    })

    expect(state.cues[0]?.volume).toBe(1)
  })

  it('mengembalikan rule yang hilang ke bawaannya, dan mempertahankan yang tersimpan', () => {
    const state = normalizeMedia({
      alerts: [{ kind: 'gift', enabled: false, threshold: 42, cueId: null, text: 'halo' }],
    })

    expect(state.alerts[0]).toEqual({
      kind: 'gift',
      enabled: false,
      threshold: 42,
      cueId: null,
      text: 'halo',
    })
    expect(state.alerts[2]).toEqual(DEFAULT_ALERTS[2])
  })

  it('memperlakukan isi yang sama sekali salah bentuk seperti kosong', () => {
    expect(normalizeMedia('rusak').cues).toEqual([])
    expect(normalizeMedia(42).alerts).toHaveLength(4)
  })
})

describe('loadMedia/saveMedia', () => {
  it('round-trip lewat LocalStore', () => {
    const store = memoryStore()
    const cue = { id: 'a', kind: 'gif' as const, label: 'tepuk', url: '/a.gif', volume: 1 }

    saveMedia(store, {
      cues: [cue],
      alerts: [...DEFAULT_ALERTS],
      reader: DEFAULT_READER,
      musicVolume: 1,
    })
    store.flush()

    expect(loadMedia(store).cues).toEqual([cue])
  })

  it('kembali ke default saat kuncinya belum pernah ditulis', () => {
    expect(loadMedia(memoryStore()).cues).toEqual([])
    expect(MEDIA_KEY).toBe('media.soundboard')
  })
})

describe('normalizeMedia — setelan reader', () => {
  it('memberi setelan bawaan yang MATI saat tidak ada apa-apa', () => {
    const state = normalizeMedia(null)

    expect(state.reader.enabled).toBe(false)
    expect(state.reader.voiceUri).toBeNull()
    expect(state.reader.blockedWords).toEqual([])
  })

  it('menjepit angka di luar rentang alih-alih memakainya', () => {
    const state = normalizeMedia({
      reader: { enabled: true, voiceUri: 7, rate: 99, volume: -3, maxChars: 5000 },
    })

    expect(state.reader.enabled).toBe(true)
    expect(state.reader.voiceUri).toBeNull()
    expect(state.reader.rate).toBe(2)
    // Angka di luar rentang DIJEPIT ke tepinya; yang bukan angka sama sekali baru jatuh ke bawaan.
    expect(state.reader.volume).toBe(0)
    expect(normalizeMedia({ reader: { volume: 'keras' } }).reader.volume).toBe(1)
    expect(state.reader.maxChars).toBe(300)
  })

  it('merapikan kata terlarang: dipangkas, dikecilkan, yang bukan string dibuang', () => {
    const state = normalizeMedia({ reader: { blockedWords: ['  BaBi ', 42, '', 'anjing'] } })

    expect(state.reader.blockedWords).toEqual(['babi', 'anjing'])
  })

  it('mempertahankan katalog cue lama saat reader belum pernah tersimpan', () => {
    const state = normalizeMedia({
      cues: [{ id: 'sound-1', kind: 'sound', label: 'sorak', url: '/a.mp3', volume: 1 }],
    })

    expect(state.cues).toHaveLength(1)
    expect(state.reader).toEqual({
      enabled: false,
      voiceUri: null,
      rate: 1,
      volume: 1,
      maxChars: 120,
      blockedWords: [],
    })
  })

  it('round-trip lewat store menyimpan setelan reader', () => {
    const store = memoryStore()
    const state = normalizeMedia(null)

    saveMedia(store, { ...state, reader: { ...state.reader, enabled: true, rate: 1.5 } })
    store.flush()

    const loaded = loadMedia(store)

    expect(loaded.reader.enabled).toBe(true)
    expect(loaded.reader.rate).toBe(1.5)
  })
})

describe('normalizeMedia — musicVolume', () => {
  it('memberi bawaan 1 dan menjepitnya ke 0-1', () => {
    expect(normalizeMedia({}).musicVolume).toBe(1)
    expect(normalizeMedia({ musicVolume: 0.35 }).musicVolume).toBe(0.35)
    expect(normalizeMedia({ musicVolume: 4 }).musicVolume).toBe(1)
    expect(normalizeMedia({ musicVolume: -2 }).musicVolume).toBe(0)
    expect(normalizeMedia({ musicVolume: 'keras' }).musicVolume).toBe(1)
  })
})

describe('pullMediaDefault', () => {
  it('mengadopsi default server dan menormalkannya lewat normalizeMedia — menang meski device sudah punya media sendiri', async () => {
    const store = memoryStore()
    saveMedia(store, normalizeMedia(null))
    store.flush()
    const shared = { ...normalizeMedia(null), musicVolume: 0.4 }
    const server = new ServerStore({
      fetch: async () => new Response(JSON.stringify({ value: shared }), { status: 200 }),
    })
    let inherited = -1

    await pullMediaDefault(store, server, (media) => {
      inherited = media.musicVolume
    })

    expect(inherited).toBe(0.4)
    expect(loadMedia(store).musicVolume).toBe(0.4)
  })
})

describe('createMediaPusher', () => {
  it('mengirim media yang di-push ke /api/config/media.soundboard', async () => {
    const calls: string[] = []
    const server = new ServerStore({
      fetch: async (input) => {
        calls.push(String(input))
        return new Response(null, { status: 204 })
      },
    })
    const pusher = createMediaPusher(server)

    pusher.push(normalizeMedia(null))
    await pusher.flush()

    expect(calls).toEqual([`/api/config/${MEDIA_KEY}`])
  })
})

describe('teks alert warisan', () => {
  it('menukar teks Indonesia lama yang belum pernah disentuh creator', () => {
    const state = normalizeMedia({
      alerts: [
        { kind: 'follow', enabled: true, threshold: 0, cueId: null, text: '{user} baru follow!' },
      ],
    })

    expect(state.alerts.find((rule) => rule.kind === 'follow')?.text).toBe('{user} just followed!')
  })

  it('tidak menyentuh teks yang sudah ditulis creator sendiri', () => {
    const state = normalizeMedia({
      alerts: [
        { kind: 'follow', enabled: true, threshold: 0, cueId: null, text: 'makasih {user}!' },
      ],
    })

    expect(state.alerts.find((rule) => rule.kind === 'follow')?.text).toBe('makasih {user}!')
  })

  it('mempertahankan sisa setelan rule yang ditukar teksnya', () => {
    const state = normalizeMedia({
      alerts: [
        { kind: 'gift', enabled: false, threshold: 9_000, cueId: 'c1', text: '{user} mengirim {value}!' },
      ],
    })
    const gift = state.alerts.find((rule) => rule.kind === 'gift')

    expect(gift).toMatchObject({ enabled: false, threshold: 9_000, cueId: 'c1', text: '{user} sent {value}!' })
  })
})
