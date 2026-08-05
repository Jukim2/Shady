import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { arcballVector, cameraRelativeDrag } from "../src/game/arcball.js";

const rect = { left: 0, top: 0, width: 300, height: 500 };

test("arcball center maps to the sphere facing the camera", () => {
  const vector = arcballVector(150, 250, rect);
  assert.ok(vector.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9);
});

test("arcball keeps points outside the sphere normalized", () => {
  const vector = arcballVector(1000, -1000, rect);
  assert.ok(Math.abs(vector.length() - 1) < 1e-9);
});

test("camera-relative drag preserves a unit quaternion", () => {
  const start = arcballVector(150, 250, rect);
  const current = arcballVector(220, 210, rect);
  const camera = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.4, 0.1));
  const drag = cameraRelativeDrag(start, current, camera);
  assert.ok(Math.abs(drag.length() - 1) < 1e-9);
  assert.ok(drag.angleTo(new THREE.Quaternion()) > 0.1);
});
