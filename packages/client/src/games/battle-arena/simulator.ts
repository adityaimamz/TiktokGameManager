import { GIFT_SEED, createChatMessage } from '@lga/shared'
import type { ChatMessage, ChatPlatform } from '@lga/shared'
import type { Clock } from '../../framework/clock.js'
import type { Rng } from '../../framework/rng.js'
import type { ChatSource } from '../../platform/chat/source.js'
import type { BattleArenaConfig } from './config/index.js'

/**
 * Laju rata-rata viewer sintetis yang masuk selagi arena masih lapang.
 *
 * Req 18 AC3 menyebut sepuluh per detik; itu laju "isi arena secepat mungkin", dan di layar
 * terbaca seperti bot yang dituang dari ember. Tiga per detik masih membuka lobi dalam
 * sekejap — satu fighter per sisi sudah cukup — sementara sisanya berdatangan sepanjang
 * ronde, seperti penonton yang memang berdatangan.
 */
export const SIMULATOR_JOIN_RATE_PER_SEC = 3

/** Jeda sebelum viewer sintetis yang mati masuk kembali (Req 18 AC6). */
export const REJOIN_DELAY_MIN_MS = 2000
export const REJOIN_DELAY_MAX_MS = 10_000

/**
 * Pengali acak atas jeda rata-rata tiap aliran.
 *
 * Anggaran yang bertambah rata per detik menghasilkan kadens metronom — satu komentar tepat
 * tiap 1,7 detik terbaca sebagai bot, bukan sebagai penonton. Chat sungguhan datang
 * bergerombol lalu diam sejenak, dan rentang inilah yang menirukannya.
 *
 * Rata-ratanya TEPAT 1,0 — kalau tidak, setiap laju di panel setelan berbohong: "0,6 komentar
 * per detik" harus benar-benar menghasilkan 0,6 komentar per detik dalam jangka panjang.
 */
const JITTER_MIN = 0.25
const JITTER_MAX = 1.75

const USERNAME_ALPHABET = [...'abcdefghijklmnopqrstuvwxyz0123456789']

/**
 * Perbendaharaan komentar penonton sintetis.
 *
 * TIDAK boleh memuat kata satu huruf: keyword sisi bawaan adalah "a" dan "b", dan
 * `matchesSide` mencocokkan per KATA — satu "a" nyasar di sini akan diam-diam menjadikan
 * obrolan biasa sebuah perintah bergabung. `simulator.test.ts` yang menjaganya.
 */
export const CHATTER_SEED: readonly string[] = [
  'halo semua',
  'hadir bang',
  'izin nonton ya',
  'baru masuk nih',
  'salam dari bandung',
  'salam dari surabaya',
  'apa kabar semua',
  'wah seru banget',
  'gas terus',
  'gaskeun',
  'ayo semangat',
  'semangat terus kakak',
  'mantap kali',
  'mantul',
  'keren banget efeknya',
  'sumpah keren',
  'widih rame banget',
  'makin panas nih',
  'tegang nih',
  'ngeri juga ya',
  'wkwkwk parah',
  'lucu banget sih',
  'auto menang nih',
  'yah kalah lagi',
  'aduh kalah tipis',
  'sabar bang',
  'seru parah',
  'ini game apa sih',
  'cara mainnya gimana',
  'kok bisa gitu',
  'tim mana yang menang',
  'bagi tips dong',
  'next round dong',
  'yang tadi keren',
  'boleh diulang dong',
  'live tiap hari kah',
  'besok live jam berapa',
  'follow balik dong',
  'udah follow ya',
  'suaranya kecil bang',
  'nonton sambil rebahan',
  'lagi hujan disini',
  'sambil makan nih',
  'up terus biar rame',
]

/** Aliran kejadian yang dijadwalkan terpisah, masing-masing dengan jitter sendiri. */
type Stream = 'join' | 'chatter' | 'like' | 'gift'
const STREAMS: readonly Stream[] = ['join', 'chatter', 'like', 'gift']

