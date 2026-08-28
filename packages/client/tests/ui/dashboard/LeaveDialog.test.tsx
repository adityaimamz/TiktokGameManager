// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeaveDialog } from '../../../src/ui/dashboard/LeaveDialog.js'

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

  it('meninggalkan ruang kendali saat dikonfirmasi', () => {
    const onLeave = vi.fn()
    render(<LeaveDialog onCancel={() => {}} onLeave={onLeave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Tinggalkan' }))

    expect(onLeave).toHaveBeenCalledOnce()
  })

  /*
   * Dua tombol, bukan tiga. "Putuskan & keluar" dibuang: memutus koneksi sudah satu klik
   * jauhnya di panel Koneksi, dan bertiga mereka tidak muat sebaris.
   */
  it('menawarkan tepat dua pilihan', () => {
    render(<LeaveDialog onCancel={() => {}} onLeave={() => {}} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('menyebut koneksi TikTok tetap hidup, karena memang begitu', () => {
    render(<LeaveDialog onCancel={() => {}} onLeave={() => {}} />)

    expect(screen.getByText(/Koneksi TikTok tetap hidup/)).toBeTruthy()
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
