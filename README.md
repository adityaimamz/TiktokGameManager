# Live Game Animator

Platform interaksi live-stream di mana penonton dapat bermain game melalui komentar chat, likes, dan gifts TikTok Live. Tidak memerlukan aplikasi atau akun terpisah untuk penonton — chat adalah kontrolnya.

## 🎮 Tentang Project

**Live Game Animator** adalah platform web yang mengubah live-streaming menjadi pengalaman interaktif. Penonton dapat berpartisipasi dalam game secara real-time hanya dengan menggunakan fitur chat bawaan platform streaming (TikTok Live di versi awal).

**Battle Arena** adalah game pertama yang dibangun di atas platform ini: game PvP dua tim di mana penonton bergabung dengan tim dengan mengetik keyword di chat dan karakter mereka bertarung secara otomatis.

## ✨ Fitur Utama

### Platform
- 🎛️ **Dashboard Kreator** - Antarmuka untuk mengonfigurasi game, menghubungkan platform streaming, dan mengontrol sesi permainan
- 📺 **OBS Overlay** - Halaman browser-source dengan background transparan untuk di-overlay ke stream
- 💬 **Chat Engine** - Sistem normalisasi event dari berbagai platform (TikTok Live, mode demo/simulator)
- 🔊 **Audio Engine** - Sintesis sound effect berbasis Web Audio API tanpa file audio eksternal
- 💾 **Persistence Store** - Penyimpanan terpadu untuk state permainan dan statistik pemain
- 📡 **Real-time Sync** - Sinkronisasi state antara Dashboard dan OBS Overlay via BroadcastChannel

### Battle Arena Game
- ⚔️ **Combat Otomatis** - Karakter penonton bertarung otomatis tanpa kontrol manual
- 🎯 **Team-Based PvP** - Dua tim bertarung untuk mencapai target kill
- 💝 **Integrasi Gift** - Gift dari penonton memicu aksi in-game (heal, damage boost, ultimate)
- 👍 **Like Healing** - Like penonton memberikan heal ke karakter mereka
- 🎨 **Custom Configuration** - Pengaturan lengkap untuk HP, damage, attack speed, team colors, dan lainnya
- 📊 **Real-time Stats** - Score, leaderboard, dan statistik pemain ditampilkan secara real-time
- 🧪 **Simulator Mode** - Mode testing dengan penonton dan event sintetis untuk development

## 🏗️ Arsitektur

Project ini menggunakan **monorepo workspace** dengan arsitektur berlapis yang ketat:

```
packages/
├── shared/      # Type definitions & utilities bersama
├── client/      # Frontend (Vite + React + Canvas)
│   ├── framework/    # Sistem inti (RNG, clock, tick scheduler, entity pools)
│   ├── platform/     # Layer platform (chat, signals, persistence, audio)
│   ├── games/        # Game implementations (Battle Arena)
│   └── ui/           # React components & UI
├── server/      # Backend (Express + WebSocket + TikTok connector)
└── ...
```

### Aturan Dependency Berlapis

```
shared ← framework ← platform ← games ← ui
```

Setiap layer hanya boleh mengimport dari layer di sebelah kirinya. Aturan ini di-enforce oleh:
- `.dependency-cruiser.cjs` - Mencegah import ke atas, import antar-game, dan circular dependency
- `boundaries.test.ts` - Memastikan framework layer tidak mengandung logika game-specific

### Determinisme & Testing

- ❌ **Tidak ada `Math.random()` atau `Date.now()` langsung**
- ✅ Menggunakan seeded RNG (`createRng(seed)`) dan injected clock
- ✅ Replay identik dari seed yang sama untuk testing yang andal
- ✅ Test-Driven Development (TDD) untuk semua game logic

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.6
- **npm** (disertakan dengan Node.js)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd TiktokGameManager

# Install dependencies
npm install
```

### Configuration

1. Salin file environment example:
```bash
copy .env.example .env
```

2. Edit `.env` dan isi konfigurasi (opsional):
```env
# Neon Postgres (kosongkan untuk dev tanpa database)
DATABASE_URL=

