// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LiveSimulator } from '../../../../src/ui/dashboard/sections/LiveSimulator.js'

afterEach(cleanup)

describe('LiveSimulator', () => {
  it('offers to start while stopped', () => {
    const onToggle = vi.fn()
    render(<LiveSimulator running={false} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mulai gladi' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('offers to stop while running', () => {
    render(<LiveSimulator running onToggle={() => {}} />)

    expect(screen.getByRole('button', { name: 'Hentikan gladi' })).toBeTruthy()
    expect(screen.getByText('Berjalan')).toBeTruthy()
  })

  it('no longer offers a size preset — the arena capacity is the only ceiling', () => {
    render(<LiveSimulator running={false} onToggle={() => {}} />)

    expect(screen.queryByRole('button', { name: '500' })).toBeNull()
  })
})
