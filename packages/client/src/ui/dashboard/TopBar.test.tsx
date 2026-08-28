// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopBar } from './TopBar.js'

afterEach(cleanup)

/** Prop yang tiap test butuh tapi tak satu pun peduli isinya. */
const rest = {
  muted: false,
  onToggleMute: () => {},
  onOpenSettings: () => {},
  notifications: [],
  onReadNotifications: () => {},
  overlayCount: 0,
}

describe('TopBar', () => {
  it('names the active game from the registry rather than a literal', () => {
    render(<TopBar broadcast="idle" overlayUrl="http://localhost:5173/?stage=1" {...rest} />)

    expect(screen.getByText(/Battle Arena/)).toBeTruthy()
  })

  it('says which of the three realities the creator is in', () => {
    const { rerender } = render(<TopBar broadcast="idle" overlayUrl="" {...rest} />)
    expect(screen.getByText('Diam')).toBeTruthy()

    rerender(<TopBar broadcast="rehearsal" overlayUrl="" {...rest} />)
    expect(screen.getByText('Gladi')).toBeTruthy()

    rerender(<TopBar broadcast="live" overlayUrl="" {...rest} />)
    expect(screen.getByText('Siaran')).toBeTruthy()
  })

  it('copies the overlay URL a creator has to paste into OBS', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<TopBar broadcast="idle" overlayUrl="http://localhost:5173/?stage=1" {...rest} />)
    fireEvent.click(screen.getByRole('button', { name: 'Salin URL overlay' }))

    expect(writeText).toHaveBeenCalledWith('http://localhost:5173/?stage=1')
  })

  it('menyalakan dan mematikan bunyi lewat satu tombol yang menyebutkan keadaannya', async () => {
    const onToggleMute = vi.fn()
    render(
      <TopBar
        broadcast="idle"
        overlayUrl="http://localhost:5173/?stage=1"
        muted={false}
        onToggleMute={onToggleMute}
        onOpenSettings={() => {}}
        notifications={[]}
        onReadNotifications={() => {}}
        overlayCount={0}
      />,
    )

    const button = screen.getByRole('button', { name: 'Bisukan suara' })
    await userEvent.click(button)

    expect(onToggleMute).toHaveBeenCalledTimes(1)
  })

  it('menawarkan mengembalikan suara saat sedang dibisukan', () => {
    render(
      <TopBar
        broadcast="idle"
        overlayUrl="http://localhost:5173/?stage=1"
        muted
        onToggleMute={() => {}}
        onOpenSettings={() => {}}
        notifications={[]}
        onReadNotifications={() => {}}
        overlayCount={0}
      />,
    )

    expect(screen.getByRole('button', { name: 'Kembalikan suara' })).toBeTruthy()
  })

  it('menyediakan pintasan ke panel setelan', async () => {
    const onOpenSettings = vi.fn()
    render(
      <TopBar
        broadcast="idle"
        overlayUrl="http://localhost:5173/?stage=1"
        muted={false}
        onToggleMute={() => {}}
        onOpenSettings={onOpenSettings}
        notifications={[]}
        onReadNotifications={() => {}}
        overlayCount={0}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Setelan game' }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('menampilkan berapa overlay jauh yang terhubung', () => {
    render(
      <TopBar
        broadcast="idle"
        overlayUrl="http://192.168.1.5:3001/?stage=1"
        {...rest}
        overlayCount={2}
      />,
    )

    expect(screen.getByTestId('overlay-count').textContent).toContain('2')
  })

  it('tetap menampilkan angkanya saat belum ada yang terhubung', () => {
    render(
      <TopBar
        broadcast="idle"
        overlayUrl="http://192.168.1.5:3001/?stage=1"
        {...rest}
        overlayCount={0}
      />,
    )

    // Nol adalah informasi, bukan ketiadaan informasi: creator perlu tahu link-nya belum
    // dipakai sebelum siaran mulai, bukan menebak dari label yang hilang.
    expect(screen.getByTestId('overlay-count').textContent).toContain('0')
  })

  it('menampilkan durasi siaran di dalam pil', () => {
    render(<TopBar broadcast="live" overlayUrl="" {...rest} liveFor="1:03:20" />)
    expect(screen.getByTestId('live-for').textContent).toContain('1:03:20')
  })

  it('tidak menggambar durasi saat belum tersambung', () => {
    render(<TopBar broadcast="idle" overlayUrl="" {...rest} liveFor={null} />)
    expect(screen.queryByTestId('live-for')).toBeNull()
  })
})
