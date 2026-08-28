// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SessionControls } from '../../../../src/ui/dashboard/sections/SessionControls.js'

afterEach(cleanup)

const noop = () => {}

describe('SessionControls', () => {
  it('offers Pause while running and Resume while paused', () => {
    const { rerender } = render(
      <SessionControls
        paused={false}
        onTogglePause={noop}
        onRestart={noop}
        onSend={noop}
        onEndSession={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Jeda permainan' })).toBeTruthy()

    rerender(
      <SessionControls
        paused
        onTogglePause={noop}
        onRestart={noop}
        onSend={noop}
        onEndSession={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Lanjutkan' })).toBeTruthy()
  })

  it('wires each button to its own handler', () => {
    const onTogglePause = vi.fn()
    const onRestart = vi.fn()
    const onEndSession = vi.fn()
    render(
      <SessionControls
        paused={false}
        onTogglePause={onTogglePause}
        onRestart={onRestart}
        onSend={noop}
        onEndSession={onEndSession}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Jeda permainan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mulai ulang' }))
    fireEvent.click(screen.getByRole('button', { name: 'Akhiri sesi' }))

    expect(onTogglePause).toHaveBeenCalledOnce()
    expect(onRestart).toHaveBeenCalledOnce()
    expect(onEndSession).toHaveBeenCalledOnce()
  })

  it('sends the typed message on Enter and clears the field', () => {
    const onSend = vi.fn()
    render(
      <SessionControls
        paused={false}
        onTogglePause={noop}
        onRestart={noop}
        onSend={onSend}
        onEndSession={noop}
      />,
    )

    const input = screen.getByLabelText('Kirim pesan uji') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('a')
    expect(input.value).toBe('')
  })

  it('ignores Enter on an empty field', () => {
    const onSend = vi.fn()
    render(
      <SessionControls
        paused={false}
        onTogglePause={noop}
        onRestart={noop}
        onSend={onSend}
        onEndSession={noop}
      />,
    )

    fireEvent.keyDown(screen.getByLabelText('Kirim pesan uji'), { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })
})
