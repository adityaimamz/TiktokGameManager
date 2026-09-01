import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { SnapshotHistory } from '@lga/shared'
import { createImageCache } from '../framework/image-cache.js'
import type { FrameCanceller, FrameScheduler } from '../framework/loop/render-loop.js'
import { appKeyFromSearch } from '../platform/app-key.js'
import {
  GameSignals,
  SIGNAL_TOPICS,
  SNAPSHOT_TOPIC,
  createSignalChannel,
  createWsSignalChannel,
  signalCodecs,
} from '../platform/signals/index.js'
import { defaultConfig } from '../games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../games/battle-arena/config/index.js'
import { BattleArenaRenderer } from '../games/battle-arena/renderer/canvas.js'
import { alphaFromElapsed } from '../games/battle-arena/renderer/interpolate.js'
import { computeStageLayout } from '../games/battle-arena/renderer/layout.js'
import {
  GIFT_FEED_MAX,
  GIFT_FEED_TTL_MS,
  JOIN_FEED_MAX,
  JOIN_FEED_TTL_MS,
  KILL_FEED_MAX,
  KILL_FEED_TTL_MS,
  pushFeed,
} from '../games/battle-arena/renderer/hud/feed.js'
import type {
  FeedEntry,
  GiftFeedEntry,
  JoinFeedEntry,
  KillFeedEntry,
} from '../games/battle-arena/renderer/hud/feed.js'
import type { RosterEntry, RosterPayload, SessionGifter } from '../games/battle-arena/snapshot.js'
import { ULTIMATE_SOUND } from '../games/battle-arena/effects.js'
import type { BattleArenaSignals } from '../games/battle-arena/host.js'
import { Stage } from './Stage.js'
import { useGiftCatalog } from './useGiftCatalog.js'
import { isRemoteOverlay } from './routing.js'
import { createAudioChannels } from './media/audio-channels.js'
import type { AudioFactory } from './media/audio-channels.js'
import { bannerFromCue, emptyQueue, expireBanner, pushBanner } from './media/cue-queue.js'

/**
 * Konstanta MODUL, bukan dihitung di dalam effect.
 *
 * Effect yang memanggilnya bergantung pada identitas nilai-nilainya; array baru tiap render
 * akan membongkar-pasang seluruh langganan sinyal setiap frame.
 */
const ULTIMATE_SOUND_URLS = Object.values(ULTIMATE_SOUND).flatMap((s) => [
  s.launch.url,
  s.impact.url,
])

export interface StagePageProps {
  signals?: BattleArenaSignals
  size?: { width: number; height: number }
  now?: () => number
  scheduleFrame?: FrameScheduler
  cancelFrame?: FrameCanceller
  /** Diinjeksi di test; produksi memakai elemen `Audio` peramban. */
  createAudio?: AudioFactory
}

/**
 * Ukuran Browser Source di OBS.
 *
 * Overlay harus MENGISI sumbernya, bukan menempati kotak berukuran tetap: creator memasang
 * source 1080×1920, dan panggung 9:16 di dalamnya kemudian pas tepat. Ditulis di sini dan
 * bukan diimpor dari `dashboard/` supaya halaman overlay tetap bersih dari kode dashboard —
 * itu yang dijaga `dashboard/boundaries.test.ts`.
 */
