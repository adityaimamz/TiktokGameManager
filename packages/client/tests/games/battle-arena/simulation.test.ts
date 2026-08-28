import { beforeEach, describe, expect, it } from 'vitest'
import { CHARGE_END } from '@lga/shared'
import { ActionQueue } from '../../../src/framework/actions/queue.js'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { createBattleAction, sideTarget } from '../../../src/games/battle-arena/actions.js'
import type { BattleAction } from '../../../src/games/battle-arena/actions.js'
import { ARENA_MIDLINE, FIGHTER_EDGE_MARGIN, PROJECTILE_LIFETIME_MS, TICK_MS } from '../../../src/games/battle-arena/arena.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { EngineEvent } from '../../../src/games/battle-arena/events.js'
import { fireProjectile } from '../../../src/games/battle-arena/projectiles.js'
import { TICK_PHASES, cleanupPhase, effectsPhase, physicsPhase, runTick } from '../../../src/games/battle-arena/simulation.js'
import { spawnGameEffect } from '../../../src/games/battle-arena/effects.js'
import { createBattleArenaState } from '../../../src/games/battle-arena/state.js'
import type { Fighter, SideId } from '../../../src/games/battle-arena/types.js'
import { NUKE_TYPE_DURATION_SCALE, ultimateProgress } from '../../../src/games/battle-arena/ultimate.js'

const setup = () => {
  const clock = createManualClock(0)
  const state = createBattleArenaState({ rng: createRng(3), clock })
  const config = defaultConfig()
  const events: EngineEvent[] = []
  const deps = {
    state,
    config,
    queue: new ActionQueue<BattleAction>(),
    rng: createRng(11),
    nowMs: 0,
    emit: (e: EngineEvent) => events.push(e),
  }
  const add = (username: string, side: SideId, x: number, y: number): Fighter => {
    const f = state.fighters.join({ platform: 'tiktok', username, avatarUrl: null }, side, config.gameplay).fighter
    if (f === null) throw new Error('expected a fighter')
    f.position.x = x
    f.position.y = y
    return f
  }
  return { clock, state, config, events, deps, add }
}

describe('TICK_PHASES', () => {
  it('locks the phase order Req 24 AC3 requires', () => {
    expect(TICK_PHASES).toEqual(['physics', 'ai', 'combat', 'projectiles', 'effects', 'cleanup'])
  })
})

describe('physicsPhase', () => {
  beforeEach(() => resetEntityIds())

  it('moves a fighter by its velocity', () => {
    const { deps, add } = setup()
    const f = add('a1', 'a', 20, 50)
    f.velocity.x = 2
    f.velocity.y = -1
    physicsPhase(deps)
    expect(f.position.x).toBe(22)
    expect(f.position.y).toBe(49)
  })

  /**
   * Fighter TIDAK PERNAH menyeberang, apa pun keadaannya (Req 7 AC3).
   *
   * Hanya projectile yang masuk wilayah lawan. Sebelumnya fighter yang mengejar
   * dibiarkan menyeberang; itu salah membaca screenshot referensi, dan req.md sudah
   * dikoreksi. Jarak serang 10% masih melampaui garis, jadi pertarungan tetap terjadi
   * — keduanya berhenti berdekatan di sisinya masing-masing lalu saling menembak.
   */
  it('keeps an attacking fighter on its own side of the midline', () => {
    const { deps, add } = setup()
    const f = add('a1', 'a', ARENA_MIDLINE - 1, 50)
    f.aiState = 'attack'
    f.velocity.x = 5
    physicsPhase(deps)
    expect(f.position.x).toBe(ARENA_MIDLINE - FIGHTER_EDGE_MARGIN)
  })

  it('keeps an attacking fighter on side b out of side a', () => {
    const { deps, add } = setup()
    const f = add('b1', 'b', ARENA_MIDLINE + 1, 50)
    f.aiState = 'attack'
    f.velocity.x = -5
    physicsPhase(deps)
    expect(f.position.x).toBe(ARENA_MIDLINE + FIGHTER_EDGE_MARGIN)
  })

  it('keeps an idle fighter inside its own half', () => {
    const { deps, add } = setup()
    const f = add('a1', 'a', ARENA_MIDLINE - 1, 50)
    f.aiState = 'idle'
    f.velocity.x = 20
    physicsPhase(deps)
    expect(f.position.x).toBe(ARENA_MIDLINE - FIGHTER_EDGE_MARGIN)
  })

  it('leaves a dead fighter where it fell', () => {
    const { deps, add } = setup()
    const f = add('a1', 'a', 20, 50)
    f.alive = false
    f.velocity.x = 5
    physicsPhase(deps)
    expect(f.position.x).toBe(20)
  })

  it('moves projectiles and burns down their lifetime', () => {
    const { deps, state, add } = setup()
    const p = fireProjectile(state.projectiles, add('a1', 'a', 20, 50), add('b1', 'b', 60, 50))
    physicsPhase(deps)
    expect(p.position.x).toBeGreaterThan(20)
    expect(p.lifetime).toBe(PROJECTILE_LIFETIME_MS - TICK_MS)
  })

  it('homes a projectile onto a target that moved after the shot left', () => {
    const { deps, state, add } = setup()
    const attacker = add('a1', 'a', 20, 50)
    const target = add('b1', 'b', 60, 50)
    const p = fireProjectile(state.projectiles, attacker, target)
    target.position.y = 90

    physicsPhase(deps)

    // Mengarah ke posisi target SEKARANG, bukan ke tempatnya saat tembakan lepas.
    expect(p.position.y).toBeGreaterThan(50)
  })
})

