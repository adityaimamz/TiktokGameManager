/**
 * Tata letak snapshot state game sebagai satu Float32Array padat (§6.2).
 *
 * 200 fighter dan 500 projectile per tick sebagai objek JSON akan membanjiri
 * BroadcastChannel. Buffer ini dikirim 20x per detik; sisi penerima men-decode-nya
 * dan menginterpolasi di 60 fps.
 *
 * Semua isinya ANGKA. Data teks yang jarang berubah — username, URL avatar, nama dan
 * warna sisi — dikirim terpisah sebagai JSON hanya saat berubah.
 */

export const SNAPSHOT_HEADER_LENGTH = 12
export const FIGHTER_STRIDE = 11
export const PROJECTILE_STRIDE = 6
export const EFFECT_STRIDE = 6
export const ULTIMATE_STRIDE = 24

/**
 * Berapa banyak sasaran yang boleh disentuh SATU ultimate.
 *
 * Satu angka, satu arti: ia membatasi panjang daftar di snapshot sekaligus jumlah korban
 * yang boleh kena damage saat mendarat. `NUKE_MAX_TARGETS` yang dulu tinggal di lapisan game
 * karena itu dihapus, bukan disamakan — dua konstanta dengan angka yang sama adalah dua
 * tempat untuk berselisih.
 */
export const ULTIMATE_MAX_TARGETS = 10

/** Sisi disandikan sebagai angka; pemetaan ke 'a'/'b' urusan lapisan game. */
export const SIDE_A = 0
export const SIDE_B = 1

/** Nilai targetSlot saat sebuah fighter tidak sedang menarget siapa pun. */
export const NO_SLOT = -1
/** Nilai roundWinner saat ronde belum diputuskan. */
export const NO_SIDE = -1

export interface SnapshotHeader {
  tick: number
  timestampMs: number
  /** Indeks state match pada daftar state milik game. */
  matchState: number
  roundScoreA: number
  roundScoreB: number
  roundsWonA: number
  roundsWonB: number
  fighterCount: number
  projectileCount: number
  effectCount: number
  /** Sisi pemenang ronde berjalan, atau NO_SIDE bila ronde belum diputuskan. */
  roundWinner: number
  ultimateCount: number
}

export interface SnapshotFighter {
  /** Slot stabil sepanjang hidup fighter — kunci pencocokan antar-tick untuk interpolasi. */
  slotIndex: number
  x: number
  y: number
  hp: number
  maxHp: number
  side: number
  alive: number
  facingAngle: number
  targetSlot: number
  kills: number
  /** Koin gift kumulatif viewer ini sepanjang match. Sumber kartu top gifter. */
  giftCoins: number
}

export interface SnapshotProjectile {
  x: number
  y: number
  /** Kecepatan per tick — dipakai renderer untuk dead reckoning antar-snapshot. */
  vx: number
  vy: number
  kind: number
  /**
   * Milidetik sejak tembakan lepas.
   *
   * Ada demi satu hal saja: renderer memotong panjang berkas ke jarak yang BENAR-BENAR
   * sudah ditempuh, supaya berkas yang baru lahir tidak menjulur ke belakang penembaknya.
   * Tidak bisa diturunkan dari `vx`/`vy` — kecepatan dibidik ulang tiap tick dan dijepit
   * saat mendarat, jadi ia tidak menyimpan jejak umur.
   */
  age: number
}

export interface SnapshotEffect {
  type: number
  x: number
  y: number
  /** Kemajuan animasi 0–1 pada saat encode. */
  progress: number
  intensity: number
  value: number
}

/**
 * Bagian tersendiri, bukan pelebaran record efek (keputusan D1).
 *
 * Tujuh field yang harus menyeberang untuk callout dan hasil pendaratan tidak dibutuhkan
 * satu pun oleh ratusan efek `hit` yang ikut memakai record efek. Dibatasi hardCap (bawaan 6),
 * jadi ≤ 72 float berapa pun ramainya arena.
 */
