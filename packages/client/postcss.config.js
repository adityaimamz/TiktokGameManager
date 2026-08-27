import { fileURLToPath } from 'node:url'

/**
 * Config Tailwind ditunjuk eksplisit, bukan dibiarkan dicari sendiri.
 *
 * Tailwind mencari `tailwind.config.js` mulai dari `process.cwd()`, dan seluruh skrip npm
 * dijalankan dari root repo — di sana berkasnya tidak ada. Yang terjadi bukan error
 * melainkan diam: Tailwind memakai config kosong, `content` jadi kosong, dan CSS yang
 * dihasilkan tidak punya satu pun utility.
 */
const config = fileURLToPath(new URL('./tailwind.config.js', import.meta.url))

export default {
  plugins: {
    tailwindcss: { config },
    autoprefixer: {},
  },
}
