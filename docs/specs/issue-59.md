# Issue 59 구현 스펙: [Frontend] 첫 질문 빠른 탭이 복구 상태에 덮이는 문제 수정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/59

## 목표

첫 질문이 보인 직후 선택해도 초기 로컬 초안 복구가 사용자 입력을 덮지 않고 다음 질문으로 진행한다.

## 범위

- [x] 공통 `PackPlay`의 초기 복구와 첫 선택 경쟁 상태를 제거한다.
- [x] 첫 선택을 초기 복구보다 우선하는 회귀 테스트를 추가한다.
- [x] 기존 네 팩의 저장 복구, 이전 질문, 완료, 재시작 흐름을 유지한다.

## 제외 범위

- [x] 질문 문구와 비주얼 변경
- [x] 저장 포맷 변경
- [x] 새 상태 관리 계층이나 의존성 추가

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- [x] 주인의 첫 답변이 유실되지 않아 1번에서 2번 질문으로 즉시 진행한다. 방문자와 새 주인 흐름은 변경하지 않는다.

## 디자인 영향

- [x] 없음. 현재 질문 카드와 선택 버튼 디자인을 유지한다.

## API와 데이터 영향

- [x] API와 스키마 변경 없음. 기존 팩별 localStorage 키와 v1 포맷을 유지한다.

## 구현 계획

- [x] `app/play/[slug]/play.tsx`에서 초기 복구가 이미 발생한 사용자 선택을 덮지 않도록 한다.
- [x] 선택 갱신을 최신 draft 기준의 함수형 갱신으로 바꾼다.
- [x] `tests/e2e/old-friend-play.spec.ts`에서 초기 복구 콜백을 지연하고 그 전에 첫 선택을 삽입해 경쟁 상태를 결정적으로 재현한다.

## 완료 기준

- [x] 초기 복구가 지연돼도 첫 선택 후 2번 질문이 유지된다.
- [x] 일반 선택과 저장된 초안 복구가 계속 동작한다.
- [x] 모바일 E2E와 전체 검증이 통과한다.

## 테스트 계획

- [x] 초기 복구 콜백을 테스트에서 지연한 뒤 첫 선택이 유지되는지 검증한다.
- [x] `pnpm exec playwright test tests/e2e/old-friend-play.spec.ts --project=mobile-chromium`
- [x] `./scripts/run-ai-verify --mode full`
- [x] localhost와 LAN에서 첫 선택 후 2번 질문 진입 확인

## 분석과 관측성

- [x] 없음. 신규 이벤트나 로그를 추가하지 않는다.

## 개인정보와 악용 방지

- [x] 없음. 로컬 답변 저장 범위와 공개 정책을 변경하지 않는다.

## 롤아웃과 복구

- [x] 플래그와 마이그레이션 불필요. 회귀 시 단일 플레이 컴포넌트 커밋을 되돌린다.

## 스펙 검토

Reviewer Agent: independent critic
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 없음.
