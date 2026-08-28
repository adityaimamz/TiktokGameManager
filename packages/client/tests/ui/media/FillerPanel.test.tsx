// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { FillerConfig } from '../../../src/games/battle-arena/config/index.js'
import { computeStageLayout } from '../../../src/games/battle-arena/renderer/layout.js'
import { FillerPanel } from '../../../src/ui/media/FillerPanel.js'

afterEach(cleanup)

const layout = computeStageLayout(1080, 1920, 'portrait')

const filler = (over: Partial<FillerConfig> = {}): FillerConfig => ({
  ...defaultConfig().filler,
  enabled: true,
  ...over,
})

describe('FillerPanel', () => {
  it('tidak menggambar apa pun saat panel dimatikan', () => {
    render(
      <FillerPanel
        filler={filler({ enabled: false, items: [{ url: '/a.mp4', kind: 'video' }] })}
        layout={layout}
      />,
    )

    expect(screen.queryByTestId('filler-panel')).toBeNull()
  })

  it('tidak menggambar apa pun saat daftarnya kosong', () => {
    render(<FillerPanel filler={filler({ items: [] })} layout={layout} />)

    expect(screen.queryByTestId('filler-panel')).toBeNull()
  })

  it('mengurung dirinya ke band bawah', () => {
    render(
      <FillerPanel filler={filler({ items: [{ url: '/a.mp4', kind: 'video' }] })} layout={layout} />,
    )

    const panel = screen.getByTestId('filler-panel')
    expect(panel.style.top).toBe(`${layout.bottom.y}px`)
    expect(panel.style.height).toBe(`${layout.bottom.height}px`)
    expect(panel.style.overflow).toBe('hidden')
  })

  it('memutar video bisu tanpa kendali', () => {
    render(
      <FillerPanel filler={filler({ items: [{ url: '/a.mp4', kind: 'video' }] })} layout={layout} />,
    )

    const video = screen.getByTestId('filler-video') as HTMLVideoElement
    expect(video.muted).toBe(true)
    expect(video.hasAttribute('controls')).toBe(false)
  })

  it('me-loop sendiri saat hanya ada satu item', () => {
    render(
      <FillerPanel filler={filler({ items: [{ url: '/a.mp4', kind: 'video' }] })} layout={layout} />,
    )

    expect((screen.getByTestId('filler-video') as HTMLVideoElement).loop).toBe(true)
  })

  it('maju ke item berikutnya saat video selesai', () => {
    render(
      <FillerPanel
        filler={filler({
          items: [
            { url: '/a.mp4', kind: 'video' },
            { url: '/b.png', kind: 'image' },
          ],
        })}
        layout={layout}
      />,
    )

    fireEvent.ended(screen.getByTestId('filler-video'))

    expect(screen.getByTestId('filler-image').getAttribute('src')).toBe('/b.png')
  })

  it('maju ke item berikutnya saat satu item gagal dimuat', () => {
    render(
      <FillerPanel
        filler={filler({
          items: [
            { url: '/mati.mp4', kind: 'video' },
            { url: '/b.png', kind: 'image' },
          ],
        })}
        layout={layout}
      />,
    )

    fireEvent.error(screen.getByTestId('filler-video'))

    expect(screen.getByTestId('filler-image').getAttribute('src')).toBe('/b.png')
  })

  it('berhenti mencoba setelah sepanjang daftar gagal berturut-turut', () => {
    render(
      <FillerPanel
        filler={filler({
          items: [
            { url: '/mati1.png', kind: 'image' },
            { url: '/mati2.png', kind: 'image' },
          ],
        })}
        layout={layout}
      />,
    )

    fireEvent.error(screen.getByTestId('filler-image'))
    fireEvent.error(screen.getByTestId('filler-image'))

    expect(screen.queryByTestId('filler-panel')).toBeNull()
  })

  it('me-reset hitungan gagal setelah satu pemutaran berhasil', () => {
    render(
      <FillerPanel
        filler={filler({
          items: [
            { url: '/mati.png', kind: 'image' },
            { url: '/hidup.png', kind: 'image' },
          ],
        })}
        layout={layout}
      />,
    )

    fireEvent.error(screen.getByTestId('filler-image'))
    fireEvent.load(screen.getByTestId('filler-image'))
    fireEvent.error(screen.getByTestId('filler-image'))

    // Gagal pertama sudah dilupakan, jadi yang kedua hanya memajukan, tidak mematikan panel.
    expect(screen.getByTestId('filler-panel')).toBeDefined()
  })

  it('mengganti gambar setelah imageDurationSec berlalu', () => {
    vi.useFakeTimers()
    try {
      render(
        <FillerPanel
          filler={filler({
            imageDurationSec: 5,
            items: [
              { url: '/a.png', kind: 'image' },
              { url: '/b.png', kind: 'image' },
            ],
          })}
          layout={layout}
        />,
      )

      expect(screen.getByTestId('filler-image').getAttribute('src')).toBe('/a.png')
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.getByTestId('filler-image').getAttribute('src')).toBe('/b.png')
    } finally {
      vi.useRealTimers()
    }
  })
})
