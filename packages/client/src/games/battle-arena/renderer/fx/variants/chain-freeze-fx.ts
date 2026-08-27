import type { RenderDeps } from '../../deps.js'
import { arenaLengthX, scaled } from '../../layout.js'
import { layeredGlow } from '../../glow.js'
import type { InterpolatedUltimate } from '../../interpolate.js'
import type { FrameTarget } from '../../ultimate-draw.js'
import { drawUltimateFxArt, fighterOf } from '../fx-art.js'
import type { UltimateFxArt } from '../fx-art.js'
import { drawFxCharge, drawFxReticle } from '../fx-paint.js'
import { fxClamp } from '../fx-state.js'
import type { Rgb, UltimateFxState } from '../fx-state.js'
import { FX_CHARGE_END, FX_IMPACT_AT } from '../fx-timing.js'

/**
 * Chain Freeze — rantai es yang menjalar dari sasaran ke sasaran, MENAHAN, lalu memecahkan.
 *
 * Satu-satunya varian yang meminta sesuatu dari luar renderer: selama kristalnya berdiri,
 * fighter harus BERHENTI. Statusnya dititipkan lewat `fx.holdFrozen()`/`fx.shatterFrozen()`
 * dan dibaca engine dari `UltimateFxState.freeze` — renderer sendiri tidak pernah memutasi
 * fighter, karena array interpolasi dipakai ulang antar-frame.
 */
type P2 = [number, number]

interface Node2 {
  x: number
  y: number
}

interface IcePoint {
  x: number
  y: number
  t: number
}

interface Pillar {
  bx: number
  by: number
  h: number
  w: number
  sd: number
  grow?: number
  lead?: boolean
}

interface Chip {
  x: number
  y: number
  r: number
  a: number
  k: number
}

