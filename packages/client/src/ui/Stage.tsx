import { useEffect, useMemo, useRef } from 'react'
import type { ReactElement } from 'react'
import type { SnapshotHistory } from '@lga/shared'
import type { FrameCanceller, FrameScheduler } from '../framework/loop/render-loop.js'
import type { BattleAction } from '../games/battle-arena/actions.js'
import type { BattleArenaConfig } from '../games/battle-arena/config/index.js'
import type { BattleArenaRenderer } from '../games/battle-arena/renderer/canvas.js'
import { UltimateFxPost } from '../games/battle-arena/renderer/fx/index.js'
import { computeStageLayout } from '../games/battle-arena/renderer/layout.js'
import { ActionLegend } from '../games/battle-arena/renderer/hud/ActionLegend.js'
import { Hud } from '../games/battle-arena/renderer/hud/Hud.js'
import type {
  GiftFeedEntry,
  JoinFeedEntry,
  KillFeedEntry,
} from '../games/battle-arena/renderer/hud/feed.js'
import type { RosterEntry } from '../games/battle-arena/snapshot.js'
import { FillerPanel } from './media/FillerPanel.js'
import { MediaLayer } from './media/MediaLayer.js'
import type { BannerItem } from './media/cue-queue.js'
import { useStageFrame } from './useStageFrame.js'

export interface StageProps {
  renderer: BattleArenaRenderer
  history: SnapshotHistory
  config: BattleArenaConfig
  roster: ReadonlyMap<number, RosterEntry>
  kills: KillFeedEntry[]
  joins: JoinFeedEntry[]
  gifts: GiftFeedEntry[]
  size: { width: number; height: number }
  /** Dibaca tiap frame, bukan tiap render — sumbernya berbeda di dashboard dan overlay (E2). */
  getAlpha: () => number
  getNowMs: () => number
  /**
   * Dijalankan di awal tiap frame, sebelum menggambar.
   *
   * Tab pemilik engine menitipkan `host.frame()` di sini supaya hanya ada SATU render loop
   * di halaman. Halaman overlay membiarkannya kosong — ia memang tidak punya apa pun untuk
   * dimajukan.
   */
  onBeforeDraw?: () => void
  /**
   * prefers-reduced-motion, dibaca di lapisan ui/ dan diteruskan ke renderer.
   *
   * Renderer TIDAK memanggil matchMedia sendiri: itu API peramban, dan renderer yang
   * menyentuhnya berhenti murni serta kedua jalurnya tidak bisa diuji (spec §7.6).
   */
  reducedMotion?: boolean
  /**
   * Paksa jalur datar: kanvas WebGL tidak dipasang sama sekali.
   *
   * ponytail: overlay dipaksa jalur datar sampai jalur FX terbukti tembus pandang di atas
   * latar terang (Plan 8 Task 5). Prop ini DIHAPUS begitu uji terima itu lulus; ia bukan
   * opsi, ia perancah.
   */
  flatFx?: boolean
  /**
   * Banner soundboard/alert yang sedang tampil.
   *
   * Ia di sini dan bukan di StagePage supaya live preview dashboard memperlihatkan hal yang
   * sama dengan overlay (Req 38 AC7). Yang TIDAK ikut ke dashboard adalah audionya.
   */
  banner?: BannerItem | null
  interactive?: boolean
  onFire?: (action: BattleAction) => void
  /** Ikon gift sungguhan untuk action legend, nama huruf kecil → URL (lihat useGiftCatalog). */
  giftIcons?: ReadonlyMap<string, string>
  /**
   * Plafon piksel fisik per piksel CSS. Bawaan 2 — overlay memakainya apa adanya.
   *
   * Ruang kendali mengoper 1: preview-nya maksimal 428 px lebar, monitor keyakinan dan bukan
   * produk, sementara dpr 2 melipatempatkan SELURUH biaya frame-nya — Canvas 2D, unggahan
   * texture post-process, dan ketujuh pass WebGL — di GPU yang sama dengan encoder OBS.
   */
  maxDpr?: number
  /**
   * Jarak minimum antar-frame yang DIGAMBAR. Kosong berarti tanpa plafon.
   *
   * Sama alasannya dengan `maxDpr`, dan sama sasarannya: overlay membiarkannya kosong supaya
   * OBS yang memutuskan kadensinya, ruang kendali menjepitnya karena preview 144 fps di
   * monitor 144 Hz seluruhnya masuk ke encoder 30 fps.
   */
  minFrameMs?: number
  scheduleFrame?: FrameScheduler
  cancelFrame?: FrameCanceller
}

/**
 * Ketiga zona §9.0 sebagai satu bidang: canvas di bawah, DOM di atasnya.
 *
 * Komponen ini murni penyaji. Ia tidak pernah menjalankan tick dan tidak tahu ada engine.
 */
