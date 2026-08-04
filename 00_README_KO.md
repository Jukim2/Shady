# Shadow Puzzle Factory — 전체 프로젝트

목표 실루엣 이미지로부터 Shadowmatic류의 추상 3D 퍼즐 오브젝트를 일괄 생성하는 자급형 Python 프로젝트다. Blender 없이 수학적 implicit field와 marching tetrahedra로 OBJ를 만들고, 실제 삼각형 투영으로 그림자를 검증한다.

## 빠른 시작

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
make smoke
make batch
```

직접 실행하려면 다음 명령을 사용한다.

```bash
python scripts/generate_sample_targets.py
python src/shadow_factory.py configs/production.yaml --zip
```

결과는 `output/`과 `output.zip`에 생성된다. 레벨별로 `model.obj`, 목표/결과 그림자, 플레이어 시점, `level.json`이 들어간다.

## 핵심 원칙

- 게임 카테고리와 형상 생성 방식은 분리한다.
- 분리 퍼즐은 조각 위치를 이동하지 않고 회전만 허용한다.
- E 가림 스택만 제한적인 앞뒤 깊이 및 조각 회전을 허용한다.
- 연마는 정답 투영을 보존해야 한다.
- 일반 형상은 한 연결체, E는 의도된 다중 조각을 허용한다.
- 실제 메시 그림자가 자동 기준을 통과하지 못하면 양산에서 제외한다.

문서 읽기 순서: `01_PROJECT_OVERVIEW.md` → `02_GAMEPLAY_CATEGORIES.md` → `03_SHAPE_GENERATION.md` → `04_PRODUCTION_PIPELINE.md`.