function pillarBase(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.08
  ctx.fillStyle = '#a9ddf7'
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/** Satu kristal: dua sisi berbayang beda, isi yang menyala dari dalam, facet tipis di atasnya. */
function pillarSolid(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  hh: number,
  w: number,
  seed: number,
  glint: boolean,
): void {
  const tilt = Math.sin(seed * 2.3) * w * 0.55
  const tx = x + tilt, ty = y - hh
  const mx = x + tilt * 0.52, my = y - hh * 0.52
  const bw = w, mw = w * 0.66, sw = w * 0.3
  const tip = ty - hh * 0.1 - w * 1.7
  const A: P2 = [tx, tip]
  const bL: P2 = [x - bw, y]
  const bM: P2 = [x + bw * 0.14, y + w * 0.24]
  const bR: P2 = [x + bw, y - w * 0.08]
  const mL: P2 = [mx - mw, my]
  const mM: P2 = [mx + mw * 0.16, my + w * 0.16]
  const mR: P2 = [mx + mw, my - w * 0.04]
  const sL: P2 = [tx - sw, ty]
  const sM: P2 = [tx + sw * 0.2, ty + w * 0.12]
  const sR: P2 = [tx + sw, ty - w * 0.05]
  const poly = (pts: P2[]): void => {
    ctx.beginPath()
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))
    ctx.closePath()
  }
  ctx.save()
  // lit face
  const g1 = ctx.createLinearGradient(bL[0], y, A[0], tip)
  g1.addColorStop(0, 'rgba(112,172,212,0.88)')
  g1.addColorStop(0.5, 'rgba(158,212,238,0.9)')
  g1.addColorStop(1, 'rgba(224,246,255,0.95)')
  ctx.fillStyle = g1
  poly([bL, mL, sL, A, sM, mM, bM]); ctx.fill()
  // shaded face
  const g2 = ctx.createLinearGradient(bR[0], y, A[0], tip)
  // Nyaris pekat, dan itu perlu: sisi gelap kristal setengah tembus di atas latar FOTO
  // memperlihatkan gambar di baliknya, dan bentuk tiga-mukanya hilang sama sekali.
  g2.addColorStop(0, 'rgba(22,58,98,0.95)')
  g2.addColorStop(0.6, 'rgba(48,102,148,0.94)')
  g2.addColorStop(1, 'rgba(96,158,200,0.92)')
  ctx.fillStyle = g2
  poly([bM, mM, sM, A, sR, mR, bR]); ctx.fill()
  // lit from within
  ctx.globalCompositeOperation = 'lighter'
  const ge = ctx.createLinearGradient(x, y, tx, tip)
  ge.addColorStop(0, 'rgba(90,175,235,0.01)')
  ge.addColorStop(0.42, 'rgba(122,196,240,0.13)')
  ge.addColorStop(0.85, 'rgba(170,222,250,0.07)')
  ge.addColorStop(1, 'rgba(220,245,255,0.02)')
  ctx.fillStyle = ge
  poly([[x - bw * 0.42, y], [mx - mw * 0.4, my], A, [mx + mw * 0.3, my + w * 0.1], [x + bw * 0.34, y + w * 0.12]])
  ctx.fill()
  // edges: bright on the lit side, faint elsewhere
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 0.9)
  ctx.beginPath(); ctx.moveTo(bL[0], bL[1]); ctx.lineTo(mL[0], mL[1]); ctx.lineTo(sL[0], sL[1]); ctx.lineTo(A[0], A[1]); ctx.stroke()
  ctx.globalAlpha = 0.22
  ctx.lineWidth = scaled(deps.layout, 0.8)
  ctx.beginPath(); ctx.moveTo(bM[0], bM[1]); ctx.lineTo(mM[0], mM[1]); ctx.lineTo(sM[0], sM[1]); ctx.lineTo(A[0], A[1]); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(bR[0], bR[1]); ctx.lineTo(mR[0], mR[1]); ctx.lineTo(sR[0], sR[1]); ctx.lineTo(A[0], A[1]); ctx.stroke()
  // shoulder and waist facets
  ctx.globalAlpha = 0.16
  ctx.beginPath(); ctx.moveTo(sL[0], sL[1]); ctx.lineTo(sM[0], sM[1]); ctx.lineTo(sR[0], sR[1]); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(mL[0], mL[1]); ctx.lineTo(mM[0], mM[1]); ctx.lineTo(mR[0], mR[1]); ctx.stroke()
  ctx.globalAlpha = 0.2
  ctx.beginPath(); ctx.moveTo(mL[0], mL[1]); ctx.lineTo(sM[0], sM[1]); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(mM[0], mM[1]); ctx.lineTo(sR[0], sR[1]); ctx.stroke()
  if (glint) {
    const gs = w * 1.5
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = scaled(deps.layout, 0.9)
    ctx.beginPath(); ctx.moveTo(A[0] - gs, A[1]); ctx.lineTo(A[0] + gs, A[1]); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(A[0], A[1] - gs * 0.9); ctx.lineTo(A[0], A[1] + gs * 0.9); ctx.stroke()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(A[0], A[1] + scaled(deps.layout, 1), scaled(deps.layout, 1.3), 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function icePillar(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  h: number,
  w: number,
  k: number,
  seed: number,
): void {
  if (k <= 0) return
  const e = k < 0.7 ? (k / 0.7) * 1.09 : 1.09 - ((k - 0.7) / 0.3) * 0.09
  pillarSolid(ctx, deps, x, y, h * e, w, seed, k > 0.45)
  pillarBase(ctx, deps, x, y, w * 2)
}

function iceChip(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
  ang: number,
  k: number,
): void {
  if (k <= 0) return
  const c = Math.cos(ang), sn = Math.sin(ang)
  const p = (dx: number, dy: number): P2 => [x + (dx * c - dy * sn) * r, y + (dx * sn + dy * c) * r * 0.55]
  const a = p(-1, -0.35), b = p(0.5, -0.8), d = p(1, 0.3), e = p(-0.4, 0.75)
  ctx.save()
  ctx.globalAlpha = k * 0.55
  ctx.fillStyle = 'rgba(148,206,240,0.55)'
  ctx.beginPath()
  ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1])
  ctx.closePath(); ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = k * 0.4
  ctx.strokeStyle = '#eafaff'; ctx.lineWidth = scaled(deps.layout, 0.8)
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.stroke()
  ctx.restore()
}

