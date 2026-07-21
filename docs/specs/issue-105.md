# Issue 105 구현 스펙: [운영] CI E2E 병렬화와 불필요한 DB 업그레이드 반복 제거

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/105

## 목표

보안·DB·핵심 사용자 흐름 검증은 유지하면서 일반 모바일 E2E를 병렬화하고, 관련 변경이 없는 커밋에서는 DB 업그레이드 전용 회귀 검증을 생략해 PR CI 피드백 시간을 줄인다.

## 범위

- [ ] `playwright.config.ts`에서 CI의 일반 mock 기반 모바일 E2E worker 수를 1에서 2로 늘린다.
- [ ] `package.json`의 실제 Supabase를 공유하는 `test:e2e:mvp`, `test:e2e:live` 명령은 `--workers=1`을 유지한다.
- [ ] `scripts/ai-verify`에서 migration·Supabase 설정/seed·업그레이드 테스트·검증 스크립트 변경 여부를 기준으로 두 업그레이드 회귀 테스트를 실행하거나 명시적으로 생략한다.
- [ ] `.github/workflows/ci.yml`에서 PR과 main push 모두 정확한 비교 기준 SHA를 `GYEOP_VERIFY_BASE_REF`로 전달한다.
- [ ] 변경 전 GitHub Actions 로그와 변경 후 로컬/CI 결과를 QA 문서에 기록한다.

## 제외 범위

- [ ] 기존 unit·SQL·integration·live E2E·mock E2E 테스트 파일이나 assertion은 삭제하지 않는다.
- [ ] Supabase 공유 상태를 사용하는 live E2E와 DB integration을 병렬화하지 않는다.
- [ ] 변경 파일별 전체 테스트 선택기, matrix/shard workflow, 새 cache/action dependency는 추가하지 않는다.
- [ ] main push CI 제거, branch protection 변경, 검증 계약 완화는 포함하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- .github/workflows/ci.yml
- scripts/ai-verify
- scripts/verify-path-changes
- playwright.config.ts
- package.json
- pnpm-lock.yaml
- tests/integration/visitor-assignment-upgrade.test.sh
- tests/integration/eligibility-cutover-upgrade.test.sh
- docs/specs/README.md
- docs/templates/qa-verdict.md
- .codex/skills/gyeop-task/references/review-gates.md
- .codex/AGENTS.md
- AGENTS.md

## 사용자 흐름 영향

- [ ] 제품 화면과 owner→visitor→new-owner→profile-reshare 흐름은 바뀌지 않는다.
- [ ] 해당 흐름을 실제 Supabase와 브라우저로 증명하는 live gate는 그대로 직렬 실행한다.

## 디자인 영향

- [ ] 없음. UI, copy, viewport, 접근성 계약을 변경하지 않는다.

## API와 데이터 영향

- [ ] route, schema, model, migration, storage, auth 변경은 없다.
- [ ] upgrade test 선택 기준은 `supabase/migrations`, `supabase/config.toml`, `supabase/seed.sql`, Supabase CLI 버전을 고정하는 `package.json`·`pnpm-lock.yaml`, 두 upgrade test 파일, `scripts/ai-verify`다.
- [ ] 비교 기준은 로컬에서 `origin/main`, GitHub PR에서 base SHA, main push에서 event `before` SHA를 사용한다. 기준 ref를 확인할 수 없거나 working tree/index에 관련 변경이 있으면 fail-open으로 두 upgrade test를 실행한다.

## 구현 계획

