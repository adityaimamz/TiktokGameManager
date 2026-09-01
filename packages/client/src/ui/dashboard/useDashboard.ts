import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SnapshotHistory, createChatMessage, idleStatus } from '@lga/shared'
import type { ConnectionStatus, MatchSummary, PlayerStats } from '@lga/shared'
import type { BattleArenaConfig } from '../../games/battle-arena/config/index.js'
import { activeSides } from '../../games/battle-arena/types.js'
import type { SideId } from '../../games/battle-arena/types.js'
import { createPersistence } from '../../platform/persistence/index.js'
import { serverBaseUrl } from '../../platform/server-url.js'
import { apiFetch } from '../../platform/app-key.js'
import type { BattleAction } from '../../games/battle-arena/actions.js'
import { matchStateFromIndex } from '../../games/battle-arena/snapshot.js'
import type { RosterEntry, SessionGifter } from '../../games/battle-arena/snapshot.js'
import type { MatchState } from '../../games/battle-arena/state-machine.js'
import {
  GIFT_FEED_MAX,
  GIFT_FEED_TTL_MS,
  JOIN_FEED_MAX,
  JOIN_FEED_TTL_MS,
  KILL_FEED_MAX,
  KILL_FEED_TTL_MS,
  pushFeed,
} from '../../games/battle-arena/renderer/hud/feed.js'
import type {
  GiftFeedEntry,
  JoinFeedEntry,
  KillFeedEntry,
} from '../../games/battle-arena/renderer/hud/feed.js'
import { createAlertWatcher } from '../../platform/media/alerts.js'
import { createCommentReader } from '../../platform/speech/index.js'
import { browserSpeech } from '../speech/voices.js'
import type { SpeechAdapter, SpeechVoiceOption } from '../speech/voices.js'
import { cueFromEntry, stopMusicCue } from '../../platform/signals/index.js'
import type { CatalogEntry, MediaCue } from '../../platform/signals/index.js'
import { bannerFromCue, emptyQueue, expireBanner, pushBanner } from '../media/cue-queue.js'
import type { BannerItem } from '../media/cue-queue.js'
import { createConfigPusher, loadConfig, pullConfigDefault, saveConfig } from './config-store.js'
import { createMediaPusher, loadMedia, pullMediaDefault, saveMedia } from './media-store.js'
import type { MediaState } from './media-store.js'
import { connectionNotice, markAllRead, matchNotice, pushNotification } from './notification-list.js'
import type { NotificationEntry, NotificationKind } from './notification-list.js'
import { setUploadErrorHandler } from './upload.js'
import {
  chatLogEntry,
  chatRateBars,
  chatRateLabel,
  pruneTimestamps,
  pushChatLog,
} from './sections/chat-log.js'
import type { ChatLogEntry } from './sections/chat-log.js'
import { pushGifter } from './sections/gifter-list.js'
import type { GifterEntry } from './sections/gifter-list.js'
import { randomCaster, testActionBatch } from './sections/test-actions.js'
import type { TestActionId } from './sections/test-actions.js'
import { createRig } from './rig.js'
import type { Rig } from './rig.js'

/** Jarak antar-flush statistik siaran ke server. */
const PROGRESS_FLUSH_MS = 30_000

export interface DashboardActions {
  connect: (username: string) => void
  disconnect: () => void
  toggleSimulator: () => void
  togglePause: () => void
  restart: () => void
  endSession: () => void
  sendMessage: (text: string) => void
  reset: () => void
  /** Dipakai kartu legend yang bisa diklik di Live Preview. */
  fire: (action: BattleAction) => void
  fireTest: (id: TestActionId) => void
  toggleMute: () => void
  /** Papan gifter sepanjang masa dari Neon — dimuat saat tab Top dibuka, bukan tiap render. */
  loadTopGifters: () => void
  /** Riwayat match + papan pembunuh, dimuat bersama saat tab Statistik dibuka. */
  loadMatchStats: () => void
  /** Menembakkan satu cue soundboard ke overlay — dan ke preview dashboard sendiri. */
  fireCue: (entry: CatalogEntry) => void
  stopMusic: () => void
  /** Satu knop volume untuk seluruh kanal musik; berlaku ke trek yang sedang berputar. */
  setMusicVolume: (volume: number) => void
  /** Menandai seluruh notifikasi terbaca — dipanggil saat dropdown lonceng dibuka. */
  readNotifications: () => void
  /** Mengirim statistik siaran yang belum tersimpan. Ditunggu sebelum meninggalkan ruang kendali. */
  flushProgress: () => Promise<void>
}

