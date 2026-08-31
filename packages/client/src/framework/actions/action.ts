/**
 * Satu operasi diskret terhadap state game.
 *
 * Seluruh mutasi state melewati bentuk ini, sehingga sumber sebuah perubahan
 * selalu bisa dilacak dan dicatat.
 *
 * `type` dan `target` sengaja berupa string: framework tidak boleh mengetahui
 * jenis aksi atau bentuk target milik sebuah game.
 */
export interface Action<TType extends string = string> {
  type: TType
  /** Id entity, id kelompok, atau "all" — game yang menafsirkannya. */
  target: string
  value: number
  /** Durasi efek dalam milidetik. 0 berarti seketika. */
  duration: number
  /**
   * Bila true, action ini tidak pernah dibuang karena kapasitas antrian penuh.
   *
   * Dipakai untuk action yang merepresentasikan transaksi gift berbayar yang sudah
   * confirmed — kehilangan action semacam ini berarti menghilangkan sesuatu yang sudah
   * dibayar penonton. Antrian menampungnya di wadah terpisah yang tumbuh dinamis,
   * sehingga action biasa tetap bisa dibuang tanpa mempengaruhi yang dilindungi.
   */
  neverEvict?: boolean
}
