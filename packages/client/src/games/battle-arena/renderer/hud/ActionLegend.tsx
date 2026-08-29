import { useRef } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { BattleAction } from '../../actions.js'
import type { BattleArenaConfig, TriggerRule } from '../../config/index.js'
import { actionForRule, buildActionLegend, creatorActor } from '../../triggers.js'
import type { LegendEntry } from '../../triggers.js'
import type { ActorIdentity } from '../../types.js'
import { bottomHalves, scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'

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
 * Satu baris di SEPARUH KIRI band bawah, berbagi band itu dengan panel media di kanan
 * (`bottomHalves`). Ia sempat jadi dua rail vertikal di tepi arena saat panel media
 * mengambil seluruh band; kembali ke band bawah mengosongkan lagi 34% lebar arena untuk
 * fighter. Tidak ada kartu, latar, bingkai, maupun bayangan kotak di sini — yang menjaga
 * teks terbaca adalah `text-shadow`, bukan tinta gelap di belakangnya.
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
  // Seluruh entri, tidak dijatah: satu baris mendatar tidak punya batas baris yang harus
  // dibagi dua seperti rail dulu, dan petunjuk yang hilang adalah petunjuk yang tidak bisa
  // dijalankan penonton.
  const entries = buildActionLegend(config)

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

  const card = (entry: LegendEntry): ReactElement => {
    const rule = ruleOf(entry.id)
    const tint = tintOf(entry, rule)
    const giftIcon = giftIconOf(rule)

    /*
     * Ikon di SAMPING teks, bukan di atasnya.
     *
     * Tumpukan tegak memakai ~50 px desain per kartu, dan separuh band bawah cuma setinggi
     * 194 — empat kartu, habis. Sepuluh trigger baru muat kalau seluruh kartu jadi SATU
     * baris: ikon, kondisi, dan caption bersebelahan (~18 px), bukan bertumpuk tiga tingkat.
     *
     * Basis 120 px desain, BUKAN 0: `flex-wrap` memutuskan pindah baris dari basis, bukan
     * dari lebar akhir, jadi basis 0 membuat sepuluh kartu tetap memaksa satu baris dan
     * menyusut sampai lebih sempit dari katanya sendiri. Dengan 120 mereka jadi dua kolom di
     * portrait (separuh band ~304 px) dan tetap MELAR mengisi barisnya di landscape.
     */
    const style: CSSProperties = {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: scaled(layout, 5),
      padding: 0,
      color: '#fff',
      font: 'inherit',
      textAlign: 'left',
      cursor: interactive ? 'pointer' : 'default',
      minWidth: 0,
      flex: `1 1 ${scaled(layout, 120)}px`,
    }

    /*
     * MEMBUNGKUS DI SPASI, tidak dipotong, dan TIDAK PERNAH di tengah kata.
     *
     * Kartu ini sempit — separuh band bawah dibagi rata — dan caption seperti "JOIN TEAM
     * MESSI" atau nama gift panjang tidak muat satu baris. Dipotong `…`, yang tersisa di
     * layar justru "JOIN M…" — petunjuk yang tidak bisa dijalankan penonton. Dua baris yang
     * terbaca lebih berguna daripada satu baris yang rapi, jadi tidak ada `nowrap` maupun
     * `textOverflow` di sini.
     *
     * `overflowWrap` WAJIB `normal`, dan itu bukan nilai bawaan yang kebetulan. Nilainya
     * pernah `anywhere`, yang membuat sumbangan min-content sebuah baris menyusut jadi satu
     * huruf — kartu boleh menyempit sampai lebih sempit dari katanya sendiri, dan
     * "BLACKHOLE" pecah jadi "BLACKHOL" + "E". `break-word` tidak menyelamatkan: ia tetap
     * memecah kata yang sendirian lebih lebar dari barisnya. Hanya `normal` yang benar-benar
     * mengharamkan potongan di tengah kata.
     */
    const line: CSSProperties = {
      // INTINYA SELALU PUTIH, warnanya jadi halo.
      //
      // Caption berwarna tint dulu dicat langsung, dan `SINGULARITY ME` magenta di atas
      // latar ungu praktis lenyap. Putih punya kontras tertinggi terhadap hampir semua
      // latar; tint tetap membedakan jenis pemicu, hanya pindah ke cahayanya.
      color: '#fff',
      textShadow: textShadow(tint, scaled(layout, 6)),
      lineHeight: 1.15,
      overflowWrap: 'normal',
      wordBreak: 'normal',
      maxWidth: '100%',
    }

    const content = (
      <>
        {giftIcon === null ? (
          <span
            style={{ fontSize: scaled(layout, 18), lineHeight: 1, flex: '0 0 auto', filter: ICON_SHADOW }}
          >
            {LEGEND_ICONS[entry.icon] ?? '⭐'}
          </span>
        ) : (
          <img
            alt=""
            data-testid="legend-gift-icon"
            src={giftIcon}
            style={{
              width: scaled(layout, 18),
              height: scaled(layout, 18),
              flex: '0 0 auto',
              objectFit: 'contain',
              display: 'block',
              filter: ICON_SHADOW,
            }}
          />
        )}
        {/*
          * Kondisi dan caption SEBELAHAN, bukan bertumpuk.
          *
          * `"a"` di atas `JOIN RONALDO` memakai dua baris untuk satu kalimat yang dibaca
          * sekali jalan — dan tumpukan itulah yang membuat kartu setinggi dua baris. Satu
          * baris membacanya seperti kalimatnya sendiri ("ketik a → join ronaldo") DAN
          * memotong tinggi kartu jadi separuh. `flexWrap` menjaga caption panjang tetap
          * turun sendiri alih-alih meluber.
          */}
        <span
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: scaled(layout, 5),
            rowGap: 0,
            minWidth: 0,
          }}
        >
          {/*
            * Nama gift MENGHILANG begitu gambarnya sendiri yang tampil.
            *
            * Gambar hadiah TikTok sudah menyebutkan hadiah mana yang diminta, dan
            * mengulanginya sebagai teks memakan tempat di kartu yang sempit. Digantung pada
            * `giftIcon`, bukan pada jenis rule: kartu yang jatuh ke 🎁 tidak menyebut hadiah
            * apa pun, jadi di sana namanya satu-satunya petunjuk dan tetap dicetak. Kondisi
            * non-gift — keyword sisi, FOLLOW, ambang like — tidak pernah punya gambar, jadi
            * tidak pernah ikut hilang.
            */}
          {giftIcon !== null ? null : (
            <span
              style={{
                ...line,
                // Lebih BESAR dari caption, bukan lebih kecil: `"a"` adalah yang benar-benar
                // harus diketik penonton, sementara caption cuma menjelaskan akibatnya.
                fontSize: scaled(layout, 14),
                fontWeight: 800,
                letterSpacing: '0.02em',
                textShadow: textShadow(tint, scaled(layout, 8)),
              }}
            >
              {entry.condition}
            </span>
          )}
          <span
            style={{
              ...line,
              fontSize: scaled(layout, 12),
              fontWeight: 800,
              letterSpacing: '0.03em',
              textShadow: textShadow(tint, scaled(layout, 8)),
            }}
          >
            {entry.caption}
          </span>
        </span>
      </>
    )

    return interactive ? (
      <button
        data-testid="legend-card"
        id={`legend-card-${entry.id}`}
        key={entry.id}
        onClick={() => fire(entry.id)}
        style={{ ...style, border: 'none', background: 'none' }}
        type="button"
      >
        {content}
      </button>
    ) : (
      <div data-testid="legend-card" key={entry.id} style={style}>
        {content}
      </div>
    )
  }

  /*
   * Separuh kiri band bawah, dan tidak sepiksel pun di luarnya.
   *
   * Tinggi EKSPLISIT plus `overflow: hidden` yang menegakkannya: berapa pun rule yang
   * dinyalakan creator, barisnya berhenti di dalam band dan tidak pernah tumbuh menimpa
   * panel media di sebelahnya.
   *
   * Dianggarkan untuk SEPULUH trigger, bukan enam. Di portrait separuh band 304×194 px
   * desain: dua kolom (basis 120) × lima baris kartu setinggi ~18 px, plus sela 4 → ~106 px,
   * masih jauh di bawah 194 walau beberapa caption membungkus jadi dua baris. Yang membuatnya
   * muat adalah kartu yang seluruhnya SATU BARIS — ikon, kondisi, caption bersebelahan —
   * bukan sela yang dirapatkan, yang cuma membeli satu baris.
   */
  const band = bottomHalves(layout).legend

  return (
    <div
      data-testid="action-legend"
      style={{
        position: 'absolute',
        left: band.x,
        top: band.y,
        width: band.width,
        height: band.height,
        overflow: 'hidden',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        alignContent: 'center',
        gap: `${scaled(layout, 4)}px ${scaled(layout, 8)}px`,
        padding: `0 ${scaled(layout, 8)}px`,
        boxSizing: 'border-box',
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      {entries.map((entry) => card(entry))}
    </div>
  )
}
