import { describe, expect, it } from 'vitest'
import { READER_BLOCKED_WORDS_MAX } from '../../../../src/platform/speech/index.js'
import type { SpeechVoiceOption } from '../../../../src/ui/speech/voices.js'
import { VOICE_DEFAULT, addBlockedWord, readerStatus, voiceChoices } from '../../../../src/ui/dashboard/sections/comment-reader-view.js'

const voices: SpeechVoiceOption[] = [
  { uri: 'id-1', label: 'Andika · id-ID' },
  { uri: 'en-1', label: 'Aria · en-US' },
]

describe('voiceChoices', () => {
  it('selalu menawarkan voice bawaan lebih dulu', () => {
    expect(voiceChoices([], null)).toEqual([{ value: VOICE_DEFAULT, label: 'Suara bawaan browser' }])
  })

  it('menyusul daftar voice yang benar-benar ada', () => {
    expect(voiceChoices(voices, 'id-1').map((choice) => choice.value)).toEqual([
      VOICE_DEFAULT,
      'id-1',
      'en-1',
    ])
  })

  it('menyebut voice tersimpan yang sudah hilang alih-alih menyembunyikannya', () => {
    // Creator berganti mesin, atau mencabut voice pack. Reader jatuh ke bawaan; dropdown
    // harus mengatakan kenapa suaranya berubah.
    const choices = voiceChoices(voices, 'sudah-dicabut')

    expect(choices[choices.length - 1]).toEqual({
      value: 'sudah-dicabut',
      label: 'Voice tidak tersedia',
    })
  })
})

describe('readerStatus', () => {
  it('menyebut mati, tanpa voice, dan jumlah voice', () => {
    expect(readerStatus(false, 2)).toBe('Mati')
    expect(readerStatus(true, 0)).toBe('Tidak ada voice')
    expect(readerStatus(true, 2)).toBe('2 voice')
  })
})

describe('addBlockedWord', () => {
  it('memangkas, mengecilkan, dan menolak kata kosong', () => {
    expect(addBlockedWord([], '  BaBi ')).toEqual(['babi'])
    expect(addBlockedWord(['babi'], '   ')).toEqual(['babi'])
  })

  it('menolak kata yang sudah ada, tanpa memindahkannya', () => {
    expect(addBlockedWord(['babi', 'anjing'], 'BABI')).toEqual(['babi', 'anjing'])
  })

  it('berhenti di batas daftar', () => {
    const full = Array.from({ length: READER_BLOCKED_WORDS_MAX }, (_, index) => `kata${index}`)

    expect(addBlockedWord(full, 'satu lagi')).toHaveLength(READER_BLOCKED_WORDS_MAX)
  })
})
