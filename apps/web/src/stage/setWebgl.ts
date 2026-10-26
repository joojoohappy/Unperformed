/**
 * Three.js stage for the stage set (setLayout.ts): crystal pillars and shards,
 * a monolith, a ring of light, light strings, lasers, LED panels, the section's
 * name in dots, beams and haze, over a mirror, water or matte floor.
 * Loaded on demand by Stage.tsx so three.js stays out of the initial bundle.
 *
 * The mirror floor is a second pass: the whole set drawn upside down under a
 * translucent floor. It is kept at reduced quality, which already draws about
 * a quarter of the pixels; reduced quality drops the haze and half the shards
 * and strings instead.
 */
import { DEFAULT_SET, type StageFrame, type StageSet } from "@unperformed/performance-core";
import * as THREE from "three";
import { LOOKS, lookFor } from "./look";
import { pixelRatio, QUALITY, type QualitySettings } from "./quality";
import {
  computeSet,
  createSetScene,
  framing,
  LASERS_PER_EMITTER,
  MAX_BEAMS,
  MAX_EMITTERS,
  MAX_PANELS,
  MAX_PILLAR_PIECES,
  MAX_SHARDS,
  MAX_STRINGS,
  RING_PIECES,
  SCREEN_COLS,
  SCREEN_ROWS,
  STRING_SEGMENTS,
  type Pieces
} from "./setLayout";
import { ELEMENT_COUNT } from "./layout";
import type { StageRenderer } from "./types";
import type { Words } from "./words";

const HAZE = 520;
const HAZE_HEIGHT = 7;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const BEAM_TOP = 11;
const FLOOR_OPACITY = { mirror: 0.74, water: 0.6, matte: 1 } as const;
const FLOOR_COLOR = { mirror: "#070708", water: "#04090f", matte: "#0d0c0b" } as const;

