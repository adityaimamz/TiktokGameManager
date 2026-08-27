/** Kuadrat jarak Euclid. Menghindari akar kuadrat pada jalur panas. */
export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/**
 * Perbandingan KURANG DARI ketat: dua lingkaran yang bersentuhan tepat tidak
 * dianggap bertumpang tindih.
 */
export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const radii = ar + br
  return distanceSquared(ax, ay, bx, by) < radii * radii
}
