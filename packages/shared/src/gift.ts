/**
 * Satu gift di katalog room TikTok.
 *
 * NAMA adalah kuncinya, bukan id: rule mencocokkan nama yang dibawa event gift, dan entri
 * seed tidak boleh mengarang id yang bisa bertabrakan dengan id room sungguhan.
 */
export interface GiftCatalogEntry {
  /** Id TikTok, atau null untuk entri seed yang tidak berasal dari room mana pun. */
  id: number | null
  name: string
  coins: number
  iconUrl: string | null
}

/**
 * Katalog cadangan: gift yang paling sering muncul, beserta nilai koinnya.
 *
 * Dipakai dua tempat — jawaban `GET /api/gifts` sebelum pernah tersambung ke room, dan
 * sumber gift simulator. Satu daftar dengan dua pembaca, bukan dua daftar yang bisa berbeda.
 */
export const GIFT_SEED: readonly GiftCatalogEntry[] = [
  { id: null, name: 'Rose', coins: 1, iconUrl: null },
  { id: null, name: 'TikTok', coins: 1, iconUrl: null },
  { id: null, name: 'Finger Heart', coins: 5, iconUrl: null },
  { id: null, name: 'Perfume', coins: 20, iconUrl: null },
  { id: null, name: 'Doughnut', coins: 30, iconUrl: null },
  { id: null, name: 'Hand Hearts', coins: 100, iconUrl: null },
  { id: null, name: 'Sunglasses', coins: 199, iconUrl: null },
  { id: null, name: 'Corgi', coins: 299, iconUrl: null },
  { id: null, name: 'Galaxy', coins: 1000, iconUrl: null },
  { id: null, name: 'Lion', coins: 29999, iconUrl: null },
]
