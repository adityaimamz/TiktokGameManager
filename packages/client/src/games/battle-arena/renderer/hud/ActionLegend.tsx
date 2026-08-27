import { useRef } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { BattleAction } from '../../actions.js'
import type { BattleArenaConfig, TriggerRule } from '../../config/index.js'
import { actionForRule, creatorActor } from '../../triggers.js'
import type { LegendEntry } from '../../triggers.js'
import type { ActorIdentity } from '../../types.js'
import { scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'
import { RAIL_BOTTOM_RESERVE_PX, legendRails, railTopReservePx } from './view-model.js'

/** Ikon legend adalah nama simbolik di config; di sini ia jadi glif yang bisa dilihat. */
const LEGEND_ICONS: Record<string, string> = {
  join: '💬',
  like: '❤️',
  gift: '🎁',
  grow: '⬆️',
  attack: '⚔️',
}

/**
 * Warna mengikuti JENIS pemicunya, bukan sisinya.
 *
 * Rule komentar dikecualikan dan memakai warna sisi yang ia namai — itu ditentukan di
 * `tintOf`, bukan di tabel ini. Sisanya emas untuk like dan ungu untuk gift, persis seperti
 * di layar acuan.
 */
const TONE: Record<string, string> = {
  join: '',
  like: '#FFAF32',
  grow: '#FFAF32',
  gift: '#8C50FF',
  attack: '#8C50FF',
}

const FALLBACK_TONE = '#8C50FF'

/** Lebar rail sebagai bagian lebar arena. Sisanya milik fighter. */
const RAIL_WIDTH_RATIO = 0.17

/**
 * Bayangan yang menjaga teks terbaca di atas latar APA PUN.
 *
 * Tiga lapis, dan ketiganya perlu: rim hitam rapat untuk latar terang, bayangan jatuh untuk
 * memisahkannya dari tekstur, dan halo berwarna yang MENYALA — aturan yang sama dengan
 * retakan kawah dan berkas laser di CLAUDE.md. Tinta gelap saja kalah begitu arena berlatar
 * foto terang, dan teks berwarna saja hilang begitu warnanya mendekati warna latar.
 */
function textShadow(tint: string, glowPx: number): string {
  return `0 0 ${glowPx}px ${tint}, 0 2px 6px rgba(0,0,0,.9), 0 0 3px rgba(0,0,0,1)`
}

/** Ikon ikut aturan yang sama: rim pekat, supaya siluetnya tetap terpisah dari latar. */
const ICON_SHADOW = 'drop-shadow(0 2px 5px rgba(0,0,0,.9)) drop-shadow(0 0 2px rgba(0,0,0,1))'

export interface ActionLegendProps {
  config: BattleArenaConfig
  layout: StageLayout
  /** Dashboard mengaktifkannya; overlay tidak (§9.0.1). */
  interactive?: boolean
  onFire?: (action: BattleAction) => void
  actorFor?: (ruleId: string) => ActorIdentity
  /**
   * Ikon gift sungguhan, nama huruf kecil → URL gambar.
   *
   * Diberikan pemanggil, tidak diambil sendiri: katalog datang dari `/api/gifts`, dan
   * renderer tidak boleh memanggil jaringan — aturan yang sama dengan `reducedMotion`.
   * Kosong berarti kartu gift jatuh ke glif emoji seperti sebelumnya.
   */
  giftIcons?: ReadonlyMap<string, string>
}

/**
 * Petunjuk untuk penonton, dibangkitkan dari rule trigger yang berlaku (§9.0.1).
 *
 * Dua rail yang MENUMPANG di atas arena, bukan grid di band bawah: band bawah kini milik
 * panel media, dan layar acuan memang menempelkan petunjuknya ke tepi kiri dan kanan bidang
 * main. Tidak ada kartu, latar, bingkai, maupun bayangan kotak di sini — yang menjaga teks
 * terbaca adalah `text-shadow`, bukan tinta gelap di belakangnya.
 *
 * Komponen yang SAMA dipakai overlay dan dashboard; bedanya hanya prop `interactive`.
 */
export function ActionLegend({
  config,
  layout,
  interactive = false,
  onFire,
  actorFor,
  giftIcons,
}: ActionLegendProps): ReactElement {
  const clicks = useRef(0)
  const rails = legendRails(config)

  const fire = (ruleId: string): void => {
    if (onFire === undefined) return
    clicks.current += 1
    const actor = actorFor?.(ruleId) ?? creatorActor(`creator-${clicks.current}`)
    const action = actionForRule(config, ruleId, actor)
    if (action !== null) onFire(action)
  }

  /** Satu pencarian per kartu, dipakai untuk warna DAN gambar gift. */
  const ruleOf = (id: string): TriggerRule | undefined =>
    config.triggers.find((candidate) => candidate.id === id)

  /**
   * Gambar gift yang BENAR-BENAR diminta kartu ini, kalau katalognya punya.
   *
   * Nama pertama yang dikenal yang menang: sebuah rule boleh menyebut beberapa gift, dan
   * satu kartu hanya punya tempat untuk satu gambar.
   */
  const giftIconOf = (rule: TriggerRule | undefined): string | null => {
    if (giftIcons === undefined || rule?.when.kind !== 'gift') return null
    for (const name of rule.when.giftNames) {
      const url = giftIcons.get(name.toLowerCase())
      if (url !== undefined) return url
    }
    return null
  }

  /** Kartu yang menyebut nama sisi diwarnai sisi itu; sisanya ikut jenis pemicunya. */
  const tintOf = (entry: LegendEntry, rule: TriggerRule | undefined): string => {
    if (rule?.when.kind === 'comment') return config.sides[rule.when.matchSide].color
    const tone = TONE[entry.icon]
    return tone === undefined || tone === '' ? FALLBACK_TONE : tone
  }

  const card = (entry: LegendEntry, side: 'left' | 'right'): ReactElement => {
    const rule = ruleOf(entry.id)
    const tint = tintOf(entry, rule)
    const giftIcon = giftIconOf(rule)
    const align = side === 'left' ? 'flex-start' : 'flex-end'

    const style: CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: align,
      gap: scaled(layout, 2),
      padding: 0,
      color: '#fff',
      font: 'inherit',
      textAlign: side === 'left' ? 'left' : 'right',
      cursor: interactive ? 'pointer' : 'default',
      minWidth: 0,
      maxWidth: '100%',
    }

    /*
     * MEMBUNGKUS DI SPASI, tidak dipotong, dan TIDAK PERNAH di tengah kata.
     *
     * Rail ini sempit dan caption seperti "JOIN TEAM MESSI" atau nama gift panjang tidak
     * muat satu baris. Dipotong `…`, yang tersisa di layar justru "JOIN M…" — petunjuk yang
     * tidak bisa dijalankan penonton. Dua baris yang terbaca lebih berguna daripada satu
     * baris yang rapi, jadi tidak ada `nowrap` maupun `textOverflow` di sini.
     *
     * `overflowWrap` WAJIB `normal`, dan itu bukan nilai bawaan yang kebetulan. Nilainya
     * pernah `anywhere`, yang membuat sumbangan min-content sebuah baris menyusut jadi satu
     * huruf — kartu boleh menyempit sampai lebih sempit dari katanya sendiri, dan
     * "BLACKHOLE" pecah jadi "BLACKHOL" + "E". `break-word` tidak menyelamatkan: ia tetap
     * memecah kata yang sendirian lebih lebar dari barisnya. Hanya `normal` yang benar-benar
     * mengharamkan potongan di tengah kata; harganya kata yang kelewat panjang MELUBER dari
     * rail, dan itu ditukar dengan sadar — kata utuh yang menjorok masih bisa dibaca, kata
     * yang terbelah tidak.
     */
    const line: CSSProperties = {
      // INTINYA SELALU PUTIH, warnanya jadi halo.
      //
      // Caption berwarna tint dulu dicat langsung, dan `SINGULARITY ME` magenta di atas
      // latar ungu praktis lenyap. Putih punya kontras tertinggi terhadap hampir semua
      // latar; tint tetap membedakan jenis pemicu, hanya pindah ke cahayanya.
      color: '#fff',
      textShadow: textShadow(tint, scaled(layout, 9)),
      lineHeight: 1.15,
      overflowWrap: 'normal',
      wordBreak: 'normal',
      maxWidth: '100%',
    }

    const content = (
      <>
        {giftIcon === null ? (
          <span style={{ fontSize: scaled(layout, 28), lineHeight: 1, filter: ICON_SHADOW }}>
            {LEGEND_ICONS[entry.icon] ?? '⭐'}
          </span>
        ) : (
          <img
            alt=""
            data-testid="legend-gift-icon"
            src={giftIcon}
            style={{
              width: scaled(layout, 28),
              height: scaled(layout, 28),
              objectFit: 'contain',
              display: 'block',
              filter: ICON_SHADOW,
            }}
          />
        )}
        {/*
          * Nama gift MENGHILANG begitu gambarnya sendiri yang tampil.
          *
          * Gambar hadiah TikTok sudah menyebutkan hadiah mana yang diminta, dan mengulanginya
          * sebagai teks memakan satu baris di rail yang cuma selebar 17% arena — baris yang
          * lebih berguna dipakai caption. Digantung pada `giftIcon`, bukan pada jenis rule:
          * kartu yang jatuh ke 🎁 tidak menyebut hadiah apa pun, jadi di sana namanya adalah
          * satu-satunya petunjuk dan tetap dicetak. Kondisi non-gift — keyword sisi, FOLLOW,
          * ambang like — tidak pernah punya gambar, jadi tidak pernah ikut hilang.
          */}
        {giftIcon !== null ? null : (
          <span
            style={{
              ...line,
              fontSize: scaled(layout, 13),
              fontWeight: 600,
              letterSpacing: '0.04em',
              opacity: 0.92,
            }}
          >
            {entry.condition}
          </span>
        )}
        <span
          style={{
            ...line,
            fontSize: scaled(layout, 15),
            fontWeight: 800,
            letterSpacing: '0.06em',
            textShadow: textShadow(tint, scaled(layout, 12)),
          }}
        >
          {entry.caption}
        </span>
      </>
    )

    return interactive ? (
      <button
        data-testid="legend-card"
        id={`legend-card-${side}-${entry.id}`}
        key={`${side}-${entry.id}`}
        onClick={() => fire(entry.id)}
        style={{ ...style, border: 'none', background: 'none' }}
        type="button"
      >
        {content}
      </button>
    ) : (
      <div data-testid="legend-card" key={`${side}-${entry.id}`} style={style}>
        {content}
      </div>
    )
  }

  /*
   * Band vertikal yang BEBAS dari overlay lain.
   *
   * TOP FIGHTERS dan TOP GIFTER menempati kedua sudut atas arena, kill feed dan gift feed
   * kedua sudut bawah — persis tempat rail berdiri. Jatah keduanya dihitung di view-model
   * dari geometri panelnya sendiri, dan rail mengambil sisanya. Tinggi EKSPLISIT plus
   * `overflow: hidden` yang menegakkannya: daftar sepanjang apa pun berhenti di dalam band,
   * tidak pernah tumbuh menimpa tetangganya.
   */
  const railTop = scaled(layout, railTopReservePx(config))
  const railHeight = Math.max(
    0,
    layout.arena.height - railTop - scaled(layout, RAIL_BOTTOM_RESERVE_PX),
  )

  const rail = (side: 'left' | 'right', entries: LegendEntry[]): ReactElement => {
    const width = layout.arena.width * RAIL_WIDTH_RATIO
    return (
      <div
        data-testid={`legend-rail-${side}`}
        style={{
          position: 'absolute',
          left: side === 'left' ? layout.arena.x : layout.arena.x + layout.arena.width - width,
          top: layout.arena.y + railTop,
          width,
          height: railHeight,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: side === 'left' ? 'flex-start' : 'flex-end',
          gap: scaled(layout, 12),
          padding: `0 ${scaled(layout, 8)}px`,
          boxSizing: 'border-box',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      >
        {entries.map((entry) => card(entry, side))}
      </div>
    )
  }

  return (
    <div
      data-testid="action-legend"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {rail('left', rails.left)}
      {rail('right', rails.right)}
    </div>
  )
}
