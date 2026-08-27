import { describe, expect, it } from 'vitest'
import { AudioEngine } from './audio.js'
import type { AudioContextLike, GainLike, OscillatorLike } from './audio.js'

interface Fake {
  ctx: AudioContextLike
  gains: GainLike[]
  oscillators: OscillatorLike[]
  resumed: number
}

function fakeContext(): Fake {
  const gains: GainLike[] = []
  const oscillators: OscillatorLike[] = []
  const fake: Fake = {
    resumed: 0,
    gains,
    oscillators,
    ctx: {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      createGain: () => {
        const gain: GainLike = {
          gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
          connect: () => {},
          disconnect: () => {},
        }
        gains.push(gain)
        return gain
      },
      createOscillator: () => {
        const oscillator: OscillatorLike = {
          type: 'sine',
          frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {},
        }
        oscillators.push(oscillator)
        return oscillator
      },
      resume: async () => {
        fake.resumed++
      },
      close: async () => {},
    },
  }
  return fake
}

describe('AudioEngine', () => {
  it('membunyikan satu osilator per permintaan', () => {
    const fake = fakeContext()
    const audio = new AudioEngine({ createContext: () => fake.ctx })

    audio.play('hit', 0.8)

    expect(fake.oscillators).toHaveLength(1)
    expect(fake.oscillators[0]?.type).toBe('triangle')
  })

  it('tetap berbunyi untuk id yang tidak dikenal, bukan diam tanpa penjelasan', () => {
    const fake = fakeContext()
    const audio = new AudioEngine({ createContext: () => fake.ctx })

    audio.play('id-yang-tidak-ada-resepnya', 1)

    expect(fake.oscillators).toHaveLength(1)
  })

  it('mute menyetel gain master ke nol tanpa menghentikan permintaan berikutnya', () => {
    const fake = fakeContext()
    const audio = new AudioEngine({ createContext: () => fake.ctx })
    audio.play('hit', 1)

    audio.setMuted(true)
    const master = fake.gains[0]
    expect(master?.gain.value).toBe(0)

    audio.play('join', 1)
    expect(fake.oscillators).toHaveLength(2)

    audio.setMuted(false)
    expect(master?.gain.value).toBe(1)
  })

  it('meneruskan resume ke AudioContext', async () => {
    const fake = fakeContext()
    const audio = new AudioEngine({ createContext: () => fake.ctx })

    await audio.resume()

    expect(fake.resumed).toBe(1)
  })

  it('menjadi no-op senyap saat AudioContext tidak tersedia', async () => {
    const audio = new AudioEngine({ createContext: () => null })

    expect(() => audio.play('hit', 1)).not.toThrow()
    await expect(audio.resume()).resolves.toBeUndefined()
  })

  it('melaporkan durasi resep, dipakai SoundQueue untuk menghitung konkurensi', () => {
    const fake = fakeContext()
    const audio = new AudioEngine({ createContext: () => fake.ctx })

    expect(audio.durationMs('hit')).toBeGreaterThan(0)
    expect(audio.durationMs('matchWin')).toBeGreaterThan(audio.durationMs('hit'))
  })
})
