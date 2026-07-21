# Issue 112 구현 스펙: [운영] GitHub CI live E2E 분리 병렬화

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/112

## 목표

로컬 전체 검증 계약과 테스트 범위는 유지하면서, GitHub CI에서 base 검증과 상태가 격리된 두 live E2E를 별도 runner로 병렬 실행해 exact-head 피드백 시간을 줄인다.

## 범위

- [ ] `scripts/ai-verify`에 `full`, `ci-base`, `ci-live-mvp`, `ci-live-owner` 실행 모드를 둔다.
- [ ] 로컬 `full`은 기존 static/unit/DB/build/live/mock E2E 전체를 같은 순서와 범위로 실행하고 full-verify SHA marker를 기록한다.
- [ ] `ci-base`는 live E2E만 제외하고 static/unit/DB/build/mock E2E를 실행한다.
- [ ] 두 `ci-live-*` 모드는 각자 독립 Supabase를 시작하고 core MVP 또는 owner live E2E 하나만 1 worker로 실행한다.
- [ ] GitHub Actions는 base job과 두 live matrix job을 병렬로 실행하고, 최종 named `verify` job이 모두 성공했을 때만 성공한다.

## 제외 범위

- [ ] 테스트 파일, assertion, DB 검증, security 검증을 삭제하지 않는다.
- [ ] 동일 Supabase를 공유하는 한 runner 안에서 live E2E를 병렬화하지 않는다.
- [ ] 일반 mock E2E worker를 다시 늘리거나 sharding하지 않는다.
- [ ] branch protection, exact-head named `verify`, 로컬 full completion gate를 완화하지 않는다.
- [ ] 새 action, dependency, cache 계층을 추가하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/specs/issue-105.md`
- `docs/specs/issue-110.md`
- `.github/workflows/ci.yml`
- `scripts/run-ai-verify`
- `scripts/ai-verify`
- `package.json`
- `playwright.config.ts`
- `.codex/skills/gyeop-task/references/review-gates.md`
- `.codex/AGENTS.md`
- `AGENTS.md`

## 사용자 흐름 영향

- [ ] 제품 동작은 바뀌지 않는다.
- [ ] owner→visitor→new-owner→profile-reshare core live 흐름과 owner account/capability live 흐름을 모두 계속 검증한다.

## 디자인 영향

- [ ] UI, copy, viewport, 접근성 계약을 변경하지 않는다.

## API와 데이터 영향

- [ ] API, schema, migration, seed, storage, auth 구현에는 변화가 없다.
- [ ] 각 live matrix job은 별도 GitHub runner와 별도 로컬 Supabase 컨테이너를 사용하므로 서로 상태를 공유하지 않는다.
- [ ] 각 live suite 내부는 기존 명시적 `--workers=1`을 유지한다.

## 구현 계획

- [ ] `scripts/ai-verify`의 mode parser는 네 값만 허용하고 그 외 값은 exit 2로 거부한다.
- [ ] 공통 dependency·Docker·생성 설정 snapshot/restore·Supabase cleanup 계약은 모든 mode가 재사용한다.
- [ ] 기존 검증 본문을 base phase로 묶되 `full`과 `ci-base`에서만 실행한다.
- [ ] base phase는 현재 `verify_project`부터 static/unit/security/HTTP boundary, diff-gated harness/upgrade, DB/schema/integration, build, `pack-runtime`, 일반 mock E2E까지 모두 보존한다. `ci-base`에서는 이 전체 base phase 뒤 종료한다.
- [ ] `full`은 base phase 뒤 기존처럼 core MVP live, owner live, 일반 mock E2E를 모두 직렬 실행한다.
- [ ] `ci-live-mvp`와 `ci-live-owner`는 Supabase start 뒤 각 전용 package script만 실행한다.
- [ ] `package.json`에 owner live 전용 script를 추가하고 기존 `test:e2e:live`는 core와 owner 전용 script를 순서대로 조합한다.
- [ ] full-verify SHA marker와 `GYEOP full verification passed.` 문구는 `full` 성공 때만 기록한다. CI 전용 mode는 full marker를 만들지 않는다.
- [ ] workflow의 `base`와 `live` matrix는 checkout, pnpm/node setup, install, Chromium install을 각각 수행한다.
- [ ] workflow의 `base` job은 `GYEOP_VERIFY_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}`를 `ci-base`에 전달해 PR과 main push의 diff-gated 검증 의미를 유지한다.
- [ ] `live` matrix는 `ci-live-mvp`, `ci-live-owner` 두 mode를 서로 다른 runner에서 실행한다.
- [ ] 최종 `verify` job은 `if: always()`, `needs: [base, live]`로 실행한다. `BASE_RESULT=${{ needs.base.result }}`, `LIVE_RESULT=${{ needs.live.result }}`를 env로 받고 `test "$BASE_RESULT" = success`와 `test "$LIVE_RESULT" = success`를 모두 통과해야 성공한다.

## 완료 기준

- [ ] 로컬 `./scripts/run-ai-verify --mode full`이 기존 전체 테스트를 모두 실행하고 marker를 기록한다.
- [ ] PR CI 로그에서 base의 mock E2E, live-mvp 5개, live-owner 4개가 모두 실행된다.
- [ ] PR과 main push의 base job이 현재와 동일한 비교 SHA 환경값을 전달한다.
- [ ] 각 live lane 출력은 `using 1 worker`다.
- [ ] final named `verify`는 base와 live matrix가 모두 성공한 exact HEAD에서만 성공한다.
- [ ] PR CI에 flaky annotation이 없다.
- [ ] PR CI wall-clock이 PR #111의 14분 6초보다 최소 2분 줄어든다. 외부 다운로드 지연으로 미달하면 lane별 실제 시간을 기록하고 병렬 구조의 임계 경로를 판정한다.

## 테스트 계획

- [ ] `bash -n scripts/ai-verify scripts/run-ai-verify`
- [ ] `./scripts/run-ai-verify --mode invalid`가 exit 2인지 확인한다.
- [ ] final verify의 exact shell 조건을 `BASE_RESULT=success`, `LIVE_RESULT=success`로 실행하면 성공한다.
- [ ] 같은 조건을 `BASE_RESULT=failure`와 `LIVE_RESULT=cancelled` 각각으로 실행하면 nonzero인지 확인한다.
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck`
- [ ] `python3 scripts/verify_project.py`
- [ ] `./scripts/task-harness pr 112`가 exact clean HEAD에서 소유하는 `./scripts/run-ai-verify --mode full`
- [ ] `gh pr view <pr> --json headRefOid,statusCheckRollup`로 final named `verify`와 모든 lane 성공을 확인한다.
- [ ] `gh run view <run-id> --json jobs`로 lane 시작·종료와 병렬 overlap을 확인한다.
- [ ] 각 base/live job 로그에서 실행 mode별 완료 문구와 base mock E2E, live-mvp 5개, live-owner 4개 결과를 확인해 세 `ci-*` mode의 직접 실행을 증명한다.
- [ ] `gh run view <run-id> --log | rg -n '\bflaky\b'`가 결과 없이 종료되는지 확인한다.

