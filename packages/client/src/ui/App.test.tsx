// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { App } from './App.js'

afterEach(cleanup)

describe('App', () => {
  it('renders the overlay stage when the stage query is set', () => {
    render(<App search="?stage=1" />)
    expect(screen.getByTestId('stage-page')).toBeTruthy()
    expect(screen.queryByTestId('column-control')).toBeNull()
  })

  it('renders the dashboard otherwise', async () => {
    render(<App search="" />)
    // Dashboard dimuat malas, jadi chunk-nya ditransformasi Vite saat assertion ini berjalan.
    // Default 1000 ms Testing Library terlampaui saat seluruh suite berjalan bersamaan —
    // yang diuji di sini adalah dashboard AKHIRNYA muncul, bukan seberapa cepat.
    expect(await screen.findByTestId('column-control', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.queryByTestId('stage-page')).toBeNull()
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
        <App search="" />
      </StrictMode>,
    )

    // Dashboard dimuat malas, jadi chunk-nya ditransformasi Vite saat assertion ini berjalan.
    // Default 1000 ms Testing Library terlampaui saat seluruh suite berjalan bersamaan —
    // yang diuji di sini adalah dashboard AKHIRNYA muncul, bukan seberapa cepat.
    expect(await screen.findByTestId('column-control', {}, { timeout: 5000 })).toBeTruthy()
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
