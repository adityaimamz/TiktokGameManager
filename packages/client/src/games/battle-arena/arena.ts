import type { Vec2 } from '../../framework/entity/entity.js'
import type { SideId } from './types.js'

/** Panjang satu tick simulasi (Req 24 AC1). */
export const TICK_MS = 50

/**
 * Seluruh koordinat arena adalah PERSEN 0–100 pada kedua sumbu, dan hanya berlaku
 * untuk zona tengah bidang tayang (§9.0) — bukan seluruh layar.
 */
export const ARENA_MIN = 0
export const ARENA_MAX = 100
export const ARENA_MIDLINE = 50

/** Baris spawn dijauhkan dari tepi atas dan bawah (Req 6 AC1). */
export const SPAWN_Y_MIN = 10
export const SPAWN_Y_MAX = 90

/*
 * PERSEN-X DAN PERSEN-Y BUKAN PANJANG YANG SAMA DI LAYAR.
 *
 * Arena selebar 100% dan setinggi 100%, tapi kotaknya tidak persegi: pada panggung
 * landscape 1920×1080 ia 1920×734,4 px. Satu persen-X = 19,2 px, satu persen-Y = 7,3 px.
 * Menguji tabrakan dengan `hypot(dx, dy)` apa adanya karena itu menghasilkan ELIPS di
 * layar, bukan lingkaran — dulu 48 px ke samping dan 18,4 px ke atas-bawah untuk satu
 * radius 2,5 yang sama.
 *
 * Perbaikannya: seluruh radius dinyatakan dalam PERSEN-Y, dan jarak-X dikalikan
 * `ARENA_ASPECT` sebelum dibandingkan. Persen-Y yang dipilih jadi satuan karena panjang
 * pikselnya tidak bergantung orientasi — tinggi arena selalu `ARENA_HEIGHT_RATIO` dari
 * tinggi panggung, sementara lebarnya berubah antara landscape dan portrait.
 */

/** Bidang tayang: band skor di atas, arena di tengah, legend di bawah (§9.0). */
export const TOP_ZONE_RATIO = 0.14
export const BOTTOM_ZONE_RATIO = 0.18
export const ARENA_HEIGHT_RATIO = 1 - TOP_ZONE_RATIO - BOTTOM_ZONE_RATIO

/** Panggung acuan desain; semua ukuran piksel diskalakan terhadap tinggi ini. */
export const REFERENCE_STAGE_HEIGHT = 1080
/** Diameter blob avatar pada panggung acuan (§9.1). */
export const FIGHTER_DIAMETER_PX = 48

/**
 * Rasio panggung per orientasi. Arena selalu terbelah kiri/kanan, juga di portrait (§6.4),
 * jadi portrait bukan "arena yang diputar" melainkan arena yang jauh lebih sempit.
 *
 * `layout.ts` mengikatnya ke tipe `Orientation`; di sini ia sengaja objek biasa supaya
 * `arena.ts` tidak perlu mengimpor apa pun dari config dan tidak menutup lingkaran impor.
 */
export const STAGE_ASPECT = { landscape: 16 / 9, portrait: 9 / 16 }

/** Kurs persen-X → persen-Y: satu persen-X sepanjang ini dalam persen-Y. */
export const ARENA_ASPECT = {
  landscape: STAGE_ASPECT.landscape / ARENA_HEIGHT_RATIO,
  portrait: STAGE_ASPECT.portrait / ARENA_HEIGHT_RATIO,
}

/** Satu piksel panggung acuan, dinyatakan dalam persen-Y. */
const PX_TO_ARENA_Y = 100 / (REFERENCE_STAGE_HEIGHT * ARENA_HEIGHT_RATIO)

/**
 * Radius hitbox fighter (Req 26 AC3), dalam persen-Y — PERSIS sebesar blob yang digambar,
 * 24 px pada panggung acuan. Kotak tabrak dan gambar kini satu benda yang sama: tembakan
 * mendaftar kena tepat saat kedua sprite bersentuhan, tidak lebih awal dan tidak lebih
 * lambat, di kedua sumbu.
 */
export const FIGHTER_HIT_RADIUS = (FIGHTER_DIAMETER_PX / 2) * PX_TO_ARENA_Y

/** Lebar inti berkas tembakan biasa pada panggung acuan — laser tipis, bukan bola api. */
const PROJECTILE_CORE_PX = 2.4

const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

