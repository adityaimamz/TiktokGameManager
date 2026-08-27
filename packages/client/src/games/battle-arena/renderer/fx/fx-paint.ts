import type { RenderDeps } from '../deps.js'
import { GLOW_LAYERS, layeredGlow, strokeLayer } from '../glow.js'
import type { GlowPalette } from '../glow.js'
import { BOLT_POINTS } from '../bolt.js'
import { launchHeading, steerMissile } from '../missile-steer.js'
import type { MissileState } from '../missile-steer.js'
import { arenaLengthX, scaled } from '../layout.js'
import { clampToArena } from '../ultimate-draw.js'
import type { FrameTarget, UltimateFrame } from '../ultimate-draw.js'
import { FX_CHARGE_END, FX_IMPACT_AT } from './fx-timing.js'
import { hexRgb, rgba } from './fx-state.js'
import type { FxCrack, FxScorch, FxSmoke, UltimateFxState } from './fx-state.js'

/**
 * Perkakas gambar 2D bersama jalur FX.
 *
 * Semuanya digambar ke canvas 2D yang SAMA dengan arena — lapisan GL tidak menggambar bentuk,
 * ia hanya memproses hasil canvas ini. Karena itu setiap fungsi di sini harus tetap terbaca
 * meski pass bloom dan distorsi dimatikan; kalau sebuah efek hanya terlihat setelah bloom, ia
 * salah tempat.
 */

const missileScratch: MissileState = { x: 0, y: 0, hx: 0, hy: 0 }

/** Sasaran yang dibidik, atau pusat zona bila sisi lawan sudah kosong. */
export const fxAim = (f: UltimateFrame): FrameTarget =>
  f.targetCount > 0 ? (f.targets[0] as FrameTarget) : { x: f.tx, y: f.ty, alive: false }

/**
 * Charge: cakram di lantai, dua ring pemanggil yang berputar, dan sedotan yang mengumpul.
 *
 * Ring-nya berlawanan arah satu sama lain — itu yang membuatnya terbaca sebagai MESIN yang
 * mengisi, bukan sekadar glow yang membesar.
 */
export function drawFxCharge(
  ctx: CanvasRenderingContext2D,
  f: UltimateFrame,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): void {
  const { layout } = deps
  const nuke = deps.config.gameplay.nuke
  const k = f.local
  const radius = arenaLengthX(layout, 2.6 + k * 6.5) * f.tier.radiusMultiplier
  const pulse = 0.8 + 0.2 * Math.sin(fx.clock * 0.02)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.1 + k * 0.3
  ctx.fillStyle = f.colour
  ctx.beginPath()
  ctx.ellipse(f.ox, f.oy, radius * 3.4, radius * 1.5, 0, 0, Math.PI * 2)
  ctx.fill()
  for (let r = 0; r < 2; r++) {
    const rr = radius * (2.6 - r * 0.9) * pulse
    ctx.globalAlpha = (0.5 - r * 0.18) * (0.3 + k)
    ctx.strokeStyle = r === 0 ? '#ffffff' : f.colour
    ctx.lineWidth = scaled(layout, 1.6 - r * 0.5)
    ctx.beginPath()
    const spin = fx.clock * 0.004 * (r === 0 ? 1 : -1.6)
    for (let s = 0; s < 6; s++) {
      const a0 = spin + s * (Math.PI / 3)
      ctx.moveTo(f.ox + Math.cos(a0) * rr, f.oy + Math.sin(a0) * rr * 0.6)
      ctx.arc(f.ox, f.oy, rr, a0, a0 + 0.62)
    }
    ctx.stroke()
  }
  ctx.restore()

  layeredGlow(ctx, f.ox, f.oy, radius * (0.9 + k * 0.5), f.colour, 0.5 + k * 0.5)
  layeredGlow(ctx, f.ox, f.oy, radius * 0.45, '#ffffff', 0.4 + k * 0.6)

  const count = Math.round(nuke.particleBase * f.tier.densityMultiplier * 0.5)
  for (let i = 0; i < count; i++) {
    const a = i * 2.399 + fx.clock * 0.002
    const reach = radius * (4.2 - k * 3.4) * (0.5 + ((i * 7) % 11) / 22)
    const x = f.ox + Math.cos(a) * reach
    const y = f.oy + Math.sin(a) * reach * 0.75
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.25 + k * 0.5
    ctx.strokeStyle = f.colour
    ctx.lineWidth = scaled(layout, 1.2)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (f.ox - x) * 0.28, y + (f.oy - y) * 0.28)
    ctx.stroke()
    ctx.restore()
  }

  if (fx.rnd() < dt / 22) {
    const a = fx.rr(0, Math.PI * 2)
    const d = radius * fx.rr(2.4, 4.2)
    const px = f.ox + Math.cos(a) * d
    const py = f.oy + Math.sin(a) * d * 0.8
    fx.spark(
      px,
      py,
      (f.ox - px) * 1.9,
      (f.oy - py) * 1.9,
      fx.rr(260, 460),
      scaled(layout, fx.rr(2, 4.6)),
      hexRgb(f.colour),
      0,
      0.2,
    )
  }
  fx.light(f.ox, f.oy, arenaLengthX(layout, 14 + k * 12), 0.1 + k * 0.3, hexRgb(f.colour), 60)
  if (k > 0.93) fx.kick(scaled(layout, 1.6))
}

