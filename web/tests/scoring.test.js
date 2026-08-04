import test from "node:test";
import assert from "node:assert/strict";
import { CLEAR_SCORE, intersectionOverUnion, isCleared, scoreLabel } from "../src/game/scoring.js";

test("identical masks have a perfect score", () => {
  assert.equal(intersectionOverUnion(Uint8Array.from([0, 255, 255]), Uint8Array.from([0, 255, 255])), 1);
});

test("IoU measures overlap against the union", () => {
  const score = intersectionOverUnion(Uint8Array.from([255, 255, 0]), Uint8Array.from([0, 255, 255]));
  assert.equal(score, 1 / 3);
});

test("score labels clamp to the display range", () => {
  assert.equal(scoreLabel(0.764), "76%");
  assert.equal(scoreLabel(2), "100%");
});

test("clear threshold is inclusive", () => {
  assert.equal(isCleared(CLEAR_SCORE), true);
  assert.equal(isCleared(CLEAR_SCORE - 0.001), false);
});
