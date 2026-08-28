// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { ErrorBoundary, OverlayRecovery } from '../../src/ui/ErrorBoundary.js'

afterEach(cleanup)

function Boom(): never {
  throw new Error('render meledak')
}

describe('ErrorBoundary', () => {
  it('menggambar fallback dan membiarkan sibling di luarnya tetap terpasang', () => {
    render(
      <div>
        <span>tetangga</span>
        <ErrorBoundary fallback={<p>panel pemulihan</p>} onError={() => {}}>
          <Boom />
        </ErrorBoundary>
      </div>,
    )

    expect(screen.getByText('panel pemulihan')).toBeTruthy()
    expect(screen.getByText('tetangga')).toBeTruthy()
  })

  it('melaporkan error lewat onError, bukan menelannya', () => {
    const seen: unknown[] = []
    render(
      <ErrorBoundary fallback={null} onError={(error) => seen.push(error)}>
        <Boom />
      </ErrorBoundary>,
    )

    expect(seen).toHaveLength(1)
    expect((seen[0] as Error).message).toBe('render meledak')
  })

  it('tidak menggambar apa pun saat fallback tidak diberikan — overlay OBS harus tembus pandang', () => {
    const { container } = render(
      <ErrorBoundary onError={() => {}}>
        <Boom />
      </ErrorBoundary>,
    )

    expect(container.innerHTML).toBe('')
  })

  it('meneruskan anaknya apa adanya selama tidak ada yang melempar', () => {
    render(
      <ErrorBoundary onError={() => {}}>
        <span>isi normal</span>
      </ErrorBoundary>,
    )

    expect(screen.getByText('isi normal')).toBeTruthy()
  })
})

describe('OverlayRecovery', () => {
  it('memuat ulang sekali sesudah tundaannya', () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    sessionStorage.clear()

    render(<OverlayRecovery reload={reload} delayMs={3000} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(reload).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('menolak memuat ulang untuk kedua kalinya di sesi yang sama', () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    sessionStorage.clear()

    const first = render(<OverlayRecovery reload={reload} delayMs={3000} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    first.unmount()

    render(<OverlayRecovery reload={reload} delayMs={3000} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(reload).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
