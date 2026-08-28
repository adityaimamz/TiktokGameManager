/**
 * Nama penonton sintetis — untuk bot latihan maupun viewer simulator.
 *
 * "Bot 3" di TOP FIGHTERS langsung membocorkan bahwa arenanya sedang diisi sendiri;
 * penonton sungguhan bernama seperti orang. Hanya huruf kecil dan angka, 3–16 karakter,
 * karena Req 18 AC1 menuntut handle alfanumerik.
 */
const VIEWER_NAME_SEED: readonly string[] = [
  'rikaayu',
  'dwiayuu',
  'sitinurr',
  'ayuwandira',
  'putrimelati',
  'indahsari',
  'lestariwati',
  'nurhaliza',
  'windaa',
  'sasaaa',
  'echaa',
  'nabilaa',
  'zahraa',
  'kirana',
  'rizkyp',
  'andipratama',
  'bagusdwi',
  'dimasarya',
  'fajarr',
  'gilangs',
  'hendraa',
  'ikhsann',
  'jokoo',
  'kevinn',
  'lukmanul',
  'agusss',
  'bayuu',
  'candraa',
  'abangnaga',
  'ayahzaki',
  'bundaicha',
  'kakraka',
  'omtelolet',
  'bocahapi',
  'anaksenja',
  'jagoanneon',
  'ratuwarkop',
  'sultanmie',
  'bocilgamer',
  'mbaklinda',
  'masagus',
  'wongkito',
  'anakrantau',
  'tukangbakso',
  'ojolonline',
  'sopirtruk',
  'kucingoren',
  'penontonn',
]

/**
 * Handle ke-`n`, unik untuk setiap `n`.
 *
 * Sesudah daftar habis ia mengulang dengan angka di belakang (`rikaayu2`) — persis cara
 * orang memilih handle saat yang polos sudah dipakai, dan menjaga nama tetap tidak kembar
 * tanpa perlu menyimpan apa pun.
 */
export function viewerName(n: number): string {
  const base = VIEWER_NAME_SEED[n % VIEWER_NAME_SEED.length] as string
  const round = Math.floor(n / VIEWER_NAME_SEED.length)
  return round === 0 ? base : `${base}${round + 1}`
}
