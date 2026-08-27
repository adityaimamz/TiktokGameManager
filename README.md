# Live Game Animator

Platform interaksi live-stream di mana penonton bermain lewat komentar, likes, dan gifts TikTok Live. Tidak ada aplikasi maupun akun untuk penonton — **chat adalah kontrolnya**.

**Battle Arena** adalah game pertama sekaligus blueprint arsitekturnya: PvP dua sisi, penonton bergabung dengan mengetik keyword, dan fighter-nya bertarung otomatis.

---

## 🎮 Cara kerjanya

Dua tab browser, satu proses:

| Tab | URL | Perannya |
| --- | --- | --- |
| **Dashboard** | `http://localhost:5173/` | Memiliki simulasi — tick loop hidup di sini |
| **OBS Overlay** | `http://localhost:5173/?stage=1` | Tidak menjalankan apa pun; menggambar apa yang disiarkan dashboard, latar transparan |

Dashboard menjalankan engine dan menyiarkan snapshot 20× per detik. Overlay hanya menggambar. Konsekuensinya disengaja: **menutup tab dashboard menghentikan match** (tab-nya memperingatkan lebih dulu).

---

## ✨ Fitur

### Platform

- 🎛️ **Dashboard kreator** — konfigurasi game, koneksi TikTok, kontrol sesi, statistik, soundboard, comment reader
- 📺 **Overlay OBS** — browser source berlatar transparan, bisa jalan di PC yang sama atau device lain
- 💬 **Chat engine** — normalisasi event lintas sumber di balik satu interface `ChatSource` (TikTok Live + simulator)
- 🔊 **Audio** — sintesis Web Audio untuk efek gameplay, **plus** 12 berkas `.ogg` untuk cue ultimate (launch + impact per varian)
- 💾 **Persistence** — Postgres via Drizzle untuk statistik lintas sesi; opsional, game jalan penuh tanpanya
- 📡 **Sinkronisasi tiga transport** — `BroadcastChannel` (satu PC), `storage` (fallback), dan `ws` (lintas device lewat server)
- 🖼️ **Media** — unggah latar arena, musik, dan klip filler; alert bergambar

### Battle Arena

- ⚔️ **Combat otomatis** — tidak ada kontrol manual, fighter menembak sendiri
- 🎯 **Dua sisi** — ronde berakhir saat satu sisi mencapai `killsToWinRound`; match best-of-N
- 💝 **Gift memicu aksi** — heal, grow, damage boost, attack speed, dan ultimate
- 👍 **Like menyembuhkan** — tiap N like memberi heal
- 💥 **Enam varian ultimate** — `missileRain`, `laser`, `bomb`, `lightning`, `singularity`, `chainFreeze`, masing-masing punya animasi sendiri dan bisa dipilih per trigger rule
- 🧪 **Simulator** — penonton dan event sintetis untuk uji coba tanpa siaran sungguhan
- 📊 **Feed & papan** — kill feed, join feed, riwayat gift, top fighters, leaderboard

---

## 🏗️ Arsitektur

Monorepo workspace dengan **empat lapisan berurutan satu arah**:

```
shared  ←  framework  ←  platform  ←  games  ←  ui
```

| Lapisan | Boleh mengimpor | Tahu tentang |
| --- | --- | --- |
| `framework/` | `shared` | tidak ada yang game-specific — bahkan tidak tahu Battle Arena ada |
| `platform/` | `shared`, `framework` | game hanya lewat registry, tidak pernah per nama |
| `games/*/` | `shared`, `framework`, `platform` | domainnya sendiri |
| `ui/` | semuanya | — |

```
packages/
├── shared/      # Tipe & utilitas lintas package (barrel tunggal)
├── client/
│   ├── framework/    # RNG, clock, tick scheduler, entity/effect pool, action queue
│   ├── platform/     # chat, signals, persistence, audio, media, speech, registry, analytics
│   ├── games/        # battle-arena/ (engine, renderer, config, triggers)
│   └── ui/           # React: dashboard, StagePage, ErrorBoundary
└── server/      # Express + WebSocket + TikTok connector + Drizzle
```