/**
 * Batas skala fighter.
 *
 * Atap 4,0x, dan angkanya dipilih dari titik JENUHNYA, bukan dari besarnya. Pada `sqrt`,
 * atap `s` tercapai di `s²` kali baseHp: atap 1,6x yang lama jenuh di 2,56x baseHp, jadi
 * pada siaran sungguhan — di mana gift menumbuhkan HP puluhan kali lipat — hampir SEMUA
 * fighter mentok di atap dan digambar sama besar. Fighter 86.000 HP kembar identik dengan
 * yang 5.000. Atap 4,0x memindahkan kejenuhan itu ke 16x baseHp, dan di sanalah rentang
 * yang terlihat baru punya arti.
 *
 * Ini BUKAN sekadar tampilan. Skala menggerakkan hitbox, jadi atap yang jenuh dini membuat
 * luas sasaran berhenti tumbuh sementara HP terus naik — fighter raksasa jadi jauh lebih
 * tahan daripada yang dimaksudkan `sqrt`. Menaikkan atap mengembalikan hubungan "luas
 * sasaran sebanding HP" untuk rentang yang benar-benar dipakai siaran.
 *
 * Harganya nyata dan diterima sadar (keputusan creator): pada 4,0x sebuah blob memakan ~26%
 * tinggi arena, dan separuh arena jadi sesak saat beberapa fighter besar hidup bersamaan.
 * `findSpawnPosition` sudah menanganinya dengan jatuh ke kandidat paling lapang alih-alih
 * memaksakan jarak yang tidak muat.
 *
 * Lantai 0,6x. Ia tetap ADA — tanpa lantai, yang nyaris mati menyusut jadi titik dan justru
 * paling sulit dihabisi, umpan balik yang membuat pertarungan berlarut. Diturunkan dari 0,8x
 * untuk melebarkan rentang yang terlihat di ujung bawah, dengan harga yang sama arahnya:
 * fighter sekarat sedikit lebih sulit dibidik daripada sebelumnya.
 *
 * Kalau atap dinaikkan lebih jauh lagi, periksa `sideHalfBounds`: marginnya `FIGHTER_EDGE_MARGIN
 * * scale`, dan pada skala ~10x separuh arena mengerut jadi nol lebar.
 */
export const FIGHTER_SCALE_MIN = 0.6
export const FIGHTER_SCALE_MAX = 4.0

/**
 * Skala sebuah fighter dari HP BERJALAN-nya, bukan dari `maxHp`.
 *
 * Ukuran menjawab "siapa kuat SEKARANG", bukan "siapa paling banyak dapat gift": fighter
 * yang sudah babak belur mengecil meski `maxHp`-nya tinggi.
 *
 * Akar kuadrat, bukan linier. HP naik linier sementara radius naik `sqrt`, jadi luas sasaran
 * — yang sebanding dengan radius kuadrat — tumbuh persis sebanding dengan HP. Fighter yang
 * tumbuh tetap lebih tahan, bukan sekadar lebih besar.
 *
 * SATU-SATUNYA sumber skala untuk engine maupun renderer. Dua rumus di dua tempat berarti
 * hitbox dan sprite yang berpisah diam-diam, persis bug yang baru saja dibuang.
 */
export function fighterScale(hp: number, baseHp: number): number {
  if (baseHp <= 0) return 1
  return clamp(Math.sqrt(hp / baseHp), FIGHTER_SCALE_MIN, FIGHTER_SCALE_MAX)
}

/** Radius hitbox fighter ini, dalam persen-Y. Sama besar dengan blob yang digambar. */
export function fighterHitRadius(hp: number, baseHp: number): number {
  return FIGHTER_HIT_RADIUS * fighterScale(hp, baseHp)
}

/**
 * Radius hitbox projectile: SETENGAH lebar inti berkasnya, aturan yang sama dengan fighter.
 *
 * Tembakan mendaftar kena saat ujung berkas benar-benar menyentuh blob. Ia sekecil ini
 * tanpa membuat tembakan meleset karena projectile mengunci target dan langkah terakhirnya
 * dijepit supaya mendarat persis di sasaran — yang hilang hanyalah serempetan ke fighter
 * lain di jalur, dan berkas setipis ini memang tidak seharusnya menyerempet siapa pun.
 */
export const PROJECTILE_RADIUS = (PROJECTILE_CORE_PX / 2) * PX_TO_ARENA_Y

/**
 * Jarak fighter dari tepi arena dan garis tengah — MARGIN tata letak, bukan hitbox.
 *
 * Sengaja dibiarkan 2,5 persen dan sengaja TIDAK ikut dikoreksi aspek: ia hanya mengatur
 * seberapa lega fighter berdiri dari dinding, dan mengubahnya akan menggeser seluruh titik
 * spawn berseed tanpa memperbaiki satu pun tabrakan.
 */
export const FIGHTER_EDGE_MARGIN = 2.5
/** Satu lebar karakter — jarak minimum antar-spawn (Req 6 AC3). */
export const FIGHTER_WIDTH = FIGHTER_EDGE_MARGIN * 2

