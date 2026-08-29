// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { defaultConfig } from '../../../../src/games/battle-arena/config/index.js'
import { StageFiller } from '../../../../src/ui/dashboard/sections/StageFiller.js'

afterEach(cleanup)

const base = defaultConfig().filler

describe('StageFiller', () => {
  it('mengatakan daftarnya kosong sebelum ada item', () => {
    render(<StageFiller filler={base} onFiller={() => {}} />)

    expect(screen.getByTestId('filler-empty')).toBeDefined()
  })

  it('menambahkan item dari link dan menebak jenisnya dari ekstensi', () => {
    const onFiller = vi.fn()

    render(<StageFiller filler={base} onFiller={onFiller} />)
    fireEvent.change(screen.getByTestId('filler-link'), { target: { value: '/klip.mp4' } })
    fireEvent.click(screen.getByTestId('filler-link-add'))

    expect(onFiller).toHaveBeenCalledWith({
      ...base,
      items: [{ url: '/klip.mp4', kind: 'video' }],
    })
  })

  it('menebak gambar untuk URL yang bukan video', () => {
    const onFiller = vi.fn()

    render(<StageFiller filler={base} onFiller={onFiller} />)
    fireEvent.change(screen.getByTestId('filler-link'), {
      target: { value: 'https://x.test/a.png' },
    })
    fireEvent.click(screen.getByTestId('filler-link-add'))

    expect(onFiller.mock.calls[0]?.[0].items[0].kind).toBe('image')
  })

  it('menambahkan item hasil unggahan', async () => {
    const onFiller = vi.fn()
    const upload = vi.fn(async () => '/api/uploads/abc.mp4')

    render(<StageFiller filler={base} onFiller={onFiller} upload={upload} />)
    fireEvent.change(screen.getByTestId('filler-file'), {
      target: { files: [new File(['x'], 'klip.mp4', { type: 'video/mp4' })] },
    })

    await waitFor(() => expect(onFiller).toHaveBeenCalled())
    expect(onFiller.mock.calls[0]?.[0].items[0]).toStrictEqual({
      url: '/api/uploads/abc.mp4',
      kind: 'video',
    })
  })

  it('membuang satu item', () => {
    const onFiller = vi.fn()
    const filler = {
      ...base,
      items: [
        { url: '/a.mp4', kind: 'video' as const },
        { url: '/b.png', kind: 'image' as const },
      ],
    }

    render(<StageFiller filler={filler} onFiller={onFiller} />)
    fireEvent.click(screen.getByLabelText('Hapus /a.mp4'))

    expect(onFiller.mock.calls[0]?.[0].items).toStrictEqual([{ url: '/b.png', kind: 'image' }])
  })

  it('menutup jalan masuk item kesembilan, dan menunjukkan batasnya sebelum ditabrak', () => {
    // Batas yang baru muncul sebagai galat SESUDAH creator memilih berkas mengajarkannya
    // dengan cara paling mahal: pemilih berkas terbuka, satu klip dipilih, lalu ditolak.
    // Hitungan di kepala panel plus tombol mati mengatakannya sebelum itu terjadi.
    const onFiller = vi.fn()
    const filler = {
      ...base,
      items: Array.from({ length: 8 }, (_, i) => ({ url: `/x${i}.png`, kind: 'image' as const })),
    }

    render(<StageFiller filler={filler} onFiller={onFiller} />)
    fireEvent.change(screen.getByTestId('filler-link'), { target: { value: '/y.png' } })
    fireEvent.click(screen.getByTestId('filler-link-add'))

    expect(onFiller).not.toHaveBeenCalled()
    expect((screen.getByTestId('filler-link-add') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('filler-file') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByTestId('filler-count').textContent).toBe('8/8')
  })

  it('mengatakan link YouTube tidak bisa dipakai', () => {
    render(<StageFiller filler={base} onFiller={() => {}} />)

    expect(screen.getByTestId('filler-hint').textContent).toContain('YouTube')
  })
})
