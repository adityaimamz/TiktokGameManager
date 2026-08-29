// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultConfig } from '../../../../../src/games/battle-arena/config/index.js'
import { bottomHalves, computeStageLayout } from '../../../../../src/games/battle-arena/renderer/layout.js'
import { ActionLegend } from '../../../../../src/games/battle-arena/renderer/hud/ActionLegend.js'
import { buildActionLegend } from '../../../../../src/games/battle-arena/triggers.js'

afterEach(cleanup)

const layout = computeStageLayout(1600, 900, 'landscape')

describe('ActionLegend', () => {
  it('renders one card per enabled rule, straight from the trigger config', () => {
    const config = defaultConfig()

    render(<ActionLegend config={config} layout={layout} />)

    expect(screen.getAllByTestId('legend-card')).toHaveLength(buildActionLegend(config).length)
  })

  it('memuat sepuluh trigger di dalam band, tanpa satu pun yang hilang', () => {
    const config = defaultConfig()
    const gift = config.triggers.find((rule) => rule.when.kind === 'gift')
    if (gift === undefined) throw new Error('expected a gift rule to clone')
    config.triggers = Array.from({ length: 10 }, (_, index) => ({
      ...gift,
      id: `gift-${index}`,
      enabled: true,
      legend: { ...gift.legend, show: true },
    }))

    render(<ActionLegend config={config} layout={layout} />)

    // Anggaran tinggi ada di komentar `ActionLegend`; yang dijaga di sini adalah tidak ada
    // kartu yang dijatah keluar seperti dulu dilakukan `railCapacity`.
    expect(screen.getAllByTestId('legend-card')).toHaveLength(10)
  })

  it('menempati separuh KANAN band bawah, bukan tepi arena', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    const band = bottomHalves(layout).legend
    const strip = screen.getByTestId('action-legend')
    expect(strip.style.left).toBe(`${band.x}px`)
    expect(strip.style.top).toBe(`${band.y}px`)
    expect(strip.style.width).toBe(`${band.width}px`)
    expect(strip.style.height).toBe(`${band.height}px`)
  })

  it('tidak menabrak separuh kiri yang dipakai panel media', () => {
    const { filler, legend } = bottomHalves(layout)

    expect(filler.x + filler.width).toBe(legend.x)
    expect(legend.x + legend.width).toBe(layout.bottom.x + layout.bottom.width)
  })

  it('tidak memberi latar apa pun pada band maupun kartunya', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    const strip = screen.getByTestId('action-legend')
    expect(strip.style.background).toBe('')
    expect(strip.style.borderTop).toBe('')
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

  it('mengurung kartunya di dalam band, berapa pun rule yang dinyalakan', () => {
    render(<ActionLegend config={defaultConfig()} layout={layout} />)

    expect(screen.getByTestId('action-legend').style.overflow).toBe('hidden')
  })

  it('menembakkan aksi rule yang benar saat sebuah kartu diklik', () => {
    const config = defaultConfig()
    const target = buildActionLegend(config).at(-1)
    if (target === undefined) throw new Error('legend tidak boleh kosong secara bawaan')
    const onFire = vi.fn()

    render(<ActionLegend config={config} layout={layout} interactive onFire={onFire} />)
    // Lewat `id`, bukan `data-testid`: testid kartu sudah dipakai nilai `legend-card`, yang
    // dipakai test lain untuk menghitung seluruh kartu.
    const button = document.getElementById(`legend-card-${target.id}`)
    if (button === null) throw new Error('kartu tidak ditemukan')
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
    // `anywhere` pernah memecah "BLACKHOLE" jadi "BLACKHOL" + "E" di kartu sempit.
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