// A soft cone of light: brightest at its axis and toward the source, fading to nothing at the edges.
const BEAM_VERT = `
varying vec3 vNormal;
varying vec3 vView;
varying float vH;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vH = uv.y;
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
varying float vH;
void main() {
  float edge = pow(abs(dot(vNormal, vView)), 1.4);
  float a = uOpacity * edge * (0.25 + 0.75 * vH) * smoothstep(0.0, 0.12, vH);
  gl_FragColor = vec4(uColor * a, a);
}`;
// A wide soft glow behind the set.
const GLOW_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GLOW_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 d = (vUv - vec2(0.5, 0.3)) * vec2(1.0, 1.8);
  float a = uOpacity * exp(-dot(d, d) * 7.0);
  gl_FragColor = vec4(uColor * a, a);
}`;

export class SetWebGLStage implements StageRenderer {
  readonly name = "webgl" as const;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** Everything that is reflected in the floor. */
  private world = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 90);
  private aspect = 16 / 9;
  private fog: THREE.FogExp2;
  private floor: THREE.Mesh;
  private floorMat: THREE.MeshBasicMaterial;
  private key: THREE.SpotLight;
  private rim: THREE.SpotLight;
  private front: THREE.DirectionalLight;
  private fill: THREE.HemisphereLight;
  private crystalMat: THREE.MeshStandardMaterial;
  private pillars: THREE.InstancedMesh;
  private shards: THREE.InstancedMesh;
  private monolith: THREE.InstancedMesh;
  private ring: THREE.InstancedMesh;
  private ringMat: THREE.MeshBasicMaterial;
  private dots: THREE.InstancedMesh;
  private dotMat: THREE.MeshBasicMaterial;
  private strings: THREE.LineSegments;
  private stringPos: THREE.BufferAttribute;
  private stringCol: THREE.BufferAttribute;
  private lasers: THREE.InstancedMesh;
  private cells: THREE.InstancedMesh;
  private panels: THREE.InstancedMesh;
  private beams: THREE.Mesh[] = [];
  private beamMats: THREE.ShaderMaterial[] = [];
  private glow: THREE.Mesh;
  private glowMat: THREE.ShaderMaterial;
  private haze: THREE.Points;
  private hazeMat: THREE.PointsMaterial;
  private hazeBase: Float32Array;
  private hazePos: THREE.BufferAttribute;
  private disposables: { dispose(): void }[] = [];
  private set: StageSet = DEFAULT_SET;
  private layout = createSetScene();
  private look = { ...LOOKS.order };
  private words: Words = [];
  private quality: QualitySettings = QUALITY.full;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private energy = new THREE.Color();
  private keyC = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#040405");
    this.renderer.autoClear = false;
    this.fog = new THREE.FogExp2("#040405", 0.03);
    this.scene.fog = this.fog;
    this.scene.add(this.world);

    // The floor itself is unlit: what shows on it is the reflection pass (or nothing, on a matte floor).
    this.floorMat = new THREE.MeshBasicMaterial({ color: FLOOR_COLOR.mirror, transparent: true, opacity: FLOOR_OPACITY.mirror });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    this.own(this.floor.geometry, this.floorMat);

    this.key = new THREE.SpotLight("#ffffff", 0, 0, 0.9, 0.8, 1.1);
    // Above and behind centre stage, so its highlight on the floor stays far from the camera.
    this.key.position.set(0, 12, -1.5);
    this.key.target.position.set(0, 0, -3);
    this.rim = new THREE.SpotLight("#ffffff", 0, 0, 0.9, 0.9, 1.2);
    this.rim.position.set(0, 7, -11);
    this.rim.target.position.set(0, 1, -2);
    this.front = new THREE.DirectionalLight("#ffffff", 0);
    this.front.position.set(1, 3, 10);
    this.fill = new THREE.HemisphereLight("#8a94a6", "#000000", 0.08);
    this.world.add(this.key, this.key.target, this.rim, this.rim.target, this.front, this.fill);

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.crystalMat = new THREE.MeshStandardMaterial({ color: "#c9d0de", roughness: 0.22, metalness: 0.15, emissive: "#000000" });
    this.pillars = this.instanced(box, this.crystalMat, MAX_PILLAR_PIECES);
    this.shards = this.instanced(new THREE.OctahedronGeometry(0.7), this.crystalMat, MAX_SHARDS);
    const monoMat = new THREE.MeshStandardMaterial({ color: "#060606", roughness: 0.28, metalness: 0.7 });
    this.monolith = this.instanced(box, monoMat, 4);
    this.ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    this.ring = this.instanced(box, this.ringMat, RING_PIECES);
    this.dotMat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, side: THREE.DoubleSide });
    this.dots = this.instanced(new THREE.PlaneGeometry(1, 1), this.dotMat, ELEMENT_COUNT);

    const sv = MAX_STRINGS * STRING_SEGMENTS * 2;
    this.stringPos = new THREE.BufferAttribute(new Float32Array(sv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.stringCol = new THREE.BufferAttribute(new Float32Array(sv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", this.stringPos);
    sg.setAttribute("color", this.stringCol);
    const stringMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.strings = new THREE.LineSegments(sg, stringMat);
    this.strings.frustumCulled = false;
    this.world.add(this.strings);
    this.own(sg, stringMat);

    // Laser lines: thin boxes from z 0 to 1, stretched along each line.
    const beamBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    const laserMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.lasers = this.instanced(beamBox, laserMat, MAX_EMITTERS * LASERS_PER_EMITTER, true);

    const panelMat = new THREE.MeshStandardMaterial({ color: "#0a0a0c", roughness: 0.6, metalness: 0.3 });
    this.panels = this.instanced(box, panelMat, MAX_PANELS);
    const cellMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.cells = this.instanced(new THREE.PlaneGeometry(1, 1), cellMat, MAX_PANELS * SCREEN_COLS * SCREEN_ROWS, true);

    const cone = new THREE.CylinderGeometry(0.05, 1, 1, 40, 1, true);
    cone.translate(0, -0.5, 0);
    this.own(cone);
    for (let i = 0; i < MAX_BEAMS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(cone, mat);
      this.beams.push(mesh);
      this.beamMats.push(mat);
      this.world.add(mesh);
      this.own(mat);
    }

    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), this.glowMat);
    this.glow.position.set(0, 6, -11);
    this.world.add(this.glow);
    this.own(this.glow.geometry, this.glowMat);

    const hazePos = new Float32Array(HAZE * 3);
    for (let i = 0; i < HAZE; i++) {
      const a = (i * 2.399963) % (Math.PI * 2);
      const r = Math.sqrt((i + 0.5) / HAZE) * 6;
      hazePos[i * 3] = Math.cos(a) * r;
      hazePos[i * 3 + 1] = ((i * 0.618) % 1) * HAZE_HEIGHT;
      hazePos[i * 3 + 2] = Math.sin(a) * r * 0.7 - 3;
    }
    this.hazeBase = hazePos.slice();
    this.hazePos = new THREE.BufferAttribute(hazePos, 3).setUsage(THREE.DynamicDrawUsage);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", this.hazePos);
    this.hazeMat = new THREE.PointsMaterial({ size: 0.03, color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.haze = new THREE.Points(hg, this.hazeMat);
    this.world.add(this.haze);
    this.own(hg, this.hazeMat, box, monoMat, panelMat, cellMat, laserMat, beamBox);
  }

  private own(...things: { dispose(): void }[]) {
    this.disposables.push(...things);
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, n: number, colored = false): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) {
      for (let i = 0; i < n; i++) mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.world.add(mesh);
    this.own(geo);
    if (!this.disposables.includes(mat)) this.own(mat);
    return mesh;
  }

  private placePieces(mesh: THREE.InstancedMesh, p: Pieces, stride = 1): void {
    let n = 0;
    for (let i = 0; i < p.count; i += stride) {
      const k = i * 3;
      if (p.scale[k + 1]! <= 1e-4) continue;
      this.v.set(p.position[k]!, p.position[k + 1]!, p.position[k + 2]!);
      this.e.set(p.rotation[k]!, p.rotation[k + 1]!, p.rotation[k + 2]!);
      this.q.setFromEuler(this.e);
      this.s.set(p.scale[k]!, p.scale[k + 1]!, p.scale[k + 2]!);
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(n++, this.m);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(pixelRatio(dpr, this.quality));
    this.renderer.setSize(width, height, false);
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  render(f: StageFrame, seed: number, reducedMotion: boolean): void {
    const L = lookFor(f, this.look);
    const S = computeSet(f, seed, this.set, this.layout, reducedMotion, L, this.words);
    const light = S.light;
    const [kr, kg, kb] = f.keyColor;
    this.keyC.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.energy.setRGB(S.energyColor[0], S.energyColor[1], S.energyColor[2], THREE.SRGBColorSpace);
    const reduced = this.quality.elementStride > 1;

    this.fog.density = 0.022 + L.fog * 0.25;
    this.floorMat.color.set(FLOOR_COLOR[S.floor]);
    this.floorMat.opacity = FLOOR_OPACITY[S.floor];

    this.key.color.copy(this.keyC);
    this.key.intensity = 300 * light;
    this.rim.color.copy(this.energy);
    this.rim.intensity = 160 * (0.15 + S.energy) * light;
    this.front.color.copy(this.keyC);
    this.front.intensity = 0.7 * light;
    this.fill.intensity = 0.08 * light;

    // Crystal glows with the energy on stage; the ring and the word are pure light.
    this.crystalMat.emissive.copy(this.energy).multiplyScalar((0.06 + 0.85 * S.energy) * light);
    this.ringMat.color.copy(this.keyC).lerp(this.energy, S.energy).multiplyScalar(1.6 * S.ringLight * light);
    this.dotMat.color.copy(this.keyC).lerp(this.energy, 0.5 * S.energy).multiplyScalar(2.4 * S.wordLight * light);

    this.placePieces(this.pillars, S.pillars);
    this.placePieces(this.shards, S.shards, reduced ? 2 : 1);
    this.placePieces(this.monolith, S.monolith);
    this.placePieces(this.ring, S.ring);
    this.placePieces(this.dots, S.words);
    if (S.wordLight < 0.01) this.dots.count = 0;

    // Strings.
    const sp = this.stringPos.array as Float32Array;
    const sc = this.stringCol.array as Float32Array;
    const segs = S.strings.count;
    sp.set(S.strings.vertices.subarray(0, segs * 6));
    const { r: er, g: eg, b: eb } = this.c.copy(this.keyC).lerp(this.energy, S.energy);
    for (let i = 0; i < segs; i++) {
      const b = (reduced && Math.floor(i / STRING_SEGMENTS) % 2 ? 0 : S.strings.light[i]!) * light * 0.9;
      for (let j = 0; j < 2; j++) {
        const o = (i * 2 + j) * 3;
        sc[o] = er * b;
        sc[o + 1] = eg * b;
        sc[o + 2] = eb * b;
      }
    }
    this.strings.geometry.setDrawRange(0, segs * 2);
    this.stringPos.needsUpdate = true;
    this.stringCol.needsUpdate = true;

    // Lasers: one thin stretched box per line.
    const Z = S.lasers;
    for (let i = 0; i < Z.count; i++) {
      const o = i * 6;
      this.v.set(Z.vertices[o]!, Z.vertices[o + 1]!, Z.vertices[o + 2]!);
      this.v2.set(Z.vertices[o + 3]!, Z.vertices[o + 4]!, Z.vertices[o + 5]!).sub(this.v);
      const len = this.v2.length();
      this.q.setFromUnitVectors(FORWARD, this.v2.divideScalar(len || 1));
      this.s.set(0.03, 0.03, len);
      this.m.compose(this.v, this.q, this.s);
      this.lasers.setMatrixAt(i, this.m);
      this.lasers.setColorAt(i, this.c.copy(this.energy).multiplyScalar(1.8 * Z.light[i]! * light));
    }
    this.lasers.count = Z.count;
    this.lasers.instanceMatrix.needsUpdate = true;
    if (this.lasers.instanceColor) this.lasers.instanceColor.needsUpdate = true;

    // LED panels and their cells.
    let n = 0;
    for (let p = 0; p < S.panelCount; p++) {
      const [px, py, pz, pw, ph] = S.panels.subarray(p * 5, p * 5 + 5) as unknown as [number, number, number, number, number];
      this.m.compose(this.v.set(px, py, pz - 0.06), this.q.identity(), this.s.set(pw + 0.12, ph + 0.12, 0.08));
      this.panels.setMatrixAt(p, this.m);
      const cw = pw / SCREEN_COLS, ch = ph / SCREEN_ROWS;
      for (let r = 0; r < SCREEN_ROWS; r++) {
        for (let col = 0; col < SCREEN_COLS; col++) {
          const b = S.cells[(p * SCREEN_ROWS + r) * SCREEN_COLS + col]! * light;
          this.m.compose(this.v.set(px - pw / 2 + (col + 0.5) * cw, py - ph / 2 + (r + 0.5) * ch, pz), this.q.identity(), this.s.set(cw * 0.8, ch * 0.8, 1));
          this.cells.setMatrixAt(n, this.m);
          this.cells.setColorAt(n++, this.c.copy(this.keyC).lerp(this.energy, 0.3 + 0.7 * S.energy).multiplyScalar(1.4 * b));
        }
      }
    }
    this.panels.count = S.panelCount;
    this.panels.instanceMatrix.needsUpdate = true;
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;

    // Beams from above to the floor. They hold up in quiet sections: in silence a beam is all that is left.
    const beamLight = (1 - f.blackout) * (0.55 + 0.45 * f.intensity);
    for (let b = 0; b < MAX_BEAMS; b++) {
      const mesh = this.beams[b]!;
      mesh.visible = b < S.beamCount;
      if (!mesh.visible) continue;
      const [top, foot, level] = S.beams.subarray(b * 3, b * 3 + 3) as unknown as [number, number, number];
      this.v.set(top, BEAM_TOP, -2.5);
      this.v2.set(foot, 0, -1).sub(this.v);
      const reach = this.v2.length();
      mesh.position.copy(this.v);
      mesh.quaternion.setFromUnitVectors(UP, this.v2.negate().normalize());
      const w = b === 0 ? 0.35 + 0.35 * L.beamWidth : 0.5;
      mesh.scale.set(w, reach, w);
      this.beamMats[b]!.uniforms["uColor"]!.value.copy(this.keyC);
      this.beamMats[b]!.uniforms["uOpacity"]!.value = 0.6 * level * beamLight;
    }

    this.glowMat.uniforms["uColor"]!.value.copy(this.energy);
    this.glowMat.uniforms["uOpacity"]!.value = 0.55 * S.backGlow * light;

    this.hazeMat.color.copy(this.keyC).lerp(this.energy, 0.5 * S.energy);
    this.hazeMat.opacity = Math.min(1, 0.6 * S.haze * light);
    if (this.haze.visible) {
      const lift = reducedMotion ? 0 : f.beat * L.hazeLift;
      const pos = this.hazePos.array as Float32Array;
      for (let i = 0; i < HAZE; i++) {
        const y = (this.hazeBase[i * 3 + 1]! + lift) % HAZE_HEIGHT;
        pos[i * 3 + 1] = y < 0 ? y + HAZE_HEIGHT : y;
      }
      this.hazePos.needsUpdate = true;
    }

    const c = f.camera;
    const frame = framing(this.aspect, c.fov);
    this.camera.position.set(c.position[0], c.position[1], c.position[2]);
    this.camera.fov = frame.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(c.target[0], c.target[1] + frame.lift, c.target[2]);

    this.renderer.clear();
    if (S.floor !== "matte") {
      // The reflection: the set upside down, under the translucent floor. Beams and glow
      // are left out: mirrored light cones read as a blot of light in front of the stage.
      const shown = this.beams.map((b) => b.visible);
      this.beams.forEach((b) => (b.visible = false));
      this.glow.visible = false;
      this.world.scale.y = -1;
      this.floor.visible = false;
      this.renderer.render(this.scene, this.camera);
      this.renderer.clearDepth();
      this.world.scale.y = 1;
      this.floor.visible = true;
      this.glow.visible = true;
      this.beams.forEach((b, i) => (b.visible = shown[i]!));
    }
    this.renderer.render(this.scene, this.camera);
  }

  setWords(words: Words): void {
    this.words = words;
  }

  setStageSet(set: StageSet): void {
    this.set = set;
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
    this.haze.visible = q.haze;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
