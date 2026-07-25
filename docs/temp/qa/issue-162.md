# Issue 162 독립 QA

검증 구현 HEAD: `0c49d100aa8f74f0440d26d01bcad7ab532243ae`
비교 기준: `1b27c9ca8c563f43b68a7a12fd249a43e7b9914a`

## QA 판정

Reviewer Agent: issue_162_verifier
Status: FAIL
P0/P1 Findings: 3

## P0

- 없음.

## P1

1. 포맷 게이트 실패
   - `pnpm format:check`가 `app/me/plays/[playId]/profile-share-card.tsx`의 Prettier 위반으로 종료 코드 1을 반환했다.
   - 현재 HEAD는 저장소 완료 게이트를 통과할 수 없다.
2. 필수 live 대표 흐름 E2E 실패
   - `tests/e2e/concept-profile-live.spec.ts:601`에서 세 개의 `[data-axis]`를 반환하는 locator에 strict `toContainText`를 호출해 대표 picker → 3축 preview 흐름이 실패했다.
   - 같은 실행의 0/1/2 eligible fallback과 contextual 시나리오는 통과했다.
3. #162 시각 증거 경로 및 산출물 누락
   - `tests/e2e/concept-profile-live.spec.ts`의 `screenshotDirectory`가 여전히 `docs/temp/qa/issue-161`을 가리킨다.
   - 요구된 `docs/temp/qa/issue-162/{320,390,430,zoom-200,contextual,keyboard-focus,reduced-motion,share-preview,share-png}.png` 9개가 생성되지 않아 viewport·확대·키보드·reduced-motion·preview/PNG 시각 판정을 완료할 수 없다.

## P2

1. 기준 목업 29는 canonical #162 worktree에 없고 사용자 root worktree의 untracked 파일로만 확인됐다.
   - 읽기 전용으로 비교 기준을 확인했지만, 독립 worktree/CI에서 재현 가능한 추적 산출물은 아니다.

## 검증 명령과 결과

- `node --test tests/unit/concept-profile.test.mjs tests/unit/profile-share-card.test.mjs tests/unit/concept-profile-client.test.mjs`
  - PASS: 28/28.
  - 대표축 첫 번째, 달성 가능한 영역 다양성, 불가피한 동일 영역, 0/1/2 eligible fallback, contextual 허용, unsettled/private/extra-key 거부, exact 3축 decoder, relationship 모델 회귀를 확인했다.
- `pnpm typecheck`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm format:check`
  - FAIL: `app/me/plays/[playId]/profile-share-card.tsx`.
- `git diff --check 1b27c9c..HEAD`
  - PASS.
- `GYEOP_E2E_LIVE=1 GYEOP_CONCEPT_PROFILE_ENABLED=true GYEOP_E2E_PORT=32162 pnpm exec playwright test tests/e2e/concept-profile-live.spec.ts --project=mobile-chromium`
  - FAIL: 4 passed, 1 failed.
  - PASS 범위: 0/3, 1/3, 2/3 privacy fallback과 contextual split.
  - FAIL 범위: 대표 picker → 관리 화면 3축 preview 검증의 strict locator.
- `GYEOP_E2E_PORT=32163 pnpm exec playwright test tests/e2e/share-links.spec.ts --project=mobile-chromium`
  - PASS: 21/21.
  - 기존 relationship 카드, native share 취소/실패, `NotAllowedError`, PNG/context/toBlob/font 경계, 수동 복사 focus, mixed query 404, 1080×1920 concept Canvas, 320/390/430 접근성 회귀를 확인했다.
- 코드 계약 독립 검토
  - `ConceptProfileShareCardModel`은 top-level `nickname/axes`, axis exact 7 keys, settled/contextual others union, exact 3축, catalog identity, 위치·stage/range·cardCount 경계를 fail-closed로 검증한다.
  - 공개 모델과 concept preview/Canvas에 `privateOthers`, 방문자 이름·관계·개별 답변·응답자 수·raw score·백분율을 전달하는 경로를 찾지 못했다.
  - 대표 option의 기존 `sourcePlayId`만 관리 화면과 same-pack public invite 경계에 전달되고, 기존 analytics 이벤트 경계는 새 이벤트 없이 재사용된다.
- 시각 검토
  - 사용자 root의 read-only 목업 29에서 blue/lime/coral hard-offset 3축 스택과 marker/range 의미를 확인했다.
  - 실제 #162 9개 검수 이미지가 없어 목업 대비 최종 PASS는 보류했다.

## 필수 수정

1. `app/me/plays/[playId]/profile-share-card.tsx`를 저장소 Prettier 규칙에 맞추고 `pnpm format:check`를 통과시킨다.
2. live E2E의 세 축 문항 수 assertion을 각 축에 대해 strict-safe하게 검증하고 5/5를 통과시킨다.
3. screenshot 경로를 `docs/temp/qa/issue-162`로 고치고 요구된 9개 PNG를 생성한다.
4. 320×568, 390×844, 430×932, 200% 확대, Tab/Shift+Tab/Enter/Space/Escape, focus-visible/복귀, reduced motion, contextual split, preview, 1080×1920 PNG를 시각 검사한 뒤 독립 QA를 다시 요청한다.

