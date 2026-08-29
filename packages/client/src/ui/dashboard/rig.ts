import type { ConnectionStatus } from '@lga/shared'
import { systemClock } from '../../framework/clock.js'
import { createRng } from '../../framework/rng.js'
import { SoundQueue } from '../../framework/sound/queue.js'
import { AudioEngine } from '../../platform/audio/audio.js'
import { ChatEngine } from '../../platform/chat/engine.js'
import { TikTokChatSource } from '../../platform/chat/tiktok-source.js'
import { createPersistence } from '../../platform/persistence/index.js'
import type { PersistenceStore } from '../../platform/persistence/index.js'
import { AnalyticsLogger } from '../../platform/analytics/logger.js'
import { browserAppKey } from '../../platform/app-key.js'
import type { MediaCue } from '../../platform/media/cues.js'
import { createAudioChannels } from '../media/audio-channels.js'
import type { AudioChannels } from '../media/audio-channels.js'
import {
  GameSignals,
  SIGNAL_TOPICS,
  SNAPSHOT_TOPIC,
  createSignalChannel,
  createWsSignalChannel,
  fanoutChannel,
  signalCodecs,
} from '../../platform/signals/index.js'
import type { BattleArenaConfig, NukeType, SoundEvent } from '../../games/battle-arena/config/index.js'
import { EVENT_SOUND_CUES, ULTIMATE_SOUND } from '../../games/battle-arena/effects.js'
import type { UltimateSoundPhase } from '../../games/battle-arena/effects.js'
import { ultimateCue } from '../../games/battle-arena/ultimate-cue.js'
import { BattleArenaHost } from '../../games/battle-arena/host.js'
import type { BattleArenaSignals } from '../../games/battle-arena/host.js'
import type { EngineEvent } from '../../games/battle-arena/events.js'
import { PracticeFighters } from '../../games/battle-arena/practice-fighters.js'
import { BattleArenaSimulator } from '../../games/battle-arena/simulator.js'
import { LiveLedger } from '../../games/battle-arena/ledger.js'
import { MatchRecorder } from '../../games/battle-arena/recorder.js'
import { toAnalyticsEvent } from '../../games/battle-arena/analytics-events.js'
import type { FeedEntry } from '../../games/battle-arena/renderer/hud/feed.js'
import type { RosterPayload } from '../../games/battle-arena/snapshot.js'

export interface Rig {
  signals: BattleArenaSignals
  host: BattleArenaHost
  simulator: BattleArenaSimulator
  chat: ChatEngine
  tiktok: TikTokChatSource
  analytics: AnalyticsLogger
  audio: AudioEngine
  /**
   * Berkas media di tab ini: bunyi ultimate, soundboard, dan musik.
   *
   * Terbuka karena cue soundboard diterbitkan dari `useDashboard`, bukan dari sini, dan
   * cue yang hanya DISIARKAN tidak terdengar oleh creator sama sekali — tab overlay-lah
   * yang membunyikannya, dan creator belum tentu membukanya.
   */
  localCues: AudioChannels
  /** Kunci yang berlaku di tab ini, supaya top bar bisa mencetaknya di link overlay. */
  appKey: string | null
  /**
   * Statistik siaran yang belum tersimpan.
   *
   * Terbuka karena TIGA tempat memanggilnya: interval di `useDashboard`, dialog
   * tinggalkan-ruang-kendali, dan handler `pagehide`.
   */
  ledger: LiveLedger
  /** Terbuka supaya `useDashboard` bisa memanggil `beaconProgress` tanpa membangun store kedua. */
  persistence: PersistenceStore
}

export interface RigHooks {
  onStatus: (status: ConnectionStatus) => void
  /** Dashboard menghitung fighter yang bergabung dari sini; recorder dan analytics tetap di dalam. */
  onEvent: (event: EngineEvent) => void
  /** Berapa overlay jauh yang server lihat. Nol berarti relay tidak mengirim satu byte pun. */
  onOverlays: (count: number) => void
}

/** Berapa bunyi ultimate boleh berjalan bersamaan sebelum `launch` mulai dijatuhkan. */
const CUE_MAX_CONCURRENT = 4

/**
 * Jarak minimum antar-bunyi tembakan.
 *
 * `attacksFired` terbit tiap tick yang ada tembakannya, dan pada ronde yang ramai itu berarti
 * tiap tick: lewat throttle 50 ms bawaan `SoundQueue` bunyinya jadi dengung datar 20 Hz, bukan
 * tembakan. Bunyi lain tetap di 50 ms, karena hit dan join memang tidak serapat itu.
 */
const ATTACK_THROTTLE_MS = 150

