# 양산 공정

1. PNG 목표 실루엣 정규화
2. Signed Distance Field 계산
3. 카테고리와 seed로 3D implicit field 구성
4. Marching tetrahedra로 닫힌 삼각형 메시 추출
5. 투영을 보존하는 깊이 방향 연마
6. 방향광·점광·이중광 수식으로 실제 메시 투영
7. 목표 IoU와 연마 전후 유지율 계산
8. 플레이어 시점 인식도와 메시 토폴로지 검사
9. OBJ·PNG·JSON·CSV·연락판 일괄 출력
10. strict 모드에서 불합격 배치 차단

동일한 `seed`, 입력 이미지, 설정은 동일한 메시를 재현한다. 새 레벨은 `configs/production.yaml`의 `levels`에 한 항목을 추가하면 된다.

양산 해상도는 `resolution`으로 조절한다. 빠른 검증은 40, 기본 샘플은 56, 마스터 출력은 72–96을 권장한다. 해상도를 높이면 메모리와 OBJ 크기가 빠르게 증가한다.
