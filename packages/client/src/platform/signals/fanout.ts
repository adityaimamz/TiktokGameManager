import type { SignalChannel } from './channel.js'

/**
 * Satu kanal yang isinya beberapa kanal.
 *
 * Ada karena dua penonton bisa hidup bersamaan: OBS di PC yang sama lewat
 * `BroadcastChannel`, dan OBS di device lain lewat WebSocket. Memilih salah satu berarti
 * yang lain gelap.
 *
 * Ia tidak tahu mana anggotanya yang jaringan, dan tidak boleh tahu — itu yang membuat
 * anggota ketiga bisa datang tanpa menyentuh berkas ini.
 */
export function fanoutChannel(members: readonly SignalChannel[]): SignalChannel {
  return {
    // Mode anggota pertama, bukan gabungan: yang membacanya adalah diagnostik, dan anggota
    // pertama selalu kanal lokal yang menentukan pengalaman satu-PC.
    mode: members[0]?.mode ?? 'none',
    post: (topic, payload) => {
      for (const member of members) member.post(topic, payload)
    },
    subscribe: (listener) => {
      const offs = members.map((member) => member.subscribe(listener))
      return () => {
        for (const off of offs) off()
      }
    },
    close: () => {
      for (const member of members) member.close()
    },
  }
}
