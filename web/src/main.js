import "./styles.css";
import { categories, getCategory, getLevel, levels, levelsByCategory } from "./data/levels.js";
import { scoreLabel } from "./game/scoring.js";
import { readProgress, resetProgress, saveClear } from "./progress-store.js";

const app = document.querySelector("#app");
let game = null;
let routeState = { mode: "home" };
let clearShown = false;

const icon = (name) => {
  const paths = {
    arrow: '<path d="M8 4l8 8-8 8"/>',
    back: '<path d="M15 4l-8 8 8 8"/>',
    rotate: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/>',
    check: '<path d="M5 12.5l4.2 4L19 7"/>',
    sound: '<path d="M5 10v4h3l4 3V7L8 10H5zm10-1a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
};

function navigate(path) {
  if (window.location.hash === path) renderRoute();
  else window.location.hash = path;
}

function parseRoute() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "category" && getCategory(parts[1])) return { mode: "category", categoryId: parts[1] };
  if (parts[0] === "play" && getLevel(parts[1])) return { mode: "play", levelId: parts[1] };
  return { mode: "home" };
}

function pageHeader({ eyebrow, title, back = "#/" }) {
  return `
    <header class="page-header">
      <button class="icon-button" data-nav="${back}" aria-label="뒤로 가기">${icon("back")}</button>
      <div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>
      <button class="icon-button sound-button" aria-label="소리 켜기" disabled>${icon("sound")}</button>
    </header>`;
}

function renderHome() {
  const progress = readProgress();
  const clearedCount = Object.keys(progress.cleared).length;
  routeState = { mode: "home" };
  app.innerHTML = `
    <main class="screen home-screen">
      <section class="hero">
        <div class="sun-disc" aria-hidden="true"><span></span><span></span><span></span></div>
        <p class="brand-mark">SHADY</p>
        <h1>돌리면,<br /><em>그림자가 답이 된다.</em></h1>
        <p class="hero-copy">낯선 조각을 천천히 돌려<br />빛 속에 숨은 모양을 찾아보세요.</p>
        <button class="primary-button" data-nav="#/category/silhouette">
          퍼즐 시작 <span>${icon("arrow")}</span>
        </button>
        ${clearedCount ? `<p class="continue-note">내 기록 · ${clearedCount}/${levels.length} 그림자 발견</p>` : ""}
      </section>
      <section class="category-section">
        <div class="section-heading"><p class="eyebrow">CHAPTERS</p><h2>어떤 빛을 따라갈까요?</h2></div>
        <div class="category-stack">
          ${categories.map((category) => {
            const categoryLevels = levelsByCategory(category.id);
            const done = categoryLevels.filter((level) => progress.cleared[level.id]).length;
            return `
              <button class="category-card" style="--accent:${category.accent}" data-nav="#/category/${category.id}">
                <span class="category-number">${category.number}</span>
                <span class="category-content">
                  <small>${category.kicker}</small>
                  <strong>${category.title}</strong>
                  <span>${done}/${categoryLevels.length} 완료</span>
                </span>
                <span class="category-arrow">${icon("arrow")}</span>
              </button>`;
          }).join("")}
        </div>
      </section>
      <footer class="home-footer"><span>SHADOW PUZZLE LAB</span><button id="reset-progress">기록 초기화</button></footer>
    </main>`;
}

function renderCategory(categoryId) {
  const category = getCategory(categoryId);
  const categoryLevels = levelsByCategory(categoryId);
  const progress = readProgress();
  routeState = { mode: "category", categoryId };
  app.innerHTML = `
    <main class="screen category-screen" style="--accent:${category.accent}">
      ${pageHeader({ eyebrow: `CHAPTER ${category.number}`, title: category.title })}
      <section class="chapter-intro">
        <p>${category.description}</p>
        <div class="chapter-line"><span></span><small>${categoryLevels.length} LEVELS</small></div>
      </section>
      <section class="level-list" aria-label="레벨 목록">
        ${categoryLevels.map((level) => {
          const best = progress.cleared[level.id];
          return `
            <button class="level-card" data-nav="#/play/${level.id}">
              <span class="level-index">${String(level.order).padStart(2, "0")}</span>
              <span class="preview-frame"><img src="${level.assets.preview}" alt="${level.title} 추상 오브젝트" /></span>
              <span class="level-copy">
                <small>${level.subtitle}</small>
                <strong>${level.title}</strong>
                <span class="difficulty" aria-label="난이도 ${level.difficulty}">${[1, 2, 3].map((dot) => `<i class="${dot <= level.difficulty ? "on" : ""}"></i>`).join("")}</span>
              </span>
              <span class="level-status ${best ? "cleared" : ""}">${best ? icon("check") : icon("arrow")}${best ? `<small>${scoreLabel(best)}</small>` : ""}</span>
            </button>`;
        }).join("")}
      </section>
      <nav class="chapter-nav">
        ${categories.map((item) => `<button class="${item.id === categoryId ? "active" : ""}" data-nav="#/category/${item.id}" aria-label="${item.title}">${item.number}</button>`).join("")}
      </nav>
    </main>`;
}

