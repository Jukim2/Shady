# 프로젝트 구조

```text
shadow_puzzle_factory_complete/
├── README.md
├── package.json
├── web/                         # 모바일 웹 게임
│   ├── index.html
│   ├── vite.config.js
│   ├── src/
│   └── tests/
├── .github/workflows/          # CI 및 GitHub Pages 배포
├── 00_README_KO.md
├── 01_PROJECT_OVERVIEW.md
├── 02_GAMEPLAY_CATEGORIES.md
├── 03_SHAPE_GENERATION.md
├── 04_PRODUCTION_PIPELINE.md
├── 05_CONFIG_REFERENCE.md
├── 06_QA_CHECKLIST.md
├── 07_VALIDATION_REPORT.md
├── configs/
│   ├── smoke.yaml
│   └── production.yaml
├── assets/targets/
├── scripts/generate_sample_targets.py
├── src/shadow_factory.py
├── tests/test_smoke.py
├── output/
├── requirements.txt
├── LICENSE
└── Makefile
```

`output`에는 예제 OBJ와 검증 이미지가 포함된다. 직접 새로 생성할 수 있으므로 용량이 부담되면 삭제해도 된다.

`web`은 `output`의 검증된 레벨을 직접 번들링하는 세로형 모바일 테스트 클라이언트다. `npm run dev`로 개발 서버를 열고 `npm run check`로 단위 테스트와 프로덕션 빌드를 함께 검증한다.