/** Engine, kanal siaran, sumber chat, dan penyimpanan sebagai satu paket sehidup-semati. */
export function createRig(config: BattleArenaConfig, hooks: RigHooks): Rig {
  const clock = systemClock()
  // Dibaca SEKALI di sini: `browserAppKey` juga yang menghapus `k` dari URL, dan
  // memanggilnya dua kali berarti panggilan kedua hanya menemukan sisa di localStorage.
  const appKey = browserAppKey()
  let remoteOverlays = 0
  const signals = new GameSignals<RosterPayload, BattleArenaConfig, FeedEntry>({
    // Dua penonton bisa hidup bersamaan: OBS di PC ini lewat BroadcastChannel, OBS di
    // device lain lewat WebSocket. Memilih salah satu berarti yang lain gelap.
    channel: fanoutChannel([
      createSignalChannel({
        name: 'battle-arena',
        topics: SIGNAL_TOPICS,
        codecs: signalCodecs,
      }),
      createWsSignalChannel({
        binaryTopic: SNAPSHOT_TOPIC,
        appKey,
        onOverlays: (count) => {
          // Naik dari nol berarti ada overlay jauh yang baru menyambung. Sampai detik ini
          // kanal ws MEMBUANG setiap post, jadi server tidak menahan satu pun topik keadaan
          // untuk diulang ke soket baru itu — snapshot menyusul sendiri tiap tick, config
          // tidak, karena ia hanya terbit saat start() dan saat creator mengubah setelan.
          if (count > 0 && remoteOverlays === 0) signals.republishState()
          remoteOverlays = count
          hooks.onOverlays(count)
        },
      }),
    ]),
    storage: typeof localStorage === 'undefined' ? null : localStorage,
    now: () => Date.now(),
  })
  const simulator = new BattleArenaSimulator({
    rng: createRng(1234),
    clock,
    getConfig: () => host.engine.getConfig() as BattleArenaConfig,
  })

  const persistence = createPersistence({ server: { appKey } })
  const analytics = new AnalyticsLogger({
    send: (events) => persistence.server.sendAnalytics(events),
    now: () => Date.now(),
  })
  const ledger = new LiveLedger({
    send: (entries) => persistence.server.recordProgress(entries),
  })
  const recorder = new MatchRecorder({
    getState: () => host.engine.getState(),
    now: () => Date.now(),
    submit: (record) => {
      // Urutan mengikat (spec Plan 13 §6): koin yang memicu sebuah match tidak boleh tertulis
      // SESUDAH baris match-nya. Tidak ditunggu di sisi pemanggil — ia tidak boleh menahan
      // transisi ke layar victory.
      void ledger.flush().then(() => persistence.server.recordMatch(record))
      void analytics.flush()
    },
  })

  const audio = new AudioEngine()
  const sounds = new SoundQueue({ clock, play: (id, volume) => audio.play(id, volume) })
  const attackSounds = new SoundQueue({
    clock,
    throttleMs: ATTACK_THROTTLE_MS,
    play: (id, volume) => audio.play(id, volume),
  })

  /**
   * Satu-satunya jalan cue game jadi bunyi, dan satu-satunya tempat panel SOUND dibaca.
   *
   * Config dibaca saat bunyi diminta, bukan disalin, supaya perubahan volume berlaku mulai
   * bunyi berikutnya tanpa membangun ulang rig — pola yang sama dengan `BattleArenaTriggers`.
   * `enabled: false` berhenti di sini, jadi mematikan sebuah baris benar-benar diam.
   */
  const playCue = (cue: SoundEvent): void => {
    const setting = (host.engine.getConfig() as BattleArenaConfig).sound[cue]
    if (setting?.enabled !== true) return
    const queue = cue === 'attack' ? attackSounds : sounds
    queue.request(cue, setting.volume, audio.durationMs(cue))
  }
  /** Salinan lokal bunyi ultimate. Elemen `Audio` biasa — `AudioEngine` hanya mensintesis. */
  const localCues = createAudioChannels()
  // Ultimate pertama tiap varian akan terlambat kalau berkasnya baru diunduh saat dibutuhkan.
  localCues.warm(Object.values(ULTIMATE_SOUND).flatMap((s) => [s.launch.url, s.impact.url]))

  /**
   * Bunyi ultimate: DUA fase, dijepit sekali di hulu, lalu berbunyi di dua tab.
   *
   * `launch` menandai tolakannya, `impact` menandai pendaratannya di `IMPACT_AT` — dua puncak
   * animasi yang satu one-shot tidak bisa tandai berdua. Berkas, bukan oscillator, jadi jalur
   * `onEffect` → `SoundQueue` → `AudioEngine` tidak bisa dipakai sama sekali.
   *
   * Jepitannya di SINI, tempat cue diterbitkan, bukan di overlay: menjepit di hilir berarti
   * dua penerima bisa menjatuhkan bunyi yang berbeda, dan overlay di device lain akan berbeda
   * dari yang didengar creator. `SoundQueue` yang sama dengan bunyi game — id-nya string
   * bebas, jadi URL berkas sah dipakai.
   *
   * Cue-nya disiarkan supaya tab OVERLAY membunyikannya (itu yang ditangkap OBS Browser
   * Source, termasuk saat overlay-nya di device lain) DAN diputar lagi di tab ini, karena
   * dashboard adalah tempat creator sebenarnya menguji. Salinan lokalnya tunduk pada tombol
   * mute dashboard — itu jawabannya kalau OBS menangkap desktop audio dan keduanya dobel.
   */
  const cueQueue = new SoundQueue({
    clock,
    maxConcurrent: CUE_MAX_CONCURRENT,
    throttleMs: 120,
    // Sengaja kosong: `SoundQueue` di sini HANYA penjepit konkurensi dan throttle. Pemutaran
    // sesungguhnya terjadi di dua tempat berbeda — siaran dan lokal — dan menyerahkannya ke
    // `playFn` akan menyembunyikan salah satunya.
    play: () => {},
  })
  let ultimateSeq = 0
  const playUltimate = (nukeType: NukeType, phase: UltimateSoundPhase): void => {
    const cue = ultimateCue(
      nukeType,
      phase,
      host.engine.getConfig().sound.ultimate,
      `nuke-${ultimateSeq++}`,
    )
    if (cue === null) return
    // Id-nya dari tabel, bukan `cue.url`: `MediaCue.url` boleh null (itu cara menghentikan
    // kanal musik), sementara berkas ultimate selalu ada.
    const sound = ULTIMATE_SOUND[nukeType][phase]
    /*
     * Jepitan konkurensi dibaca SENDIRI, dan hanya `launch` yang tunduk padanya.
     *
     * `SoundQueue.request()` tidak pernah menolak karena penuh — `maxConcurrent` di sana
     * cuma memangkas array pembukuannya lalu tetap memanggil `playFn`. Yang ia tolak hanya
     * permintaan yang terlalu rapat untuk id yang sama. Jadi jepitannya harus di sini.
     *
     * `impact` sengaja dikecualikan: ia jatuh bersamaan dengan ledakan yang DIGAMBAR, dan
     * ledakan bisu lebih buruk daripada panggung yang ramai. Yang dijatuhkan saat enam
     * ultimate bertumpuk adalah tolakannya, bukan pendaratannya.
     */
    if (phase === 'launch' && cueQueue.concurrentCount >= CUE_MAX_CONCURRENT) return
    if (!cueQueue.request(sound.url, cue.volume, sound.durationMs)) return
    signals.publishMedia(cue)
    if (!audio.isMuted) localCues.play(cue)
  }

  const host = new BattleArenaHost({
    clock,
    signals,
    seed: 1234,
    config,
    roster: new PracticeFighters(),
    onEffect: (effect) => {
      if (effect.soundCue !== null) playCue(effect.soundCue as SoundEvent)
    },
    onEvent: (event) => {
      ledger.onEvent(event)
      recorder.onEvent(event)
      // Empat cue — tembakan, hitung mundur, ronde, match — tidak punya efek sama sekali,
      // jadi inilah satu-satunya penerbitnya. Tabelnya di `effects.ts` supaya bisa diuji.
      const eventCue = EVENT_SOUND_CUES[event.type]
      if (eventCue !== undefined) playCue(eventCue)
      if (event.type === 'ultimateFired') playUltimate(event.nukeType, 'launch')
      if (event.type === 'ultimateImpact') playUltimate(event.nukeType, 'impact')
      const analyticsEvent = toAnalyticsEvent(event)
      if (analyticsEvent !== null) analytics.log(analyticsEvent.type, analyticsEvent.payload)
      if (event.type === 'fighterDied' && event.fighter.platform === 'demo') {
        simulator.scheduleRejoin(event.fighter.username, event.fighter.side)
      }
      hooks.onEvent(event)
    },
  })

  // Simulator sengaja BELUM didaftarkan: tombol Start yang mendaftarkannya, dan
  // ChatEngine menolak dua sumber ber-id sama.
  const chat = new ChatEngine()
  chat.subscribe((message) => host.engine.handleMessage(message))
  // Langganan KEDUA, bukan digabung ke yang di atas: ledger menghitung gift dari SETIAP
  // pengirim TikTok, termasuk yang tidak pernah mengetik keyword dan karena itu tidak punya
  // fighter untuk dititipi — `FighterRegistry.addGiftCoins` memulangkan mereka.
  chat.subscribe((message) => ledger.onMessage(message))

  // Sumber TikTok justru langsung didaftarkan DAN membuka socket-nya begitu `chat.start()`
  // dipanggil — bukan menunggu tombol Connect. Itu disengaja: server menyiarkan status
  // idle ke setiap browser yang tersambung, jadi socket-nya boleh hidup lebih dulu; yang
  // ditunggu tombol Connect hanyalah permintaan REST yang menyuruh SERVER menyambung ke
  // TikTok. Tidak ada pesan chat yang datang sebelum itu.
  const tiktok = new TikTokChatSource({ onStatus: hooks.onStatus, appKey })
  chat.addSource(tiktok)

  // Overlay yang baru lahir menyapa lewat kanal yang sama; ini jawabannya. Melayani jalur
  // BroadcastChannel — OBS di PC ini — yang tidak menahan apa pun, jadi overlay yang dibuka
  // sesudah game dinyalakan tidak punya cara lain melihat config. Yang jauh dilayani
  // `onOverlays` di atas, karena soket overlay di server hanya menerima.
  signals.onStateRequest(() => signals.republishState())

  return {
    signals,
    host,
    simulator,
    chat,
    tiktok,
    analytics,
    audio,
    localCues,
    appKey,
    ledger,
    persistence,
  }
}
