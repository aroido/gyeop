# Issue 114 구현 스펙: [운영] GitHub CI base 검증 3-lane 병렬화

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/114

## 목표

현재 직렬 실행되는 GitHub Actions `base` 검증을 독립적인 세 lane으로 병렬화해, 테스트를 삭제하지 않고 PR의 최종 `verify` 완료 대기시간을 줄인다.

## 범위

- [x] `.github/workflows/ci.yml`의 `base` job을 `ci-static`, `ci-data`, `ci-mock` matrix로 실행한다.
- [x] `scripts/ai-verify`에 세 CI 전용 모드를 추가하고 기존 검증 명령을 빠짐없이 한 lane에 배정한다.
- [x] Playwright Chromium 설치는 브라우저를 사용하는 `ci-mock` lane에서만 수행한다.
- [x] 기존 live matrix, 최종 이름이 `verify`인 집계 job, 로컬 `full` 검증과 정확한 HEAD 캐시는 유지한다.
- [x] 변경 전후 GitHub Actions 실행시간과 각 lane 결과를 PR 본문과 이슈 완료 코멘트에 기록한다.

## 제외 범위

- [x] 테스트, assertion, 보안 검사, DB 검사 또는 브라우저 프로젝트를 삭제하거나 축소하지 않는다.
- [x] live MVP/owner E2E를 더 분할하거나 테스트 구현 자체를 최적화하지 않는다.
- [x] 새 캐시 서비스, GitHub Action, 의존성 또는 self-hosted runner를 도입하지 않는다.
- [x] 제품 UI, API, 데이터베이스 스키마와 배포 구성을 변경하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md`: 제품 핵심 흐름을 변경하지 않는 운영 범위 확인
- `.codex/AGENTS.md`: GYEOP 저장소 작업 규칙과 task skill 진입점
- `.codex/skills/gyeop-task/references/review-gates.md`: exact-head full verify와 이름이 `verify`인 CI 게이트
- `scripts/ai-verify`: 로컬 및 CI 검증 명령의 실행 순서와 성공 마커
- `.github/workflows/ci.yml`: GitHub Actions job 구성과 최종 집계 계약
- `package.json`: mock/live Playwright 실행 스크립트 계약
- `playwright.config.ts`: mock E2E의 자체 Next dev webServer, 포트, dist 디렉터리 계약
- `scripts/verify-path-changes`: task-harness와 upgrade 회귀 검사의 fail-open 경로 비교 계약

## 사용자 흐름 영향

- [x] 없음. 주인→방문자→새 주인 제품 흐름과 런타임 동작은 변경하지 않고, 같은 검증을 독립 runner에서 더 빨리 완료한다.

## 디자인 영향

- [x] 없음. 화면, 문구, 접근성, 반응형 UI를 변경하지 않는다.

## API와 데이터 영향

- [x] 없음. route, schema, migration, seed, storage와 인증 동작을 변경하지 않는다.

## 구현 계획

- [x] `scripts/ai-verify`의 기존 직렬 검증을 `run_static_verification`, `run_data_verification`, `run_mock_verification` 경계로 묶는다.
- [x] `full`은 세 경계와 기존 live 검증을 현재 순서로 모두 실행하고, `ci-static`, `ci-data`, `ci-mock`은 자신의 경계만 실행한다.
- [x] task-harness 변경 감지는 `ci-static`, migration-path 변경 감지는 `ci-data`에서 기존 fail-open 비교 규칙과 함께 유지한다.
- [x] `ci-data`는 `start_supabase`부터 upgrade, reset, DB 검사, 데이터 통합 검사, `pnpm build`, `pack-runtime`까지 소유한다.
- [x] `ci-mock`은 `GYEOP_E2E_PORT=3110 pnpm test:e2e --project=mobile-chromium`만 실행한다. `playwright.config.ts`가 별도 `.next/e2e-3110` Next dev webServer를 시작하므로 Supabase start/reset이나 선행 build를 요구하지 않는다.
- [x] `.github/workflows/ci.yml`의 `base`를 세 mode matrix로 바꾸고, Chromium 설치를 `ci-mock`에만 조건부 실행한다.
- [x] checkout, pnpm/node setup, dependency install은 각 독립 runner에서 중복되는 준비 비용으로 허용하되 검증 명령 자체는 lane 간 중복하지 않는다.
- [x] 최종 `verify` job은 aggregate `base`와 `live`가 모두 `success`일 때만 통과하도록 유지한다.

## 완료 기준

- [x] `ci-static`, `ci-data`, `ci-mock`가 기존 `ci-base`의 모든 명령을 중복·누락 없이 한 번씩 포함한다.
- [x] 세 base matrix lane 중 하나라도 실패하거나 취소되면 최종 `verify`가 실패한다.
- [x] CI 전용 mode는 full verification marker를 생성하지 않고, `full`만 깨끗한 exact HEAD에 marker를 생성한다.
- [x] `./scripts/run-ai-verify --mode full`이 exact clean HEAD에서 통과한다.
- [x] PR HEAD의 이름이 `verify`인 GitHub check가 통과하고 로그에 `flaky` 결과가 없다.
- [x] 기준 main run `29848258309`의 최종 `verify` 완료 13분 2초(base job 12분 41초)와 비교해 PR CI의 최종 `verify` wall-clock이 30% 이상 감소하거나 9분 미만이다. lane별 duration과 전후 비교는 PR 본문 및 이슈 완료 코멘트에 남긴다. 목표 미달 시 실제 측정치와 새 병목을 같은 위치에 보고한다.

## 테스트 계획

- [x] `bash -n scripts/ai-verify`
- [x] 지원하지 않는 mode가 exit 2로 실패하는지 확인한다.
- [x] `./scripts/run-ai-verify --mode ci-static`
- [x] `./scripts/run-ai-verify --mode ci-data`
- [x] `./scripts/run-ai-verify --mode ci-mock`
- [x] `./scripts/task-harness pr 114`가 소유하는 exact clean HEAD `./scripts/run-ai-verify --mode full`
- [x] PR의 각 base/live lane 및 최종 `verify` 결과·실행시간·`flaky` 로그 확인

## 분석과 관측성

- [x] 제품 분석 이벤트 영향은 없다. GitHub Actions job별 duration과 전체 workflow duration을 변경 전후 관측값으로 사용한다.

## 개인정보와 악용 방지

- [x] 없음. 사용자 데이터와 공개 링크 동작을 변경하지 않는다. 보안·비밀 검사도 기존 static lane에서 계속 실행한다.

## 롤아웃과 복구

- [x] PR CI에서 세 lane과 최종 집계를 먼저 검증한 뒤 일반 merge 절차로 반영한다.
- [x] migration이나 feature flag는 없다. 회귀 시 이 PR의 workflow/mode 분할을 되돌리면 이전 단일 `ci-base` 실행으로 복구된다.

## 스펙 검토

Reviewer Agent: spec_review_114
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 구현 전 블로커는 없다.
- [x] 독립 runner마다 checkout/install 비용이 반복되어 총 runner-minute는 증가할 수 있다. 이 비용을 명시하고 wall-clock 단축 결과로 판단한다.
- [x] matrix job의 aggregate result가 기존 live matrix와 동일하게 최종 `verify`에 전달되는 GitHub Actions 계약을 재사용한다.
