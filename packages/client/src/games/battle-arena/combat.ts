import { CHARGE_END, NO_SLOT, ULTIMATE_MAX_TARGETS } from '@lga/shared'
import type { ActionQueue } from '../../framework/actions/queue.js'
import type { Rng } from '../../framework/rng.js'
import { ARENA_MAX, ARENA_MIN, sideHalfCenter } from './arena.js'
import { parseTarget } from './actions.js'
import type { BattleAction, ResolvedTarget } from './actions.js'
import type { BattleArenaConfig } from './config/index.js'
import { spawnGameEffect } from './effects.js'
import type { ActionDiscardReason, EngineEventListener } from './events.js'
import { fireProjectile } from './projectiles.js'
import type { BattleArenaState } from './state.js'
import { SIDES, fighterKey, otherSide } from './types.js'
import type { Fighter, SideId } from './types.js'
import {
  enqueueUltimate,
  holdForCallout,
  releaseUltimates,
  ultimateProgress,
} from './ultimate.js'
import type { ActiveUltimate } from './ultimate.js'

export interface CombatDeps {
  state: BattleArenaState
  config: BattleArenaConfig
  queue: ActionQueue<BattleAction>
  /** Dua target acak (`randomAlly`, `randomEnemy`) memilih dari sini, bukan Math.random(). */
  rng: Rng
  nowMs: number
  emit: EngineEventListener
}

/**
 * Sisi yang dituju sebuah target, atau null bila target itu bukan sebuah sisi.
 *
 * Dipakai `nuke`, yang butuh pusat ledakan dan karena itu tidak bisa bekerja pada satu
 * fighter. Scope acak sengaja menghasilkan null.
 */
function targetSide(target: ResolvedTarget, state: BattleArenaState): SideId | null {
  if (target.kind === 'side') return target.side
  if (target.kind !== 'relative') return null
  if (target.scope === 'randomAlly' || target.scope === 'randomEnemy') return null

  const sender = state.fighters.get(target.key)
  if (sender === undefined) return null
  return target.scope === 'enemySide' ? otherSide(sender.side) : sender.side
}

/** Fighter yang dituju sebuah action. Target tak dikenal menghasilkan daftar kosong. */
export function resolveActionTargets(action: BattleAction, deps: CombatDeps): Fighter[] {
  const state = deps.state
  const target = parseTarget(action.target)
  switch (target.kind) {
    case 'fighter': {
      const fighter = state.fighters.get(target.key)
      return fighter === undefined ? [] : [fighter]
    }
    case 'side':
      return state.fighters.list().filter((f) => f.side === target.side)
    case 'all':
      return state.fighters.list()
    case 'relative': {
      // Sisi keanggotaan adalah state, bukan sesuatu yang dibawa pesan chat. Pengirim yang
      // belum punya fighter karena itu menghasilkan nol target, bukan error.
      const sender = state.fighters.get(target.key)
      if (sender === undefined) return []

      const wantsEnemy = target.scope === 'enemySide' || target.scope === 'randomEnemy'
      const side = wantsEnemy ? otherSide(sender.side) : sender.side
      const pool = state.fighters.list().filter((f) => f.side === side)
      if (target.scope === 'ownSide' || target.scope === 'enemySide') return pool

      // Diurutkan slotIndex lebih dulu: urutan iterasi Map bergantung pada sejarah
      // penyisipan dan penghapusan, jadi tanpa ini seed yang sama bisa memilih korban
      // berbeda setelah seseorang keluar.
      const alive = pool.filter((f) => f.alive).sort((a, b) => a.slotIndex - b.slotIndex)
      return alive.length === 0 ? [] : [deps.rng.pick(alive)]
    }
    case 'unknown':
      return []
  }
}

