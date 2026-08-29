import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { FillerConfig } from '../../games/battle-arena/config/index.js'
import { bottomHalves } from '../../games/battle-arena/renderer/layout.js'
import type { StageLayout } from '../../games/battle-arena/renderer/layout.js'

export interface FillerPanelProps {
  filler: FillerConfig
  layout: StageLayout
}

/**
 * Isi SEPARUH KANAN band bawah panggung: potongan video atau gambar yang berputar (§4 spec
 * Plan 11). Separuh kirinya milik action legend; `bottomHalves` yang membagi, sekali, untuk
 * keduanya.
 *
 * Ia ada untuk mematahkan monotoni — siaran yang berulang-ulang dibatasi jangkauannya — jadi
 * ia BERPUTAR, bukan menampilkan satu benda selamanya.
 *
 * Ia tinggal di `ui/media/` dan bukan di `renderer/hud/`: ia tidak membaca `SnapshotView`,
 * tidak tahu apa-apa tentang pertandingan, dan renderer canvas milik game tidak boleh tahu
 * apa pun tentang media non-game. Tetangganya `MediaLayer`, yang menempati posisi yang sama
 * persis — DOM di atas panggung, dikurung ke satu `Rect` dari `StageLayout`.
 *
 * SELALU bisu, dan tanpa knop untuk mengubahnya: kanal musik dan bunyi ultimate sudah
 * memiliki seluruh anggaran audio panggung, dan trek audio video adalah persis yang memicu
 * deteksi hak cipta TikTok — hukuman yang lebih berat daripada monoton.
 *
 * ponytail: dashboard dan overlay sama-sama merender `Stage`, jadi berkas yang sama didekode
 * dua kali dan tidak sinkron satu sama lain. Diterima — dashboard adalah monitor creator,
 * bukan yang ditangkap OBS. Kalau CPU-nya terasa, satu prop dari Dashboard untuk mematikannya
 * di sana lebih murah daripada menyinkronkan posisi pemutaran lewat kabel sinyal.
 */
export function FillerPanel({ filler, layout }: FillerPanelProps): ReactElement | null {
  const [index, setIndex] = useState(0)
  const [dead, setDead] = useState(false)
  const failures = useRef(0)

  const items = filler.items
  const count = items.length
  const signature = items.map((item) => item.url).join('|')

  // Daftar yang diganti creator memberi panel yang sudah menyerah satu kesempatan lagi.
  useEffect(() => {
    failures.current = 0
    setDead(false)
    setIndex(0)
  }, [signature])

  const advance = (): void => setIndex((current) => (count === 0 ? 0 : (current + 1) % count))

  const item = !filler.enabled || count === 0 || dead ? null : (items[index % count] ?? null)
  const kind = item?.kind ?? null

  useEffect(() => {
    if (kind !== 'image') return
    const timer = setTimeout(() => {
      setIndex((current) => (count === 0 ? 0 : (current + 1) % count))
    }, filler.imageDurationSec * 1000)
    return () => clearTimeout(timer)
  }, [index, kind, count, filler.imageDurationSec])

  if (item === null) return null

  /**
   * Satu berkas mati tidak boleh membekukan panel — tapi delapan berkas mati juga tidak boleh
   * jadi loop `error → maju → error` secepat event loop mengizinkannya. Hitungan gagal
   * BERURUTAN itu yang menutupnya; satu pemutaran yang berhasil me-reset-nya.
   */
  const onFail = (): void => {
    failures.current += 1
    if (failures.current >= count) {
      setDead(true)
      return
    }
    advance()
  }

  const onOk = (): void => {
    failures.current = 0
  }

  const band = bottomHalves(layout).filler

  const media: CSSProperties = {
    width: '100%',
    height: '100%',
    // `cover`, bukan `contain`: separuh band bawah masih jauh lebih lebar daripada tinggi
    // (960×194 di landscape), dan `contain` menyisakan dua pilar kosong di kiri dan kanan
    // hampir video apa pun.
    objectFit: 'cover',
    display: 'block',
  }

  return (
    <div
      data-testid="filler-panel"
      style={{
        position: 'absolute',
        left: band.x,
        top: band.y,
        width: band.width,
        height: band.height,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {item.kind === 'video' ? (
        <video
          autoPlay
          data-testid="filler-video"
          key={item.url}
          // Satu item me-loop sendiri; tanpa ini `onEnded` memajukan ke dirinya sendiri, React
          // memakai ulang elemen dengan key yang sama, dan videonya berhenti di frame terakhir.
          loop={count === 1}
          muted
          onEnded={advance}
          onError={onFail}
          onLoadedData={onOk}
          playsInline
          src={item.url}
          style={media}
        />
      ) : (
        <img
          alt=""
          data-testid="filler-image"
          key={item.url}
          onError={onFail}
          onLoad={onOk}
          src={item.url}
          style={media}
        />
      )}
    </div>
  )
}
