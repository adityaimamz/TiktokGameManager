// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TestActions } from '../../../../src/ui/dashboard/sections/TestActions.js'

import { defaultConfig } from '../../../../src/games/battle-arena/config/index.js'

afterEach(cleanup)

describe('TestActions', () => {
  it('draws 7 buttons for default 2 sides', () => {
    render(<TestActions onFire={() => {}} />)

    expect(screen.getAllByRole('button')).toHaveLength(7)
  })

  it('draws 13 buttons when 4 sides are configured', () => {
    const config = defaultConfig()
    config.gameplay.sideCount = 4
    render(<TestActions config={config} onFire={() => {}} />)

    expect(screen.getAllByRole('button')).toHaveLength(13)
  })

  it('reports which action was pressed', () => {
    const onFire = vi.fn()
    render(<TestActions onFire={onFire} />)

    fireEvent.click(screen.getByRole('button', { name: 'Isi arena — 10 tiap sisi' }))

    expect(onFire).toHaveBeenCalledWith('fillArena')
  })
})
