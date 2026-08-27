import { READER_BLOCKED_WORDS_MAX, READER_WORD_MAX_LENGTH } from '../../../platform/speech/index.js'
import type { SpeechVoiceOption } from '../../speech/voices.js'

/** Nilai kosong = "pakai voice bawaan browser" — pola yang sama dengan cueId kosong di Alerts. */
export const VOICE_DEFAULT = ''

export interface VoiceChoice {
  value: string
  label: string
}

export function voiceChoices(
  voices: readonly SpeechVoiceOption[],
  selected: string | null,
): VoiceChoice[] {
  const choices: VoiceChoice[] = [{ value: VOICE_DEFAULT, label: 'Suara bawaan browser' }]
  for (const voice of voices) choices.push({ value: voice.uri, label: voice.label })

  // Voice tersimpan yang tidak ada lagi tetap ditampilkan: dropdown yang diam-diam melompat
  // ke bawaan membuat creator mengira setelannya tidak tersimpan.
  if (selected !== null && selected !== VOICE_DEFAULT && !voices.some((v) => v.uri === selected)) {
    choices.push({ value: selected, label: 'Voice tidak tersedia' })
  }

  return choices
}

export function readerStatus(enabled: boolean, voiceCount: number): string {
  if (!enabled) return 'Mati'
  if (voiceCount === 0) return 'Tidak ada voice'
  return `${voiceCount} voice`
}

export function addBlockedWord(words: readonly string[], raw: string): string[] {
  const word = raw.trim().toLowerCase().slice(0, READER_WORD_MAX_LENGTH)
  if (word === '' || words.includes(word) || words.length >= READER_BLOCKED_WORDS_MAX) {
    return [...words]
  }
  return [...words, word]
}
