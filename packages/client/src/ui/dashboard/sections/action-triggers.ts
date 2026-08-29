import type { GiftCatalogEntry } from '@lga/shared'
import {
  GIFT_MIN_COUNT_RANGE,
  MAX_GIFT_NAMES,
  MAX_TRIGGER_RULES,
} from '../../../games/battle-arena/config/index.js'
import type {
  BattleArenaConfig,
  NukeType,
  SideConfig,
  TriggerRule,
} from '../../../games/battle-arena/config/index.js'
import type { BattleActionType, TargetKind } from '../../../games/battle-arena/actions.js'
import { matchesSide } from '../../../games/battle-arena/triggers.js'
import { normalizeChatText } from '../../../platform/chat/normalize-text.js'
import { ULTIMATES } from '../ultimate.js'

export interface TriggerCardView {
  id: string
  title: string
  /** Teks yang benar-benar dibaca penonton di rail. Terpisah dari `title`. */
  caption: string
  /** Warna batang kiri kartu. */
  accent: string
  enabled: boolean
  /** Apakah rule ini muncul di action legend. Saklar KEDUA, lepas dari `enabled`. */
  showOnScreen: boolean
  whenLabel: string
  whenIcon: string
  /** Keyword sisi untuk rule comment; null untuk yang lain. */
  keyword: string | null
  /** Peringatan kata rancu untuk rule comment; null saat tidak ada yang bertabrakan. */
  keywordWarning: string | null
  /** Ambang like untuk rule like; null untuk yang lain. */
  everyNLikes: number | null
  /** Nilai × untuk rule grow; null untuk yang lain, karena spawn mengabaikan value. */
  growValue: number | null
  /** Bentuk mentah, supaya editor bisa memilih kontrol yang tepat tanpa menebak. */
  when: TriggerRule['when']
  then: TriggerRule['then']
}

/** Rule yang tidak terikat sisi mana pun memakai warna netral. */
const NEUTRAL_ACCENT = '#8a90a6'

/** Satu baris per varian `when`, supaya varian baru tidak diam-diam diperlakukan sebagai like. */
const WHEN_CHIP: Record<TriggerRule['when']['kind'], { label: string; icon: string }> = {
  comment: { label: 'Comment', icon: 'comment' },
  like: { label: 'Like', icon: 'like' },
  gift: { label: 'Gift', icon: 'gift' },
  follow: { label: 'Follow', icon: 'follow' },
}

/**
 * Kata yang cocok dengan KEDUA sisi sekaligus.
 *
 * `resolveComment` membuang komentar yang menyebut dua sisi (Req 4 AC7), jadi kata semacam
 * ini tidak memasukkan siapa pun ke arena — dan ia melakukannya TANPA SUARA: penonton
 * mengetik, tidak terjadi apa-apa, dan tidak ada satu tempat pun di aplikasi ini yang
 * menyebutkan alasannya. Perangkap ini nyaris tidak bisa dihindari saat kedua sisi
 * dinamai orang: nama sisi A gampang tersangkut jadi keyword sisi B.
 *
 * Perbandingannya memakai `matchesSide` yang SAMA dengan yang dipakai engine, bukan
 * salinan aturannya — peringatan yang menghitung sendiri pasti menyimpang dari perilaku
 * sungguhan begitu salah satunya berubah.
 */
export function ambiguousSideWords(config: BattleArenaConfig): string[] {
  const wordsOf = (side: SideConfig): string[] =>
    [side.keyword, side.name, ...side.aliases]
      .map((candidate) => normalizeChatText(candidate))
      .filter((candidate) => candidate.length > 0)

  const all = new Set([...wordsOf(config.sides.a), ...wordsOf(config.sides.b)])
  return [...all].filter(
    (word) => matchesSide(word, config.sides.a) && matchesSide(word, config.sides.b),
  )
}

function warningFor(words: readonly string[]): string | null {
  if (words.length === 0) return null
  const quoted = words.map((word) => `"${word}"`).join(' dan ')
  return `${quoted} cocok dengan KEDUA sisi, jadi komentar berisi kata itu diabaikan dan tidak ada yang bergabung. Periksa nama dan keyword tiap sisi.`
}

