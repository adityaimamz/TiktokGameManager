// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { DEFAULT_ALERTS } from '../../../platform/signals/index.js'
import type { AlertRule, CatalogEntry } from '../../../platform/signals/index.js'
import { Alerts } from './Alerts.js'

afterEach(cleanup)

const cues: CatalogEntry[] = [
  { id: 'sound-1', kind: 'sound', label: 'sorak', url: '/a.mp3', volume: 1 },
  { id: 'gif-1', kind: 'gif', label: 'tepuk', url: '/a.gif', volume: 1 },
  { id: 'music-1', kind: 'music', label: 'lagu', url: '/a.mp3', volume: 1 },
]

/** Mock dipegang terpisah supaya tipenya tidak melebur dengan tipe prop-nya. */
const panel = (over: Partial<Parameters<typeof Alerts>[0]> = {}) => {
  const onAlerts = vi.fn<(next: AlertRule[]) => void>()
  render(
    <Alerts
      alerts={DEFAULT_ALERTS.map((rule) => ({ ...rule }))}
      cues={cues}
      onAlerts={onAlerts}
      {...over}
    />,
  )
  return { onAlerts }
}

describe('Alerts', () => {
  it('menampilkan keempat rule', () => {
    panel()

    expect(screen.getByText('Gift besar')).toBeTruthy()
    expect(screen.getByText('Milestone like')).toBeTruthy()
    expect(screen.getByText('Follower baru')).toBeTruthy()
    expect(screen.getByText('Live dibagikan')).toBeTruthy()
  })

  it('mematikan satu rule tanpa menyentuh yang lain', () => {
    const props = panel()

    act(() => screen.getByRole('switch', { name: 'Gift besar' }).click())

    const next = props.onAlerts.mock.calls[0]?.[0] ?? []
    expect(next[0]?.enabled).toBe(false)
    expect(next[1]).toEqual(DEFAULT_ALERTS[1])
  })

  it('hanya gift dan milestone like yang punya ambang', () => {
    panel()

    expect(screen.getByLabelText('Minimum koin')).toBeTruthy()
    expect(screen.getByLabelText('Tiap berapa like')).toBeTruthy()
    // Follow dan share tidak punya ambang sama sekali — tepat dua field, bukan empat.
    expect(screen.getAllByLabelText(/^(Minimum koin|Tiap berapa like)$/)).toHaveLength(2)
  })

  it('menawarkan cue bunyi dan GIF saja — musik bukan media alert', () => {
    panel()

    const select = screen.getByLabelText('Media alert Gift besar') as HTMLSelectElement
    const values = [...select.options].map((option) => option.value)
    expect(values).toEqual(['', 'sound-1', 'gif-1'])
  })
})
