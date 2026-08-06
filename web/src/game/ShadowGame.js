import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { arcballVector, cameraRelativeDrag } from "./arcball.js";
import { CLEAR_SCORE, SCORE_SIZE, intersectionOverUnion } from "./scoring.js";

const DEG = Math.PI / 180;
const WHITE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const PROJECTION_SIZE = 512;

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
    this.completing = false;
    this.solved = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1c1712, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1c1712, 9.5, 17);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0.25, -12.8, 2.15);
    this.camera.lookAt(0.25, 0, 0.05);

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
    this.scoreCameraX = this.makeScoreCamera("positiveX");
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
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
    );

    const wallFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 4.4),
      new THREE.MeshStandardMaterial({ color: 0x241d17, roughness: 0.98 }),
    );
    wallFrame.setRotationFromMatrix(projectionBasis);
    wallFrame.position.set(-2.65, 0.65, 0.62);
    this.environment.add(wallFrame);

    this.shadowWall = new THREE.Mesh(
      new THREE.PlaneGeometry(3.55, 4.15),
      new THREE.MeshStandardMaterial({ color: 0x8b7761, roughness: 1, metalness: 0 }),
    );
    this.shadowWall.setRotationFromMatrix(projectionBasis);
    this.shadowWall.position.set(-2.65, 0.59, 0.62);
    this.environment.add(this.shadowWall);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 11),
      new THREE.MeshStandardMaterial({ color: 0x211a14, roughness: 1 }),
    );
    floor.position.set(0, 0, -1.3);
    floor.receiveShadow = true;
    this.environment.add(floor);

    const wallBase = new THREE.Mesh(
      new THREE.BoxGeometry(3.95, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x34271d, roughness: 0.76, metalness: 0.04 }),
    );
    wallBase.position.set(-2.65, 0.62, -1.42);
    wallBase.receiveShadow = true;
    this.environment.add(wallBase);

    this.scene.add(new THREE.HemisphereLight(0xcbbba3, 0x100c09, 0.3));

    const lightPosition = new THREE.Vector3(4.85, 0, 0.42);
    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(-2.6, 0, 0.3);
    this.environment.add(lightTarget);

    const key = new THREE.DirectionalLight(0xffd28d, 5.25);
    key.position.copy(lightPosition);
    key.target = lightTarget;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -2.25;
    key.shadow.camera.right = 2.25;
    key.shadow.camera.top = 2.25;
    key.shadow.camera.bottom = -2.25;
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 3;
    this.scene.add(key);

    const lampBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.43, 0.68, 48),
      new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 0.64, metalness: 0.16 }),
    );
    lampBody.rotation.z = Math.PI / 2;
    lampBody.position.set(5.08, 0, 0.42);
    this.environment.add(lampBody);

    const lampHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb85e, transparent: true, opacity: 0.075, depthWrite: false }),
    );
    lampHalo.position.copy(lightPosition);
    this.environment.add(lampHalo);

    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.025, 48),
      new THREE.MeshBasicMaterial({ color: 0xffdfa2 }),
    );
    lamp.rotation.z = Math.PI / 2;
    lamp.position.copy(lightPosition);
    this.environment.add(lamp);

    const beamDirection = lightTarget.position.clone().sub(lightPosition);
    const beamLength = beamDirection.length();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.72, 0.18, beamLength, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd09a,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.copy(lightPosition).add(lightTarget.position).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDirection.normalize());
    beam.renderOrder = 1;
    this.environment.add(beam);

    const wallSpot = new THREE.Mesh(
      new THREE.CircleGeometry(1.82, 64),
      new THREE.MeshBasicMaterial({ color: 0xffdba4, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    );
    wallSpot.setRotationFromMatrix(projectionBasis);
    wallSpot.position.set(-2.65, 0.53, 0.45);
    this.environment.add(wallSpot);

    const rim = new THREE.DirectionalLight(0xe3734d, 0.85);
    rim.position.set(3, -2, 2.2);
    this.scene.add(rim);
  }

  makeScoreCamera(axis) {
    const camera = new THREE.OrthographicCamera(-0.84, 0.84, 0.84, -0.84, 0.1, 10);
    camera.up.set(0, 0, 1);
    camera.position.set(axis === "positiveX" ? 4 : 0, axis === "y" ? 4 : 0, 0);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  async load() {
    try {
      const loader = new OBJLoader();
      const object = await loader.loadAsync(this.level.assets.model);
      if (this.destroyed) return;

      const material = new THREE.MeshPhysicalMaterial({
        color: 0xd06b47,
        roughness: 0.72,
        metalness: 0.02,
        clearcoat: 0.04,
        clearcoatRoughness: 0.9,
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
      this.objectRoot.quaternion.identity();
      this.targetMasks = [this.renderMask(this.scoreCameraX)];
      if (this.level.assets.targetSecondary) this.targetMasks.push(this.renderMask(this.scoreCameraY));
      this.addProjectionDisplay(this.targetMasks[0]);
      this.reset(false);
      this.loaded = true;
      this.callbacks.onReady?.();
      this.measureScore();
    } catch (error) {
      this.callbacks.onError?.(error);
    }
  }

  addProjectionDisplay(targetMask) {
    const canvas = document.createElement("canvas");
    canvas.width = PROJECTION_SIZE;
    canvas.height = PROJECTION_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = SCORE_SIZE;
    maskCanvas.height = SCORE_SIZE;
    const maskContext = maskCanvas.getContext("2d");
    const maskPixels = maskContext.createImageData(SCORE_SIZE, SCORE_SIZE);
    for (let index = 0; index < targetMask.length; index += 1) {
      maskPixels.data[index * 4] = 255;
      maskPixels.data[index * 4 + 1] = 255;
      maskPixels.data[index * 4 + 2] = 255;
      maskPixels.data[index * 4 + 3] = targetMask[index];
    }
    maskContext.putImageData(maskPixels, 0, 0);
    context.drawImage(maskCanvas, 0, 0, PROJECTION_SIZE, PROJECTION_SIZE);
    const source = context.getImageData(0, 0, PROJECTION_SIZE, PROJECTION_SIZE);
    const output = context.createImageData(PROJECTION_SIZE, PROJECTION_SIZE);

    for (let index = 0; index < PROJECTION_SIZE * PROJECTION_SIZE; index += 1) {
      const x = index % PROJECTION_SIZE;
      const y = Math.floor(index / PROJECTION_SIZE);
      const isTarget = source.data[index * 4] > 110;
      const isEdge = isTarget && (
        x < 3 || y < 3 || x >= PROJECTION_SIZE - 3 || y >= PROJECTION_SIZE - 3 ||
        source.data[(index - 3) * 4] <= 110 || source.data[(index + 3) * 4] <= 110 ||
        source.data[(index - PROJECTION_SIZE * 3) * 4] <= 110 || source.data[(index + PROJECTION_SIZE * 3) * 4] <= 110
      );
      if (!isTarget) continue;
      const showDash = isEdge && Math.floor((x + y) / 13) % 2 === 0;
      output.data[index * 4] = 239;
      output.data[index * 4 + 1] = 205;
      output.data[index * 4 + 2] = 156;
      output.data[index * 4 + 3] = showDash ? 245 : 20;
    }

    context.putImageData(output, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.liveShadowCanvas = document.createElement("canvas");
    this.liveShadowCanvas.width = PROJECTION_SIZE;
    this.liveShadowCanvas.height = PROJECTION_SIZE;
    this.liveShadowContext = this.liveShadowCanvas.getContext("2d");
    this.liveShadowTexture = new THREE.CanvasTexture(this.liveShadowCanvas);
    this.liveShadowTexture.colorSpace = THREE.SRGBColorSpace;
    this.liveShadowTexture.minFilter = THREE.LinearFilter;
    this.liveShadowTexture.magFilter = THREE.LinearFilter;

    const projectionBasis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
    );
    const liveShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.38, 2.38),
      new THREE.MeshBasicMaterial({
        map: this.liveShadowTexture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    liveShadow.setRotationFromMatrix(projectionBasis);
    liveShadow.position.set(-2.65, 0.515, 0.28);
    liveShadow.renderOrder = 3;
    this.environment.add(liveShadow);
    this.liveShadowProjection = liveShadow;

    const goal = new THREE.Mesh(
      new THREE.PlaneGeometry(2.38, 2.38),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    goal.setRotationFromMatrix(projectionBasis);
    goal.position.set(-2.65, 0.505, 0.28);
    goal.renderOrder = 4;
    this.environment.add(goal);
    this.goalProjection = goal;
  }

  onPointerDown(event) {
    if (!this.loaded || this.completing || this.solved) return;
    this.dragging = true;
    const rect = this.canvas.getBoundingClientRect();
    this.dragStartVector = arcballVector(event.clientX, event.clientY, rect);
    this.dragStartQuaternion = this.objectRoot.quaternion.clone();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-dragging");
    this.callbacks.onInteraction?.();
  }

  onPointerMove(event) {
    if (!this.dragging || !this.loaded || this.completing || this.solved) return;
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
    if (!this.completing && !this.solved) this.measureScore();
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
    if (this.camera.aspect >= 1.2) {
      this.camera.fov = 28;
      this.camera.position.set(0.25, -12.8, 2.15);
      this.camera.lookAt(0.25, 0, 0.05);
    } else {
      this.camera.fov = 38;
      this.camera.position.set(0.1, -13.8, 2.55);
      this.camera.lookAt(-0.35, 0, 0.05);
    }
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

  renderMask(camera) {
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
    return renderedMask;
  }

  updateLiveProjection(mask) {
    if (!this.liveShadowContext || !mask) return;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = SCORE_SIZE;
    sourceCanvas.height = SCORE_SIZE;
    const sourceContext = sourceCanvas.getContext("2d");
    const pixels = sourceContext.createImageData(SCORE_SIZE, SCORE_SIZE);
    for (let index = 0; index < mask.length; index += 1) {
      pixels.data[index * 4] = 28;
      pixels.data[index * 4 + 1] = 20;
      pixels.data[index * 4 + 2] = 15;
      pixels.data[index * 4 + 3] = Math.round(mask[index] * 0.9);
    }
    sourceContext.putImageData(pixels, 0, 0);
    this.liveShadowContext.clearRect(0, 0, PROJECTION_SIZE, PROJECTION_SIZE);
    this.liveShadowContext.save();
    this.liveShadowContext.imageSmoothingEnabled = true;
    this.liveShadowContext.imageSmoothingQuality = "high";
    this.liveShadowContext.filter = "blur(1.4px)";
    this.liveShadowContext.drawImage(sourceCanvas, 0, 0, PROJECTION_SIZE, PROJECTION_SIZE);
    this.liveShadowContext.restore();
    this.liveShadowTexture.needsUpdate = true;
  }

  measureScore({ displayScore = null, allowClear = true } = {}) {
    if (!this.loaded || this.destroyed) return 0;
    window.clearTimeout(this.scoreTimer);
    this.scoreTimer = null;
    this.lastScoreAt = performance.now();
    const primaryMask = this.renderMask(this.scoreCameraX);
    this.updateLiveProjection(primaryMask);
    const scores = [intersectionOverUnion(primaryMask, this.targetMasks[0])];
    if (this.targetMasks[1]) scores.push(intersectionOverUnion(this.renderMask(this.scoreCameraY), this.targetMasks[1]));
    const actualScore = Math.min(...scores);
    this.score = displayScore ?? actualScore;
    this.callbacks.onScore?.(this.score, allowClear && actualScore >= CLEAR_SCORE);
    return this.score;
  }

  hint() {
    if (!this.loaded || this.completing || this.solved) return;
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
    if (this.completing || this.solved) return;
    const [x, y, z] = this.level.start;
    this.objectRoot.rotation.set(x * DEG, y * DEG, z * DEG);
    if (shouldMeasure && this.loaded) this.measureScore();
  }

  solve() {
    this.objectRoot.quaternion.identity();
    this.measureScore();
  }

  complete(onComplete) {
    if (!this.loaded || this.destroyed || this.completing || this.solved) return;
    this.completing = true;
    this.dragging = false;
    this.canvas.classList.remove("is-dragging");
    window.clearTimeout(this.scoreTimer);
    this.scoreTimer = null;
    const startRotation = this.objectRoot.quaternion.clone();
    const startScore = this.score;
    const targetRotation = new THREE.Quaternion();
    const startedAt = performance.now();
    const animate = (time) => {
      if (this.destroyed) return;
      const progress = Math.min(1, (time - startedAt) / 1100);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      this.objectRoot.quaternion.copy(startRotation).slerp(targetRotation, eased).normalize();
      this.measureScore({ displayScore: startScore + (1 - startScore) * eased, allowClear: false });
      if (progress < 1) requestAnimationFrame(animate);
      else {
        this.objectRoot.quaternion.identity();
        this.solved = true;
        this.completing = false;
        this.measureScore({ displayScore: 1, allowClear: false });
        onComplete?.();
      }
    };
    requestAnimationFrame(animate);
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
      coordinateSystem: "right-handed; Z is up; camera-relative arcball; score mask and visible wall shadow share one projection",
      rotationDeg: [euler.x, euler.y, euler.z].map((value) => Math.round(value / DEG)),
      match: Math.round(this.score * 100),
      clearAt: Math.round(CLEAR_SCORE * 100),
      dragging: this.dragging,
      completing: this.completing,
      solved: this.solved,
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
    this.liveShadowTexture?.dispose();
    this.renderer.dispose();
  }
}