function cardFor(rule: TriggerRule, config: BattleArenaConfig): TriggerCardView {
  const side = rule.when.kind === 'comment' ? config.sides[rule.when.matchSide] : null
  const chip = WHEN_CHIP[rule.when.kind]

  return {
    id: rule.id,
    title: rule.label,
    caption: rule.legend.caption,
    accent: side?.color ?? NEUTRAL_ACCENT,
    enabled: rule.enabled,
    showOnScreen: rule.legend.show,
    whenLabel: chip.label,
    whenIcon: chip.icon,
    keyword: side?.keyword ?? null,
    keywordWarning: side === null ? null : warningFor(ambiguousSideWords(config)),
    // D3: ambang dibaca dari config, bukan dari rule — rule menyimpan salinan yang ditulis
    // ulang validateConfig, jadi ia tidak boleh jadi sumber tampilan maupun tujuan tulisan.
    // Hanya rule LIKE yang menawarkannya: gift dan follow tidak punya ambang like sama sekali.
    everyNLikes: rule.when.kind === 'like' ? config.likes.threshold : null,
    growValue: rule.then.actionType === 'grow' ? config.gameplay.hpGainedPerGrow : null,
    when: rule.when,
    then: rule.then,
  }
}

export function triggerCards(config: BattleArenaConfig): TriggerCardView[] {
  return config.triggers.map((rule) => cardFor(rule, config))
}

export function withRuleEnabled(
  config: BattleArenaConfig,
  ruleId: string,
  enabled: boolean,
): BattleArenaConfig {
  return {
    ...config,
    triggers: config.triggers.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule)),
  }
}

/**
 * Menyembunyikan rule dari action legend TANPA mematikannya.
 *
 * Dua saklar, dua pertanyaan berbeda. `enabled` menjawab "apakah pemicunya menangkap",
 * `legend.show` menjawab "apakah penonton diberi tahu". Rail arena cuma setinggi 18% panggung
 * dan tidak muat memuat semua rule; sementara mematikan rule yang tidak muat berarti gift yang
 * penonton kirim lewat begitu saja. `buildActionLegend` sudah membaca keduanya sejak awal —
 * yang tidak ada hanyalah cara creator mengubahnya.
 */
export function withRuleLegendShown(
  config: BattleArenaConfig,
  ruleId: string,
  show: boolean,
): BattleArenaConfig {
  return {
    ...config,
    triggers: config.triggers.map((rule) =>
      rule.id === ruleId ? { ...rule, legend: { ...rule.legend, show } } : rule,
    ),
  }
}

/**
 * Judul kartu di panel creator.
 *
 * BUKAN teks yang dibaca penonton — itu `legend.caption`, dan keduanya sengaja terpisah:
 * creator butuh nama yang enak dicari di daftar panjang ("Join Side A"), penonton butuh
 * perintah yang bisa dijalankan ("GABUNG MESSI").
 */
export function withRuleLabel(
  config: BattleArenaConfig,
  ruleId: string,
  label: string,
): BattleArenaConfig {
  return {
    ...config,
    triggers: config.triggers.map((rule) => (rule.id === ruleId ? { ...rule, label } : rule)),
  }
}

/** Teks yang benar-benar tampil di rail action legend, dan di gift history. */
export function withLegendCaption(
  config: BattleArenaConfig,
  ruleId: string,
  caption: string,
): BattleArenaConfig {
  return {
    ...config,
    triggers: config.triggers.map((rule) =>
      rule.id === ruleId ? { ...rule, legend: { ...rule.legend, caption } } : rule,
    ),
  }
}

/** Menulis ke sisi yang dicocokkan rule, bukan ke rule. Rule tidak menyimpan keyword. */
export function withKeyword(
  config: BattleArenaConfig,
  ruleId: string,
  keyword: string,
): BattleArenaConfig {
  const rule = config.triggers.find((entry) => entry.id === ruleId)
  if (rule === undefined || rule.when.kind !== 'comment') return config

  const side = rule.when.matchSide
  return {
    ...config,
    sides: { ...config.sides, [side]: { ...config.sides[side], keyword } },
  }
}

export function withLikeThreshold(config: BattleArenaConfig, value: number): BattleArenaConfig {
  return { ...config, likes: { ...config.likes, threshold: value } }
}

export function withHpGainedPerGrow(config: BattleArenaConfig, value: number): BattleArenaConfig {
  return { ...config, gameplay: { ...config.gameplay, hpGainedPerGrow: value } }
}

export const WHEN_OPTIONS: readonly { value: TriggerRule['when']['kind']; label: string }[] = [
  { value: 'comment', label: 'Komentar' },
  { value: 'like', label: 'Suka' },
  { value: 'gift', label: 'Hadiah' },
  { value: 'follow', label: 'Follow' },
]

