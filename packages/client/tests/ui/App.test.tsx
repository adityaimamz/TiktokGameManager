// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App.js'

afterEach(() => {
  cleanup()
  // Navigasi menulis ke history jsdom yang dipakai bersama seluruh berkas ini.
  window.history.replaceState(null, '', '/')
})

/** Dashboard dimuat malas, jadi chunk-nya ditransformasi Vite saat assertion berjalan. */
const DASHBOARD = { timeout: 5000 }

describe('App', () => {
  it('renders the overlay stage on /overlay', () => {
    render(<App pathname="/overlay" search="" />)
    expect(screen.getByTestId('stage-page')).toBeTruthy()
    expect(screen.queryByTestId('column-control')).toBeNull()
  })

  it('renders the overlay stage for the legacy ?stage=1 address too', () => {
    render(<App search="?stage=1" />)
    expect(screen.getByTestId('stage-page')).toBeTruthy()
  })

  it('lands on the game catalogue at the root', async () => {
    render(<App pathname="/" search="" />)

    expect(await screen.findByTestId('lobby-page', {}, DASHBOARD)).toBeTruthy()
    expect(screen.queryByTestId('column-control')).toBeNull()
  })

  it('opens the control room of the game the path names', async () => {
    render(<App pathname="/game/battle-arena" search="" />)

    expect(await screen.findByTestId('column-control', {}, DASHBOARD)).toBeTruthy()
    expect(screen.queryByTestId('stage-page')).toBeNull()
  })

  /**
   * Alamat ruang kendali ikut tersalin dan ikut di-bookmark. Game yang salah ketik — atau
   * yang suatu hari dicabut dari registry — harus mendarat di katalog, bukan di layar putih
   * tanpa satu pun jalan keluar.
   */
  it('falls back to the catalogue for a game id the registry does not know', async () => {
    render(<App pathname="/game/tidak-ada" search="" />)

    expect(await screen.findByTestId('lobby-page', {}, DASHBOARD)).toBeTruthy()
  })

  it('navigates between catalogue and control room without reloading the page', async () => {
    render(<App pathname="/" search="" />)
    await screen.findByTestId('lobby-page', {}, DASHBOARD)

    await userEvent.click(screen.getByRole('button', { name: /Buka ruang kendali/ }))

    expect(await screen.findByTestId('column-control', {}, DASHBOARD)).toBeTruthy()
    expect(window.location.pathname).toBe('/game/battle-arena')

    await userEvent.click(screen.getByRole('button', { name: 'Semua game' }))

    // Meninggalkan ruang kendali membunuh match yang sedang berjalan, jadi ia bertanya dulu
    // (Plan 13 §8). Lobi hanya muncul setelah creator memilih.
    await userEvent.click(await screen.findByRole('button', { name: 'Tinggalkan' }))

    expect(await screen.findByTestId('lobby-page', {}, DASHBOARD)).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })

  /**
   * main.tsx membungkus App dalam StrictMode, yang di mode dev menjalankan tiap effect
   * mount → cleanup → mount. Effect yang cleanup-nya menghancurkan sumber daya milik
   * useMemo tidak akan selamat: mount kedua memakai sumber daya yang sudah mati, melempar
   * di passive effect, dan React membongkar seluruh pohon — layar putih, bukan pesan error.
   * Test tanpa StrictMode di atas tidak pernah menangkapnya.
   */
  it('survives the StrictMode mount/unmount/mount cycle that main.tsx puts it through', async () => {
    render(
      <StrictMode>
        <App pathname="/game/battle-arena" search="" />
      </StrictMode>,
    )

    expect(await screen.findByTestId('column-control', {}, DASHBOARD)).toBeTruthy()
  })

  it('survives the same cycle on the overlay page', () => {
    render(
      <StrictMode>
        <App search="?stage=1" />
      </StrictMode>,
    )

    expect(screen.getByTestId('stage-page')).toBeTruthy()
  })
})
