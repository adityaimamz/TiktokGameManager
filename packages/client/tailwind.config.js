import { fileURLToPath } from 'node:url'

/**
 * Glob `content` ditambatkan ke berkas config ini, bukan ke cwd.
 *
 * Tailwind me-resolve glob relatif terhadap `process.cwd()`, dan `npm run dev:client`
 * menjalankan `vite packages/client` DARI root repo — `./src/**` di sana menunjuk direktori
 * yang tidak ada, dan Tailwind diam-diam menghasilkan nol utility. Backslash Windows harus
 * dijadikan garis miring karena fast-glob memperlakukannya sebagai karakter escape.
 */
const here = fileURLToPath(new URL('.', import.meta.url)).replaceAll('\\', '/')

/**
 * Palet Interactify: dua kutub warna, satu ruang gelap.
 *
 * Biru milik Side A dan magenta milik Side B adalah satu-satunya dua warna yang boleh
 * mendominasi; sisanya derajat abu-kebiruan. Warna sisi yang SEBENARNYA tetap datang dari
 * config creator dan dipasang sebagai inline style — token di sini hanya untuk chrome
 * (aksen kartu, glow, garis tepi) yang harus tetap konsisten meski creator memilih warna
 * sisi apa pun.
 *
 * Semua nilai heksadesimal, bukan rgba(): `bg-ink/55` dan `border-tally/40` hanya bekerja
 * pada warna yang bisa Tailwind bongkar jadi channel.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: [`${here}index.html`, `${here}src/**/*.{ts,tsx}`],
  theme: {
    extend: {
      colors: {
        ink: '#05060C', // ruang gelap tempat dua kutub warna jadi satu-satunya cahaya
        rack: { DEFAULT: '#0B0D18', hi: '#12162A' }, // permukaan kartu, lalu kontrol terangkat
        // Tiga derajat garis rambut. Di atas kartu kaca semuanya nyaris putih transparan;
        // nilai pekat ini adalah pendekatannya untuk utility yang butuh warna solid.
        edge: { DEFAULT: '#232838', dim: '#1A1E2C', hi: '#2E3448' },
        signal: '#E8ECF8', // teks utama
        label: '#C3C9DC', // judul panel
        dim: '#A0A8C0', // nilai sekunder
        muted: '#787F98', // label, satuan
        faint: '#525872', // penanda, chevron
        tally: '#FF3D6E', // SIARAN — merah-magenta pil LIVE
        standby: '#FFC46B', // GLADI
        ok: '#4EE1A0', // tersambung, sesi berjalan
        // Aksen kutub. Dipakai untuk chrome, BUKAN pengganti config.sides[x].color.
        pole: { a: '#3EA6FF', b: '#FF3D8A', ult: '#A98BFF' },
      },
      fontFamily: {
        ui: ['Saira', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        data: ['"Chakra Petch"', 'ui-monospace', '"Cascadia Mono"', 'monospace'],
      },
      gridTemplateColumns: {
        // Kendali, monitor, sungai chat. Kolom tengah minmax(0,...) supaya canvas tidak
        // memaksa grid melebar melewati viewport.
        shell: '308px minmax(0, 1fr) 330px',
      },
    },
  },
  plugins: [],
}
