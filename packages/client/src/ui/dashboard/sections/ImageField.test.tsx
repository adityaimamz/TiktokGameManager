// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageField } from './ImageField.js'

afterEach(cleanup)

const png = (): File => new File([new Uint8Array([1])], 'latar.png', { type: 'image/png' })

describe('ImageField', () => {
  it('mengunggah berkas terpilih lalu melaporkan url-nya', async () => {
    const onChange = vi.fn()
    render(
      <ImageField
        label="Latar Side A"
        value={null}
        onChange={onChange}
        upload={async () => '/api/uploads/abc.png'}
      />,
    )

    await userEvent.upload(screen.getByLabelText('Latar Side A'), png())

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/api/uploads/abc.png'))
  })

  it('mengosongkan latar lewat Clear', async () => {
    const onChange = vi.fn()
    render(<ImageField label="Latar Side A" value="/api/uploads/abc.png" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Hapus Latar Side A' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('menyebutkan kegagalan dan mempertahankan latar lama', async () => {
    const onChange = vi.fn()
    render(
      <ImageField
        label="Latar Side A"
        value="/api/uploads/lama.png"
        onChange={onChange}
        upload={async () => null}
      />,
    )

    await userEvent.upload(screen.getByLabelText('Latar Side A'), png())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('tidak menawarkan Clear saat belum ada latar', () => {
    render(<ImageField label="Latar Side A" value={null} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Hapus Latar Side A' })).toBeNull()
  })
})
