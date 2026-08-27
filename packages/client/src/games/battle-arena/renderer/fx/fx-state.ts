import type { InterpolatedUltimate } from '../interpolate.js'

/**
 * State lapisan FX: partikel, asap, shockwave, cahaya, guncangan, dan bekas ledakan.
 *
 * SATU objek untuk seluruh frame, dimiliki renderer dan diteruskan ke varian sebagai argumen —
 * pola yang sama dengan `UltimateImpulse`. Varian TIDAK menyimpan state sendiri; semua yang
 * harus hidup lebih lama dari satu gambar dititipkan ke sini.
 *
 * Ini lapisan PRESENTASI dan tidak menyentuh state game sedikit pun. Konsekuensinya diterima
 * sadar: isinya TIDAK deterministik lintas-tab (lihat `rnd()`), jadi ia tidak boleh dibaca
 * oleh apa pun yang menentukan damage, dan snapshot test tidak boleh menegaskan isinya.
 */

export type Rgb = readonly [number, number, number]

/** Empat kenop kalibrasi yang sudah disetel di playground. */
export interface FxTuning {
  bloom: number
  distort: number
  /** Kekuatan afterimage: 0 mematikannya, 0.7 sudah terasa seperti ekor panjang. */
  trail: number
  shake: number
}

export const FX_TUNING_DEFAULT: FxTuning = { bloom: 0.95, distort: 1, trail: 0.48, shake: 1.2 }

/**
 * Plafon partikel. 3600 adalah angka yang terukur: ledakan bomb tier 2 melepas ~250 percikan
 * sekaligus, dan salvo rudal delapan hulu ledak menahan ~2400 hidup bersamaan pada puncaknya.
 */
const PARTICLE_MAX = 3600
const SMOKE_MAX = 420
/** Batas array uniform di shader — menaikkannya berarti mengubah `uWave[6]`/`uLight[6]`. */
export const FX_WAVE_MAX = 6
export const FX_LIGHT_MAX = 6

export interface FxSmoke {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  grow: number
  /** 0 = gelap keabuan, 1 = terang. Asap ledakan gelap; kabut es hampir putih. */
  tone: number
}

export interface FxWave {
  x: number
  y: number
  t: number
  dur: number
  /** Positif MENDORONG piksel keluar, negatif MENARIKNYA — singularity memakai yang negatif. */
  strength: number
  width: number
}

export interface FxLight {
  x: number
  y: number
  r: number
  intensity: number
  col: Rgb
  t: number
  life: number
}

/** Berkas laser sebagai sumber panas untuk pass distorsi. Satu per frame, bukan daftar. */
export interface FxBeam {
  x0: number
  y0: number
  x1: number
  y1: number
  amp: number
}

/** Tarikan gravitasi: satu-satunya gaya yang bekerja balik ke partikel. */
export interface FxPull {
  x: number
  y: number
  r: number
  /** Percepatan di pusat, px/s². */
  g: number
}

export interface FxCrack {
  pts: number[][]
  w: number
  /** 0 = tanpa cabang; selain itu posisi cabang sebagai pecahan panjang retakan. */
  br: number
  ba: number
}

export interface FxDebris {
  a: number
  d: number
  s: number
  rot: number
  shard: boolean
  hop: number
  lag: number
}

export interface FxScorch {
  x: number
  y: number
  r: number
  age: number
  life: number
  seed: number
  colour: string
  cracks: FxCrack[]
  debris: FxDebris[]
}

/**
 * Decal telegraph, DITUNDA satu lapisan.
 *
 * Isian gelapnya harus mendarat DI BAWAH fighter — digambar langsung dari reticle ia akan
 * menggelapkan fighter yang berdiri di dalamnya. Reticle mengisi antrean ini, renderer
 * mengosongkannya sebelum menggambar fighter.
 */
export interface FxTelegraph {
  x: number
  y: number
  R: number
  flat: number
  k: number
  colour: string
}

/**
 * Status beku satu slot, dimiliki lapisan FX dan hanya DIBACA engine.
 *
 * `chainFreeze` menghentikan gerak fighter, dan itu satu-satunya varian yang butuh sesuatu
 * dari luar renderer. Menaruhnya di sini alih-alih memutasi `InterpolatedFighter` menjaga
 * record interpolasi tetap murni hasil snapshot: array itu dipakai ulang antar-frame, jadi
 * field tambahan di sana akan bertahan setelah ultimate-nya selesai.
 */
