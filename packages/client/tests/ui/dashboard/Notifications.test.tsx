// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Notifications } from '../../../src/ui/dashboard/Notifications.js'
import type { NotificationEntry } from '../../../src/ui/dashboard/notification-list.js'

afterEach(cleanup)

const entry = (id: string, read = false): NotificationEntry => ({
  id,
  kind: 'alert',
  text: `pesan ${id}`,
  atMs: new Date(2026, 7, 20, 9, 5).getTime(),
  read,
})

describe('Notifications', () => {
  it('tidak menampilkan badge saat semuanya sudah dibaca', () => {
    render(<Notifications items={[entry('a', true)]} onOpen={() => {}} />)

    expect(screen.queryByTestId('notif-badge')).toBeNull()
  })

  it('menghitung yang belum dibaca, lalu berhenti di 9+', () => {
    const many = Array.from({ length: 12 }, (_, index) => entry(`n${index}`))
    const { rerender } = render(<Notifications items={[entry('a')]} onOpen={() => {}} />)
    expect(screen.getByTestId('notif-badge').textContent).toBe('1')

    rerender(<Notifications items={many} onOpen={() => {}} />)
    expect(screen.getByTestId('notif-badge').textContent).toBe('9+')
  })

  it('membuka daftar dan menandai semuanya terbaca sekali', () => {
    const onOpen = vi.fn()
    render(<Notifications items={[entry('a')]} onOpen={onOpen} />)

    act(() => screen.getByRole('button', { name: 'Notifikasi' }).click())

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('pesan a')).toBeTruthy()
    expect(screen.getByText('09:05')).toBeTruthy()
  })

  it('menutup kembali tanpa menandai ulang', () => {
    const onOpen = vi.fn()
    render(<Notifications items={[entry('a')]} onOpen={onOpen} />)
    const bell = screen.getByRole('button', { name: 'Notifikasi' })

    act(() => bell.click())
    act(() => bell.click())

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('pesan a')).toBeNull()
  })

  it('mengatakan saat belum ada apa-apa', () => {
    render(<Notifications items={[]} onOpen={() => {}} />)

    act(() => screen.getByRole('button', { name: 'Notifikasi' }).click())

    expect(screen.getByTestId('notif-empty')).toBeTruthy()
  })
})
