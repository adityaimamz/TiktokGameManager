import { SIDE_B } from '@lga/shared'
import type { SnapshotHistory, SnapshotView } from '@lga/shared'
import type { IGameRenderer } from '../../../framework/types/plugin.js'
import { PROJECTILE_RADIUS, TICK_MS, fighterScale } from '../arena.js'
import type { BattleArenaConfig, NukeType } from '../config/index.js'
import { effectTypeFromIndex, nukeTypeFromIndex } from '../snapshot.js'
import type { RosterEntry } from '../snapshot.js'
import { AvatarCache } from './avatar-cache.js'
import { DeathFade } from './death-fade.js'
import type { RenderDeps } from './deps.js'
import { HpDisplay, SIZE_GROW_MS, SIZE_OVERSHOOT } from './hp-display.js'
import { extrapolateProjectile, interpolateFighters, interpolateUltimates } from './interpolate.js'
import type { InterpolatedFighter, InterpolatedUltimate } from './interpolate.js'
import { GLOW_LAYERS, strokeLayer } from './glow.js'
import type { GlowPalette } from './glow.js'
import {
  arenaLengthX,
  arenaLengthY,
  arenaMidlineX,
  arenaX,
  arenaY,
  fighterDiameter,
  scaled,
} from './layout.js'
import type { StageLayout } from './layout.js'
import type { Impulse } from './ultimate-impulse.js'
import {
  UltimateFxImpulse,
  UltimateFxPost,
  UltimateFxState,
  drawFxDecals,
  drawFxSmoke,
  drawUltimateFx,
  fxFlashAlpha,
} from './fx/index.js'

/**
 * Menggambar arena ke Canvas 2D (§9.1).
 *
 * Modul ini TIDAK PERNAH memutasi apa pun dan tidak mengenal BattleArenaState — ia hanya
 * menerima SnapshotView hasil decode (keputusan E1). Urutan layer dari belakang ke depan:
 * background sisi, garis tengah, projectile, fighter, efek, angka damage melayang.
 */

export type { RenderDeps } from './deps.js'

const BAND_COLOR = '#000000'
/** Tint warna sisi di atas latar arena — cukup untuk membedakan wilayah, tidak menutupi. */
const SIDE_TINT_ALPHA = 0.25

/** Kisi lantai: sepuluh kolom, enam baris, memudar ke atas seperti panggung yang menjauh. */
const GRID_COLUMNS = 10
const GRID_ROWS = 6

const point = { x: 0, y: 0 }

const PARTICLE_COUNT = 16

/**
 * Partikel kabut yang naik perlahan dari dasar arena — dekorasi murni, sama sekali tidak
 * terikat state game. Posisi dan fase naik keduanya deterministik dari indeks dan `nowMs`
 * (bukan `Math.random`), supaya frame yang sama selalu menghasilkan gambar yang sama.
 */