# Port server (default: 3001)
PORT=3001

# EulerStream API key untuk TikTok signing (kosong = free tier)
EULER_API_KEY=
```

Empat variabel lain (`UPLOAD_DIR`, `CORS_ORIGIN`, `CLIENT_DIST`, dan `VITE_SERVER_URL` milik
client) hanya relevan saat deploy dan punya default yang benar untuk dev — semuanya
terdokumentasi di `.env.example` dan `packages/client/.env.example`. Lihat [Deploy](#️-deploy).

### Development

#### Menjalankan Development Server

```bash
# Jalankan client dan server sekaligus
npm run dev

# Atau jalankan terpisah di 2 terminal:
npm run dev:client    # Vite dev server (port 5173)
npm run dev:server    # Express + WebSocket server (port 3001)
```

#### Melihat Dashboard & Overlay

Buka 2 tab browser:

| Tab | URL | Fungsi |
|-----|-----|--------|
| Dashboard | `http://localhost:5173/` | Menjalankan simulasi — klik **Start Simulator** untuk memulai |
| OBS Overlay | `http://localhost:5173/?stage=1` | StagePage - menampilkan output visual dengan background transparan |

> **Catatan**: Menutup tab Dashboard akan menghentikan match. Tab-nya memperingatkan lebih dulu.

#### Overlay di device lain

Overlay tidak harus jalan di PC yang sama. Top bar dashboard mencetak alamat yang benar dari
sudut pandang device lain — alamat LAN saat dev lokal, origin deploy saat online — beserta
jumlah overlay jauh yang sedang terhubung.

| Di mana OBS jalan | URL | Jalurnya |
| --- | --- | --- |
| PC yang sama | `http://localhost:3001/?stage=1` | `BroadcastChannel`, nol byte lewat jaringan |
| Device lain, satu LAN | `http://<ip-lan>:3001/?stage=1` | WebSocket lewat server |
| Deploy | `https://<app>/?stage=1&k=<kunci>` | WebSocket lewat server |

Relay hanya menyala saat ada overlay jauh yang mendengarkan: dengan OBS di PC yang sama saja,
dashboard tidak mengirim satu byte pun ke atas. Saat menyala, anggarannya ~0,6 Mbps pada
config bawaan dan ~2,2 Mbps di plafon 200 fighter — naik dari browser dashboard, dan turun
sebesar itu ke tiap overlay jauh. Kalau upstream siaran TikTok-mu sudah mepet, ini terasa.

> Alamat LAN menuntut server yang menyajikan halamannya, jadi jalankan `npm run build` lalu
> `npm start` (port 3001). Vite dev server di 5173 hanya untuk PC ini.

### Testing

```bash
# Run all tests (one shot)
npm test

# Watch mode
npm run test:watch

# Test specific file
npx vitest run packages/client/src/games/battle-arena/match.test.ts

# Test by name
npx vitest run -t "replays identically from the same seed"

# Test specific directory
npx vitest run packages/client/src/games/battle-arena/config/
```

### Type Checking & Linting

```bash
# Type check semua packages
npm run typecheck

# Check module boundaries
npm run depcruise

# Build production bundle
npm run build

# Jalankan semua checks (gate sebelum commit)
npm run verify
```

> **Penting**: `npm run verify` harus sukses sebelum work dianggap selesai!

### Database

```bash
# Generate migration files
npm run db:generate

# Run migrations (lokal, membaca .env)
npm run db:migrate

# Run migrations di host deploy (tanpa file .env)
npm run db:migrate:deploy
```

## 📖 Cara Main Battle Arena

### Sebagai Kreator (Host)

1. Buka Dashboard di `http://localhost:5173/`
2. Konfigurasi game settings (HP, damage, team colors, gift mappings, dll)
3. Hubungkan ke TikTok Live atau jalankan Simulator untuk testing
4. Tambahkan OBS Overlay (`http://localhost:5173/?stage=1`) sebagai Browser Source di OBS
5. Start match dan biarkan penonton bermain!

### Sebagai Penonton