function renderPlay(levelId) {
  const level = getLevel(levelId);
  const category = getCategory(level.category);
  clearShown = false;
  routeState = { mode: "play", levelId, loaded: false, match: 0 };
  const playState = routeState;
  app.innerHTML = `
    <main class="screen play-screen">
      ${pageHeader({ eyebrow: `${category.number} · LEVEL ${String(level.order).padStart(2, "0")}`, title: level.title, back: `#/category/${level.category}` })}
      <section class="play-shell">
        <canvas id="game-canvas" aria-label="회전 가능한 ${level.title} 그림자 퍼즐"></canvas>
        <div class="shadow-compare" id="shadow-compare" aria-label="현재 그림자와 목표 윤곽선 비교">
          <div class="shadow-heading">
            <span><i></i>LIGHT SCREEN</span>
            <strong id="match-state">윤곽을 따라 맞춰보세요</strong>
          </div>
          <div class="shadow-stage">
            <canvas id="current-shadow" width="256" height="256" aria-label="현재 그림자와 ${level.title} 목표 윤곽선"></canvas>
            <span class="screen-glow" aria-hidden="true"></span>
          </div>
          <div class="shadow-legend" aria-hidden="true">
            <span><i class="current-key"></i>현재 그림자</span>
            <span><i class="target-key"></i>목표 윤곽</span>
          </div>
          ${level.assets.targetSecondary ? `<div class="secondary-goal"><span>두 번째 목표</span><img src="${level.assets.targetSecondary}" alt="두 번째 목표 실루엣" /></div>` : ""}
        </div>
        <div class="loading-panel" id="loading-panel"><span class="loader"></span><p>형태를 불러오는 중</p></div>
        <div class="gesture-tip" id="gesture-tip">${icon("rotate")}<span>손가락을 움직이는 방향으로 돌려보세요</span></div>
      </section>
      <section class="score-panel">
        <div class="score-copy"><span>SHADOW MATCH</span><strong id="score-label">0%</strong></div>
        <div class="score-track"><span id="score-fill"></span><i></i></div>
        <div class="play-actions">
          <button id="reset-level">처음 각도</button>
          <button id="hint-level" class="hint-button">빛의 힌트</button>
        </div>
      </section>
      <div class="clear-sheet" id="clear-sheet" aria-live="polite">
        <div class="clear-mark">${icon("check")}</div>
        <p class="eyebrow">SHADOW FOUND</p>
        <h2>${level.title} 발견!</h2>
        <p>빛과 형태가 정확히 겹쳤어요.</p>
        <button class="primary-button" id="next-level">다음 퍼즐 ${icon("arrow")}</button>
      </div>
    </main>`;

  import("./game/ShadowGame.js").then(({ ShadowGame }) => {
    if (routeState !== playState) return;
    const canvas = document.querySelector("#game-canvas");
    game = new ShadowGame(canvas, level, {
      shadowCanvas: document.querySelector("#current-shadow"),
      onReady: () => {
        routeState.loaded = true;
        document.querySelector("#loading-panel")?.classList.add("hidden");
      },
      onInteraction: () => document.querySelector("#gesture-tip")?.classList.add("hidden"),
      onScore: (score, cleared) => {
        routeState.match = Math.round(score * 100);
        const label = document.querySelector("#score-label");
        const fill = document.querySelector("#score-fill");
        const compare = document.querySelector("#shadow-compare");
        const matchState = document.querySelector("#match-state");
        if (label) label.textContent = scoreLabel(score);
        if (fill) fill.style.width = `${Math.max(4, score * 100)}%`;
        if (compare) {
          compare.style.setProperty("--match", score.toFixed(2));
          compare.classList.toggle("is-close", score >= 0.68);
          compare.classList.toggle("is-near", score >= 0.82);
        }
        if (matchState) {
          matchState.textContent = score >= 0.82 ? "거의 다 왔어요" : score >= 0.68 ? "형태가 보이기 시작해요" : "윤곽을 따라 맞춰보세요";
        }
        if (cleared && !clearShown) {
          clearShown = true;
          saveClear(level.id, score);
          document.querySelector("#clear-sheet")?.classList.add("visible");
        }
      },
      onError: (error) => {
        routeState.error = error.message;
        const panel = document.querySelector("#loading-panel");
        if (panel) panel.innerHTML = `<p>레벨을 불러오지 못했어요.<br /><small>${error.message}</small></p>`;
      },
    });

    document.querySelector("#reset-level")?.addEventListener("click", () => game?.reset());
    document.querySelector("#hint-level")?.addEventListener("click", () => game?.hint());
    document.querySelector("#next-level")?.addEventListener("click", () => {
      const categoryLevels = levelsByCategory(level.category);
      const next = categoryLevels[categoryLevels.findIndex((item) => item.id === level.id) + 1];
      navigate(next ? `#/play/${next.id}` : `#/category/${level.category}`);
    });
  }).catch((error) => {
    if (routeState !== playState) return;
    routeState.error = error.message;
    const panel = document.querySelector("#loading-panel");
    if (panel) panel.innerHTML = `<p>플레이어를 시작하지 못했어요.<br /><small>${error.message}</small></p>`;
  });
}

function attachCommonEvents() {
  document.querySelectorAll("[data-nav]").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.nav));
  });
  document.querySelector("#reset-progress")?.addEventListener("click", () => {
    resetProgress();
    renderHome();
    attachCommonEvents();
  });
}

function renderRoute() {
  game?.destroy();
  game = null;
  const route = parseRoute();
  if (route.mode === "category") renderCategory(route.categoryId);
  else if (route.mode === "play") renderPlay(route.levelId);
  else renderHome();
  attachCommonEvents();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", renderRoute);
window.render_game_to_text = () => JSON.stringify(game?.renderState() || routeState);
window.advanceTime = () => game?.renderer.render(game.scene, game.camera);
window.__SHADY_TEST__ = { solve: () => game?.solve(), resetProgress };

renderRoute();
