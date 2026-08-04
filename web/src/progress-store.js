const KEY = "shady-progress-v1";

const emptyProgress = () => ({ cleared: {}, lastLevelId: null });

export function readProgress() {
  try {
    return { ...emptyProgress(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return emptyProgress();
  }
}

export function saveClear(levelId, score) {
  const progress = readProgress();
  progress.cleared[levelId] = Math.max(progress.cleared[levelId] || 0, score);
  progress.lastLevelId = levelId;
  localStorage.setItem(KEY, JSON.stringify(progress));
  return progress;
}

export function resetProgress() {
  localStorage.removeItem(KEY);
  return emptyProgress();
}
