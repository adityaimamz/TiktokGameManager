import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { createImageCache } from '../../framework/image-cache.js'
import type { FrameCanceller, FrameScheduler } from '../../framework/loop/render-loop.js'
import { BattleArenaRenderer } from '../../games/battle-arena/renderer/canvas.js'
import { computeStageLayout } from '../../games/battle-arena/renderer/layout.js'
import { overlayOrigin, stageUrl } from '../routing.js'
import { Stage } from '../Stage.js'
import { broadcastState, liveDuration } from './broadcast.js'
import { leaveWarning, shouldWarnOnUnload } from './unload.js'
import type { UltimateKind } from './ultimate.js'
import { fitPortrait, useElementSize } from './useElementSize.js'
import { LeaveDialog } from './LeaveDialog.js'
import { TopBar } from './TopBar.js'
import { useGiftCatalog } from '../useGiftCatalog.js'
import { ActionTriggers } from './sections/ActionTriggers.js'
import { Alerts } from './sections/Alerts.js'
import { ChatLog } from './sections/ChatLog.js'
import { CommentReader } from './sections/CommentReader.js'
import { Connection } from './sections/Connection.js'
import { Footer } from './sections/Footer.js'
import { GameInfo } from './sections/GameInfo.js'
import { withGameplay } from './sections/game-settings.js'
import { GameSettings } from './sections/GameSettings.js'
import { Boards } from './sections/Boards.js'
import { LiveSimulator } from './sections/LiveSimulator.js'
import { LiveStats } from './sections/LiveStats.js'
import { SessionControls } from './sections/SessionControls.js'
import { Soundboard } from './sections/Soundboard.js'
import { StageFiller } from './sections/StageFiller.js'
import { TestActions } from './sections/TestActions.js'
import { useDashboard } from './useDashboard.js'
import type { SideId } from '../../games/battle-arena/types.js'
import './dashboard.css'

export interface DashboardProps {
  scheduleFrame?: FrameScheduler
  cancelFrame?: FrameCanceller
  /** Kembali ke katalog game. Tanpa ini top bar tidak menggambar tombolnya. */
  onBack?: () => void
}

/** Ukuran sebelum pengukuran pertama, dan di jsdom yang tidak punya ResizeObserver. */
const FALLBACK = { width: 360, height: 640 }
/** Di atas ini monitor berhenti tumbuh: ia preview, bukan tempat menonton pertandingan. */
const MAX_MONITOR_HEIGHT = 760

const ONAIR_CLASS: Record<'idle' | 'rehearsal' | 'live', string> = {
  idle: '',
  rehearsal: 'onair-standby',
  live: 'onair-live',
}