Aturannya ditegakkan **mesin, bukan konvensi**:

- `.dependency-cruiser.cjs` — melarang impor ke atas, impor antar-game, dan circular dependency
- `framework/boundaries.test.ts` — menggagalkan build kalau berkas di `framework/` menyebut `battle`/`arena`/`fighter`, atau memanggil `Math.random()`/`Date.now()`
- `renderer/boundaries.test.ts` — menggagalkan build kalau renderer mengimpor `state.ts`/`engine.ts`/`host.ts`

Kalau sebuah task terasa menuntut salah satu penjaga dilonggarkan, batasnya yang salah ditarik.

### Determinisme

Tidak ada `Math.random()` maupun `Date.now()` langsung di `framework/` dan `games/`. Keduanya diinjeksi:

- `framework/rng.ts` — `createRng(seed)`, mulberry32
- `framework/clock.ts` — `systemClock()` di produksi, `createManualClock()` di test

Itulah yang membuat "seed 42 → pemenang yang sama tiap kali" bisa diuji, dan karenanya TDD di logika game jadi mungkin.

### Snapshot adalah satu-satunya jalan ke layar

Tiap tick, state numerik di-encode ke satu `Float32Array`. **Setiap** renderer — termasuk tab yang memiliki engine — membaca hanya hasil decode-nya. Itu yang membuat "overlay menampilkan sesuatu yang beda dari dashboard" jadi mustahil, bukan sekadar tidak mungkin.

---

## 🚀 Quick Start

### Prasyarat

- **Node.js 22** — versinya dipatok di `.nvmrc`; minimum yang jalan adalah 20.6
- **npm** (bawaan Node)

### Instalasi

```bash
git clone https://github.com/adityaimamz/TiktokGameManager.git
cd TiktokGameManager
npm install
```

### Konfigurasi

```bash
copy .env.example .env      # Windows
cp .env.example .env        # macOS / Linux
```

`.env.example` sudah berisi nilai yang benar untuk dev lokal. Yang **wajib ada** cuma satu:

```env
# Dev lokal: jalan tanpa APP_KEY. JANGAN disetel di deploy publik.
ALLOW_OPEN_ACCESS=1
```