export interface SnapshotUltimate {
  casterSlot: number
  /** Indeks pada daftar jenis ultimate milik game. */
  variant: number
  /** Indeks tier, bukan pengalinya. */
  tier: number
  originX: number
  originY: number
  targetX: number
  targetY: number
  progress: number
  killCount: number
  totalDamage: number
  stale: number
  /** Identitas stabil — syarat renderer bisa menginterpolasi progress antar-snapshot. */
  slot: number
  /**
   * Jarak kedatangan antar-sasaran, DALAM SATUAN PROGRESS. 0 berarti serentak.
   *
   * Dihitung engine saat rilis dan dikirim apa adanya. Renderer TIDAK boleh menurunkannya
   * dari `durationMs`: angka di config masih nominal, dan pengali tier serta varian berlaku
   * di atasnya sebelum jarak tick yang sebenarnya diketahui.
   */
  staggerProgress: number
  /**
   * Milidetik yang ditempuh satu satuan progress.
   *
   * Renderer butuh ini untuk apa pun yang berbasis waktu nyata; steering rudal memakai
   * derajat per detik. Ia tidak bisa menurunkannya sendiri karena seluruh pengali yang
   * membentuk durasi sebenarnya hanya diketahui engine.
   */
  msPerProgress: number
  /**
   * Slot fighter yang dibidik ultimate ini. Padat dari depan, sisanya NO_SLOT.
   *
   * Yang menyeberang adalah SLOT, bukan koordinat: renderer mencari fighter-nya di view yang
   * sama dan mendapat posisi yang sudah diinterpolasi 60 fps secara gratis, sehingga rudal
   * mengejar sasaran yang benar-benar bergerak alih-alih titik beku 20 Hz.
   *
   * Panjangnya SELALU ULTIMATE_MAX_TARGETS; array-nya dipakai ulang antar-decode.
   */
  targetSlots: number[]
}

/**
 * Hasil decode.
 *
 * PERINGATAN: ketiga array boleh LEBIH PANJANG dari jumlah record yang berlaku, karena
 * decoder memakai ulang objeknya antar-frame. Selalu iterasi sampai `header.*Count`.
 */
export interface SnapshotView {
  header: SnapshotHeader
  fighters: SnapshotFighter[]
  projectiles: SnapshotProjectile[]
  effects: SnapshotEffect[]
  ultimates: SnapshotUltimate[]
}

export function snapshotLength(
  fighters: number,
  projectiles: number,
  effects: number,
  ultimates = 0,
): number {
  return (
    SNAPSHOT_HEADER_LENGTH +
    fighters * FIGHTER_STRIDE +
    projectiles * PROJECTILE_STRIDE +
    effects * EFFECT_STRIDE +
    ultimates * ULTIMATE_STRIDE
  )
}

export function createSnapshotView(): SnapshotView {
  return {
    header: {
      tick: 0,
      timestampMs: 0,
      matchState: 0,
      roundScoreA: 0,
      roundScoreB: 0,
      roundsWonA: 0,
      roundsWonB: 0,
      fighterCount: 0,
      projectileCount: 0,
      effectCount: 0,
      roundWinner: NO_SIDE,
      ultimateCount: 0,
    },
    fighters: [],
    projectiles: [],
    effects: [],
    ultimates: [],
  }
}

function grow<T>(list: T[], count: number, make: () => T): void {
  while (list.length < count) list.push(make())
}

