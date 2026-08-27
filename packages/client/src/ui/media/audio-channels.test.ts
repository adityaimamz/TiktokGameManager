import { describe, expect, it } from 'vitest'
import type { MediaCue } from '../../platform/signals/index.js'
import { createAudioChannels } from './audio-channels.js'
import type { AudioLike } from './audio-channels.js'

const cue = (over: Partial<MediaCue>): MediaCue => ({
  id: 'c1',
  kind: 'sound',
  url: '/a.mp3',
  volume: 0.5,
  text: '',
  avatarUrl: null,
  ...over,
})

/** Pemutar palsu berbasis pencacah, bukan vi.fn: elemennya harus tetap bertipe AudioLike. */
const spyFactory = () => {
  const made: {
    url: string
    played: number
    paused: number
    volume: number
    loop: boolean
    currentTime: number
    loaded: number
  }[] = []
  const create = (url: string): AudioLike => {
    const entry = { url, played: 0, paused: 0, volume: 1, loop: false, currentTime: 9, loaded: 0 }
    made.push(entry)
    return {
      get volume() {
        return entry.volume
      },
      set volume(value: number) {
        entry.volume = value
      },
      get loop() {
        return entry.loop
      },
      set loop(value: boolean) {
        entry.loop = value
      },
      get currentTime() {
        return entry.currentTime
      },
      set currentTime(value: number) {
        entry.currentTime = value
      },
      play: () => void (entry.played += 1),
      pause: () => void (entry.paused += 1),
      load: () => void (entry.loaded += 1),
    }
  }
  return { create, made }
}

describe('createAudioChannels', () => {
  it('memutar bunyi dengan volume cue-nya', () => {
    const factory = spyFactory()
    createAudioChannels(factory.create).play(cue({ volume: 0.5 }))

    expect(factory.made[0]?.url).toBe('/a.mp3')
    expect(factory.made[0]?.volume).toBe(0.5)
    expect(factory.made[0]?.played).toBe(1)
  })

  it('memutar musik berulang dan mengganti trek yang sedang berbunyi', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.play(cue({ kind: 'music', url: '/satu.mp3' }))
    channels.play(cue({ kind: 'music', url: '/dua.mp3' }))

    expect(factory.made[0]?.loop).toBe(true)
    expect(factory.made[0]?.paused).toBe(1)
    expect(factory.made[1]?.url).toBe('/dua.mp3')
  })

  it('menghentikan musik saat cue-nya datang tanpa url', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.play(cue({ kind: 'music', url: '/satu.mp3' }))
    channels.play(cue({ kind: 'music', url: null }))

    expect(factory.made[0]?.paused).toBe(1)
    expect(factory.made).toHaveLength(1)
  })

  it('tidak memutar apa pun untuk GIF', () => {
    const factory = spyFactory()
    createAudioChannels(factory.create).play(cue({ kind: 'gif', url: '/a.gif' }))

    expect(factory.made).toHaveLength(0)
  })

  it('menelan penolakan autoplay alih-alih melempar', async () => {
    const create = (): AudioLike => ({
      volume: 1,
      loop: false,
      currentTime: 0,
      play: async () => {
        throw new Error('NotAllowedError')
      },
      pause: () => {},
      load: () => {},
    })

    expect(() => createAudioChannels(create).play(cue({}))).not.toThrow()
    await Promise.resolve()
  })

  it('memakai ulang satu elemen per url dan memutarnya dari awal', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.play(cue({ url: '/boom.ogg' }))
    channels.play(cue({ id: 'c2', url: '/boom.ogg' }))

    expect(factory.made).toHaveLength(1)
    expect(factory.made[0]?.played).toBe(2)
    expect(factory.made[0]?.currentTime).toBe(0)
  })

  it('memberi tiap url elemennya sendiri', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.play(cue({ url: '/a.ogg' }))
    channels.play(cue({ id: 'c2', url: '/b.ogg' }))

    expect(factory.made.map((m) => m.url)).toEqual(['/a.ogg', '/b.ogg'])
  })

  it('memanaskan url di muka tanpa membunyikannya', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.warm(['/a.ogg', '/b.ogg'])

    expect(factory.made.map((m) => m.url)).toEqual(['/a.ogg', '/b.ogg'])
    expect(factory.made[0]?.played).toBe(0)
    expect(factory.made[0]?.loaded).toBe(1)
  })

  it('tidak membuat elemen kedua untuk url yang sudah dipanaskan', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.warm(['/a.ogg'])
    channels.play(cue({ url: '/a.ogg' }))

    expect(factory.made).toHaveLength(1)
    expect(factory.made[0]?.played).toBe(1)
  })
})

describe('createAudioChannels — volume musik', () => {
  it('menggeser volume trek yang sedang berputar tanpa melahirkan elemen baru', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.play(cue({ kind: 'music', url: '/lagu.mp3', volume: 0.8 }))
    const before = factory.made.length
    channels.play(cue({ id: 'c2', kind: 'music', url: '/lagu.mp3', volume: 0.2 }))

    expect(factory.made).toHaveLength(before)
    expect(factory.made[before - 1]?.volume).toBe(0.2)
    expect(factory.made[before - 1]?.paused).toBe(0)
  })

  it('mengganti trek saat url musiknya berbeda', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.play(cue({ kind: 'music', url: '/satu.mp3', volume: 0.8 }))
    channels.play(cue({ id: 'c2', kind: 'music', url: '/dua.mp3', volume: 0.8 }))

    expect(factory.made).toHaveLength(2)
    expect(factory.made[0]?.paused).toBe(1)
    expect(factory.made[1]?.url).toBe('/dua.mp3')
  })

  it('melupakan trek setelah dihentikan, jadi url yang sama diputar dari awal', () => {
    const factory = spyFactory()
    const channels = createAudioChannels(factory.create)

    channels.play(cue({ kind: 'music', url: '/lagu.mp3', volume: 0.8 }))
    channels.play(cue({ id: 'c2', kind: 'music', url: null, volume: 0 }))
    channels.play(cue({ id: 'c3', kind: 'music', url: '/lagu.mp3', volume: 0.5 }))

    expect(factory.made).toHaveLength(2)
  })
})