/**
 * Sisi yang akan menerima gifter berikutnya: yang fighter HIDUP-nya paling sedikit.
 *
 * Bukan acak murni. Acak murni akan menumpuk gifter di satu sisi dan merusak keseimbangan
 * yang justru dijaga maxFightersPerSide; rng hanya memutus seri.
 *
 * `aliveOnly` bukan detail. Fighter mati tetap terdaftar sepanjang ronde, jadi menghitung
 * registrasi membuat sisi yang baru saja DIBANTAI terlihat paling ramai — dan gifter
 * dikirim ke sisi yang sedang menang, persis kebalikan dari maksudnya. Yang mengukur
 * kekuatan adalah siapa yang masih berdiri. Jatah kursi tetap dihitung atas registrasi;
 * itu urusan `join()`, bukan urusan di sini.
 */
export function preferredSide(deps: CombatDeps): SideId {
  const a = deps.state.fighters.countOnSide('a', { aliveOnly: true })
  const b = deps.state.fighters.countOnSide('b', { aliveOnly: true })
  if (a < b) return 'a'
  if (b < a) return 'b'
  return deps.rng.pick(SIDES)
}

/**
 * Gift dari viewer yang belum bermain mendaftarkannya lebih dulu (spec §6.2).
 *
 * Digantung pada action.giftName, bukan pada tipe aksinya: "bayar lalu tidak terjadi apa-apa"
 * sama buruknya untuk heal, hasten, maupun ultimate. Kedua sisi penuh bukan error — pemanggil
 * melanjutkan dengan casterSlot NO_SLOT, dan gift history tetap menyebut namanya.
 */
export function ensureGifterJoined(action: BattleAction, deps: CombatDeps): void {
  if (action.giftName === null || action.actor === null) return
  if (!deps.config.gameplay.autoJoinGifter) return
  if (deps.state.fighters.get(fighterKey(action.actor)) !== undefined) return

  const first = preferredSide(deps)
  let result = deps.state.fighters.join(action.actor, first, deps.config.gameplay)
  if (result.fighter === null) {
    result = deps.state.fighters.join(action.actor, otherSide(first), deps.config.gameplay)
  }
  if (result.fighter === null) return

  deps.emit({ type: 'fighterJoined', fighter: result.fighter, outcome: result.outcome })
}

/**
 * Menerapkan Grow: menaikkan maxHp, bukan sekadar mengisi HP sampai plafon tetap.
 *
 * Inilah penyimpangan sadar dari Req 5 AC1 yang membuat angka HP ratusan seperti di
 * screenshot bisa tercapai lewat akumulasi like. Mengembalikan HP yang diperoleh.
 */
/**
 * Satu-satunya tempat maxHp naik.
 *
 * `hp` ikut naik sebesar yang sama, dan itu bukan kemudahan: `fighterScale` membaca HP
 * BERJALAN, jadi plafon yang membesar tanpa isinya justru MENGECILKAN fighter-nya. Dua
 * pemanggil — Grow biasa dan bonus `growWithNuke` — melewati fungsi ini supaya aturan itu
 * tidak bisa berlaku di satu jalur saja.
 */
export function raiseMaxHp(fighter: Fighter, amount: number): number {
  if (amount <= 0) return 0
  fighter.maxHp += amount
  fighter.hp += amount
  return amount
}

export function growFighter(fighter: Fighter, units: number, deps: CombatDeps): number {
  const perGrow = deps.config.gameplay.hpGainedPerGrow

  // 'perLike', 'perCoin', dan 'perFollow' adalah jalur yang sama: satuan × HP per Grow.
  // Yang membedakannya hanya SATUAN yang dipasok trigger, dan hanya kondisi rule yang
  // bisa tahu satuan mana yang berlaku (§4 spec).
  if (deps.config.gameplay.growMode !== 'flat') {
    return raiseMaxHp(fighter, perGrow * Math.max(0, units))
  }

  const threshold = deps.config.likes.threshold
  fighter.likeAccumulator += Math.max(0, units)

  let gained = 0
  while (fighter.likeAccumulator >= threshold) {
    fighter.likeAccumulator -= threshold
    gained += raiseMaxHp(fighter, perGrow)
  }
  return gained
}