export function decodeSnapshot(
  buf: Float32Array,
  into: SnapshotView = createSnapshotView(),
): SnapshotView {
  const h = into.header
  h.tick = buf[0] ?? 0
  h.timestampMs = buf[1] ?? 0
  h.matchState = buf[2] ?? 0
  h.roundScoreA = buf[3] ?? 0
  h.roundScoreB = buf[4] ?? 0
  h.roundsWonA = buf[5] ?? 0
  h.roundsWonB = buf[6] ?? 0
  h.fighterCount = buf[7] ?? 0
  h.projectileCount = buf[8] ?? 0
  h.effectCount = buf[9] ?? 0
  h.roundWinner = buf[10] ?? NO_SIDE
  h.ultimateCount = buf[11] ?? 0

  let offset = SNAPSHOT_HEADER_LENGTH

  grow(into.fighters, h.fighterCount, () => ({
    slotIndex: NO_SLOT,
    x: 0,
    y: 0,
    hp: 0,
    maxHp: 0,
    side: SIDE_A,
    alive: 0,
    facingAngle: 0,
    targetSlot: NO_SLOT,
    kills: 0,
    giftCoins: 0,
  }))
  for (let i = 0; i < h.fighterCount; i++) {
    const f = into.fighters[i] as SnapshotFighter
    f.slotIndex = buf[offset] ?? NO_SLOT
    f.x = buf[offset + 1] ?? 0
    f.y = buf[offset + 2] ?? 0
    f.hp = buf[offset + 3] ?? 0
    f.maxHp = buf[offset + 4] ?? 0
    f.side = buf[offset + 5] ?? SIDE_A
    f.alive = buf[offset + 6] ?? 0
    f.facingAngle = buf[offset + 7] ?? 0
    f.targetSlot = buf[offset + 8] ?? NO_SLOT
    f.kills = buf[offset + 9] ?? 0
    f.giftCoins = buf[offset + 10] ?? 0
    offset += FIGHTER_STRIDE
  }

  grow(into.projectiles, h.projectileCount, () => ({ x: 0, y: 0, vx: 0, vy: 0, kind: 0, age: 0 }))
  for (let i = 0; i < h.projectileCount; i++) {
    const p = into.projectiles[i] as SnapshotProjectile
    p.x = buf[offset] ?? 0
    p.y = buf[offset + 1] ?? 0
    p.vx = buf[offset + 2] ?? 0
    p.vy = buf[offset + 3] ?? 0
    p.kind = buf[offset + 4] ?? 0
    p.age = buf[offset + 5] ?? 0
    offset += PROJECTILE_STRIDE
  }

  grow(into.effects, h.effectCount, () => ({
    type: 0,
    x: 0,
    y: 0,
    progress: 0,
    intensity: 1,
    value: 0,
  }))
  for (let i = 0; i < h.effectCount; i++) {
    const e = into.effects[i] as SnapshotEffect
    e.type = buf[offset] ?? 0
    e.x = buf[offset + 1] ?? 0
    e.y = buf[offset + 2] ?? 0
    e.progress = buf[offset + 3] ?? 0
    e.intensity = buf[offset + 4] ?? 1
    e.value = buf[offset + 5] ?? 0
    offset += EFFECT_STRIDE
  }

  grow(into.ultimates, h.ultimateCount, () => ({
    casterSlot: NO_SLOT,
    variant: 0,
    tier: 0,
    originX: 0,
    originY: 0,
    targetX: 0,
    targetY: 0,
    progress: 0,
    killCount: 0,
    totalDamage: 0,
    stale: 0,
    slot: NO_SLOT,
    staggerProgress: 0,
    msPerProgress: 0,
    targetSlots: new Array<number>(ULTIMATE_MAX_TARGETS).fill(NO_SLOT),
  }))
  for (let i = 0; i < h.ultimateCount; i++) {
    const u = into.ultimates[i] as SnapshotUltimate
    u.casterSlot = buf[offset] ?? NO_SLOT
    u.variant = buf[offset + 1] ?? 0
    u.tier = buf[offset + 2] ?? 0
    u.originX = buf[offset + 3] ?? 0
    u.originY = buf[offset + 4] ?? 0
    u.targetX = buf[offset + 5] ?? 0
    u.targetY = buf[offset + 6] ?? 0
    u.progress = buf[offset + 7] ?? 0
    u.killCount = buf[offset + 8] ?? 0
    u.totalDamage = buf[offset + 9] ?? 0
    u.stale = buf[offset + 10] ?? 0
    u.slot = buf[offset + 11] ?? NO_SLOT
    u.staggerProgress = buf[offset + 12] ?? 0
    u.msPerProgress = buf[offset + 13] ?? 0
    for (let t = 0; t < ULTIMATE_MAX_TARGETS; t++) {
      u.targetSlots[t] = buf[offset + 14 + t] ?? NO_SLOT
    }
    offset += ULTIMATE_STRIDE
  }

  return into
}

/**
 * Dua snapshot terakhir, bergantian menempati dua buffer tetap.
 *
 * Interpolasi butuh state sebelum dan sesudah; menyimpannya sebagai dua view yang
 * ditulis bergantian berarti tidak ada alokasi sama sekali di jalur 20 Hz.
 */
export class SnapshotHistory {
  private readonly views: [SnapshotView, SnapshotView] = [
    createSnapshotView(),
    createSnapshotView(),
  ]
  private currentIndex = 0
  private received = 0

  get hasData(): boolean {
    return this.received > 0
  }

  get receivedCount(): number {
    return this.received
  }

  get current(): SnapshotView {
    return this.views[this.currentIndex] as SnapshotView
  }

  get previous(): SnapshotView {
    return this.views[this.currentIndex === 0 ? 1 : 0] as SnapshotView
  }

  push(raw: Float32Array): void {
    const next = this.currentIndex === 0 ? 1 : 0
    decodeSnapshot(raw, this.views[next] as SnapshotView)
    this.currentIndex = next
    this.received++
    // Snapshot pertama mengisi keduanya: menginterpolasi dari view kosong akan
    // membuat seluruh arena melesat dari pojok kiri atas di frame pertama.
    if (this.received === 1) decodeSnapshot(raw, this.views[next === 0 ? 1 : 0] as SnapshotView)
  }
}
