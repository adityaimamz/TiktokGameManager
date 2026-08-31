import type { ChatMessage } from '@lga/shared'
import type { IGameTriggers } from '../../framework/types/plugin.js'
import { normalizeChatText } from '../../platform/chat/normalize-text.js'
import { createBattleAction, targetFromKind } from './actions.js'
import type { BattleAction } from './actions.js'
import type { BattleArenaConfig, SideConfig, TriggerRule } from './config/index.js'
import type { ActorIdentity, SideId } from './types.js'

/**
 * Pencocokan per KATA, bukan substring.
 *
 * Teks dan kandidat sama-sama diberi spasi pengapit sebelum dibandingkan, sehingga
 * "messiah" tidak dianggap menyebut "messi", tapi "team messi" tetap cocok sebagai
 * nama sisi yang terdiri dari dua kata.
 */
export function matchesSide(normalizedText: string, side: SideConfig): boolean {
  const haystack = ` ${normalizedText} `
  const candidates = [side.keyword, side.name, ...side.aliases]
    .map((candidate) => normalizeChatText(candidate))
    .filter((candidate) => candidate.length > 0)

  return candidates.some((candidate) => haystack.includes(` ${candidate} `))
}

function actorOf(message: ChatMessage): ActorIdentity {
  return { platform: message.platform, username: message.username, avatarUrl: message.avatarUrl }
}

function actionFromRule(
  rule: TriggerRule,
  actor: ActorIdentity,
  value: number,
  giftName: string | null = null,
  giftCoins = 0,
): BattleAction {
  return createBattleAction({
    type: rule.then.actionType,
    target: targetFromKind(rule.then.target, actor),
    value,
    actor,
    ruleId: rule.id,
    giftName,
    giftCoins,
  })
}

/** Nama gift dibandingkan longgar HANYA pada huruf besar-kecil dan spasi pengapit. */
function sameGiftName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Nilai yang dibawa Action.
 *
 * Grow memakai SATUAN yang dipasok event — like, koin, atau satu per follow — karena
 * `growMode` hanya memilih antara mengalikan langsung dan menumpuk sampai ambang; aksi lain
 * memakai angka yang tertulis di rule.
 */
function valueForRule(rule: TriggerRule, units: number): number {
  return rule.then.actionType === 'grow' ? units : rule.then.value
}

/** Identitas sintetis untuk aksi yang dipicu creator dari dashboard (Req 38 AC8). */
export function creatorActor(username = 'creator'): ActorIdentity {
  return { platform: 'creator', username, avatarUrl: null }
}

/**
 * Aksi yang dihasilkan sebuah rule bila dipicu langsung, bukan lewat chat.
 *
 * Dipakai kartu legend yang bisa diklik di dashboard. Karena ia memakai jalur pembuatan
 * Action yang sama dengan chat sungguhan, tombol tidak mungkin melakukan sesuatu yang
 * berbeda dari yang tertulis di kartunya.
 */
export function actionForRule(
  config: BattleArenaConfig,
  ruleId: string,
  actor: ActorIdentity,
  value?: number,
): BattleAction | null {
  const rule = config.triggers.find((entry) => entry.id === ruleId)
  if (rule === undefined || !rule.enabled) return null
  const fallback =
    rule.when.kind === 'like'
      ? config.likes.threshold
      : rule.when.kind === 'follow'
        ? 1
        : rule.then.value
  return actionFromRule(rule, actor, value ?? fallback)
}

/**
 * Menerjemahkan event chat menjadi aksi. Tidak pernah menyentuh state game (Req 30 AC4).
 *
 * Config dibaca lewat callback, bukan disalin di konstruktor, supaya perubahan setting
 * creator berlaku mulai event berikutnya tanpa membangun ulang apa pun (Req 16 AC5).
 */
export class BattleArenaTriggers implements IGameTriggers<ChatMessage, BattleAction> {
  constructor(private readonly getConfig: () => BattleArenaConfig) {}

  resolve(message: ChatMessage): BattleAction[] {
    const config = this.getConfig()

    if (message.kind === 'textMessageEvent') return this.resolveComment(message, config)
    if (message.kind === 'likeEvent') return this.resolveLike(message, config)
    if (message.kind === 'giftEvent') return this.resolveGift(message, config)
    if (message.kind === 'followEvent') return this.resolveFollow(message, config)

    // Member dan share tetap tanpa aksi, diabaikan tanpa error (Req 17 AC4, AC6).
    return []
  }

