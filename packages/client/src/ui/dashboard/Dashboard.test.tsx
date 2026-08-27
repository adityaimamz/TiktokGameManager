// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dashboard } from './Dashboard.js'

afterEach(cleanup)

describe('Dashboard', () => {
  it('renders the three independently scrolling columns', () => {
    render(<Dashboard />)

    expect(screen.getByTestId('column-control')).toBeTruthy()
    expect(screen.getByTestId('column-monitor')).toBeTruthy()
    expect(screen.getByTestId('column-chat')).toBeTruthy()
  })

  it('shows every operating panel the creator needs to run a stream', () => {
    render(<Dashboard />)

    for (const title of [
      'Koneksi TikTok',
      'Simulator testing',
      'Kendali sesi',
      'Statistik langsung',
      'Skor battle',
      'Aksi uji',
    ]) {
      expect(screen.getByText(title)).toBeTruthy()
    }
    // Komentar berbagi kartu dengan papan gift; judulnya kini sebuah tab.
    expect(screen.getByRole('button', { name: 'Komentar' })).toBeTruthy()
  })

  it('menaruh soundboard di kolom kanan dan alert di kolom kendali (Req 38 AC1)', () => {
    render(<Dashboard />)

    expect(screen.getByText('Soundboard')).toBeTruthy()
    expect(screen.getByText('STREAM SETTINGS')).toBeTruthy()
  })

  it('offers the overlay URL the creator pastes into OBS', () => {
    render(<Dashboard />)

    expect(screen.getByRole('button', { name: 'Salin URL overlay' })).toBeTruthy()
  })
})

describe('tombol ultimate', () => {
  it('menandai jenis nuke yang tersimpan setelah tombol ditekan', () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'Laser' }))
    expect(screen.getByRole('button', { name: 'Laser' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Bomb' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('tidak lagi memasang overlay ultimate palsu', () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'Bomb' }))
    expect(screen.queryByTestId('ultimate-overlay')).toBeNull()
  })
})
