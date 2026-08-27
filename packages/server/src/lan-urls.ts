import { networkInterfaces } from 'node:os'
import type { NetworkInterfaceInfo } from 'node:os'

/**
 * Alamat yang bisa dibuka device LAIN di jaringan yang sama.
 *
 * Ada karena browser tidak punya cara jujur mengetahui IP LAN-nya sendiri, sementara
 * `location.origin` di mesin creator berbunyi `http://localhost:3001` — alamat yang tidak
 * berarti apa-apa di laptop sebelah.
 *
 * Loopback disaring karena itu justru alamat yang sedang diganti; IPv6 disaring karena
 * link-local menuntut scope id yang tidak bisa ditempel begitu saja ke URL.
 *
 * Dibaca per permintaan, bukan sekali saat start: antarmuka jaringan datang dan pergi saat
 * creator berpindah Wi-Fi.
 */
export function lanUrls(
  port: number,
  read: () => NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces,
): string[] {
  const urls: string[] = []
  for (const infos of Object.values(read())) {
    for (const info of infos ?? []) {
      if (info.internal || info.family !== 'IPv4') continue
      urls.push(`http://${info.address}:${port}`)
    }
  }
  return urls
}