describe('effectsPhase', () => {
  it('retires effects whose lifetime has elapsed', () => {
    const { clock, deps, state, config } = setup()
    spawnGameEffect(state.effects, config, { type: 'hit', x: 1, y: 1 })
    expect(effectsPhase(deps)).toBe(0)
    clock.advance(10_000)
    expect(effectsPhase(deps)).toBe(1)
    expect(state.effects.activeCount).toBe(0)
  })
})

describe('cleanupPhase', () => {
  beforeEach(() => resetEntityIds())

  it('drops expired projectiles', () => {
    const { deps, state, add } = setup()
    const p = fireProjectile(state.projectiles, add('a1', 'a', 20, 50), add('b1', 'b', 60, 50))
    p.lifetime = 0
    expect(cleanupPhase(deps)).toBe(1)
    expect(state.projectiles.activeCount).toBe(0)
  })

  it('declares a round winner once a side reaches the kill target', () => {
    const { deps, state, config } = setup()
    config.gameplay.killsToWinRound = 3
    state.roundScore.b = 3
    cleanupPhase(deps)
    expect(state.roundWinner).toBe('b')
  })

  it('leaves an already decided round alone', () => {
    const { deps, state, config } = setup()
    config.gameplay.killsToWinRound = 1
    state.roundWinner = 'a'
    state.roundScore.b = 5
    cleanupPhase(deps)
    expect(state.roundWinner).toBe('a')
  })
})

/*
 * Target kill adalah SATU-SATUNYA kondisi menang (keputusan creator). Sisi yang habis tidak
 * lagi menyerahkan ronde kepada lawannya; ronde menunggu sampai ada yang mengetik ulang
 * keyword-nya atau creator menekan Restart.
 */
describe('cleanupPhase — sisi yang habis TIDAK mengakhiri ronde', () => {
  beforeEach(() => resetEntityIds())

  it('tidak memberi kemenangan kepada yang tersisa selama target kill belum tercapai', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.killsToWinRound = 99
    add('a1', 'a', 20, 50)
    const doomed = add('b1', 'b', 75, 50)
    doomed.alive = false
    state.roundScore.a = 1

    cleanupPhase(deps)
    expect(state.roundWinner).toBeNull()
  })

  it('berlaku sama saat kedua sisi habis di tick yang sama', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.killsToWinRound = 99
    const a1 = add('a1', 'a', 20, 50)
    const b1 = add('b1', 'b', 75, 50)
    a1.alive = false
    b1.alive = false
    state.roundScore.a = 2
    state.roundScore.b = 1

    cleanupPhase(deps)
    expect(state.roundWinner).toBeNull()
  })

  it('tetap memutuskan begitu target kill tercapai, walau lawannya sudah habis', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.killsToWinRound = 3
    add('a1', 'a', 20, 50)
    const doomed = add('b1', 'b', 75, 50)
    doomed.alive = false
    state.roundScore.a = 3

    cleanupPhase(deps)
    expect(state.roundWinner).toBe('a')
  })

  it('mengabaikan arena yang memang belum berisi siapa-siapa', () => {
    const { deps, state, config } = setup()
    config.gameplay.killsToWinRound = 99
    cleanupPhase(deps)
    expect(state.roundWinner).toBeNull()
  })
})

