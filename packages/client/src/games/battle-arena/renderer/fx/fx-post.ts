import * as THREE from 'three'
import type { UltimateFxState } from './fx-state.js'
import { FX_LIGHT_MAX, FX_WAVE_MAX } from './fx-state.js'

/**
 * Lapisan post-process di atas canvas 2D arena.
 *
 * Alurnya: canvas 2D → texture → pass distorsi (shockwave, panas laser, aberasi kromatik) →
 * partikel aditif digambar di atasnya → bright pass → blur H/V → pass akhir (bloom, point
 * light, kilatan arena, afterimage) → layar.
 *
 * DUA CANVAS, dan itu keputusan yang mengikat: canvas 2D tidak pernah tampil sendiri, ia hanya
 * sumber texture. Yang dilihat penonton selalu canvas WebGL ini. Kalau WebGL tidak tersedia
 * (`isSupported()` false), pemanggil harus MENAMPILKAN canvas 2D itu langsung dan melewati
 * seluruh berkas ini — jalur FX tetap terbaca tanpa post-process, hanya lebih datar.
 *
 * Semua bentuk tetap digambar di canvas 2D. Tidak ada geometri di sini selain satu quad layar
 * penuh dan satu `THREE.Points` — menambah bentuk di lapisan ini berarti dua tempat menggambar
 * arena yang sama.
 */

const VERT = `varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`

/**
 * Distorsi: cincin shockwave menggeser UV keluar (atau MASUK, saat strength negatif), berkas
 * laser menambah riak panas, dan keduanya menggeser kanal R/B berlawanan arah untuk aberasi.
 */
const FRAG_DISTORT = `uniform sampler2D tBase; uniform vec2 uRes; uniform vec4 uWave[${FX_WAVE_MAX}]; uniform int uWaveCount;
uniform vec4 uBeam; uniform float uBeamAmp; uniform float uTime; uniform float uGain; varying vec2 vUv;
void main(){
  float ar = uRes.x/uRes.y;
  vec2 off = vec2(0.0); float ring = 0.0;
  for(int i=0;i<${FX_WAVE_MAX};i++){ if(i>=uWaveCount) break;
    vec4 w = uWave[i];
    vec2 d = (vUv - w.xy) * vec2(ar,1.0);
    float dist = length(d);
    float band = exp(-pow((dist - w.z)/0.05, 2.0));
    ring += band * w.w;
    off += normalize(d + 1e-5) * band * w.w * 0.05;
  }
  if(uBeamAmp > 0.0){
    vec2 p0 = uBeam.xy, p1 = uBeam.zw;
    vec2 pa = (vUv - p0)*vec2(ar,1.0), ba = (p1 - p0)*vec2(ar,1.0);
    float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-5), 0.0, 1.0);
    float dl = length(pa - ba*h);
    float heat = exp(-pow(dl/0.035,2.0)) * uBeamAmp;
    vec2 n = normalize(vec2(-ba.y, ba.x) + 1e-5);
    off += n * sin(h*46.0 - uTime*0.02) * heat * 0.012;
    ring += heat*0.25;
  }
  vec2 uv = vUv - off;
  float ab = clamp(ring,0.0,1.5) * 0.0035;
  vec2 dir = normalize(off + 1e-5);
  vec3 c;
  c.r = texture2D(tBase, uv + dir*ab).r;
  c.g = texture2D(tBase, uv).g;
  c.b = texture2D(tBase, uv - dir*ab).b;
  // Alpha diambil pada UV yang SUDAH tergeser, sama seperti kanal hijau. Mengambilnya di
  // vUv akan membuat warna dan bentuk bergeser terpisah — arena tampak punya bayangan.
  float a = texture2D(tBase, uv).a;
  // Cincin shockwave adalah cahaya yang lahir DI SINI, bukan di kanvas sumber; tanpa baris
  // ini ia hanya terlihat di tempat yang kebetulan sudah ada isinya.
  a = clamp(a + ring*0.22, 0.0, 1.0);
  gl_FragColor = vec4(c*uGain + vec3(ring*0.22), a);
}`