export interface DashboardOptions {
  /** Diinjeksi di test; produksi memakai `browserSpeech()`. */
  speech?: SpeechAdapter
}

export interface DashboardModel {
  config: BattleArenaConfig
  setConfig: (config: BattleArenaConfig) => void
  /** Menulis paksa config yang masih tertunda di debounce — dipakai saat tab akan ditutup. */
  flushConfig: () => void
  history: SnapshotHistory
  version: number
  roster: ReadonlyMap<number, RosterEntry>
  /** Lima penyumbang terbesar SESI, dari payload roster yang sama dengan yang dikirim ke overlay. */
  sessionTopGifters: readonly SessionGifter[]
  kills: KillFeedEntry[]
  joins: JoinFeedEntry[]
  gifts: GiftFeedEntry[]
  connection: ConnectionStatus
  chat: ChatLogEntry[]
  /** Gifter sesi ini, diakumulasi dari langganan chat. */
  gifters: GifterEntry[]
  /** Papan gifter sepanjang masa, kosong sampai tab Top pernah dibuka. */
  topGifters: PlayerStats[]
  /** Riwayat match, kosong sampai tab Statistik pernah dibuka. */
  matchHistory: MatchSummary[]
  /** Papan pembunuh sepanjang masa, kosong sampai tab Statistik pernah dibuka. */
  topKillers: PlayerStats[]
  /** Katalog soundboard + rule alert, dari localStorage. */
  media: MediaState
  setMedia: (next: MediaState) => void
  /**
   * Id trek musik yang sedang berputar, atau null saat sunyi.
   *
   * Id, bukan entri: katalognya sudah ada di `media.cues`, dan dua salinan entri yang sama
   * pasti berbeda begitu creator mengganti labelnya.
   */
  playingMusicId: string | null
  /** Banner yang sedang tampil di preview. Overlay punya antreannya sendiri. */
  banner: BannerItem | null
  notifications: NotificationEntry[]
  /** Voice yang tersedia di browser ini; kosong sampai `voiceschanged` datang. */
  voices: readonly SpeechVoiceOption[]
  /** Overlay jauh yang terhubung. Dari server, lewat kanal ws. */
  overlays: number
  /** Alamat server dari sudut pandang device lain, kosong saat server tidak menjawab. */
  lanUrls: readonly string[]
  /** Kunci yang berlaku di tab ini; ikut dicetak di link overlay saat ada. */
  appKey: string | null
  chatRate: string
  /** Bentuk laju chat semenit terakhir, 0–1 per ember. */
  chatBars: number[]
  comments: number
  joinedFighters: number
  sessionStartedAtMs: number
  simulatorOn: boolean
  paused: boolean
  muted: boolean
  matchState: MatchState
  /** Dititipkan ke render loop milik Stage lewat onBeforeDraw. */
  advance: () => void
  getAlpha: () => number
  actions: DashboardActions
}

