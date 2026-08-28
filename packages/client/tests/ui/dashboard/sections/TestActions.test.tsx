// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TestActions } from '../../../../src/ui/dashboard/sections/TestActions.js'

afterEach(cleanup)

describe('TestActions', () => {
  it('draws one button per test action', () => {
    render(<TestActions onFire={() => {}} />)

    expect(screen.getAllByRole('button')).toHaveLength(7)
  })

  it('reports which action was pressed', () => {
    const onFire = vi.fn()
    render(<TestActions onFire={onFire} />)

    fireEvent.click(screen.getByRole('button', { name: 'Isi arena — 10 tiap sisi' }))

    expect(onFire).toHaveBeenCalledWith('fillArena')
  })
})
