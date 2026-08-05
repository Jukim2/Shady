import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { arcballVector, cameraRelativeDrag } from "./arcball.js";
import { CLEAR_SCORE, SCORE_SIZE, intersectionOverUnion } from "./scoring.js";

const DEG = Math.PI / 180;
const WHITE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const DISPLAY_SIZE = 256;

function loadImageMask(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SCORE_SIZE;
      canvas.height = SCORE_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, SCORE_SIZE, SCORE_SIZE);
      const rgba = context.getImageData(0, 0, SCORE_SIZE, SCORE_SIZE).data;
      const mask = new Uint8Array(SCORE_SIZE * SCORE_SIZE);
      for (let index = 0; index < mask.length; index += 1) mask[index] = rgba[index * 4];
      resolve(mask);
    };
    image.onerror = () => reject(new Error(`목표 이미지를 불러오지 못했습니다: ${url}`));
    image.src = url;
  });
}

export class ShadowGame {
  constructor(canvas, level, callbacks = {}) {
    this.canvas = canvas;
    this.level = level;
    this.callbacks = callbacks;
    this.dragging = false;
    this.loaded = false;
    this.destroyed = false;
    this.score = 0;
    this.scoreTimer = null;
    this.frame = null;
    this.shadowCanvas = callbacks.shadowCanvas || null;
    this.shadowContext = this.shadowCanvas?.getContext("2d") || null;
    this.shadowBuffer = document.createElement("canvas");
    this.shadowBuffer.width = SCORE_SIZE;
    this.shadowBuffer.height = SCORE_SIZE;
    this.shadowBufferContext = this.shadowBuffer.getContext("2d");

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0xc9dfd8, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(3.5, -5.4, 3.1);
    this.camera.lookAt(0, 0, 0);

    this.objectRoot = new THREE.Group();
    this.objectRoot.rotation.order = "ZYX";
    this.scene.add(this.objectRoot);

    this.environment = new THREE.Group();
    this.scene.add(this.environment);
    this.buildEnvironment();

    this.scoreTarget = new THREE.WebGLRenderTarget(SCORE_SIZE, SCORE_SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 4,
    });
    this.scoreCameraX = this.makeScoreCamera("x");
    this.scoreCameraY = this.makeScoreCamera("y");

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);

    this.onResize();
    this.load();
    this.loop();
  }

  buildEnvironment() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 64),
      new THREE.MeshStandardMaterial({ color: 0xb5d2c9, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1.28;
    floor.receiveShadow = true;
    this.environment.add(floor);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.52, 1.535, 80),
      new THREE.MeshBasicMaterial({ color: 0xf8f3e8, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
    );
    halo.position.set(-0.4, 0.45, 0.15);
    halo.lookAt(this.camera.position);
    this.environment.add(halo);

    this.scene.add(new THREE.HemisphereLight(0xfffbec, 0x4a766e, 2.4));
    const key = new THREE.DirectionalLight(0xfff4d5, 4.5);
    key.position.set(-3, -4, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 5;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xf57a4e, 2.2);
    rim.position.set(4, 2, 1);
    this.scene.add(rim);
  }

  makeScoreCamera(axis) {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.up.set(0, 0, 1);
    camera.position.set(axis === "x" ? 4 : 0, axis === "y" ? 4 : 0, 0);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  async load() {
    try {
      const masks = [loadImageMask(this.level.assets.target)];
      if (this.level.assets.targetSecondary) masks.push(loadImageMask(this.level.assets.targetSecondary));
      const loader = new OBJLoader();
      const [object, targetMasks] = await Promise.all([
        loader.loadAsync(this.level.assets.model),
        Promise.all(masks),
      ]);
      if (this.destroyed) return;

      const material = new THREE.MeshPhysicalMaterial({
        color: 0xee7048,
        roughness: 0.48,
        metalness: 0.02,
        clearcoat: 0.16,
        clearcoatRoughness: 0.68,
        side: THREE.DoubleSide,
      });
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry.deleteAttribute("normal");
        const smoothedGeometry = mergeVertices(child.geometry, 1e-4);
        smoothedGeometry.computeVertexNormals();
        smoothedGeometry.normalizeNormals();
        child.geometry.dispose();
        child.geometry = smoothedGeometry;
        child.material = material;
        child.castShadow = true;
      });
      this.model = object;
      this.objectRoot.add(object);
      this.targetMasks = targetMasks;
      this.reset(false);
      this.loaded = true;
      this.callbacks.onReady?.();
      this.measureScore();
    } catch (error) {
      this.callbacks.onError?.(error);
    }
  }

  onPointerDown(event) {
    if (!this.loaded) return;
    this.dragging = true;
    const rect = this.canvas.getBoundingClientRect();
    this.dragStartVector = arcballVector(event.clientX, event.clientY, rect);
    this.dragStartQuaternion = this.objectRoot.quaternion.clone();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-dragging");
    this.callbacks.onInteraction?.();
  }

  onPointerMove(event) {
    if (!this.dragging || !this.loaded) return;
    const current = arcballVector(event.clientX, event.clientY, this.canvas.getBoundingClientRect());
    const drag = cameraRelativeDrag(this.dragStartVector, current, this.camera.quaternion);
    this.objectRoot.quaternion.copy(drag.multiply(this.dragStartQuaternion)).normalize();
    this.scheduleScore();
  }

  onPointerUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    this.canvas.classList.remove("is-dragging");
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.measureScore();
  }

  onKeyDown(event) {
    if (event.key.toLowerCase() !== "f") return;
    if (document.fullscreenElement) document.exitFullscreen();
    else this.canvas.closest(".play-shell")?.requestFullscreen();
  }

  onResize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  }

  scheduleScore() {
    window.clearTimeout(this.scoreTimer);
    this.scoreTimer = window.setTimeout(() => this.measureScore(), 72);
  }

  paintShadowPreview(mask) {
    if (!this.shadowContext || !this.shadowBufferContext) return;
    const image = this.shadowBufferContext.createImageData(SCORE_SIZE, SCORE_SIZE);
    for (let index = 0; index < mask.length; index += 1) {
      const coverage = mask[index] / 255;
      image.data[index * 4] = Math.round(16 + coverage * 228);
      image.data[index * 4 + 1] = Math.round(29 + coverage * 209);
      image.data[index * 4 + 2] = Math.round(26 + coverage * 199);
      image.data[index * 4 + 3] = 255;
    }
    this.shadowBufferContext.putImageData(image, 0, 0);
    this.shadowContext.imageSmoothingEnabled = true;
    this.shadowContext.imageSmoothingQuality = "high";
    this.shadowContext.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    this.shadowContext.drawImage(this.shadowBuffer, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  }

  renderMask(camera, targetMask, showPreview = false) {
    const pixels = new Uint8Array(SCORE_SIZE * SCORE_SIZE * 4);
    const previousTarget = this.renderer.getRenderTarget();
    const previousOverride = this.scene.overrideMaterial;
    const previousEnvironment = this.environment.visible;
    const previousClear = new THREE.Color();
    this.renderer.getClearColor(previousClear);
    const previousAlpha = this.renderer.getClearAlpha();

    this.environment.visible = false;
    this.scene.overrideMaterial = WHITE_MATERIAL;
    this.renderer.setRenderTarget(this.scoreTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, camera);
    this.renderer.readRenderTargetPixels(this.scoreTarget, 0, 0, SCORE_SIZE, SCORE_SIZE, pixels);

    const renderedMask = new Uint8Array(SCORE_SIZE * SCORE_SIZE);
    for (let y = 0; y < SCORE_SIZE; y += 1) {
      for (let x = 0; x < SCORE_SIZE; x += 1) {
        const outputIndex = y * SCORE_SIZE + x;
        const inputIndex = ((SCORE_SIZE - 1 - y) * SCORE_SIZE + x) * 4;
        renderedMask[outputIndex] = pixels[inputIndex];
      }
    }

    this.renderer.setRenderTarget(previousTarget);
    this.scene.overrideMaterial = previousOverride;
    this.environment.visible = previousEnvironment;
    this.renderer.setClearColor(previousClear, previousAlpha);
    if (showPreview) this.paintShadowPreview(renderedMask);
    return intersectionOverUnion(renderedMask, targetMask);
  }

  measureScore() {
    if (!this.loaded || this.destroyed) return 0;
    const scores = [this.renderMask(this.scoreCameraX, this.targetMasks[0], true)];
    if (this.targetMasks[1]) scores.push(this.renderMask(this.scoreCameraY, this.targetMasks[1]));
    this.score = Math.min(...scores);
    this.callbacks.onScore?.(this.score, this.score >= CLEAR_SCORE);
    return this.score;
  }

  hint() {
    if (!this.loaded) return;
    const start = this.objectRoot.quaternion.clone();
    const target = start.clone().slerp(new THREE.Quaternion(), 0.38);
    const startedAt = performance.now();
    const animate = (time) => {
      if (this.destroyed) return;
      const progress = Math.min(1, (time - startedAt) / 420);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.objectRoot.quaternion.copy(start).slerp(target, eased).normalize();
      if (progress < 1) requestAnimationFrame(animate);
      else this.measureScore();
    };
    requestAnimationFrame(animate);
  }

  reset(shouldMeasure = true) {
    const [x, y, z] = this.level.start;
    this.objectRoot.rotation.set(x * DEG, y * DEG, z * DEG);
    if (shouldMeasure && this.loaded) this.measureScore();
  }

  solve() {
    this.objectRoot.quaternion.identity();
    this.measureScore();
  }

  loop() {
    if (this.destroyed) return;
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(() => this.loop());
  }

  renderState() {
    const euler = new THREE.Euler().setFromQuaternion(this.objectRoot.quaternion, "ZYX");
    return {
      mode: "play",
      level: this.level.id,
      coordinateSystem: "right-handed; Z is up; drag rotates around world Y/Z axes",
      rotationDeg: [euler.x, euler.y, euler.z].map((value) => Math.round(value / DEG)),
      match: Math.round(this.score * 100),
      clearAt: Math.round(CLEAR_SCORE * 100),
      dragging: this.dragging,
      loaded: this.loaded,
    };
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.scoreTimer);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.scoreTarget.dispose();
    this.renderer.dispose();
  }
}
