import type { ChatPlatform } from '@lga/shared'
import type { Clock } from '../../framework/clock.js'
import type { Vec2 } from '../../framework/entity/entity.js'
import { createEntity } from '../../framework/entity/factory.js'
import { EntityPool } from '../../framework/entity/pool.js'
import type { Rng } from '../../framework/rng.js'
import type { GameplayConfig } from './config/index.js'
import { fighterHitRadius } from './arena.js'
import { findSpawnPosition } from './spawn.js'
import type { Occupant } from './spawn.js'
import { fighterKey } from './types.js'
import type { ActorIdentity, Fighter, SideId } from './types.js'

export type JoinOutcome = 'joined' | 'switched' | 'rejoined' | 'alreadyOnSide' | 'sideFull'

export interface JoinResult {
  outcome: JoinOutcome
  fighter: Fighter | null
}

export interface FighterStats {
  kills: number
  deaths: number
  giftCoins: number
}

export interface FighterRegistryOptions {
  rng: Rng
  clock: Clock
  initialPoolSize?: number
}

export interface CountOptions {
  aliveOnly?: boolean
  platform?: ChatPlatform
}

function makeFighter(type: string): Fighter {
  return {
    ...createEntity(type),
    key: '',
    slotIndex: -1,
    platform: 'demo',
    username: '',
    avatarUrl: null,
    side: 'a',
    hp: 0,
    maxHp: 0,
    damage: 0,
    attackIntervalMs: 0,
    kills: 0,
    deaths: 0,
    giftCoins: 0,
    joinedAtMs: 0,
    lastAttackAtMs: null,
    alive: false,
    aiState: 'idle',
    targetKey: null,
    likeAccumulator: 0,
    facingAngle: 0,
    nextIdleTurnAtMs: 0,
  }
}

/**
 * Seluruh fighter yang sedang ada di arena, beserta ingatan atas yang pernah ada.
 *
 * Statistik hidup lebih lama dari fighter-nya: kill dan death disimpan per kunci identitas,
 * sehingga viewer yang pindah sisi atau join ulang setelah mati tetap membawa rekornya
 * (Req 4 AC4). Fighter yang MATI tetap terdaftar dan tidak dilepas ke pool (keputusan D1) —
 * itulah yang membuat ronde berikutnya bisa dimulai tanpa viewer mengetik ulang.
 */
/**
 * 1/φ. Mengalikannya dengan indeks lalu mengambil pecahannya menghasilkan deret yang
 * mengisi rentang 0–1 serata mungkin pada setiap panjang awalan — dasar sebaran fase tembak.
 */
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895

export class FighterRegistry {
  private readonly pool: EntityPool<Fighter>
  private readonly byKey = new Map<string, Fighter>()
  private readonly stats = new Map<string, FighterStats>()
  private readonly freeSlots: number[] = []
  private nextSlot = 0
  private readonly rng: Rng
  private readonly clock: Clock

  constructor(opts: FighterRegistryOptions) {
    this.rng = opts.rng
    this.clock = opts.clock
    this.pool = new EntityPool<Fighter>('fighter', opts.initialPoolSize ?? 64, makeFighter)
  }

  get count(): number {
    return this.byKey.size
  }

  get(key: string): Fighter | undefined {
    return this.byKey.get(key)
  }

  list(): Fighter[] {
    return [...this.byKey.values()]
  }

  /**
   * Iterasi tanpa alokasi, untuk jalur panas seperti pencarian target tiap tick.
   * Jangan menambah atau menghapus fighter selama iterasi berlangsung.
   */
  values(): IterableIterator<Fighter> {
    return this.byKey.values()
  }

  forEach(fn: (fighter: Fighter) => void): void {
    for (const fighter of this.byKey.values()) fn(fighter)
  }

  countOnSide(side: SideId, opts: CountOptions = {}): number {
    let total = 0
    for (const f of this.byKey.values()) {
      if (f.side !== side) continue
      if (opts.aliveOnly === true && !f.alive) continue
      if (opts.platform !== undefined && f.platform !== opts.platform) continue
      total++
    }
    return total
  }