describe('runTick', () => {
  beforeEach(() => resetEntityIds())

  it('counts the tick', () => {
    const { deps, state } = setup()
    runTick(deps)
    runTick(deps)
    expect(state.tick).toBe(2)
  })

  it('moves with last tick velocity before the AI picks a new one', () => {
    const { deps, add } = setup()
    const f = add('a1', 'a', 20, 50)
    f.aiState = 'idle'
    f.velocity.x = 1
    f.velocity.y = 0
    runTick(deps)
    // Physics berjalan lebih dulu, jadi perpindahan tick ini memakai velocity lama.
    expect(f.position.x).toBe(21)
  })

  it('still applies damage from a projectile on the last tick of its life', () => {
    const { deps, state, add } = setup()
    const attacker = add('a1', 'a', 20, 50)
    const target = add('b1', 'b', 60, 50)
    // Jarak tidak lagi menggerbang serangan (Req 9 AC1): dua fighter hidup dan saling
    // musuh akan langsung menembak balik pada tick pertama. Ditahan di cooldown supaya
    // test ini hanya menguji urutan fase pada SATU projectile yang disisipkan tangan,
    // bukan ikut menghitung tembakan balasan yang otomatis terjadi.
    attacker.aiState = 'cooldown'
    attacker.lastAttackAtMs = deps.nowMs
    target.aiState = 'cooldown'
    target.lastAttackAtMs = deps.nowMs

    const p = fireProjectile(state.projectiles, attacker, target)
    p.position.x = 60
    p.position.y = 50
    p.velocity.x = 0
    p.velocity.y = 0
    p.lifetime = TICK_MS

    runTick(deps)

    expect(target.hp).toBe(200 - attacker.damage)
    expect(state.projectiles.activeCount).toBe(0)
  })

  it('runs a whole exchange: acquire, attack, fly, hit', () => {
    const { deps, config, state, add } = setup()
    // Wander lepas dari status tempur sekarang (Req 8 AC1); dimatikan di sini supaya
    // posisi kedua fighter tetap diam dan lintasan projectile yang sudah dikunci saat
    // tembak benar-benar mengenai — pipeline-nya yang diuji, bukan mekanik wander.
    config.gameplay.idleMovement = false
    const attacker = add('a1', 'a', 45, 50)
    const target = add('b1', 'b', 52, 50)

    // Fase tembak perdana sengaja diacak per fighter (`staggerFirstShot`); di sini keduanya
    // dipaksa siap, supaya yang diuji tetap pipeline-nya dan bukan sebaran fasenya.
    attacker.aiState = 'acquireTarget'
    target.aiState = 'acquireTarget'

    // Satu tick sudah cukup untuk menembak: AI menandai 'attack' dan fase Combat yang
    // menyusul di tick yang sama langsung melepas projectile-nya. Jarak tidak lagi
    // menggerbang kesiapan, jadi keduanya langsung menembak begitu saling mengenali.
    runTick(deps)
    expect(attacker.aiState).toBe('cooldown')
    expect(target.aiState).toBe('cooldown')
    expect(attacker.lastAttackAtMs).toBe(deps.nowMs)
    expect(state.projectiles.activeCount).toBe(2)

    for (let i = 0; i < 20 && target.hp === 200; i++) runTick(deps)
    expect(target.hp).toBeLessThan(200)
  })

  /**
   * Tembakan saling menyusul, bukan satu salvo serentak.
   *
   * Semua fighter memakai `attackIntervalMs` yang sama, jadi kalau fase awalnya sama pula
   * mereka menembak berbarengan SELAMANYA — arena berkedip tiap satu interval lalu sunyi.
   * Dikunci sebagai relasi: tidak pernah semua menembak dalam satu tick, dan tembakan
   * tersebar ke banyak tick di dalam satu interval.
   */
  it('menyebar tembakan perdana ke sepanjang satu interval serangan', () => {
    const { deps, config, state, add } = setup()
    config.gameplay.idleMovement = false
    for (let i = 0; i < 6; i++) {
      add(`a${i}`, 'a', 20, 15 + i * 12)
      add(`b${i}`, 'b', 70, 15 + i * 12)
    }
    const total = state.fighters.list().length

    let busiest = 0
    let ticksThatFired = 0
    const ticksPerInterval = (config.gameplay.attackIntervalSec * 1000) / TICK_MS

    for (let t = 0; t < ticksPerInterval; t++) {
      deps.nowMs += TICK_MS
      runTick(deps)
      const fired = state.fighters.list().filter((f) => f.lastAttackAtMs === deps.nowMs).length
      if (fired > 0) ticksThatFired++
      busiest = Math.max(busiest, fired)
    }

    // Sebaran RATA, bukan sekadar "tidak semuanya": deret rasio emas menjamin tiap tick
    // kebagian paling banyak satu-dua penembak selama jumlah fighter belum melebihi jumlah
    // tick dalam satu interval — termasuk antar-sesama anggota satu tim.
    expect(busiest).toBeLessThanOrEqual(Math.ceil(total / ticksPerInterval) + 1)
    expect(ticksThatFired).toBeGreaterThanOrEqual(total - 2)
  })
})