function useViewportSize(): { width: number; height: number } {
  const read = (): { width: number; height: number } =>
    typeof window === 'undefined'
      ? { width: 1080, height: 1920 }
      : { width: window.innerWidth, height: window.innerHeight }

  const [size, setSize] = useState(read)

  useEffect(() => {
    const onResize = (): void => setSize(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}

/**
 * Preferensi gerak sistem, diikuti secara langsung saat penonton mengubahnya.
 *
 * Peramban lama tanpa addEventListener pada MediaQueryList jatuh ke nilai awalnya saja —
 * itu tetap benar, hanya tidak reaktif.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (query === undefined) return
    const update = (): void => setReduced(query.matches)
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  return reduced
}

/**
 * Kanal overlay, dipilih dari alamat halamannya sendiri.
 *
 * Overlay TIDAK memakai `takeAppKey`: ia membiarkan `k` di URL selamanya, karena OBS tidak
 * punya tempat mengetik dan Browser Source dimuat ulang dari URL yang sama tiap kali.
 */
const defaultSignals = (): BattleArenaSignals => {
  const remote =
    typeof location !== 'undefined' && isRemoteOverlay(location.hostname, location.search)
  return new GameSignals<RosterPayload, BattleArenaConfig, FeedEntry>({
    channel: remote
      ? createWsSignalChannel({
          binaryTopic: SNAPSHOT_TOPIC,
          role: 'overlay',
          appKey: appKeyFromSearch(location.search),
        })
      : createSignalChannel({
          name: 'battle-arena',
          topics: SIGNAL_TOPICS,
          codecs: signalCodecs,
        }),
    storage: typeof localStorage === 'undefined' ? null : localStorage,
    now: () => Date.now(),
  })
}

/**
 * Halaman overlay OBS (§9.3).
 *
 * Tidak pernah menjalankan tick: ia men-decode snapshot dan menggambar. Latar di luar
 * ketiga zona wajib rgba(0,0,0,0) — itulah yang membuat OBS bisa menembusnya.
 */
export function StagePage(props: StagePageProps = {}): ReactElement {
  const signals = useMemo(() => props.signals ?? defaultSignals(), [props.signals])

  // `now` WAJIB stabil antar-render. Kalau identitasnya berganti tiap render, `acceptSnapshot`
  // ikut berganti, effect pemulihan berjalan lagi, memanggil setVersion, dan halaman
  // terkunci di loop render tanpa akhir. Ref menyimpan fungsi terbarunya; pembungkusnya tetap.
  const nowRef = useRef(props.now ?? (() => Date.now()))
  nowRef.current = props.now ?? (() => Date.now())
  const now = useCallback(() => nowRef.current(), [])

  const history = useRef(new SnapshotHistory()).current
  const lastSnapshotAtMs = useRef(now())
  const [version, setVersion] = useState(0)
  const [config, setConfig] = useState<BattleArenaConfig>(defaultConfig())
  const [roster, setRoster] = useState<ReadonlyMap<number, RosterEntry>>(new Map())
  const [topGifters, setTopGifters] = useState<SessionGifter[]>([])
  const [kills, setKills] = useState<KillFeedEntry[]>([])
  const [joins, setJoins] = useState<JoinFeedEntry[]>([])
  const [gifts, setGifts] = useState<GiftFeedEntry[]>([])
  const [banners, setBanners] = useState(emptyQueue)
  const audio = useRef(createAudioChannels(props.createAudio)).current

  const viewport = useViewportSize()
  const size = props.size ?? viewport
  const reducedMotion = useReducedMotion()
  // Overlay ikut membaca katalog gift: sejak ia tersimpan di database, `/api/gifts` menjawab
  // ikon sungguhan bahkan di device lain yang localStorage-nya kosong.
  const { icons: giftIcons } = useGiftCatalog()
  // Cache dipegang di ref: renderer dibangun ulang tiap kali jendela berubah ukuran, dan
  // cache yang ikut lahir baru akan memuat ulang tiap gambar latar di setiap resize.
  const image = useRef(createImageCache()).current
  const renderer = useMemo(
    () =>
      new BattleArenaRenderer({
        layout: computeStageLayout(size.width, size.height, config.overlay.orientation),
        image,
      }),
    [size.width, size.height, config.overlay.orientation, image],
  )

  const acceptSnapshot = useCallback(
    (buffer: Float32Array) => {
      history.push(buffer)
      lastSnapshotAtMs.current = now()
      setVersion((value) => value + 1)
    },
    [history, now],
  )

  // Req 19 AC4: tampilkan keadaan terakhir yang diketahui sampai update live tiba.
  useEffect(() => {
    // Sapaan lebih dulu, sebelum apa pun yang dipulihkan dari penyimpanan: `BroadcastChannel`
    // tidak menahan apa pun, jadi overlay yang dibuka SESUDAH game dinyalakan tidak akan
    // pernah melihat config — dan ia akan menggambar seluruh siaran dengan defaultConfig(),
    // lengkap dengan nama sisi "Team A", target kill bawaan, dan blob berukuran salah.
    signals.requestState()

    const restored = signals.restoreLast()
    if (restored.config !== null) setConfig(restored.config)
    if (restored.roster !== null) {
      setRoster(new Map(restored.roster.entries.map((entry) => [entry.slotIndex, entry])))
      setTopGifters(restored.roster.topGifters ?? [])
    }
    if (restored.snapshot !== null) acceptSnapshot(restored.snapshot)
  }, [signals, acceptSnapshot])

  useEffect(() => {
    // Ultimate pertama tiap varian akan terlambat kalau berkasnya baru diunduh saat
    // dibutuhkan — dan di overlay yang berjalan di device lain, terlambatnya terasa.
    // Pernyataan biasa, BUKAN anggota `offs`: array itu isinya fungsi berhenti-berlangganan.
    audio.warm(ULTIMATE_SOUND_URLS)

    const offs = [
      signals.onSnapshot(acceptSnapshot),
      signals.onConfig((next) => setConfig(next)),
      signals.onRoster((next) => {
        setRoster(new Map(next.entries.map((entry) => [entry.slotIndex, entry])))
        setTopGifters(next.topGifters ?? [])
      }),
      signals.onFeed((entry) => {
        if (entry.kind === 'kill') {
          setKills((list) => pushFeed(list, entry, now(), KILL_FEED_MAX, KILL_FEED_TTL_MS))
        } else if (entry.kind === 'gift') {
          setGifts((list) => pushFeed(list, entry, now(), GIFT_FEED_MAX, GIFT_FEED_TTL_MS))
        } else {
          setJoins((list) => pushFeed(list, entry, now(), JOIN_FEED_MAX, JOIN_FEED_TTL_MS))
        }
      }),
      signals.onMedia((cue) => {
        audio.play(cue)
        const banner = bannerFromCue(cue)
        if (banner !== null) setBanners((queue) => pushBanner(queue, banner, now()))
      }),
    ]
    return () => {
      offs.forEach((off) => off())
      audio.stopAll()
    }
  }, [signals, acceptSnapshot, now, audio])

  return (
    <div
      data-testid="stage-page"
      data-version={version}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {history.hasData ? (
        <Stage
          renderer={renderer}
          history={history}
          config={config}
          roster={roster}
          topGifters={topGifters}
          kills={kills}
          joins={joins}
          gifts={gifts}
          size={size}
          reducedMotion={reducedMotion}
          giftIcons={giftIcons}
          // ponytail: overlay OBS harus tembus pandang, dan kanvas WebGL belum terbukti
          // begitu di atas latar terang (Plan 8 Task 5). Dashboard tetap jalur FX penuh.
          flatFx
          banner={banners.current}
          // Overlay tidak menjalankan tick, jadi kedaluwarsa banner menumpang frame milik
          // Stage. `expireBanner` mengembalikan state yang sama saat belum waktunya, jadi ini
          // tidak merender ulang apa pun 60 kali per detik.
          onBeforeDraw={() => setBanners((queue) => expireBanner(queue, now()))}
          // Overlay tidak menjalankan tick, jadi alpha datang dari waktu sejak snapshot
          // terakhir, bukan dari TickScheduler (keputusan E2).
          getAlpha={() => alphaFromElapsed(now() - lastSnapshotAtMs.current)}
          getNowMs={now}
          scheduleFrame={props.scheduleFrame}
          cancelFrame={props.cancelFrame}
        />
      ) : (
        <span data-testid="stage-waiting" style={{ color: 'rgba(255,255,255,0.4)' }}>
          waiting for the dashboard…
        </span>
      )}
    </div>
  )
}