/**
 * Nilai satu `<select>` aksi.
 *
 * Keenam ultimate berdiri sebagai enam pilihan TERPISAH, bukan satu "Nuke" plus dropdown jenis
 * yang kedua: creator memilih "Chain freeze", titik. Yang TERSIMPAN tetap `actionType: 'nuke'`
 * ditambah `then.nukeType` — bentuk yang sejak awal sudah dipahami engine (`combat.ts` memakai
 * `rule.then.nukeType ?? gameplay.nuke.type`) dan sudah dijaga `validateRule`. Jadi tidak ada
 * tipe aksi baru, tidak ada migrasi, dan config lama di localStorage tetap sah apa adanya.
 */
export type ActionChoice = BattleActionType | `nuke:${NukeType}`

const NUKE_CHOICE = 'nuke:'

export const ACTION_TYPE_OPTIONS: readonly { value: ActionChoice; label: string }[] = [
  { value: 'spawn', label: 'Gabung arena' },
  { value: 'grow', label: 'Tambah HP maksimal' },
  { value: 'heal', label: 'Pulihkan HP' },
  { value: 'damage', label: 'Serang' },
  { value: 'buff', label: 'Naikkan damage' },
  { value: 'debuff', label: 'Turunkan damage' },
  { value: 'hasten', label: 'Percepat serangan' },
  // Labelnya DARI `ULTIMATES`, tidak diketik ulang: satu daftar, bukan dua yang bisa berbeda —
  // aturan yang sama dengan `UltimateKind` di berkas itu.
  ...ULTIMATES.map((ultimate) => ({
    value: `${NUKE_CHOICE}${ultimate.kind}` as ActionChoice,
    label: ultimate.label,
  })),
]

/**
 * `then` → nilai yang tampil di dropdown.
 *
 * Rule nuke lama belum punya `nukeType`, dan ia jatuh ke jenis global — PERSIS seperti yang
 * benar-benar akan ditembakkan `combat.ts`. Dropdown karena itu tidak pernah menampilkan jenis
 * yang berbeda dari yang meledak di arena.
 */
export function actionChoiceOf(then: TriggerRule['then'], config: BattleArenaConfig): ActionChoice {
  if (then.actionType !== 'nuke') return then.actionType
  return `${NUKE_CHOICE}${then.nukeType ?? config.gameplay.nuke.type}`
}

/** Kebalikannya: satu pilihan dropdown jadi patch `then`. */
export function withActionChoice(
  config: BattleArenaConfig,
  ruleId: string,
  choice: ActionChoice,
): BattleArenaConfig {
  if (!choice.startsWith(NUKE_CHOICE)) {
    // Dibuang, bukan disimpan diam-diam: `validateRule` juga membuang `nukeType` dari rule
    // non-nuke, jadi menyisakannya di memori berarti dropdown berperilaku beda sebelum dan
    // sesudah reload.
    return withThen(config, ruleId, {
      actionType: choice as BattleActionType,
      nukeType: undefined,
      growWithNuke: undefined,
    })
  }
  const rule = config.triggers.find((entry) => entry.id === ruleId)
  return withThen(config, ruleId, {
    actionType: 'nuke',
    nukeType: choice.slice(NUKE_CHOICE.length) as NukeType,
    // Damage nuke milik rule sejak ia jadi rule nuke; angka yang tertinggal dari aksi
    // SEBELUMNYA (nilai heal, misalnya) tidak ada hubungannya dengan kerasnya ultimate.
    // Yang sudah nuke tidak disentuh — mengganti varian tidak boleh menghapus setelan damage.
    ...(rule?.then.actionType === 'nuke' ? {} : { value: config.gameplay.nuke.damage }),
  })
}

export const TARGET_OPTIONS: readonly { value: TargetKind; label: string }[] = [
  { value: 'sender', label: 'Pengirim' },
  { value: 'ownSide', label: 'Tim sendiri' },
  { value: 'enemySide', label: 'Tim lawan' },
  { value: 'sideA', label: 'Sisi A' },
  { value: 'sideB', label: 'Sisi B' },
  { value: 'randomAlly', label: 'Sekutu acak' },
  { value: 'randomEnemy', label: 'Musuh acak' },
  { value: 'all', label: 'Semua' },
]

/** Kata bahasa Inggris di legend, mengikuti caption yang sudah ada (`JOIN {side}`). */
const ACTION_CAPTION: Record<BattleActionType, string> = {
  spawn: 'JOIN',
  grow: 'GROW HP',
  heal: 'HEAL',
  damage: 'DAMAGE',
  buff: 'POWER UP',
  debuff: 'WEAKEN',
  hasten: 'FASTER ATTACKS',
  nuke: 'NUKE',
  spawnEffect: 'EFFECT',
  playSound: 'SOUND',
  cameraShake: 'SHAKE',
}