1. **Join Team** - Ketik keyword tim di chat (contoh: "red" atau "blue")
2. **Healing** - Kirim likes untuk heal karakter kamu
3. **Power-ups** - Kirim gifts untuk trigger aksi khusus:
   - Heal HP
   - Damage boost
   - Attack speed increase
   - Ultimate abilities (missile, laser, bomb, lightning)

Karakter kamu akan bertarung otomatis! Tidak ada kontrol manual.

## 🎯 Gameplay Battle Arena

- **Objective**: Tim pertama yang mencapai target kill count menang
- **Auto-Combat**: Karakter otomatis mencari dan menyerang musuh terdekat
- **Team Zones**: Arena dibagi 2 bagian - karakter hanya bisa bergerak di zona tim sendiri
- **Rejoin**: Karakter yang mati menghilang dari arena; penonton kembali dengan mengetik keyword lagi
- **Scoring**: Kill menambah score tim, stats pemain terakumulasi sepanjang match

## 🛠️ Tech Stack

### Frontend
- **Vite** - Build tool & dev server
- **React 18** - UI framework
- **Canvas 2D** - Rendering game (target: 200 fighters @ 60 FPS)
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling

### Backend
- **Express 5** - HTTP server
- **WebSocket (ws)** - Real-time communication
- **TikTok Live Connector** - Integrasi TikTok Live chat
- **Drizzle ORM** - Database toolkit
- **PostgreSQL** - Database (Neon)

### Development
- **Vitest** - Testing framework
- **Testing Library** - React component testing
- **Dependency Cruiser** - Module boundary enforcement

## 📁 Struktur File Penting

```
├── packages/
│   ├── client/src/
│   │   ├── framework/       # Core systems (RNG, clock, tick, pools)
│   │   ├── platform/        # Platform services (chat, audio, signals)
│   │   ├── games/
│   │   │   └── battle-arena/
│   │   │       ├── engine.ts      # Game logic core
│   │   │       ├── state.ts       # State management
│   │   │       ├── triggers.ts    # Chat event processing
│   │   │       ├── config/        # Configuration system
│   │   │       ├── renderer/      # Canvas & React rendering
│   │   │       └── simulator.ts   # Testing simulator
│   │   └── ui/              # React components
│   ├── server/src/
│   │   ├── index.ts         # Server entry point
│   │   └── db/              # Database layer
│   └── shared/src/          # Shared types & utilities
├── docs/                    # Design documents & specs
├── .dependency-cruiser.cjs  # Module boundary rules
├── vitest.config.ts         # Test configuration
└── tsconfig.base.json       # TypeScript config
```

## 📚 Dokumentasi

- **`req.md`** - Requirements document (38 numbered requirements)
- **`CLAUDE.md`** - Development guidance & architecture rules
- **`docs/superpowers/specs/`** - Detailed design specifications
- **`docs/superpowers/plans/`** - Implementation plans (Fase 1 = 4 plans)
- **`.graphify/GRAPH_REPORT.md`** - Codebase knowledge graph

## 🎨 Fitur Yang Akan Datang

### Fase 1 (Current)
- [x] Plan 1: Foundation & framework
- [x] Plan 2: Headless engine
- [x] Plan 3: Rendering & overlay
- [ ] Plan 4: Server & dashboard UI

### Fase 2+
- [ ] Multiple rounds (best-of-N)
- [ ] YouTube Live integration
- [ ] Leaderboards & player progression
- [ ] Additional game modes (Zombie Survival, Tower Defense)
- [ ] Gift visualization & animations

## 🤝 Contributing

Project ini mengikuti:
- **Conventional Commits** untuk commit messages
- **TDD** untuk semua game logic
- **Strict layered architecture** yang dienforce oleh tooling
- **One commit per task** kecuali diminta sebaliknya

Sebelum commit pastikan:
```bash
npm run verify  # Must pass!
```

## 📝 Testing Philosophy

- **Deterministic**: Seeded RNG & injected clock = replay yang identik
- **Fast**: Pure functions, pooled entities, minimal DOM
- **Comprehensive**: Unit tests untuk logic, integration tests untuk workflows
- **Snapshot-based**: Rendering tested via recording context, not pixels

