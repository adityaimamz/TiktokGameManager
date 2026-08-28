// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  defaultConfig,
  MAX_TRIGGER_RULES,
} from '../../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../../src/games/battle-arena/config/index.js'
import { addRule } from '../../../../src/ui/dashboard/sections/action-triggers.js'
import { ActionTriggers } from '../../../../src/ui/dashboard/sections/ActionTriggers.js'

afterEach(cleanup)

const catalog = [
  { id: 1, name: 'Rose', coins: 1, iconUrl: null },
  { id: 2, name: 'Galaxy', coins: 1000, iconUrl: null },
]
const fetchCatalog = (() =>
  Promise.resolve({ ok: true, json: async () => catalog })) as unknown as typeof fetch

/** Config yang diserahkan ke panggilan onConfig pertama. */
const firstConfig = (onConfig: ReturnType<typeof vi.fn>): BattleArenaConfig =>
  onConfig.mock.calls[0]?.[0] as BattleArenaConfig

describe('ActionTriggers', () => {
  it('merender satu kartu per rule', () => {
    render(<ActionTriggers config={defaultConfig()} onConfig={() => {}} fetchImpl={fetchCatalog} />)

    expect(screen.getByText('Join Side A')).toBeTruthy()
    expect(screen.getByText('Join Side B')).toBeTruthy()
    expect(screen.getByText('Grow my blob (HP)')).toBeTruthy()
  })

  it('menyembunyikan rule dari layar tanpa mematikan pemicunya', async () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)

    const card = screen.getByRole('group', { name: 'Join Side A' })
    await userEvent.click(within(card).getByRole('switch', { name: 'Di layar' }))

    const next = firstConfig(onConfig)
    const rule = next.triggers.find((r) => r.id === 'join-a')
    expect(rule?.legend.show).toBe(false)
    expect(rule?.enabled).toBe(true)
  })

  it('menyunting keyword sisi lewat kartu rule comment', async () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)

    await userEvent.type(screen.getByLabelText('Keyword Join Side A'), 'x')

    expect(onConfig).toHaveBeenCalled()
    const next = onConfig.mock.calls[0]?.[0]
    expect(next.sides.a.keyword).toContain('x')
  })

  it('menyunting ambang like lewat kartu rule like', async () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)

    const input = screen.getByLabelText('Setiap berapa like')
    await userEvent.clear(input)
    await userEvent.type(input, '25')
    await userEvent.tab()

    expect(onConfig.mock.calls.at(-1)?.[0].likes.threshold).toBe(25)
  })

  it('menyunting HP per grow lewat kolom × pada kartu grow', async () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)

    const input = screen.getByLabelText('HP per grow')
    await userEvent.clear(input)
    await userEvent.type(input, '9')
    await userEvent.tab()

    expect(onConfig.mock.calls.at(-1)?.[0].gameplay.hpGainedPerGrow).toBe(9)
  })

  it('mematikan rule lewat toggle-nya', async () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)

    await userEvent.click(screen.getByRole('switch', { name: 'Join Side A' }))

    expect(onConfig.mock.calls[0]?.[0].triggers[0].enabled).toBe(false)
  })
})

describe('editor rule', () => {
  it('menambah rule lewat + Tambah trigger', () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)
    fireEvent.click(screen.getByRole('button', { name: /tambah trigger/i }))
    expect(onConfig).toHaveBeenCalledTimes(1)
    expect(firstConfig(onConfig).triggers).toHaveLength(defaultConfig().triggers.length + 1)
  })

  it('menghapus rule lewat tombol ×', () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)
    fireEvent.click(screen.getByRole('button', { name: /hapus join side a/i }))
    expect(firstConfig(onConfig).triggers.map((rule) => rule.id)).not.toContain('join-a')
  })

  it('mengganti jenis pemicu', () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)
    fireEvent.change(screen.getByLabelText('Pemicu Join Side A'), { target: { value: 'follow' } })
    const rule = firstConfig(onConfig).triggers.find((entry) => entry.id === 'join-a')
    expect(rule?.when).toEqual({ kind: 'follow' })
  })

  it('mengganti sasaran dan menulis ulang caption', () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)
    fireEvent.change(screen.getByLabelText('Sasaran Gift heals my blob'), {
      target: { value: 'enemySide' },
    })
    const rule = firstConfig(onConfig).triggers.find((entry) => entry.id === 'gift-heal')
    expect(rule?.then.target).toBe('enemySide')
    expect(rule?.legend.caption).toBe('HEAL ENEMY SIDE')
  })

  it('menambahkan gift dari katalog ke rule gift', async () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)
    const picker = screen.getByRole('list', { name: 'Hadiah pemicu Gift heals my blob' })

    await waitFor(() =>
      expect(within(picker).getByRole('button', { name: /Galaxy/ })).toBeDefined(),
    )
    fireEvent.click(within(picker).getByRole('button', { name: /Galaxy/ }))

    const rule = firstConfig(onConfig).triggers.find((entry) => entry.id === 'gift-heal')
    expect(rule?.when).toMatchObject({ giftNames: ['Rose', 'Galaxy'] })
  })

  it('menggambar koin dan ikon tiap hadiah katalog', async () => {
    render(<ActionTriggers config={defaultConfig()} onConfig={vi.fn()} fetchImpl={fetchCatalog} />)
    const picker = screen.getByRole('list', { name: 'Hadiah pemicu Gift heals my blob' })

    await waitFor(() =>
      expect(within(picker).getByRole('button', { name: /Galaxy/ })).toBeDefined(),
    )
    expect(within(picker).getByRole('button', { name: /Galaxy/ }).textContent).toContain('1000')
    expect(within(picker).getByTitle('Galaxy · 1000 koin')).toBeDefined()
  })

  // 'Rose' sudah ada di rule bawaan; mengkliknya berarti MELEPASNYA, bukan menggandakan.
  it('melepas gift yang sudah terdaftar saat petaknya diklik lagi', () => {
    const onConfig = vi.fn()
    render(<ActionTriggers config={defaultConfig()} onConfig={onConfig} fetchImpl={fetchCatalog} />)
    const picker = screen.getByRole('list', { name: 'Hadiah pemicu Gift heals my blob' })
    const rose = within(picker).getByRole('button', { name: /Rose/ })

    expect(rose.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(rose)

    const rule = firstConfig(onConfig).triggers.find((entry) => entry.id === 'gift-heal')
    expect(rule?.when).toMatchObject({ giftNames: [] })
  })

  it('mematikan + Tambah trigger di batas 50', () => {
    let config = defaultConfig()
    while (config.triggers.length < MAX_TRIGGER_RULES) config = addRule(config)
    render(<ActionTriggers config={config} onConfig={vi.fn()} fetchImpl={fetchCatalog} />)
    expect(screen.getByRole('button', { name: /tambah trigger/i })).toHaveProperty('disabled', true)
  })

  it('memperingatkan saat keyword sisi cocok dengan kedua sisi', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'MESSI', keyword: 'ronaldo' }
    config.sides.b = { ...config.sides.b, name: 'RONALDO', keyword: 'messi' }

    render(<ActionTriggers config={config} onConfig={vi.fn()} fetchImpl={fetchCatalog} />)

    expect(screen.getAllByText(/cocok dengan KEDUA sisi/).length).toBeGreaterThan(0)
  })

  it('tidak memperingatkan apa pun untuk config bawaan', () => {
    render(<ActionTriggers config={defaultConfig()} onConfig={vi.fn()} fetchImpl={fetchCatalog} />)
    expect(screen.queryByText(/cocok dengan KEDUA sisi/)).toBeNull()
  })
})
