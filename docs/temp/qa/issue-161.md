## QA 판정

Reviewer Agent: issue_161_verifier
Status: FAIL
P0/P1 Findings: 2

## 발견 사항

- P0: 없음.
- P1-1 — 필수 모바일·접근성 E2E 매트릭스가 구현되지 않았다.
  - `tests/e2e/concept-profile-live.spec.ts` fixture는 `responseCount?: 0 | 3`만 허용해 locked 임계값 1/3, 2/3을 검증하지 않는다.
  - 320/390/430px 모두 높이 800px로 실행해 스펙의 320×568, 390×844, 430×932 실제 viewport를 검증하지 않는다.
  - 200% 검사는 `<html>` 글꼴 크기와 가로 overflow만 확인한다. 콘텐츠 잘림, 읽기 순서, focus ring, 44×44px target 유지 검증이 없다.
  - Tab, Shift+Tab, Space, focus-visible, 공유 fallback 후 focus 복귀를 검증하지 않는다.
  - reduced motion은 emulation만 설정하고 animation/transition 제거 결과를 단언하지 않는다.
  - screen reader 검증은 첫 카드의 `내 위치` label 하나에 그친다. endpoint → 내 위치 → 지인 상태 → 문항 수 → 근거 단계 순서와 available/contextual/unsettled 접근성 이름을 검증하지 않는다.
- P1-2 — 완료 기준에 명시된 실기기형 시각 QA 증거와 live E2E 결과가 없다.
  - `docs/temp/qa/issue-161/320.png`, `390.png`, `430.png`, `zoom-200.png`, `locked.png`, `contextual.png`, `unsettled.png`, `keyboard-focus.png`, `reduced-motion.png`가 모두 없다.
  - 로컬 `supabase_db_gyeop` 컨테이너가 없고 `supabase status`도 실패해 `pnpm test:e2e:concept:run`을 실행할 수 없었다.
- P2-1 — 스펙이 참조하는 기준 목업은 issue worktree에서 추적되지 않아 다른 환경에서 동일 비교를 재현할 수 없다.

정적 코드 검토에서는 exact API shape, locked privacy, position 방향, 8개 area dedupe/order, 3개 대표 후보와 area 다양성, result-first UI와 단일 CTA가 확인됐다.

## 검증

- Base: `a650ab39e28cc901f53267ba2eaacc38f9e8ee0b`
- HEAD: `34959422df370fa99ddfb1700ff1c4675e45e761`
- `node --test tests/unit/concept-profile.test.mjs tests/unit/concept-profile-client.test.mjs`: PASS, 19 tests
- account/share/http boundary focused unit: PASS, 48 tests
- 대상 ESLint, TypeScript, Prettier, `git diff --check main...HEAD`: PASS
- `pnpm test:e2e:concept:run`: 미실행. 로컬 Supabase 부재.
- `./scripts/run-ai-verify --mode full`: 미실행. exact clean HEAD full verify는 `scripts/task-harness pr` 단계가 소유한다.

## 필수 수정

1. 0/1/2/3 지인 임계값에서 locked privacy와 3에서만 열리는 익명 집계를 검증한다.
2. 320×568, 390×844, 430×932, 200% 확대에서 overflow, 잘림, endpoint, 읽기 순서, 44×44px target, focus ring을 검증한다.
3. Tab/Shift+Tab/Enter/Space, fallback focus 복귀, available/contextual/unsettled/locked 접근성 이름과 순서, reduced-motion computed state를 단언한다.
4. 로컬 Supabase로 live E2E를 통과시키고 지정된 9개 스크린샷을 fixture·viewport와 연결한다.
5. 수정 후 동일 base...HEAD 범위를 독립 QA에서 다시 검증한다.
