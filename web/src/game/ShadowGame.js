import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { arcballVector, cameraRelativeDrag } from "./arcball.js";
import { CLEAR_SCORE, SCORE_SIZE, intersectionOverUnion } from "./scoring.js";

const DEG = Math.PI / 180;
const WHITE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const PROJECTION_SIZE = 256;

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

function flipMaskHorizontally(mask) {
  const flipped = new Uint8Array(mask.length);
  for (let y = 0; y < SCORE_SIZE; y += 1) {
    for (let x = 0; x < SCORE_SIZE; x += 1) {
      flipped[y * SCORE_SIZE + x] = mask[y * SCORE_SIZE + (SCORE_SIZE - 1 - x)];
    }
  }
  return flipped;
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
    this.lastScoreAt = 0;
    this.frame = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x607f77, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x607f77, 7, 14);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(-4.9, -8.4, 2.85);
    this.camera.lookAt(0.15, 0, -0.08);

    this.objectRoot = new THREE.Group();
    this.objectRoot.rotation.order = "ZYX";
    this.objectRoot.scale.setScalar(0.84);
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
    this.scoreCameraX = this.makeScoreCamera("negativeX");
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
    const projectionBasis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0),
    );

    const wallFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(5.55, 4.65),
      new THREE.MeshStandardMaterial({ color: 0x35544d, roughness: 0.96 }),
    );
    wallFrame.setRotationFromMatrix(projectionBasis);
    wallFrame.position.set(1.94, 0, 0.85);
    this.environment.add(wallFrame);

    this.shadowWall = new THREE.Mesh(
      new THREE.PlaneGeometry(5.25, 4.35),
      new THREE.MeshStandardMaterial({ color: 0xe9dfc7, roughness: 0.94, metalness: 0 }),
    );
    this.shadowWall.setRotationFromMatrix(projectionBasis);
    this.shadowWall.position.set(1.9, 0, 0.85);
    this.shadowWall.receiveShadow = true;
    this.environment.add(this.shadowWall);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 11),
      new THREE.MeshStandardMaterial({ color: 0x55756d, roughness: 0.98 }),
    );
    floor.position.set(0, 0, -1.3);
    floor.receiveShadow = true;
    this.environment.add(floor);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.72, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: 0x46665e, roughness: 0.82, metalness: 0.04 }),
    );
    platform.rotation.x = Math.PI / 2;
    platform.position.z = -1.28;
    platform.receiveShadow = true;
    this.environment.add(platform);

    this.scene.add(new THREE.HemisphereLight(0xdceae3, 0x294940, 0.78));

    const lightPosition = new THREE.Vector3(-5.5, 0, 0.15);
    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(2.2, 0, 0.15);
    this.environment.add(lightTarget);

    const key = new THREE.DirectionalLight(0xffdfa0, 5.25);
    key.position.copy(lightPosition);
    key.target = lightTarget;
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -2.25;
    key.shadow.camera.right = 2.25;
    key.shadow.camera.top = 2.25;
    key.shadow.camera.bottom = -2.25;
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 4;
    this.scene.add(key);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe3a8 }),
    );
    lamp.position.copy(lightPosition);
    this.environment.add(lamp);

    const beamDirection = lightTarget.position.clone().sub(lightPosition);
    const beamLength = beamDirection.length();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 1.45, beamLength, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe8b4,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.copy(lightPosition).add(lightTarget.position).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDirection.normalize());
    beam.renderOrder = 1;
    this.environment.add(beam);

    const rim = new THREE.DirectionalLight(0xf47c55, 1.35);
    rim.position.set(-3, -2, 2.2);
    this.scene.add(rim);
  }

  makeScoreCamera(axis) {
    const camera = new THREE.OrthographicCamera(-0.84, 0.84, 0.84, -0.84, 0.1, 10);
    camera.up.set(0, 0, 1);
    camera.position.set(axis === "negativeX" ? -4 : 0, axis === "y" ? 4 : 0, 0);
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
      this.targetMasks = [flipMaskHorizontally(targetMasks[0]), ...targetMasks.slice(1)];
      this.addTargetProjection(this.targetMasks[0]);
      this.reset(false);
      this.loaded = true;
      this.callbacks.onReady?.();
      this.measureScore();
    } catch (error) {
      this.callbacks.onError?.(error);
    }
  }

  addTargetProjection(targetMask) {
    const canvas = document.createElement("canvas");
    canvas.width = PROJECTION_SIZE;
    canvas.height = PROJECTION_SIZE;
    const context = canvas.getContext("2d");
    const source = document.createElement("canvas");
    source.width = SCORE_SIZE;
    source.height = SCORE_SIZE;
    const sourceContext = source.getContext("2d");
    const image = sourceContext.createImageData(SCORE_SIZE, SCORE_SIZE);

    for (let index = 0; index < targetMask.length; index += 1) {
      const x = index % SCORE_SIZE;
      const y = Math.floor(index / SCORE_SIZE);
      const isTarget = targetMask[index] > 110;
      const isEdge = isTarget && (
        x === 0 || y === 0 || x === SCORE_SIZE - 1 || y === SCORE_SIZE - 1 ||
        targetMask[index - 1] <= 110 || targetMask[index + 1] <= 110 ||
        targetMask[index - SCORE_SIZE] <= 110 || targetMask[index + SCORE_SIZE] <= 110
      );
      if (!isTarget) continue;
      image.data[index * 4] = 237;
      image.data[index * 4 + 1] = 112;
      image.data[index * 4 + 2] = 72;
      image.data[index * 4 + 3] = isEdge ? 255 : 42;
    }

    sourceContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, PROJECTION_SIZE, PROJECTION_SIZE);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const goal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.68, 1.68),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    const projectionBasis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0),
    );
    goal.setRotationFromMatrix(projectionBasis);
    goal.position.set(1.87, 0, 0);
    goal.renderOrder = 3;
    this.environment.add(goal);
    this.goalProjection = goal;
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
    if (this.scoreTimer !== null) return;
    const delay = Math.max(0, 48 - (performance.now() - this.lastScoreAt));
    this.scoreTimer = window.setTimeout(() => {
      this.scoreTimer = null;
      this.measureScore();
    }, delay);
  }

  renderMask(camera, targetMask) {
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
    return intersectionOverUnion(renderedMask, targetMask);
  }

  measureScore() {
    if (!this.loaded || this.destroyed) return 0;
    window.clearTimeout(this.scoreTimer);
    this.scoreTimer = null;
    this.lastScoreAt = performance.now();
    const scores = [this.renderMask(this.scoreCameraX, this.targetMasks[0])];
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
      coordinateSystem: "right-handed; Z is up; camera-relative arcball; shadow projects along world -X onto a YZ wall",
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
