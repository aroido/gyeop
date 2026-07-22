# Issue 129 구현 스펙: [Frontend] 404·예외 화면에 복구 동선 추가

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/129

## 목표

존재하지 않는 주소와 처리되지 않은 화면 오류에서 질문팩 탐색 또는 안전한 재시도로 복귀할 수 있게 한다.

## 범위

- [ ] `app/not-found.tsx`에 generic 404 안내와 `/`의 `질문팩 둘러보기`를 추가한다.
- [ ] `app/error.tsx`에 generic 오류 안내, `reset()`의 `다시 시도`, `/`의 `홈으로`를 추가한다.
- [ ] 두 화면의 최소 공용 CSS Module과 404 E2E·error source contract test를 추가한다.

## 제외 범위

- [ ] API JSON 오류, 기능별 retry, global-error, 오류 수집 SDK, 오프라인 화면은 변경하지 않는다.
- [ ] 프로덕션 전용 테스트 route·query·오류 유발 코드를 추가하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- .codex/AGENTS.md

## 사용자 흐름 영향

- [ ] 모든 사용자: 미등록 주소 → 질문팩 탐색, 처리되지 않은 segment 오류 → `reset()` 재시도 또는 홈. 정상 핵심 흐름은 변경하지 않는다.

## 디자인 영향

- [ ] 겹의 검정 배경·lime 주 CTA·outline 보조 CTA를 재사용한다. 320px부터 overflow 없이 44px 터치 영역, 명확한 heading focus를 제공한다.
- [ ] 별도 범용 컴포넌트나 목업은 만들지 않는다.

## API와 데이터 영향

- [ ] 없음. Next App Router의 root `not-found`와 segment `error` 경계만 추가한다.

## 구현 계획

- [ ] `app/recovery.module.css`에 두 화면만의 shell/card/action 스타일을 둔다.
- [ ] `not-found.tsx`는 Server Component로 generic 404와 홈 링크만 렌더한다.
- [ ] `error.tsx`는 Client Component로 error 값을 렌더하지 않고 heading focus, `onClick={reset}`, 홈 링크만 렌더한다.
- [ ] `tests/e2e/recovery.spec.ts`에서 임의 미등록 URL의 404 status·문구·홈 이동·320/390/430px를 검증하고, 프로덕션 test route 없이 error source의 reset/home/no-error-render 계약을 결정적으로 검사한다.

## 완료 기준

- [ ] 임의 미등록 주소가 404 status와 겹 안내, `질문팩 둘러보기`를 보여주고 `/`로 이동한다.
- [ ] error boundary에 `다시 시도`와 `홈으로`가 있으며 재시도는 exact `reset()`만 호출한다.
- [ ] error·stack·digest·Supabase 원문·secret·이메일을 화면에 렌더하지 않는다.
- [ ] 320~430px에서 가로 overflow 없이 키보드로 두 동작을 식별할 수 있다.

## 테스트 계획

- [ ] `./scripts/run-ai-verify --mode full`
- [ ] recovery Playwright: 404 status/heading/link, 320/390/430px touch/overflow.
- [ ] error source contract: client boundary, exact reset handler, `/` link, error 값 미렌더링.

## 분석과 관측성

- [ ] 없음. 오류 객체나 사용자 값을 analytics/log에 추가하지 않는다.

## 개인정보와 악용 방지

- [ ] 모든 오류 문구를 generic하게 유지하고 error·digest·내부 ID·개인정보를 렌더하지 않는다.

## 롤아웃과 복구

- [ ] migration·flag 없음. 세 신규 파일과 E2E를 되돌리면 기본 Next 화면으로 복구된다.

## 스펙 검토

Reviewer Agent: critic issue129_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 없음. error boundary는 프로덕션 test seam 없이 source contract와 full build로 검증한다는 한계를 QA에 명시한다.
