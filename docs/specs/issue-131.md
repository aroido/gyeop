# Issue 131 구현 스펙: [운영] PR 핵심 live gate 정리와 data-app 2-lane 분리

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/131

## 목표

PR 검증에서는 핵심 제품 퍼널과 변경 영향이 큰 데이터 검증을 빠르게 막되, 보조 live 회귀를 nightly에 보존해 검증 범위를 줄이지 않고 CI 최장 경로를 단축한다.

## 범위

- [ ] `ci-live-mvp`는 `owner → visitor → new-owner → profile-reshare` 핵심 browser test 1개만 PR 필수 gate로 실행한다.
- [ ] 기존 live MVP 보조 회귀 4개는 삭제하지 않고 KST 새벽 예약 실행과 수동 실행이 가능한 별도 nightly workflow에서 실행한다.
- [ ] 기존 `ci-data-app`을 카탈로그·빌드·런타임과 owner/visitor 세션·동시성 검증의 두 CI mode로 분리해 별도 runner에서 병렬 실행한다.
- [ ] `full` mode는 기존 live MVP 5개와 data-app 전체 명령 및 기존 명령 순서를 그대로 실행한다.
- [ ] `.github/workflows/ci.yml`, 새 nightly workflow, `scripts/ai-verify`, `package.json`을 같은 검증 계약으로 동기화한다.

## 제외 범위

- [ ] 제품 화면, API, DB schema, migration, 질문팩 내용은 바꾸지 않는다.
- [ ] live test 또는 assertion을 삭제·축소하지 않는다.
- [ ] global analytics fixture를 test별로 격리하거나 기존 live spec을 병렬 worker용으로 대규모 리팩터링하지 않는다.
- [ ] `ci-data-core`, `ci-static`, `ci-mock`, `ci-live-owner`의 검증 범위는 바꾸지 않는다.
- [ ] named `verify`, exact-head full verify, branch protection을 우회하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- `.codex/AGENTS.md`: 핵심 loop와 issue execution 규칙
- `docs/product/core-feature-priority.md` §2: owner → visitor → new-owner 핵심 loop
- `docs/engineering/github-task-workflow.md`: exact clean HEAD full verify와 named `verify` merge gate
- `.github/workflows/ci.yml`: PR/push CI lane 구성
- `scripts/ai-verify`: local full 및 CI mode 실행 계약
- `scripts/wait-for-supabase-data-api.mjs`: reset 직후 PostgREST schema cache readiness 계약
- `scripts/task-harness.mjs`: exact full-verify marker와 named `verify` check를 소비하는 merge gate
- `package.json`: Playwright live MVP 실행 명령
- `tests/e2e/core-mvp-live.spec.ts`: 핵심 퍼널과 보조 live 회귀의 test inventory
- AGENTS.md

## 사용자 흐름 영향

- [ ] 제품 동작은 변하지 않는다. PR 필수 live gate는 owner 10장 완료·Google owner claim·공개 공유·방문자 3장 제출·비교·동일 팩 새 주인 전환·프로필 재공유·후속 방문자 제출과 funnel delta를 계속 한 번에 증명한다.
- [ ] 새 팩 browser path, 방문자 철회, 1:1 privacy, 철회 rate limit은 nightly 보조 회귀에서 계속 검증한다.

## 디자인 영향

- [ ] 없음. workflow와 검증 script만 변경한다.

## API와 데이터 영향

- [ ] 없음. 각 CI data lane은 독립 runner이므로 자체 local Supabase start/reset 후 실행하지만 application schema와 seed는 변경하지 않는다.

## 구현 계획

- [ ] `tests/e2e/core-mvp-live.spec.ts`의 첫 핵심 퍼널 test 제목에 `@pr-core` tag를 부여한다.
- [ ] `package.json`에 `test:e2e:mvp:pr:run`과 `test:e2e:mvp:nightly:run`을 추가한다. PR 명령은 `@pr-core`만, nightly 명령은 `@pr-core`를 제외한 모든 test를 선택해 새 보조 test가 누락되지 않게 한다. 기존 `test:e2e:mvp:run`은 전체 5개 실행으로 유지한다.
- [ ] `scripts/ai-verify`에 nightly live mode와 data-app 두 mode를 추가한다. `ci-data-app-catalog`은 `data-access`, `pack-catalog`, `pack-publication-concurrency`, Next build, `pack-runtime`을 소유한다. `ci-data-app-sessions`는 `owner-play-session`, `owner-profile-session`, `owner-play-concurrency`, `share-link-concurrency`, `visitor-response-concurrency`, `visitor-withdrawal-concurrency`를 소유한다.
- [ ] data 검증은 카탈로그 integration, 세션 integration, build/runtime의 작은 함수로 나눈다. CI 두 mode는 각자 Supabase start/reset을 수행하지만 `full`은 두 mode를 호출하지 않고 현재 순서인 카탈로그 integration 3개 → 세션 integration 6개 → Next build → pack runtime을 같은 Supabase lifecycle 안에서 실행해 추가 reset/start 경계를 만들지 않는다.
- [ ] 두 data-app CI mode의 reset 뒤 실제 service-role RPC가 성공할 때까지만 기다리는 Data API readiness probe를 공통으로 실행한다. local status health와 RPC 404/503만 합계 최대 10초 재시도하고 다른 HTTP 응답이나 제한 초과는 즉시 실패해 고정 sleep과 schema 오류 은폐를 피한다. API를 사용하지 않는 `ci-data-core`와 충분한 선행 검증이 있는 `full`에는 새 대기를 추가하지 않는다.
- [ ] `.github/workflows/ci.yml`의 base matrix에서 단일 `ci-data-app`을 제거하고 두 mode를 넣으며 `ci-live-mvp`가 PR 전용 명령을 실행하도록 한다. named `verify`의 `needs` 계약은 유지한다.
- [ ] `.github/workflows/nightly.yml`을 추가해 `workflow_dispatch`와 `0 17 * * *`(매일 02:00 KST)에서 nightly live mode를 실행한다. Chromium과 dependencies는 기존 live job과 동일하게 준비한다.
- [ ] `package.json`의 format/format:check에 새 workflow를 포함하고, shell syntax·Playwright test listing·두 data mode의 명령 inventory를 focused check로 검증한다.

