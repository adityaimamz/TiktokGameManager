// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColorField, NumberField, SelectField, TextField, Toggle } from '../../../../src/ui/dashboard/sections/Field.js'

afterEach(cleanup)

describe('NumberField', () => {
  it('meneruskan nilai yang sah', async () => {
    const onCommit = vi.fn()
    render(<NumberField label="Base HP" field="gameplay.baseHp" value={200} onCommit={onCommit} />)

    const input = screen.getByLabelText('Base HP')
    await userEvent.clear(input)
    await userEvent.type(input, '350')
    await userEvent.tab()

    expect(onCommit).toHaveBeenCalledWith(350)
  })

  it('menolak nilai di luar rentang, mempertahankan yang lama, dan menyebut batasnya', async () => {
    const onCommit = vi.fn()
    render(<NumberField label="Base HP" field="gameplay.baseHp" value={200} onCommit={onCommit} />)

    const input = screen.getByLabelText('Base HP')
    await userEvent.clear(input)
    await userEvent.type(input, '99999')
    await userEvent.tab()

    expect(onCommit).not.toHaveBeenCalled()
    expect((input as HTMLInputElement).value).toBe('200')
    expect(screen.getByRole('alert').textContent).toContain('9999')
  })

  it('tidak menolak apa pun selagi creator masih mengetik', async () => {
    const onCommit = vi.fn()
    render(<NumberField label="Base HP" field="gameplay.baseHp" value={200} onCommit={onCommit} />)

    const input = screen.getByLabelText('Base HP')
    await userEvent.clear(input)
    await userEvent.type(input, '3')

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Toggle', () => {
  it('melaporkan keadaan barunya', async () => {
    const onChange = vi.fn()
    render(<Toggle label="Screen shake" checked={false} onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch', { name: 'Screen shake' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('TextField', () => {
  it('membatasi panjang masukan', async () => {
    const onChange = vi.fn()
    render(<TextField label="Keyword" value="" maxLength={5} onChange={onChange} />)

    expect(screen.getByLabelText('Keyword').getAttribute('maxlength')).toBe('5')
    await userEvent.type(screen.getByLabelText('Keyword'), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })
})

describe('SelectField', () => {
  it('memilih salah satu opsi', async () => {
    const onChange = vi.fn()
    render(
      <SelectField
        label="Rounds"
        value={5}
        options={[
          { value: 3, label: '3' },
          { value: 5, label: '5' },
        ]}
        onChange={onChange}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Rounds'), '3')

    expect(onChange).toHaveBeenCalledWith(3)
  })
})

describe('ColorField', () => {
  it('menampilkan warna berjalan', () => {
    render(<ColorField label="Color" value="#3b82f6" onChange={() => {}} />)
    expect((screen.getByLabelText('Color') as HTMLInputElement).value).toBe('#3b82f6')
  })
})

describe('NumberField dengan rentang langsung', () => {
  const range = { label: 'minimal hadiah', range: { min: 1, max: 999, integer: true } }

  it('meneruskan nilai yang sah', () => {
    const onCommit = vi.fn()
    render(<NumberField label="Minimal hadiah" range={range} value={1} onCommit={onCommit} />)
    const input = screen.getByLabelText('Minimal hadiah')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith(5)
  })

  it('menolak di luar rentang dan mempertahankan nilai lama', () => {
    const onCommit = vi.fn()
    render(<NumberField label="Minimal hadiah" range={range} value={1} onCommit={onCommit} />)
    const input = screen.getByLabelText('Minimal hadiah')
    fireEvent.change(input, { target: { value: '5000' } })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeDefined()
  })
})
