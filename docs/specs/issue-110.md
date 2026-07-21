# Issue 110 구현 스펙: [QA] CI 2-worker 반복 flaky 제거

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/110

## 목표

PR #107의 일반 mock E2E 병렬화에서 반복된 첫 라우트 전환 flaky를 제거하면서, 변경 경로 기반 업그레이드 회귀 테스트 생략은 유지한다.

## 범위

- [ ] `playwright.config.ts`의 일반 mock E2E worker 수를 환경과 무관하게 1로 고정한다.
- [ ] 기존 테스트, assertion, live E2E 명령과 업그레이드 테스트 선택 로직은 변경하지 않는다.
- [ ] 전체 검증과 exact-head CI에서 같은 flaky 없이 통과하는지 확인한다.

## 제외 범위

- [ ] 테스트 timeout을 늘려 flaky를 숨기지 않는다.
- [ ] 테스트 파일을 삭제하거나 검증 범위를 축소하지 않는다.
- [ ] live Supabase E2E나 DB integration을 병렬화하지 않는다.
- [ ] workflow matrix, sharding, 새 dependency는 추가하지 않는다.

## 근거

- PR #107 run `29834623569`: 일반 E2E 2 workers, `home.spec.ts` URL 전환이 5초를 넘겨 1 flaky, 85 passed (1.6m).
- 병합 후 main run `29836122598`: 동일 테스트가 다시 1 flaky, 85 passed (1.9m).
- 변경 전 최근 성공 CI 5개에는 `flaky` 요약이 없었고 일반 E2E는 약 2.0m였다.
- 약 6~24초의 이득보다 반복 재시도와 신뢰도 저하가 크므로 issue 105 스펙의 복구 조건에 따라 worker만 복원한다.

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/specs/issue-105.md`
- `playwright.config.ts`
- `package.json`
- `scripts/ai-verify`
- `.codex/skills/gyeop-task/references/review-gates.md`
- `.codex/AGENTS.md`
- `AGENTS.md`

## 사용자 흐름 영향

- [ ] 제품 화면, copy, 접근성, owner→visitor→new-owner→profile-reshare 흐름에 변화가 없다.

## 디자인 영향

- [ ] UI, copy, viewport, 접근성 계약을 변경하지 않는다.

## API와 데이터 영향

- [ ] API, schema, model, migration, storage, auth에 변화가 없다.
- [ ] 실제 Supabase를 공유하는 live E2E의 `--workers=1` 계약은 그대로다.

## 구현 계획

- [ ] `playwright.config.ts`의 `workers: process.env.CI ? 2 : undefined`만 `workers: 1`로 바꿔 focused 실행, 로컬 full verify, GitHub CI가 모두 같은 직렬 계약을 사용하게 한다.
- [ ] issue 105에서 추가한 `GYEOP_VERIFY_BASE_REF`와 `scripts/verify-path-changes`는 유지한다.
- [ ] 새 helper나 설정 변수를 만들지 않는다.

## 완료 기준

- [ ] focused Playwright와 로컬 full verify 출력에 `using 1 worker`가 기록되고 테스트가 통과한다.
- [ ] `package.json`의 live E2E 명령에도 명시적 `--workers=1`이 유지된다.
- [ ] 전체 검증에서 업그레이드 경로가 바뀌지 않아 skip 문구가 출력된다.
- [ ] 전체 검증과 PR exact-head named `verify`가 flaky annotation 없이 통과한다.

## 테스트 계획

- [ ] `CI=1 GYEOP_E2E_PORT=3121 GYEOP_NEXT_DIST_DIR=.next/e2e-3121 pnpm exec playwright test tests/e2e/home.spec.ts --project=mobile-chromium`
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck`
- [ ] `python3 scripts/verify_project.py`
- [ ] `./scripts/task-harness pr 110`이 소유하는 `./scripts/run-ai-verify --mode full`
- [ ] `gh pr view <pr> --json headRefOid,statusCheckRollup`로 exact-head named `verify` 성공을 확인한다.
- [ ] `gh run view <run-id> --log | rg -n '\bflaky\b'`가 결과 없이 종료되는지 확인한다. 결과가 있으면 PASS로 판정하지 않는다.

## 분석과 관측성

- [ ] 제품 analytics와 개인정보 처리 변화는 없다.
- [ ] GitHub Actions 로그의 worker 수, passed 수, flaky 요약을 관측 근거로 사용한다.

## 개인정보와 악용 방지

- [ ] 개인정보 처리와 공개 범위에는 변화가 없다.
- [ ] 보안·권한·concurrency·live core-flow 검증은 계속 실행한다.

## 롤아웃과 복구

- [ ] 설정 한 줄 복원이라 feature flag나 migration은 없다.
- [ ] worker 1에서도 같은 flaky가 발생하면 병렬화 원인이 아니라 테스트/라우트 자체의 별도 결함으로 새 이슈를 등록한다.

## 스펙 검토

Reviewer Agent: spec_review_110
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 일반 E2E는 변경 전 수준인 약 2분으로 돌아가지만, 일반 PR은 업그레이드 회귀 테스트 조건부 생략으로 전체 CI 단축을 얻는다.
