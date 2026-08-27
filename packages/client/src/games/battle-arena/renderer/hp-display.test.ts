import { describe, expect, it } from 'vitest'
import { HP_CATCHUP_MS, HpDisplay, SIZE_GROW_MS, SIZE_OVERSHOOT } from './hp-display.js'
import type { InterpolatedFighter } from './interpolate.js'

const fighter = (slotIndex: number, hp: number, maxHp = 200): InterpolatedFighter => ({
  slotIndex,
  x: 0,
  y: 0,
  hp,
  maxHp,
  side: 0,
  alive: 1,
  facingAngle: 0,
  targetSlot: -1,
  kills: 0,
  giftCoins: 0,
})

describe('HpDisplay', () => {
  it('slot yang baru terlihat langsung memakai nilai sebenarnya', () => {
    const display = new HpDisplay()
    display.observe([fighter(0, 200)], 1, 0)
    expect(display.hpFor(0, 200)).toBe(200)
  })

  it('mengejar turun, tidak melompat', () => {
    const display = new HpDisplay()
    display.observe([fighter(0, 200)], 1, 0)
    display.observe([fighter(0, 100)], 1, HP_CATCHUP_MS / 2)

    const shown = display.hpFor(0, 100)
    expect(shown).toBeLessThan(200)
    expect(shown).toBeGreaterThan(100)
  })

  it('sampai persis di nilai sebenarnya setelah HP_CATCHUP_MS', () => {
    const display = new HpDisplay()
    display.observe([fighter(0, 200)], 1, 0)
    display.observe([fighter(0, 100)], 1, HP_CATCHUP_MS)
    expect(display.hpFor(0, 100)).toBe(100)
  })

  it('kenaikan HP tidak dianimasikan — heal harus terasa seketika', () => {
    const display = new HpDisplay()
    display.observe([fighter(0, 100)], 1, 0)
    display.observe([fighter(0, 200)], 1, 10)
    expect(display.hpFor(0, 200)).toBe(200)
  })

  /*
   * Damage yang datang beruntun tidak boleh menyentak bar mundur: pukulan kedua bermula
   * dari nilai yang SEDANG digambar, bukan dari target pukulan pertama.
   */
  it('pukulan susulan melanjutkan dari nilai yang sedang digambar', () => {
    const display = new HpDisplay()
    display.observe([fighter(0, 200)], 1, 0)
    display.observe([fighter(0, 100)], 1, 50)
    const midway = display.hpFor(0, 100)
    display.observe([fighter(0, 90)], 1, 100)

    expect(display.hpFor(0, 90)).toBeLessThanOrEqual(midway)
    expect(display.hpFor(0, 90)).toBeGreaterThan(90)
  })

  /*
   * Slot didaur ulang: yang muncul kembali adalah fighter LAIN atau ronde baru, bukan
   * penyembuhan. Mengejar dari HP korban sebelumnya akan membuat bar-nya merayap naik.
   */
  it('slot yang hilang lalu kembali mulai dari nilai sebenarnya', () => {
    const display = new HpDisplay()
    display.observe([fighter(0, 200)], 1, 0)
    display.observe([fighter(0, 20)], 1, HP_CATCHUP_MS)
    display.observe([], 0, HP_CATCHUP_MS + 10)
    display.observe([fighter(0, 200)], 1, HP_CATCHUP_MS + 20)

    expect(display.hpFor(0, 200)).toBe(200)
  })

  it('slot yang tidak dikenal menjawab nilai sebenarnya, bukan nol', () => {
    expect(new HpDisplay().hpFor(42, 175)).toBe(175)
  })
})

/**
 * Track UKURAN: turun mengejar seperti bar, tapi NAIK beranimasi dan melewati batas.
 *
 * Kelas yang sama dengan bar, opsi yang berbeda. Yang diuji di sini justru bagian yang
 * TIDAK berlaku untuk bar — kalau keduanya diam-diam dibuat sama lagi, dua test pertama
 * di bawah ini gagal.
 */
describe('HpDisplay sebagai track ukuran', () => {
  const track = () => new HpDisplay({ riseMs: SIZE_GROW_MS, overshoot: SIZE_OVERSHOOT })
  const at = (hp: number) =>
    [{ slotIndex: 0, hp, maxHp: 300, alive: 1 }] as unknown as InterpolatedFighter[]

  it('menganimasikan HP yang NAIK, tidak melompat seperti bar', () => {
    const size = track()
    size.observe(at(100), 1, 0)
    size.observe(at(200), 1, 50)

    const shown = size.hpFor(0, 200)
    expect(shown).toBeGreaterThan(100)
    expect(shown).toBeLessThan(200)
  })

  /**
   * Jendelanya dihitung dari frame TERAKHIR yang sudah digambar — sama seperti bar — jadi
   * di sini ia mulai di 0, bukan di 50, dan puncak lewat-batasnya lewat pada ~100 ms.
   */
  it('melewati targetnya di tengah jalan sebelum kembali', () => {
    const size = track()
    size.observe(at(100), 1, 0)
    size.observe(at(200), 1, 50)
    size.observe(at(200), 1, 100)

    expect(size.hpFor(0, 200)).toBeGreaterThan(200)
  })

  it('mendarat tepat di targetnya setelah jendelanya habis', () => {
    const size = track()
    size.observe(at(100), 1, 0)
    size.observe(at(200), 1, 50)
    size.observe(at(200), 1, SIZE_GROW_MS + 50)

    expect(size.hpFor(0, 200)).toBe(200)
  })

  it('tetap turun dengan kurva bar, tanpa pantulan', () => {
    const size = track()
    size.observe(at(200), 1, 0)
    size.observe(at(100), 1, 100)
    size.observe(at(100), 1, 100 + HP_CATCHUP_MS / 2)

    const shown = size.hpFor(0, 100)
    expect(shown).toBeLessThan(200)
    expect(shown).toBeGreaterThan(100)
  })
})
