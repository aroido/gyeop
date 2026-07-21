# Issue 118 구현 스펙: [운영] CI data 2-lane 분리와 live 중복 reset 제거

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/118

## 목표

PR #117 이후 가장 긴 `ci-data` 검증을 서로 독립적인 두 러너로 분리하고, 이미 새로 시작한 Supabase에 반복하던 live E2E reset을 제거해 테스트 범위와 정확한 HEAD 병합 안전성은 유지하면서 GitHub Actions 경과 시간을 더 줄인다.

## 범위

- [ ] `ci-data`를 `ci-data-core`와 `ci-data-app` 모드로 분리한다.
- [ ] `ci-data-core`는 Supabase 시작, 필요 시 업그레이드 검증, DB reset, DB 테스트, DB lint, 생성 타입 일치 검증을 담당한다.
- [ ] `ci-data-app`은 별도 러너에서 Supabase 시작과 DB reset을 수행한 뒤 데이터 접근·팩 카탈로그·출판·주인 세션/프로필/동시성·공유·방문자·탈퇴 통합 테스트, 프로덕션 빌드, 팩 런타임 검증을 담당한다.
- [ ] `ci-live-mvp`와 `ci-live-owner`는 방금 시작한 Supabase를 그대로 사용하도록 reset 없는 내부 실행 스크립트를 호출한다.
- [ ] 개발자가 직접 실행하는 `test:e2e:mvp`, `test:e2e:owner`, `test:e2e:live`는 기존처럼 reset을 포함하는 독립 실행 계약을 유지한다.
- [ ] GitHub Actions base matrix를 `ci-static`, `ci-data-core`, `ci-data-app`, `ci-mock` 네 lane으로 구성한다.
- [ ] 변경 전·후 실제 GitHub Actions 실행 시간을 기록하고 flaky 재실행 없이 통과했는지 확인한다.

## 제외 범위

- [ ] 테스트 케이스 삭제, skip, assertion 완화, 테스트 대상 축소는 하지 않는다.
- [ ] GitHub Actions 러너 사양, 캐시 키, Supabase/Playwright 버전은 바꾸지 않는다.
- [ ] 제품 기능, 화면, API, DB schema·migration·seed는 바꾸지 않는다.
- [ ] 이미 충분히 짧은 static/mock/live lane의 추가 분할은 하지 않는다.
- [ ] 러너 사용량 증가를 감추기 위한 복잡한 공유 서비스나 캐시 계층은 도입하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- .codex/AGENTS.md
- .codex/skills/gyeop-task/references/review-gates.md
- scripts/ai-verify
- scripts/run-ai-verify
- scripts/task-harness.mjs
- scripts/verify-path-changes
- .github/workflows/ci.yml
- package.json
- playwright.config.ts

## 사용자 흐름 영향

- [x] 제품의 주인 → 방문자 → 새 주인 흐름에는 변화가 없다. 같은 DB·통합·live E2E 검증을 더 짧은 CI 경과 시간 안에 실행한다.

## 디자인 영향

- [x] 없음. 화면, 문구, 상호작용, 접근성을 변경하지 않는다.

## API와 데이터 영향

- [x] 없음. route, schema, model, migration, seed, storage, auth 계약은 그대로다. 각 병렬 data lane은 자기 러너의 독립된 로컬 Supabase를 사용한다.

## 구현 계획

- [ ] `scripts/ai-verify`의 기존 data 검증을 `run_data_core_verification`과 `run_data_app_verification`으로 나눈다. 기존 명령은 두 함수에 정확히 한 번씩 배치하고 실행 순서는 유지한다.
- [ ] `ci-data-core`는 core 함수만 실행한다. `ci-data-app`은 새 Supabase 시작과 reset 후 app 함수를 실행한다.
- [ ] `full` 모드는 static → data core → data app 순으로 같은 로컬 Supabase 상태를 이어서 사용해 기존 data 실행 의미를 유지한다.
- [ ] `package.json`에 reset 없는 `test:e2e:mvp:run`, `test:e2e:owner:run` 내부 스크립트를 추가하고, 공개 직접 실행 스크립트는 `supabase:reset` 뒤 내부 스크립트를 부르게 한다.
- [ ] `ci-live-mvp`와 `ci-live-owner`는 `start_supabase` 직후 reset 없는 내부 스크립트를 실행한다.
- [ ] `full` live 구간은 Supabase 재시작 후 MVP 내부 실행, reset을 포함한 owner 직접 실행 순서로 구성해 두 시나리오 사이의 격리를 유지한다.
- [ ] `.github/workflows/ci.yml` base matrix의 단일 `ci-data`를 두 data 모드로 나눈다. Chromium 설치 조건과 최종 `verify` 집계 계약은 유지한다.