/** Satu-satunya jalan HP berkurang, fighter mati, dan skor bertambah. */
export function applyDamage(
  target: Fighter,
  amount: number,
  attacker: Fighter | null,
  deps: CombatDeps,
): void {
  if (!target.alive) return

  target.hp = Math.max(0, target.hp - amount)
  spawnGameEffect(deps.state.effects, deps.config, {
    type: 'hit',
    x: target.position.x,
    y: target.position.y,
    value: amount,
  })
  if (target.hp > 0) return

  target.alive = false
  target.deaths++
  target.velocity.x = 0
  target.velocity.y = 0
  target.targetKey = null

  if (attacker !== null && attacker.key !== target.key) {
    attacker.kills++
    deps.state.roundScore[attacker.side]++
  }

  // Semua yang mengincar korban harus memilih ulang seketika (Req 10 AC4).
  deps.state.fighters.forEach((other) => {
    if (other.targetKey === target.key) {
      other.targetKey = null
      other.aiState = 'acquireTarget'
    }
  })

  spawnGameEffect(deps.state.effects, deps.config, {
    type: 'kill',
    x: target.position.x,
    y: target.position.y,
  })
  deps.emit({ type: 'fighterDied', fighter: target, killer: attacker })

  // Dievaluasi di sini, bukan hanya di fase Cleanup, supaya sisi yang MENCETAK kill penentu
  // yang memenangkan ronde saat kedua sisi mencapai target pada event yang sama (Req 11 AC4).
  if (
    deps.state.roundWinner === null &&
    attacker !== null &&
    deps.state.roundScore[attacker.side] >= deps.config.gameplay.killsToWinRound
  ) {
    deps.state.roundWinner = attacker.side
  }
}