## ☁️ Deploy

### Bentuk deploy yang didukung

| Bentuk | Chat TikTok Live | Upload | Statistik DB | Catatan |
| --- | --- | --- | --- | --- |
| **Satu service Node** (Fly.io / Railway / Render / VPS) | ✅ | ✅ | ✅ | Satu-satunya bentuk yang didukung. Express menyajikan halaman + `/api` + `/ws` dari satu proses |
| Host serverless (Vercel, Netlify Functions, dsb.) | ❌ | ❌ | ✅ | **Tidak bisa**: WebSocket hub dan koneksi TikTok butuh proses yang hidup terus |

Host-nya harus bisa memegang **proses hidup**, **WebSocket**, dan **disk permanen**.

---

### Satu deployment: Fly.io / Railway / Render

Express menyajikan hasil `npm run build` **di samping** `/api` dan `/ws` — satu proses, satu
domain, satu deploy. Karena satu origin, `VITE_SERVER_URL` dan `CORS_ORIGIN` tidak dipakai
sama sekali; biarkan kosong.

#### 0. Sebelum push

```bash
npm run verify     # test + typecheck + depcruise + build harus hijau
```

`dist/`, `uploads/`, dan `.env` sudah ada di `.gitignore` — host yang membangun ulang, bukan repo.

#### 1. Siapkan database (opsional)

Tanpa `DATABASE_URL` game tetap bisa dimainkan penuh; yang hilang hanya statistik lintas sesi
(route DB menjawab 503, sisanya jalan). Kalau mau menyimpannya:

1. Buat project di [Neon](https://neon.tech) → salin **connection string** (pooled).
2. Simpan sebagai `DATABASE_URL` di langkah 3.

#### 2. Buat service

- **Railway** — *New Project → Deploy from GitHub repo*
- **Render** — *New → Web Service → Node*

#### 3. Build, start, dan health check

| Field | Nilai |
| --- | --- |
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

`--include=dev` **wajib**: host menyetel `NODE_ENV=production`, dan tanpa flag itu npm
melewati devDependencies sehingga `vite` tidak ada dan build gagal. `tsx` sengaja duduk di
`dependencies`, bukan devDependencies, karena ia yang menjalankan server saat runtime.

#### 4. Environment variables

```bash
DATABASE_URL=postgresql://...   # dari langkah 1. Kosong = jalan tanpa statistik
UPLOAD_DIR=/data/uploads        # arahkan ke volume (langkah 5), bukan disk ephemeral
EULER_API_KEY=                  # opsional; kosong = free tier EulerStream
APP_KEY=<acak-panjang>          # WAJIB saat publik — lihat di bawah
```

#### Kunci aplikasi

Tanpa `APP_KEY`, siapa pun yang membuka alamat deploy mendapat panel kontrol penuh — bisa
menyambungkan akun TikTok-mu, memulai match, dan mengunggah berkas. Isi `APP_KEY` dengan
string acak panjang, lalu:

| Pemakai | Cara membawa kunci |
| --- | --- |
| Dashboard | Buka `https://<app>/?k=<kunci>` sekali. Kunci disimpan di browser dan **dihapus dari URL**, jadi ia tidak ikut terbaca saat share screen |
| Overlay OBS | `https://<app>/?stage=1&k=<kunci>` — permanen, karena OBS tidak punya tempat mengetik |

Halaman statisnya sengaja tetap terbuka: dashboard harus bisa dimuat untuk meminta kunci.
Yang dijaga adalah `/api` dan `/ws`. `GET /api/health` juga tetap terbuka, karena host deploy
memanggilnya tanpa kunci.

Kosong = semua terbuka, persis dev lokal. Itu yang membuat `npm run dev` tidak berubah
sedikit pun.

Yang **tidak** boleh disetel:

| Variabel | Alasan |
| --- | --- |
| `PORT` | diisi host otomatis; menyetelnya manual membuat health check gagal |
| `VITE_SERVER_URL` | halaman dan API satu origin — biarkan kosong |
| `CORS_ORIGIN` | idem; header CORS tidak diperlukan pada satu origin |
| `CLIENT_DIST` | default `packages/client/dist` sudah benar |

#### 5. Pasang volume untuk upload

- **Railway** — *Add Volume*, mount path `/data`
- **Render** — *Disk*, mount path `/data`

Tanpa ini, gambar latar dan musik yang diunggah creator hilang setiap restart, sementara
konfigurasi yang menunjuk ke sana tetap tersimpan — hasilnya latar gagal dimuat.

#### 6. Jalankan migrasi (sekali, kalau memakai DB)

Dari shell service (Render) atau `railway run`:

```bash
npm run db:migrate:deploy
```

`npm run db:migrate` yang biasa membaca `.env` lokal, yang tidak ada di host — itulah bedanya.

#### 7. Verifikasi

```bash
curl https://<domain>/api/health        # {"ok":true}
curl -I https://<domain>/                # HTTP/2 200, content-type: text/html
```

Lalu buka:

| Halaman | URL |
| --- | --- |
| Dashboard creator | `https://<domain>/` |
| Overlay OBS | `https://<domain>/?stage=1` |

Di dashboard, isi username TikTok lalu **Connect** — badge koneksi berubah `idle → connecting →
connected`. Kalau badge langsung merah, lihat troubleshooting di bawah.

#### 8. Redeploy

Push ke branch yang terhubung; host membangun ulang sendiri. Migrasi baru (`npm run
db:generate` di lokal) perlu `npm run db:migrate:deploy` sekali lagi setelah deploy.

---

### Troubleshooting

| Gejala | Sebab & perbaikan |
| --- | --- |
| Build gagal, `vite: not found` | Build command tidak memakai `--include=dev` |
| Start gagal, `Cannot find package 'tsx'` | Dependencies ter-prune; jalankan ulang install tanpa `--omit=dev` |
| Halaman 404, API jalan | `npm run build` tidak ikut jalan, atau `CLIENT_DIST` salah — Express hanya menyajikan direktori yang ada |
| Route `/api/matches` menjawab 503 | `DATABASE_URL` kosong. Ini perilaku sengaja, bukan error |
| `database tables are missing — run npm run db:migrate` | Migrasi belum dijalankan di host; `npm run db:migrate:deploy` |
| Badge koneksi merah, console `WebSocket failed` | Server tidak menyajikan halaman yang sama (deploy terpisah tanpa `VITE_SERVER_URL`), atau halaman `https:` menunjuk server `http:` |
| Latar/musik hilang setelah restart | `UPLOAD_DIR` tidak menunjuk volume |
| Overlay di device lain kosong terus | Alamatnya `localhost` — pakai alamat yang dicetak top bar, bukan yang di address bar dashboard |
| Overlay jauh menampilkan "waiting" padahal match jalan | `k` salah atau tidak ada padahal `APP_KEY` diset; soketnya ditolak server |
| Semua `/api` menjawab 401 | Dashboard belum pernah dibuka dengan `?k=<kunci>` di browser ini |

## 🔒 Security & Configuration

- `.env` tidak di-commit (gunakan `.env.example` sebagai template)
- Database optional untuk development
- Free tier TikTok connector tersedia tanpa API key
- Header CORS hanya dipasang saat `CORS_ORIGIN` diisi, dan hanya untuk origin persis itu —
  bukan `*`: API ini tanpa auth, dan `POST /api/chat/connect` milik siapa pun yang bisa
  memanggilnya
- Nama berkas upload dibangkitkan server dan divalidasi regex saat dibaca; nama dari klien
  tidak pernah menyentuh path

## 📄 License

Private project.

## 🙋 Support

Untuk pertanyaan dan dokumentasi lebih detail, lihat:
- `CLAUDE.md` - Panduan development lengkap
- `req.md` - Functional requirements
- `docs/` - Design specifications

---

**Note**: Project ini dalam active development. Battle Arena adalah game pertama dan blueprint arsitektur untuk game-game selanjutnya.
