export const SCORE_SIZE = 128;
export const CLEAR_SCORE = 0.88;

export function intersectionOverUnion(rendered, target, threshold = 110) {
  if (rendered.length !== target.length) {
    throw new Error("Rendered and target masks must have the same length.");
  }

  let intersection = 0;
  let union = 0;
  for (let index = 0; index < rendered.length; index += 1) {
    const isRendered = rendered[index] > threshold;
    const isTarget = target[index] > threshold;
    if (isRendered && isTarget) intersection += 1;
    if (isRendered || isTarget) union += 1;
  }
  return union === 0 ? 1 : intersection / union;
}

export function scoreLabel(score) {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

export function isCleared(score) {
  return score >= CLEAR_SCORE;
}