export function applyAction(action: BattleAction, deps: CombatDeps): void {
  ensureGifterJoined(action, deps)

  const discard = (reason: ActionDiscardReason): void => {
    deps.emit({ type: 'actionDiscarded', action, reason })
  }

  switch (action.type) {
    case 'spawn': {
      const target = parseTarget(action.target)
      if (target.kind !== 'side') return discard('unknownTarget')
      if (action.actor === null) return discard('noActor')

      const result = deps.state.fighters.join(action.actor, target.side, deps.config.gameplay)
      if (result.fighter === null || result.outcome === 'alreadyOnSide') {
        deps.emit({
          type: 'joinRejected',
          actor: action.actor,
          side: target.side,
          reason: result.outcome,
        })
        return discard(result.outcome === 'sideFull' ? 'sideFull' : 'alreadyJoined')
      }

      spawnGameEffect(deps.state.effects, deps.config, {
        type: 'join',
        x: result.fighter.position.x,
        y: result.fighter.position.y,
      })
      deps.emit({ type: 'fighterJoined', fighter: result.fighter, outcome: result.outcome })
      deps.emit({ type: 'actionApplied', action })
      return
    }

    case 'grow': {
      const targets = resolveActionTargets(action, deps).filter((f) => f.alive)
      if (targets.length === 0) return discard('inactiveTarget')
      for (const fighter of targets) {
        const gained = growFighter(fighter, action.value, deps)
        if (gained > 0) {
          spawnGameEffect(deps.state.effects, deps.config, {
            type: 'heal',
            x: fighter.position.x,
            y: fighter.position.y,
            value: gained,
          })
        }
      }
      deps.emit({ type: 'actionApplied', action })
      return
    }

    case 'heal': {
      const targets = resolveActionTargets(action, deps).filter((f) => f.alive)
      if (targets.length === 0) return discard('inactiveTarget')
      for (const fighter of targets) {
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + action.value)
        spawnGameEffect(deps.state.effects, deps.config, {
          type: 'heal',
          x: fighter.position.x,
          y: fighter.position.y,
          value: action.value,
        })
      }
      deps.emit({ type: 'actionApplied', action })
      return
    }

    case 'damage': {
      const targets = resolveActionTargets(action, deps).filter((f) => f.alive)
      if (targets.length === 0) return discard('inactiveTarget')
      for (const fighter of targets) applyDamage(fighter, action.value, null, deps)
      deps.emit({ type: 'actionApplied', action })
      return
    }

    case 'buff':
    case 'debuff': {
      const targets = resolveActionTargets(action, deps).filter((f) => f.alive)
      if (targets.length === 0) return discard('inactiveTarget')
      for (const fighter of targets) {
        fighter.damage =
          action.type === 'buff'
            ? fighter.damage + action.value
            : Math.max(1, fighter.damage - action.value)
      }
      deps.emit({ type: 'actionApplied', action })
      return
    }

    case 'hasten': {
      const targets = resolveActionTargets(action, deps).filter((f) => f.alive)
      if (targets.length === 0) return discard('inactiveTarget')
      // Lantai 50% interval dasar = maksimal 200% kecepatan serang (Req 13 AC3), ditulis
      // pada satuan yang benar-benar dipakai Fighter.
      const floorMs = deps.config.gameplay.attackIntervalSec * 1000 * 0.5
      for (const fighter of targets) {
        fighter.attackIntervalMs = Math.max(floorMs, fighter.attackIntervalMs - action.value)
        spawnGameEffect(deps.state.effects, deps.config, {
          type: 'gift',
          x: fighter.position.x,
          y: fighter.position.y,
        })
      }
      deps.emit({ type: 'actionApplied', action })
      return
    }

    case 'nuke': {
      const actor = action.actor
      const caster = actor === null ? undefined : deps.state.fighters.get(fighterKey(actor))

      // Sisi sasaran SELALU terselesaikan. Pengirim tanpa fighter dan scope acak dulu
      // berujung discard('unknownTarget'), dan itu menabrak aturan keras §1: orangnya sudah
      // membayar. Jatuhannya lawan dari preferredSide — sisi yang sama yang akan dipilih
      // ensureGifterJoined, jadi konsisten, bukan asal.
      const resolved = targetSide(parseTarget(action.target), deps.state)
      const target = resolved ?? otherSide(caster?.side ?? preferredSide(deps))
      const casterSide = caster?.side ?? otherSide(target)

      // Tengah tepi LUAR sisi caster. Ditulis eksplisit supaya ultimate tanpa caster tidak
      // pernah lahir di (0,0) dan terlihat seperti bug.
      const origin = caster ?? {
        position: { x: casterSide === 'a' ? ARENA_MIN : ARENA_MAX, y: (ARENA_MIN + ARENA_MAX) / 2 },
      }

      const rule =
        action.ruleId === null ? undefined : deps.config.triggers.find((r) => r.id === action.ruleId)

      enqueueUltimate(deps.state, {
        gifterKey: actor === null ? 'anonymous' : fighterKey(actor),
        casterSlot: caster?.slotIndex ?? NO_SLOT,
        side: casterSide,
        targetSide: target,
        // Config tetap otoritas runtime: jenis dibaca lewat ruleId tiap kali aksi diterapkan,
        // jadi creator yang menggantinya di tengah sesi langsung berlaku di gift berikutnya.
        nukeType: rule?.then.nukeType ?? deps.config.gameplay.nuke.type,
        // Milik rule, bukan satu angka global: dua trigger ultimate boleh berbeda kerasnya.
        // `validateRule` sudah menjepitnya ke rentang yang sama, jadi fallback ini hanya
        // melayani aksi nuke tanpa rule — legend yang diklik creator.
        damage: rule?.then.value ?? deps.config.gameplay.nuke.damage,
        giftCoins: action.giftCoins,
        queuedAtTick: deps.state.tick,
        originX: origin.position.x,
        originY: origin.position.y,
      })

      // Bonus "sekaligus tambah HP": jumlah TETAP milik rule ini, tidak dikalikan koin dan
      // tidak membaca gameplay.hpGainedPerGrow yang melayani jalur like. Yang memilah gift
      // mahal dari gift murah adalah minCount dan daftar nama gift di rule yang sama, jadi
      // aritmetika di sini hanya akan menduakan syarat yang sudah ada di atasnya.
      if (caster !== undefined) {
        const gained = raiseMaxHp(caster, rule?.then.growWithNuke ?? 0)
        if (gained > 0) {
          spawnGameEffect(deps.state.effects, deps.config, {
            type: 'heal',
            x: caster.position.x,
            y: caster.position.y,
            value: gained,
          })
        }
      }

      // Terbit SAAT TEMBAK dan tanpa syarat: gift history harus muncul seketika, dan
      // pemilihan korban bukan lagi syarat pengakuan (spec §8). SATU untuk seluruh aksi:
      // yang kedua akan membuat gift ini muncul dua kali di history dan koinnya dihitung
      // dua kali oleh ledger.
      deps.emit({ type: 'actionApplied', action })
      return
    }

    // Aksi presentasi belum punya konsumen; ketiganya menyusul bersama Soundboard di Fase 3.
    case 'spawnEffect':
    case 'playSound':
    case 'cameraShake':
      return discard('deferredToPhase2')
  }
}

