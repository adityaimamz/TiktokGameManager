# Ultimate SFX — CC0

Semua berkas di folder ini **CC0 / public domain**: boleh dipakai komersial, boleh
dimodifikasi, tanpa kewajiban atribusi. Atribusi di bawah ditulis karena pantas, bukan
karena diwajibkan.

Tiap varian punya **dua** berkas, bukan satu. Animasi ultimate punya dua puncak — saat
melesat dan saat mendarat di `IMPACT_AT` — dan satu one-shot di detik nol tidak bisa
menandai keduanya.

Semuanya diencode ulang ke Ogg Vorbis `q4`, 44,1 kHz stereo, dengan fade-out 0,25 s.
Loudness-nya sengaja DIBEDAKAN: `launch` ke `I=-18 LUFS` dan `impact` ke `I=-14 LUFS`,
keduanya `TP=-1.5 dBTP`. Itu yang membuat impact terdengar memukul tanpa satu pun angka
gain baru menyeberangi kabel sinyal.

## Fase `launch` — dilepas saat ultimate melesat

| Berkas | Asal | Sumber | Perubahan |
| --- | --- | --- | --- |
| `ultimate-missile-rain-launch.ogg` | `rocket_01.ogg` | [50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx) — rubberduck | dipotong 1,70 s, `I=-18` |
| `ultimate-bomb-launch.ogg` | `sfx100v2_air_02.ogg` | [100 CC0 SFX #2](https://opengameart.org/content/100-cc0-sfx-2) — rubberduck | dipotong 1,10 s, `I=-18` |
| `ultimate-laser-launch.ogg` | `forcefield-000.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) — Kenney | dipotong 0,95 s, `I=-18` |
| `ultimate-lightning-launch.ogg` | `zapthreetoneup.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) — Kenney | dipotong 1,20 s, `I=-18` |
| `ultimate-singularity-launch.ogg` | `teleport_02.ogg` | [50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx) — rubberduck | dipotong 1,74 s, `I=-18` |
| `ultimate-chain-freeze-launch.ogg` | `coldsnap.wav` | [Ice Spells](https://opengameart.org/content/ice-spells) | dipotong 1,93 s, `I=-18` |

## Fase `impact` — dilepas saat sasaran pertama kena

| Berkas | Asal | Sumber | Perubahan |
| --- | --- | --- | --- |
| `ultimate-missile-rain-impact.ogg` | `explosion_02.ogg` | [50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx) — rubberduck | `I=-14` |
| `ultimate-bomb-impact.ogg` | `explosion_01.ogg` | [50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx) — rubberduck | dipotong 1,39 s, `I=-14` |
| `ultimate-laser-impact.ogg` | `retro_laser_02.ogg` | [50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx) — rubberduck | dipotong 1,24 s, `I=-14` |
| `ultimate-lightning-impact.ogg` | `sfx100v2_thunder_01.ogg` | [100 CC0 SFX #2](https://opengameart.org/content/100-cc0-sfx-2) — rubberduck | dipotong 5,26 s → 1,39 s, `I=-14` |
| `ultimate-singularity-impact.ogg` | `lowfrequency-explosion-000.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) — Kenney | dipotong 1,58 s, `I=-14` |
| `ultimate-chain-freeze-impact.ogg` | `impactglass-heavy-001.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) — Kenney | `I=-14` |

Berkas Kenney diambil lewat mirror `github.com/Cy4nWare/sfx-api` (jsDelivr), yang hanya
berisi aset Kenney CC0. Dukung pembuatnya: [kenney.nl/donate](https://kenney.nl/donate).

## Mengganti salah satunya

Timpa berkasnya dengan nama yang sama, lalu **perbarui `durationMs`** di `ULTIMATE_SOUND`
(`packages/client/src/games/battle-arena/effects.ts`) — itu satu-satunya angka yang harus
ikut berubah, dan `SoundQueue` memakainya untuk menghitung konkurensi sebelum satu byte pun
diunduh.

Berkas `launch` tidak boleh lebih panjang dari fase launch varian itu, yaitu
`durationMs × NUKE_TYPE_DURATION_SCALE × IMPACT_AT` — **1702 ms** untuk missileRain, bomb,
laser, dan lightning; **1930 ms** untuk singularity dan chainFreeze. Yang melampauinya
menumpuk ke fase impact, dan itu persis cacat yang memicu Plan 10: `coldsnap.wav` 2,65 detik
berhenti tepat saat kristalnya pecah, jadi momen paling keras di animasinya justru sunyi.
`ultimate-cue.test.ts` menggagalkan build kalau batas itu dilanggar.
