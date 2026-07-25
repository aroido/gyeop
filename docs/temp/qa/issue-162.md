# Issue 162 독립 QA

검증 구현 HEAD: `41ba6d9633cf7e954026059acf354d1424d6126b`
비교 기준: `1b27c9ca8c563f43b68a7a12fd249a43e7b9914a`

## QA 판정

Reviewer Agent: issue_162_verifier
Status: PASS
P0/P1 Findings: 0

## 발견 사항

## P0

- 없음.

## P1

- 없음.

## P2

1. 기준 목업 29는 canonical #162 worktree가 아니라 사용자 root worktree의 untracked 파일로만 확인된다.
   - 읽기 전용 비교에는 사용했으나 독립 worktree와 CI에서 같은 참고 이미지를 재현하려면 별도 추적이 필요하다.

## 기존 P1 종료 확인

1. `app/me/plays/[playId]/profile-share-card.tsx`의 포맷 오류가 수정되어 `pnpm format:check`가 통과했다.
2. live 대표 흐름의 3축 문항 수 assertion이 축별 strict-safe 검사로 바뀌어 concept E2E 5/5가 통과했다.
3. screenshot 경로가 `docs/temp/qa/issue-162`로 바뀌었고 요구된 PNG가 정확히 9개 생성됐다.

## 검증 명령과 결과

- `pnpm format:check`
  - PASS.
- `pnpm typecheck`
  - PASS.
- `pnpm lint`
  - PASS.
- `node --test tests/unit/concept-profile.test.mjs tests/unit/profile-share-card.test.mjs tests/unit/concept-profile-client.test.mjs`
  - PASS: 28/28.
  - 대표축 첫 번째, 달성 가능한 최대 영역 다양성, 불가피한 동일 영역, 0/1/2 eligible fallback, contextual 허용, unsettled/private/extra-key 거부, exact 3축 decoder와 relationship 모델 회귀를 확인했다.
- `pnpm exec supabase db reset --local`
  - PASS: 이전 반복 실행의 로컬 인증 rate-limit 상태를 초기화했다.
- `GYEOP_E2E_LIVE=1 GYEOP_CONCEPT_PROFILE_ENABLED=true GYEOP_E2E_PORT=32162 pnpm exec playwright test tests/e2e/concept-profile-live.spec.ts --project=mobile-chromium`
  - PASS: 5/5.
  - owner auth와 `private, no-store`, 대표 picker → 관리 화면 preview, analytics one-shot, exact 3축, 0/1/2 privacy fallback, contextual split, 320/390/430, 200% 확대, 키보드/focus 복귀, reduced motion, 실제 PNG 다운로드를 확인했다.
  - DB 초기화 전 첫 시도는 모든 magic-link 요청이 이전 로컬 상태의 429를 받아 종료됐으며 구현 assertion에는 도달하지 않았다.
- `GYEOP_E2E_PORT=32163 pnpm exec playwright test tests/e2e/share-links.spec.ts --project=mobile-chromium`
  - PASS: 21/21.
  - 기존 relationship 카드, native share 취소/실패, `NotAllowedError`, PNG/context/toBlob/font 경계, 수동 복사 focus, mixed query 404, 1080×1920 concept Canvas와 320/390/430 접근성 회귀를 확인했다.
- `git diff --check 1b27c9c..HEAD`
  - PASS.
- 코드 계약 독립 검토
  - 공개 concept 카드 모델은 top-level `nickname/axes`, axis exact 7 keys, settled/contextual others union, exact 3축, catalog identity, 위치·stage/range·cardCount를 fail-closed로 검증한다.
  - 공개 모델·DOM·Canvas에서 `privateOthers`, 방문자 이름·관계·개별 답변·응답자 수·raw score·백분율 노출 경로를 찾지 못했다.
  - 대표 option의 기존 `sourcePlayId`만 same-pack public invite 경계로 전달되고 기존 analytics 이벤트 경계를 중복 없이 재사용한다.

## 시각 검증

- 정확히 9개를 원본으로 직접 검사했다.
  - `320.png`, `390.png`, `430.png`: 세 카드·endpoint·marker/range·8개 영역·단일 공유 CTA가 가로 잘림 없이 보이고 3색 hard-offset가 유지된다.
  - `zoom-200.png`: 제목과 긴 endpoint가 재배치되며 모든 정보·CTA·관리 카드가 손실이나 가로 overflow 없이 남는다.
  - `contextual.png`: 한쪽 위치 marker 대신 양쪽 split 범위가 표시되고 unsettled 익명 집계는 단일 위치를 발명하지 않는다.
  - `keyboard-focus.png`: `내 겹 공유하기`에 색상 외 파란 focus outline이 분명하고 상세 열기·닫기 뒤 흐름도 유지된다.
  - `reduced-motion.png`: 애니메이션 없이 같은 레이아웃과 focus 상태가 안정적으로 남는다.
  - `share-preview.png`: 닉네임, `● 나 / ○ 지인`, 정확히 세 축, endpoint, 익명 범위, 고유 문항 수만 표시된다.
  - `share-png.png`: 실제 PNG signature, 1080×1920, blue/lime/coral 카드와 hard-offset 스택을 확인했다.
- 사용자 root의 read-only 목업 29와 비교해 앱 팔레트, 검정 윤곽, 3색 카드 스택과 marker/range 의미가 일치한다.
- 9개 이미지 어디에도 자연어 성격 해석, stage 문장, 점수, 백분율, 응답자 수, 방문자 이름·관계·개별 위치가 보이지 않는다.

## 필수 수정

- 없음.
