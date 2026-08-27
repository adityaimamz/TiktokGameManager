import type { SnapshotView } from '@lga/shared'
import { createBattleAction, sideTarget } from '../../../games/battle-arena/actions.js'
import type { BattleAction } from '../../../games/battle-arena/actions.js'
import type { BattleArenaConfig } from '../../../games/battle-arena/config/index.js'
import type { RosterEntry } from '../../../games/battle-arena/snapshot.js'
import { creatorActor } from '../../../games/battle-arena/triggers.js'
import type { ActorIdentity, SideId } from '../../../games/battle-arena/types.js'

export type TestActionId =
  | 'spawnA'
  | 'spawnB'
  | 'growA'
  | 'growB'
  | 'barrageA'
  | 'barrageB'
  | 'fillArena'
  /** Tidak muncul di TEST_ACTIONS: tombolnya adalah empat tombol ultimate, bukan grid uji. */
  | 'nukeA'
  | 'nukeB'

export interface TestActionButton {
  id: TestActionId
  label: string
  /** Sisi yang diwarnai swatch di tombol; null untuk tombol yang mengenai keduanya. */
  side: SideId | null
}

export const TEST_ACTIONS: readonly TestActionButton[] = [
  { id: 'spawnA', label: 'Tambah fighter', side: 'a' },
  { id: 'spawnB', label: 'Tambah fighter', side: 'b' },
  { id: 'growA', label: 'Tambah HP', side: 'a' },
  { id: 'growB', label: 'Tambah HP', side: 'b' },
  { id: 'barrageA', label: 'Serangan ×5', side: 'a' },
  { id: 'barrageB', label: 'Serangan ×5', side: 'b' },
  { id: 'fillArena', label: 'Isi arena — 10 tiap sisi', side: null },
]

/** Barrage di Fase 1 adalah damage berulang ke satu sisi; pengikatan ke gift menyusul Fase 2. */
const BARRAGE_MULTIPLIER = 5
const FILL_PER_SIDE = 10

/** Identitas baru tiap klik: join kedua dengan kunci yang sama ditolak `alreadyOnSide`. */
const spawn = (side: SideId, seq: number, index: number): BattleAction =>
  createBattleAction({
    type: 'spawn',
    target: sideTarget(side),
    actor: creatorActor(`uji-${side}-${seq}-${index}`),
  })

const repeat = (count: number, make: (index: number) => BattleAction): BattleAction[] =>
  Array.from({ length: count }, (_, index) => make(index))

/**
 * Fighter acak yang "mengirim" ultimate uji.
 *
 * Ultimate lahir dari posisi caster-nya. Aksi uji memakai identitas creator, yang tidak
 * punya fighter, jadi `combat.ts` jatuh ke tepi luar arena — benar untuk gift dari orang
 * yang memang tidak ada di arena, tapi bukan yang dilihat creator saat menguji: berkasnya
 * melesat dari pinggir layar, bukan dari blob.
 *
 * Yang HIDUP saja, dan dari sisi penyerang: fighter mati sudah tidak digambar, dan berkas
 * yang keluar dari titik kosong sama menyesatkannya dengan berkas dari tepi arena.
 *
 * `pick` masuk sebagai argumen supaya test bisa menentukan pilihannya.
 */
export function randomCaster(
  targetSide: SideId,
  view: SnapshotView,
  roster: ReadonlyMap<number, RosterEntry>,
  pick: () => number = Math.random,
): ActorIdentity | null {
  const candidates: RosterEntry[] = []

  // PERINGATAN dari shared/snapshot.ts: array fighters boleh lebih panjang dari yang
  // berlaku. Selalu berhenti di fighterCount.
  for (let i = 0; i < view.header.fighterCount; i++) {
    const fighter = view.fighters[i]
    if (fighter === undefined || fighter.alive === 0) continue
    const entry = roster.get(fighter.slotIndex)
    if (entry === undefined || entry.side === targetSide) continue
    candidates.push(entry)
  }

  // Arena kosong di sisi penyerang: kembalikan null, dan pemanggil jatuh ke identitas
  // creator seperti sebelumnya. Ultimate dari tepi lebih baik daripada tidak ada ultimate.
  const chosen = candidates[Math.floor(pick() * candidates.length)]
  if (chosen === undefined) return null
  return { platform: chosen.platform, username: chosen.username, avatarUrl: chosen.avatarUrl }
}

export function testActionBatch(
  id: TestActionId,
  config: BattleArenaConfig,
  seq: number,
  /** Pengirim ultimate uji; null berarti creator, yang tidak punya fighter di arena. */
  caster: ActorIdentity | null = null,
): BattleAction[] {
  const grow = (side: SideId): BattleAction[] => [
    createBattleAction({
      type: 'grow',
      target: sideTarget(side),
      value: config.gameplay.hpGainedPerGrow,
      actor: creatorActor(),
    }),
  ]
  const barrage = (side: SideId): BattleAction[] =>
    repeat(BARRAGE_MULTIPLIER, () =>
      createBattleAction({
        type: 'damage',
        target: sideTarget(side),
        value: config.gameplay.baseDamage,
        actor: creatorActor(),
      }),
    )

  switch (id) {
    case 'spawnA':
      return [spawn('a', seq, 0)]
    case 'spawnB':
      return [spawn('b', seq, 0)]
    case 'growA':
      return grow('a')
    case 'growB':
      return grow('b')
    case 'barrageA':
      return barrage('a')
    case 'barrageB':
      return barrage('b')
    case 'nukeA':
    case 'nukeB':
      // Damage dan jenisnya milik config; action hanya menyebut sisinya.
      return [
        createBattleAction({
          type: 'nuke',
          target: sideTarget(id === 'nukeA' ? 'a' : 'b'),
          actor: caster ?? creatorActor(),
        }),
      ]
    case 'fillArena':
      return [
        ...repeat(FILL_PER_SIDE, (index) => spawn('a', seq, index)),
        ...repeat(FILL_PER_SIDE, (index) => spawn('b', seq, FILL_PER_SIDE + index)),
      ]
  }
}
