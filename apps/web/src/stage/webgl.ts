/**
 * Three.js stage: a dark floor, two spotlights, a visible beam, 240 instanced
 * elements and haze. Light, air and motion follow the section type (look.ts).
 * Loaded on demand by Stage.tsx so three.js stays out of the initial bundle.
 */
import type { StageFrame } from "@unperformed/performance-core";
import * as THREE from "three";
import { computeLayout, createLayout, ELEMENT_COUNT } from "./layout";
import { LOOKS, lookFor } from "./look";
import { pixelRatio, QUALITY, type QualitySettings } from "./quality";
import type { StageRenderer } from "./types";
import type { Words } from "./words";

const HAZE = 420;
const HAZE_HEIGHT = 6;
const KEY_POS = new THREE.Vector3(0.6, 9, 3.5);
const UP = new THREE.Vector3(0, 1, 0);

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

export class WebGLStage implements StageRenderer {
  readonly name = "webgl" as const;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
  private key: THREE.SpotLight;
  private rim: THREE.SpotLight;
  private fill: THREE.HemisphereLight;
  private front: THREE.DirectionalLight;
  private mesh: THREE.InstancedMesh;
  private material: THREE.MeshStandardMaterial;
  private haze: THREE.Points;
  private hazeMat: THREE.PointsMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private fog: THREE.FogExp2;
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private grid: THREE.LineSegments;
  private gridMat: THREE.LineBasicMaterial;
  private hazeBase: Float32Array;
  private hazePos: THREE.BufferAttribute;
  private look = { ...LOOKS.order };
  private accent = new THREE.Color();
  private dir = new THREE.Vector3();
  private layout = createLayout();
  private words: Words = [];
  private quality: QualitySettings = QUALITY.full;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#050505");
    this.fog = new THREE.FogExp2("#050505", 0.055);
    this.scene.fog = this.fog;

