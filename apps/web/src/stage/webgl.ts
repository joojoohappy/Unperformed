/** Three.js stage: a dark floor, two spotlights, 240 instanced elements and a little haze. */
import type { StageFrame } from "@unperformed/performance-core";
import * as THREE from "three";
import { computeLayout, createLayout, ELEMENT_COUNT } from "./layout";
import { pixelRatio, QUALITY, type QualitySettings } from "./quality";
import type { StageRenderer } from "./types";

const HAZE = 420;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

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
  private layout = createLayout();
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
    this.scene.fog = new THREE.FogExp2("#050505", 0.055);

    this.floorMat = new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.42, metalness: 0.35 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    this.key = new THREE.SpotLight("#ffffff", 0, 0, 0.55, 0.75, 1.1);
    this.key.position.set(0.6, 9, 3.5);
    this.key.target.position.set(0, 0, 0);
    this.scene.add(this.key, this.key.target);

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
      hazePos[i * 3 + 1] = ((i * 0.618) % 1) * 6;
      hazePos[i * 3 + 2] = Math.sin(a) * r + 1.2;
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", new THREE.BufferAttribute(hazePos, 3));
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
    const vis = 1 - f.blackout;
    const [kr, kg, kb] = f.keyColor;
    const [ar, ag, ab] = f.accentColor;
    this.key.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.key.intensity = 300 * f.intensity * vis;
    this.rim.color.setRGB(ar, ag, ab, THREE.SRGBColorSpace);
    this.rim.intensity = 140 * (0.08 + 0.92 * f.energy * f.energy) * f.intensity * vis;
    this.front.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.front.intensity = 0.9 * f.intensity * vis;
    this.fill.intensity = 0.05 * vis;
    this.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace).multiplyScalar((0.12 + 0.6 * f.energy) * f.intensity * vis);
    this.material.emissive.copy(this.color);
    this.hazeMat.color.setRGB(kr, kg, kb, THREE.SRGBColorSpace);
    this.hazeMat.opacity = 0.55 * f.intensity * vis;
    this.haze.rotation.y = reducedMotion ? 0 : f.beat * 0.004;

    computeLayout(f, seed, this.layout, reducedMotion);
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
    this.renderer.dispose();
  }
}