  join(actor: ActorIdentity, side: SideId, gameplay: GameplayConfig): JoinResult {
    const key = fighterKey(actor)
    const existing = this.byKey.get(key)

    if (existing !== undefined && existing.side === side) {
      if (existing.alive) return { outcome: 'alreadyOnSide', fighter: existing }
      this.place(existing, actor, side, gameplay, {
        kills: existing.kills,
        deaths: existing.deaths,
        giftCoins: existing.giftCoins,
      })
      return { outcome: 'rejoined', fighter: existing }
    }

    if (existing !== undefined) {
      // Kapasitas diperiksa SEBELUM melepas fighter lama: pindah ke sisi yang penuh
      // tidak boleh berujung viewer kehilangan fighter di kedua sisi.
      if (this.countOnSide(side) >= gameplay.maxFightersPerSide) return { outcome: 'sideFull', fighter: null }
      const carried: FighterStats = {
        kills: existing.kills,
        deaths: existing.deaths,
        giftCoins: existing.giftCoins,
      }
      this.remove(key)
      return { outcome: 'switched', fighter: this.spawn(actor, side, gameplay, carried) }
    }

    if (this.countOnSide(side) >= gameplay.maxFightersPerSide) return { outcome: 'sideFull', fighter: null }
    const carried = this.stats.get(key) ?? { kills: 0, deaths: 0, giftCoins: 0 }
    return { outcome: 'joined', fighter: this.spawn(actor, side, gameplay, carried) }
  }

  /**
   * Menambahkan koin gift ke fighter viewer ini.
   *
   * Viewer tanpa fighter diabaikan diam-diam: tidak ada identitas yang bisa dititipi, dan
   * Req 13 AC4 memang meminta gift semacam itu tidak diantre untuk nanti.
   */
  addGiftCoins(actor: ActorIdentity, coins: number): void {
    if (coins <= 0) return
    const fighter = this.byKey.get(fighterKey(actor))
    if (fighter === undefined) return
    fighter.giftCoins += coins
  }

  remove(key: string): boolean {
    const fighter = this.byKey.get(key)
    if (fighter === undefined) return false
    this.stats.set(key, {
      kills: fighter.kills,
      deaths: fighter.deaths,
      giftCoins: fighter.giftCoins,
    })
    this.releaseSlot(fighter.slotIndex)
    this.byKey.delete(key)
    this.pool.release(fighter)
    return true
  }

  removeByPlatform(platform: ChatPlatform): number {
    const keys = [...this.byKey.values()].filter((f) => f.platform === platform).map((f) => f.key)
    for (const key of keys) this.remove(key)
    return keys.length
  }

  /** Awal ronde baru: semua hidup lagi, HP penuh, posisi baru, statistik dipertahankan. */
  restoreForNewRound(gameplay: GameplayConfig): void {
    const placed: Occupant[] = []
    for (const fighter of this.byKey.values()) {
      // HP-nya baru dipulihkan beberapa baris di bawah; ukuran yang berlaku setelah ronde
      // dimulai adalah ukuran pada maxHp, jadi itu yang dipakai memberi ruang.
      const radius = fighterHitRadius(fighter.maxHp, gameplay.baseHp)
      const position = findSpawnPosition({
        rng: this.rng,
        side: fighter.side,
        occupied: placed,
        radius,
      })
      fighter.position.x = position.x
      fighter.position.y = position.y
      placed.push({ x: position.x, y: position.y, radius })

      fighter.hp = fighter.maxHp
      fighter.alive = true
      fighter.targetKey = null
      fighter.velocity.x = 0
      fighter.velocity.y = 0
      fighter.attackIntervalMs = gameplay.attackIntervalSec * 1000
      this.staggerFirstShot(fighter)
    }
  }

