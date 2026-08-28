import { describe, expect, it } from 'vitest'
import { DEFAULT_READER } from '../../../src/platform/speech/index.js'
import type { ReaderSettings } from '../../../src/platform/speech/index.js'
import { SPEECH_PENDING_MAX, createSpeechAdapter } from '../../../src/ui/speech/voices.js'
import type { SpeakOptions, SpeechEngine } from '../../../src/ui/speech/voices.js'

const settings: ReaderSettings = { ...DEFAULT_READER, enabled: true, voiceUri: 'v1', rate: 1.4 }

/** Mesin palsu: mencatat apa yang diucapkan dan menahan `done` sampai test memanggilnya. */
const fakeEngine = () => {
  const spoken: { text: string; options: SpeakOptions }[] = []
  const dones: (() => void)[] = []
  const state = { cancels: 0, listener: null as (() => void) | null }

  const engine: SpeechEngine = {
    voices: () => [{ uri: 'v1', label: 'Andika · id-ID' }],
    onVoicesChanged: (fn) => {
      state.listener = fn
      return () => {
        state.listener = null
      }
    },
    speak: (text, options, done) => {
      spoken.push({ text, options })
      dones.push(done)
    },
    cancel: () => {
      state.cancels += 1
    },
  }

  return { engine, spoken, dones, state }
}

const request = (id: string) => ({ id, text: `ucapan ${id}` })

describe('createSpeechAdapter', () => {
  it('meneruskan voice, kecepatan, dan volume apa adanya', () => {
    const fake = fakeEngine()
    createSpeechAdapter(fake.engine).speak(request('a'), settings)

    expect(fake.spoken[0]?.text).toBe('ucapan a')
    expect(fake.spoken[0]?.options).toEqual({ voiceUri: 'v1', rate: 1.4, volume: 1 })
  })

  it('membuang ucapan keempat saat tiga masih tertunda, lalu membuka slotnya lagi', () => {
    const fake = fakeEngine()
    const adapter = createSpeechAdapter(fake.engine)

    // `speechSynthesis` mengantre TANPA batas; tanpa plafon ini satu badai chat berarti
    // reader masih membacakan komentar dari tiga menit lalu.
    for (const id of ['a', 'b', 'c', 'd']) adapter.speak(request(id), settings)
    expect(fake.spoken).toHaveLength(SPEECH_PENDING_MAX)

    fake.dones[0]?.()
    adapter.speak(request('e'), settings)

    expect(fake.spoken.map((entry) => entry.text)).toEqual([
      'ucapan a',
      'ucapan b',
      'ucapan c',
      'ucapan e',
    ])
  })

  it('mengosongkan hitungan saat dibatalkan, dan mengabaikan done yang terlambat', () => {
    const fake = fakeEngine()
    const adapter = createSpeechAdapter(fake.engine)

    adapter.speak(request('a'), settings)
    adapter.cancel()
    // Pembatalan di browser sungguhan memicu onend milik ucapan yang tadi dipotong. Tanpa
    // penjaga generasi, done yang telat ini membuka slot keempat.
    fake.dones[0]?.()
    for (const id of ['b', 'c', 'd', 'e']) adapter.speak(request(id), settings)

    expect(fake.state.cancels).toBe(1)
    expect(fake.spoken).toHaveLength(1 + SPEECH_PENDING_MAX)
  })

  it('meneruskan daftar voice dan pemberitahuan voiceschanged', () => {
    const fake = fakeEngine()
    const adapter = createSpeechAdapter(fake.engine)
    let notified = 0

    const off = adapter.onVoicesChanged(() => {
      notified += 1
    })
    fake.state.listener?.()
    off()

    expect(adapter.voices()).toEqual([{ uri: 'v1', label: 'Andika · id-ID' }])
    expect(notified).toBe(1)
    expect(fake.state.listener).toBeNull()
  })
})