export interface SimulatorOptions {
  rng: Rng
  clock: Clock
  getConfig: () => BattleArenaConfig
}

interface PendingRejoin {
  username: string
  dueAtMs: number
}

/**
 * Viewer sintetis yang melewati pipeline identik dengan viewer sungguhan.
 *
 * Pembangkitan event terjadi di klien, bukan di server, supaya arena penuh tidak menghasilkan
 * ribuan pesan WebSocket per detik.
 *
 * Ia TIDAK pernah diam selama tersambung. Arena yang sudah penuh hanya menutup aliran join;
 * obrolan, like, dan gift terus berjalan — persis seperti live sungguhan, yang penontonnya
 * tidak berhenti bicara hanya karena tidak ada lagi tempat di arena.
 */
export class BattleArenaSimulator implements ChatSource {
  readonly id = 'battle-arena-simulator'
  readonly platform: ChatPlatform = 'demo'

  private emit: ((message: ChatMessage) => void) | null = null
  private nextMessageId = 0
  private readonly nextAt: Record<Stream, number> = { join: 0, chatter: 0, like: 0, gift: 0 }
  private readonly joined: string[] = []
  private readonly usedNames = new Set<string>()
  private rejoins: PendingRejoin[] = []

  constructor(private readonly opts: SimulatorOptions) {}

  get isRunning(): boolean {
    return this.emit !== null
  }

  get joinedUsernames(): readonly string[] {
    return this.joined
  }

  connect(emit: (message: ChatMessage) => void): void {
    this.emit = emit
    const now = this.opts.clock.now()
    // Jatuh tempo di detik ini juga, bukan `now + jeda`: menekan Start tidak boleh diikuti
    // beberapa detik senyap.
    for (const stream of STREAMS) this.nextAt[stream] = now
  }

  /** Berhenti dalam satu detik sesuai Req 18 AC5 — di sini bahkan seketika. */
  disconnect(): void {
    this.emit = null
    this.rejoins = []
  }

  /** Menjadwalkan viewer sintetis yang mati untuk masuk kembali (Req 18 AC6). */
  scheduleRejoin(username: string): void {
    const delay = this.opts.rng.range(REJOIN_DELAY_MIN_MS, REJOIN_DELAY_MAX_MS)
    this.rejoins.push({ username, dueAtMs: this.opts.clock.now() + delay })
  }

  /**
   * Satu langkah pembangkitan event — paling banyak satu per aliran.
   *
   * `activeDemoFighters` datang dari pemanggil, bukan dari state game — simulator tidak
   * boleh tahu apa pun tentang arena selain berapa banyak viewer sintetisnya masih di dalam.
   */
  update(activeDemoFighters: number): void {
    if (this.emit === null) return

    const now = this.opts.clock.now()
    const config = this.opts.getConfig()
    // Plafonnya kapasitas arena, bukan sebuah preset: tiap komentar join yang terkirim harus
    // berujung pada satu fighter, kalau tidak chat dan arena bercerita berbeda.
    const capacity = config.gameplay.maxFightersPerSide * 2

    if (this.due('join', SIMULATOR_JOIN_RATE_PER_SEC, now) && activeDemoFighters < capacity) {
      const username = this.makeUsername()
      this.joined.push(username)
      // Kolam pengirim komentar, like, dan gift dibatasi sebesar arena; sesi looping kalau
      // tidak menumpuk nama yang tidak punya blob di layar.
      if (this.joined.length > capacity) this.joined.shift()
      this.send(this.joinMessage(username, config))
    }

    this.emitRejoins(now, config)

    if (this.due('chatter', config.simulation.commentsPerSecond, now)) {
      this.send(
        createChatMessage({
          id: this.nextId(),
          kind: 'textMessageEvent',
          platform: this.platform,
          username: this.pickViewer(),
          timestampMs: now,
          text: this.opts.rng.pick(CHATTER_SEED),
        }),
      )
    }

    if (this.joined.length > 0 && this.due('like', config.simulation.likesPerSecond, now)) {
      this.send(
        createChatMessage({
          id: this.nextId(),
          kind: 'likeEvent',
          platform: this.platform,
          username: this.pickViewer(),
          timestampMs: now,
          likeCount: this.opts.rng.int(1, 6),
        }),
      )
    }

    if (this.joined.length > 0 && this.due('gift', config.simulation.giftsPerSecond, now)) {
      const gift = this.opts.rng.pick(GIFT_SEED)
      const giftCount = this.opts.rng.int(1, 4)
      this.send(
        createChatMessage({
          id: this.nextId(),
          kind: 'giftEvent',
          platform: this.platform,
          username: this.pickViewer(),
          timestampMs: now,
          giftName: gift.name,
          giftCount,
          giftCoins: gift.coins * giftCount,
        }),
      )
    }
  }