export function Dashboard(props: DashboardProps = {}): ReactElement {
  const model = useDashboard()
  // Katalog yang sama dengan yang dipakai Trigger Builder, dibaca lagi di sini supaya kartu
  // legend memakai gambar gift sungguhan. Dua GET kecil saat mount, bukan satu prop yang
  // harus menembus tiga komponen.
  const { icons: giftIcons } = useGiftCatalog(undefined, model.connection.roomId)
  const broadcast = broadcastState(model.connection, model.simulatorOn)

  const [leaving, setLeaving] = useState(false)

  /*
   * Tombol ‹ bertanya dulu, tapi hanya kalau ada yang benar-benar hilang.
   *
   * Meninggalkan ruang kendali membongkar rig: match berhenti, kill feed mati, dan siaran ke
   * overlay ikut mati. Creator yang belum memulai apa pun tidak diadang.
   */
  const requestBack = (): void => {
    if (props.onBack === undefined) return
    if (!leaveWarning(model.matchState, model.connection.state)) {
      props.onBack()
      return
    }
    setLeaving(true)
  }

  /*
   * Koneksi TikTok sengaja TIDAK diputus.
   *
   * Creator yang cuma melirik katalog lalu kembali tidak boleh membayar sambung ulang, dan yang
   * memang ingin memutusnya sudah punya tombol Putuskan di panel Koneksi.
   */
  const leave = (): void => {
    setLeaving(false)
    // Statistik dikirim SEBELUM navigasi: unmount berikutnya membongkar rig, dan ledger yang
    // ikut terbongkar tidak punya siapa pun lagi untuk mengirimkannya.
    void model.actions.flushProgress().then(() => props.onBack?.())
  }

  /*
   * Satu detak per detik untuk durasi siaran — dan sekalian untuk label "sejak" di daftar
   * gifter, yang selama ini beku sampai ada render lain kebetulan lewat: `Date.now()` di
   * dalam JSX hanya dievaluasi ulang saat komponennya dirender ulang karena sebab lain.
   */
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const [ultimateSide, setUltimateSide] = useState<SideId>('b')

  const monitorRef = useRef<HTMLDivElement>(null)
  const available = useElementSize(monitorRef, FALLBACK)
  const stageSize = useMemo(
    () => fitPortrait(available, MAX_MONITOR_HEIGHT),
    [available.width, available.height],
  )

  const renderer = useMemo(
    () =>
      new BattleArenaRenderer({
        layout: computeStageLayout(0, 0, 'portrait'),
        image: createImageCache(),
      }),
    [],
  )

  // Predikat murni yang diuji sendiri; effect ini hanya memanggilnya. Ref supaya listener
  // dipasang sekali, bukan sekali per tick.
  const matchState = useRef(model.matchState)
  matchState.current = model.matchState

  const settingsRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Req 34 AC8: tombol di top bar adalah pintasan yang membuka dan menggulir ke section ini,
  // bukan modal — setelan harus tetap terlihat berdampingan dengan live preview.
  const openSettings = (): void => {
    setSettingsOpen(true)
    settingsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const flushConfig = useRef(model.flushConfig)
  flushConfig.current = model.flushConfig

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => {
      // Setelan yang baru diubah 400 ms lalu masih tertunda di debounce; tulis sekarang.
      flushConfig.current()
      if (!shouldWarnOnUnload(matchState.current)) return
      // Menutup tab ini menghentikan pertandingan (§6.1 spec induk).
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const overlayUrl =
    typeof location === 'undefined'
      ? ''
      : stageUrl(overlayOrigin(location.hostname, location.origin, model.lanUrls), model.appKey)

  /**
   * Ultimate = satu aksi nuke sungguhan, plus jenisnya yang tersimpan di config.
   *
   * Efeknya lahir di snapshot, jadi overlay OBS melihat ledakan yang sama dengan preview.
   */
  const fireUltimate = (kind: UltimateKind): void => {
    model.setConfig(
      withGameplay(model.config, { nuke: { ...model.config.gameplay.nuke, type: kind } }),
    )
    model.actions.fireTest(ultimateSide === 'a' ? 'nukeA' : 'nukeB')
  }

  return (
    /*
     * Di lg ke atas halaman TIDAK menggulir: tingginya persis satu viewport dan yang
     * menggulir hanya dua kolom tepi. Di bawah lg tiga kolom itu menumpuk jadi satu, dan
     * di sana halaman harus boleh menggulir seperti biasa.
     */
    <div className="spill relative flex min-h-[100dvh] flex-col gap-3.5 overflow-hidden p-4 font-ui text-[13px] text-signal lg:h-screen lg:min-h-0">
      <div className="spill-grid" aria-hidden="true" />

      {/*
       * TANDA TANGAN: lampu on-air mengelilingi seluruh viewport. Creator yang sedang
       * menatap kamera menangkapnya dengan penglihatan tepi, tanpa memalingkan wajah.
       */}
      <div
        className={`onair ${ONAIR_CLASS[broadcast]}`.trim()}
        role="status"
        aria-live="polite"
        aria-label="Status siaran"
      />

      <TopBar
        broadcast={broadcast}
        overlayUrl={overlayUrl}
        overlayCount={model.overlays}
        muted={model.muted}
        onToggleMute={model.actions.toggleMute}
        onOpenSettings={openSettings}
        notifications={model.notifications}
        onReadNotifications={model.actions.readNotifications}
        onBack={props.onBack === undefined ? undefined : requestBack}
        liveFor={liveDuration(model.connection, nowMs)}
      />

      {/*
        * min-h-0 di sini dan di tiap kolom adalah yang membuat overflow-y-auto benar-benar
        * bekerja: anak grid dan anak flex lahir dengan min-height:auto, jadi kolom yang
        * kepanjangan mendorong barisnya melewati viewport alih-alih menggulir sendiri.
        */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3.5 lg:grid-cols-shell">
        {/*
          * Kolom kendali dalam TIGA tumpukan, bukan delapan kartu.
          *
          * Bobot kartu mengikuti seberapa sering isinya dilirik: sambungan dan denyut sesi
          * paling terang, kendali pertandingan sedang, simulator paling redup.
          */}
        <aside
          className="column-scroll flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5"
          data-testid="column-control"
        >
          <div className="stack stack-split stack-hi">
            <Connection
              status={model.connection}
              onConnect={model.actions.connect}
              onDisconnect={model.actions.disconnect}
            />
            <LiveStats
              status={model.connection}
              comments={model.comments}
              joinedFighters={model.joinedFighters}
              sessionMs={Date.now() - model.sessionStartedAtMs}
            />
          </div>

          <div className="stack-lo stack-split">
            <GameInfo
              view={model.history.hasData ? model.history.current : null}
              config={model.config}
              onReset={model.actions.reset}
            />
            <SessionControls
              paused={model.paused}
              onTogglePause={model.actions.togglePause}
              onRestart={model.actions.restart}
              onSend={model.actions.sendMessage}
              onEndSession={model.actions.endSession}
            />
          </div>

          {/* Blok uji: penonton sintetis dan aksi uji (ultimate ikut di dalam accordion-nya). */}
          <div className="stack-lo stack-split">
            <LiveSimulator running={model.simulatorOn} onToggle={model.actions.toggleSimulator} />
            <TestActions
              config={model.config}
              onFire={model.actions.fireTest}
              ultimate={{
                side: ultimateSide,
                onSide: setUltimateSide,
                onFire: fireUltimate,
                currentKind: model.config.gameplay.nuke.type,
                sideNames: { a: model.config.sides.a.name, b: model.config.sides.b.name },
              }}
            />
          </div>

          {/*
            * Setelan paling redup dan terlipat: disentuh sekali di awal sesi, lalu tidak
            * lagi. Ia tetap di kolom — Req 34 AC8 menuntut setelan terlihat BERDAMPINGAN
            * dengan live preview, bukan menutupinya lewat modal.
            */}
          <div className="stack-lo stack-split">
            <Alerts
              alerts={model.media.alerts}
              cues={model.media.cues}
              onAlerts={(alerts) => model.setMedia({ ...model.media, alerts })}
            />
            <CommentReader
              reader={model.media.reader}
              voices={model.voices}
              onReader={(reader) => model.setMedia({ ...model.media, reader })}
            />
            <StageFiller
              filler={model.config.filler}
              onFiller={(filler) => model.setConfig({ ...model.config, filler })}
            />
            <ActionTriggers
              config={model.config}
              onConfig={model.setConfig}
              roomId={model.connection.roomId}
            />
            <div ref={settingsRef}>
              <GameSettings
                config={model.config}
                onConfig={model.setConfig}
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
              />
            </div>
          </div>

          <Footer />
        </aside>

        {/* Pahlawan halaman: yang penonton lihat, sebesar mungkin. */}
        <section
          className="flex min-h-[520px] flex-col items-center gap-2.5 lg:min-h-0"
          data-testid="column-monitor"
        >
          <div className="flex w-full items-center justify-between gap-3 px-1">
            <span className="font-ui text-[11px] font-semibold text-muted">
              Preview arena ·{' '}
              {model.config.overlay.orientation === 'portrait' ? '9:16' : '16:9'}
            </span>
            <span
              className={`flex items-center gap-1.5 font-ui text-[11px] font-semibold ${
                broadcast === 'idle' ? 'text-muted' : 'text-ok'
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-current"
                style={{
                  boxShadow: '0 0 10px currentcolor',
                  animation: broadcast === 'idle' ? 'none' : 'ia-blip 1.4s ease-in-out infinite',
                }}
              />
              {broadcast === 'idle' ? 'Siaran diam' : 'Siaran aktif'}
            </span>
          </div>

          {/*
            * Tanpa min-h-0, kotak panggung yang tingginya diukur DARI kotak ini akan
            * mendorongnya makin tinggi setiap frame — umpan balik yang persis membuat arena
            * terpotong di bawah dan memaksa halaman menggulir.
            */}
          <div
            ref={monitorRef}
            className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
          >
            {/* Cahaya panggung yang jatuh ke dinding di belakangnya. Ia mengikuti ukuran
                panggung, jadi monitor kecil tidak berdiri di tengah halo raksasa. */}
            <div
              className="monitor-halo pointer-events-none absolute rounded-[40px]"
              style={{ width: stageSize.width, height: stageSize.height }}
              aria-hidden="true"
            />
            {/* Bingkai: satu garis gradien dua kutub, tebal 7px, membingkai panggung. */}
            <div
              className="monitor-frame relative rounded-[22px] p-[7px]"
              style={{ width: stageSize.width + 14, height: stageSize.height + 14 }}
            >
              <div
                className="monitor-grid relative overflow-hidden rounded-2xl"
                style={{ width: stageSize.width, height: stageSize.height }}
              >
                {stageSize.height > 0 ? (
                  <Stage
                    renderer={renderer}
                    history={model.history}
                    config={model.config}
                    roster={model.roster}
                    kills={model.kills}
                    joins={model.joins}
                    gifts={model.gifts}
                    size={stageSize}
                    onBeforeDraw={model.advance}
                    getAlpha={model.getAlpha}
                    getNowMs={() => Date.now()}
                    banner={model.banner}
                    interactive
                    onFire={model.actions.fire}
                    giftIcons={giftIcons}
                    // Preview ini MONITOR KEYAKINAN, bukan produk: lebarnya maksimal 428 px
                    // dan yang menontonnya cuma creator. dpr 2 melipatempatkan seluruh biaya
                    // frame-nya, dan 144 fps di monitor 144 Hz seluruhnya masuk ke encoder
                    // 30 fps — keduanya di GPU yang sama dengan encoder OBS. Overlay, yang
                    // dilihat penonton, tidak mengoper satu pun dari keduanya.
                    maxDpr={1}
                    minFrameMs={1000 / 30}
                    scheduleFrame={props.scheduleFrame}
                    cancelFrame={props.cancelFrame}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* <p className="note mx-auto max-w-[520px] px-1 text-center">
            Kotak-kotak itu tembus pandang di OBS. Klik kartu aksi mana pun — aksinya sama
            persis dengan yang dipicu chat.
          </p> */}
        </section>

        <aside
          className="column-scroll flex min-h-0 flex-col gap-3 overflow-y-auto"
          data-testid="column-chat"
        >
          <div className="stack-lo">
            <Soundboard
              cues={model.media.cues}
              musicVolume={model.media.musicVolume}
              playingMusicId={model.playingMusicId}
              onCues={(cues) => model.setMedia({ ...model.media, cues })}
              onFire={model.actions.fireCue}
              onMusicVolume={model.actions.setMusicVolume}
              onStopMusic={model.actions.stopMusic}
            />
          </div>
          {/*
            * Komentar dan papan gift berbagi SATU kartu bertab. Keduanya kartu terpisah
            * sampai gift jadi ramai: daftar gifter memanjang tanpa batas dan mendorong
            * kolom komentar keluar layar, persis di menit yang paling ramai.
            */}
          <div className="stack-lo flex min-h-0 flex-1 flex-col overflow-hidden">
            <Boards
              chat={
                <ChatLog
                  entries={model.chat}
                  rate={model.chatRate}
                  bars={model.chatBars}
                  onRehearse={model.simulatorOn ? undefined : model.actions.toggleSimulator}
                />
              }
              live={model.gifters}
              top={model.topGifters}
              matches={model.matchHistory}
              killers={model.topKillers}
              sideNames={{ a: model.config.sides.a.name, b: model.config.sides.b.name }}
              nowMs={nowMs}
              onLoadTop={model.actions.loadTopGifters}
              onLoadStats={model.actions.loadMatchStats}
            />
          </div>
        </aside>
      </div>

      {leaving ? <LeaveDialog onCancel={() => setLeaving(false)} onLeave={leave} /> : null}
    </div>
  )
}

export default Dashboard