## 완료 기준

- [ ] 기존 `ci-data`의 모든 검증 명령이 `ci-data-core`와 `ci-data-app` 전체에서 누락·중복 없이 실행된다. 단, 독립 러너 초기화를 위한 Supabase 시작/reset은 각 lane에 존재한다.
- [ ] `full` 모드는 기존 data 명령 순서와 테스트 범위를 유지하고, 깨끗한 동일 HEAD에서 성공하면 기존 `gyeop-full-verify/<SHA>` 마커를 생성한다. `scripts/task-harness.mjs`는 이 마커가 정확한 HEAD와 일치하는지 검증한다.
- [ ] 직접 실행하는 `pnpm test:e2e:mvp`, `pnpm test:e2e:owner`, `pnpm test:e2e:live`는 계속 reset을 포함한다.
- [ ] CI 전용 live 모드는 새 Supabase 시작 직후 reset 없는 내부 실행 스크립트를 사용한다.
- [ ] PR의 `ci-static`, `ci-data-core`, `ci-data-app`, `ci-mock`, `ci-live-mvp`, `ci-live-owner`, 최종 named `verify`가 동일한 정확한 HEAD에서 재실행 없이 모두 통과한다.
- [ ] 기준 실행 PR #117의 6분 38초보다 짧은 경과 시간을 목표로 하며, 달성 여부와 실제 lane 시간을 PR 및 이슈에 기록한다. 목표를 못 미쳐도 측정값과 원인을 숨기지 않는다.
- [ ] 테스트 삭제·skip·assertion 완화가 없다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] `bash -n scripts/ai-verify`
- [ ] 제거된 `ci-data` 모드가 사용법 오류로 종료하고 새 `ci-data-core`, `ci-data-app` 모드가 각각 통과하는지 확인한다.
- [ ] `ci-live-mvp`, `ci-live-owner`를 순차 실행해 reset 없는 내부 경로가 새 Supabase에서 통과하는지 확인한다.
- [ ] package script 구성을 확인해 직접 실행 wrapper에 reset이 남아 있고 CI 내부 script에는 reset이 없는지 확인한다.
- [ ] PR exact HEAD의 모든 GitHub Actions job과 최종 named `verify` 성공 및 재실행 횟수 0을 확인한다.

## 분석과 관측성

- [x] 제품 분석 이벤트에는 영향이 없다. GitHub Actions run/job 시작·종료 시각으로 전체 경과 시간과 lane별 시간을 기록한다.

## 개인정보와 악용 방지

- [x] 없음. 제품 데이터와 외부 사용자 데이터는 다루지 않으며 로컬 CI Supabase만 사용한다.

## 롤아웃과 복구

- [x] 애플리케이션 배포나 migration이 없는 CI 설정 변경이다. PR exact HEAD 전체 검증과 named `verify` 성공 후 병합한다. 회귀 시 이 PR의 workflow, verify script, package script 변경을 함께 revert하면 단일 `ci-data`와 기존 live reset 경로로 복구된다.

## 스펙 검토

Reviewer Agent: /root/spec_review_118
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 병렬화로 경과 시간은 줄지만 GitHub Actions 러너 총 사용 시간은 늘 수 있다. 전체 시간 단축을 우선하되 결과에 이 비용을 명시한다.
- [x] `ci-data-app`의 별도 Supabase 초기화가 약 20초를 추가하지만 기존 약 6분 data 직렬 병목을 두 lane으로 줄이는 이득이 더 클 것으로 예상한다. 실제 CI로 검증한다.
- [x] 구현 전 미결정 블로커는 없다.