/** Vena es yang menjalar di lantai, dengan kepala terang di ujungnya selama masih tumbuh. */
function strokeIce(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  reach: number,
  alpha: number,
  seed: number,
): void {
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux
  const segs = Math.max(4, Math.round(len / scaled(deps.layout, 26)))
  const pts: IcePoint[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const j = (i === 0 || i === segs) ? 0 : Math.sin(i * 2.1 + seed * 3.7) * scaled(deps.layout, 8)
    pts.push({ x: x0 + dx * t + nx * j, y: y0 + dy * t + ny * j, t })
  }
  const trace = (upTo: number): void => {
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i] as IcePoint
      if (p.t > upTo) {
        const pv = (pts[i - 1] ?? pts[0]) as IcePoint
        const fr = (upTo - pv.t) / Math.max(1e-4, p.t - pv.t)
        ctx.lineTo(pv.x + (p.x - pv.x) * fr, pv.y + (p.y - pv.y) * fr)
        break
      }
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
    }
  }
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'lighter'
  const layers: [string, number, number][] = [
    ['#2f7fe0', 0.2, 8],
    ['#8fd6ff', 0.38, 3.2],
    ['#ffffff', 0.95, 1.1],
  ]
  for (const L of layers) {
    ctx.globalAlpha = alpha * L[1]; ctx.strokeStyle = L[0]; ctx.lineWidth = scaled(deps.layout, L[2])
    trace(reach); ctx.stroke()
  }
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as IcePoint
    if (p.t > reach) break
    const grow = fxClamp((reach - p.t) * 7, 0, 1)
    const sz = scaled(deps.layout, 4 + ((i * 5 + seed * 3) % 6)) * grow
    const sg = i % 2 ? 1 : -1
    ctx.beginPath()
    ctx.moveTo(p.x - ux * sz * 0.75, p.y - uy * sz * 0.75)
    ctx.lineTo(p.x + nx * sg * sz * 1.7, p.y + ny * sg * sz * 1.7)
    ctx.lineTo(p.x + ux * sz * 0.75, p.y + uy * sz * 0.75)
    ctx.closePath()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = alpha * 0.5
    ctx.fillStyle = 'rgba(140,210,255,0.55)'
    ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * 0.75
    ctx.strokeStyle = '#e6faff'; ctx.lineWidth = scaled(deps.layout, 0.8)
    ctx.stroke()
  }
  if (reach < 1) {
    const hx = x0 + dx * reach, hy = y0 + dy * reach
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * 0.4
    ctx.fillStyle = '#9fdcff'
    ctx.beginPath(); ctx.arc(hx, hy, scaled(deps.layout, 10), 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(hx, hy, scaled(deps.layout, 3.2), 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

/** Cangkang kristal yang mengurung satu fighter. */
function iceShell(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
  k: number,
  seed: number,
): void {
  if (k <= 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.14 * k
  ctx.fillStyle = '#8fd0ff'
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.5, r * 1.7, r * 0.7, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  const ring: Pillar[] = []
  const spokes = 10
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + seed * 0.7
    ring.push({
      bx: x + Math.cos(a) * r * (0.72 + 0.28 * Math.abs(Math.sin(a * 2 + seed))),
      by: y + Math.sin(a) * r * 0.62 + r * 0.35,
      h: r * (0.8 + 1.1 * Math.abs(Math.sin(a * 1.7 + seed))),
      w: r * (0.19 + 0.12 * Math.abs(Math.cos(a * 2.3))),
      sd: i * 1.7 + seed,
    })
  }
  ring.sort((a, b) => a.by - b.by)
  for (const p of ring) {
    ctx.save()
    ctx.globalAlpha = 0.85
    icePillar(ctx, deps, p.bx, p.by, p.h, p.w, k, p.sd)
    ctx.restore()
  }
}

function iceBurst(
  fx: UltimateFxState,
  deps: RenderDeps,
  x: number,
  y: number,
  n: number,
  sp: number,
  ice: Rgb,
): void {
  for (let s = 0; s < n; s++) {
    const a = fx.rr(0, Math.PI * 2), v = fx.rr(sp * 0.3, sp)
    fx.spark(x, y, Math.cos(a) * v, Math.sin(a) * v * 0.7,
      fx.rr(280, 780), scaled(deps.layout, fx.rr(1, 3)),
      fx.rnd() < 0.4 ? [1, 1, 1] : ice, fx.rr(60, 240), fx.rr(1.4, 2.6), 1)
  }
}

/** Punggungan kristal sepanjang vena: kelompok pilar, serpihan, kabut, dan percikan. */
function iceRidge(
  ctx: CanvasRenderingContext2D,
  fx: UltimateFxState,
  deps: RenderDeps,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  reach: number,
  alpha: number,
  seed: number,
  scale: number,
  dt: number,
): void {
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len, uy = dy / len
  const nx = -uy, ny = ux
  const sc = scale
  // Satu rumpun tiap 50 px desain, bukan 66: pada 66 vena esnya terbaca sebagai rangkaian
  // titik, bukan sebagai punggungan yang menyambung.
  const groups = Math.max(2, Math.round(len / scaled(deps.layout, 50)))
  const pillars: Pillar[] = []
  const chips: Chip[] = []
  for (let c = 0; c <= groups; c++) {
    const ct = c / groups
    const csd = c * 2.71 + seed * 3.37
    const cn = 3 + Math.floor(Math.abs(Math.sin(csd * 1.9)) * 3)
    const bell = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, ct * 1.05 + 0.12))
    for (let i = 0; i < cn; i++) {
      const sd = csd + i * 1.61
      const along = Math.sin(sd * 4.1) * scaled(deps.layout, 17)
      const side = Math.sin(sd * 2.6) * scaled(deps.layout, 16) + Math.sin(sd * 6.3) * scaled(deps.layout, 6)
      const depth = Math.sin(sd * 3.7) * scaled(deps.layout, 8)
      const t = ct + (along / len)
      if (t < -0.05) continue
      const mass = i === 0 ? 1 : Math.abs(Math.sin(sd * 5.5))
      const chunky = Math.abs(Math.cos(sd * 3.3)) > 0.58
      const h = scaled(deps.layout, chunky ? 9 + mass * 13 : 14 + mass * 30) * bell * sc
      // `w` adalah SETENGAH lebar pangkal (`bw = w` di pillarSolid), jadi kristal selebar
      // fighter menuntut w ≈ FIGHTER_DIAMETER_PX/2. Angka lama memberi 6–20 px penuh di
      // sebelah blob 48 px — ramping seperti pecahan kaca, bukan seperti kristal es.
      const w = scaled(deps.layout, chunky ? 8.7 + mass * 6.5 : 4.7 + mass * 3.7) * sc
      const delay = i === 0 ? 0 : 0.05 + i * 0.028
      const grow = fxClamp((reach - t - delay) * 6, 0, 1)
      if (grow <= 0) continue
      const bx = x0 + dx * t + nx * side, by = y0 + dy * t + ny * side + depth
      pillars.push({ bx, by, h, w, grow, sd, lead: i === 0 })
      if (i < 3) {
        for (let q = 0; q < 2; q++) {
          const qd = sd + q * 2.9
          chips.push({
            x: bx + Math.sin(qd * 3.3) * scaled(deps.layout, 20), y: by + Math.abs(Math.cos(qd * 2.1)) * scaled(deps.layout, 9),
            r: scaled(deps.layout, 3 + Math.abs(Math.sin(qd * 4.7)) * 5) * sc, a: qd, k: grow,
          })
        }
      }
      if (dt > 0 && grow < 0.8) {
        if (fx.rnd() < dt / 130) fx.puff(bx + fx.rr(-10, 10), by, fx.rr(-22, 22), -fx.rr(6, 18), 900, arenaLengthX(deps.layout, 0.8), arenaLengthX(deps.layout, 1.7), 0.92)
        if (fx.rnd() < dt / 26) {
          fx.spark(bx + fx.rr(-w, w), by, fx.rr(-60, 60), -fx.rr(90, 260), fx.rr(320, 760),
            scaled(deps.layout, fx.rr(0.9, 2.2)), fx.rnd() < 0.5 ? [1, 1, 1] : [0.72, 0.9, 1], 190, 1.3, 1)
        }
      }
    }
  }
  ctx.save()
  ctx.globalAlpha = alpha * 0.9
  for (const c of chips) iceChip(ctx, deps, c.x, c.y, c.r, c.a, c.k)
  ctx.restore()
  pillars.sort((a, b) => a.by - b.by)
  for (const p of pillars) {
    ctx.save()
    ctx.globalAlpha = alpha
    icePillar(ctx, deps, p.bx, p.by, p.h, p.w, p.grow ?? 0, p.sd)
    ctx.restore()
  }
}

/** Embun beku di lantai: bintang yang tumbuh dari satu titik. */
function rime(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  x: number,
  y: number,
  r: number,
  k: number,
  seed: number,
): void {
  if (k <= 0 || r <= 0) return
  const sd = seed
  ctx.save()
  ctx.globalAlpha = 0.2 * k
  ctx.fillStyle = 'rgba(140,210,255,0.5)'
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let i = 0; i < 11; i++) {
    const a = i * 0.571 + sd
    const len = r * (0.5 + (((i * 7 + sd * 5) % 9) / 9) * 0.6) * Math.min(1, k * 1.2)
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len * 0.42
    ctx.globalAlpha = 0.4 * k
    ctx.strokeStyle = '#d8f2ff'; ctx.lineWidth = scaled(deps.layout, 1.1)
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.globalAlpha = 0.28 * k
    ctx.lineWidth = scaled(deps.layout, 0.7)
    for (let j = 1; j <= 3; j++) {
      const t = j / 4
      const bx = x + (ex - x) * t, by = y + (ey - y) * t
      const bl = len * 0.3 * (1 - t)
      for (const sg of [1, -1]) {
        const ba = a + sg * 0.95
        ctx.beginPath(); ctx.moveTo(bx, by)
        ctx.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl * 0.42)
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}

/** Arena yang ikut membeku: kabut biru, vignette dingin, serpihan yang melayang turun. */
function frostVeil(
  ctx: CanvasRenderingContext2D,
  deps: RenderDeps,
  fx: UltimateFxState,
  k: number,
): void {
  if (k <= 0) return
  const A = deps.layout.arena
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.07 * k
  ctx.fillStyle = '#2f74c4'
  ctx.fillRect(A.x, A.y, A.width, A.height)
  const cx = A.x + A.width / 2, cy = A.y + A.height / 2
  const rg = ctx.createRadialGradient(cx, cy, A.width * 0.18, cx, cy, A.width * 0.8)
  rg.addColorStop(0, 'rgba(80,170,255,0)')
  rg.addColorStop(1, 'rgba(126,205,255,0.44)')
  ctx.globalAlpha = 0.55 * k
  ctx.fillStyle = rg
  ctx.fillRect(A.x, A.y, A.width, A.height)
  for (let i = 0; i < 26; i++) {
    const cyc = 4200 + (i % 6) * 900
    const t = ((fx.clock + i * 613) % cyc) / cyc
    const px = A.x + (((i * 7.3) % 100) / 100) * A.width + Math.sin(t * 6.28 + i) * scaled(deps.layout, 9)
    const py = A.y + A.height * ((i * 0.137 + t * 0.9) % 1)
    ctx.globalAlpha = k * 0.8 * Math.sin(t * Math.PI)
    ctx.fillStyle = '#eaf9ff'
    const sz = scaled(deps.layout, 1.2 + (i % 3) * 0.7)
    ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

const art: UltimateFxArt = (ctx, f, deps, fx, dt) => {
  const u = f.source
  const st = fx.bag(u)
  const hops = f.targetCount
  const nodes: Node2[] = [{ x: f.ox, y: f.oy }]
  for (let n = 0; n < f.targetCount; n++) nodes.push(f.targets[n] as FrameTarget)
  const ice: Rgb = [0.72, 0.9, 1]

  if (f.phase === 'charge') {
    drawFxCharge(ctx, f, deps, fx, dt)
    const k = f.local
    rime(ctx, deps, f.ox, f.oy + scaled(deps.layout, 5), arenaLengthX(deps.layout, 4 + k * 9), k, 2.3)
    iceShell(ctx, deps, f.ox, f.oy, arenaLengthX(deps.layout, 2.2) * (0.4 + k), k * 0.5, 1)
    fx.light(f.ox, f.oy, arenaLengthX(deps.layout, 7 + k * 6), 0.22 * k, ice, 50)
    frostVeil(ctx, deps, fx, k * 0.35)
    if (fx.rnd() < dt / 26) {
      const a = fx.rr(0, Math.PI * 2), d = arenaLengthX(deps.layout, fx.rr(3, 12))
      fx.spark(f.ox + Math.cos(a) * d, f.oy + Math.sin(a) * d * 0.7,
        fx.rr(-20, 20), -fx.rr(10, 50), fx.rr(500, 1000), scaled(deps.layout, fx.rr(1, 2.4)), ice, -20, 0.7, 1)
    }
    return
  }

  const chainT = fxClamp((f.progress - FX_CHARGE_END) / (FX_IMPACT_AT - FX_CHARGE_END), 0, 1)
  const seg = 1 / Math.max(1, hops)
  const dim = f.phase === 'travel' ? 1 : f.phase === 'impact' ? 1 - f.local * 0.4 : 0
  const cold = f.phase === 'travel' ? 0.35 + chainT * 0.5
    : f.phase === 'impact' ? 0.85 * (1 - f.local * 0.5)
    : Math.max(0, 0.4 * (1 - f.local))
  frostVeil(ctx, deps, fx, cold)

  for (let i = 0; i < hops; i++) {
    const local = fxClamp((chainT - i * seg) / seg, 0, 1)
    if (local <= 0) break
    const A0 = nodes[i] as Node2
    const t = nodes[i + 1] as Node2
    const reach = Math.min(1, local * 1.45)
    if (dim > 0) {
      strokeIce(ctx, deps, A0.x, A0.y, t.x, t.y, reach, dim * 0.3, i + 1)
      iceRidge(ctx, fx, deps, A0.x, A0.y, t.x, t.y, reach, dim, i + 1, f.tier.radiusMultiplier, dt)
    }
    // frost creeping along the floor under the vein
    if (dim > 0) {
      const marks = 3
      for (let m = 1; m <= marks; m++) {
        const mt = m / (marks + 1)
        if (mt > reach) break
        const grow = fxClamp((reach - mt) * 4, 0, 1)
        rime(ctx, deps, A0.x + (t.x - A0.x) * mt, A0.y + (t.y - A0.y) * mt + scaled(deps.layout, 6),
          arenaLengthX(deps.layout, 2.4) * grow, dim * 0.7 * grow, i * 3 + m)
      }
    }
    // mist trailing the crawling head
    if (reach < 1) {
      const hx = A0.x + (t.x - A0.x) * reach, hy = A0.y + (t.y - A0.y) * reach
      if (fx.rnd() < dt / 90) fx.puff(hx + fx.rr(-14, 14), hy, fx.rr(-24, 24), -fx.rr(4, 14), 800, arenaLengthX(deps.layout, 0.9), arenaLengthX(deps.layout, 1.6), 0.9)
      for (let q = 0; q < Math.round(dt / 26); q++) {
        fx.spark(hx + fx.rr(-16, 16), hy, fx.rr(-70, 70), -fx.rr(120, 320), fx.rr(400, 900),
          scaled(deps.layout, fx.rr(1, 2.6)), fx.rnd() < 0.5 ? [1, 1, 1] : ice, 150, 1.1, 1)
      }
    }
    if (fx.rnd() < dt / 220) {
      const mt = fx.rr(0, reach)
      fx.puff(A0.x + (t.x - A0.x) * mt + fx.rr(-22, 22), A0.y + (t.y - A0.y) * mt + scaled(deps.layout, 4),
        fx.rr(-14, 14), -fx.rr(4, 12), 1100, arenaLengthX(deps.layout, 1.1), arenaLengthX(deps.layout, 1.8), 0.9)
    }

    const fr = fighterOf(deps, u.targetSlots[i] ?? -1)
    if (local >= 0.55) {
      if (fr !== undefined && !fx.flag(u, 'sh' + i)) fx.holdFrozen(fr.slotIndex, 400, dt / 160)
      rime(ctx, deps, t.x, t.y + scaled(deps.layout, 6), arenaLengthX(deps.layout, 4) * f.tier.radiusMultiplier, dim, i + 2)
      fx.light(t.x, t.y, arenaLengthX(deps.layout, 6), 0.16 * dim, ice, 50)
      if (fx.once(u, 'ice' + i)) {
        fx.kick(scaled(deps.layout, 3))
        fx.light(t.x, t.y, arenaLengthX(deps.layout, 9), 0.4, ice, 260)
        fx.wave(t.x, t.y, 360, 0.18, 0.035)
        iceBurst(fx, deps, t.x, t.y, 20, 210, ice)
        fx.puff(t.x, t.y, 0, -18, 1000, arenaLengthX(deps.layout, 2), arenaLengthX(deps.layout, 4.2), 0.95)
      }
    }
  }

  if (f.phase === 'impact') {
    if (fx.once(u, 'shatter')) st.born = fx.clock
    for (let i = 0; i < hops; i++) {
      if (fx.flag(u, 'sh' + i) || fx.clock - st.born < i * 90) continue
      fx.once(u, 'sh' + i)
      const t = f.targets[i] as FrameTarget
        const fr = fighterOf(deps, u.targetSlots[i] ?? -1)
      if (fr !== undefined) fx.shatterFrozen(fr.slotIndex)
      fx.wave(t.x, t.y, 560, 0.42, 0.045)
      fx.light(t.x, t.y, arenaLengthX(deps.layout, 13), 0.85, ice, 320)
      fx.light(t.x, t.y, arenaLengthX(deps.layout, 6), 0.9, [1, 1, 1], 150)
      fx.kick(scaled(deps.layout, 6.5))
      iceBurst(fx, deps, t.x, t.y, 70, 520, ice)
      for (let s = 0; s < 5; s++) {
        const ang = fx.rr(0, Math.PI * 2), d = arenaLengthX(deps.layout, fx.rr(0.5, 3))
        fx.puff(t.x + Math.cos(ang) * d, t.y + Math.sin(ang) * d * 0.6,
          Math.cos(ang) * fx.rr(20, 60), -fx.rr(10, 40), fx.rr(900, 1600),
          arenaLengthX(deps.layout, 1.6), arenaLengthX(deps.layout, 3.4), 0.95)
      }
    }
    const k = 1 - f.local
    for (let i = 0; i < hops; i++) {
      const t = (f.targets[i] as FrameTarget)
      layeredGlow(ctx, t.x, t.y, arenaLengthX(deps.layout, 4.5) * f.tier.radiusMultiplier * k, '#9adcff', k * 0.7)
      rime(ctx, deps, t.x, t.y + scaled(deps.layout, 6), arenaLengthX(deps.layout, 4.4) * f.tier.radiusMultiplier * (2 - k), k, i + 2)
    }
    return
  }

  if (f.phase === 'aftermath') {
    const k = 1 - f.local
    for (let i = 0; i < hops; i++) {
      const t = (f.targets[i] as FrameTarget)
      rime(ctx, deps, t.x, t.y + scaled(deps.layout, 6), arenaLengthX(deps.layout, 5) * f.tier.radiusMultiplier, k * 0.7, i + 2)
    }
    if (fx.rnd() < dt / 50) {
      const t = (f.targets[Math.floor(fx.rnd() * hops)] as FrameTarget | undefined) ?? {
          x: f.tx,
          y: f.ty,
          alive: false,
        }
      fx.puff(t.x + fx.rr(-20, 20), t.y, fx.rr(-8, 8), -fx.rr(10, 34), 1400, arenaLengthX(deps.layout, 1.4), arenaLengthX(deps.layout, 3), 0.9)
    }
    return
  }

  drawFxReticle(ctx, f, deps, fx)
}

export function drawChainFreeze(
  ctx: CanvasRenderingContext2D,
  u: InterpolatedUltimate,
  deps: RenderDeps,
  fx: UltimateFxState,
  dt: number,
): void {
  drawUltimateFxArt(ctx, u, deps, fx, dt, art)
}