  private resolveComment(message: ChatMessage, config: BattleArenaConfig): BattleAction[] {
    const text = normalizeChatText(message.text)
    if (text.length === 0) return []

    const matched: { rule: TriggerRule; side: SideId }[] = []
    for (const rule of config.triggers) {
      if (!rule.enabled || rule.when.kind !== 'comment') continue
      const side = rule.when.matchSide
      if (matchesSide(text, config.sides[side])) matched.push({ rule, side })
    }

    // Menyebut kedua sisi sekaligus berarti tidak memilih apa pun (Req 4 AC7).
    const sides = new Set(matched.map((entry) => entry.side))
    if (sides.size !== 1) return []

    return matched.map((entry) =>
      actionFromRule(entry.rule, actorOf(message), entry.rule.then.value),
    )
  }

  private resolveLike(message: ChatMessage, config: BattleArenaConfig): BattleAction[] {
    // Akumulasi terhadap ambang terjadi di combat.ts, tempat state fighter berada.
    const likes = Math.max(1, message.likeCount)
    return config.triggers
      .filter((rule) => rule.enabled && rule.when.kind === 'like')
      .map((rule) => actionFromRule(rule, actorOf(message), valueForRule(rule, likes)))
  }

  private resolveGift(message: ChatMessage, config: BattleArenaConfig): BattleAction[] {
    const name = message.giftName ?? ''
    const count = Math.max(1, message.giftCount)
    const out: BattleAction[] = []

    for (const rule of config.triggers) {
      if (!rule.enabled || rule.when.kind !== 'gift') continue
      if (count < rule.when.minCount) continue
      const names = rule.when.giftNames
      if (names.length > 0 && !names.some((candidate) => sameGiftName(candidate, name))) continue

      /*
       * `minCount` adalah PEMBAGI, bukan sekadar gerbang.
       *
       * Begitu bunyinya di panel creator — "minimal 10" berarti sepuluh gift menghasilkan
       * satu trigger — jadi combo ×100 harus menghasilkan sepuluh. Sebelum ini satu event
       * gift selalu berujung TEPAT SATU aksi berapa pun banyaknya, sehingga penonton yang
       * mengirim ×100 mendapat hasil yang sama persis dengan yang mengirim ×10.
       */
      const repeats = Math.min(
        Math.floor(count / Math.max(1, rule.when.minCount)),
        Math.max(1, config.gameplay.maxTriggersPerGift),
      )

      /*
       * Koin DIBAGI, tidak disalin.
       *
       * Tier ultimate (`tierIndexFor`) dan satuan Grow keduanya turun dari angka ini, jadi
       * menyalinnya utuh ke tiap kelipatan membuat sepuluh ultimate masing-masing berperilaku
       * seolah menerima SELURUH gift. Membaginya menjaga totalnya tetap sama dengan yang
       * benar-benar dikirim — dan saat plafon menjepit, sisanya MEMEKAT ke aksi yang tersisa
       * alih-alih hangus, sehingga gift raksasa berujung sedikit ultimate besar.
       *
       * Ini tidak menyentuh pembukuan TOP GIFTER: `engine.emit` menjumlahkan koin sekali per
       * EVENT, sebelum trigger resolve, jadi jumlah aksi tidak bisa menggandakannya.
       */
      const share = message.giftCoins / repeats

      for (let i = 0; i < repeats; i++) {
        out.push(
          actionFromRule(
            rule,
            actorOf(message),
            valueForRule(rule, share),
            // Non-null selalu: gift history memakai field ini sebagai diskriminator, jadi
            // event tanpa nama tetap harus membawa sesuatu yang bisa dibaca penonton.
            name.length > 0 ? name : 'hadiah',
            share,
          ),
        )
      }
    }

    return out
  }

  private resolveFollow(message: ChatMessage, config: BattleArenaConfig): BattleAction[] {
    // Satu follow adalah satu satuan; tidak ada angka lain yang dibawa event ini (Req 12 AC6).
    return config.triggers
      .filter((rule) => rule.enabled && rule.when.kind === 'follow')
      .map((rule) => actionFromRule(rule, actorOf(message), valueForRule(rule, 1)))
  }
}

