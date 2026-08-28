// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CatalogEntry } from '../../../../src/platform/signals/index.js'
import { Soundboard } from '../../../../src/ui/dashboard/sections/Soundboard.js'

afterEach(cleanup)

const sound: CatalogEntry = {
  id: 'sound-1',
  kind: 'sound',
  label: 'tepuk tangan',
  url: '/api/uploads/a.mp3',
  volume: 1,
}

/**
 * Mock dikembalikan terpisah dari props, bukan lewat objek yang di-spread.
 *
 * Objek yang di-spread membuat tipe tiap handler melebar jadi union dengan prop aslinya, dan
 * `.mock` lenyap dari tipenya — kegagalan typecheck, bukan kegagalan test.
 */
const panel = (over: Partial<Parameters<typeof Soundboard>[0]> = {}) => {
  const onCues = vi.fn<(next: CatalogEntry[]) => void>()
  const onFire = vi.fn<(entry: CatalogEntry) => void>()
  const onStopMusic = vi.fn<() => void>()
  const onMusicVolume = vi.fn<(volume: number) => void>()
  render(
    <Soundboard
      cues={[sound]}
      musicVolume={0.8}
      onCues={onCues}
      onFire={onFire}
      onMusicVolume={onMusicVolume}
      onStopMusic={onStopMusic}
      upload={async () => '/api/uploads/baru.mp3'}
      {...over}
    />,
  )
  return { onCues, onFire, onStopMusic, onMusicVolume }
}

const pickFile = (name: string, type: string): void => {
  const input = screen.getByTestId('soundboard-file') as HTMLInputElement
  const file = new File([new Uint8Array([1])], name, { type })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('Soundboard', () => {
  it('menembakkan cue yang diklik sekali, dengan entri katalognya', () => {
    const props = panel()

    act(() => screen.getByRole('button', { name: 'tepuk tangan' }).click())

    expect(props.onFire).toHaveBeenCalledTimes(1)
    expect(props.onFire).toHaveBeenCalledWith(sound)
  })

  it('menambahkan cue hasil unggahan dengan label dari nama berkasnya', async () => {
    const props = panel()

    await act(async () => {
      pickFile('sorak.mp3', 'audio/mpeg')
    })

    expect(props.onCues).toHaveBeenCalledTimes(1)
    const next = props.onCues.mock.calls[0]?.[0] ?? []
    expect(next).toHaveLength(2)
    expect(next[1]?.label).toBe('sorak')
    expect(next[1]?.url).toBe('/api/uploads/baru.mp3')
  })

  it('mempertahankan daftar lama saat unggahan gagal, dan mengatakannya', async () => {
    const props = panel({ upload: async () => null })

    await act(async () => {
      pickFile('sorak.mp3', 'audio/mpeg')
    })

    expect(props.onCues).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('gagal')
  })

  it('menghapus cue lewat tombolnya sendiri', () => {
    const props = panel()

    act(() => screen.getByRole('button', { name: 'Hapus tepuk tangan' }).click())

    expect(props.onCues).toHaveBeenCalledWith([])
  })

  it('menampilkan tab yang kosong sebagai ajakan, bukan sebagai ruang kosong', () => {
    panel({ cues: [] })

    expect(screen.getByTestId('soundboard-empty')).toBeTruthy()
  })

  it('hanya tab Music yang punya tombol stop', () => {
    const props = panel({ cues: [] })

    expect(screen.queryByRole('button', { name: 'Stop musik' })).toBeNull()
    act(() => screen.getByRole('button', { name: 'Music' }).click())
    act(() => screen.getByRole('button', { name: 'Stop musik' }).click())

    expect(props.onStopMusic).toHaveBeenCalledTimes(1)
  })

  it('menampilkan slider volume hanya di tab Music', () => {
    panel()

    expect(screen.queryByLabelText('Volume musik')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    expect(screen.getByLabelText('Volume musik')).toBeDefined()
  })

  it('meneruskan nilai slider apa adanya', () => {
    const props = panel()

    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    fireEvent.change(screen.getByLabelText('Volume musik'), { target: { value: '0.3' } })

    expect(props.onMusicVolume).toHaveBeenCalledWith(0.3)
  })
})
