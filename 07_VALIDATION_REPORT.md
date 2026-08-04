# 최종 검증 보고서

재구축 프로젝트의 `configs/production.yaml`을 실제 실행해 8종을 검증했다.

| 레벨 | 문법 | 결과 | 목표 IoU | 연마 유지율 | 연결체 |
|---|---:|---:|---:|---:|---:|
| A_cat_blocks | A | PASS | 0.9614 | 1.0000 | 1 |
| B_bird_organic | B | PASS | 0.9547 | 1.0000 | 1 |
| C_elephant_ribbon | C | PASS | 0.9638 | 1.0000 | 1 |
| D1_fish_disc_rod | D1 | PASS | 0.9588 | 1.0000 | 1 |
| D2_horse_tubular | D2 | PASS | 0.9450 | 1.0000 | 1 |
| D3_cat_ribs | D3 | PASS | 0.9615 | 1.0000 | 1 |
| E_teapot_stack | E | PASS | 0.9659 | 1.0000 | 3 |
| F_elephant_dual | F | PASS | 0.9671 | 1.0000 | 1 |

합계는 PASS 8, WARN 0, FAIL 0, ERROR 0이다. 모든 결과의 열린 모서리, 비다양체 모서리, 퇴화 삼각형은 0이다. 상세 원본 수치는 `output/batch_manifest.json`과 `output/metrics.csv`에 있다.