/**
 * Menguras seluruh action yang ada saat ini (Req 30 AC3).
 *
 * Dipanggil sebagai bagian fase Combat saat bertempur, dan langsung oleh engine di state
 * lain supaya join di lobi tetap berlaku meski tick belum jalan (keputusan D5).
 */
export function drainActions(deps: CombatDeps): number {
  return deps.queue.drain((action) => applyAction(action, deps))
}

/** Fighter yang ditandai AI siap menyerang benar-benar menembak di sini. */
export function resolveAttacks(deps: CombatDeps): number {
  let fired = 0

  deps.state.fighters.forEach((fighter) => {
    if (!fighter.alive || fighter.aiState !== 'attack') return

    const target = fighter.targetKey === null ? undefined : deps.state.fighters.get(fighter.targetKey)
    if (target === undefined || !target.alive) {
      fighter.targetKey = null
      fighter.aiState = 'acquireTarget'
      return
    }

    // Jarak tidak lagi menggerbang serangan (Req 9 AC1) — hanya kematian target yang
    // membatalkannya, sudah diperiksa di atas.
    fireProjectile(deps.state.projectiles, fighter, target)
    fighter.lastAttackAtMs = deps.nowMs
    fighter.aiState = 'cooldown'
    fired++
  })

  return fired
}

const fighterBySlot = (deps: CombatDeps, slot: number): Fighter | undefined =>
  deps.state.fighters.list().find((f) => f.slotIndex === slot)

/** Musuh hidup terdekat ke sebuah titik yang belum ada di `taken`. */
function nearestLiving(
  deps: CombatDeps,
  side: SideId,
  x: number,
  y: number,
  taken: ReadonlySet<number>,
): Fighter | undefined {
  let best: Fighter | undefined
  let bestDistance = Infinity

  for (const f of deps.state.fighters.list()) {
    if (f.side !== side || !f.alive || taken.has(f.slotIndex)) continue
    const distance = (f.position.x - x) ** 2 + (f.position.y - y) ** 2
    if (distance < bestDistance) {
      best = f
      bestDistance = distance
    }
  }
  return best
}

/** Tipe nuke yang mengunci satu sasaran saat tembak lalu meluas ke area saat mendarat. */
const BLAST_TYPES = new Set(['bomb', 'lightning', 'singularity', 'chainFreeze'])

/**
 * Menambahkan musuh hidup dalam radius ke daftar sasaran — untuk bomb, lightning, dan
 * dua varian jalur FX yang punya sifat sama (singularity menarik semua orang dalam radius,
 * chainFreeze merambat ke banyak korban).
 *
 * MENAMBAH, tidak pernah mengganti. Entri ke-0 adalah satu-satunya yang punya lintasan, dan
 * menggesernya membuat bom berpindah tempat di frame pendaratan alih-alih meledak di tempat
 * ia dilempar. Inilah yang membuat "area damage" terbaca: renderer menggambar arc sekunder ke
 * setiap slot di daftar ini.
 */
