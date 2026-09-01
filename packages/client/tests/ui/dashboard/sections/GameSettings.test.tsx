// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultConfig } from '../../../../src/games/battle-arena/config/index.js'
import { GameSettings } from '../../../../src/ui/dashboard/sections/GameSettings.js'

afterEach(cleanup)

const setup = (onConfig = vi.fn()) => {
  render(<GameSettings config={defaultConfig()} onConfig={onConfig} open onOpenChange={() => {}} />)
  return onConfig
}

describe('GameSettings', () => {
  it('menyunting nama sisi', async () => {
    const onConfig = setup()
    await userEvent.type(screen.getByLabelText('Nama Side A'), '!')
    expect(onConfig.mock.calls[0]?.[0].sides.a.name).toContain('!')
  })

  it('menyunting Base HP lewat field numerik bervalidasi', async () => {
    const onConfig = setup()
    const input = screen.getByLabelText('Base HP')
    await userEvent.clear(input)
    await userEvent.type(input, '500')
    await userEvent.tab()

    expect(onConfig.mock.calls.at(-1)?.[0].gameplay.baseHp).toBe(500)
  })

  it('menolak Base HP di luar rentang tanpa mengubah config', async () => {
    const onConfig = setup()
    const input = screen.getByLabelText('Base HP')
    await userEvent.clear(input)
    await userEvent.type(input, '99999')
    await userEvent.tab()

    expect(onConfig).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('9999')
  })

  it('menyunting rounds best-of lewat pilihan tetap', async () => {
    const onConfig = setup()
    await userEvent.selectOptions(screen.getByLabelText('Rounds (best of)'), '3')
    expect(onConfig.mock.calls[0]?.[0].gameplay.roundsBestOf).toBe(3)
  })

  it('membalik sakelar tampilan', async () => {
    const onConfig = setup()
    await userEvent.click(
      screen.getByRole('switch', { name: 'Guncangkan layar pada nuke dan pukulan besar' }),
    )
    expect(onConfig.mock.calls[0]?.[0].ui.screenShake).toBe(false)
  })

  it('menyembunyikan jumlah entri papan saat top fighters dimatikan', () => {
    const config = defaultConfig()
    config.ui.showTopFighters = false
    render(<GameSettings config={config} onConfig={() => {}} open onOpenChange={() => {}} />)
    expect(screen.queryByLabelText('Jumlah entri papan')).toBeNull()
  })

  it('mematikan satu sound event tanpa menyentuh yang lain', async () => {
    const onConfig = setup()
    await userEvent.click(screen.getByRole('switch', { name: 'Kena pukul' }))

    const next = onConfig.mock.calls[0]?.[0]
    expect(next.sound.hit.enabled).toBe(false)
    expect(next.sound.join.enabled).toBe(true)
  })

  it('tidak merender kontrol yang tidak mengendalikan apa pun di Fase 1', () => {
    setup()
    expect(screen.queryByLabelText('Interface language')).toBeNull()
    expect(screen.queryByLabelText('Overlay mode')).toBeNull()
  })

  it('menyunting jumlah kubu 2 / 4 dan menampilkan Side C & D pada mode 4 kubu', async () => {
    const onConfig = setup()
    expect(screen.queryByLabelText('Nama Side C')).toBeNull()
    expect(screen.queryByLabelText('Nama Side D')).toBeNull()

    await userEvent.selectOptions(screen.getByLabelText('Jumlah kubu'), '4')
    expect(onConfig.mock.calls[0]?.[0].gameplay.sideCount).toBe(4)

    const config4 = defaultConfig()
    config4.gameplay.sideCount = 4
    render(<GameSettings config={config4} onConfig={() => {}} open onOpenChange={() => {}} />)
    expect(screen.getByLabelText('Nama Side C')).toBeTruthy()
    expect(screen.getByLabelText('Nama Side D')).toBeTruthy()
  })
})