  /**
   * true bila giliran aliran ini tiba; sekaligus menjadwalkan giliran berikutnya.
   *
   * Jadwal berikutnya dihitung dari SEKARANG, bukan dari jatuh temponya, supaya tab yang
   * sempat tertidur tidak memuntahkan seluruh antrean tertunggak sekaligus.
   */
  private due(stream: Stream, perSecond: number, now: number): boolean {
    if (perSecond <= 0) {
      // Laju yang dimatikan lalu dinyalakan lagi lewat panel setelan harus bisa hidup
      // kembali, jadi jadwalnya disetel ulang alih-alih dibekukan selamanya.
      this.nextAt[stream] = now
      return false
    }
    if (this.nextAt[stream] > now) return false
    const meanMs = 1000 / perSecond
    this.nextAt[stream] = now + meanMs * this.opts.rng.range(JITTER_MIN, JITTER_MAX)
    return true
  }

  private emitRejoins(now: number, config: BattleArenaConfig): void {
    const due = this.rejoins.filter((entry) => entry.dueAtMs <= now)
    if (due.length === 0) return
    this.rejoins = this.rejoins.filter((entry) => entry.dueAtMs > now)
    for (const entry of due) this.send(this.joinMessage(entry.username, config))
  }

  private joinMessage(username: string, config: BattleArenaConfig): ChatMessage {
    const side = this.opts.rng.next() < 0.5 ? 'a' : 'b'
    return createChatMessage({
      id: this.nextId(),
      kind: 'textMessageEvent',
      platform: this.platform,
      username,
      timestampMs: this.opts.clock.now(),
      text: config.sides[side].keyword,
    })
  }

  /** Penonton yang sudah dikenal; sebelum ada satu pun, seorang penonton baru yang lewat. */
  private pickViewer(): string {
    return this.joined.length === 0 ? this.makeUsername() : this.opts.rng.pick(this.joined)
  }

  /** Tiga sampai enam belas karakter alfanumerik, unik sepanjang sesi (Req 18 AC1). */
  private makeUsername(): string {
    for (let attempt = 0; attempt < 8; attempt++) {
      const length = this.opts.rng.int(3, 17)
      let name = ''
      for (let i = 0; i < length; i++) name += this.opts.rng.pick(USERNAME_ALPHABET)
      if (!this.usedNames.has(name)) {
        this.usedNames.add(name)
        return name
      }
    }
    // Sangat jarang: tabrakan berulang. Tempel angka agar tetap unik dan tetap alfanumerik.
    let fallback = `v${this.usedNames.size}`
    while (this.usedNames.has(fallback)) fallback = `${fallback}0`
    this.usedNames.add(fallback)
    return fallback.slice(0, 16)
  }

  private nextId(): string {
    return `demo-${this.nextMessageId++}`
  }

  private send(message: ChatMessage): void {
    this.emit?.(message)
  }
}