export function Stage(props: StageProps): ReactElement {
  const { renderer, history, config, size } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // Jarak waktu NYATA sejak frame render sebelumnya — jalur FX butuh ini untuk memajukan
  // partikel pada laju layar, independen dari kadensi snapshot (lihat BattleArenaRenderer.render).
  // Diukur di sini, bukan di renderer: renderer tidak boleh menyentuh clock sama sekali.
  const lastFrameTsRef = useRef<number | null>(null)

  // Sekali per mount: WebGL entah tersedia di peramban ini atau tidak, itu tidak berubah
  // di tengah sesi. jsdom (test) selalu mengembalikan false di sini, jadi jalur FX jatuh
  // ke canvas 2D biasa persis seperti sebelum Ultimate FX Lab ada. `flatFx` memaksa jalur
  // yang sama tanpa menunggu peramban yang tidak mampu.
  const postSupported = useMemo(
    () => !props.flatFx && UltimateFxPost.isSupported(),
    [props.flatFx],
  )

  /**
   * Piksel FISIK per piksel CSS.
   *
   * Dibaca di sini dan bukan di renderer: `devicePixelRatio` API peramban, dan renderer yang
   * menyentuhnya berhenti murni — aturan yang sama dengan `reducedMotion`. Komponen ini
   * dirender ulang tiap frame oleh `hudTick`, jadi zoom peramban atau pindah monitor terbaca
   * sendiri tanpa satu pun listener.
   *
   * DIJEPIT 2 secara bawaan. Di atas itu biaya isi naik kuadratik — jalur FX menjalankan
   * bright, dua blur, dan pass akhir di atas bidang yang sama — sementara matanya nyaris
   * tidak membedakan. Pemanggil boleh menjepit lebih rendah lewat `maxDpr`; lihat prop-nya.
   */
  const dpr = Math.min(
    props.maxDpr ?? 2,
    (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1,
  )
  const canvasWidth = Math.round(size.width * dpr)
  const canvasHeight = Math.round(size.height * dpr)

  /**
   * DUA layout dari SATU fungsi: HUD DOM hidup di piksel CSS, kanvas di piksel fisik.
   *
   * Kanvas yang bidang gambarnya sebesar kotak CSS-nya diregangkan compositor pada layar
   * ber-dpr>1 — arena jadi buram sementara teks DOM di atasnya tetap tajam. Menggambarnya
   * pada piksel fisik memindahkan SELURUH dunia kanvas ke satuan itu sekaligus: `scaled()`,
   * radius gambar, koordinat partikel FX, dan ukuran texture post-process semuanya turun dari
   * `layout.stage.height` yang sama, jadi tidak ada satu pun angka yang perlu dikalikan dpr
   * sendiri-sendiri. Keduanya tetap lewat `computeStageLayout`, jadi HUD tidak bisa melenceng
   * dari arena — ia persis kelipatan dpr-nya. Yang TIDAK boleh: mencampur satuan keduanya
   * dalam satu perhitungan.
   */
  const layout = useMemo(
    () => computeStageLayout(size.width, size.height, config.overlay.orientation),
    [size.width, size.height, config.overlay.orientation],
  )
  const canvasLayout = useMemo(
    () => computeStageLayout(canvasWidth, canvasHeight, config.overlay.orientation),
    [canvasWidth, canvasHeight, config.overlay.orientation],
  )

  useEffect(() => {
    renderer.setLayout(canvasLayout)
    renderer.setHistory(history)
    renderer.setReducedMotion(props.reducedMotion ?? false)
  }, [renderer, canvasLayout, history, props.reducedMotion])

  useEffect(() => {
    renderer.setRoster([...props.roster.values()])
  }, [renderer, props.roster])

  // Kanvas WebGL yang menampilkan hasil post-process. Dilepas saat komponen unmount atau
  // renderer berganti, supaya UltimateFxPost lama tidak menggambar ke kanvas yang sudah pergi.
  useEffect(() => {
    if (!postSupported) return
    renderer.attachPostCanvas(glCanvasRef.current)
    return () => renderer.attachPostCanvas(null)
  }, [renderer, postSupported])

  const hudTick = useStageFrame({
    onFrame: (timestampMs) => {
      const dtMs = lastFrameTsRef.current === null ? 1000 / 60 : timestampMs - lastFrameTsRef.current
      lastFrameTsRef.current = timestampMs
      props.onBeforeDraw?.()
      const canvas = canvasRef.current
      // Browser tanpa akselerasi — dan jsdom — mengembalikan null di sini.
      const ctx = canvas?.getContext('2d') ?? null
      if (ctx === null || !history.hasData) return
      // Dijepit: tab yang baru resume dari background bisa melompat ratusan ms, dan jalur FX
      // tidak boleh memajukan partikel sejauh itu dalam satu langkah integrasi.
      renderer.render(ctx, history.current, config, props.getAlpha(), Math.min(250, Math.max(0, dtMs)))
    },
    minFrameMs: props.minFrameMs,
    scheduleFrame: props.scheduleFrame,
    cancelFrame: props.cancelFrame,
  })

  return (
    <div
      style={{ position: 'relative', width: size.width, height: size.height }}
      data-hud-tick={hudTick}
    >
      <canvas
        data-testid="stage-canvas"
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        // WebGL yang tampil begitu tersedia: kanvas 2D ini berubah jadi sumber texture saja
        // (lihat INTEGRATION.md §4), tapi tetap harus ada di DOM supaya getContext/drawImage
        // tetap bekerja di seluruh peramban sasaran.
        style={
          postSupported
            ? { display: 'none' }
            : { display: 'block', width: size.width, height: size.height }
        }
      />
      {postSupported ? (
        <canvas
          data-testid="stage-canvas-gl"
          ref={glCanvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{ display: 'block', width: size.width, height: size.height }}
        />
      ) : null}
      <Hud
        view={history.current}
        config={config}
        roster={props.roster}
        kills={props.kills}
        joins={props.joins}
        gifts={props.gifts}
        nowMs={props.getNowMs()}
        layout={layout}
      />
      <ActionLegend
        config={config}
        layout={layout}
        interactive={props.interactive ?? false}
        onFire={props.onFire}
        giftIcons={props.giftIcons}
      />
      <MediaLayer banner={props.banner ?? null} layout={layout} />
      <FillerPanel filler={config.filler} layout={layout} />
    </div>
  )
}