/** Nama ultimate untuk legend, dari daftar yang sama dengan dropdown-nya. */
const NUKE_CAPTION = Object.fromEntries(
  ULTIMATES.map((ultimate) => [ultimate.kind, ultimate.label.toUpperCase()]),
) as Record<NukeType, string>

const TARGET_CAPTION: Record<TargetKind, string> = {
  sender: 'ME',
  ownSide: 'MY SIDE',
  enemySide: 'ENEMY SIDE',
  sideA: '{side}',
  sideB: '{side}',
  randomAlly: 'A RANDOM ALLY',
  randomEnemy: 'A RANDOM ENEMY',
  all: 'EVERYONE',
}

/**
 * Caption diturunkan, tidak diketik.
 *
 * Invarian yang sama dengan `likes.threshold` dan `hpGainedPerGrow`: legend tidak boleh
 * menjanjikan sesuatu yang berbeda dari yang benar-benar terjadi. Field bebas-ketik akan
 * melanggarnya begitu creator mengubah aksinya dan lupa mengubah teksnya.
 *
 * Dipotong 40 karakter karena itulah batas yang diberlakukan `validateRule`.
 */
export function captionFor(rule: TriggerRule): string {
  // Enam ultimate yang semuanya berbunyi "NUKE" membuat legend tidak bisa dibedakan begitu
  // creator memasang lebih dari satu. Jenis yang belum dipilih tetap "NUKE": rule itu memang
  // mengikuti jenis global, dan menyebut satu nama di sini akan jadi janji yang bisa meleset.
  const action =
    rule.then.actionType === 'nuke' && rule.then.nukeType !== undefined
      ? NUKE_CAPTION[rule.then.nukeType]
      : ACTION_CAPTION[rule.then.actionType]
  // 'spawn' sudah menyebut sasarannya lewat {side}; menambahkan target kedua akan berbunyi
  // "JOIN {side} {side}".
  // Bonus growWithNuke sengaja TIDAK disebut di sini: ia urusan pengirimnya sendiri, sementara
  // rail arena cuma setinggi 18% panggung dan tiap kata di sana dibayar dengan kartu yang tidak
  // muat. Yang harus dijanjikan legend adalah ultimate-nya, dan itu sudah.
  if (rule.then.actionType === 'spawn') return `${action} {side}`.slice(0, 40)
  return `${action} ${TARGET_CAPTION[rule.then.target]}`.trim().slice(0, 40)
}

/**
 * Bonus HP tetap pada rule gift yang aksinya ultimate.
 *
 * Nol disimpan sebagai ABSEN — `validateRule` juga membuangnya, jadi menyimpan nol berarti
 * config di memori berbeda bentuk dari config yang sama setelah reload. Alasan yang persis
 * sama dengan `nukeType` di `withActionChoice`.
 */
export function withGrowWithNuke(
  config: BattleArenaConfig,
  ruleId: string,
  hp: number,
): BattleArenaConfig {
  return withThen(config, ruleId, { growWithNuke: hp > 0 ? hp : undefined })
}

/**
 * Apakah baris rule ini boleh menampilkan opsi tambah HP.
 *
 * Syaratnya sama dengan yang ditegakkan `validateRule`, dan dibaca dari satu fungsi ini supaya
 * panel tidak bisa menampilkan kontrol untuk sesuatu yang config-nya akan buang saat disimpan.
 */
export function canGrowWithNuke(rule: Pick<TriggerRule, 'when' | 'then'>): boolean {
  return rule.then.actionType === 'nuke' && rule.when.kind === 'gift'
}

function mapRule(
  config: BattleArenaConfig,
  ruleId: string,
  change: (rule: TriggerRule) => TriggerRule,
): BattleArenaConfig {
  return {
    ...config,
    triggers: config.triggers.map((rule) => (rule.id === ruleId ? change(rule) : rule)),
  }
}

/**
 * Rule yang sudah lengkap dan sah sejak lahir.
 *
 * `validateConfig` MEMBUANG rule cacat diam-diam, jadi rule setengah jadi tidak akan pernah
 * selamat sampai reload. Itulah cara Req 29 AC8 dipenuhi di sini: dengan pencegahan, bukan
 * pesan error.
 */
