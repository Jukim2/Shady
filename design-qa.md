# Design QA — horizontal live-shadow stage

- Source visual truth: `/workspace/scratch/e15dfebf48f5/generated_images/exec-24f4d481-93c1-445d-a650-5d7a09c829f2.png`
- Source pixels: 1844 × 853
- Intended CSS viewport: 844 × 390 landscape; source aspect was treated as the visual target without stretching
- Implementation: local production build for the horizontal live-shadow revision
- Browser evidence: cloud-browser screenshot captured inline on 2026-08-06; the browser backend did not expose a workspace screenshot path
- Browser viewport: 1365 × 900
- State: production build passes; browser-level 3D inspection remains blocked because the verification browser disables WebGL

## Findings

- [P0] The revised Three.js stage cannot be rendered in the available verification browser.
  - Location: `#game-canvas`
  - Evidence: the page reports `Error creating WebGL context`; console reports `GL_VENDOR = Disabled`, `GL_RENDERER = Disabled`, and `Sandboxed = yes`.
  - Impact: the front-facing left projection wall, horizontal object/light axis, shared live-shadow/target projection, completion animation, material treatment, and visual spacing cannot be compared to the selected mock.
  - Fix: verify this commit in a browser/device with WebGL enabled and capture an 844 × 390 gameplay frame.

## Required fidelity surfaces

- Fonts and typography: the compact gameplay HUD and warm editorial home typography are present in source; visual fidelity is blocked by the missing gameplay render.
- Spacing and layout rhythm: the stage camera is now front-on and the wall, object, and lamp use one horizontal screen axis; full visual comparison is blocked.
- Colors and visual tokens: the home and game share the same warm dark paper-theater palette, but the canvas palette cannot be visually verified.
- Image quality and asset fidelity: the live wall shadow is the exact rendered mask used by scoring and the target is generated from the solved model mask, guaranteeing shared coordinates and a 100% solved overlap.
- Copy and content: the staged completion controls (`100% ALIGNED`, `확인`, then `다음 퍼즐`) are present.

## Interaction checks

- Route and production assets loaded.
- Back, reset, hint, fullscreen, drag rotation, live score, and the staged clear-state interaction remain blocked in the verification browser because game initialization stops at WebGL creation.
- Console checked: only the expected WebGL-disabled renderer failure and browser-extension metadata noise were observed.

## Comparison history

- Initial implementation: deployed commit `35d6f0f` and opened the exact Level 01 route with a cache-busting query.
- Current revision: static inspection and `npm run check` pass; the projection target is now derived from the solved model render instead of a separate approximate image.
- Source comparison: selected source was opened at full resolution.
- Post-fix comparison: unavailable because no browser-rendered 3D frame can be captured in this environment.

Focused region comparison was not possible because the implementation never rendered the core scene.

final result: blocked
