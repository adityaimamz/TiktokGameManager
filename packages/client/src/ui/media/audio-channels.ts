import type { MediaCue } from '../../platform/signals/index.js'

/** Bagian dari HTMLAudioElement yang benar-benar dipakai — supaya bisa dipalsukan di node. */
export interface AudioLike {
  volume: number
  loop: boolean
  currentTime: number
  play(): Promise<void> | void
  pause(): void
  load(): void
}

export type AudioFactory = (url: string) => AudioLike

const defaultFactory: AudioFactory = (url) => new Audio(url)

export interface AudioChannels {
  play(cue: MediaCue): void
  /** Membuat dan mengunduh elemen di muka, tanpa membunyikannya. */
  warm(urls: readonly string[]): void
  stopAll(): void
}

/**
 * Dua kanal: bunyi sekali-putar, dan satu trek musik yang berulang.
 *
 * Bunyi TIDAK diantre. Klik creator itu manual dan jarang, sementara alert sudah dijepit
 * antrean banner di hulunya — `SoundQueue` di sini akan membatasi sesuatu yang tidak pernah
 * menumpuk.
 *
 * Elemen `Audio` biasa, bukan Web Audio: yang diputar adalah berkas, bukan gelombang yang
 * disintesis, dan `AudioEngine` di tab dashboard tidak punya urusan di sini.
 */
export function createAudioChannels(create: AudioFactory = defaultFactory): AudioChannels {
  let music: AudioLike | null = null
  let musicUrl: string | null = null

  // ponytail: autoplay ditolak peramban biasa sampai halamannya diklik sekali; CEF milik OBS
  // mengizinkannya, jadi penolakannya ditelan dan bunyi berikutnya mencoba lagi. Jalur naiknya
  // adalah tombol "aktifkan audio" di overlay — dan tombol itu harus disembunyikan lagi supaya
  // tidak ikut tersiar, demi kasus yang tidak pernah terjadi di OBS.
  const start = (element: AudioLike): void => {
    try {
      void Promise.resolve(element.play()).catch(() => {})
    } catch {
      // Sebagian peramban MELEMPAR seketika, bukan menolak promise, saat sumbernya tidak
      // bisa diputar. Salah satu pemanggilnya kini handler event engine, dan lemparan di
      // sini akan memutus analytics serta rejoin simulator di baris-baris sesudahnya.
    }
  }

  /*
   * Satu elemen per URL, dipakai ulang.
   *
   * ponytail: dua pemutaran URL yang SAMA dan bertindihan akan me-restart, bukan berlapis.
   * Untuk ultimate itu justru yang diinginkan — dua bomb serentak jadi satu ledakan, bukan
   * dua yang saling menutup. Jalur naiknya kolam kecil per URL, kalau suatu hari terbukti
   * perlu; sampai itu terjadi, Map ini juga yang menahan elemen berhenti menumpuk sepanjang
   * siaran berjam-jam.
   */
  const cache = new Map<string, AudioLike>()
  const element = (url: string): AudioLike => {
    const found = cache.get(url)
    if (found !== undefined) return found
    const made = create(url)
    cache.set(url, made)
    return made
  }

  return {
    play(cue) {
      if (cue.kind === 'music') {
        /*
         * Cue untuk trek yang SEDANG berputar hanya menggeser volumenya.
         *
         * Slider volume musik menerbitkan cue untuk url yang sama tiap piksel ia digeser;
         * tanpa cabang ini, tiap piksel melahirkan elemen baru dan musiknya melompat balik
         * ke detik nol.
         */
        if (cue.url !== null && music !== null && musicUrl === cue.url) {
          music.volume = cue.volume
          return
        }

        music?.pause()
        music = null
        musicUrl = null
        if (cue.url === null) return
        /*
         * Kanal musik sengaja TIDAK memakai `cache` seperti kanal bunyi: trek yang
         * di-`pause()` lalu dipakai ulang melanjutkan dari posisi lamanya, dan itu bukan yang
         * diharapkan dari tombol yang kelihatan seperti "putar". Jangan menyatukan keduanya.
         */
        const element = create(cue.url)
        element.loop = true
        element.volume = cue.volume
        music = element
        musicUrl = cue.url
        start(element)
        return
      }

      if (cue.kind !== 'sound' || cue.url === null) return
      const sound = element(cue.url)
      sound.volume = cue.volume
      // Dari awal: elemen yang dipakai ulang berhenti di akhir berkas, dan `play()` pada
      // elemen yang sudah selesai tidak memutar apa pun tanpa ini.
      sound.currentTime = 0
      start(sound)
    },

    warm(urls) {
      for (const url of urls) element(url).load()
    },

    stopAll() {
      music?.pause()
      music = null
      musicUrl = null
    },
  }
}
