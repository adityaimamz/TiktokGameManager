// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_READER } from '../../../../src/platform/speech/index.js'
import type { ReaderSettings } from '../../../../src/platform/speech/index.js'
import type { SpeechVoiceOption } from '../../../../src/ui/speech/voices.js'
import { CommentReader } from '../../../../src/ui/dashboard/sections/CommentReader.js'

afterEach(cleanup)

const voices: SpeechVoiceOption[] = [{ uri: 'id-1', label: 'Andika · id-ID' }]

const panel = (reader: Partial<ReaderSettings> = {}, list: SpeechVoiceOption[] = voices) => {
  const onReader = vi.fn<(next: ReaderSettings) => void>()
  render(
    <CommentReader
      reader={{ ...DEFAULT_READER, enabled: true, ...reader }}
      voices={list}
      onReader={onReader}
    />,
  )
  return { onReader }
}

describe('CommentReader', () => {
  it('menyalakan reader lewat satu switch', () => {
    const props = panel({ enabled: false })

    act(() => screen.getByRole('switch', { name: 'Bacakan komentar' }).click())

    expect(props.onReader.mock.calls[0]?.[0].enabled).toBe(true)
  })

  it('mengembalikan null saat creator memilih suara bawaan', () => {
    const props = panel({ voiceUri: 'id-1' })

    fireEvent.change(screen.getByLabelText('Suara'), { target: { value: '' } })

    expect(props.onReader.mock.calls[0]?.[0].voiceUri).toBeNull()
  })

  it('menambahkan kata terlarang yang sudah dirapikan', () => {
    const props = panel()

    fireEvent.change(screen.getByLabelText('Kata terlarang'), { target: { value: '  BaBi ' } })
    act(() => screen.getByRole('button', { name: 'Tambah kata terlarang' }).click())

    expect(props.onReader.mock.calls[0]?.[0].blockedWords).toEqual(['babi'])
  })

  it('membuang kata terlarang yang diklik silangnya', () => {
    const props = panel({ blockedWords: ['babi', 'anjing'] })

    act(() => screen.getByRole('button', { name: 'Hapus kata babi' }).click())

    expect(props.onReader.mock.calls[0]?.[0].blockedWords).toEqual(['anjing'])
  })

  it('mengatakan apa adanya saat browser tidak punya satu pun voice', () => {
    panel({}, [])

    expect(screen.getByTestId('reader-no-voice')).toBeTruthy()
  })
})
