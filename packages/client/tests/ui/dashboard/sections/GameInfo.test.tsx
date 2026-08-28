// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultConfig } from '../../../../src/games/battle-arena/config/index.js'
import { GameInfo } from '../../../../src/ui/dashboard/sections/GameInfo.js'

afterEach(cleanup)

describe('GameInfo', () => {
  it('renders zeroes before the first snapshot instead of crashing', () => {
    render(<GameInfo view={null} config={defaultConfig()} onReset={() => {}} />)

    expect(screen.getByText('Team A')).toBeTruthy()
    expect(screen.getByText('1 dari best of 5')).toBeTruthy()
  })

  it('resets the match from the panel heading', () => {
    const onReset = vi.fn()
    render(<GameInfo view={null} config={defaultConfig()} onReset={onReset} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(onReset).toHaveBeenCalledOnce()
  })
})
