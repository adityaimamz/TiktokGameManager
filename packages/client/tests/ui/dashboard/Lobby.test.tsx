// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GAMES } from '../../../src/platform/registry/index.js'
import { Lobby } from '../../../src/ui/dashboard/Lobby.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Halaman ini memanggil /api/health saat mount; tanpa stub tiap test menunggu jaringan. */
function stubHealth(ok: boolean): void {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: ok ? 200 : 503 })))
}

describe('Lobby', () => {
  it('draws one card per registry entry, not a hardcoded list', async () => {
    stubHealth(true)
    render(<Lobby onOpen={() => {}} />)

    for (const game of GAMES) {
      expect(await screen.findAllByText(game.label)).not.toHaveLength(0)
    }
    expect(screen.getByText(`${GAMES.length} aktif · 2 menyusul`)).toBeTruthy()
  })

  it('opens the game whose card was clicked', async () => {
    stubHealth(true)
    const onOpen = vi.fn()
    render(<Lobby onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('button', { name: /Buka ruang kendali/ }))

    expect(onOpen).toHaveBeenCalledWith(GAMES[0]?.id)
  })

  /**
   * Server yang mati adalah hal pertama yang menjelaskan kenapa nanti tidak ada chat yang
   * masuk. Katalog yang diam soal itu mengirim creator mencari di tempat yang salah.
   */
  it('says so when the server does not answer', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))
    render(<Lobby onOpen={() => {}} />)

    expect(await screen.findByText('Terputus')).toBeTruthy()
  })

  it('says so when the server does answer', async () => {
    stubHealth(true)
    render(<Lobby onOpen={() => {}} />)

    expect(await screen.findByText('Tersambung')).toBeTruthy()
  })
})
