/**
 * Membakukan teks chat sebelum dicocokkan dengan keyword.
 *
 * Tanda baca diubah jadi SPASI, bukan dihapus, supaya "messi/ronaldo" tidak menyatu
 * jadi satu kata dan lolos dari pencocokan per-kata.
 */
export function normalizeChatText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