function drawParticles(
  ctx: CanvasRenderingContext2D,
  layout: StageLayout,
  nowMs: number,
  alpha: number,
): void {
  const { arena } = layout

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const cycleMs = 7000 + (i % 5) * 1600
    const t = ((nowMs + i * 900) % cycleMs) / cycleMs
    const fade = t < 0.12 ? t / 0.12 : (1 - t) / 0.88

    const xPct = ((i * 5.6 + (i % 3) * 4) % 96) + 2
    const x = arena.x + (xPct / 100) * arena.width
    const y = arena.y + arena.height * (1 - t * 0.9)
    const size = scaled(layout, 2 + (i % 3)) * (1 - t * 0.5)

    ctx.globalAlpha = Math.max(0, Math.min(1, fade)) * 0.8 * alpha
    ctx.fillStyle = i % 2 === 0 ? 'rgba(120,190,255,0.9)' : 'rgba(255,110,170,0.9)'
    ctx.beginPath()
    ctx.ellipse(x, y, size, size, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Kisi lantai panggung.
 *
 * SENGAJA tanpa gradien: `createLinearGradient` tidak bisa dipakai selama renderer diuji
 * lewat recording context, yang mengembalikan `undefined` untuk objek gradien.
 */
function drawFloor(ctx: CanvasRenderingContext2D, layout: StageLayout): void {
  const { arena } = layout

  ctx.strokeStyle = 'rgba(255,255,255,0.055)'
  ctx.lineWidth = 1

  for (let i = 1; i < GRID_COLUMNS; i++) {
    const x = arena.x + (arena.width * i) / GRID_COLUMNS
    ctx.beginPath()
    ctx.moveTo(x, arena.y)
    ctx.lineTo(x, arena.y + arena.height)
    ctx.stroke()
  }

  // Baris makin rapat ke atas: perspektif kuadratik, cara termurah membuat lantai punya
  // kedalaman tanpa satu pun transform matriks.
  for (let i = 1; i < GRID_ROWS; i++) {
    const t = (i / GRID_ROWS) ** 1.6
    const y = arena.y + arena.height * t
    ctx.beginPath()
    ctx.moveTo(arena.x, y)
    ctx.lineTo(arena.x + arena.width, y)
    ctx.stroke()
  }
}

/**
 * Jahitan cahaya di garis tengah: satu garis putih menyala.
 *
 * Ini penanda paling terang di panggung karena ia menjawab pertanyaan paling sering
 * ditanya penonton baru — di mana batas kedua wilayah.
 */
function drawSeam(ctx: CanvasRenderingContext2D, layout: StageLayout): void {
  const { arena } = layout
  const midline = arenaMidlineX(layout)

  ctx.save()
  ctx.shadowColor = 'rgba(190,220,255,0.95)'
  ctx.shadowBlur = scaled(layout, 22)
  ctx.strokeStyle = '#EAF2FF'
  ctx.lineWidth = scaled(layout, 2)
  ctx.beginPath()
  ctx.moveTo(midline, arena.y)
  ctx.lineTo(midline, arena.y + arena.height)
  ctx.stroke()
  ctx.restore()
}

export function clearStage(ctx: CanvasRenderingContext2D): void {
  const canvas = ctx.canvas as { width: number; height: number }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

export function drawZones(ctx: CanvasRenderingContext2D, deps: RenderDeps): void {
  const { layout, config } = deps
  const { arena, top, bottom } = layout

  // Transparansi hanya menyentuh lapisan latar (keputusan E8): fighter dan HUD tetap pekat
  // meski creator menurunkan opasitas panggung sampai nyaris hilang.
  ctx.globalAlpha = config.overlay.transparency / 100

  ctx.fillStyle = BAND_COLOR
  ctx.fillRect(top.x, top.y, top.width, top.height)
  ctx.fillRect(bottom.x, bottom.y, bottom.width, bottom.height)

  const background = config.overlay.arenaBackground
  if (background.kind === 'color') {
    ctx.fillStyle = background.value
    ctx.fillRect(arena.x, arena.y, arena.width, arena.height)
  } else if (background.kind === 'image') {
    const image = deps.image?.(background.url, arena.width, arena.height) ?? null
    if (image !== null) ctx.drawImage(image, arena.x, arena.y, arena.width, arena.height)
  }

  const half = arena.width / 2
  for (const [side, x] of [
    ['a', arena.x],
    ['b', arena.x + half],
  ] as const) {
    const sideConfig = config.sides[side]
    const image =
      sideConfig.backgroundImage === null
        ? null
        : (deps.image?.(sideConfig.backgroundImage, half, arena.height) ?? null)
    if (image !== null) {
      ctx.drawImage(image, x, arena.y, half, arena.height)
      continue
    }
    ctx.globalAlpha = (config.overlay.transparency / 100) * SIDE_TINT_ALPHA
    ctx.fillStyle = sideConfig.color
    ctx.fillRect(x, arena.y, half, arena.height)
    ctx.globalAlpha = config.overlay.transparency / 100
  }

  drawParticles(ctx, layout, deps.nowMs, ctx.globalAlpha)
  drawFloor(ctx, layout)
  drawSeam(ctx, layout)

  ctx.globalAlpha = 1
}

/**
 * Panjang berkas pada panggung acuan.
 *
 * Piksel desain, bukan kelipatan langkah satu tick: langkah satu tick adalah 20% lebar
 * arena, dan ekor sepanjang itu terbaca sebagai coretan gemuk melintasi separuh layar,
 * bukan sebagai tembakan.
 */
const BEAM_LENGTH_PX = 56

/**
 * Setiap tembakan digambar sebagai berkas laser pendek: tiga lapis cahaya di atas satu
 * ruas garis, plus satu titik terang di ujungnya. Bobotnya dipikul kecerahan dan panjang,
 * bukan ketebalan — aturan yang sama dengan laser ultimate (§9.4), dan lewat helper yang
 * sama supaya keduanya tidak pernah menyimpang.
 */
export function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  view: SnapshotView,
  alpha: number,
  deps: RenderDeps,
): void {
  const { layout } = deps
  // Lebar inti = DIAMETER hitbox. Satu angka di arena.ts menggerakkan keduanya, jadi berkas
  // yang terlihat tidak bisa berbeda ukuran dari berkas yang diuji tabrakannya.
  const coreWidth = arenaLengthY(layout, PROJECTILE_RADIUS) * 2
  const beamLength = scaled(layout, BEAM_LENGTH_PX)

  for (let i = 0; i < view.header.projectileCount; i++) {
    const projectile = view.projectiles[i]
    if (projectile === undefined) continue
    extrapolateProjectile(projectile, alpha, point)

    const colour = deps.config.sides[projectile.kind === SIDE_B ? 'b' : 'a'].color
    const palette: GlowPalette = [colour, colour, '#ffffff']
    const x = arenaX(layout, point.x)
    const y = arenaY(layout, point.y)

    /*
     * Arah dinormalkan di PIKSEL, bukan di persen.
     *
     * vx dan vy tidak sepanjang sama di layar (lihat ARENA_ASPECT di arena.ts), jadi ruas
     * yang dinormalkan di ruang persen akan miring salah — makin parah di portrait. Ekornya
     * juga diturunkan dari kecepatan, bukan dari posisi tick sebelumnya: peluru dikemudikan
     * ulang tiap tick, jadi arah yang jujur adalah arah ia terbang sekarang.
     */
    const dirX = arenaLengthX(layout, projectile.vx)
    const dirY = arenaLengthY(layout, projectile.vy)
    const speed = Math.hypot(dirX, dirY)

    /*
     * Berkas TUMBUH dari titik lepasnya; ia tidak pernah lebih panjang dari jarak yang
     * sudah benar-benar ditempuh.
     *
     * Tanpa jepitan ini, tembakan yang baru lahir menjulur satu panjang berkas penuh ke
     * BELAKANG penembaknya — kepalanya masih persis di pusat blob, jadi ekornya keluar di
     * sisi seberang. `age` datang dari snapshot karena kecepatan tidak menyimpan jejak
     * umur: ia dibidik ulang tiap tick dan dijepit saat mendarat.
     */
    const travelled = speed * (projectile.age / TICK_MS + alpha)
    const length = Math.min(beamLength, travelled)
    const tailX = speed === 0 ? x : x - (dirX / speed) * length
    const tailY = speed === 0 ? y : y - (dirY / speed) * length

    ctx.save()
    for (let layer = 0; layer < GLOW_LAYERS; layer++) {
      strokeLayer(ctx, layer, palette, coreWidth, 1)
      ctx.beginPath()
      ctx.moveTo(tailX, tailY)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.restore()

    // Ujung berkas: SATU arc per peluru. Test menghitungnya, dan titik inilah yang menandai
    // posisi sesungguhnya — tempat damage akan mendarat.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(x, y, coreWidth, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

const HP_BAR_HEIGHT_PX = 6
const HP_BAR_GAP_PX = 6
const NAME_MAX_CHARS = 10
const FLOATING_DAMAGE_RISE_PX = 30

/** Hijau di atas 50%, kuning 25–50%, merah di bawah 25% (Req 33 AC5). */
/**
 * Apa yang `drawFighters` butuh dari sebuah pendorong ultimate, sesempit mungkin supaya
 * `UltimateFxImpulse` memenuhinya tanpa penggambaran fighter mengimpor tipe jalur FX.
 */
export interface ImpulseSource {
  for(slot: number): Impulse | undefined
}

export function hpColor(ratio: number): string {
  if (ratio >= 0.5) return '#3ddc84'
  if (ratio >= 0.25) return '#f5c518'
  return '#ff4d4f'
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}

export function drawFighters(
  ctx: CanvasRenderingContext2D,
  fighters: readonly InterpolatedFighter[],
  count: number,
  roster: ReadonlyMap<number, RosterEntry>,
  deps: RenderDeps,
  /**
   * Satu-satunya cara ultimate menyentuh penggambaran fighter (lihat ultimate-impulse.ts).
   *
   * Opsional supaya pemanggil yang tidak peduli — dan seluruh test yang sudah ada — tetap
   * jalan tanpa diubah; tidak diisi berarti tidak ada dorongan, yang memang benar.
   */
  impulse?: ImpulseSource,
): void {
  const { layout, config } = deps
  const baseDiameter = fighterDiameter(layout)
  const barHeight = scaled(layout, HP_BAR_HEIGHT_PX)
  const barGap = scaled(layout, HP_BAR_GAP_PX)

  for (let i = 0; i < count; i++) {
    const fighter = fighters[i]
    if (fighter === undefined) continue

    const entry = roster.get(fighter.slotIndex)
    const side = config.sides[fighter.side === SIDE_B ? 'b' : 'a']
    const push = impulse?.for(fighter.slotIndex)
    const cx = arenaX(layout, fighter.x) + (push?.dx ?? 0)
    const cy = arenaY(layout, fighter.y) + (push?.dy ?? 0)

    // Fighter mati memudar lalu berhenti digambar sama sekali (Req 10 AC2). Ia TETAP
    // terdaftar di engine — itu yang membuat rejoin tanpa ketik ulang mungkin — tapi
    // layar tidak lagi menampilkannya.
    ctx.globalAlpha =
      fighter.alive === 1 ? 1 : deps.deathFade.alphaFor(fighter.slotIndex, deps.nowMs)
    if (ctx.globalAlpha === 0) continue

    // HP bar dihitung terhadap maxHp yang berlaku, bukan baseHp: Grow menaikkan plafon
    // (§15 butir 8), jadi fighter 800 HP yang sehat tetap menampilkan bar penuh.
    const shownHp = deps.hpDisplay.hpFor(fighter.slotIndex, fighter.hp)
    const ratio = fighter.maxHp <= 0 ? 0 : Math.max(0, Math.min(1, shownHp / fighter.maxHp))

    /*
     * UKURAN dari HP berjalan, lewat `fighterScale` yang sama dengan yang dipakai hitbox.
     *
     * HP-nya diambil dari track ukuran, bukan track bar: keduanya mengejar angka yang sama
     * tapi dengan kurva berbeda, dan yang naik memantul. Rumusnya sendiri tinggal di
     * arena.ts — dua salinan berarti blob dan kotak tabraknya berpisah diam-diam.
     */
    const sizeHp = deps.sizeDisplay.hpFor(fighter.slotIndex, fighter.hp)
    const diameter = baseDiameter * fighterScale(sizeHp, config.gameplay.baseHp)
    const radius = diameter / 2

    /*
     * CINCIN HP mengelilingi avatar — busur, bukan conic-gradient.
     *
     * Canvas 2D tidak punya conic-gradient, dan `createConicGradient` belum ada di semua
     * peramban yang jadi sasaran; satu busur yang panjangnya `ratio` menghasilkan bentuk
     * yang sama persis dan bisa dibaca test tanpa objek gradien.
     */
    // Dibaca balik, bukan dihitung ulang: baris di atas sudah menaruh alpha DeathFade di
    // sana, dan `strokeLayer` akan MENIMPA globalAlpha sehingga nilainya harus dipegang dulu.
    const fadeAlpha = ctx.globalAlpha
    const ringWidth = scaled(layout, 4)
    // DI LUAR loop di bawah: `strokeLayer` mengubah lineWidth tiap lapis, dan cincin yang
    // membaca `ctx.lineWidth` di dalam loop akan digambar di tiga radius yang berbeda.
    const ringRadius = radius + ringWidth

    ctx.save()
    ctx.lineWidth = ringWidth
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.beginPath()
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
    ctx.stroke()

    /*
     * Fighter sehat menyala, yang sekarat nyaris padam: intensitas cahaya adalah HP yang
     * terbaca dari jauh, saat cincin tipisnya sendiri sudah terlalu kecil untuk dilihat.
     *
     * TIGA LAPIS CAHAYA, bukan satu stroke ber-`shadowBlur`. Ini larangan `glow.ts` yang
     * sudah tertulis, ditegakkan di tempat yang sebenarnya melanggarnya: satu blur per
     * fighter per frame tumbuh dengan jumlah penonton, dan itu persis bentuk biaya yang
     * dilarang di sana. Lapis terluar keluar di `ringWidth * 4.5` = `scaled(18)`, tepat
     * sebaran blur maksimum yang digantikannya (`4 + ratio * 14`), sementara lapis terdalam
     * keluar `ringWidth * 1` — persis lebar garis yang digambar sebelumnya.
     *
     * Intensitasnya pindah dari radius blur ke alpha DUA LAPIS LUAR saja. Core sengaja tetap
     * opasitas penuh: sebelum ini pun busur berwarnanya tidak pernah meredup, hanya glow-nya
     * yang menyusut, dan cincin fighter sekarat harus tetap terbaca.
     *
     * Ketiga entri palet sama-sama warna sisi, BUKAN core putih seperti projectile — cincin
     * HP adalah penanda identitas sisi, dan core putih menggeser warnanya.
     */
    const ringPalette: GlowPalette = [side.color, side.color, side.color]
    const glowAlpha = fadeAlpha * (0.3 + ratio * 0.7)
    for (let layer = 0; layer < GLOW_LAYERS; layer++) {
      const core = layer === GLOW_LAYERS - 1
      strokeLayer(ctx, layer, ringPalette, ringWidth, core ? fadeAlpha : glowAlpha)
      // `strokeLayer` menyetel 'round' untuk garis lurus; ujung busur progress harus rata.
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.arc(cx, cy, ringRadius, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()

    const avatar = deps.avatars.get(entry?.avatarUrl ?? null, entry?.username ?? '?')
    if (avatar.kind === 'bitmap') {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(avatar.bitmap, cx - radius, cy - radius, diameter, diameter)
      ctx.restore()
    } else {
      ctx.fillStyle = side.color
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()

      // Sorotan kiri-atas: kesan bola mengkilap seperti acuan desain, tanpa radial
      // gradient (recorder tak mendukung objek gradien) — satu elips terang yang
      // ditumpuk lewat 'lighter' saja sudah cukup meniru efeknya.
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha *= 0.35
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(
        cx - radius * 0.3,
        cy - radius * 0.35,
        radius * 0.55,
        radius * 0.45,
        0,
        0,
        Math.PI * 2,
      )
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = '#ffffff'
      ctx.font = `${Math.round(radius)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(avatar.letter, cx, cy)
    }

    /*
     * Fighter yang tersambar petir MEMUTIH beberapa frame — di atas avatarnya, di bawah HP
     * bar-nya, supaya angka HP tetap terbaca justru pada frame ia kehilangan HP.
     *
     * Sama seperti dorongan bom, ia datang lewat `ImpulseSource` dan tidak lewat jalan lain:
     * itu satu-satunya tempat penggambaran fighter mengetahui ada ultimate (spec D8).
     */
    if (push !== undefined && push.flash > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha *= push.flash
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const barY = cy + radius + barGap
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(cx - radius, barY, diameter, barHeight)
    ctx.fillStyle = hpColor(ratio)
    ctx.fillRect(cx - radius, barY, diameter * ratio, barHeight)

    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `${Math.round(scaled(layout, 14))}px system-ui, sans-serif`
    ctx.fillText(String(Math.max(0, Math.round(shownHp))), cx, barY + barHeight + barGap * 0.3)

    if (config.ui.showFighterNames && entry !== undefined) {
      ctx.font = `${Math.round(scaled(layout, 12))}px system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(
        truncate(entry.username, NAME_MAX_CHARS),
        cx,
        barY + barHeight + scaled(layout, 20),
      )
    }

    ctx.globalAlpha = 1
  }
}

const EFFECT_COLORS: Record<string, string> = {
  hit: '#ffd166',
  critical: '#ff7b00',
  heal: '#3ddc84',
  explosion: '#ff4d4f',
  nuke: '#c77dff',
  gift: '#ff8fab',
  join: '#8ecae6',
  kill: '#ff4d4f',
  victory: '#ffd60a',
}

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  view: SnapshotView,
  deps: RenderDeps,
): void {
  const { layout, config } = deps
  const baseRadius = fighterDiameter(layout) * 0.5

  for (let i = 0; i < view.header.effectCount; i++) {
    const effect = view.effects[i]
    if (effect === undefined) continue
    const type = effectTypeFromIndex(effect.type)
    if (type === null) continue

    const x = arenaX(layout, effect.x)
    const y = arenaY(layout, effect.y)
    const fade = 1 - effect.progress

    ctx.globalAlpha = fade
    ctx.strokeStyle = EFFECT_COLORS[type] ?? '#ffffff'

    ctx.lineWidth = scaled(layout, 3)
    ctx.beginPath()
    ctx.arc(x, y, baseRadius * effect.intensity * (0.4 + effect.progress * 1.6), 0, Math.PI * 2)
    ctx.stroke()

    const showsDamage = type === 'hit' || type === 'critical'
    if (showsDamage && config.ui.showFloatingDamage && effect.value > 0) {
      ctx.fillStyle = type === 'critical' ? '#ffd60a' : '#ff6b6b'
      ctx.font = `${Math.round(scaled(layout, type === 'critical' ? 22 : 18))}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(
        String(Math.round(effect.value)),
        x,
        y - scaled(layout, FLOATING_DAMAGE_RISE_PX) * effect.progress,
      )
    }

    ctx.globalAlpha = 1
  }
}

/**
 * Kilatan gabungan, dikurung persis di arena.
 *
 * Overlay OBS transparan: memadamkan seluruh bidang berarti mengecat kotak di atas siaran
 * creator, bukan menyinari arenanya (spec §7.6).
 */
export function drawArenaFlash(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  deps: RenderDeps,
): void {
  if (alpha <= 0) return
  const { arena } = deps.layout

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(arena.x, arena.y, arena.width, arena.height)
  ctx.restore()
}

/** Simpangan maksimum guncangan dalam piksel, pada efek berintensitas 1 yang baru lahir. */
export const MAX_SHAKE_PX = 6

/** Hanya tiga efek ini yang mengguncang; hit biasa terjadi puluhan kali per detik. */
const SHAKE_TYPES = new Set(['nuke', 'kill', 'explosion'])

/**
 * Simpangan guncangan untuk satu frame.
 *
 * Fase diturunkan dari posisi efek, bukan dari angka acak: renderer berada di bawah games/
 * tempat Math.random() dilarang, dan frame yang sama harus selalu menghasilkan gambar yang
 * sama supaya test bisa menegaskannya sama sekali.
 */
export function shakeOffset(
  view: SnapshotView,
  config: BattleArenaConfig,
  reducedMotion: boolean,
): { x: number; y: number } {
  if (reducedMotion || !config.ui.screenShake) return { x: 0, y: 0 }

  let x = 0
  let y = 0
  for (let i = 0; i < view.header.effectCount; i++) {
    const effect = view.effects[i]
    if (effect === undefined) continue
    const type = effectTypeFromIndex(effect.type)
    if (type === null || !SHAKE_TYPES.has(type)) continue

    const amplitude = effect.intensity * (1 - effect.progress) * MAX_SHAKE_PX
    const phase = effect.x * 12.9898 + effect.y * 78.233
    x += Math.cos(phase) * amplitude
    y += Math.sin(phase) * amplitude
  }
  return { x, y }
}

export interface BattleArenaRendererOptions {
  layout: StageLayout
  avatars?: AvatarCache
  image?: (url: string, width: number, height: number) => CanvasImageSource | null
}

/**
 * Renderer lengkap satu frame.
 *
 * Memenuhi IGameRenderer: ia hanya menerima snapshot, config, dan alpha — tidak ada jalan
 * dari sini untuk menyentuh state game.
 */
export class BattleArenaRenderer implements IGameRenderer<SnapshotView, BattleArenaConfig> {
  private layout: StageLayout
  private readonly avatars: AvatarCache
  private readonly image:
    | ((url: string, width: number, height: number) => CanvasImageSource | null)
    | undefined
  private readonly roster = new Map<number, RosterEntry>()
  private readonly fighters: InterpolatedFighter[] = []
  private readonly ultimates: InterpolatedUltimate[] = []
  private readonly deathFade = new DeathFade()
  private readonly hpDisplay = new HpDisplay()
  private readonly sizeDisplay = new HpDisplay({
    riseMs: SIZE_GROW_MS,
    overshoot: SIZE_OVERSHOOT,
  })
  /**
   * Jalur FX (Ultimate FX Lab) — LIVE PATH sejak singularity dan chainFreeze ada.
   *
   * `fx` dan `fxImpulse` adalah satu-satunya yang menggambar ultimate; jalur lama
   * (`drawUltimates` beserta keempat penggambar variannya) sudah dibuang di Plan 8.
   * `post` LAZY: baru dibuat begitu `attachPostCanvas()` diberi elemen kanvas WebGL DAN
   * `UltimateFxPost.isSupported()` benar; kalau tidak, `render()` jatuh ke `drawArenaFlash`
   * di atas canvas 2D biasa (spec §12 fallback tanpa dependensi WebGL).
   */
  private readonly fx = new UltimateFxState()
  private readonly fxImpulse = new UltimateFxImpulse()
  private postCanvasEl: HTMLCanvasElement | null = null
  private post: UltimateFxPost | null = null
  private postSupportedCache: boolean | null = null
  private history: SnapshotHistory | null = null
  private reducedMotion = false

  constructor(opts: BattleArenaRendererOptions) {
    this.layout = opts.layout
    this.avatars = opts.avatars ?? new AvatarCache()
    this.image = opts.image
  }

  setLayout(layout: StageLayout): void {
    this.layout = layout
  }

  setHistory(history: SnapshotHistory): void {
    this.history = history
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value
  }

  setRoster(entries: readonly RosterEntry[]): void {
    this.roster.clear()
    for (const entry of entries) this.roster.set(entry.slotIndex, entry)
  }

  /**
   * Kanvas WebGL yang menampilkan hasil post-process (bloom, distorsi, afterimage).
   *
   * `null` berarti "tidak ada" — dipanggil saat komponen `ui/` tidak lagi punya elemen kanvas
   * untuk itu (unmount) maupun saat `UltimateFxPost.isSupported()` sudah dicek false di sana.
   * `render()` membuat `UltimateFxPost` yang sesungguhnya secara MALAS, begitu elemen ini
   * tersedia dan ukuran kanvas sumber (`ctx.canvas`) sudah diketahui.
   */
  attachPostCanvas(canvas: HTMLCanvasElement | null): void {
    this.postCanvasEl = canvas
    if (canvas === null) {
      this.post?.dispose()
      this.post = null
    }
  }

  /** Pelepasan WebGL saat renderer tidak lagi dipakai (unmount tab). */
  dispose(): void {
    this.post?.dispose()
    this.post = null
  }

  render(
    ctx: CanvasRenderingContext2D,
    view: SnapshotView,
    config: BattleArenaConfig,
    alpha: number,
    /**
     * Milidetik nyata sejak frame render SEBELUMNYA — bukan jarak antar-tick.
     *
     * Jalur FX butuh ini untuk memajukan partikel pada laju layar (60 Hz), independen dari
     * kadensi snapshot (20 Hz); lihat `UltimateFxState`. Diberi lewat parameter, bukan dibaca
     * langsung dari jam peramban, supaya berkas ini tetap tidak menyentuh clock (aturan yang
     * sama dengan `reducedMotion`) — pemanggil di `ui/Stage.tsx` yang mengukurnya lewat
     * timestamp `requestAnimationFrame`. Bawaan satu frame 60 Hz untuk pemanggil test lama
     * yang tidak mengisinya.
     */
    dtMs = 1000 / 60,
  ): void {
    const deps: RenderDeps = {
      layout: this.layout,
      config,
      avatars: this.avatars,
      image: this.image,
      nowMs: view.header.timestampMs,
      deathFade: this.deathFade,
      hpDisplay: this.hpDisplay,
      sizeDisplay: this.sizeDisplay,
      reducedMotion: this.reducedMotion,
      // Diisi tepat setelah interpolasi di bawah — varian ultimate mengejar fighter lewat
      // sini, dan interpolasinya harus sudah selesai sebelum ada yang membacanya.
      fighters: this.fighters,
      fighterCount: 0,
    }
    const previous = this.history?.previous ?? view
    const count = interpolateFighters(previous, view, alpha, this.fighters)
    const ultimateCount = interpolateUltimates(previous, view, alpha, this.ultimates)
    deps.fighterCount = count
    this.deathFade.observe(this.fighters, count, deps.nowMs)
    this.hpDisplay.observe(this.fighters, count, deps.nowMs)
    this.sizeDisplay.observe(this.fighters, count, deps.nowMs)
    // Memajukan jam FX dan mengosongkan beam/pull frame lalu — SEBELUM observe, karena
    // singularity membaca fase charge dari clock yang baru saja maju.
    this.fx.beginFrame(dtMs)
    // Setelah deps lengkap dan sebelum drawFighters: ia membaca posisi fighter yang sudah
    // diinterpolasi untuk menghitung arah dorongnya.
    this.fxImpulse.observe(this.ultimates, ultimateCount, deps)

    clearStage(ctx)

    // Guncangan gabungan: kill/explosion biasa (shakeOffset, dari effect snapshot) plus
    // kick ultimate jalur FX (fx.shake, dari dampak bomb/lightning/singularity/chainFreeze).
    // Ini SATU translate untuk seluruh arena, bukan per elemen.
    const legacyShake = shakeOffset(view, config, this.reducedMotion)
    ctx.save()
    ctx.translate(legacyShake.x + this.fx.shake.x, legacyShake.y + this.fx.shake.y)
    drawZones(ctx, deps)
    drawProjectiles(ctx, view, alpha, deps)
    // Kawah dan isian telegraph DI BAWAH fighter.
    drawFxDecals(ctx, this.fx, deps)
    drawFighters(ctx, this.fighters, count, this.roster, deps, this.fxImpulse)
    drawEffects(ctx, view, deps)
    // Ultimate lewat DI DEPAN blob supaya terlihat menghantam mereka.
    for (let i = 0; i < ultimateCount; i++) {
      const ultimate = this.ultimates[i]
      if (ultimate !== undefined) drawUltimateFx(ctx, ultimate, deps, this.fx, dtMs)
    }
    // Asap DI ATAS fighter.
    drawFxSmoke(ctx, this.fx)
    ctx.restore()

    const flash = fxFlashAlpha(this.ultimates, ultimateCount, config, this.reducedMotion)
    this.ensurePost(ctx.canvas)
    if (this.post === null) {
      // Tanpa WebGL: kilatan ikut jalur 2D lama, di atas segalanya termasuk shake — sama
      // seperti render() lama.
      ctx.save()
      ctx.translate(legacyShake.x + this.fx.shake.x, legacyShake.y + this.fx.shake.y)
      drawArenaFlash(ctx, flash, deps)
      ctx.restore()
    } else {
      this.post.render(this.fx, flash)
    }
    // SETELAH menggambar, supaya partikel yang baru lahir sempat terlihat sekali di posisi
    // lahirnya sebelum diintegrasikan ke posisi berikutnya.
    this.fx.update(dtMs)
  }

  /** Membuat `UltimateFxPost` secara malas begitu kanvas WebGL dan ukuran sumber diketahui. */
  private ensurePost(source: CanvasImageSource): void {
    if (this.postCanvasEl === null || !(source instanceof HTMLCanvasElement)) return
    // DICACHE, bukan dipanggil ulang tiap frame: `isSupported()` membuat kanvas probe dan
    // konteks WebGL baru setiap kali dipanggil. Memanggilnya 60×/detik membanjiri jatah
    // konteks WebGL peramban (biasanya ~16 per halaman) dengan konteks probe yang tidak
    // pernah dilepas, sampai peramban mengusir konteks UltimateFxPost yang SEDANG dipakai —
    // itulah sebabnya kanvas berkedip hitam lalu pulih sendiri.
    this.postSupportedCache ??= UltimateFxPost.isSupported()
    if (!this.postSupportedCache) return

    const width = source.width
    const height = source.height
    if (width <= 0 || height <= 0) return

    if (this.post === null) {
      this.post = new UltimateFxPost(this.postCanvasEl, source, width, height)
    } else {
      this.post.resize(width, height)
    }
  }
}
