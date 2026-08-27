// @vitest-environment jsdom
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GIFT_SEED } from '@lga/shared'
import { useGiftCatalog } from './useGiftCatalog.js'

afterEach(cleanup)

function Probe({ fetchImpl, roomId }: { fetchImpl: typeof fetch; roomId?: string }): ReactElement {
  const { catalog } = useGiftCatalog(fetchImpl, roomId ?? null)
  return (
    <ul>
      {catalog.map((gift) => (
        <li key={gift.name}>{gift.name}</li>
      ))}
    </ul>
  )
}

const respond = (body: unknown): typeof fetch =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch

/** Nama entri seed pertama — dibaca dari daftarnya, bukan disalin, supaya urutannya boleh berubah. */
const seedName = GIFT_SEED[0]?.name ?? ''

describe('useGiftCatalog', () => {
  it('memakai GIFT_SEED sebelum jawaban tiba', () => {
    render(<Probe fetchImpl={respond([])} />)
    expect(screen.getByText(seedName)).toBeDefined()
  })

  it('mengganti dengan katalog room begitu tiba', async () => {
    const catalog = [{ id: 7, name: 'Mawar Room', coins: 3, iconUrl: null }]
    render(<Probe fetchImpl={respond(catalog)} />)
    await waitFor(() => expect(screen.getByText('Mawar Room')).toBeDefined())
  })

  it('bertahan di GIFT_SEED saat request gagal', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    render(<Probe fetchImpl={failing} />)
    await waitFor(() => expect(failing).toHaveBeenCalled())
    expect(screen.getByText(seedName)).toBeDefined()
  })

  it('meminta ulang katalog begitu sebuah room tersambung', async () => {
    // Panel setelan sudah ter-mount jauh sebelum creator menekan Connect, jadi jawaban
    // pertama SELALU seed. Tanpa permintaan kedua, katalog room sungguhan tidak pernah
    // terlihat sepanjang siaran.
    const impl = respond([{ id: 7, name: 'Mawar Room', coins: 3, iconUrl: null }])
    const view = render(<Probe fetchImpl={impl} />)
    await waitFor(() => expect(impl).toHaveBeenCalledTimes(1))

    view.rerender(<Probe fetchImpl={impl} roomId="7677798787024227073" />)
    await waitFor(() => expect(impl).toHaveBeenCalledTimes(2))
  })

  it('mengabaikan jawaban yang bukan array', async () => {
    const impl = respond({ gifts: 'bukan array' })
    render(<Probe fetchImpl={impl} />)
    await waitFor(() => expect(impl).toHaveBeenCalled())
    expect(screen.getByText(seedName)).toBeDefined()
  })

  it('meminta ulang saat reload dipanggil', async () => {
    // Server menambahkan gift ke katalog sepanjang siaran, dari hadiah yang benar-benar
    // dikirim. Tanpa jalan menjemputnya, panel setelan tetap memajang jawaban pertama.
    const impl = respond([{ id: 7, name: 'Mawar Room', coins: 3, iconUrl: null }])

    function Reloadable(): ReactElement {
      const { catalog, reload } = useGiftCatalog(impl)
      return (
        <div>
          <span data-testid="count">{catalog.length}</span>
          <button type="button" onClick={reload}>
            muat ulang
          </button>
        </div>
      )
    }

    render(<Reloadable />)
    await waitFor(() => expect(impl).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'muat ulang' }))
    await waitFor(() => expect(impl).toHaveBeenCalledTimes(2))
  })
})