  /**
   * Menyebar fase tembak awal tiap fighter di dalam satu interval serangan.
   *
   * Tanpa ini semua yang lahir pada tick yang sama menembak bersamaan, dan karena
   * intervalnya identik mereka TIDAK PERNAH keluar dari lockstep: yang terlihat adalah satu
   * salvo serentak tiap `attackIntervalSec`, bukan tembakan yang saling menyusul.
   *
   * Fasenya diturunkan dari `slotIndex` lewat deret rasio emas, BUKAN dari rng. Fase acak
   * menyebar rata hanya secara rata-rata; pada belasan fighter ia tetap sering menggerombol
   * — dua-tiga orang jatuh di tick yang sama sementara sepuluh tick lain kosong, dan itu
   * persis pola yang mau dihilangkan. Deret rasio emas berdiskrepansi rendah: BERAPA PUN
   * jumlah slot yang terpakai, fase-fasenya selalu terbagi hampir rata, jadi sesama anggota
   * satu tim pun tidak pernah berbarengan selama jumlahnya belum melebihi jumlah tick dalam
   * satu interval. Bonusnya, ia tidak menarik satu pun angka dari rng, jadi titik spawn
   * berseed tidak ikut bergeser.
   *
   * Mulai di 'cooldown', bukan 'acquireTarget', karena fase hanya berlaku kalau fighter
   * memang sedang menunggu — 'acquireTarget' menembak pada tick berikutnya apa pun isi
   * `lastAttackAtMs`.
   */
  private staggerFirstShot(fighter: Fighter): void {
    const phase = (fighter.slotIndex * GOLDEN_RATIO_CONJUGATE) % 1
    fighter.aiState = 'cooldown'
    fighter.lastAttackAtMs = this.clock.now() - phase * fighter.attackIntervalMs
  }

  statsFor(key: string): FighterStats {
    const fighter = this.byKey.get(key)
    if (fighter !== undefined)
      return { kills: fighter.kills, deaths: fighter.deaths, giftCoins: fighter.giftCoins }
    return { ...(this.stats.get(key) ?? { kills: 0, deaths: 0, giftCoins: 0 }) }
  }

  clear(): void {
    for (const key of [...this.byKey.keys()]) this.remove(key)
    this.stats.clear()
    this.freeSlots.length = 0
    this.nextSlot = 0
  }

  private spawn(
    actor: ActorIdentity,
    side: SideId,
    gameplay: GameplayConfig,
    carried: FighterStats,
  ): Fighter {
    const fighter = this.pool.acquire()
    fighter.type = 'fighter'
    fighter.slotIndex = this.acquireSlot()
    this.place(fighter, actor, side, gameplay, carried)
    this.byKey.set(fighter.key, fighter)
    return fighter
  }

  /** Mengisi ulang seluruh field pertarungan. Dipakai saat spawn baru maupun rejoin. */
  private place(
    fighter: Fighter,
    actor: ActorIdentity,
    side: SideId,
    gameplay: GameplayConfig,
    carried: FighterStats,
  ): void {
    const occupied: Occupant[] = [...this.byKey.values()]
      .filter((f) => f !== fighter)
      .map((f) => ({
        x: f.position.x,
        y: f.position.y,
        radius: fighterHitRadius(f.hp, gameplay.baseHp),
      }))
    // Yang baru datang selalu lahir sebesar baseHp, jadi radiusnya radius dasar.
    const position = findSpawnPosition({ rng: this.rng, side, occupied })

    fighter.key = fighterKey(actor)
    fighter.platform = actor.platform
    fighter.username = actor.username
    fighter.avatarUrl = actor.avatarUrl
    fighter.side = side
    fighter.position.x = position.x
    fighter.position.y = position.y
    fighter.velocity.x = 0
    fighter.velocity.y = 0
    fighter.lifetime = -1
    fighter.hp = gameplay.baseHp
    fighter.maxHp = gameplay.baseHp
    fighter.damage = gameplay.baseDamage
    fighter.attackIntervalMs = gameplay.attackIntervalSec * 1000
    fighter.kills = carried.kills
    fighter.deaths = carried.deaths
    fighter.giftCoins = carried.giftCoins
    fighter.joinedAtMs = this.clock.now()
    fighter.alive = true
    fighter.targetKey = null
    this.staggerFirstShot(fighter)
    fighter.likeAccumulator = 0
    fighter.facingAngle = side === 'a' ? 0 : Math.PI
    fighter.nextIdleTurnAtMs = 0
  }

  /** Slot terkecil yang bebas — overlay memakainya untuk mencocokkan record antar-tick. */
  private acquireSlot(): number {
    if (this.freeSlots.length === 0) return this.nextSlot++
    this.freeSlots.sort((a, b) => a - b)
    return this.freeSlots.shift() as number
  }

  private releaseSlot(slot: number): void {
    if (slot >= 0) this.freeSlots.push(slot)
  }
}
