/**
 * Lintasan satu rudal, DISELESAIKAN ULANG DARI NOL SETIAP FRAME.
 *
 * Steering yang jujur butuh heading frame sebelumnya, dan menyimpannya melanggar dua hal
 * sekaligus: aturan "bentuk prosedural tidak di-cache", dan — yang lebih besar — jaminan
 * bahwa tab dashboard dan tab overlay mustahil menggambar hal yang berbeda. Keduanya punya
 * timing frame yang berbeda, jadi integrasi yang berkelanjutan pasti menyimpang.
 *
 * Menyelesaikannya dari nol tiap frame membuat `(progress, posisi target)` yang sama selalu
 * menghasilkan lintasan yang sama, sementara turn rate tetap benar-benar membatasi: rudal
 * yang tidak sanggup berbelok cukup tajam benar-benar melewati targetnya lalu berputar balik
 * di tengah terbang, tanpa dipalsukan lewat penempatan titik kendali.
 *
 * Yang TIDAK boleh diserahkan pada simulasi adalah KEDATANGANNYA. Ledakan dijadwalkan pada
 * progress tertentu dan damage-nya mendarat di tick yang dihitung engine, jadi kepala rudal
 * harus ada di sasaran pada saat itu juga — lihat blok konvergensi di kaki `steerMissile`.
 *
 * Konsekuensi yang diterima: lintasan bergeser halus saat target berjalan. Fighter bergerak
 * 5% lebar arena per detik dan terbang berlangsung sekitar satu detik, jadi pergeserannya
 * beberapa persen lebar arena — tidak terlihat.
 */

/** Langkah integrasi. Lebih halus tidak mengubah bentuknya secara terlihat. */
const STEER_DT_MS = 20

/**
 * Simpangan heading peluncuran, derajat. Ini yang membuat rudal keluar MELENGKUNG.
 *
 * Diukur, bukan dikira-kira. Pada terbang 400 px dengan turn rate bawaan, tiga indeks pertama
 * menghasilkan simpangan puncak 42/90/134 px — 10%, 22%, dan 34% dari jarak tempuhnya, jelas
 * melengkung dan jelas berbeda satu sama lain. Angka yang lebih kecil membuat rudal praktis
 * lurus (55° hanya menghasilkan 10 px, 2.5%), sementara 130° membuat rudal ketiga tidak
 * pernah cukup dekat ke sasarannya sama sekali.
 */
const INITIAL_ARC_DEG = 110

export interface MissileState {
  x: number
  y: number
  /** Heading sebagai VEKTOR SATUAN — arah nyala pendorong dan ekor. */
  hx: number
  hy: number
}

/**
 * Arah peluncuran rudal ke-`index`.
 *
 * Tandanya berganti-ganti dan besarnya bervariasi menurut indeks: itulah yang membuat delapan
 * lintasan berbeda-beda alih-alih delapan salinan. Diturunkan dari INDEKS, bukan dari angka
 * acak — renderer ada di bawah games/ tempat Math.random() dilarang, dan frame yang sama
 * harus selalu menghasilkan gambar yang sama supaya test bisa menegaskannya.
 */
export function launchHeading(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  index: number,
): { x: number; y: number } {
  const dx = tx - ox
  const dy = ty - oy
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len
  const uy = dy / len

  const sign = index % 2 === 0 ? 1 : -1
  const angle = INITIAL_ARC_DEG * sign * (0.6 + (index % 3) * 0.35) * (Math.PI / 180)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: ux * c - uy * s, y: ux * s + uy * c }
}

/**
 * Kepala rudal setelah terbang `flightMs`, mengejar `(tx, ty)`.
 *
 * LOOP DALAMNYA BEBAS TRIGONOMETRI, dan itu bukan mikro-optimasi. Heading disimpan sebagai
 * vektor satuan; arah belok datang dari tanda cross product, cukup-tidaknya dari dot product,
 * dan besar belokan per langkah KONSTAN sehingga matriks rotasinya dihitung sekali per rudal.
 * `atan2` + `cos` + `sin` per langkah akan menghabiskan sekitar 0.3 ms per frame pada beban
 * penuh — 8% anggaran, untuk sesuatu yang tidak membutuhkannya.
 *
 * `out` dimutasi dan dikembalikan: jalur ini berjalan 48 kali per frame di beban terburuk.
 */