export function useDashboard(options: DashboardOptions = {}): DashboardModel {
  // Satu PersistenceStore untuk seluruh umur dashboard. `local` menyimpan config —
  // localStorage bila ada, null saat tidak (test node), keduanya sah. `server` menjawab
  // papan gifter sepanjang masa.
  const persistence = useRef(createPersistence({})).current
  const store = persistence.local
  const [config, setConfigState] = useState<BattleArenaConfig>(() => loadConfig(store))
  // Sinkron config terus-menerus lintas device — lihat `pullSharedDefault`/`createSharedConfigPusher`.
  // Debounce hidup di dalam pusher, bukan di sini: sama alasan `LocalStore` men-debounce
  // tulisan localStorage-nya sendiri.
  const configPusher = useRef(createConfigPusher(persistence.server)).current
  const mediaPusher = useRef(createMediaPusher(persistence.server)).current

  const history = useRef(new SnapshotHistory()).current
  const lastDrawn = useRef<Float32Array | null>(null)
  const alpha = useRef(0)
  const paused = useRef(false)
  const seq = useRef(0)
  const chatTimes = useRef<number[]>([])
  const sessionStartedAtMs = useRef(Date.now()).current

  const [version, setVersion] = useState(0)
  const [roster, setRoster] = useState<ReadonlyMap<number, RosterEntry>>(new Map())
  const [sessionTopGifters, setSessionTopGifters] = useState<SessionGifter[]>([])
  const [kills, setKills] = useState<KillFeedEntry[]>([])
  const [joins, setJoins] = useState<JoinFeedEntry[]>([])
  const [gifts, setGifts] = useState<GiftFeedEntry[]>([])
  const [connection, setConnection] = useState<ConnectionStatus>(idleStatus)
  const [chat, setChat] = useState<ChatLogEntry[]>([])
  const [gifters, setGifters] = useState<GifterEntry[]>([])
  const [topGifters, setTopGifters] = useState<PlayerStats[]>([])
  const [matchHistory, setMatchHistory] = useState<MatchSummary[]>([])
  const [topKillers, setTopKillers] = useState<PlayerStats[]>([])
  const [comments, setComments] = useState(0)
  const [joinedFighters, setJoinedFighters] = useState(0)
  const [simulatorOn, setSimulatorOn] = useState(false)
  const [pausedState, setPausedState] = useState(false)
  const [muted, setMuted] = useState(false)
  const [media, setMediaState] = useState<MediaState>(() => loadMedia(store))
  const [banners, setBanners] = useState(emptyQueue)
  const [notifications, setNotifications] = useState<NotificationEntry[]>([])
  const [voices, setVoices] = useState<readonly SpeechVoiceOption[]>([])
  const [overlays, setOverlays] = useState(0)
  const [lanUrls, setLanUrls] = useState<readonly string[]>([])
  const [appKey, setAppKey] = useState<string | null>(null)

  const noteSeq = useRef(0)
  const speech = useRef(options.speech ?? browserSpeech()).current
  const connectionRef = useRef<ConnectionStatus>(idleStatus())
  const lastMatchState = useRef<MatchState>('waitingFighters')
  const mutedRef = useRef(false)
  mutedRef.current = muted

  const notify = useCallback((kind: NotificationKind, text: string) => {
    setNotifications((list) =>
      pushNotification(list, {
        id: `note-${noteSeq.current++}`,
        kind,
        text,
        atMs: Date.now(),
        read: false,
      }),
    )
  }, [])

  // Watcher membaca rule lewat ref, bukan lewat closure: langganan chat dipasang sekali di
  // effect bermounting-sekali, dan rule yang diedit creator harus berlaku tanpa memasang
  // ulang seluruh rig.
  const mediaRef = useRef(media)
  mediaRef.current = media
  const watcher = useRef(
    createAlertWatcher({
      getRules: () => mediaRef.current.alerts,
      getCues: () => mediaRef.current.cues,
    }),
  ).current
  const reader = useRef(
    createCommentReader({ getSettings: () => mediaRef.current.reader }),
  ).current

  /**
   * Rig dibuat DI DALAM effect, bukan di useMemo.
   *
   * `host.dispose()` menutup BroadcastChannel untuk selamanya. StrictMode di mode dev
   * menjalankan effect mount → cleanup → mount, jadi rig hasil useMemo akan dipakai lagi
   * setelah dibuang: `host.start()` melempar "BroadcastChannel is closed", React membongkar
   * seluruh pohon, dan halaman jadi putih kosong. Pembuatan, langganan, dan penghancuran
   * harus berpasangan di effect yang SAMA supaya tiap mount memulai dari rig yang segar.
   *
   * Daftar dependensi sengaja kosong: config berubah lewat `host.setConfig()`, bukan dengan
   * membangun ulang seluruh rig — kalau tidak, mengganti preset simulator akan memulai
   * ulang pertandingan.
   */
  const rigRef = useRef<Rig | null>(null)

  /**
   * Cue musik terakhir yang ditembakkan, supaya slider volume punya sesuatu untuk ditembak
   * ulang.
   *
   * Tanpa ini, menggeser slider hanya menyimpan angka, dan volumenya baru berlaku pada trek
   * BERIKUTNYA — yang tidak terasa seperti volume sama sekali.
   */
  const playingMusic = useRef<CatalogEntry | null>(null)
  /*
   * Id-nya juga sebagai STATE, karena ref tidak pernah merender ulang apa pun.
   *
   * Ref-nya tetap: `setMusicVolume` membacanya di dalam callback, tempat state yang baru
   * di-set masih memegang nilai lama. Yang disimpan di state cuma id — entri utuhnya sudah
   * ada di katalog, dan menyalinnya ke dua tempat berarti dua salinan yang bisa berbeda.
   */
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null)
  const rememberMusic = (entry: CatalogEntry | null): void => {
    playingMusic.current = entry
    setPlayingMusicId(entry?.id ?? null)
  }

  /**
   * Cue media: disiarkan ke overlay DAN dibunyikan di tab ini.
   *
   * Yang kedua bukan kemewahan — tanpa itu soundboard dan musik hanya terdengar di tab
   * overlay, yang creator belum tentu membukanya, jadi menekan tombolnya terasa seperti
   * tidak melakukan apa-apa. Aturan yang sama sudah dipegang bunyi ultimate di `rig.ts`,
   * termasuk tunduknya salinan lokal pada tombol mute — itu jawabannya kalau OBS menangkap
   * desktop audio sehingga keduanya terdengar dobel.
   *
   * Perintah "hentikan musik" (`url: null`) sengaja LOLOS dari saringan mute: menghentikan
   * sesuatu tidak pernah menambah bunyi, dan musik yang menyala sebelum mute harus tetap
   * bisa dimatikan.
   */
  const publishCue = useCallback((cue: MediaCue) => {
    const rig = rigRef.current
    rig?.signals.publishMedia(cue)
    if (rig !== null && (!mutedRef.current || cue.url === null)) rig.localCues.play(cue)
    const banner = bannerFromCue(cue)
    if (banner !== null) setBanners((queue) => pushBanner(queue, banner, Date.now()))
  }, [])

  useEffect(() => {
    const rig = createRig(config, {
      onStatus: (status) => {
        const note = connectionNotice(connectionRef.current.state, status)
        if (note !== null) notify('connection', note)
        connectionRef.current = status
        setConnection(status)
      },
      onEvent: (event) => {
        if (event.type === 'fighterJoined' && event.outcome === 'joined') {
          setJoinedFighters((count) => count + 1)
        }
      },
      onOverlays: setOverlays,
    })
    rigRef.current = rig
    setAppKey(rig.appKey)

    rig.host.start()
    rig.chat.start()

    // 30 detik: cukup cepat supaya papan Top terasa "langsung" oleh creator yang baru saja
    // melihat gift masuk, cukup jarang supaya siaran dua jam tetap 240 request. Flush tanpa
    // delta tidak menyentuh jaringan sama sekali.
    const progressTimer = setInterval(() => {
      void rig.ledger.flush()
    }, PROGRESS_FLUSH_MS)

    // `pagehide`, bukan `beforeunload`: `fetch` yang dimulai saat unload dibatalkan browser,
    // dan menutup tab adalah cara paling umum sebuah siaran berakhir.
    const beacon = (): void => rig.persistence.server.beaconProgress(rig.ledger.take())
    window.addEventListener('pagehide', beacon)

    const offs = [
      rig.signals.onFeed((entry) => {
        const now = Date.now()
        if (entry.kind === 'kill')
          setKills((list) => pushFeed(list, entry, now, KILL_FEED_MAX, KILL_FEED_TTL_MS))
        else if (entry.kind === 'gift')
          setGifts((list) => pushFeed(list, entry, now, GIFT_FEED_MAX, GIFT_FEED_TTL_MS))
        else setJoins((list) => pushFeed(list, entry, now, JOIN_FEED_MAX, JOIN_FEED_TTL_MS))
      }),
      rig.chat.subscribe((message) => {
        const now = Date.now()
        chatTimes.current = [...pruneTimestamps(chatTimes.current, now), now]
        setChat((list) => pushChatLog(list, chatLogEntry(message)))
        setGifters((list) => pushGifter(list, message))
        if (message.kind === 'textMessageEvent') setComments((count) => count + 1)
        const alert = watcher.onMessage(message)
        if (alert !== null) {
          publishCue(alert)
          // Gift besar, milestone, dan follower masuk lewat alert — bukan lewat cabangnya
          // sendiri. Menyalin ambangnya ke sisi notifikasi berarti dua ambang yang menyimpang.
          if (alert.text !== '') notify('alert', alert.text)
        }

        const spoken = reader.onMessage(message)
        if (spoken !== null && !mutedRef.current) speech.speak(spoken, mediaRef.current.reader)
      }),
    ]

    return () => {
      offs.forEach((off) => off())
      clearInterval(progressTimer)
      window.removeEventListener('pagehide', beacon)
      // Sisa terakhir ikut lewat beacon: unmount berarti rig dibongkar, dan `fetch` yang
      // dimulai sekarang belum tentu sempat selesai.
      beacon()
      rig.chat.stop()
      rig.host.dispose()
      rig.audio.dispose()
      // Musik berulang tanpa batas: rig yang dibuang tanpa ini akan terus berbunyi di
      // belakang rig penggantinya — persis yang terjadi tiap mount ganda StrictMode.
      rig.localCues.stopAll()
      if (rigRef.current === rig) rigRef.current = null
      lastDrawn.current = null
    }
  }, [])

  // Chrome memuat daftar voice secara asinkron; sekali baca saat mount menghasilkan dropdown
  // kosong yang tidak pernah terisi.
  useEffect(() => {
    const sync = (): void => setVoices(speech.voices())
    sync()
    return speech.onVoicesChanged(sync)
  }, [speech])

  // Alamat LAN dibaca sekali saat dashboard dibuka. Antarmuka jaringan yang berubah di
  // tengah sesi berarti creator memuat ulang tab — kasus yang tidak layak dibayar polling.
  useEffect(() => {
    void persistence.server.health().then(setLanUrls)
  }, [persistence])

  // Config lintas device disinkronkan TERUS-MENERUS, bukan sekali — lihat `pullSharedDefault`.
  // Device manapun yang terakhir mengedit menang: begitu server punya default, device ini
  // mengadopsinya meski localStorage-nya sendiri sudah punya sesuatu.
  useEffect(() => {
    void pullConfigDefault(store, persistence.server, (next) => {
      setConfigState(next)
      rigRef.current?.host.setConfig(next)
    })
    void pullMediaDefault(store, persistence.server, setMediaState)
  }, [store, persistence])

  // Satu handler untuk kedua pengunggah — lihat catatan di `upload.ts`.
  useEffect(() => {
    setUploadErrorHandler((text) => notify('error', text))
    return () => setUploadErrorHandler(null)
  }, [notify])

  /*
   * AudioContext lahir `suspended`; browser menolak membunyikan apa pun sebelum ada gestur.
   * Satu listener sekali-pakai sudah cukup, dan tanpa ini seluruh panel Sound terlihat
   * bekerja sempurna sambil senyap total.
   */
  useEffect(() => {
    const resume = (): void => {
      void rigRef.current?.audio.resume()
    }
    window.addEventListener('pointerdown', resume, { once: true })
    return () => window.removeEventListener('pointerdown', resume)
  }, [])

  /**
   * Satu langkah dunia, dititipkan ke render loop milik Stage lewat `onBeforeDraw`.
   *
   * Urutannya penting: simulator lebih dulu supaya pesan join yang ia hasilkan sempat masuk
   * antrean sebelum engine memprosesnya di frame yang sama.
   *
   * Pause bekerja DI SINI dan bukan di state machine: overlay membeku di snapshot terakhir
   * yang ia terima, yang memang tampilan "paused" yang benar, tanpa satu float tambahan pun
   * di header snapshot.
   */
  const advance = useCallback(() => {
    // Frame bisa tiba sebelum effect memasang rig, atau setelah cleanup melepasnya.
    const rig = rigRef.current
    if (rig === null || paused.current) return

    const state = rig.host.engine.getState()
    if (rig.simulator.isRunning) {
      // Selama gladi berjalan tidak ada mode idle: apa pun yang menjatuhkan sesi ke sana —
      // match yang tuntas, Restart, End Session — langsung dibuka lagi. Idle baru berlaku
      // setelah creator menghentikan simulatornya sendiri.
      if (rig.host.engine.matchState === 'idle') rig.host.engine.start()
      const active = activeSides(config.gameplay.sideCount)
      const demoCount = active.reduce(
        (sum, side) => sum + state.fighters.countOnSide(side, { platform: 'demo' }),
        0,
      )
      rig.simulator.update(demoCount)
    }

    // Kedaluwarsa banner menumpang frame yang sudah ada. `expireBanner` mengembalikan state
    // yang sama saat belum waktunya, jadi ini tidak merender ulang apa pun tiap frame.
    setBanners((queue) => expireBanner(queue, Date.now()))

    alpha.current = rig.host.frame()

    const snapshot = rig.host.lastSnapshot
    if (snapshot !== null && snapshot !== lastDrawn.current) {
      lastDrawn.current = snapshot
      history.push(snapshot)
      setRoster(new Map(rig.host.currentRoster))
      setSessionTopGifters([...rig.host.currentTopGifters])
      setVersion((value) => value + 1)

      const nextState = matchStateFromIndex(history.current.header.matchState)
      if (nextState !== lastMatchState.current) {
        const note = matchNotice(nextState)
        if (note !== null) notify('match', note)
        lastMatchState.current = nextState
      }
    }
  }, [config.gameplay.sideCount, history, notify])

  const setConfig = useCallback(
    (next: BattleArenaConfig) => {
      setConfigState(next)
      saveConfig(store, next)
      configPusher.push(next)
      rigRef.current?.host.setConfig(next)
    },
    [store, configPusher],
  )

  const setMedia = useCallback(
    (next: MediaState) => {
      setMediaState(next)
      saveMedia(store, next)
      mediaPusher.push(next)
    },
    [store, mediaPusher],
  )

  // Menulis paksa localStorage DAN mengirim paksa push server yang masih tertunda di
  // debounce — dipakai saat tab akan ditutup, sama alasan `store.flush()` ada.
  const flushConfig = useCallback(() => {
    store.flush()
    void configPusher.flush()
    void mediaPusher.flush()
  }, [store, configPusher, mediaPusher])

  /** 401 = kunci hilang atau salah; buka dashboard sekali dengan `?k=APP_KEY`. */
  const httpError = (status: number): string =>
    status === 401
      ? 'ditolak server (401) — buka dashboard dengan ?k=APP_KEY'
      : `server menjawab ${status}`

  const actions = useMemo<DashboardActions>(
    () => ({
      connect: (username) => {
        // Gladi bersih berakhir di sini. Sapuan fighter demo milik engine (Req 18 AC8)
        // menunggu penonton sungguhan PERTAMA, dan simulator yang masih terdaftar akan
        // mengisi ulang barisannya jauh sebelum komentar itu datang — jadi sapuannya
        // tidak pernah bertahan kalau rehearsal tidak dihentikan lebih dulu.
        // `removeSource` tidak mengeluh untuk id yang tidak terdaftar, jadi tidak perlu
        // menanyakan dulu apakah simulatornya memang menyala.
        const rig = rigRef.current
        if (rig !== null) rig.chat.removeSource(rig.simulator.id)
        setSimulatorOn(false)

        void apiFetch(`${serverBaseUrl()}/api/chat/connect`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username }),
        })
          // Badan jawaban HANYA dipercaya saat 2xx. Galat server punya bentuknya sendiri
          // (`{ error }`), dan membacanya sebagai status membuat `viewerCount` undefined —
          // itulah PENONTON NaN yang tampil bersama "unauthorized".
          .then((response) =>
            response.ok
              ? (response.json() as Promise<ConnectionStatus>)
              : { ...idleStatus(), state: 'failed' as const, error: httpError(response.status) },
          )
          .then((status: ConnectionStatus) => setConnection(status))
          .catch(() =>
            setConnection({ ...idleStatus(), state: 'failed', error: 'server unreachable' }),
          )
      },
      flushProgress: async () => {
        await rigRef.current?.ledger.flush()
      },
      disconnect: () => {
        void apiFetch(`${serverBaseUrl()}/api/chat/disconnect`, { method: 'POST' })
          .then((response) => (response.ok ? (response.json() as Promise<ConnectionStatus>) : idleStatus()))
          .then((status: ConnectionStatus) => setConnection(status))
          .catch(() => setConnection(idleStatus()))
      },
      toggleSimulator: () => {
        const rig = rigRef.current
        if (rig === null) return
        setSimulatorOn((on) => {
          if (on) rig.chat.removeSource(rig.simulator.id)
          else rig.chat.addSource(rig.simulator)
          return !on
        })
      },
      togglePause: () => {
        paused.current = !paused.current
        setPausedState(paused.current)
      },
      // Restart memanggil start() setelah reset(): reset berhenti di `idle`, dan idle hanya
      // bisa ditinggalkan lewat start(). Tanpa itu tombol ini membekukan match selamanya.
      restart: () => {
        const rig = rigRef.current
        if (rig === null) return
        rig.host.engine.reset()
        rig.host.engine.start()
        paused.current = false
        setPausedState(false)
      },
      // End Session berbeda dari Restart HANYA pada loop-nya: sesi benar-benar berhenti di
      // `idle` sampai creator memulainya lagi.
      endSession: () => {
        const rig = rigRef.current
        if (rig === null) return
        rig.host.engine.reset()
        paused.current = true
        setPausedState(true)
        // Buffer analytics tidak boleh ikut hilang saat creator menutup tab setelah ini.
        void rig.analytics.flush()
      },
      /*
       * Konektor 4a read-only: tiktok-live-connector membaca event, tidak menulis. Req 38
       * AC5 memang menyebut tombol ini bekerja "on the State_Machine or ChatEngine".
       *
       * Pesan diserahkan langsung ke engine, bukan lewat ChatEngine: `dispatch` privat dan
       * hanya sumber terdaftar yang boleh memanggilnya. Konsekuensinya, langganan chat
       * TIDAK melihat pesan ini, jadi chat log dan penghitung komentar diperbarui di sini.
       *
       * Platform 'creator', bukan 'demo': host menjadwalkan rejoin simulator untuk setiap
       * fighter 'demo' yang mati, jadi pesan uji akan lahir kembali sendiri.
       */
      sendMessage: (text) => {
        const rig = rigRef.current
        if (rig === null) return

        const message = createChatMessage({
          id: `creator-${seq.current++}`,
          kind: 'textMessageEvent',
          platform: 'creator',
          username: 'creator',
          timestampMs: Date.now(),
          text,
        })

        rig.host.engine.handleMessage(message)
        setChat((list) => pushChatLog(list, chatLogEntry(message)))
        setComments((count) => count + 1)
      },
      reset: () => rigRef.current?.host.engine.reset(),
      fire: (action) => rigRef.current?.host.engine.enqueue(action),
      fireTest: (id) => {
        const rig = rigRef.current
        if (rig === null) return

        // Ultimate uji terbit dari blob sungguhan yang dipilih acak, bukan dari tepi arena:
        // origin-nya adalah posisi caster, dan creator tidak punya fighter di sana.
        const nukeTargetSide: Partial<Record<TestActionId, SideId>> = {
          nukeA: 'a',
          nukeB: 'b',
          nukeC: 'c',
          nukeD: 'd',
        }
        const targetSide = nukeTargetSide[id]
        const caster =
          targetSide !== undefined
            ? randomCaster(targetSide, history.current, roster)
            : null

        for (const action of testActionBatch(id, config, seq.current++, caster)) {
          rig.host.engine.enqueue(action)
        }
      },
      toggleMute: () => {
        setMuted((on) => {
          rigRef.current?.audio.setMuted(!on)
          // Reader kini bunyi dashboard: mute berarti diam, bukan diam kecuali yang satu itu.
          // Musik yang sedang berputar ikut berhenti — ia berulang, jadi menunggu cue
          // berikutnya berarti mute tidak pernah benar-benar membuat tab ini sunyi. Overlay
          // TIDAK ikut berhenti: yang dimatikan adalah monitor creator, bukan siarannya.
          if (!on) {
            speech.cancel()
            rigRef.current?.localCues.stopAll()
          }
          return !on
        })
      },
      fireCue: (entry) => {
        // Musik memakai SATU knop global; `CatalogEntry.volume` sengaja diabaikan untuk kind
        // ini, supaya slider berlaku sejak tekan pertama dan bukan setelah digeser.
        const sent =
          entry.kind === 'music' ? { ...entry, volume: mediaRef.current.musicVolume } : entry
        if (entry.kind === 'music') rememberMusic(sent)
        publishCue(cueFromEntry(sent, `cue-${seq.current++}`))
      },
      stopMusic: () => {
        rememberMusic(null)
        publishCue(stopMusicCue(`cue-${seq.current++}`))
      },
      setMusicVolume: (volume) => {
        setMedia({ ...mediaRef.current, musicVolume: volume })
        const playing = playingMusic.current
        if (playing === null) return
        // Cue untuk url yang SAMA: `audio-channels` menggeser volumenya di tempat, bukan
        // memulai ulang treknya dari detik nol.
        const next = { ...playing, volume }
        rememberMusic(next)
        publishCue(cueFromEntry(next, `cue-${seq.current++}`))
      },
      readNotifications: () => setNotifications(markAllRead),
      loadTopGifters: () => {
        void persistence.server.topPlayers(20, 'coins').then(setTopGifters)
      },
      loadMatchStats: () => {
        // Satu Promise.all, bukan dua then: keduanya mengisi satu tab, dan menampilkan
        // salah satunya lebih dulu hanya membuat panel berkedip.
        void Promise.all([
          persistence.server.recentMatches(20),
          persistence.server.topPlayers(50, 'kills'),
        ]).then(([rows, killers]) => {
          setMatchHistory(rows)
          setTopKillers(killers)
        })
      },
    }),
    [config, setConfig, setMedia, persistence, history, roster, publishCue, speech],
  )

  return {
    config,
    setConfig,
    flushConfig,
    history,
    version,
    roster,
    sessionTopGifters,
    kills,
    joins,
    gifts,
    connection,
    chat,
    gifters,
    topGifters,
    matchHistory,
    topKillers,
    media,
    setMedia,
    playingMusicId,
    banner: banners.current,
    notifications,
    voices,
    overlays,
    lanUrls,
    appKey,
    chatRate: chatRateLabel(chatTimes.current, Date.now()),
    chatBars: chatRateBars(chatTimes.current, Date.now()),
    comments,
    joinedFighters,
    sessionStartedAtMs,
    simulatorOn,
    paused: pausedState,
    muted,
    matchState: history.hasData
      ? matchStateFromIndex(history.current.header.matchState)
      : 'waitingFighters',
    advance,
    getAlpha: () => alpha.current,
    actions,
  }
}
