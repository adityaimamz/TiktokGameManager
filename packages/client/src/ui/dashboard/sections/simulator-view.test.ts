import { describe, expect, it } from 'vitest'
import { simulatorView } from './simulator-view.js'

describe('simulatorView', () => {
  it('reads Mati and offers to start when nothing is running', () => {
    const view = simulatorView(false)

    expect(view.chip).toEqual({ label: 'Mati', tone: 'neutral' })
    expect(view.toggleLabel).toBe('Mulai gladi')
  })

  it('reads Berjalan and offers to stop once it is', () => {
    const view = simulatorView(true)

    expect(view.chip).toEqual({ label: 'Berjalan', tone: 'standby' })
    expect(view.toggleLabel).toBe('Hentikan gladi')
    expect(view.running).toBe(true)
  })
})