function expandToBlast(u: ActiveUltimate, deps: CombatDeps): void {
  if (!BLAST_TYPES.has(u.nukeType)) return

  const anchor = fighterBySlot(deps, u.targetSlots[0] ?? NO_SLOT)
  if (anchor === undefined) return

  const tier = deps.config.gameplay.nuke.tiers[u.tier]
  const radius = deps.config.gameplay.nuke.blastRadiusPct * (tier?.radiusMultiplier ?? 1)
  const taken = new Set(u.targetSlots)

  const extra = deps.state.fighters
    .list()
    .filter(
      (f) =>
        f.side === u.targetSide &&
        f.alive &&
        !taken.has(f.slotIndex) &&
        (f.position.x - anchor.position.x) ** 2 + (f.position.y - anchor.position.y) ** 2 <=
          radius ** 2,
    )
    .sort((a, b) => a.slotIndex - b.slotIndex)

  for (const f of extra) {
    if (u.targetSlots.length >= ULTIMATE_MAX_TARGETS) break
    u.targetSlots.push(f.slotIndex)
  }
}

/**
 * Menerapkan damage sasaran-sasaran yang GILIRANNYA SUDAH TIBA pada tick ini.
 *
 * Kandidat dikunci saat tembak (`ultimate-targets.ts`) supaya rudal punya sesuatu untuk
 * dikejar, lalu DIVALIDASI ULANG di sini: sasaran yang keburu mati mengalihkan damage-nya ke
 * musuh hidup terdekat, dan kalau tidak ada pengganti damage-nya hangus. Tidak ada damage
 * anumerta.
 *
 * Pengalihan itu hidup di `u.hitSlots` dan TIDAK PERNAH menyentuh `u.targetSlots`. Daftar itu
 * yang dibaca renderer untuk menggambar lintasan; menggesernya membuat rudal berpindah tempat
 * dalam satu frame alih-alih berbelok.
 */
function landUltimate(u: ActiveUltimate, deps: CombatDeps): void {
  if (!u.landed) {
    u.landed = true
    expandToBlast(u, deps)
    const center = sideHalfCenter(u.targetSide)
    // Satu ledakan di pusat zona, bukan satu per rudal: efek inilah yang memberi makan
    // shakeOffset, dan delapan explosion berurutan akan mengguncang layar tanpa henti
    // sepanjang salvo.
    spawnGameEffect(deps.state.effects, deps.config, { type: 'explosion', x: center.x, y: center.y })
    // Di gerbang yang sama dengan efeknya: keduanya "sekali per ultimate" dan keduanya harus
    // jatuh di tick yang sama, kalau tidak bunyinya terdengar meleset dari ledakannya.
    deps.emit({ type: 'ultimateImpact', nukeType: u.nukeType })
  }

  const hit = new Set(u.hitSlots)

  while (u.landedCount < u.targetSlots.length) {
    if (deps.state.tick < u.landsAtTick + u.landedCount * u.landStaggerTicks) return

    const slot = u.targetSlots[u.landedCount] as number
    u.landedCount++

    const aimed = fighterBySlot(deps, slot)
    const victim =
      aimed !== undefined && aimed.alive && !hit.has(aimed.slotIndex)
        ? aimed
        : nearestLiving(deps, u.targetSide, aimed?.position.x ?? 0, aimed?.position.y ?? 0, hit)
    if (victim === undefined) continue

    hit.add(victim.slotIndex)
    u.hitSlots.push(victim.slotIndex)

    const before = victim.hp
    applyDamage(victim, u.damage, null, deps)
    u.totalDamage += before - victim.hp
    if (!victim.alive) u.killCount++
  }

  /*
   * Terbit SEKALI, saat seluruh sasaran sudah lewat gilirannya — jadi angkanya sudah final.
   *
   * Tidak butuh flag sendiri: baris ini hanya tercapai kalau `while` di atas selesai tanpa
   * `return`, dan `resolveUltimates` berhenti memanggil fungsi ini begitu daftarnya habis.
   * Sisi lawan yang kosong melewatinya langsung — dan itu memang harus tetap terbit, karena
   * aturan keras spec §1 berlaku penuh untuk gift yang tidak menemukan siapa pun.
   */
  deps.emit({
    type: 'ultimateLanded',
    id: u.id,
    gifterKey: u.gifterKey,
    killCount: u.killCount,
    totalDamage: u.totalDamage,
  })
}

