/** Batas modul yang menegakkan §5.3 spec desain. */
module.exports = {
  forbidden: [
    {
      name: 'framework-stays-generic',
      comment: 'framework/ tidak boleh tahu apa pun tentang platform, game, atau UI',
      severity: 'error',
      from: { path: '^packages/client/src/framework' },
      to: { path: '^packages/client/src/(platform|games|ui)' },
    },
    {
      name: 'platform-knows-no-games',
      comment: 'platform/ hanya boleh bergantung pada framework dan shared',
      severity: 'error',
      from: { path: '^packages/client/src/platform' },
      to: { path: '^packages/client/src/(games|ui)' },
    },
    {
      name: 'games-know-no-ui',
      comment: 'games/ boleh memakai shared, framework, dan platform — tidak boleh ui',
      severity: 'error',
      from: { path: '^packages/client/src/games' },
      to: { path: '^packages/client/src/ui' },
    },
    {
      name: 'games-stay-in-their-lane',
      comment: 'satu game tidak boleh mengimpor game lain (Req 37 AC4)',
      severity: 'error',
      from: { path: '^packages/client/src/games/([^/]+)/' },
      to: {
        path: '^packages/client/src/games/([^/]+)/',
        pathNot: ['^packages/client/src/games/$1/'],
      },
    },
    {
      name: 'testing-helpers-stay-in-tests',
      comment: 'src/testing/ hanya boleh dipakai file test, bukan kode produksi',
      severity: 'error',
      from: { path: '^packages/client/src/(framework|platform|games|ui)' },
      to: { path: '^packages/client/src/testing' },
    },
    {
      name: 'server-knows-no-client',
      comment: 'server hanya boleh memakai @lga/shared dan dependensi npm',
      severity: 'error',
      from: { path: '^packages/server' },
      to: { path: '^packages/client' },
    },
    {
      name: 'client-knows-no-server',
      comment: 'client bicara dengan server lewat HTTP dan WebSocket, bukan impor',
      severity: 'error',
      from: { path: '^packages/client' },
      to: { path: '^packages/server' },
    },
    {
      name: 'no-circular-dependencies',
      comment: 'Req 35 AC1 melarang dependensi melingkar',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', 'index\\.ts$', '^packages/client/src/testing/'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    // dist/ adalah keluaran `vite build`, bukan sumber: memindainya hanya menghasilkan
    // peringatan orphan atas bundle yang memang tidak diimpor siapa pun.
    exclude: { path: ['\\.test\\.tsx?$', '/dist/'] },
  },
}
