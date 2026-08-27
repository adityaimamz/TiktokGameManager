// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { idleStatus } from '@lga/shared'
import type { ConnectionStatus } from '@lga/shared'
import { Connection } from './Connection.js'

afterEach(cleanup)

const status = (patch: Partial<ConnectionStatus>): ConnectionStatus => ({
  ...idleStatus(),
  ...patch,
})

describe('Connection', () => {
  it('asks for a username while disconnected', () => {
    render(<Connection status={idleStatus()} onConnect={() => {}} onDisconnect={() => {}} />)

    expect(screen.getByLabelText('Username TikTok')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sambungkan' })).toBeTruthy()
  })

  it('passes the trimmed username up when Connect is pressed', () => {
    const onConnect = vi.fn()
    render(<Connection status={idleStatus()} onConnect={onConnect} onDisconnect={() => {}} />)

    fireEvent.change(screen.getByLabelText('Username TikTok'), { target: { value: '  raya  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sambungkan' }))

    expect(onConnect).toHaveBeenCalledWith('raya')
  })

  it('refuses to send an empty username', () => {
    const onConnect = vi.fn()
    render(<Connection status={idleStatus()} onConnect={onConnect} onDisconnect={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sambungkan' }))

    expect(onConnect).not.toHaveBeenCalled()
  })

  it('shows the room and offers to disconnect once connected', () => {
    const onDisconnect = vi.fn()
    render(
      <Connection
        status={status({ state: 'connected', username: 'rayaplays', roomId: '7429183056' })}
        onConnect={() => {}}
        onDisconnect={onDisconnect}
      />,
    )

    expect(screen.getByText('@rayaplays')).toBeTruthy()
    expect(screen.getByText('7429183056')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Putuskan' }))
    expect(onDisconnect).toHaveBeenCalledOnce()
  })

  it('shows the failure reason so the creator knows what to fix', () => {
    render(
      <Connection
        status={status({ state: 'failed', error: 'server unreachable' })}
        onConnect={() => {}}
        onDisconnect={() => {}}
      />,
    )

    expect(screen.getByText('server unreachable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeTruthy()
  })
})
