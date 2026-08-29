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

const track = (n: number): CatalogEntry => ({
  id: `music-${n}`,
  kind: 'music',
  label: `trek ${n}`,
  url: `/api/uploads/m${n}.mp3`,
  volume: 1,
})

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
      playingMusicId={null}
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

  it('hanya tab Music yang punya pemutar', () => {
    const props = panel({ cues: [sound, track(1)], playingMusicId: 'music-1' })

    expect(screen.queryByTestId('music-toggle')).toBeNull()
    act(() => screen.getByRole('button', { name: 'Music' }).click())
    act(() => screen.getByTestId('music-toggle').click())

    expect(props.onStopMusic).toHaveBeenCalledTimes(1)
  })

  it('menyembunyikan pemutar selama belum ada satu pun trek', () => {
    // Slider yang tidak mengatur apa pun dan tombol yang tidak menghentikan apa pun adalah
    // dua kontrol yang berbohong; keduanya baru muncul begitu ada yang bisa diputar.
    panel({ cues: [sound] })

    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    expect(screen.queryByTestId('music-toggle')).toBeNull()
    expect(screen.queryByLabelText('Volume musik')).toBeNull()
  })

  it('menampilkan slider volume hanya di tab Music', () => {
    panel({ cues: [sound, track(1)] })

    expect(screen.queryByLabelText('Volume musik')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    expect(screen.getByLabelText('Volume musik')).toBeDefined()
  })

  it('menyebut trek yang sedang berputar, dan memutar trek pertama saat sunyi', () => {
    const props = panel({ cues: [track(1), track(2)], playingMusicId: null })

    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    expect(screen.getByTestId('music-now-playing').textContent).toContain('Tidak ada')
    act(() => screen.getByTestId('music-toggle').click())

    expect(props.onFire).toHaveBeenCalledWith(track(1))
  })

  it('melingkar di ujung daftar: ⏭ dari trek terakhir kembali ke yang pertama', () => {
    const props = panel({ cues: [track(1), track(2)], playingMusicId: 'music-2' })

    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    act(() => screen.getByTestId('music-next').click())

    expect(props.onFire).toHaveBeenCalledWith(track(1))
  })

  it('mematikan ⏮/⏭ saat trek musiknya cuma satu', () => {
    // Melingkar ke diri sendiri akan MEMULAI ULANG trek dari nol — kanal musik tidak
    // men-cache elemennya — jadi tombol mati lebih jujur daripada yang diam-diam mengulang.
    panel({ cues: [track(1)], playingMusicId: 'music-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    expect((screen.getByTestId('music-prev') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('music-next') as HTMLButtonElement).disabled).toBe(true)
  })

  it('meneruskan nilai slider apa adanya', () => {
    const props = panel({ cues: [sound, track(1)] })

    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
    fireEvent.change(screen.getByLabelText('Volume musik'), { target: { value: '0.3' } })

    expect(props.onMusicVolume).toHaveBeenCalledWith(0.3)
  })
})
