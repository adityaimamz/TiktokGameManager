import { isSyntheticPlatform } from '@lga/shared'
import type { ChatMessage, PlayerProgress } from '@lga/shared'
import type { EngineEvent } from './events.js'
import { fighterKey } from './types.js'
import type { ActorIdentity } from './types.js'

export interface LiveLedgerOptions {
  /** Mengembalikan `true` bila server benar-benar menerimanya. */
  send: (entries: readonly PlayerProgress[]) => Promise<boolean>
}

interface Delta {
  kills: number
  deaths: number
  giftCoins: number
}

/**
 * Statistik siaran per viewer, ditumpuk dari EVENT dan bukan dari diff state.
 *
 * Membandingkan `FighterRegistry` dengan snapshot sebelumnya busuk di tiga tempat sekaligus —
 * `Reset` memanggil `clear()`, pindah sisi memanggil `remove()`, dan viewer TikTok pertama
 * memanggil `removeByPlatform('demo')`. Ketiganya membuat total berjalan TURUN. Sebuah
 * kematian dan sebuah gift, sebaliknya, sudah berupa delta sejak lahir dan tidak bisa
 * dibatalkan oleh satu pun dari ketiganya.
 *
 * Ia TIDAK boleh membaca `Fighter.giftCoins`: angka itu ditumpuk engine untuk keperluan
 * gameplay (tier ultimate, TOP GIFTER di HUD) dan hidup berdampingan dengan hitungan di sini.
 * Membacanya berarti tiap gift dihitung dua kali.
 *
 * Tanpa jam dan tanpa timer — `games/` tidak boleh membaca `Date.now()`. Yang memanggil
 * `flush()` secara berkala adalah effect di `useDashboard`.
 */
export class LiveLedger {
  private readonly rows = new Map<string, PlayerProgress>()
  private readonly send: LiveLedgerOptions['send']
  private sending = false

  constructor(opts: LiveLedgerOptions) {
    this.send = opts.send
  }

  onEvent(event: EngineEvent): void {
    if (event.type !== 'fighterDied') return
    this.add(event.fighter, { kills: 0, deaths: 1, giftCoins: 0 })
    if (event.killer !== null) this.add(event.killer, { kills: 1, deaths: 0, giftCoins: 0 })
  }

  onMessage(message: ChatMessage): void {
    if (message.kind !== 'giftEvent' || message.giftCoins <= 0) return
    this.add(message, { kills: 0, deaths: 0, giftCoins: message.giftCoins })
  }

  /** Delta yang belum dikonfirmasi server, urut kemunculan pertama. */
  pending(): PlayerProgress[] {
    return [...this.rows.values()].map((row) => ({ ...row }))
  }

  /**
   * Menyerahkan delta dan langsung membuangnya, tanpa menunggu konfirmasi.
   *
   * Untuk `sendBeacon` saja: pengiriman terakhir sebuah sesi tidak punya kesempatan kedua,
   * jadi menahannya untuk retry yang tidak akan pernah datang hanya menyisakan sampah.
   */
  take(): PlayerProgress[] {
    const entries = this.pending()
    this.rows.clear()
    return entries
  }

  /**
   * Mengirim delta tertahan; membuang pembukuannya HANYA bila server menjawab OK.
   *
   * Delta dikeluarkan dari pembukuan SEBELUM dikirim, supaya gift yang datang selama
   * pengiriman tidak ikut terbuang saat jawabannya tiba. Yang gagal dikembalikan lewat `add`,
   * jadi ia menyatu dengan apa pun yang menumpuk sementara itu.
   *
   * Ini melunakkan keputusan P6 ("tidak ada antrean retry") tanpa membatalkannya: tidak ada
   * penjadwalan ulang dan tidak ada penyimpanan ke disk — hanya angka yang belum dikonfirmasi
   * tidak dibuang. Tanpa itu satu hiccup jaringan membuang 30 detik siaran diam-diam.
   */
  async flush(): Promise<void> {
    if (this.sending) return
    const entries = this.take()
    if (entries.length === 0) return

    this.sending = true
    try {
      const ok = await this.send(entries)
      if (!ok) for (const entry of entries) this.add(entry, entry)
    } finally {
      this.sending = false
    }
  }

  private add(actor: ActorIdentity, delta: Delta): void {
    if (isSyntheticPlatform(actor.platform)) return
    const key = fighterKey(actor)
    const row = this.rows.get(key)
    if (row === undefined) {
      this.rows.set(key, {
        platform: 'tiktok',
        username: actor.username,
        avatarUrl: actor.avatarUrl,
        kills: delta.kills,
        deaths: delta.deaths,
        giftCoins: delta.giftCoins,
      })
      return
    }
    row.kills += delta.kills
    row.deaths += delta.deaths
    row.giftCoins += delta.giftCoins
    // Avatar yang datang belakangan mengisi yang tadinya kosong, tidak pernah menimpanya
    // dengan null — aturan yang sama dengan `coalesce` di sisi SQL.
    if (row.avatarUrl === null) row.avatarUrl = actor.avatarUrl
  }
}