/** Partikel: posisi sudah dalam NDC, dihitung CPU. Titik bulat berpinggir lembut, aditif. */
const VERT_POINTS = `attribute vec4 aColor; attribute float aSize; varying vec4 vColor;
void main(){ vColor = aColor; gl_PointSize = aSize; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const FRAG_POINTS = `varying vec4 vColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.02, length(d));
  a = pow(a, 1.6);
  // Alpha partikel adalah cakupannya, bukan 1: di atas siaran creator, partikel yang
  // "seluruhnya buram tapi hampir hitam" itu titik kotor, bukan percikan.
  gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a) * a;
}`

const FRAG_BRIGHT = `uniform sampler2D tDiffuse; uniform float uThresh; varying vec2 vUv;
void main(){ vec4 s = texture2D(tDiffuse,vUv); vec3 c = s.rgb;
  float l = dot(c, vec3(0.299,0.587,0.114));
  float k = max(0.0, l - uThresh)/max(l,1e-4);
  // k yang sama menjepit alpha: piksel yang tidak lolos ambang tidak boleh menyumbang
  // bentuk ke bloom, hanya karena kanvas sumber kebetulan buram di sana.
  gl_FragColor = vec4(c*k, s.a*k); }`

/** Blur 5-tap dengan bobot Gauss pada setengah resolusi — cukup halus, seperempat biaya. */
const FRAG_BLUR = `uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; varying vec2 vUv;
void main(){ vec2 t = uDir/uRes; vec4 s = vec4(0.0);
  s += texture2D(tDiffuse, vUv) * 0.227;
  s += (texture2D(tDiffuse, vUv + t*1.385) + texture2D(tDiffuse, vUv - t*1.385)) * 0.316;
  s += (texture2D(tDiffuse, vUv + t*3.231) + texture2D(tDiffuse, vUv - t*3.231)) * 0.070;
  // Bobot Gauss yang sama untuk rgb dan a. Warna buram di atas alpha tajam berpinggir keras.
  gl_FragColor = s; }`

/**
 * Pass akhir. `uLight` INILAH yang mewarnai fighter saat ultimate meledak: cahaya ditambahkan
 * di ruang layar, jadi apa pun yang berdiri di dekat ledakan ikut tersinari tanpa penggambaran
 * fighter tahu apa-apa soal ultimate.
 *
 * Afterimage-nya `max(col, prev*damp)`, bukan campuran linier: jejaknya hanya muncul di tempat
 * yang benar-benar terang, sehingga arena yang tenang tetap bersih.
 */
const FRAG_FINAL = `uniform sampler2D tScene, tBloom, tPrev; uniform float uBloom, uDamp, uFlash; uniform vec2 uRes;
uniform vec4 uLight[${FX_LIGHT_MAX}]; uniform vec3 uLightCol[${FX_LIGHT_MAX}]; uniform int uLightCount; varying vec2 vUv;
void main(){
  vec4 scene = texture2D(tScene, vUv);
  vec4 bloom = texture2D(tBloom, vUv);
  vec3 col = scene.rgb + bloom.rgb * uBloom;
  float a = max(scene.a, bloom.a * uBloom);
  float ar = uRes.x/uRes.y;
  for(int i=0;i<${FX_LIGHT_MAX};i++){ if(i>=uLightCount) break;
    vec4 L = uLight[i];
    float d = length((vUv - L.xy) * vec2(ar,1.0));
    float f = exp(-pow(d/max(L.z,1e-4), 2.0)) * L.w;
    col += uLightCol[i] * f;
    // Cahaya titik menyinari ruang kosong juga — di sanalah ia justru paling terbaca.
    a = max(a, f);
  }
  col += vec3(uFlash);
  a = max(a, uFlash);
  vec4 prev = texture2D(tPrev, vUv) * uDamp;
  // max, BUKAN jumlah — sama seperti RGB tepat di bawah. Menjumlahkan alpha membuat arena
  // yang ramai perlahan memutih dan menutup siaran di baliknya.
  col = max(col, prev.rgb);
  a = max(a, prev.a);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`

const FRAG_COPY = `uniform sampler2D tDiffuse; varying vec2 vUv;
void main(){ gl_FragColor = texture2D(tDiffuse,vUv); }`

const vec4List = (n: number): THREE.Vector4[] =>
  Array.from({ length: n }, () => new THREE.Vector4(0, 0, 0, 0))
const vec3List = (n: number): THREE.Vector3[] =>
  Array.from({ length: n }, () => new THREE.Vector3(0, 0, 0))

export class UltimateFxPost {
  private readonly renderer: THREE.WebGLRenderer
  private readonly texture: THREE.CanvasTexture
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly sceneWorld = new THREE.Scene()
  private readonly scenePost = new THREE.Scene()
  private readonly postQuad: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()

  private readonly distortMat: THREE.ShaderMaterial
  private readonly brightMat: THREE.ShaderMaterial
  private readonly blurMat: THREE.ShaderMaterial
  private readonly finalMat: THREE.ShaderMaterial
  private readonly copyMat: THREE.ShaderMaterial

  private rtScene: THREE.WebGLRenderTarget
  private rtA: THREE.WebGLRenderTarget
  private rtB: THREE.WebGLRenderTarget
  private feed: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]

  private width: number
  private height: number

  /** Tanpa WebGL, pemanggil harus menampilkan canvas 2D langsung. */
  static isSupported(): boolean {
    try {
      const probe = document.createElement('canvas')
      return probe.getContext('webgl') !== null
    } catch {
      return false
    }
  }

  constructor(canvas: HTMLCanvasElement, source: HTMLCanvasElement, width: number, height: number) {
    this.width = width
    this.height = height

    // alpha: true DAN clear color beralpha nol. Keduanya perlu: tanpa yang pertama konteksnya
    // tidak punya kanal alpha sama sekali, tanpa yang kedua tiap frame dimulai dari hitam
    // pekat dan seluruh kerja alpha di enam shader di atas tidak pernah terlihat.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    // Pixel ratio 1, selalu: seluruh anggaran GPU sudah dipakai bloom dan blur, dan overlay
    // OBS dikomposit pada resolusi kanvasnya sendiri.
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)

    this.texture = new THREE.CanvasTexture(source)
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false

    this.rtScene = this.target(width, height)
    this.rtA = this.target(width >> 1, height >> 1)
    this.rtB = this.target(width >> 1, height >> 1)
    this.feed = [this.target(width, height), this.target(width, height)]

    this.distortMat = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: this.texture },
        uRes: { value: new THREE.Vector2(width, height) },
        uWave: { value: vec4List(FX_WAVE_MAX) },
        uWaveCount: { value: 0 },
        uBeam: { value: new THREE.Vector4(0, 0, 0, 0) },
        uBeamAmp: { value: 0 },
        uTime: { value: 0 },
        uGain: { value: 1.06 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG_DISTORT,
      depthTest: false,
      depthWrite: false,
    })

    const worldQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.distortMat)
    worldQuad.frustumCulled = false
    this.sceneWorld.add(worldQuad)

    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    this.geometry.setDrawRange(0, 0)
    const pointsMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: VERT_POINTS,
      fragmentShader: FRAG_POINTS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    const points = new THREE.Points(this.geometry, pointsMat)
    points.frustumCulled = false
    this.sceneWorld.add(points)

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThresh: { value: 0.72 } },
      vertexShader: VERT,
      fragmentShader: FRAG_BRIGHT,
      depthTest: false,
    })
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2(1, 0) },
        uRes: { value: new THREE.Vector2(width >> 1, height >> 1) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG_BLUR,
      depthTest: false,
    })
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tPrev: { value: null },
        uBloom: { value: 1 },
        uDamp: { value: 0.5 },
        uRes: { value: new THREE.Vector2(width, height) },
        uLight: { value: vec4List(FX_LIGHT_MAX) },
        uLightCol: { value: vec3List(FX_LIGHT_MAX) },
        uLightCount: { value: 0 },
        uFlash: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG_FINAL,
      depthTest: false,
    })
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VERT,
      fragmentShader: FRAG_COPY,
      depthTest: false,
    })

    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMat)
    this.postQuad.frustumCulled = false
    this.scenePost.add(this.postQuad)
  }

  private target(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
    })
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    // Penyimpanan texture WebGL2 itu IMMUTABLE. `texStorage2D` dialokasikan SEKALI, pada
    // ukuran kanvas sumber saat unggahan pertama; sesudah itu three hanya memanggil
    // `texSubImage2D` ke penyimpanan lama. Begitu kanvas 2D berubah ukuran, isinya masuk ke
    // kotak berukuran lama — gambarnya bergeser dan bidang yang tidak pernah ditulis tinggal
    // HITAM di layar. Dispose membuang objek texture-nya sehingga unggahan berikutnya
    // mengalokasi ulang pada ukuran baru; ia satu-satunya cara memaksa itu dari luar three.
    this.texture.dispose()
    for (const rt of [this.rtScene, this.rtA, this.rtB, this.feed[0], this.feed[1]]) rt.dispose()
    this.rtScene = this.target(width, height)
    this.rtA = this.target(width >> 1, height >> 1)
    this.rtB = this.target(width >> 1, height >> 1)
    this.feed = [this.target(width, height), this.target(width, height)]
    ;(this.distortMat.uniforms.uRes as { value: THREE.Vector2 }).value.set(width, height)
    ;(this.blurMat.uniforms.uRes as { value: THREE.Vector2 }).value.set(width >> 1, height >> 1)
    ;(this.finalMat.uniforms.uRes as { value: THREE.Vector2 }).value.set(width, height)
  }

  /** `flash` dari `fxFlashAlpha()` — pemanggil yang menghitungnya, supaya plafonnya satu tempat. */
  render(fx: UltimateFxState, flash: number): void {
    const W = this.width
    const H = this.height
    this.texture.needsUpdate = true

    const du = this.distortMat.uniforms
    const waves = du.uWave?.value as THREE.Vector4[]
    let wc = 0
    for (const w of fx.waves) {
      if (wc >= FX_WAVE_MAX) break
      const k = w.t / w.dur
      // Radius cincin tumbuh 0.02→0.57 dalam ruang UV; kekuatannya meluruh pangkat 1.6 supaya
      // ia terasa "menampar" di awal lalu hilang, bukan mengembang rata.
      ;(waves[wc] as THREE.Vector4).set(
        w.x / W,
        1 - w.y / H,
        0.02 + k * 0.55,
        w.strength * (1 - k) ** 1.6 * fx.tuning.distort,
      )
      wc++
    }
    ;(du.uWaveCount as { value: number }).value = wc
    ;(du.uTime as { value: number }).value = fx.clock

    const beam = fx.beam
    if (beam === null) {
      ;(du.uBeamAmp as { value: number }).value = 0
    } else {
      ;(du.uBeam?.value as THREE.Vector4).set(beam.x0 / W, 1 - beam.y0 / H, beam.x1 / W, 1 - beam.y1 / H)
      ;(du.uBeamAmp as { value: number }).value = beam.amp * fx.tuning.distort
    }

    // Partikel → NDC. Yang mati dilewati dan tidak menyisakan lubang: `n` yang dipakai
    // sebagai draw range, bukan indeks aslinya.
    const p = fx.particles
    let n = 0
    for (let i = 0; i < p.n; i++) {
      if ((p.life[i] as number) <= 0) continue
      const k = (p.life[i] as number) / (p.max[i] as number)
      fx.glPos[n * 3] = ((p.x[i] as number) / W) * 2 - 1
      fx.glPos[n * 3 + 1] = 1 - ((p.y[i] as number) / H) * 2
      fx.glPos[n * 3 + 2] = 0
      fx.glCol[n * 4] = p.r[i] as number
      fx.glCol[n * 4 + 1] = p.g[i] as number
      fx.glCol[n * 4 + 2] = p.b[i] as number
      fx.glCol[n * 4 + 3] = k ** (0.7 * (p.fade[i] as number))
      fx.glSize[n] = Math.max(1, (p.size[i] as number) * (0.4 + k * 0.9))
      n++
    }
    this.upload(fx, n)

    this.renderer.setRenderTarget(this.rtScene)
    this.renderer.render(this.sceneWorld, this.camera)
    this.renderer.setRenderTarget(null)

    ;(this.brightMat.uniforms.tDiffuse as { value: THREE.Texture | null }).value =
      this.rtScene.texture
    this.pass(this.brightMat, this.rtA)
    ;(this.blurMat.uniforms.tDiffuse as { value: THREE.Texture | null }).value = this.rtA.texture
    ;(this.blurMat.uniforms.uDir?.value as THREE.Vector2).set(1, 0)
    this.pass(this.blurMat, this.rtB)
    ;(this.blurMat.uniforms.tDiffuse as { value: THREE.Texture | null }).value = this.rtB.texture
    ;(this.blurMat.uniforms.uDir?.value as THREE.Vector2).set(0, 1)
    this.pass(this.blurMat, this.rtA)

    const fu = this.finalMat.uniforms
    ;(fu.tScene as { value: THREE.Texture | null }).value = this.rtScene.texture
    ;(fu.tBloom as { value: THREE.Texture | null }).value = this.rtA.texture
    ;(fu.tPrev as { value: THREE.Texture | null }).value = this.feed[0].texture
    ;(fu.uBloom as { value: number }).value = fx.tuning.bloom
    ;(fu.uDamp as { value: number }).value = fx.tuning.trail
    ;(fu.uFlash as { value: number }).value = flash * 0.9

    const lights = fu.uLight?.value as THREE.Vector4[]
    const cols = fu.uLightCol?.value as THREE.Vector3[]
    let lc = 0
    for (const l of fx.lights) {
      if (lc >= FX_LIGHT_MAX) break
      const k = 1 - l.t / l.life
      ;(lights[lc] as THREE.Vector4).set(l.x / W, 1 - l.y / H, l.r / W, l.intensity * k)
      ;(cols[lc] as THREE.Vector3).set(l.col[0] as number, l.col[1] as number, l.col[2] as number)
      lc++
    }
    ;(fu.uLightCount as { value: number }).value = lc

    this.pass(this.finalMat, this.feed[1])
    ;(this.copyMat.uniforms.tDiffuse as { value: THREE.Texture | null }).value =
      this.feed[1].texture
    this.pass(this.copyMat, null)
    // Tukar buffer feedback: yang baru digambar jadi "sebelumnya" untuk frame berikutnya.
    this.feed = [this.feed[1], this.feed[0]]
  }

  private upload(fx: UltimateFxState, count: number): void {
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (position === undefined || position.array !== fx.glPos) {
      this.geometry.setAttribute('position', new THREE.BufferAttribute(fx.glPos, 3))
      this.geometry.setAttribute('aColor', new THREE.BufferAttribute(fx.glCol, 4))
      this.geometry.setAttribute('aSize', new THREE.BufferAttribute(fx.glSize, 1))
    }
    this.geometry.setDrawRange(0, count)
    for (const name of ['position', 'aColor', 'aSize']) {
      const attr = this.geometry.getAttribute(name) as THREE.BufferAttribute | undefined
      if (attr !== undefined) attr.needsUpdate = true
    }
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.postQuad.material = material
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scenePost, this.camera)
    this.renderer.setRenderTarget(null)
  }

  dispose(): void {
    for (const rt of [this.rtScene, this.rtA, this.rtB, this.feed[0], this.feed[1]]) rt.dispose()
    this.texture.dispose()
    this.geometry.dispose()
    this.renderer.dispose()
  }
}
