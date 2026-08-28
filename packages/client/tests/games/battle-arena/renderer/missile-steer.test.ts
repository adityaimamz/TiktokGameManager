import { describe, expect, it } from 'vitest'
import { launchHeading, steerMissile } from '../../../../src/games/battle-arena/renderer/missile-steer.js'
import type { MissileState } from '../../../../src/games/battle-arena/renderer/missile-steer.js'

const RAD_PER_MS = (degPerSec: number): number => (degPerSec * Math.PI) / 180 / 1000
const blank = (): MissileState => ({ x: 0, y: 0, hx: 1, hy: 0 })
/** Jendela terbang untuk uji orbit turn-rate rendah — sengaja jauh lebih panjang. */
const SLOW_TOTAL = 2400

/** Parameter bawaan yang meniru config: 300 °/detik, 120% lebar arena per detik di 1600 px. */
const TURN = RAD_PER_MS(300)
const SPEED = 0.4
/**
 * Jendela terbang penuh: dari lepas landas sampai jadwal ledakan.
 *
 * Di produksi ia `(IMPACT_AT - CHARGE_END) × msPerProgress` ≈ 884 ms pada durasi bawaan.
 * Angka bulat di sini karena yang diuji perilakunya, bukan angkanya.
 */
const TOTAL = 800

describe('launchHeading', () => {
  it('mengembalikan vektor satuan', () => {
    const h = launchHeading(0, 0, 400, 120, 3)
    expect(Math.hypot(h.x, h.y)).toBeCloseTo(1, 6)
  })

  /*
   * Inilah yang membuat delapan lintasan berbeda-beda alih-alih delapan salinan: tanda
   * simpangan berganti-ganti per indeks, dan besarnya bervariasi menurut i % 3.
   */
  it('menyimpang ke sisi yang berlawanan untuk indeks berurutan', () => {
    const a = launchHeading(0, 0, 400, 0, 0)
    const b = launchHeading(0, 0, 400, 0, 1)
    expect(Math.sign(a.y)).not.toBe(Math.sign(b.y))
  })

  it('tidak pernah menghasilkan dua heading yang sama untuk tiga indeks pertama', () => {
    const headings = [0, 1, 2].map((i) => launchHeading(0, 0, 400, 0, i))
    const ys = headings.map((h) => h.y.toFixed(4))
    expect(new Set(ys).size).toBe(3)
  })

  it('tidak pecah saat asal dan sasaran berimpit', () => {
    const h = launchHeading(50, 50, 50, 50, 0)
    expect(Number.isFinite(h.x)).toBe(true)
    expect(Number.isFinite(h.y)).toBe(true)
  })
})

