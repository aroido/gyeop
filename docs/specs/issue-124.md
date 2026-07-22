# Issue 124 구현 스펙: [콘텐츠] 공식 질문팩 21종 문구 v2 개선과 불변 발행 전환

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/124

## 목표

발행된 v1과 기존 play의 답 의미를 바꾸지 않으면서, 문구 문제가 확인된 공식 질문팩 21종의 새 play를 검수된 v2 문구로 전환한다.

## 범위

- [x] `coworker`, `deadline-mode`, `laugh-track`을 제외한 공식 팩 21종에 v2 manifest를 추가한다.
- [x] slug별 가장 높은 manifest 버전을 현재 catalog로 선택하고 owner·visitor hardcoded registry를 같은 버전으로 맞춘다.
- [x] 신규 설치 seed에는 v1 24종과 v2 21종의 전체 발행 이력을 보존하고, 기존 설치용 additive migration에 v2 version·카드·발행 포인터를 반영한다.
- [x] 문구 품질, v1 보존, 최신 버전 선택, seed 결정성, DB 업그레이드, owner·visitor·프로필 경로의 회귀 테스트를 갱신한다.
- [x] v2 전환 결정과 검수 규칙을 활성 제품 SSOT에 기록한다.

## 제외 범위

- [x] 공식 팩 24종 또는 카드 240장 수량, A/B 형식, Signature 수, 민감도, 공유 기본값을 바꾸지 않는다.
- [x] 발행된 v1 manifest·DB 카드·기존 play를 수정하거나 삭제하지 않는다.
- [x] 새 UI, API route, schema, analytics event, feature flag를 추가하지 않는다.
- [x] 지적이 없던 `coworker-v1`, `deadline-mode-v1`, `laugh-track-v1`을 불필요하게 버전업하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- content/packs/*-vN.json
- AGENTS.md

## 사용자 흐름 영향

- [x] 새 주인이 개선 대상 slug를 고르면 catalog와 DB current pointer가 같은 v2 10장을 제공한다.
- [x] 기존 v1 play의 주인·방문자는 저장된 `pack_version_id`로 기존 질문과 비교 의미를 그대로 복원한다.
- [x] 방문자와 `나도 이 팩으로 시작하기`로 전환한 새 주인은 해당 slug의 현재 v2 문구를 사용하며, 필수 3장 배정과 결과 CTA 우선순위는 바뀌지 않는다.

## 디자인 영향

- [x] 없음. 팩 제목, cover tone/recipe, 개봉 애니메이션, 레이아웃과 접근성 동작은 유지한다.

## API와 데이터 영향

- [x] API·schema·auth 계약 변경은 없다.
- [x] `20260721000100_pack_content_v2.sql`은 21개 v2 `pack_versions`와 210개 v2 `pack_cards`를 새 UUID로 추가한다. 같은 결정적 renderer가 current 24종을 모두 출력하므로 유지 대상 v1 3종도 conflict guard 아래 재선언하지만 기존 row에서는 no-op이다.
- [x] migration은 기존 함수가 있는 설치에서만 template compatibility insert를 허용하고, 이미 발행된 version/card와 기존 play FK는 보존한다.
- [x] `supabase/seed.sql`은 fresh install에서 v1 24종·v2 21종, 총 45개 version과 450개 card의 발행 이력 및 현재 pointer 24개를 결정적으로 재현한다.

## 구현 계획

- [x] `content/packs/*-v2.json`에 21종의 개선 문구를 두고 v1 파일은 byte-level 변경 없이 유지한다.
- [x] `lib/packs/catalog.ts`, `lib/packs/official-pack-registry.mjs`, `lib/visitor-response/visitor-context-core.mjs`를 현재 버전 기준으로 맞춘다.
- [x] `scripts/render-pack-seed.mjs`가 모든 vN manifest를 seed history로 읽되 slug별 최신 버전만 catalog/current pointer로 선택하게 하고, `scripts/verify-pack-catalog.mjs`에 문구·중복·registry·seed 검증을 둔다.
- [x] manifest에서 `supabase/seed.sql`과 additive migration을 생성하고 DB·unit·integration·mobile E2E fixture의 기대 버전을 갱신한다.
- [x] focused 검증 후 exact clean HEAD를 커밋하고 `scripts/task-harness pr 124`로 전체 검증·PR을 만든다.

## 완료 기준

- [x] 활성 catalog는 정확히 24팩이며 각 팩은 10장·Signature 1장이고 slug별 최신 version을 선택한다.
- [x] 개선 대상 21종은 v2, 제외한 3종은 v1이고 모든 기존 v1 manifest가 남는다.
- [x] visitor prompt에 1인칭 표현이 없고 `이 사람`은 한 번 이하이며, 활성 팩 전체에서 같은 owner prompt가 중복되지 않는다.
- [x] option A/B가 동일하지 않고 기존 민감도와 `defaultShareKind` 계약이 유지된다.
- [x] fresh seed는 45 version·450 card 전체 이력을 만들고, v1 DB 업그레이드는 v2 current pointer를 만들며, 기존 v1 play는 원래 카드로 복원된다.
- [x] catalog·owner play·visitor response·profile·share·private comparison 경로가 모두 현재 24팩 계약으로 통과한다.

## 테스트 계획

- [x] `node scripts/verify-pack-catalog.mjs`
- [ ] `pnpm exec prettier --check`와 변경 JS/TS 대상 `pnpm exec eslint`
- [ ] `pnpm test`
- [ ] `pnpm test:pack-catalog`, `pnpm test:owner-play`, `pnpm test:owner-profile`, `pnpm test:visitor-response`
- [ ] `tests/integration/eligibility-cutover-upgrade.test.sh`
- [ ] `./scripts/run-ai-verify --mode full` — `scripts/task-harness pr 124`가 exact clean HEAD에서 소유한다.

## 분석과 관측성

- [x] 없음. 기존 event 이름·payload·집계 기준은 유지하고 `pack_version_id`로 이미 구분되는 버전만 추가한다.

## 개인정보와 악용 방지

- [x] 개인정보 필드나 공개 범위는 추가하지 않는다. 질문은 전체 연령용이며 제3자의 민감정보, 성적·성인 주제, 위험 행동 조장을 포함하지 않는다.
- [x] high/medium sensitivity의 `one_to_one` 기본값과 low sensitivity의 `public` 기본값을 verifier로 고정한다.
- [x] 발행된 v1 불변성과 기존 play FK 보존으로 과거 응답의 의미가 새 문구에 잘못 연결되지 않게 한다.

## 롤아웃과 복구

- [x] 별도 flag 없이 additive migration으로 배포한다. migration은 version/card insert와 current pointer 전환만 수행하며 재실행 가능한 conflict guard를 둔다.
- [x] 운영 복구가 필요하면 v1 데이터를 수정·삭제하지 않고 후속 migration에서 affected template의 `published_version_id`를 검증된 v1로 되돌린다.
- [x] 배포 전 fresh seed, 이전 migration 시점 업그레이드, exact-head CI `verify`를 모두 통과하지 않으면 merge하지 않는다.

## 스펙 검토

Reviewer Agent: issue124_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 제품 미결정 사항 없음. v2 대상 21종과 v1 유지 3종, migration 복구 방식은 이슈와 decision log에 확정했다.
- [x] 주요 리스크는 generated seed/migration/registry drift와 기존 v1 의미 훼손이며 결정성 검사, frozen v1 보존 검사, upgrade 회귀 테스트로 차단한다.
