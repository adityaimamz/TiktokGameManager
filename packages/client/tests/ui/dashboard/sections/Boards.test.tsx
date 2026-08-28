// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { MatchSummary } from '@lga/shared'
import { Boards } from '../../../../src/ui/dashboard/sections/Boards.js'

afterEach(cleanup)

const live = [
  {
    username: 'rani',
    initials: 'RA',
    lastGiftName: 'Rose',
    lastGiftCount: 12,
    coins: 1240,
    lastGiftAtMs: 0,
    synthetic: false,
  },
  {
    username: 'sim',
    initials: 'S',
    lastGiftName: 'Galaxy',
    lastGiftCount: 1,
    coins: 1000,
    lastGiftAtMs: 0,
    synthetic: true,
  },
]

const top = [
  {
    platform: 'tiktok',
    username: 'budi',
    avatarUrl: null,
    kills: 3,
    deaths: 1,
    gamesPlayed: 4,
    giftCoins: 9000,
  },
]

const killers = [
  {
    platform: 'tiktok',
    username: 'agus',
    avatarUrl: null,
    kills: 142,
    deaths: 30,
    gamesPlayed: 12,
    giftCoins: 0,
  },
]

const matches: MatchSummary[] = [
  {
    id: 2,
    startedAtMs: 1_700_000_600_000,
    winnerSide: 'b',
    roundsWonA: 1,
    roundsWonB: 3,
    durationMs: 252_000,
    totalFighters: 12,
  },
]

const sideNames = { a: 'Messi', b: 'Ronaldo' }

const props = {
  chat: <p>komentar live</p>,
  live,
  top,
  matches,
  killers,
  sideNames,
  nowMs: 0,
  onLoadTop: vi.fn(),
  onLoadStats: vi.fn(),
}

describe('Boards', () => {
  it('membuka komentar lebih dulu, jadi banjir gift tidak menutupinya', () => {
    render(<Boards {...props} />)
    expect(screen.getByText('komentar live')).toBeDefined()
    expect(screen.queryByText('rani')).toBeNull()
  })

  it('menampilkan gifter live beserta gift terakhirnya', () => {
    render(<Boards {...props} live={live} top={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gift' }))
    expect(screen.getByText('rani')).toBeDefined()
    expect(screen.getByText(/Rose ×12/)).toBeDefined()
    expect(screen.getByText('1.240')).toBeDefined()
  })

  it('membedakan entri sintetis (Req 38 AC13)', () => {
    render(<Boards {...props} live={live} top={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gift' }))
    expect(screen.getByTestId('gifter-sim').getAttribute('data-synthetic')).toBe('true')
    expect(screen.getByTestId('gifter-rani').getAttribute('data-synthetic')).toBe('false')
  })

  it('memuat papan sepanjang masa saat tab Top dibuka', () => {
    const onLoadTop = vi.fn()
    render(<Boards {...props} onLoadTop={onLoadTop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Top' }))
    expect(onLoadTop).toHaveBeenCalledTimes(1)
    expect(screen.getByText('budi')).toBeDefined()
  })

  it('menjelaskan tab Live yang kosong', () => {
    render(<Boards {...props} live={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gift' }))
    expect(screen.getByText(/belum ada hadiah/i)).toBeDefined()
  })

  it('memuat statistik saat tabnya dibuka, satu panggilan per klik', () => {
    const onLoadStats = vi.fn()
    render(<Boards {...props} onLoadStats={onLoadStats} />)

    fireEvent.click(screen.getByRole('button', { name: 'Statistik' }))

    expect(onLoadStats).toHaveBeenCalledTimes(1)
  })

  it('menampilkan riwayat dengan nama sisi dari config dan skor rondenya', () => {
    render(<Boards {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik' }))

    expect(screen.getByText('1 – 3')).toBeDefined()
    // Jumlah fighter dan durasi berbagi satu kolom: "12 · 4:12".
    expect(screen.getByText(/12 · 4:12/)).toBeDefined()
  })

  it('menampilkan win rate beserta jendelanya', () => {
    render(<Boards {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik' }))

    expect(screen.getByText(/1 match terakhir/)).toBeDefined()
  })

  it('menampilkan papan pembunuh sepanjang masa', () => {
    render(<Boards {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik' }))

    expect(screen.getByText('agus')).toBeDefined()
    expect(screen.getByText('142')).toBeDefined()
  })

  it('menjelaskan tab Statistik yang kosong, bukan diam', () => {
    render(<Boards {...props} matches={[]} killers={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik' }))

    expect(screen.getByText(/terisi beberapa detik setelah kill atau gift pertama/i)).toBeDefined()
  })
})