## 완료 기준

- [ ] `test:e2e:mvp:pr:run -- --list`가 핵심 퍼널 1개만 찾고 `test:e2e:mvp:nightly:run -- --list`가 나머지 4개만 찾는다.
- [ ] 새 두 data CI mode의 합집합이 기존 integration 9개, Next build, pack runtime test를 중복이나 누락 없이 포함한다.
- [ ] `full` mode가 data-app의 기존 전체 명령 순서와 live MVP 전체 명령을 유지한다.
- [ ] PR CI에서 새 base 2개와 핵심 live MVP를 포함한 모든 lane 및 named `verify`가 exact PR head에서 통과한다.
- [ ] CI matrix에 새 data mode 두 개가 모두 포함되고, 그중 하나라도 실패·취소돼 aggregate `base`가 success가 아니면 named `verify`의 exact shell condition이 nonzero로 실패한다.
- [ ] nightly workflow는 예약 및 수동 진입점을 갖고 PR workflow의 필수 `verify` dependency에는 포함되지 않는다.
- [ ] 변경 전 성공 기준 run `29880259094`의 5분 16초 wall-clock·runner 합계 26분 20초와 변경 후 exact-head run을 비교해 wall-clock과 runner-minute 증감을 함께 기록한다.
- [ ] exact-head PR run의 최종 `verify` wall-clock이 기준선보다 최소 15초 빠른 5분 1초 이하이면 통과한다. 외부 image/package download 지연으로 첫 run이 미달하면 한 번 rerun해 lane별 명령 구간을 함께 기록한다. 두 run 모두 5분 1초를 넘고 새 핵심 경로의 명령 구간도 기준 run보다 줄지 않으면 병합하지 않고 이 PR의 data/live topology 변경을 되돌린다.

## 테스트 계획

- [ ] `bash -n scripts/ai-verify`
- [ ] `node --check scripts/wait-for-supabase-data-api.mjs`
- [ ] `pnpm format:check`
- [ ] `pnpm test:e2e:mvp:pr:run --list`
- [ ] `pnpm test:e2e:mvp:nightly:run --list`
- [ ] `pnpm test:e2e:mvp:run --list`
- [ ] `./scripts/run-ai-verify --mode ci-data-app-catalog`
- [ ] `./scripts/run-ai-verify --mode ci-data-app-sessions`
- [ ] `.github/workflows/ci.yml`에서 base matrix가 새 data mode 두 개를 모두 포함하고 final `verify`가 `needs: [base, live]`를 유지하는지 확인한다.
- [ ] final verify의 exact shell condition을 `BASE_RESULT=success LIVE_RESULT=success`로 실행하면 성공하고, `BASE_RESULT=failure` 및 `BASE_RESULT=cancelled` 각각에서는 nonzero로 실패하는지 확인한다.
- [ ] `scripts/task-harness pr 131`이 exact clean HEAD에서 소유하는 `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- [ ] 제품 analytics schema와 event는 바꾸지 않는다. 핵심 PR test의 11개 funnel delta assertion을 그대로 유지한다.
- [ ] GitHub Actions job 시작/종료 시각으로 PR wall-clock을, 각 job duration 합으로 runner 사용량을 비교한다.

## 개인정보와 악용 방지

- [ ] 제품 개인정보 처리 변화는 없다. visitor 철회·1:1 privacy·capability rate limit live 검증은 삭제하지 않고 nightly에서 계속 실행한다.
- [ ] 핵심 공개 공유/방문자 전환/privacy boundary는 PR의 핵심 funnel과 기존 unit/integration/mock/owner live lane에서도 계속 검증한다.

## 롤아웃과 복구

- [ ] migration이나 runtime rollout은 없다. 문제 발생 시 CI matrix와 `ci-live-mvp` 명령을 각각 기존 단일 `ci-data-app`과 전체 `test:e2e:mvp:run` 상태로 되돌리고 nightly workflow를 제거하면 기존 검증 토폴로지로 복구된다.
- [ ] nightly 실패는 PR merge를 자동 차단하지 않으므로 실패 run을 별도 운영 신호로 확인하고 실제 회귀는 즉시 후속 수정한다.

## 스펙 검토

Reviewer Agent: issue131_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 스펙 독립 검토 통과 전 구현하지 않는다.
- [ ] GitHub hosted runner의 Supabase start 비용이 두 data lane에서 중복돼 runner-minute는 늘 수 있다. 이 작업의 성공 기준은 PR wall-clock 감소이며 runner 증감도 숨기지 않고 함께 보고한다.
- [ ] GitHub Actions schedule은 UTC 기준이며 `0 17 * * *`는 KST 02:00에 해당한다.