    this.floorMat = new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.42, metalness: 0.35 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Ruled floor lines, used by ordered sections.
    const grid = new THREE.GridHelper(24, 40);
    this.gridMat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false });
    this.grid = new THREE.LineSegments(grid.geometry, this.gridMat);
    this.grid.position.y = 0.005;
    this.scene.add(this.grid);

    this.key = new THREE.SpotLight("#ffffff", 0, 0, 0.55, 0.75, 1.1);
    this.key.position.set(0.6, 9, 3.5);
    this.key.target.position.set(0, 0, 0);
    this.scene.add(this.key, this.key.target);

    // The key light made visible in the haze. Unit height, scaled to reach the floor each frame.
    const cone = new THREE.CylinderGeometry(0.04, 1, 1, 48, 1, true);
    cone.translate(0, -0.5, 0);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.beam = new THREE.Mesh(cone, this.beamMat);
    this.beam.position.copy(KEY_POS);
    this.scene.add(this.beam);

    this.rim = new THREE.SpotLight("#ffffff", 0, 0, 0.7, 0.9, 1.2);
    this.rim.position.set(-2, 6, -8);
    this.rim.target.position.set(0, 0.5, -2);
    this.scene.add(this.rim, this.rim.target);

    this.fill = new THREE.HemisphereLight("#8a94a6", "#000000", 0.05);
    this.scene.add(this.fill);

    // A soft frontal wash so element faces read against the black.
    this.front = new THREE.DirectionalLight("#ffffff", 0);
    this.front.position.set(1, 3, 10);
    this.scene.add(this.front);

    this.material = new THREE.MeshStandardMaterial({ color: "#d8d3cb", roughness: 0.38, metalness: 0.15, emissive: "#000000" });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, ELEMENT_COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);

    const hazePos = new Float32Array(HAZE * 3);
    for (let i = 0; i < HAZE; i++) {
      const a = (i * 2.399963) % (Math.PI * 2);
      const r = Math.sqrt((i + 0.5) / HAZE) * 2.6;
      hazePos[i * 3] = Math.cos(a) * r + 0.3;
      hazePos[i * 3 + 1] = ((i * 0.618) % 1) * HAZE_HEIGHT;
      hazePos[i * 3 + 2] = Math.sin(a) * r + 1.2;
    }
    this.hazeBase = hazePos.slice();
    this.hazePos = new THREE.BufferAttribute(hazePos, 3);
    this.hazePos.setUsage(THREE.DynamicDrawUsage);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", this.hazePos);
    this.hazeMat = new THREE.PointsMaterial({ size: 0.025, color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.haze = new THREE.Points(hg, this.hazeMat);
    this.scene.add(this.haze);
  }

  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(pixelRatio(dpr, this.quality));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(f: StageFrame, seed: number, reducedMotion: boolean): void {
    const L = lookFor(f, this.look);
    const vis = 1 - f.blackout;
    const [kr, kg, kb] = f.keyColor;
    const [ar, ag, ab] = f.accentColor;
    this.accent.setRGB(ar, ag, ab, THREE.SRGBColorSpace);
    this.fog.density = L.fog;
    this.key.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.key.intensity = 300 * f.intensity * vis;
    this.key.position.set(KEY_POS.x + L.keyX, KEY_POS.y, KEY_POS.z);
    this.key.angle = Math.min(1.1, 0.3 + L.beamWidth * 0.12);
    this.rim.color.copy(this.accent);
    this.rim.intensity = 140 * (0.08 + 0.92 * f.energy * f.energy) * f.intensity * vis * L.rim;
    this.front.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.front.intensity = 0.9 * f.intensity * vis;
    this.fill.intensity = 0.05 * vis;
    this.floorMat.roughness = 0.75 - 0.6 * L.gloss;
    this.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace).lerp(this.accent, L.accent).multiplyScalar((0.12 + 0.6 * f.energy) * f.intensity * vis * L.glow);
    this.material.emissive.copy(this.color);

    // Beam: from the key light down to the floor, wide or narrow by section type.
    this.beam.position.copy(this.key.position);
    this.dir.copy(this.key.target.position).sub(this.key.position);
    const reach = this.dir.length();
    this.beam.quaternion.setFromUnitVectors(UP, this.dir.negate().normalize());
    this.beam.scale.set(L.beamWidth, reach, L.beamWidth);
    this.beamMat.uniforms["uColor"]!.value.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.beamMat.uniforms["uOpacity"]!.value = L.beam * (0.5 + 0.5 * f.intensity) * vis;

    this.gridMat.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.gridMat.opacity = L.floorGrid * (0.4 + 0.6 * f.intensity) * vis;
    this.grid.visible = this.gridMat.opacity > 0.002;

    this.hazeMat.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.hazeMat.opacity = Math.min(1, 0.55 * f.intensity * vis * L.haze);
    this.hazeMat.size = 0.02 + 0.012 * L.haze;
    this.haze.rotation.y = reducedMotion ? 0 : f.beat * 0.004;
    // Haze rises in building sections and settles after a release. A function of the beat, so scrubbing agrees.
    if (this.haze.visible) {
      const lift = reducedMotion ? 0 : f.beat * L.hazeLift;
      const pos = this.hazePos.array as Float32Array;
      for (let i = 0; i < HAZE; i++) {
        const y = (this.hazeBase[i * 3 + 1]! + lift) % HAZE_HEIGHT;
        pos[i * 3 + 1] = y < 0 ? y + HAZE_HEIGHT : y;
      }
      this.hazePos.needsUpdate = true;
    }

    computeLayout(f, seed, this.layout, reducedMotion, L, this.words);
    const { position, rotation, scale } = this.layout;
    // At reduced quality every n-th element is packed into the first instance slots.
    let n = 0;
    for (let i = 0; i < ELEMENT_COUNT; i += this.quality.elementStride) {
      const k = i * 3;
      this.v.set(position[k]!, position[k + 1]!, position[k + 2]!);
      this.e.set(rotation[k]!, rotation[k + 1]!, rotation[k + 2]!);
      this.q.setFromEuler(this.e);
      this.s.set(scale[k]!, scale[k + 1]!, scale[k + 2]!);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;

    const c = f.camera;
    this.camera.position.set(c.position[0], c.position[1], c.position[2]);
    this.camera.fov = c.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(c.target[0], c.target[1], c.target[2]);
    this.renderer.render(this.scene, this.camera);
  }

  setWords(words: Words): void {
    this.words = words;
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
    this.haze.visible = q.haze;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.haze.geometry.dispose();
    this.hazeMat.dispose();
    this.floorMat.dispose();
    this.beam.geometry.dispose();
    this.beamMat.dispose();
    this.grid.geometry.dispose();
    this.gridMat.dispose();
    this.renderer.dispose();
  }
}