describe('steerMissile', () => {
  /*
   * INI yang dulu bocor, dan inilah alasan blok konvergensi ada.
   *
   * Simulasi kejar tidak pernah menjanjikan kedatangan: jarak yang sanggup ditempuh
   * `speed × flightMs` tidak terikat pada panjang lintasan melengkung yang dibutuhkan. Pada
   * config bawaan, tepat saat ledakan dijadwalkan kepala rudal masih 8–41% lebar arena dari
   * sasarannya — rudal jatuh di satu tempat, ledakannya muncul di tempat lain. Jendela terbang
   * habis berarti TIBA, bukan "kira-kira sampai".
   */
  it('tiba PERSIS di sasaran saat jendela terbangnya habis', () => {
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const h = launchHeading(0, 0, 400, 120, index)
      const s = steerMissile(0, 0, h.x, h.y, 400, 120, TOTAL, TOTAL, TURN, SPEED, blank())
      expect(Math.hypot(s.x - 400, s.y - 120)).toBeLessThan(1e-9)
    }
  })

  /** Frame bisa terlambat melewati jadwal; rudal tetap di sasaran, tidak melanjutkan terbang. */
  it('tetap di sasaran saat frame lewat dari jadwal kedatangan', () => {
    const h = launchHeading(0, 0, 400, 0, 0)
    const s = steerMissile(0, 0, h.x, h.y, 400, 0, TOTAL * 2, TOTAL, TURN, SPEED, blank())
    expect(s.x).toBeCloseTo(400, 6)
    expect(s.y).toBeCloseTo(0, 6)
  })

  /*
   * Tiba tepat waktu TIDAK BOLEH dibeli dengan teleportasi di frame terakhir. Langkah antar-
   * sampel 10 ms harus tetap sebesar langkah terbang biasa; koreksi yang menumpuk di ujung
   * akan terbaca sebagai rudal yang tiba-tiba tersedot ke sasaran.
   */
  it('mendekat mulus — tidak ada lompatan di ujung', () => {
    for (const index of [0, 1, 2]) {
      const h = launchHeading(0, 0, 400, 0, index)
      let prev = { x: 0, y: 0 }
      let maxJump = 0
      for (let i = 0; i <= 80; i++) {
        const p = steerMissile(0, 0, h.x, h.y, 400, 0, (i / 80) * TOTAL, TOTAL, TURN, SPEED, blank())
        if (i > 0) maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y))
        prev = { x: p.x, y: p.y }
      }
      // Langkah terukur 9–12 px (langkah integrasi 20 ms disampel tiap 10 ms). Ambangnya
      // menangkap "meloncat ke sasaran", bukan menguji satu angka pas.
      expect(maxJump).toBeLessThan(20)
    }
  })

  /*
   * Aturan pokoknya: MELENGKUNG, bukan lerp. Kalau lintasannya lurus, ia cuma garis yang
   * ditarik dan seluruh Plan 6c kehilangan alasannya.
   */
  it('melengkung, tidak lurus — menyimpang jauh dari garis lurus origin ke sasaran', () => {
    const h = launchHeading(0, 0, 400, 0, 0)
    // Simpangannya MEMUNCAK lalu kembali, jadi satu titik waktu terlalu rapuh untuk diuji:
    // yang menentukan adalah puncaknya sepanjang terbang.
    const peak = Math.max(
      ...[100, 200, 300, 400, 500, 600, 700].map((t) =>
        Math.abs(steerMissile(0, 0, h.x, h.y, 400, 0, t, TOTAL, TURN, SPEED, blank()).y),
      ),
    )
    // 10% dari jarak tempuhnya. Angka sebenarnya ~42 px untuk indeks 0; ambangnya disetel
    // longgar supaya test ini menangkap "berubah jadi lurus", bukan menguji satu angka pas.
    expect(peak).toBeGreaterThan(40 * 0.75)
  })

  it('memberi tiap indeks lengkungan yang berbeda tajamnya', () => {
    const peakFor = (index: number): number => {
      const h = launchHeading(0, 0, 400, 0, index)
      return Math.max(
        ...[100, 200, 300, 400, 500, 600, 700].map((t) =>
          Math.abs(steerMissile(0, 0, h.x, h.y, 400, 0, t, TOTAL, TURN, SPEED, blank()).y),
        ),
      )
    }

    const peaks = [0, 1, 2].map(peakFor)
    expect(peaks[0]).toBeLessThan(peaks[1] as number)
    expect(peaks[1]).toBeLessThan(peaks[2] as number)
  })

  it('memberi rudal berindeks berbeda lintasan yang berbeda', () => {
    const a = launchHeading(0, 0, 400, 0, 0)
    const b = launchHeading(0, 0, 400, 0, 1)
    const pa = steerMissile(0, 0, a.x, a.y, 400, 0, 600, TOTAL, TURN, SPEED, blank())
    const pb = steerMissile(0, 0, b.x, b.y, 400, 0, 600, TOTAL, TURN, SPEED, blank())
    expect(Math.sign(pa.y)).not.toBe(Math.sign(pb.y))
  })

  /*
   * Determinisme adalah alasan seluruh pendekatan ini dipilih: tanpa itu, tab dashboard dan
   * tab overlay akan menggambar lintasan yang berbeda karena timing frame keduanya berbeda.
   */
  it('deterministik: masukan yang sama selalu menghasilkan keluaran yang sama', () => {
    const h = launchHeading(0, 0, 400, 120, 3)
    const first = { ...steerMissile(0, 0, h.x, h.y, 400, 120, 900, TOTAL, TURN, SPEED, blank()) }
    const second = steerMissile(0, 0, h.x, h.y, 400, 120, 900, TOTAL, TURN, SPEED, blank())
    expect(second).toEqual(first)
  })

  it('mempertahankan heading sebagai vektor satuan', () => {
    const h = launchHeading(0, 0, 400, 0, 2)
    const s = steerMissile(0, 0, h.x, h.y, 400, 0, 800, TOTAL, TURN, SPEED, blank())
    expect(Math.hypot(s.hx, s.hy)).toBeCloseTo(1, 5)
  })

  it('mengembalikan titik luncur apa adanya saat belum terbang', () => {
    const h = launchHeading(0, 0, 400, 0, 0)
    const s = steerMissile(10, 20, h.x, h.y, 400, 0, 0, TOTAL, TURN, SPEED, blank())
    expect(s.x).toBe(10)
    expect(s.y).toBe(20)
  })

  /*
   * Turn rate yang rendah membuat rudal benar-benar TIDAK SANGGUP berbelok cukup tajam, jadi
   * ia melewati targetnya lalu berputar balik DI TENGAH TERBANG. Itu perilaku yang diminta,
   * bukan cacat — dan ia muncul sendiri dari batas putarnya, tidak dipalsukan. Yang berubah
   * sejak konvergensi ada hanyalah ujungnya: mengorbit selamanya tidak lagi boleh.
   */
  it('melewati target lalu berputar balik saat tidak sanggup berbelok cukup tajam', () => {
    const slow = RAD_PER_MS(90)
    // Jendela panjang supaya yang diuji BENAR-BENAR simulasinya: di tengah terbang bobot
    // konvergensi masih kecil, jadi orbitnya tidak tersamarkan olehnya.
    const h = launchHeading(0, 0, 200, 0, 1)
    const distances: number[] = []
    for (const t of [400, 800, 1200, 1600, 2000]) {
      const s = steerMissile(0, 0, h.x, h.y, 200, 0, t, SLOW_TOTAL, slow, SPEED, blank())
      distances.push(Math.hypot(s.x - 200, s.y))
    }
    // Jaraknya mengecil, membesar lagi, lalu mengecil lagi: itu tanda ia mengorbit.
    const grewAgain = distances.some((d, i) => i > 0 && d > (distances[i - 1] as number))
    expect(grewAgain).toBe(true)
  })

  it('tidak pecah saat rudal lahir tepat di atas targetnya', () => {
    const s = steerMissile(100, 100, 1, 0, 100, 100, 500, TOTAL, TURN, SPEED, blank())
    expect(Number.isFinite(s.x)).toBe(true)
    expect(Number.isFinite(s.y)).toBe(true)
  })
})
