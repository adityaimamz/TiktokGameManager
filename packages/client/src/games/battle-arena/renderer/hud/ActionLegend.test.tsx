// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultConfig } from '../../config/index.js'
import { computeStageLayout, scaled } from '../layout.js'
import { ActionLegend } from './ActionLegend.js'
import { RAIL_BOTTOM_RESERVE_PX, legendRails, railTopReservePx } from './view-model.js'

afterEach(cleanup)

const layout = computeStageLayout(1600, 900, 'landscape')

describe('ActionLegend', () => {
  it('renders one card per enabled rule, straight from the trigger config', () => {
    const config = defaultConfig()
    const rails = legendRails(config)

    render(<ActionLegend config={config} layout={layout} />)

    expect(screen.getAllByTestId('legend-card')).toHaveLength(
      rails.left.length + rails.right.length,
    )
  })

  it('menggambar dua rail di dalam arena, bukan di band bawah', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    const left = screen.getByTestId('legend-rail-left')
    const right = screen.getByTestId('legend-rail-right')
    const top = layout.arena.y + scaled(layout, railTopReservePx(defaultConfig()))
    expect(left.style.top).toBe(`${top}px`)
    expect(right.style.top).toBe(`${top}px`)
    expect(left.style.left).toBe(`${layout.arena.x}px`)
    expect(right.style.left).toBe(`${layout.arena.x + layout.arena.width * (1 - 0.17)}px`)
  })

  it('tidak memberi latar apa pun pada rail maupun kartunya', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    for (const rail of [
      screen.getByTestId('legend-rail-left'),
      screen.getByTestId('legend-rail-right'),
    ]) {
      expect(rail.style.background).toBe('')
      expect(rail.style.borderTop).toBe('')
    }
    for (const card of screen.getAllByTestId('legend-card')) {
      expect(card.style.background).toBe('')
      expect(card.style.border).toBe('')
      expect(card.style.boxShadow).toBe('')
    }
  })

  it('membungkus teks yang kepanjangan, tidak memotongnya jadi "…"', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'Team Messi Yang Sangat Panjang Namanya' }

    render(<ActionLegend config={config} layout={layout} />)

    // Caption utuh, bukan potongan: petunjuk yang terpotong tidak bisa dijalankan penonton.
    expect(screen.getByTestId('action-legend').textContent).toContain(
      'JOIN TEAM MESSI YANG SANGAT PANJANG NAMANYA',
    )
    for (const card of screen.getAllByTestId('legend-card')) {
      for (const span of card.querySelectorAll('span')) {
        expect(span.style.textOverflow).toBe('')
        expect(span.style.whiteSpace).not.toBe('nowrap')
      }
    }
  })

  it('mengurung rail di dalam arena, di atas pil status', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    const config = defaultConfig()
    const rail = screen.getByTestId('legend-rail-right')
    const reserved = railTopReservePx(config) + RAIL_BOTTOM_RESERVE_PX
    expect(rail.style.overflow).toBe('hidden')
    expect(rail.style.height).toBe(`${layout.arena.height - scaled(layout, reserved)}px`)
  })

  it('menembakkan aksi rule yang benar saat kartu di rail kanan diklik', () => {
    const config = defaultConfig()
    const target = legendRails(config).right[0]
    if (target === undefined) throw new Error('rail kanan tidak boleh kosong secara bawaan')
    const onFire = vi.fn()

    render(<ActionLegend config={config} layout={layout} interactive onFire={onFire} />)
    // Lewat `id`, bukan `data-testid`: testid kartu sudah dipakai nilai `legend-card`, yang
    // dipakai test lain untuk menghitung seluruh kartu di kedua rail.
    const button = document.getElementById(`legend-card-right-${target.id}`)
    if (button === null) throw new Error('kartu rail kanan tidak ditemukan')
    fireEvent.click(button)

    expect(onFire).toHaveBeenCalledTimes(1)
    expect(onFire.mock.calls[0]?.[0].ruleId).toBe(target.id)
  })

  it('shows the keyword viewers must type and what it does', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'Team Messi', keyword: 'messi' }

    render(<ActionLegend config={config} layout={layout} />)

    const text = screen.getByTestId('action-legend').textContent ?? ''
    expect(text).toContain('"messi"')
    expect(text).toContain('JOIN TEAM MESSI')
  })

  it('shows the like threshold that is actually in force', () => {
    const config = defaultConfig()
    config.likes.threshold = 25

    render(<ActionLegend config={config} layout={layout} />)

    expect(screen.getByTestId('action-legend').textContent).toContain('x25')
  })

  it('drops a rule the creator disabled', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.id === 'grow-hp')
    if (rule === undefined) throw new Error('expected the default grow rule')
    rule.enabled = false

    render(<ActionLegend config={config} layout={layout} />)

    expect(screen.getByTestId('action-legend').textContent).not.toContain('GROW HP')
  })

  it('draws the real gift image for a gift rule, and the emoji for the rest', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.when.kind === 'gift')
    if (rule === undefined || rule.when.kind !== 'gift') throw new Error('expected a gift rule')
    rule.enabled = true
    const name = rule.when.giftNames[0]
    if (name === undefined) throw new Error('expected the gift rule to name a gift')

    render(
      <ActionLegend
        config={config}
        layout={layout}
        giftIcons={new Map([[name.toLowerCase(), 'https://cdn/gift.png']])}
      />,
    )

    const icons = screen.getAllByTestId('legend-gift-icon')
    expect(icons).toHaveLength(1)
    expect(icons[0]?.getAttribute('src')).toBe('https://cdn/gift.png')
  })

  it('drops the gift name once its real image is on the card', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.when.kind === 'gift')
    if (rule === undefined || rule.when.kind !== 'gift') throw new Error('expected a gift rule')
    rule.enabled = true
    rule.legend.show = true
    const name = rule.when.giftNames[0]
    if (name === undefined) throw new Error('expected the gift rule to name a gift')

    const { container } = render(
      <ActionLegend
        config={config}
        layout={layout}
        giftIcons={new Map([[name.toLowerCase(), 'https://cdn/gift.png']])}
      />,
    )

    expect(container.textContent).toContain(rule.legend.caption.toUpperCase())
    expect(container.textContent).not.toContain(name.toUpperCase())
  })

  it('keeps the gift name when the card falls back to the emoji', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.when.kind === 'gift')
    if (rule === undefined || rule.when.kind !== 'gift') throw new Error('expected a gift rule')
    rule.enabled = true
    rule.legend.show = true
    const name = rule.when.giftNames[0]
    if (name === undefined) throw new Error('expected the gift rule to name a gift')

    const { container } = render(<ActionLegend config={config} layout={layout} />)

    // Tanpa gambar, 🎁 tidak menyebut hadiah mana pun — namanya satu-satunya petunjuk.
    expect(container.textContent).toContain(name.toUpperCase())
  })

  it('falls back to the emoji when the catalog has no image for that gift', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} giftIcons={new Map()} />)

    expect(screen.queryAllByTestId('legend-gift-icon')).toHaveLength(0)
  })

  it('never breaks a caption in the middle of a word', () => {
    // `anywhere` pernah memecah "BLACKHOLE" jadi "BLACKHOL" + "E" di rail sempit.
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    for (const card of screen.getAllByTestId('legend-card')) {
      for (const span of card.querySelectorAll('span')) {
        expect(['', 'normal']).toContain((span as HTMLElement).style.overflowWrap)
      }
    }
  })

  it('is inert on the overlay: no buttons at all', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('fires the rule action when a card is clicked in interactive mode', () => {
    const onFire = vi.fn()
    const config = defaultConfig()

    render(<ActionLegend config={config} layout={layout} interactive onFire={onFire} />)
    const cards = screen.getAllByRole('button')
    fireEvent.click(cards[0] as HTMLElement)

    expect(onFire).toHaveBeenCalledTimes(1)
    expect(onFire.mock.calls[0]?.[0]).toMatchObject({ type: 'spawn', target: 'side:a' })
    expect(onFire.mock.calls[0]?.[0]?.actor?.platform).toBe('creator')
  })

  it('gives each click a distinct synthetic viewer, so clicking twice spawns two fighters', () => {
    const onFire = vi.fn()

    render(<ActionLegend config={defaultConfig()} layout={layout} interactive onFire={onFire} />)
    const card = screen.getAllByRole('button')[0] as HTMLElement
    fireEvent.click(card)
    fireEvent.click(card)

    const first = onFire.mock.calls[0]?.[0]?.actor?.username
    const second = onFire.mock.calls[1]?.[0]?.actor?.username
    expect(first).not.toBe(second)
  })
})