export function steerMissile(
  ox: number,
  oy: number,
  hx0: number,
  hy0: number,
  tx: number,
  ty: number,
  flightMs: number,
  totalFlightMs: number,
  turnRateRadPerMs: number,
  speedPxPerMs: number,
  out: MissileState,
): MissileState {
  let px = ox
  let py = oy
  let hx = hx0
  let hy = hy0

  const delta = turnRateRadPerMs * STEER_DT_MS
  const cosD = Math.cos(delta)
  const sinD = Math.sin(delta)
  const step = speedPxPerMs * STEER_DT_MS

  for (let t = 0; t < flightMs; t += STEER_DT_MS) {
    const dx = tx - px
    const dy = ty - py
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 1e-6) {
      const ux = dx / len
      const uy = dy / len
      if (hx * ux + hy * uy < cosD) {
        // Error sudut melebihi jatah belok satu langkah: putar sebesar delta ke arah target.
        // Tanda cross product yang menentukan ke mana — searah atau berlawanan jarum jam.
        const s = hx * uy - hy * ux >= 0 ? sinD : -sinD
        const nx = hx * cosD - hy * s
        const ny = hx * s + hy * cosD
        hx = nx
        hy = ny
      } else {
        // Sudah cukup dekat untuk diluruskan dalam satu langkah.
        hx = ux
        hy = uy
      }
    }
    px += hx * step
    py += hy * step
  }

  /*
   * KONVERGENSI — rudal WAJIB berada persis di sasaran saat jendela terbangnya habis.
   *
   * Simulasi kejar di atas jujur secara fisika, tapi ia tidak pernah menjanjikan KEDATANGAN:
   * jarak yang sanggup ditempuhnya, `speed × flightMs`, sama sekali tidak terikat pada panjang
   * lintasan melengkung yang dibutuhkan untuk sampai. Diukur pada config bawaan, tepat saat
   * ledakan dijadwalkan kepala rudal masih 8–41% lebar arena dari sasarannya — rudal jatuh di
   * satu tempat dan ledakannya muncul di tempat lain. Jadwal ledakan tidak bisa mengalah:
   * damage-nya mendarat di tick yang dihitung engine.
   *
   * Bobotnya PANGKAT TIGA, dan itu diukur bukan dikira. Pada k=0.5 ia baru menarik 12%, jadi
   * lengkungan peluncuran tetap utuh: puncak simpangan tiga indeks pertama 22/47/65% dari
   * jarak tempuh, melawan 37/49/73% tanpa koreksi sama sekali — jelas masih melengkung, dan
   * urutan "indeks 2 paling tajam" tetap. Langkah terbesar antar-frame juga tidak bertambah
   * satu piksel pun, jadi tidak ada sentakan di ujung. Bobot yang lebih landai (k², smoothstep)
   * meluruskan lengkungannya lebih banyak tanpa membeli apa pun.
   */
  const k =
    totalFlightMs <= 0 ? 1 : flightMs <= 0 ? 0 : flightMs >= totalFlightMs ? 1 : flightMs / totalFlightMs
  const w = k * k * k
  const dxT = tx - px
  const dyT = ty - py

  /*
   * Heading diambil dari turunan lintasan yang SUDAH dikoreksi, bukan dari simulasi mentahnya.
   * P(k) = S(k)(1-w) + T·w, jadi P'(k) = S'(k)(1-w) + (T-S)·w'. Nyala pendorong dan badan rudal
   * mengikuti arah ini; memakai heading simulasi membuat keduanya menunjuk ke arah yang tidak
   * ditempuh justru pada detik-detik terakhir, saat penonton paling memperhatikan. Analitik,
   * jadi tidak ada simulasi kedua — jalur ini berjalan 48 kali per frame di beban terburuk.
   */
  const sPrime = speedPxPerMs * totalFlightMs
  const wPrime = 3 * k * k
  const vx = hx * sPrime * (1 - w) + dxT * wPrime
  const vy = hy * sPrime * (1 - w) + dyT * wPrime
  const vlen = Math.sqrt(vx * vx + vy * vy)

  out.x = px + dxT * w
  out.y = py + dyT * w
  out.hx = vlen > 1e-6 ? vx / vlen : hx
  out.hy = vlen > 1e-6 ? vy / vlen : hy
  return out
}