const TICKS_PER_SECOND = 1000 / TICK_MS

/**
 * Kecepatan dinyatakan per TICK, bukan per detik, karena tick tetap 50 ms.
 *
 * Satu-satunya kecepatan gerak: fighter tidak lagi mengejar musuh, jadi tidak ada
 * kecepatan "mendekat" terpisah dari kecepatan wander (Req 8 AC1).
 *
 * 5% lebar arena per detik — diukur dari video referensi pada 25 fps: sebuah blob
 * berpindah ~30 px per 800 ms di arena selebar ~855 px, jadi ~4 unit per detik.
 * Angka lama (40 unit per detik) membuat fighter melesat, bukan melayang.
 */
export const IDLE_SPEED_PER_TICK = 5 / TICKS_PER_SECOND
/**
 * 100% lebar arena per detik (Req 26 AC1) — projectile menyeberang arena dalam ~1 detik.
 *
 * Diukur dari frame 25 fps yang sama: satu peluru berpindah ~31 px per frame 40 ms,
 * yaitu ~90–100 unit per detik. Nilai lama 15 unit per detik membuat tembakan lebih
 * lambat daripada apa pun yang layak dikejar dan hampir selalu meleset.
 */
export const PROJECTILE_SPEED_PER_TICK = 100 / TICKS_PER_SECOND
/**
 * Dua kali waktu yang dibutuhkan untuk menyeberangi arena penuh (Req 26 AC6).
 *
 * Dua fighter di tepi terjauh terpisah sampai ~95 unit; pada kecepatan di atas itu
 * ~1 detik. 2000 ms memberi kelonggaran untuk lintasan yang melengkung saat projectile
 * mengikuti target yang bergerak, tanpa membiarkan tembakan nyasar menggantung lama.
 */
export const PROJECTILE_LIFETIME_MS = 2000

/** Rentang jeda ganti arah saat berkeliaran (Req 32 AC6). */
export const IDLE_TURN_MIN_MS = 500
export const IDLE_TURN_MAX_MS = 1500

/** Auto-advance dari Result ke Reset bila creator tidak mengonfirmasi (Req 23 AC7). */
export const RESULT_AUTO_ADVANCE_MS = 10_000

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Zona rumah sebuah sisi: separuh arena, disisipkan sejauh margin tepi.
 *
 * Margin ikut skala fighter supaya yang besar tidak menempel di dinding atau menjorok
 * melewati garis tengah lebih jauh daripada yang kecil. Pada skala 1 hasilnya identik
 * dengan sebelumnya — itu disengaja, supaya titik spawn berseed yang lama tidak bergeser.
 */
export function sideHalfBounds(side: SideId, scale = 1): Bounds {
  const margin = FIGHTER_EDGE_MARGIN * scale
  return side === 'a'
    ? { minX: margin, maxX: ARENA_MIDLINE - margin, minY: SPAWN_Y_MIN, maxY: SPAWN_Y_MAX }
    : {
        minX: ARENA_MIDLINE + margin,
        maxX: ARENA_MAX - margin,
        minY: SPAWN_Y_MIN,
        maxY: SPAWN_Y_MAX,
      }
}

/**
 * Fighter selalu tetap di separuh miliknya (Req 7 AC3, Req 8 AC1).
 *
 * Berlaku di setiap state — menyerang, cooldown, atau menganggur — karena satu-satunya
 * gerak fighter adalah wander acak, tidak pernah mengejar. Hanya projectile yang
 * menyeberang. Serangan tidak digerbang jarak (Req 9 AC1), jadi pertarungan tidak pernah
 * buntu terlepas dari seberapa jauh dua fighter berdiri dari garis tengah.
 */
export function clampToSideHalf(p: Vec2, side: SideId, scale = 1): void {
  const b = sideHalfBounds(side, scale)
  const margin = FIGHTER_EDGE_MARGIN * scale
  p.x = clamp(p.x, b.minX, b.maxX)
  p.y = clamp(p.y, ARENA_MIN + margin, ARENA_MAX - margin)
}

/** Dipakai untuk membuang projectile yang lolos keluar arena (Req 26 AC5). */
export function isOutsideArena(p: Vec2): boolean {
  return p.x < ARENA_MIN || p.x > ARENA_MAX || p.y < ARENA_MIN || p.y > ARENA_MAX
}

/** Maksimum korban satu nuke (Req 14 AC2). */

/** Titik tengah separuh arena milik sebuah sisi — pusat ledakan nuke (Req 14 AC2). */
export function sideHalfCenter(side: SideId): { x: number; y: number } {
  const half = ARENA_MIDLINE / 2
  return { x: side === 'a' ? half : ARENA_MIDLINE + half, y: (ARENA_MIN + ARENA_MAX) / 2 }
}
