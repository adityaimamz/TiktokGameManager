import { describe, expect, it } from 'vitest'
import { CHARGE_END, IMPACT_AT, IMPACT_END, ultimateProgressAt, ultimateTiming } from '../src/ultimate.js'

const TICK_MS = 50

describe('ultimateTiming', () => {
  it('memakai durasi penuh, seramai apa pun antreannya', () => {
    expect(ultimateTiming(2000, TICK_MS).totalTicks).toBe(40)
  })

  it('durasi sependek apa pun tetap menghasilkan minimal satu tick', () => {
    expect(ultimateTiming(10, TICK_MS).totalTicks).toBe(1)
  })

  /*
   * Test penjaga rumus (spec §9): kalau IMPACT_AT digeser tapi perhitungan pendaratan
   * tidak ikut bergeser, progress pada tick pendaratan tidak lagi jatuh di IMPACT_AT dan
   * test ini merah. Toleransinya satu tick, karena landsAfterTicks dibulatkan.
   */
  it('progress pada tick pendaratan jatuh di IMPACT_AT', () => {
    const timing = ultimateTiming(2000, TICK_MS)
    const landed = ultimateProgressAt(timing.landsAfterTicks, timing)
    expect(landed).toBeCloseTo(IMPACT_AT, 1)
    expect(Math.abs(landed - IMPACT_AT)).toBeLessThanOrEqual(1 / timing.totalTicks)
  })
})

describe('kurva fase 6c', () => {
  it('memberi travel cukup panjang untuk salvo berjenjang', () => {
    expect(CHARGE_END).toBe(0.15)
    expect(IMPACT_AT).toBe(0.55)
    expect(IMPACT_END).toBe(0.62)
  })

  it('menyisakan impact yang tajam — di bawah 200 ms pada durasi 2600', () => {
    expect((IMPACT_END - IMPACT_AT) * 2600).toBeLessThan(200)
  })

  it('membuat travel lebih panjang daripada charge dan impact digabung', () => {
    expect(IMPACT_AT - CHARGE_END).toBeGreaterThan(CHARGE_END + (IMPACT_END - IMPACT_AT))
  })

  /*
   * Angka konkret pada durasi yang berlaku. Batas jepitan stagger di ultimate.ts diturunkan
   * dari kedua angka ini; kalau salah satunya bergeser, jepitan itu ikut bergeser dan rudal
   * terakhir bisa tiba setelah animasinya habis.
   */
  it('menghasilkan anggaran tick yang dipakai jepitan stagger', () => {
    const timing = ultimateTiming(2600, TICK_MS)
    expect(timing.totalTicks).toBe(52)
    expect(timing.landsAfterTicks).toBe(29)
  })
})

describe('ultimateProgressAt', () => {
  it('mulai di 0 dan berakhir tepat di 1', () => {
    const timing = ultimateTiming(2000, TICK_MS)
    expect(ultimateProgressAt(0, timing)).toBe(0)
    expect(ultimateProgressAt(timing.totalTicks, timing)).toBe(1)
  })

  it('tidak pernah melewati 1 walau elapsed melampaui totalTicks', () => {
    const timing = ultimateTiming(2000, TICK_MS)
    expect(ultimateProgressAt(timing.totalTicks + 99, timing)).toBe(1)
  })

  it('setiap ultimate melewati fase charge, termasuk yang sempat mengantre', () => {
    const timing = ultimateTiming(2000, TICK_MS)
    expect(ultimateProgressAt(0, timing)).toBeLessThan(CHARGE_END)
  })
})
