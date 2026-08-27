// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { computeStageLayout } from '../../games/battle-arena/renderer/layout.js'
import { MediaLayer } from './MediaLayer.js'

afterEach(cleanup)

const layout = computeStageLayout(1600, 900, 'landscape')

describe('MediaLayer', () => {
  it('tidak menggambar apa pun tanpa banner', () => {
    render(<MediaLayer banner={null} layout={layout} />)

    expect(screen.queryByTestId('media-banner')).toBeNull()
  })

  it('menampilkan teks dan gambar banner', () => {
    render(
      <MediaLayer
        banner={{ id: 'a', text: 'budi mengirim Rose!', imageUrl: '/a.gif', avatarUrl: null }}
        layout={layout}
      />,
    )

    expect(screen.getByTestId('media-banner-text').textContent).toBe('budi mengirim Rose!')
    expect(screen.getByTestId('media-banner-image')).toBeTruthy()
  })

  it('menyembunyikan gambar yang gagal dimuat tanpa membuang teksnya', () => {
    render(
      <MediaLayer
        banner={{ id: 'a', text: 'terima kasih!', imageUrl: '/hilang.gif', avatarUrl: null }}
        layout={layout}
      />,
    )

    fireEvent.error(screen.getByTestId('media-banner-image'))

    expect(screen.queryByTestId('media-banner-image')).toBeNull()
    expect(screen.getByTestId('media-banner-text').textContent).toBe('terima kasih!')
  })

  it('dikurung ke zona arena, bukan ke seluruh panggung', () => {
    render(
      <MediaLayer
        banner={{ id: 'a', text: 'x', imageUrl: null, avatarUrl: null }}
        layout={layout}
      />,
    )

    // Band skor di atas dan action legend di bawah tidak boleh pernah tertutup.
    const banner = screen.getByTestId('media-banner')
    expect(Number.parseFloat(banner.style.top)).toBeGreaterThan(layout.arena.y)
    expect(Number.parseFloat(banner.style.left)).toBe(layout.arena.x)
  })
})
