# Issue 119 구현 스펙: [프론트엔드] 공유 전 로그인 화면에 질문팩 목록 이동 추가

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/119

## 목표

공유 전 Google 로그인 화면에서 현재 질문으로 돌아가는 선택과 별개로 질문팩 목록으로 빠져나갈 수 있게 한다.

## 범위

- [ ] `parseOwnerSignInTarget()`을 통과해 `target.playId`가 있는 `/auth/sign-in?playId=<playId>&returnTo=%2Fme%2Fplays%2F<playId>` 화면에 `다른 질문팩 보기` 링크를 추가한다.
- [ ] 새 링크는 질문팩 목록이 있는 `/`로 이동한다.
- [ ] Playwright 회귀 테스트로 play 진입과 일반 진입의 링크 구성을 검증한다.

## 제외 범위

- [ ] Google OAuth, account claim, `returnTo` 처리와 로그인 후 이동은 변경하지 않는다.
- [ ] 질문팩 완료 화면, 홈 질문팩 목록, 다른 인증 필요 화면은 변경하지 않는다.
- [ ] 전역 내비게이션이나 새 공통 컴포넌트는 추가하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md
- app/(public)/page.tsx
- app/auth/sign-in/page.tsx
- app/auth/sign-in/sign-in.module.css
- lib/auth/owner-claim-context-core.mjs
- tests/e2e/owner-play.spec.ts

## 사용자 흐름 영향

- [ ] 주인: 10장 완료 후 로그인 화면에서 로그인, 완료 질문 복귀, 질문팩 목록 이동 중 하나를 고를 수 있다.
- [ ] 방문자와 전환된 새 주인: 기존 무가입 참여와 동일 팩 시작 흐름은 변하지 않는다.

## 디자인 영향

- [ ] 공유 전 로그인 화면의 보조 링크만 변경한다. `Google로 계속하기`는 primary CTA로 유지하고 기존 `내 질문으로 돌아가기` 아래에 `다른 질문팩 보기`를 같은 보조 링크 스타일로 세로 배치한다.
- [ ] 일반 `/auth/sign-in?returnTo=%2Fme` 화면은 기존 `홈으로` 하나만 표시해 중복을 만들지 않는다.

## API와 데이터 영향

- [ ] 없음. 새 링크는 고정 내부 경로 `/`만 사용한다.

## 구현 계획

- [ ] `app/auth/sign-in/page.tsx`에서 파싱된 `target.playId`가 있을 때만 홈 링크를 하나 더 렌더링한다.
- [ ] `app/auth/sign-in/sign-in.module.css`의 기존 `.back`을 block-level flex와 내용 너비로 최소 조정해 두 보조 링크가 세로로 쌓이게 한다. 새 CSS class와 컴포넌트는 만들지 않는다.
- [ ] `tests/e2e/owner-play.spec.ts`의 현재 로그인 UI 테스트 구간에 exact play-context URL의 링크 구성, 일반 진입 비중복, 320px 배치를 검증한다.

## 완료 기준

- [ ] 유효한 `playId`가 있는 로그인 화면에 `다른 질문팩 보기`가 표시되고 `href="/"`이다.
- [ ] 같은 화면의 `내 질문으로 돌아가기`와 `Google로 계속하기`가 기존 목적지를 유지한다.
- [ ] `playId`가 없는 일반 로그인 화면에는 `홈으로`만 있고 `다른 질문팩 보기`는 없다.
- [ ] 키보드로 세 링크에 접근할 수 있고 기존 focus-visible 스타일을 재사용한다.

## 테스트 계획

- [ ] `./scripts/run-ai-verify --mode full`은 `scripts/task-harness pr`에서 exact HEAD 대상으로 실행한다.
- [ ] `pnpm exec playwright test tests/e2e/owner-play.spec.ts --grep "owner sign-in"`
- [ ] Playwright에서 viewport를 320px로 설정하고 세 링크의 bounding box가 화면 안에 있으며 두 보조 링크가 세로로 겹치지 않는지 검증한다.

## 분석과 관측성

- [ ] 없음. 인증이나 공유 성공 이벤트가 아닌 단순 내부 내비게이션 링크다.

## 개인정보와 악용 방지

- [ ] 없음. `playId`, 답변, 계정 정보는 새 링크에 포함하지 않고 고정 경로 `/`로만 이동한다.

## 롤아웃과 복구

- [ ] feature flag와 migration 없이 일반 프론트엔드 배포로 반영한다. 문제 시 링크와 해당 테스트만 되돌린다.

## 스펙 검토

Reviewer Agent: issue119_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 없음. 제품·기술 미결정 사항이 없고 독립 스펙 검토를 통과했다.
