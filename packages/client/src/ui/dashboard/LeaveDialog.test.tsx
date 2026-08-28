// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeaveDialog } from './LeaveDialog.js'

afterEach(cleanup)

describe('LeaveDialog', () => {
  it('membatalkan tanpa meninggalkan apa pun', () => {
    const onCancel = vi.fn()
    const onLeave = vi.fn()
    render(<LeaveDialog onCancel={onCancel} onLeave={onLeave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('keluar tanpa memutus koneksi', () => {
    const onLeave = vi.fn()
    render(<LeaveDialog onCancel={() => {}} onLeave={onLeave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Biarkan tersambung' }))

    expect(onLeave).toHaveBeenCalledWith(false)
  })

  it('keluar sambil memutus koneksi', () => {
    const onLeave = vi.fn()
    render(<LeaveDialog onCancel={() => {}} onLeave={onLeave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Putuskan & keluar' }))

    expect(onLeave).toHaveBeenCalledWith(true)
  })

  it('Escape membatalkan', () => {
    const onCancel = vi.fn()
    render(<LeaveDialog onCancel={onCancel} onLeave={() => {}} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('melepas listener Escape-nya saat ditutup', () => {
    const onCancel = vi.fn()
    const view = render(<LeaveDialog onCancel={onCancel} onLeave={() => {}} />)

    view.unmount()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onCancel).not.toHaveBeenCalled()
  })
})
