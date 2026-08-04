# 설정 파일 설명

## 최상위

- `schema`: 설정 규격 버전
- `output`: 출력 폴더
- `strict`: FAIL/ERROR 발생 시 종료 코드 2 반환
- `defaults`: 모든 레벨의 기본값
- `levels`: 레벨 배열

## 레벨

- `id`: 고유 레벨 이름
- `category`: A, B, C, D1, D2, D3, E, F
- `target`: 프로젝트 루트 기준 PNG 경로
- `seed`: 재현 가능한 변형 정수
- `resolution`: 선택적 해상도 재정의
- `polish_iterations`: 선택적 연마 횟수
- `gameplay`: 기본값 `rotate_only`
- `solution.rotation_euler_deg`: 게임 엔진에 전달할 정답 회전값

## 합격 기준

- `min_target_iou`: 목표 그림자 일치율 하한
- `min_shadow_retention`: 연마 전후 유지율 하한
- `max_player_target_iou`: 플레이어 시점이 정답과 너무 닮지 않도록 하는 상한