## 분석과 관측성

- [ ] 제품 analytics 변화는 없다.
- [ ] PR #111 run `29838902403`의 14분 6초를 기준선으로 사용한다.
- [ ] base, live-mvp, live-owner job의 startedAt/completedAt과 final verify 완료 시각을 QA 근거로 기록한다.

## 개인정보와 악용 방지

- [ ] 익명 응답, capability, OAuth, 공개 링크, 민감 결과 처리에는 변화가 없다.
- [ ] 보안·권한·동시성·core-flow 검증 범위는 유지된다.

## 롤아웃과 복구

- [ ] PR exact-head에서 새 workflow 자체를 실제 실행해 검증한다.
- [ ] final `verify`가 matrix 실패나 취소를 성공으로 오판하면 병합하지 않고 단일 full job으로 복구한다.
- [ ] 독립 runner의 Supabase 시작 비용 때문에 wall-clock이 줄지 않으면 workflow 분리를 되돌리고 조건부 skip만 유지한다.

## 스펙 검토

Reviewer Agent: spec_review_112
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] runner 사용 시간 총합은 늘 수 있지만 사용자 피드백 wall-clock을 줄이는 것이 이 이슈의 목표다.
- [ ] final `verify` job은 기존 branch protection 이름을 유지하지만 실제 검증은 needs로 연결된 job들이 소유한다.
