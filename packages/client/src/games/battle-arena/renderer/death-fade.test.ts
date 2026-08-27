import { describe, expect, it } from 'vitest'
import { SIDE_A } from '@lga/shared'
import { DEATH_FADE_MS, DeathFade } from './death-fade.js'
import type { InterpolatedFighter } from './interpolate.js'

const fighter = (slotIndex: number, alive: number): InterpolatedFighter => ({
  slotIndex,
  x: 25,
  y: 50,
  hp: alive === 1 ? 100 : 0,
  maxHp: 100,
  side: SIDE_A,
  alive,
  facingAngle: 0,
  targetSlot: -1,
  kills: 0,
  giftCoins: 0,
})

describe('DeathFade', () => {
  it('fades from 1 to 0 across DEATH_FADE_MS after a death it watched happen', () => {
    const fade = new DeathFade()
    fade.observe([fighter(0, 1)], 1, 1000)
    fade.observe([fighter(0, 0)], 1, 1050)

    expect(fade.alphaFor(0, 1050)).toBe(1)
    expect(fade.alphaFor(0, 1050 + DEATH_FADE_MS / 2)).toBeCloseTo(0.5)
    expect(fade.alphaFor(0, 1050 + DEATH_FADE_MS)).toBe(0)
    expect(fade.alphaFor(0, 9999)).toBe(0)
  })

  it('treats a death it never watched as already over', () => {
    const fade = new DeathFade()
    // Slot pertama kali terlihat SUDAH mati — persis keadaan setelah resize jendela.
    fade.observe([fighter(3, 0)], 1, 1000)

    expect(fade.alphaFor(3, 1000)).toBe(0)
    expect(fade.alphaFor(3, 1001)).toBe(0)
  })

  it('returns 0 for a slot it has never seen at all', () => {
    expect(new DeathFade().alphaFor(7, 1000)).toBe(0)
  })

  it('keeps the original moment of death across later frames', () => {
    const fade = new DeathFade()
    fade.observe([fighter(0, 1)], 1, 1000)
    fade.observe([fighter(0, 0)], 1, 1050)
    fade.observe([fighter(0, 0)], 1, 1100)
    fade.observe([fighter(0, 0)], 1, 1150)

    // Kalau stempelnya diperbarui tiap frame, fade tidak akan pernah selesai.
    expect(fade.alphaFor(0, 1050 + DEATH_FADE_MS)).toBe(0)
  })

  it('forgets a slot that comes back alive, so a rejoin draws solid', () => {
    const fade = new DeathFade()
    fade.observe([fighter(0, 1)], 1, 1000)
    fade.observe([fighter(0, 0)], 1, 1050)
    fade.observe([fighter(0, 1)], 1, 1100)
    fade.observe([fighter(0, 0)], 1, 2000)

    expect(fade.alphaFor(0, 2000)).toBe(1)
  })

  it('ignores entries past count, which the pooled array keeps stale', () => {
    const fade = new DeathFade()
    const list = [fighter(0, 1), fighter(1, 1)]
    fade.observe(list, 2, 1000)
    // Slot 1 keluar dari roster; array dipakai ulang dan tidak pernah dipendekkan.
    fade.observe([fighter(0, 0), fighter(1, 0)], 1, 1050)

    expect(fade.alphaFor(0, 1050)).toBe(1)
    expect(fade.alphaFor(1, 1050)).toBe(0)
  })
})