export interface LegendEntry {
  id: string
  /** Teks kondisi di atas kartu: `"messi"` untuk komentar, `x10` untuk like. */
  condition: string
  caption: string
  icon: string
  /**
   * Sisi yang entri ini bicarakan; `null` berarti ia berlaku untuk kedua sisi.
   *
   * Dipakai rail action legend untuk memilih kiri atau kanan. Entri `null` — gift yang
   * menyasar pengirimnya — muncul di KEDUANYA, karena ongkosnya memang berlaku untuk
   * penonton di sisi mana pun.
   */
  side: SideId | null
}

/**
 * Membangun action legend dari rule yang berlaku (§9.0.1).
 *
 * Dibangkitkan dari sumber yang sama dengan yang memicu aksi, sehingga petunjuk untuk
 * penonton tidak mungkin berbeda dari perilaku game yang sesungguhnya.
 */
/**
 * Caption legend dengan `{side}` sudah diganti nama sisi yang sesungguhnya.
 *
 * Rule komentar dinamai sisi yang ia cocokkan; rule lain dinamai sisi yang ia SASAR. Kalau
 * sasarannya bukan salah satu sisi tertentu — 'sender', 'all', atau sasaran relatif —
 * placeholder-nya dibuang, bukan ditampilkan mentah.
 *
 * Satu fungsi untuk action legend dan gift history, supaya keduanya tidak bisa berbeda kata.
 */
export function resolveCaption(rule: TriggerRule, config: BattleArenaConfig): string {
  const side = sideOfRule(rule)
  if (side === null) return rule.legend.caption.replace('{side}', '').trim()
  return rule.legend.caption.replace('{side}', config.sides[side].name)
}

/**
 * Sisi yang sebuah rule bicarakan: yang ia COCOKKAN untuk komentar, yang ia SASAR untuk
 * sisanya. Sasaran yang bukan salah satu sisi tertentu — 'sender', 'all', atau sasaran
 * relatif — tidak punya sisi.
 *
 * Satu fungsi untuk caption dan untuk penempatan rail action legend, supaya keduanya tidak
 * bisa berbeda pendapat tentang entri yang sama.
 */
export function sideOfRule(rule: TriggerRule): SideId | null {
  if (rule.when.kind === 'comment') return rule.when.matchSide
  if (rule.then.target === 'sideA') return 'a'
  if (rule.then.target === 'sideB') return 'b'
  return null
}

export function buildActionLegend(config: BattleArenaConfig): LegendEntry[] {
  const entries: LegendEntry[] = []

  for (const rule of config.triggers) {
    if (!rule.enabled || !rule.legend.show) continue

    if (rule.when.kind === 'comment') {
      const side = config.sides[rule.when.matchSide]
      entries.push({
        id: rule.id,
        condition: `"${side.keyword}"`,
        caption: resolveCaption(rule, config).toUpperCase(),
        icon: rule.legend.icon,
        side: sideOfRule(rule),
      })
      continue
    }

    if (rule.when.kind === 'gift') {
      const names = rule.when.giftNames
      const label = names.length === 0 ? 'ANY GIFT' : names.join(' / ').toUpperCase()
      entries.push({
        id: rule.id,
        condition: rule.when.minCount > 1 ? `${label} ×${rule.when.minCount}` : label,
        caption: resolveCaption(rule, config).toUpperCase(),
        icon: rule.legend.icon,
        side: sideOfRule(rule),
      })
      continue
    }

    if (rule.when.kind === 'follow') {
      entries.push({
        id: rule.id,
        condition: 'FOLLOW',
        caption: resolveCaption(rule, config).toUpperCase(),
        icon: rule.legend.icon,
        side: sideOfRule(rule),
      })
      continue
    }

    // Ambang dibaca dari config, bukan dari rule: `likes.threshold` adalah satu-satunya
    // sumber kebenaran runtime (keputusan D3), jadi legend tidak bisa memajang angka
    // yang berbeda dari yang benar-benar berlaku.
    entries.push({
      id: rule.id,
      condition: `x${config.likes.threshold}`,
      caption: resolveCaption(rule, config).toUpperCase(),
      icon: rule.legend.icon,
      side: sideOfRule(rule),
    })
  }

  return entries
}