export function addRule(config: BattleArenaConfig): BattleArenaConfig {
  if (config.triggers.length >= MAX_TRIGGER_RULES) return config

  const used = new Set(config.triggers.map((rule) => rule.id))
  let index = config.triggers.length + 1
  while (used.has(`rule-${index}`)) index++

  const rule: TriggerRule = {
    id: `rule-${index}`,
    label: 'Trigger baru',
    // Non-aktif: rule yang belum selesai disusun tidak boleh mengubah pertandingan berjalan.
    enabled: false,
    when: { kind: 'comment', matchSide: 'a' },
    then: { actionType: 'heal', target: 'sender', value: 10 },
    legend: { show: true, caption: '', icon: 'action' },
  }

  return {
    ...config,
    triggers: [...config.triggers, { ...rule, legend: { ...rule.legend, caption: captionFor(rule) } }],
  }
}

export function removeRule(config: BattleArenaConfig, ruleId: string): BattleArenaConfig {
  return { ...config, triggers: config.triggers.filter((rule) => rule.id !== ruleId) }
}

/** Empat varian `when` tidak berbagi satu field pun, jadi yang diganti adalah objek utuhnya. */
export function withWhen(
  config: BattleArenaConfig,
  ruleId: string,
  kind: TriggerRule['when']['kind'],
): BattleArenaConfig {
  const when: TriggerRule['when'] =
    kind === 'comment'
      ? { kind: 'comment', matchSide: 'a' }
      : kind === 'like'
        ? { kind: 'like', everyNLikes: config.likes.threshold }
        : kind === 'gift'
          ? { kind: 'gift', giftNames: [], minCount: 1 }
          : { kind: 'follow' }

  return mapRule(config, ruleId, (rule) => ({ ...rule, when }))
}

export function withThen(
  config: BattleArenaConfig,
  ruleId: string,
  patch: Partial<TriggerRule['then']>,
): BattleArenaConfig {
  return mapRule(config, ruleId, (rule) => {
    const next = { ...rule, then: { ...rule.then, ...patch } }
    return { ...next, legend: { ...next.legend, caption: captionFor(next) } }
  })
}

export function withGiftNames(
  config: BattleArenaConfig,
  ruleId: string,
  names: string[],
): BattleArenaConfig {
  return mapRule(config, ruleId, (rule) =>
    rule.when.kind !== 'gift'
      ? rule
      : { ...rule, when: { ...rule.when, giftNames: names.slice(0, MAX_GIFT_NAMES) } },
  )
}

/** Satu petak di pemilih hadiah: yang digambar, dan apakah ia sedang dipakai rule ini. */
export interface GiftPick {
  name: string
  coins: number
  iconUrl: string | null
  selected: boolean
}

/**
 * Katalog room + nama yang sudah dipilih → satu daftar untuk digambar.
 *
 * Nama yang dipilih tapi TIDAK ada di katalog tetap masuk daftar, tanpa ikon dan berkoin
 * nol: config bisa membawa gift dari room lain, atau nama seed yang tidak dijual di room
 * ini, dan entri yang tidak pernah tergambar berarti creator tidak punya cara melepasnya.
 *
 * Yang terpilih naik ke atas — katalog room sungguhan berisi ratusan hadiah, dan pilihan
 * yang tenggelam di bawahnya sama saja dengan tidak terlihat. Selain itu urutan katalog
 * dipertahankan apa adanya: itu urutan panel hadiah TikTok, yang sudah dikenal creator.
 */
export function giftPicks(
  catalog: readonly GiftCatalogEntry[],
  selected: readonly string[],
): GiftPick[] {
  const chosen = new Set(selected)
  const picks: GiftPick[] = catalog.map((gift) => ({
    name: gift.name,
    coins: gift.coins,
    iconUrl: gift.iconUrl,
    selected: chosen.has(gift.name),
  }))
  const known = new Set(catalog.map((gift) => gift.name))
  for (const name of selected) {
    if (!known.has(name)) picks.push({ name, coins: 0, iconUrl: null, selected: true })
  }
  return [...picks.filter((pick) => pick.selected), ...picks.filter((pick) => !pick.selected)]
}

/** Klik pada satu petak: yang belum dipakai ditambahkan, yang sudah dipakai dilepas. */
export function toggleGiftName(names: readonly string[], name: string): string[] {
  return names.includes(name)
    ? names.filter((entry) => entry !== name)
    : [...names, name].slice(0, MAX_GIFT_NAMES)
}

export function withMinCount(
  config: BattleArenaConfig,
  ruleId: string,
  count: number,
): BattleArenaConfig {
  const clamped = Math.min(
    GIFT_MIN_COUNT_RANGE.max,
    Math.max(GIFT_MIN_COUNT_RANGE.min, Math.round(count)),
  )
  return mapRule(config, ruleId, (rule) =>
    rule.when.kind !== 'gift' ? rule : { ...rule, when: { ...rule.when, minCount: clamped } },
  )
}