/**
 * Awal fase Combat, SEBELUM drainActions.
 *
 * Urutannya mengikat: ultimate yang dilepas pada tick ini tidak boleh dievaluasi
 * pendaratannya di tick yang sama, atau firedAtTick kehilangan artinya. Karena itu
 * pendaratan diperiksa DI SINI dan pelepasan antrean menyusul setelah drainActions.
 */
export function resolveUltimates(deps: CombatDeps): void {
  const tick = deps.state.tick

  for (const u of deps.state.activeUltimates) {
    if (u.stale) continue
    // Sasaran mendarat berjenjang, jadi syaratnya bukan lagi "belum pernah mendarat":
    // landUltimate dipanggil ulang tiap tick sampai giliran sasaran terakhir lewat.
    if (tick >= u.landsAtTick && (!u.landed || u.landedCount < u.targetSlots.length)) {
      landUltimate(u, deps)
    }
    if (ultimateProgress(u, tick) >= 1) holdForCallout(u, deps.config, tick)
  }
}

/**
 * Akhir fase Combat, SETELAH drainActions — dan itu bukan detail selera.
 *
 * Melepas sebelum drain berarti setiap ultimate menunggu satu tick antara diantre dan
 * dilepas. Dilepas di sini, gift yang datang sendirian melesat pada tick yang sama dengan
 * saat ia dibayar — jeda 50 ms memang tidak terlihat, tapi "diantre lalu dilepas" dan
 * "melesat seketika" adalah dua keadaan berbeda yang tidak boleh tertukar di test mana pun.
 */
export function releaseQueuedUltimates(deps: CombatDeps): void {
  for (const u of releaseUltimates(deps.state, deps.config, deps.state.tick)) {
    deps.emit({ type: 'ultimateFired', nukeType: u.nukeType })
  }
}

/**
 * Fase Effects: glow charge menempel pada caster yang masih berjalan, lalu pangkal sinar
 * diam begitu melesat.
 *
 * Di Effects, bukan Combat, karena posisi caster baru final setelah Physics dan setelah
 * kematian diproses. Renderer karena itu tidak perlu tahu apa-apa soal slot — ia cukup
 * membaca origin tiap frame.
 */
export function freezeUltimateOrigins(deps: CombatDeps): void {
  const tick = deps.state.tick

  for (const u of deps.state.activeUltimates) {
    if (u.stale || ultimateProgress(u, tick) >= CHARGE_END) continue

    const caster = deps.state.fighters.get(u.gifterKey)
    if (caster === undefined || !caster.alive) continue
    // Slot yang sudah dipakai ulang orang lain: lepaskan identitasnya, jangan pajang nama
    // yang salah. Lapis lantai (gift history) tetap menyebut nama yang benar.
    if (caster.slotIndex !== u.casterSlot) {
      u.casterSlot = NO_SLOT
      continue
    }

    u.originX = caster.position.x
    u.originY = caster.position.y
  }
}

export function combatPhase(deps: CombatDeps): void {
  resolveUltimates(deps)
  drainActions(deps)
  releaseQueuedUltimates(deps)
  // Sekali per tick, bukan sekali per peluru — lihat `attacksFired` di events.ts.
  if (resolveAttacks(deps) > 0) deps.emit({ type: 'attacksFired' })
}
