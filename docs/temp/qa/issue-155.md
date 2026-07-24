## QA 판정

Reviewer Agent: issue155_verifier
Status: PASS
P0/P1 Findings: 0

검토 범위는 GitHub issue #155, `docs/specs/issue-155.md`, `origin/main...74b6fc1`과 QA 후속 5개 dirty file, 관련 구현·테스트·제품 SSOT, 제공된 360×800/320×568 시각 증거다. `scripts/task-harness pr 155`가 소유하는 full verify는 실행하지 않았다.

## 발견 사항

### P0

- 없음.

### P1

- 없음.

### P2

- 없음.

## QA follow-up resolution

- `share-links.module.css`의 short-height override에서 `.cardNav .back`을 제거해 기존 2.75rem(44px) target을 유지한다.
- `shareProfileCard`가 취소에는 share Primary, 미지원·`NotAllowedError`·일반 실패·PNG 실패에는 fallback `링크 복사`를 local `focusTarget`으로 선택한다.
- E2E가 320×568 back/Primary 44px, `canShare({files}) === false`와 `NotAllowedError` fallback의 active focus를 직접 단언한다.
- `docs/specs/issue-155.md`와 `docs/design/p0-mobile-ui-spec.md`가 export PNG는 항상 9:16, 높이 650px 이하 DOM preview만 4:5라는 responsive 예외를 동일하게 기록한다.

## 검증

- `gh issue view 155 --repo aroido/gyeop --json number,title,state,labels,body,url`
  - PASS: open issue, label `status:qa`, 구현 범위와 수용 기준 확인.
- `git log --oneline origin/main..HEAD`
  - PASS: 검토 HEAD `74b6fc1`, spec commit `3577728`.
- `git diff --stat origin/main...HEAD && git diff --name-status origin/main...HEAD`
  - PASS: 12개 파일, 804 insertions/155 deletions 범위 검토.
- `git diff --check origin/main...HEAD`
  - PASS: whitespace 오류 없음.
- `node --test tests/unit/profile-share-card.test.mjs tests/unit/share-handoff.test.mjs`
  - PASS: 5/5. match/mismatch/tie, 질문별 `counts.a + counts.b`, safe allowlist, romantic/stale fail-closed 확인.
- `node --test tests/unit/owner-profile.test.mjs tests/unit/account-profile.test.mjs`
  - PASS: 5/5. strict relationship layer·threshold·projection privacy 확인.
- `pnpm lint`
  - PASS.
- `pnpm typecheck`
  - PASS.
- `pnpm build`
  - PASS: Next.js production build와 18개 static page 생성 완료.
- `GYEOP_E2E_PORT=3155 pnpm exec playwright test tests/e2e/share-links.spec.ts --project=mobile-chromium --workers=1`
  - PASS: 20/20.
  - one-click public POST + PNG/text/URL native share 1회, same-tick 중복 방지, resolve에만 성공 event 1회 확인.
  - AbortError, create 뒤 NotAllowedError, 일반 native reject, `canShare({files}) === false`, clipboard 실패에서 URL 보존과 fallback 확인.
  - 일반 manager의 public/1:1 create, native link share, copy, rotate, disable 회귀 없음.
  - match/tie DOM, match Canvas 핵심 문구 parity, 1080×1920 PNG·safe filename·금지 metadata 부재, 장문/3자리 count render 확인.
  - 360×800 기본 project와 320×568, 200% root zoom, reduced motion, body 가로 overflow 0, Primary 44px/focus 복귀 확인.
- 최초 기본 포트 실행은 TCP 3000을 외부 `ssh` listener가 점유해 Playwright webServer 60초 timeout으로 종료했다. 코드/테스트 실패가 아니며 격리 포트 3155 재실행은 전부 통과했다.
- `git diff --check`
  - PASS: QA 후속 5개 file과 현재 worktree에서 whitespace 오류 없음.
- `pnpm typecheck`
  - PASS: QA 후속 TypeScript 변경 통과.
- `GYEOP_E2E_PORT=3156 pnpm exec playwright test tests/e2e/share-links.spec.ts --project=mobile-chromium --workers=1 --grep 'preserves the created link|keeps card mode isolated|keeps one card action usable'`
  - PASS: 3/3.
  - create 뒤 `NotAllowedError`에서 보존된 링크 fallback과 `링크 복사` focus 확인.
  - `canShare({files}) === false`에서 반복 실패 Primary 제거, 이미지 저장·manual copy와 `링크 복사` focus 확인.
  - 320×568에서 back link와 Primary 모두 44px 이상, Primary 첫 viewport 가시성, 가로 overflow 0 확인.

## Visual evidence

- `/Users/macmini/.Trash/gyeop-issue155-visual-20260724-1550/issue-155/current-state.png`
  - 945×2100 device-pixel capture(360×800 CSS viewport). 결과 위계, 9:16 preview, 단일 Primary, 가로 잘림 없음 확인.
- `/Users/macmini/.Trash/gyeop-issue155-visual-20260724-1550/issue-155/current-320x568.png`
  - 840×1491 device-pixel capture(320×568 CSS viewport). 결과 핵심과 단일 Primary가 첫 화면에 보이고 가로 잘림 없음 확인.
  - short-height DOM preview 4:5 예외가 제품 SSOT와 구현 스펙에 명시됐고, 후속 E2E가 보이지 않는 hit target까지 44px 이상임을 확인한다.

## 필수 수정

- 검토 범위의 필수 수정 없음.
- focused Next dev가 자동 생성한 `next-env.d.ts`, `tsconfig.json`, `.next/` drift는 제품 finding이 아니며 task root가 PR gate 전에 정리한다.