- [ ] `scripts/verify-path-changes`에 기존 task-harness diff 검사와 같은 `git diff --quiet` 판정을 둔다. 확인 가능한 base 뒤 관련 변경이나 staged/unstaged 변경이 있으면 성공 상태로 `run`, 모두 없으면 `skip`, base 확인 실패도 fail-open으로 `run`을 출력한다.
- [ ] `scripts/ai-verify`의 task-harness 회귀 선택과 upgrade 회귀 선택이 같은 helper를 재사용해 선택 규칙이 갈라지지 않게 한다.
- [ ] 관련 경로에 base 이후 변경, unstaged 변경, staged 변경 중 하나라도 있으면 두 upgrade test를 실행한다. 모두 없을 때만 `Upgrade regression tests skipped: no migration-path changes.`를 출력한다.
- [ ] `.github/workflows/ci.yml`의 full verify step에 `GYEOP_VERIFY_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}`를 전달해 PR은 base SHA, main push는 event `before` SHA와 비교한다.
- [ ] `playwright.config.ts`의 CI worker만 2로 바꾼다. live 명령의 명시적 `--workers=1`이 우선하는 기존 구조는 유지한다.
- [ ] 새 dependency나 범용 test selector는 만들지 않는다. diff 판정을 실제 호출과 focused check가 공유하는 실행형 shell helper 하나만 추가한다.

## 완료 기준

- [ ] `CI=1 pnpm exec playwright test tests/e2e/home.spec.ts --project=mobile-chromium` 실제 출력에 `using 2 workers`가 기록된다.
- [ ] `package.json`의 두 live E2E 명령에는 각각 `--workers=1`이 남아 있다.
- [ ] full verify의 live E2E 실제 출력에는 `using 1 worker`가 기록된다.
- [ ] migration 관련 변경이 없는 비교 기준에서는 upgrade test skip 문구가 출력될 조건이 성립한다.
- [ ] migration, seed/config, Supabase CLI dependency, upgrade test, `scripts/ai-verify` 변경 중 하나라도 있거나 base ref 확인이 실패하면 두 upgrade test 실행 조건이 성립한다.
- [ ] 보안·DB·핵심 live 사용자 흐름을 포함한 전체 검증과 exact-head CI `verify`가 통과한다.

## 테스트 계획

- [ ] `bash -n scripts/ai-verify`
- [ ] `bash -n scripts/verify-path-changes && test "$(scripts/verify-path-changes HEAD scripts/ai-verify)" = skip`
- [ ] `test "$(scripts/verify-path-changes origin/main scripts/ai-verify)" = run`으로 이번 브랜치의 changed 분기를 확인한다.
- [ ] `test "$(scripts/verify-path-changes refs/heads/does-not-exist scripts/ai-verify)" = run`으로 base 확인 실패의 fail-open 분기를 확인한다.
- [ ] `CI=1 pnpm exec playwright test tests/e2e/home.spec.ts --project=mobile-chromium` 출력의 `using 2 workers`와 passed 수를 확인한다.
- [ ] `pnpm lint && pnpm typecheck`
- [ ] `scripts/task-harness pr 105`가 소유하는 `./scripts/run-ai-verify --mode full`
- [ ] PR exact-head의 named `verify` 성공과 Actions 단계 시간을 QA에 기록한다.

## 분석과 관측성

- [ ] 제품 analytics 변화는 없다.
- [ ] CI 로그의 upgrade skip 문구, Playwright passed 수, 각 Actions step 시작/종료 시간을 관측 근거로 사용한다.

## 개인정보와 악용 방지

- [ ] 익명 응답, 공개 링크, capability, OAuth, 민감 결과 처리에는 변화가 없다.
- [ ] 보안·권한·concurrency·live core-flow 검증은 삭제하거나 조건부 생략하지 않는다.

## 롤아웃과 복구

- [ ] feature flag와 migration은 없다. PR CI에서 새 worker/선택 로직을 먼저 실제 실행한다.
- [ ] 병렬 mock E2E가 flaky하거나 resource contention을 보이면 `workers`를 1로 되돌린다.
- [ ] upgrade test가 잘못 생략되면 조건부 블록을 되돌려 두 스크립트를 항상 실행하게 한다.

## 스펙 검토

Reviewer Agent: spec_review_105
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 예상 절감은 평상시 PR에서 upgrade 회귀 약 1분 내외와 mock E2E 약 1분 내외다. GitHub runner의 apt/Chromium 네트워크 지연은 이번 범위로 제거하지 않는다.
- [ ] 실제 절감량은 PR CI 한 번으로 확인하며, 시간보다 검증 안정성을 우선해 live E2E와 DB integration은 직렬로 유지한다.