> ⚠️ **Tanpa `ALLOW_OPEN_ACCESS=1` atau `APP_KEY`, server menolak boot.** Itu disengaja — lihat [Kunci aplikasi](#kunci-aplikasi). Pesan penolakannya menyebut persis variabel yang harus diisi.

Sisanya opsional:

```env
DATABASE_URL=      # kosong = jalan tanpa statistik lintas sesi
PORT=3001          # default 3001
EULER_API_KEY=     # kosong = free tier EulerStream
```

Empat variabel lain (`UPLOAD_DIR`, `CORS_ORIGIN`, `CLIENT_DIST`, dan `VITE_SERVER_URL` milik client) hanya relevan saat deploy dan punya default yang benar untuk dev. Semuanya terdokumentasi di `.env.example` dan `packages/client/.env.example`.

### Menjalankan

```bash
npm run dev            # client (:5173) + server (:3001)
npm run dev:client     # client saja — tanpa TikTok connector maupun database
npm run dev:server     # server saja
```

Buka `http://localhost:5173/`, klik **Start Simulator**, lalu buka `http://localhost:5173/?stage=1` di tab kedua.

### Overlay di device lain

Overlay tidak harus jalan di PC yang sama. Top bar dashboard mencetak alamat yang benar dari sudut pandang device lain, beserta jumlah overlay jauh yang terhubung.

| Di mana OBS jalan | URL | Jalurnya |
| --- | --- | --- |
| PC yang sama | `http://localhost:3001/?stage=1` | `BroadcastChannel`, **nol byte** lewat jaringan |
| Device lain, satu LAN | `http://<ip-lan>:3001/?stage=1` | WebSocket lewat server |
| Lewat tunnel / deploy | `https://<domain>/?stage=1&k=<kunci>` | WebSocket lewat server |

> **Jangan tambahkan `&k=` untuk overlay di PC yang sama.** Adanya `k` membuat halaman menganggap dirinya jauh dan memaksa transport WebSocket. Tanpa `k` di `localhost` ia memakai `BroadcastChannel` — dan halaman statisnya memang tidak butuh kunci.

Relay hanya menyala saat ada overlay jauh yang mendengarkan. Saat menyala anggarannya ~0,6 Mbps pada config bawaan dan ~2,2 Mbps di plafon 200 fighter — naik dari browser dashboard, turun sebesar itu ke tiap overlay. Kalau upstream siaran TikTok-mu sudah mepet, ini terasa.

> Alamat LAN menuntut server yang menyajikan halamannya: `npm run build` lalu `npm start` (port 3001). Vite dev server di 5173 hanya untuk PC ini.

---

## 🧪 Testing & gerbang

```bash
npm test               # seluruh suite, sekali jalan
npm run test:watch     # watch mode
npm run typecheck      # tsc di tiga package
npm run depcruise      # penegakan batas modul
npm run build          # bundle produksi Vite
npm run verify         # keempatnya, berurutan
```

```bash
npx vitest run packages/client/src/games/battle-arena/match.test.ts   # satu berkas
npx vitest run -t "replays identically from the same seed"            # satu test per nama
npx vitest run packages/client/src/games/battle-arena/config/         # satu direktori
```

**`npm run verify` adalah gerbangnya.** Keempatnya memeriksa hal yang berbeda dan tidak satu pun menggantikan yang lain. Saat ini: **1661 test lulus**, 27 skip (repository test yang butuh `TEST_DATABASE_URL`).

CI menjalankan gerbang yang sama di setiap push dan pull request — `.github/workflows/verify.yml`.

### Filosofi test

- **Deterministik** — seeded RNG + injected clock = replay identik
- **Berbasis snapshot** — canvas diuji lewat recording context, memeriksa daftar panggilan, bukan piksel
- **Test yang butuh DOM** membawa docblock `// @vitest-environment jsdom` di baris 1 dan memanggil `afterEach(cleanup)` sendiri — Vitest globals mati

### Database

```bash
npm run db:generate        # buat berkas migrasi
npm run db:migrate         # jalankan lokal (membaca .env)
npm run db:migrate:deploy  # jalankan di host deploy (tanpa berkas .env)
```

---

## 📖 Cara main

### Sebagai kreator

1. Buka dashboard, konfigurasi game (HP, damage, warna sisi, pemetaan gift)
2. Sambungkan ke TikTok Live, atau jalankan Simulator untuk uji coba
3. Tambahkan overlay sebagai **Browser Source** di OBS
4. Mulai match

### Sebagai penonton

| Aksi | Caranya |
| --- | --- |
| Gabung sisi | Ketik keyword sisi di chat (bawaan: `a` atau `b`) |
| Heal | Kirim like |
| Grow, heal besar, damage boost | Kirim gift sesuai legend di layar |
| Ultimate | Kirim gift bernilai tinggi |

Legend di layar dibangkitkan dari trigger rule yang aktif, jadi ia tidak bisa berbohong soal apa yang harus dikirim.

### Aturan yang tidak terlihat dari layar

- **Fighter tidak pernah menyeberangi garis tengah** dan tidak pernah mendekati musuh. Hanya tembakannya yang menyeberang.
- **Mati bukan berarti keluar.** Fighter yang mati tetap terdaftar tapi berhenti digambar; ronde baru menghidupkan semuanya tanpa penonton perlu mengetik ulang.
- **Tidak ada respawn otomatis.** Mengetik keyword lagi adalah satu-satunya jalan kembali — itu keputusan kreator, bukan fitur yang tertinggal.
- **Mencapai `killsToWinRound` adalah satu-satunya cara memenangkan ronde.** Sisi yang habis tersapu tidak otomatis kalah; skor berhenti naik sampai ada yang bergabung lagi.

---

## 🛠️ Tech stack

| Bagian | Teknologi |
| --- | --- |
| Build | Vite 5, TypeScript strict, npm workspaces |
| UI | React 18, Tailwind CSS |
| Render | Canvas 2D (target 200 fighter @ 60 FPS) + WebGL post-process lewat `three` untuk jalur FX ultimate |
| Server | Express 5, `ws`, `tiktok-live-connector` |
| Data | Drizzle ORM, PostgreSQL (Neon) |
| Test | Vitest, Testing Library, dependency-cruiser |

---

## 📁 Berkas penting

```
packages/client/src/
├── framework/
│   ├── rng.ts                    # createRng — mulberry32
│   ├── clock.ts                  # systemClock / createManualClock
│   ├── loop/tick-scheduler.ts    # 50 ms tetap, maksimum 3 tick catch-up
│   └── boundaries.test.ts        # penjaga lapisan
├── platform/
│   ├── chat/source.ts            # interface ChatSource
│   ├── signals/                  # broadcast, storage, ws, fanout
│   └── registry/                 # daftar game, buta terhadap nama game
├── games/battle-arena/
│   ├── engine.ts                 # state machine + tick scheduler
│   ├── simulation.ts             # urutan enam fase tick
│   ├── combat.ts                 # drain action, damage, kematian, skor
│   ├── snapshot.ts               # encoder Float32Array
│   ├── config/                   # schema, defaults, validasi, migrasi
│   └── renderer/
│       ├── canvas.ts             # penggambar utama
│       └── fx/                   # jalur FX ultimate + WebGL post-process
└── ui/
    ├── App.tsx                   # pemilihan rute + ErrorBoundary
    ├── StagePage.tsx             # halaman overlay
    ├── ErrorBoundary.tsx         # penahan exception render
    └── dashboard/Dashboard.tsx   # pemilik engine

packages/server/src/
├── index.ts          # bootstrap: penjaga boot, heartbeat, handler sinyal
├── env.ts            # readEnv + appKeyRefusal
├── heartbeat.ts      # ping/pong WebSocket, buang soket hantu
├── shutdown.ts       # penutupan tertib saat SIGTERM
├── log.ts            # satu baris JSON per peristiwa
├── signal-hub.ts     # relay ke overlay jauh
├── ws.ts             # hub dashboard
└── db/               # skema & migrasi Drizzle
```

---

## ☁️ Deploy

### Pertanyaan pertama: apakah perlu cloud sama sekali?

Tiga fakta yang membuat jawabannya sering **tidak**:

- Engine hidup di tab dashboard kreator, bukan di server. Server hanya mengurus koneksi TikTok, relay overlay, upload, dan database.
- OBS di PC yang sama memakai `BroadcastChannel` — **nol byte** lewat server.
- Alamat LAN sudah dicetak dashboard, jadi overlay di HP atau laptop sebelah sudah jalan tanpa deploy apa pun.

Dan risiko terbesar deploy cloud — **TikTok memblokir IP datacenter jauh lebih sering daripada IP rumah** — hilang sepenuhnya kalau connector jalan dari koneksi rumahmu.

### Bentuk yang didukung

| Bentuk | Chat TikTok | Upload | Statistik DB | Catatan |
| --- | --- | --- | --- | --- |
| **Cloudflare Tunnel + server lokal** | ✅ | ✅ | ✅ | Gratis, IP rumah, disk sendiri. **Rekomendasi** |
| **Satu service Node** (Railway / Render / Fly.io / VPS) | ⚠️ | ✅ | ✅ | Jalan, tapi IP datacenter — uji TikTok dulu |
| Host serverless (Vercel, Netlify Functions) | ❌ | ❌ | ✅ | **Tidak bisa** — WS hub dan koneksi TikTok butuh proses hidup |

Host-nya harus bisa memegang **proses hidup**, **WebSocket**, dan **disk permanen**.

---

## Opsi A — Cloudflare Tunnel di atas server lokal

Gratis permanen, WebSocket didukung, disk-nya disk sendiri, dapat HTTPS, tanpa port forwarding dan tanpa aturan firewall — `cloudflared` hanya membuat koneksi keluar. Dan TikTok melihat IP rumah.

### 1. Pasang cloudflared

```powershell
winget install --id Cloudflare.cloudflared    # Windows
```

```bash
brew install cloudflared                       # macOS
```

Tutup dan buka ulang terminal, lalu pastikan dengan `cloudflared --version`.

### 2. Jalankan server mode produksi

```powershell
npm run build
$env:APP_KEY = "<24+ karakter acak>"
npm start
```

```bash
npm run build
APP_KEY="<24+ karakter acak>" npm start
```

> **`npm start` tidak membaca `.env`** — beda dari `npm run dev` yang memakai `--env-file`. Env var harus disetel di shell, dan `$env:` di PowerShell hanya bertahan selama sesi terminal itu.

Bangkitkan kuncinya dengan stdlib Node — `base64url` sengaja, karena kunci ini hidup di URL overlay:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Kalau benar, keluar dua baris JSON:

```json
{"t":"...","lvl":"info","msg":"listening","port":3001}
{"t":"...","lvl":"warn","msg":"DATABASE_URL is not set — match results will not be stored"}
```

Baris kedua normal kalau belum memakai database.

### 3a. Quick tunnel — untuk mencoba, 30 detik

Terminal **kedua**, biarkan yang pertama jalan:

```bash
cloudflared tunnel --url http://localhost:3001
```

Keluar URL `https://<kata-acak>.trycloudflare.com`. Tanpa akun, tanpa domain.

> **URL-nya berubah setiap kali dijalankan ulang**, jadi browser source OBS harus di-paste ulang tiap sesi. Cloudflare sendiri menyebut quick tunnel sebagai best-effort, bukan untuk produksi. Cukup untuk membuktikan semuanya bekerja.

### 3b. Named tunnel — URL tetap, jalan otomatis

Butuh satu domain yang nameserver-nya sudah di Cloudflare.

```bash
cloudflared tunnel login
cloudflared tunnel create lga
cloudflared tunnel route dns lga lga.domainmu.com
```

`create` mencetak **Tunnel ID** — catat. Buat `~/.cloudflared/config.yml` (Windows: `%USERPROFILE%\.cloudflared\config.yml`):

```yaml
tunnel: <TUNNEL-ID>
credentials-file: C:\Users\<kamu>\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: lga.domainmu.com
    service: http://localhost:3001
  - service: http_status:404
```

```bash
cloudflared tunnel run lga
```

Kalau sudah mantap, pasang sebagai service supaya ikut nyala bersama komputer:

```bash
cloudflared service install
```

WebSocket tidak butuh konfigurasi tambahan — ingress HTTP sudah meneruskannya.

### 4. Pasang di OBS

| Overlay di mana | URL |
| --- | --- |
| PC yang sama | `http://localhost:3001/?stage=1` — **tanpa `&k=`** |
| Device lain | `https://lga.domainmu.com/?stage=1&k=<kunci>` |

Dashboard: buka `https://lga.domainmu.com/?k=<kunci>` sekali. Kuncinya disimpan browser dan dihapus dari URL, jadi tidak ikut terbaca saat share screen.

### Yang perlu diketahui

- **Heartbeat WebSocket paling berguna justru di sini.** Proxy memutus koneksi diam tanpa selalu mengirim `close`; ping 30 detik menjaga soket hidup sekaligus membuang yang mati, supaya penjaga "relay diam saat tidak ada pendengar" tetap bekerja.
- **Batas upload Cloudflare free 100 MB per request** — limit aplikasi ini 50 MB, jadi aman.
- **Match tetap berhenti kalau komputermu tidur.** Tunnel tidak mengubah itu; engine ada di tab dashboard, di komputer yang sama.

---

## 🚂 Opsi B — Satu service Node (Railway / Render / Fly.io)

Express menyajikan hasil `npm run build` **di samping** `/api` dan `/ws` — satu proses, satu domain, satu deploy. Karena satu origin, `VITE_SERVER_URL` dan `CORS_ORIGIN` tidak dipakai sama sekali.

### 0. Sebelum push

```bash
npm run verify
```

`dist/`, `uploads/`, dan `.env` sudah ada di `.gitignore` — host yang membangun ulang, bukan repo.

### 1. Database (opsional)

Tanpa `DATABASE_URL` game tetap bisa dimainkan penuh; yang hilang hanya statistik lintas sesi (route DB menjawab 503, sisanya jalan). Kalau mau: buat project di [Neon](https://neon.tech), salin connection string pooled.

### 2. Buat service

- **Railway** — *New Project → Deploy from GitHub repo*
- **Render** — *New → Web Service → Node*

### 3. Build, start, health check

| Field | Nilai |
| --- | --- |
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

`--include=dev` **wajib**: host menyetel `NODE_ENV=production`, dan tanpa flag itu npm melewati devDependencies sehingga `vite` tidak ada dan build gagal. `tsx` sengaja duduk di `dependencies`, karena ia yang menjalankan server saat runtime.

Versi Node datang dari `.nvmrc` (22). Nixpacks di Railway dan `actions/setup-node` di CI sama-sama membacanya, jadi keduanya tidak bisa memilih mayor yang berbeda.

### 4. Environment variables

```bash
DATABASE_URL=postgresql://...   # dari langkah 1. Kosong = jalan tanpa statistik
UPLOAD_DIR=/data/uploads        # arahkan ke volume (langkah 5), bukan disk ephemeral
EULER_API_KEY=                  # opsional; kosong = free tier EulerStream
APP_KEY=<24+ karakter acak>     # WAJIB — server MENOLAK boot tanpanya
```

Yang **tidak** boleh disetel:

| Variabel | Alasan |
| --- | --- |
| `PORT` | diisi host otomatis; menyetelnya manual membuat health check gagal |
| `ALLOW_OPEN_ACCESS` | membuka panel kontrol penuh untuk siapa pun yang menemukan alamatnya |
| `VITE_SERVER_URL` | halaman dan API satu origin — biarkan kosong |
| `CORS_ORIGIN` | idem; header CORS tidak diperlukan pada satu origin |
| `CLIENT_DIST` | default `packages/client/dist` sudah benar |

### 5. Volume untuk upload

- **Railway** — *Add Volume*, mount path `/data`
- **Render** — *Disk*, mount path `/data`

Tanpa ini, latar dan musik yang diunggah hilang setiap restart sementara config yang menunjuk ke sana tetap tersimpan — hasilnya latar gagal dimuat tanpa pesan kesalahan. Server memperingatkan lewat log kalau `UPLOAD_DIR` tidak bisa ditulis.

### 6. Migrasi (sekali, kalau memakai DB)

```bash
npm run db:migrate:deploy
```

Yang biasa (`npm run db:migrate`) membaca `.env` lokal, yang tidak ada di host — itu bedanya.

### 7. Verifikasi

```bash
curl https://<domain>/api/health     # {"ok":true}
curl -I https://<domain>/            # HTTP/2 200, content-type: text/html
```

### ⚠️ Sebelum mengandalkannya untuk siaran

**TikTok memblokir IP datacenter jauh lebih sering daripada IP rumah.** Sambungkan ke satu live sungguhan, biarkan sepuluh menit, dan catat apakah free tier EulerStream bertahan. Kalau tidak, pilihannya `EULER_API_KEY` berbayar — atau connector tetap jalan di komputer rumah ([Opsi A](#opsi-a--cloudflare-tunnel-di-atas-server-lokal)).

---

## Kunci aplikasi

Tanpa `APP_KEY`, siapa pun yang membuka alamat deploy mendapat panel kontrol penuh — bisa menyambungkan akun TikTok-mu, memulai match, dan mengunggah berkas. Yang paling berbahaya bukan pembacaan data, melainkan `POST /api/chat/connect`, yang menentukan akun mana yang server ini sambungkan.

Karena itu **server menolak boot** saat `APP_KEY` kosong, dan menolak kunci yang lebih pendek dari 24 karakter — kunci overlay OBS tinggal di URL selamanya, jadi kunci pendek di sana setara tanpa kunci.

Satu-satunya jalan keluar adalah `ALLOW_OPEN_ACCESS=1`, dan ia untuk dev lokal. Namanya sengaja tidak enak dibaca. Ia juga sengaja **bukan** tebakan atas `NODE_ENV` maupun `RAILWAY_*`: penjaga yang menebak nama variabel milik satu host akan diam-diam mati di host berikutnya yang menamainya lain.

| Pemakai | Cara membawa kunci |
| --- | --- |
| Dashboard | Buka `https://<domain>/?k=<kunci>` sekali. Kunci disimpan browser dan **dihapus dari URL** |
| Overlay OBS | `https://<domain>/?stage=1&k=<kunci>` — permanen, OBS tidak punya tempat mengetik |

Halaman statis sengaja tetap terbuka — dashboard harus bisa dimuat untuk meminta kunci. Yang dijaga adalah `/api` dan `/ws`. `GET /api/health` juga tetap terbuka, karena host deploy memanggilnya tanpa kunci.

**Rotasi kunci menuntut URL OBS diperbarui.** Itu konsekuensi yang diterima, bukan yang terlupakan.

---

## 🛡️ Ketahanan produksi

Yang dipasang supaya kegagalan tidak diam-diam:

| Penjaga | Menutup apa |
| --- | --- |
| `ErrorBoundary` di `ui/App.tsx` | Exception render tidak lagi memutihkan tab. Overlay OBS memulihkan diri sekali, dashboard menawarkan tombol muat ulang. **Match tetap berhenti** — boundary menyelamatkan tab, bukan engine |
| Heartbeat WebSocket 30 dtk | Soket setengah terbuka lewat proxy tidak pernah mengirim `close`; tanpa ping, satu overlay hantu membuat relay mengirim 20 snapshot/detik ke tidak seorang pun selamanya |
| `SIGTERM` → penutupan tertib | Soket ditutup dengan kode 1012 supaya klien menyambung lagi lewat backoff, bukan menggantung sampai timeout TCP |
| `uncaughtException` → keluar 1 | State proses sudah tidak diketahui; host me-restart dalam dua detik |
| `unhandledRejection` → log saja | Sebagian besar berasal dari penyimpanan opsional yang memang dirancang ditelan; menjatuhkan siaran karena satu insert gagal adalah pertukaran yang salah |
| Log satu baris JSON | Host bisa menyaringnya. Format bebas tidak bisa |
| Probe tulis `UPLOAD_DIR` saat boot | Menangkap `UPLOAD_DIR` yang tidak menunjuk volume — gejalanya baru muncul berminggu-minggu kemudian sebagai latar yang hilang |

Rate limiting **sengaja tidak dibangun**: dengan `APP_KEY` wajib, `/api` tertutup dan permukaan terbuka tinggal halaman statis serta `/api/health`.

Hal lain:

- `.env` tidak di-commit; `.env.example` templatnya
- Header CORS hanya dipasang saat `CORS_ORIGIN` diisi, dan hanya untuk origin persis itu — bukan `*`
- Nama berkas upload dibangkitkan server dan divalidasi regex saat dibaca; nama dari klien tidak pernah menyentuh path

---

## 🧯 Troubleshooting

| Gejala | Sebab & perbaikan |
| --- | --- |
| Server menolak boot, pesan menyebut `APP_KEY` | Isi `ALLOW_OPEN_ACCESS=1` di `.env` (dev) atau `APP_KEY` 24+ karakter (deploy) |
| `npm start` menolak boot padahal `.env` sudah benar | `npm start` **tidak** membaca `.env` — setel env var di shell |
| Build gagal, `vite: not found` | Build command tidak memakai `--include=dev` |
| Start gagal, `Cannot find package 'tsx'` | Dependencies ter-prune; install ulang tanpa `--omit=dev` |
| Halaman 404 tapi API jalan | `npm run build` tidak ikut jalan, atau `CLIENT_DIST` salah |
| `/api/matches` menjawab 503 | `DATABASE_URL` kosong. Perilaku sengaja, bukan error |
| `database tables are missing` | `npm run db:migrate:deploy` belum dijalankan di host |
| Semua `/api` menjawab 401 | Dashboard belum pernah dibuka dengan `?k=<kunci>` di browser ini |
| Overlay jauh menampilkan "waiting" terus | `k` salah atau tidak ada padahal `APP_KEY` diset; soketnya ditolak server |
| Overlay di device lain kosong | Alamatnya `localhost` — pakai alamat yang dicetak top bar |
| Latar/musik hilang setelah restart | `UPLOAD_DIR` tidak menunjuk volume; cek peringatan di log boot |
| Test client gagal, `Cannot resolve @lga/shared` | Symlink workspace rusak (biasanya setelah folder repo dipindah) — `npm install` |

---

## 📊 Status

| Fase | Isi | Status |
| --- | --- | --- |
| **Fase 1** | Fondasi & framework, engine headless, rendering & overlay, server & dashboard | ✅ |
| **Fase 2** | Aksi gift, feed & death fade, engine ultimate + enam varian, Ultimate FX Lab (WebGL) | ✅ |
| **Fase 3** | Statistik, soundboard & alert, comment reader | ✅ |
| **Fase 4** | Pemulihan overlay, overlay lintas-device (`ws` + `SignalHub` + `APP_KEY`), audio ultimate, rail legend & filler media | ✅ |
| **Fase 5** | Kesiapan produksi: ErrorBoundary, heartbeat, penutupan tertib, log JSON, penjaga boot, CI | ✅ kode |

### Yang masih terutang

- **Uji terima FX di atas latar terang.** Overlay saat ini mengambil jalur datar lewat prop `flatFx` di `StagePage`. Itu perancah, bukan opsi — dibongkar setelah jalur FX terbukti dengan mata di atas sumber terang.
- **Uji terima dua device sungguhan.** Deploy atau tunnel membuatnya murah dijalankan.
- **Sanity check TikTok dari IP datacenter**, kalau memilih Opsi B.
- **Deskripsi node graphify** — 2/2101 terisi, jadi panel entity di Ontology Studio kosong. `graphify describe .` yang mengisinya.

### Arah berikutnya

- `ChatSource` kedua (YouTube Live) — abstraksinya belum pernah diuji dengan implementasi kedua
- Game kedua di atas `platform/registry` — batasnya belum pernah diuji dengan penghuni kedua
- Keputusan ketahanan engine: terima batasan tab, simpan state ke `localStorage`, atau pindahkan tick loop ke server

---

## 🤝 Kontribusi

- **Conventional Commits**, berskop lapisan: `feat(framework):`, `feat(battle-arena):`, `feat(platform):`, `feat(ui):`, `chore(build):`
- **TDD** untuk semua logika game
- **Satu commit per task** kecuali diminta sebaliknya
- `npm run verify` harus hijau sebelum apa pun disebut selesai

---


## 📄 Lisensi

Private project.

---

**Battle Arena adalah game pertama sekaligus blueprint arsitektur untuk yang berikutnya.**
