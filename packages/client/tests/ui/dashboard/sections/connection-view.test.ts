import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import type { ConnectionStatus } from '@lga/shared'
import { connectionView } from '../../../../src/ui/dashboard/sections/connection-view.js'

const status = (patch: Partial<ConnectionStatus>): ConnectionStatus => ({
  ...idleStatus(),
  ...patch,
})

describe('connectionView', () => {
  it('tells a disconnected creator what to do next', () => {
    const view = connectionView(idleStatus(), null)

    expect(view.connected).toBe(false)
    expect(view.chip).toEqual({ label: 'Terputus', tone: 'neutral' })
    expect(view.connectLabel).toBe('Sambungkan')
    expect(view.note).toBe('Belum tersambung. Masukkan username untuk mulai membaca chat.')
    expect(view.busy).toBe(false)
  })

  it('shows the account and room once the server is connected', () => {
    const view = connectionView(
      status({ state: 'connected', username: 'rayaplays', roomId: '7429183056' }),
      null,
    )

    expect(view.connected).toBe(true)
    expect(view.chip).toEqual({ label: 'Tersambung', tone: 'live' })
    expect(view.fields).toEqual([
      { label: 'Akun', value: '@rayaplays' },
      { label: 'Room ID', value: '7429183056' },
    ])
    expect(view.note).toBeNull()
  })

  it('counts the reconnect attempt out loud instead of looking frozen', () => {
    const view = connectionView(status({ state: 'reconnecting', attempt: 3 }), null)

    expect(view.chip).toEqual({ label: 'Menyambung ulang (3)', tone: 'standby' })
    expect(view.busy).toBe(true)
  })

  it('turns Connect into Retry and surfaces the reason', () => {
    const view = connectionView(status({ state: 'failed', error: 'server unreachable' }), null)

    expect(view.connectLabel).toBe('Coba lagi')
    expect(view.error).toBe('server unreachable')
    expect(view.busy).toBe(false)
  })

  it('lets what the creator typed win over what the server last reported', () => {
    expect(connectionView(status({ username: 'lama' }), 'baru').username).toBe('baru')
  })

  it('falls back to the server username until the creator types anything', () => {
    expect(connectionView(status({ username: 'lama' }), null).username).toBe('lama')
  })
})
