import type { ReaderSettings, SpeechRequest } from '../../platform/speech/index.js'

export interface SpeechVoiceOption {
  /** `voiceURI` — yang disimpan creator di setelan. */
  uri: string
  label: string
}

export interface SpeakOptions {
  voiceUri: string | null
  rate: number
  volume: number
}

/**
 * Mesin suara, tanpa satu pun keputusan di dalamnya.
 *
 * Ia ada supaya plafon antrean bisa diuji di node: yang menyentuh `speechSynthesis` hanya
 * `browserEngine`, dan isinya nol logika.
 */
export interface SpeechEngine {
  voices(): readonly SpeechVoiceOption[]
  onVoicesChanged(fn: () => void): () => void
  /** Memanggil `done` tepat sekali, saat selesai ATAU saat gagal. */
  speak(text: string, options: SpeakOptions, done: () => void): void
  cancel(): void
}

export interface SpeechAdapter {
  voices(): readonly SpeechVoiceOption[]
  onVoicesChanged(fn: () => void): () => void
  speak(request: SpeechRequest, settings: ReaderSettings): void
  cancel(): void
}

/** Tiga sudah lebih panjang dari yang mau didengarkan siapa pun. */
export const SPEECH_PENDING_MAX = 3

export function createSpeechAdapter(engine: SpeechEngine): SpeechAdapter {
  let pending = 0
  // Pembatalan memicu onend milik ucapan yang dipotong. Generasi membuat done yang telat itu
  // tidak bisa membuka slot untuk ucapan yang lahir setelah cancel.
  let generation = 0

  return {
    voices: () => engine.voices(),
    onVoicesChanged: (fn) => engine.onVoicesChanged(fn),
    speak(request, settings) {
      if (pending >= SPEECH_PENDING_MAX) return
      pending += 1
      const born = generation
      let settled = false
      engine.speak(
        request.text,
        { voiceUri: settings.voiceUri, rate: settings.rate, volume: settings.volume },
        () => {
          if (settled || born !== generation) return
          settled = true
          pending = Math.max(0, pending - 1)
        },
      )
    },
    cancel() {
      generation += 1
      pending = 0
      engine.cancel()
    },
  }
}

/** Browser tanpa `speechSynthesis` tetap menjalankan dashboard, hanya tanpa suara. */
export function silentEngine(): SpeechEngine {
  return {
    voices: () => [],
    onVoicesChanged: () => () => {},
    speak: (_text, _options, done) => done(),
    cancel: () => {},
  }
}

export function browserEngine(): SpeechEngine {
  const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis
  if (synth === undefined) return silentEngine()

  return {
    voices: () =>
      synth
        .getVoices()
        .map((voice) => ({ uri: voice.voiceURI, label: `${voice.name} · ${voice.lang}` })),
    onVoicesChanged(fn) {
      // Chrome memuat daftar voice secara asinkron: membacanya sekali saat mount
      // menghasilkan dropdown kosong yang tidak pernah terisi.
      synth.addEventListener('voiceschanged', fn)
      return () => synth.removeEventListener('voiceschanged', fn)
    },
    speak(text, options, done) {
      const utterance = new SpeechSynthesisUtterance(text)
      const voice = synth.getVoices().find((entry) => entry.voiceURI === options.voiceUri)
      // Voice yang sudah tidak ada jatuh ke bawaan browser, bukan membisukan reader.
      if (voice !== undefined) utterance.voice = voice
      utterance.rate = options.rate
      utterance.volume = options.volume
      utterance.onend = () => done()
      utterance.onerror = () => done()
      synth.speak(utterance)
    },
    cancel: () => synth.cancel(),
  }
}

export function browserSpeech(): SpeechAdapter {
  return createSpeechAdapter(browserEngine())
}