/**
 * Telegraph: penanda lantai yang rapat, inti tajam, tick bergradasi, dan bracket hitung mundur.
 *
 * Ia INFORMASI, bukan hiasan — penonton harus bisa menebak titik jatuh sebelum apa pun tiba.
 * Isian gelapnya dititipkan ke `fx.telegraph` supaya mendarat di bawah fighter.
 */
export function drawFxReticle(
  ctx: CanvasRenderingContext2D,
  f: UltimateFrame,
  deps: RenderDeps,
  fx: UltimateFxState,
): void {
  const { layout } = deps
  const k = f.local
  const near = Math.max(0, (k - 0.5) / 0.5)
  const pulse = 1 + 0.05 * near * Math.sin(fx.clock * 0.019)
  const flat = 0.52
  const count = f.targetCount > 0 ? f.targetCount : 1

  for (let n = 0; n < count; n++) {
    const t = f.targetCount > 0 ? (f.targets[n] as FrameTarget) : { x: f.tx, y: f.ty, alive: false }
    const open = arenaLengthX(layout, 9.6) * (1 - k * 0.5) * f.tier.radiusMultiplier
    const R = Math.max(scaled(layout, 6.5), open) * pulse

    ctx.save()
    ctx.translate(t.x, t.y)
    fx.telegraph.push({ x: t.x, y: t.y, R, flat, k, colour: f.colour })

    ctx.globalCompositeOperation = 'lighter'
    const lvl = 0.4 + k * 0.6
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6)
    cg.addColorStop(0, `rgba(255,255,255,${(0.45 * lvl + 0.25).toFixed(3)})`)
    cg.addColorStop(0.2, rgba(f.colour, 0.5 * lvl))
    cg.addColorStop(0.6, rgba(f.colour, 0.12 * lvl))
    cg.addColorStop(1, rgba(f.colour, 0))
    ctx.save()
    ctx.scale(1, flat)
    ctx.globalAlpha = 1
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.globalAlpha = 0.55 + k * 0.45
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(0, 0, scaled(layout, 1.4), scaled(layout, 1.4) * flat, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.lineWidth = scaled(layout, 1.1)
    ctx.lineCap = 'butt'
    const ticks = 12
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2 + k * 0.5
      const span = i % 3 === 0 ? scaled(layout, 6) : scaled(layout, 3.2)
      const r0 = R * 1.07
      for (let s = 0; s < 2; s++) {
        const q0 = r0 + span * (s / 2)
        const q1 = r0 + span * ((s + 1) / 2)
        ctx.globalAlpha = (0.5 + k * 0.35) * (s === 0 ? 1 : 0.38)
        ctx.strokeStyle = s === 0 ? '#ffffff' : f.colour
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * q0, Math.sin(a) * q0 * flat)
        ctx.lineTo(Math.cos(a) * q1, Math.sin(a) * q1 * flat)
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 0.14 + near * 0.36
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = scaled(layout, 0.9)
    const ro = R * 1.26
    for (let q = 0; q < 4; q++) {
      const a0 = (q * Math.PI) / 2 + k * 0.8 + 0.35
      ctx.beginPath()
      ctx.ellipse(0, 0, ro, ro * flat, 0, a0, a0 + Math.PI / 2 - 0.7)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/**
 * Kawah: lantai yang melesak dan retak, plus pecahan yang terlempar lalu mengendap.
 *
 * Bentuknya dibekukan SEKALI di sini, bukan diundi tiap frame — retakan yang berubah tiap
 * frame terlihat seperti kedipan, bukan seperti kerusakan.
 */
export function addFxScorch(
  fx: UltimateFxState,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
  colour: string,
): void {
  const cracks = []
  const n = 10 + Math.round(fx.rnd() * 3)
  for (let i = 0; i < n; i++) {
    let ang = (i / n) * Math.PI * 2 + fx.rr(-0.16, 0.16)
    let rad = r * fx.rr(0.05, 0.13)
    const reach = r * fx.rr(0.65, 1.3)
    const pts: number[][] = [[Math.cos(ang) * rad, Math.sin(ang) * rad * 0.55]]
    while (rad < reach) {
      rad += r * fx.rr(0.11, 0.2)
      ang += fx.rr(-0.3, 0.3)
      pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad * 0.55])
    }
    cracks.push({
      pts,
      w: fx.rr(0.55, 2.2),
      br: fx.rnd() < 0.55 ? fx.rr(0.4, 0.75) : 0,
      ba: fx.rr(0.5, 1.2) * (fx.rnd() < 0.5 ? -1 : 1),
    })
  }

  const debris = []
  for (let i = 0; i < 18; i++) {
    debris.push({
      a: fx.rr(0, Math.PI * 2),
      d: r * fx.rr(0.7, 1.55),
      s: scaled(deps.layout, fx.rr(1.1, 3.2)),
      rot: fx.rr(0, 3.1),
      shard: fx.rnd() < 0.55,
      hop: fx.rr(0.1, 0.5),
      lag: fx.rr(0, 0.35),
    })
  }

  fx.scorch.push({
    x,
    y,
    r: r * 0.75,
    age: 0,
    life: 1900,
    seed: fx.rr(0, 6),
    colour,
    cracks,
    debris,
  })
}

/**
 * Detonasi berlapis: dua shockwave, dua cahaya, guncangan, kawah, percikan, bara, dan asap.
 *
 * SATU pintu untuk bomb, rudal, dan burst laser. `power` mengalikan semuanya sekaligus supaya
 * ledakan sekunder benar-benar terasa lebih kecil, bukan sekadar lebih pendek.
 */
export function detonate(
  fx: UltimateFxState,
  deps: RenderDeps,
  x: number,
  y: number,
  base: number,
  colour: string,
  power: number,
): void {
  const { layout } = deps
  const col = hexRgb(colour)
  const hot: [number, number, number] = [1, 0.86, 0.6]

  fx.wave(x, y, 620 * power, 0.55 * power, 0.045)
  fx.wave(x, y, 1050 * power, 0.3 * power, 0.09)
  fx.light(x, y, base * 1.9, 0.38 * power, col, 420 * power)
  fx.light(x, y, base * 0.9, 0.6 * power, [1, 0.92, 0.78], 190 * power)
  fx.kick(scaled(layout, 9 * power))
  addFxScorch(fx, deps, x, y, base * 1.05, colour)

  const n = Math.round(190 * power)
  for (let i = 0; i < n; i++) {
    const a = fx.rr(0, Math.PI * 2)
    const sp = fx.rr(60, 620) * power
    fx.spark(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp * 0.7,
      fx.rr(320, 1000),
      scaled(layout, fx.rr(1.1, 3.4)),
      fx.rnd() < 0.55 ? hot : col,
      fx.rr(120, 420),
      fx.rr(1.2, 2.6),
    )
  }
  // Bara berat: lebih lambat, lebih gelap, jatuh lebih jauh — itu yang memberi skala.
  for (let i = 0; i < Math.round(16 * power); i++) {
    const a = fx.rr(0, Math.PI * 2)
    const sp = fx.rr(120, 380) * power
    fx.spark(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp * 0.6 - 120,
      fx.rr(700, 1300),
      scaled(layout, fx.rr(2.4, 4)),
      [0.7, 0.55, 0.42],
      520,
      0.8,
    )
  }
  for (let i = 0; i < Math.round(16 * power); i++) {
    const a = fx.rr(0, Math.PI * 2)
    const d = base * fx.rr(0.1, 0.9)
    fx.puff(
      x + Math.cos(a) * d,
      y + Math.sin(a) * d * 0.6,
      Math.cos(a) * fx.rr(15, 70) * power,
      Math.sin(a) * fx.rr(10, 40) - fx.rr(20, 60),
      fx.rr(900, 1700),
      base * fx.rr(0.14, 0.32),
      base * fx.rr(0.25, 0.55),
      fx.rr(0.05, 0.4),
    )
  }
}

/**
 * Inti bola api, dengan tepi yang BERGOLAK alih-alih lingkaran bersih.
 *
 * Lima lapis dari warna sisi ke putih. Bloom di lapisan GL yang mengubahnya jadi ledakan;
 * tanpa bloom pun ia masih terbaca sebagai bola api, dan itu syaratnya.
 */
export function fireball(
  ctx: CanvasRenderingContext2D,
  fx: UltimateFxState,
  x: number,
  y: number,
  r: number,
  colour: string,
  alpha: number,
): void {
  const rings: [number, number, string][] = [
    [1.35, 0.16, colour],
    [1, 0.3, colour],
    [0.72, 0.5, '#ffd08a'],
    [0.44, 0.8, '#fff3d0'],
    [0.2, 1, '#ffffff'],
  ]

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const g of rings) {
    ctx.globalAlpha = alpha * g[1]
    ctx.fillStyle = g[2]
    ctx.beginPath()
    const R = r * g[0]
    ctx.moveTo(x + R, y)
    for (let a = 0; a <= 56; a++) {
      const t = (a / 56) * Math.PI * 2
      const wob =
        1 +
        0.07 * Math.sin(t * 4 + fx.clock * 0.016 + g[0] * 3) +
        0.04 * Math.sin(t * 7 - fx.clock * 0.011)
      ctx.lineTo(x + Math.cos(t) * R * wob, y + Math.sin(t) * R * wob * 0.92)
    }
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** Ring kejut: garis putih tajam plus halo warna sisi yang lebih lebar dan lebih tipis. */
export function shockRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  width: number,
  alpha: number,
  colour: string,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha * 0.85
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = alpha * 0.4
  ctx.strokeStyle = colour
  ctx.lineWidth = width * 2.6
  ctx.beginPath()
  ctx.ellipse(x, y, r * 1.03, r * 0.89, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Tiga lapis satu sambaran, dijepit ke arena. `reach` memotong jalur di tengah jalan. */
export function strokeBolt(
  ctx: CanvasRenderingContext2D,
  f: UltimateFrame,
  points: readonly number[],
  reach: number,
  coreWidth: number,
  alpha: number,
  electric = '#9fd0ff',
): void {
  if (alpha <= 0) return
  const palette: GlowPalette = [f.colour, electric, '#ffffff']
  const upto = Math.max(1, Math.round((BOLT_POINTS - 1) * reach))

  for (let l = 0; l < 3; l++) {
    strokeLayer(ctx, l, palette, coreWidth, alpha)
    ctx.beginPath()
    for (let i = 0; i <= upto; i++) {
      const x = clampToArena(points[i * 2] as number, f.left, f.right)
      const y = clampToArena(points[i * 2 + 1] as number, f.top, f.bottom)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

/**
 * Kepala rudal ke-`i`, atau null bila belum lepas.
 *
 * Lintasannya diselesaikan ulang dari nol tiap frame lewat `steerMissile` — alasannya ada di
 * missile-steer.ts, dan berlaku sama di sini.
 */
export function missileHead(
  f: UltimateFrame,
  deps: RenderDeps,
  index: number,
  target: FrameTarget,
): MissileState | null {
  const u = f.source
  const launch = FX_CHARGE_END + index * u.staggerProgress
  if (f.progress < launch) return null

  const m = deps.config.gameplay.nuke.missile
  const h = launchHeading(f.ox, f.oy, target.x, target.y, index)
  return steerMissile(
    f.ox,
    f.oy,
    h.x,
    h.y,
    target.x,
    target.y,
    (f.progress - launch) * u.msPerProgress,
    // Jendela terbang penuh: lepas di CHARGE_END, mendarat di IMPACT_AT. Stagger menggeser
    // keduanya sama banyak, jadi panjangnya sama untuk rudal ke berapa pun.
    (FX_IMPACT_AT - FX_CHARGE_END) * u.msPerProgress,
    (m.turnRateDegPerSec * Math.PI) / 180 / 1000,
    arenaLengthX(deps.layout, m.speedPctPerSec) / 1000,
    missileScratch,
  )
}

/**
 * Satu retakan sebagai SATU path — batang plus cabangnya.
 *
 * Fungsi modul, bukan closure di dalam loop gambar: `strokeLayer` menelusuri path sekali per
 * lapis, jadi ini dipanggil tiga kali per retakan per frame (aturan yang sama dengan komentar
 * di `glow.ts` soal alokasi per garis per frame).
 */
function traceCrack(
  ctx: CanvasRenderingContext2D,
  s: FxScorch,
  c: FxCrack,
  lim: number,
  R: number,
): void {
  ctx.beginPath()
  for (let i = 0; i < lim; i++) {
    const p = c.pts[i] as number[]
    const x = s.x + (p[0] as number)
    const y = s.y + (p[1] as number)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  if (c.br <= 0 || lim <= 3) return
  const p = c.pts[Math.floor(lim * c.br)] as number[]
  const q = c.pts[lim - 1] as number[]
  ctx.moveTo(s.x + (p[0] as number), s.y + (p[1] as number))
  ctx.lineTo(
    s.x + (p[0] as number) + ((q[0] as number) - (p[0] as number)) * 0.6 + Math.cos(c.ba) * R * 0.2,
    s.y + (p[1] as number) + ((q[1] as number) - (p[1] as number)) * 0.6 + Math.sin(c.ba) * R * 0.11,
  )
}

/**
 * Decal lantai: kawah dan isian telegraph. Digambar SEBELUM fighter.
 *
 * Antrean telegraph dikosongkan di sini — pengisinya `drawFxReticle`, dan satu frame hanya
 * boleh memakai isinya sekali.
 */
export function drawFxDecals(
  ctx: CanvasRenderingContext2D,
  fx: UltimateFxState,
  deps: RenderDeps,
): void {
  const { layout } = deps

  for (const s of fx.scorch) {
    const t = s.age / s.life
    const k = 1 - t
    const fade = k * k
    const R = s.r
    // Retakan berlari keluar dalam ~0.26 detik pertama, lalu berhenti dan tinggal memudar.
    const spread = Math.min(1, s.age / 260)
    const e = 1 - (1 - spread) ** 3
    const tint = s.colour

    ctx.save()
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(1, R * e))
    g.addColorStop(0, `rgba(3,4,7,${(0.62 * k).toFixed(3)})`)
    g.addColorStop(0.5, `rgba(9,11,15,${(0.44 * k).toFixed(3)})`)
    g.addColorStop(0.85, `rgba(22,24,30,${(0.24 * k).toFixed(3)})`)
    g.addColorStop(1, 'rgba(22,24,30,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(s.x, s.y, R * e, R * 0.55 * e, 0, 0, Math.PI * 2)
    ctx.fill()

    // Bibir kawah: sisi atas tersorot, sisi bawah lebih gelap. Itu yang membuatnya melesak.
    ctx.globalAlpha = 0.26 * k
    ctx.strokeStyle = '#9aa4b6'
    ctx.lineWidth = scaled(layout, 1.5)
    ctx.beginPath()
    ctx.ellipse(
      s.x,
      s.y - scaled(layout, 1),
      R * 0.93 * e,
      R * 0.5 * e,
      0,
      Math.PI * 1.05,
      Math.PI * 1.95,
    )
    ctx.stroke()
    ctx.globalAlpha = 0.3 * k
    ctx.strokeStyle = '#05060a'
    ctx.lineWidth = scaled(layout, 2.2)
    ctx.beginPath()
    ctx.ellipse(
      s.x,
      s.y + scaled(layout, 1),
      R * 0.95 * e,
      R * 0.52 * e,
      0,
      Math.PI * 0.1,
      Math.PI * 0.9,
    )
    ctx.stroke()

    ctx.lineCap = 'round'
    const lims: number[] = []
    for (const c of s.cracks) lims.push(Math.max(2, Math.ceil(c.pts.length * e)))

    // Garis gelap dulu: ia yang memberi retakan BENTUK, dan hanya itu tugasnya sekarang.
    ctx.globalAlpha = 0.55 * k
    ctx.strokeStyle = '#04050a'
    for (let i = 0; i < s.cracks.length; i++) {
      const c = s.cracks[i] as FxCrack
      ctx.lineWidth = scaled(layout, c.w)
      traceCrack(ctx, s, c, lims[i] as number, R)
      ctx.stroke()
    }

    /*
     * Rekahan yang MENYALA, bukan sekadar gelap — dan sepanjang retakan, bukan di pangkalnya.
     *
     * Tinta gelap tidak bisa menang di jalur FX: pass akhir MENJUMLAHKAN bloom lalu mengambil
     * `max` terhadap frame sebelumnya, jadi apa pun yang lebih gelap dari sekitarnya diampelas.
     * Selama lantai arena hitam itu tidak kelihatan; sejak latarnya boleh sebuah FOTO, kawah
     * gelap di atas kaus putih hilang sama sekali. Garis panas justru DIPERKUAT pipeline yang
     * sama, dan terbaca di atas latar apa pun — termasuk saat bloom dimatikan, sesuai aturan
     * berkas ini.
     *
     * Panasnya surut lebih cepat dari kawahnya (pangkat tiga, bukan kuadrat seperti `fade`):
     * yang tersisa di detik terakhir memang harus tinggal bekas gelap, bukan bara abadi.
     */
    const heat = k * k * k
    const palette: GlowPalette = [tint, tint, '#fff3d8']
    for (let layer = 0; layer < GLOW_LAYERS; layer++) {
      for (let i = 0; i < s.cracks.length; i++) {
        const c = s.cracks[i] as FxCrack
        strokeLayer(ctx, layer, palette, Math.max(0.7, scaled(layout, c.w * 0.45)), heat)
        traceCrack(ctx, s, c, lims[i] as number, R)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 0.22 * fade
    const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(1, R * 0.55))
    hg.addColorStop(0, rgba(tint, 0.85))
    hg.addColorStop(1, rgba(tint, 0))
    ctx.fillStyle = hg
    ctx.beginPath()
    ctx.ellipse(s.x, s.y, R * 0.55, R * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()

    // Pecahan: terlempar cepat, lalu mengendap dan memudar di bibir kawah.
    ctx.globalCompositeOperation = 'source-over'
    for (const d of s.debris) {
      const p = Math.min(1, Math.max(0, s.age / 300 - d.lag))
      const out = 1 - (1 - p) ** 2.4
      const dist = d.d * (0.18 + out * 0.82)
      const hop = Math.sin(Math.min(1, p) * Math.PI) * d.d * d.hop
      const x = s.x + Math.cos(d.a) * dist
      const y = s.y + Math.sin(d.a) * dist * 0.55 - hop
      ctx.globalAlpha = 0.55 * k * (0.35 + 0.65 * p)
      ctx.fillStyle = d.shard ? '#151821' : '#22262f'
      if (d.shard) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(d.rot + p * 3)
        ctx.beginPath()
        ctx.moveTo(-d.s, d.s * 0.5)
        ctx.lineTo(0, -d.s)
        ctx.lineTo(d.s, d.s * 0.4)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 0.3 * k
        ctx.fillStyle = rgba(tint, 0.9)
        ctx.beginPath()
        ctx.moveTo(0, -d.s)
        ctx.lineTo(d.s * 0.5, d.s * 0.1)
        ctx.lineTo(d.s * 0.1, d.s * 0.15)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.ellipse(x, y, d.s * 0.8, d.s * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  for (const t of fx.telegraph) {
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.globalAlpha = 0.3 + t.k * 0.22
    ctx.fillStyle = '#04060b'
    ctx.beginPath()
    ctx.ellipse(0, 0, t.R * 0.98, t.R * 0.98 * t.flat, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.55 + t.k * 0.35
    ctx.strokeStyle = rgba(t.colour, 0.95)
    ctx.lineWidth = scaled(layout, 1.4)
    ctx.beginPath()
    ctx.ellipse(0, 0, t.R, t.R * t.flat, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  fx.telegraph.length = 0
}

/** Asap, digambar DI ATAS fighter: gumpalan yang lewat di depan justru yang memberi kedalaman. */
export function drawFxSmoke(ctx: CanvasRenderingContext2D, fx: UltimateFxState): void {
  ctx.save()
  for (const p of fx.smoke as FxSmoke[]) {
    if (p.size <= 0) continue
    const k = p.life / p.max
    ctx.globalAlpha = 0.3 * k
    const tone = Math.round(26 + p.tone * 70)
    ctx.fillStyle = `rgb(${tone},${tone + 4},${tone + 12})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