export interface FxFreeze {
  /** Sisa waktu tahan, ms. Selama > 0, engine harus menahan gerak slot ini. */
  held: number
  /** 0–1, seberapa penuh kristal es menutupi fighter. */
  frost: number
  /** 0–1, kemajuan animasi pecah. */
  shatter: number
}

interface FxParticles {
  n: number
  i: number
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  life: Float32Array
  max: Float32Array
  size: Float32Array
  r: Float32Array
  g: Float32Array
  b: Float32Array
  grav: Float32Array
  drag: Float32Array
  /** Pangkat peluruhan alpha. 1 = bawaan; >1 memudar lebih cepat di awal hidupnya. */
  fade: Float32Array
}

/** Tahap ledakan sekunder: `t` ms setelah `born`, sebesar `d` dari ledakan utama. */
export interface FxStage {
  t: number
  d: number
  done: boolean
}

export interface FxBag {
  seen: number
  /** Jam FX saat sesuatu di varian ini pertama kali "lahir" — dipakai untuk urutan bertahap. */
  born: number
  flags: Record<string, boolean>
  data: Record<string, number>
  stages: FxStage[]
}

export function hexRgb(hex: string): Rgb {
  const v = Number.parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

export function rgba(hex: string, alpha: number): string {
  const v = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`
}

export const fxClamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

/** Umur maksimum satu bag setelah ultimate-nya berhenti digambar. */
const BAG_TTL_MS = 2500

export class UltimateFxState {
  /** Jam lapisan FX, ms. Dimajukan renderer, dipakai untuk kedipan dan putaran. */
  clock = 0
  tuning: FxTuning = { ...FX_TUNING_DEFAULT }

  readonly particles: FxParticles = {
    n: PARTICLE_MAX,
    i: 0,
    x: new Float32Array(PARTICLE_MAX),
    y: new Float32Array(PARTICLE_MAX),
    vx: new Float32Array(PARTICLE_MAX),
    vy: new Float32Array(PARTICLE_MAX),
    life: new Float32Array(PARTICLE_MAX),
    max: new Float32Array(PARTICLE_MAX),
    size: new Float32Array(PARTICLE_MAX),
    r: new Float32Array(PARTICLE_MAX),
    g: new Float32Array(PARTICLE_MAX),
    b: new Float32Array(PARTICLE_MAX),
    grav: new Float32Array(PARTICLE_MAX),
    drag: new Float32Array(PARTICLE_MAX),
    fade: new Float32Array(PARTICLE_MAX),
  }

  readonly smoke: FxSmoke[] = []
  readonly waves: FxWave[] = []
  readonly lights: FxLight[] = []
  readonly scorch: FxScorch[] = []
  readonly telegraph: FxTelegraph[] = []
  readonly freeze = new Map<number, FxFreeze>()

  beam: FxBeam | null = null
  pull: FxPull | null = null
  readonly shake = { x: 0, y: 0, mag: 0 }

  /** Buffer NDC untuk lapisan GL. Diisi `UltimateFxPost`, bukan di sini. */
  readonly glPos = new Float32Array(PARTICLE_MAX * 3)
  readonly glCol = new Float32Array(PARTICLE_MAX * 4)
  readonly glSize = new Float32Array(PARTICLE_MAX)

  /** Jalur bolt dipakai ulang: tiga array untuk sambaran utama, cabang, dan arc. */
  readonly boltMain: number[] = []
  readonly boltBranch: number[] = []
  readonly boltArc: number[] = []

  private seed = 0x9e3779b9
  private readonly bags = new Map<number, FxBag>()

  /**
   * LCG, bukan `Math.random()`.
   *
   * Dua alasan, dan keduanya penting. Pertama, `Math.random()` dilarang di bawah games/.
   * Kedua — dan ini yang membatasi pemakaiannya — deret ini maju sesuai JUMLAH PEMANGGILAN,
   * dan varian memanggilnya sebanding `dt`. Tab dengan frame rate berbeda akan mendapat
   * percikan yang berbeda. Itu sengaja diterima untuk hiasan yang tidak menentukan apa pun,
   * dan itulah batasnya: jangan pernah pakai `rnd()` untuk sesuatu yang harus sama di dua tab.
   */
  rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  rr(a: number, b: number): number {
    return a + (b - a) * this.rnd()
  }

  /**
   * Satu titik cahaya aditif.
   *
   * `drag` bawaan 1.6 — cukup untuk percikan berhenti seperti pecahan, bukan melayang.
   */
  spark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    col: Rgb,
    grav = 0,
    drag = 1.6,
    fade = 1,
  ): void {
    const p = this.particles
    const i = p.i++ % p.n
    p.x[i] = x
    p.y[i] = y
    p.vx[i] = vx
    p.vy[i] = vy
    p.life[i] = life
    p.max[i] = life
    p.size[i] = size
    p.r[i] = col[0]
    p.g[i] = col[1]
    p.b[i] = col[2]
    p.grav[i] = grav
    p.drag[i] = drag
    p.fade[i] = fade
  }

  puff(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    grow: number,
    tone = 0.55,
  ): void {
    this.smoke.push({ x, y, vx, vy, life, max: life, size, grow, tone })
    if (this.smoke.length > SMOKE_MAX) this.smoke.shift()
  }

  wave(x: number, y: number, dur: number, strength: number, width = 0.05): void {
    this.waves.push({ x, y, t: 0, dur, strength, width })
  }

  light(x: number, y: number, r: number, intensity: number, col: Rgb, life: number): void {
    this.lights.push({ x, y, r, intensity, col, t: 0, life })
  }

  /** Guncangan DIJEPIT ke yang terbesar, tidak dijumlah: dua ledakan tidak melipat kamera. */
  kick(mag: number): void {
    this.shake.mag = Math.max(this.shake.mag, mag)
  }

  /**
   * Catatan sementara milik satu ultimate — "sudah meledak?", "kapan lahir?".
   *
   * Ditempelkan ke `u.slot`, bukan ke record-nya: array interpolasi dipakai ulang antar-frame,
   * jadi field tambahan di sana akan bocor ke ultimate berikutnya yang mengisi indeks itu.
   */
  bag(u: InterpolatedUltimate): FxBag {
    let bag = this.bags.get(u.slot)
    if (bag === undefined) {
      bag = { seen: this.clock, born: this.clock, flags: {}, data: {}, stages: [] }
      this.bags.set(u.slot, bag)
    }
    bag.seen = this.clock
    return bag
  }

  /** True HANYA pada pemanggilan pertama untuk `key` — pengganti `if (!sudahPernah)`. */
  once(u: InterpolatedUltimate, key: string): boolean {
    const bag = this.bag(u)
    if (bag.flags[key] === true) return false
    bag.flags[key] = true
    return true
  }

  /** Membaca tanpa menandai. Dipakai saat penandaannya terjadi di tempat lain. */
  flag(u: InterpolatedUltimate, key: string): boolean {
    return this.bag(u).flags[key] === true
  }

  /** Akumulator ms milik satu ultimate; dipakai untuk shockwave berulang tiap N ms. */
  tick(u: InterpolatedUltimate, key: string, dt: number, every: number): boolean {
    const bag = this.bag(u)
    const value = (bag.data[key] ?? 0) + dt
    if (value < every) {
      bag.data[key] = value
      return false
    }
    bag.data[key] = 0
    return true
  }

  holdFrozen(slot: number, ms: number, frostGain: number): void {
    const state = this.freeze.get(slot) ?? { held: 0, frost: 0, shatter: 0 }
    state.held = Math.max(state.held, ms)
    state.frost = Math.min(1, state.frost + frostGain)
    this.freeze.set(slot, state)
  }

  shatterFrozen(slot: number): void {
    const state = this.freeze.get(slot) ?? { held: 0, frost: 0, shatter: 0 }
    state.held = 0
    state.frost = 0.6
    state.shatter = 1
    this.freeze.set(slot, state)
  }

  /** Dipanggil SEBELUM varian menggambar: keduanya diisi ulang tiap frame, bukan diakumulasi. */
  beginFrame(dt: number): void {
    this.clock += dt
    this.beam = null
    this.pull = null
  }

  /**
   * Integrasi satu frame. Dipanggil SETELAH varian menggambar, supaya partikel yang baru
   * lahir sempat digambar sekali di posisi lahirnya.
   */
  update(dt: number): void {
    const p = this.particles
    const s = dt / 1000

    for (let i = 0; i < p.n; i++) {
      if ((p.life[i] as number) <= 0) continue
      p.life[i] = (p.life[i] as number) - dt
      p.vy[i] = (p.vy[i] as number) + (p.grav[i] as number) * s
      const d = Math.max(0, 1 - (p.drag[i] as number) * s)
      p.vx[i] = (p.vx[i] as number) * d
      p.vy[i] = (p.vy[i] as number) * d
      p.x[i] = (p.x[i] as number) + (p.vx[i] as number) * s
      p.y[i] = (p.y[i] as number) + (p.vy[i] as number) * s
    }

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const q = this.smoke[i] as FxSmoke
      q.life -= dt
      if (q.life <= 0) {
        this.smoke.splice(i, 1)
        continue
      }
      q.x += q.vx * s
      q.y += q.vy * s
      q.vx *= 0.985
      // Naik pelan: asap panas tidak jatuh, dan tanpa suku ini gumpalannya terlihat melayang.
      q.vy = q.vy * 0.985 - 6 * s
      q.size = Math.max(0.1, q.size + q.grow * s)
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i] as FxWave
      w.t += dt
      if (w.t > w.dur) this.waves.splice(i, 1)
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i] as FxLight
      l.t += dt
      if (l.t > l.life) this.lights.splice(i, 1)
    }

    for (let i = this.scorch.length - 1; i >= 0; i--) {
      const c = this.scorch[i] as FxScorch
      c.age += dt
      if (c.age > c.life) this.scorch.splice(i, 1)
    }

    // Gravitasi singularity: satu-satunya gaya yang menarik partikel dan asap ke satu titik.
    const pull = this.pull
    if (pull !== null) {
      for (let i = 0; i < p.n; i++) {
        if ((p.life[i] as number) <= 0) continue
        const dx = pull.x - (p.x[i] as number)
        const dy = pull.y - (p.y[i] as number)
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > pull.r || d < 2) continue
        const acc = (pull.g * (1 - d / pull.r)) / d
        p.vx[i] = (p.vx[i] as number) + dx * acc * s
        p.vy[i] = (p.vy[i] as number) + dy * acc * s
      }
      for (const q of this.smoke) {
        const dx = pull.x - q.x
        const dy = pull.y - q.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > pull.r || d < 2) continue
        const acc = (pull.g * 0.5 * (1 - d / pull.r)) / d
        q.vx += dx * acc * s
        q.vy += dy * acc * s
        // Asap yang tersedot MENGECIL dan mati lebih cepat — itu yang menjual "ditelan".
        q.size = Math.max(1, q.size - pull.g * 0.004 * s * 60)
        q.life = Math.min(q.life, q.max * 0.6)
      }
    }

    for (const [slot, state] of this.freeze) {
      state.held = Math.max(0, state.held - dt)
      if (state.shatter > 0) state.shatter = Math.max(0, state.shatter - dt / 420)
      if (state.held <= 0) state.frost = Math.max(0, state.frost - dt / 900)
      if (state.held <= 0 && state.frost <= 0 && state.shatter <= 0) this.freeze.delete(slot)
    }

    // Guncangan meluruh eksponensial; offsetnya dua sinus berbeda frekuensi supaya tidak
    // terbaca sebagai getaran satu arah.
    this.shake.mag *= Math.max(0, 1 - 6 * s)
    const m = this.shake.mag * this.tuning.shake
    this.shake.x = Math.cos(this.clock * 0.09) * m
    this.shake.y = Math.sin(this.clock * 0.13) * m

    for (const [slot, bag] of this.bags) {
      if (this.clock - bag.seen > BAG_TTL_MS) this.bags.delete(slot)
    }
  }

  /** Membuang semuanya — ronde berakhir, arena direset. */
  clear(): void {
    this.particles.life.fill(0)
    this.smoke.length = 0
    this.waves.length = 0
    this.lights.length = 0
    this.scorch.length = 0
    this.telegraph.length = 0
    this.freeze.clear()
    this.bags.clear()
    this.beam = null
    this.pull = null
    this.shake.mag = 0
    this.shake.x = 0
    this.shake.y = 0
  }
}