describe('pendaratan ultimate (Plan 6a)', () => {
  /**
   * Harness yang mengukur ULTIMATE saja.
   *
   * Wander dimatikan supaya origin bisa dibandingkan dengan koordinat yang ditulis test,
   * dan tiap fighter dibuat sudah pernah menyerang supaya tidak ada projectile biasa yang
   * ikut menurunkan HP di antara tembak dan pendaratan.
   */
  const ultimateSetup = () => {
    const harness = setup()
    harness.config.gameplay.idleMovement = false
    const add = (username: string, side: SideId, x: number, y: number): Fighter => {
      const f = harness.add(username, side, x, y)
      // Dikunci di cooldown dengan jam yang tidak bergerak: satu tembakan pembuka pun
      // tidak pernah lepas, jadi HP yang turun hanya milik ultimate.
      f.aiState = 'cooldown'
      f.lastAttackAtMs = harness.deps.nowMs
      return f
    }
    const fire = (username: string, target: SideId): void => {
      harness.deps.queue.enqueue(
        createBattleAction({
          type: 'nuke',
          target: sideTarget(target),
          value: harness.config.gameplay.nuke.damage,
          actor: { platform: 'tiktok', username, avatarUrl: null },
          giftName: 'Lion',
          giftCoins: 10,
        }),
      )
    }
    return { ...harness, add, fire }
  }

  /**
   * Bunyi ultimate menggantung di event ini, jadi variannya harus IKUT — bukan diturunkan
   * ulang oleh pendengar dari `action.ruleId`.
   */
  it('menerbitkan ultimateFired sekali saat melesat, lengkap dengan variannya', () => {
    const { deps, events, config, add, fire } = ultimateSetup()
    config.gameplay.nuke.type = 'chainFreeze'
    add('andi', 'a', 25, 50)
    add('cici', 'b', 75, 50)
    fire('andi', 'b')

    runTick(deps)
    const fired = events.filter((e) => e.type === 'ultimateFired')
    expect(fired).toEqual([{ type: 'ultimateFired', nukeType: 'chainFreeze' }])

    // Tick-tick berikutnya tidak boleh membunyikannya lagi: ia lepas landas sekali.
    for (let i = 0; i < 5; i++) runTick(deps)
    expect(events.filter((e) => e.type === 'ultimateFired')).toHaveLength(1)
  })

  /**
   * Momen impact, BUKAN momen `ultimateLanded`.
   *
   * `ultimateLanded` menunggu sasaran terakhir supaya `killCount`/`totalDamage` final. Bunyi
   * ledakan tidak boleh menunggu selama itu — ia harus jatuh di tick yang sama dengan efek
   * `explosion`, yaitu pendaratan PERTAMA.
   */
  it('menerbitkan ultimateImpact tepat di tick pendaratan pertama', () => {
    const { deps, state, events, config, add, fire } = ultimateSetup()
    config.gameplay.nuke.type = 'bomb'
    add('andi', 'a', 25, 50)
    add('cici', 'b', 75, 50)
    fire('andi', 'b')

    runTick(deps)
    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')

    while (state.tick < u.landsAtTick) {
      expect(events.filter((e) => e.type === 'ultimateImpact')).toHaveLength(0)
      runTick(deps)
    }
    runTick(deps)

    expect(events.filter((e) => e.type === 'ultimateImpact')).toEqual([
      { type: 'ultimateImpact', nukeType: 'bomb' },
    ])
  })

  /**
   * Satu ledakan di telinga, seberapa pun panjang salvonya — aturan yang sama dengan efek
   * `explosion`, yang juga di-spawn sekali di pusat zona alih-alih sekali per hulu ledak.
   */
  it('menerbitkan ultimateImpact sekali saja untuk salvo yang berjenjang', () => {
    const { deps, state, events, config, add, fire } = ultimateSetup()
    config.gameplay.nuke.type = 'missileRain'
    add('andi', 'a', 25, 50)
    for (let i = 0; i < 5; i++) add(`musuh${i}`, 'b', 60 + i * 6, 30 + i * 8)
    fire('andi', 'b')

    runTick(deps)
    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    expect(u.targetSlots.length).toBeGreaterThan(1)

    // Sampai jauh melewati pendaratan sasaran TERAKHIR.
    const last = u.landsAtTick + u.targetSlots.length * Math.max(1, u.landStaggerTicks) + 5
    while (state.tick <= last) runTick(deps)

    expect(events.filter((e) => e.type === 'ultimateImpact')).toHaveLength(1)
  })

  it('HP korban baru turun pada tick pendaratan, tidak sebelumnya', () => {
    const { deps, state, add, fire } = ultimateSetup()
    add('andi', 'a', 25, 50)
    const enemy = add('cici', 'b', 75, 50)
    fire('andi', 'b')

    runTick(deps)
    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')

    while (state.tick < u.landsAtTick) {
      expect(enemy.hp).toBe(enemy.maxHp)
      runTick(deps)
    }
    runTick(deps)

    expect(enemy.hp).toBeLessThan(enemy.maxHp)
    expect(u.landed).toBe(true)
  })

  /*
   * Penjaga urutan fase: pelepasan antrean harus terjadi SETELAH drainActions. Dilepas
   * sebelum drain, tiap ultimate menunggu satu tick antara diantre dan dilepas, jadi tidak
   * ada satu pun gift yang benar-benar melesat pada tick pembayarannya. Test unit di
   * ultimate.test.ts tidak bisa menangkap itu karena ia memanggil releaseUltimates langsung.
   */
  it('gift melesat lewat urutan fase sungguhan, mulai dari progress nol', () => {
    const { deps, state, add, fire } = ultimateSetup()
    add('andi', 'a', 25, 50)
    add('cici', 'b', 75, 50)
    fire('andi', 'b')

    runTick(deps)

    expect(state.activeUltimates[0]?.firedAtTick).toBe(0)
  })

  it('mencatat killCount dan totalDamage lalu menerbitkan ultimateLanded', () => {
    const { deps, state, events, add, fire } = ultimateSetup()
    add('andi', 'a', 25, 50)
    const enemy = add('cici', 'b', 75, 50)
    enemy.hp = 10
    fire('andi', 'b')

    for (let i = 0; i <= 60; i++) runTick(deps)

    const landed = events.filter((e) => e.type === 'ultimateLanded')
    expect(landed).toHaveLength(1)
    expect(landed[0]).toMatchObject({ gifterKey: 'tiktok:andi', killCount: 1, totalDamage: 10 })
    expect(state.activeUltimates[0]?.killCount).toBe(1)
  })

  it('korban yang mati sebelum impact tidak kena damage anumerta', () => {
    const { deps, state, add, fire } = ultimateSetup()
    add('andi', 'a', 25, 50)
    const enemy = add('cici', 'b', 75, 50)
    fire('andi', 'b')

    runTick(deps)
    enemy.alive = false
    enemy.hp = 0

    for (let i = 0; i <= 60; i++) runTick(deps)

    expect(state.activeUltimates[0]?.totalDamage).toBe(0)
  })

  it('sisi sasaran kosong: damage hangus, record tetap berjalan sampai selesai', () => {
    const { deps, state, add, fire } = ultimateSetup()
    add('andi', 'a', 25, 50)
    fire('andi', 'b')

    // Cukup untuk melewati landsAfterTicks pada kurva 6c (34 tick di durasi 3094 = 2600 ×
    // NUKE_TYPE_DURATION_SCALE.missileRain), tapi masih di dalam totalTicks sehingga
    // record-nya belum kedaluwarsa.
    for (let i = 0; i <= 40; i++) runTick(deps)

    expect(state.activeUltimates).toHaveLength(1)
    expect(state.activeUltimates[0]?.landed).toBe(true)
    expect(state.activeUltimates[0]?.totalDamage).toBe(0)
  })

  it('origin mengikuti caster selama charge lalu membeku', () => {
    const { deps, state, add, fire } = ultimateSetup()
    const caster = add('andi', 'a', 20, 40)
    add('cici', 'b', 75, 50)
    fire('andi', 'b')

    runTick(deps)
    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    expect(u.originX).toBeCloseTo(caster.position.x, 5)

    caster.position.x = 30
    caster.position.y = 60
    runTick(deps)
    expect(u.originX).toBeCloseTo(30, 5)

    // Lewati fase charge, lalu geser caster lagi: origin tidak boleh ikut.
    while (ultimateProgress(u, state.tick) < CHARGE_END) runTick(deps)
    const frozen = { x: u.originX, y: u.originY }
    caster.position.x = 45
    runTick(deps)

    expect(u.originX).toBe(frozen.x)
    expect(u.originY).toBe(frozen.y)
  })

  it('caster yang mati di tengah charge mengunci origin di posisi terakhir', () => {
    const { deps, state, add, fire } = ultimateSetup()
    const caster = add('andi', 'a', 20, 40)
    add('cici', 'b', 75, 50)
    fire('andi', 'b')
    runTick(deps)

    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    const last = { x: u.originX, y: u.originY }
    caster.alive = false
    caster.position.x = 45
    runTick(deps)

    expect(u.originX).toBe(last.x)
    expect(u.originY).toBe(last.y)
  })

  it('record dibuang setelah tenggang callout terlewat, tidak sebelumnya', () => {
    const { deps, state, config, add, fire } = ultimateSetup()
    add('andi', 'a', 25, 50)
    add('cici', 'b', 75, 50)
    fire('andi', 'b')

    const holdTicks = Math.round(config.gameplay.nuke.calloutHoldMs / TICK_MS)
    // Diturunkan dari config, bukan angka tetap: tenggang callout baru mulai dihitung setelah
    // progress mencapai 1, dan kurva fase 6c menggeser di tick keberapa itu terjadi.
    // `NUKE_TYPE_DURATION_SCALE.missileRain` masuk karena config.gameplay.nuke.type bawaan
    // adalah missileRain, dan jalur FX melebarkan durasi efektifnya (lihat ultimate.ts).
    const totalTicks = Math.round(
      (config.gameplay.nuke.durationMs * NUKE_TYPE_DURATION_SCALE.missileRain) / TICK_MS,
    )
    for (let i = 0; i <= totalTicks; i++) runTick(deps)
    expect(state.activeUltimates).toHaveLength(1)
    expect(state.activeUltimates[0]?.expiresAtTick).not.toBeNull()

    for (let i = 0; i <= holdTicks; i++) runTick(deps)
    expect(state.activeUltimates).toHaveLength(0)
  })
})
