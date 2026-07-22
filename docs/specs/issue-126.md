# Issue 126 구현 스펙: [Safety] Google owner 로그아웃과 서버 세션 종료 추가

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/126

## 목표

Google로 로그인한 주인이 계정 연결 데이터는 보존한 채 현재 브라우저의 Supabase Auth 세션만 안전하게 종료할 수 있게 한다.

## 범위

- [ ] `POST /api/auth/logout` same-origin mutation을 추가해 Supabase SSR `auth.signOut({ scope: "local" })`을 실행하고 인증 쿠키 만료를 응답에 반영한다.
- [ ] 로그인된 `/me`에 처리 중 중복 제출을 막는 `로그아웃` 보조 버튼과 실패 시 재시도 가능한 한국어 오류를 추가한다.
- [ ] 성공 시 `/`로 replace하고 server-rendered private owner 화면을 다시 열었을 때 기존 Google 로그인 안내로 수렴하게 한다.
- [ ] 로그아웃 전후 account-linked play 보존과 다시 로그인했을 때 목록 복원을 owner live E2E로 검증한다.

## 제외 범위

- [ ] 계정 삭제, play 삭제, 공유 링크 폐기, 모든 기기 로그아웃, Google provider 연결 해제는 포함하지 않는다.
- [ ] anonymous owner capability용 `DELETE /api/me/session`과 `clearOwnerSession()`의 의미를 변경하지 않는다.
- [ ] DB migration, 퍼널 이벤트, 계정 프로필 정보 노출은 추가하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- .codex/AGENTS.md

## 사용자 흐름 영향

- [ ] 로그인된 재방문 주인: `/me` → `로그아웃` → 홈 → 보호 화면 재진입 시 Google 로그인 안내 → 같은 계정 재로그인 시 기존 팩 목록 복원.
- [ ] 익명 주인과 방문자 흐름에는 변화가 없고, 로그아웃된 `/me`에는 로그아웃 버튼을 노출하지 않는다.

## 디자인 영향

- [ ] `app/me/page.tsx`의 로그인 분기에만 보조 동작을 추가한다. `다른 질문팩 고르기`보다 위험 동작임을 구분하되 44px 이상 터치 영역과 focus-visible을 유지한다.
- [ ] 별도 목업 없이 기존 owner list 시각 언어를 재사용한다.

## API와 데이터 영향

- [ ] `POST /api/auth/logout`: exact `{}` JSON, 허용된 same-origin mutation, private no-store, 성공 204, 실패는 기존 redacted `INTERNAL_ERROR` 계약을 사용한다. 명시적 `GET`은 세션을 바꾸지 않고 `405`, `Allow: POST`, private no-store를 반환한다.
- [ ] `createFreshServerAuthClient()`가 Route Handler의 cookie store에 전달하는 Supabase 만료 cookie만 변경한다. owner play·답변·링크·방문자 응답·집계 DB row와 anonymous capability는 변경하지 않는다.

## 구현 계획

- [ ] `lib/http/auth-owner.ts`에 현재 브라우저 세션만 sign out하고 204 private no-store를 반환하는 작은 adapter를 추가한다.
- [ ] `app/api/auth/logout/route.ts`에서 `withPublicRequest`, empty schema, 16-byte body limit을 거쳐 adapter를 호출한다.
- [ ] `app/me/logout-button.tsx`에 pending/error 상태만 둔 client button을 만들고 성공 시 `router.replace("/")` 후 `router.refresh()`한다.
- [ ] `app/me/page.tsx` 로그인 분기와 `owner-list.module.css`에 보조 버튼을 연결한다.
- [ ] 보호 client 화면이 BFCache에서 `pageshow.persisted`로 복원되면 기존 ready state를 즉시 loading으로 지우고 private API를 다시 읽어 401 화면으로 수렴시킨다.
- [ ] HTTP boundary 정책 및 owner live E2E에 origin/method/cookie 만료/보호 화면 차단/데이터 복원 회귀를 추가한다.

## 완료 기준

- [ ] 로그인된 `/me`에만 `로그아웃`이 보이고 클릭 중 비활성화된다.
- [ ] 성공 응답은 204 private no-store이며 Supabase Auth cookie를 만료하고 홈으로 이동한다.
- [ ] 로그아웃 뒤 `/me`와 account-owned play/profile/share API가 401 또는 기존 Google 로그인 안내로 수렴하며 뒤로가기로 private 내용이 재노출되지 않는다.
- [ ] 외부 Origin POST는 거절되고 GET은 `405`, `Allow: POST`, private no-store로 세션을 종료하지 않는다.
- [ ] 실패 시 화면 전환 없이 `로그아웃하지 못했어요. 다시 시도해 주세요.`를 보여주고 재시도할 수 있다.
- [ ] 같은 계정으로 재로그인하면 기존 account-linked play 목록이 복원된다.

## 테스트 계획

- [ ] `./scripts/run-ai-verify --mode full`
- [ ] HTTP boundary policy focused test: route ordering, POST schema/no-store, 명시적 GET 405/Allow/no-store.
- [ ] owner live E2E: 보호 상세 → `/me` → 로그아웃 → 뒤로가기에서 ready 데이터 비노출 및 401 재검증 → 같은 계정 재로그인 → 기존 play 복원.
- [ ] 네 이슈 통합 QA에서 320/390/430px 버튼·오류·뒤로가기 동선을 확인한다.

## 분석과 관측성

- [ ] 퍼널 이벤트와 대시보드 변경 없음. 공개 응답과 UI에 Auth UID, 이메일, 쿠키 값을 기록하거나 노출하지 않는다.

## 개인정보와 악용 방지

- [ ] 공용 기기에서 보호 데이터를 닫는 안전 동작이다. same-origin mutation과 private no-store를 유지하고 현재 브라우저 세션만 종료한다.
- [ ] signOut 실패를 성공으로 처리하지 않으며 account-linked 데이터와 anonymous capability를 삭제·revoke하지 않는다.

## 롤아웃과 복구

- [ ] migration과 feature flag 없음. 문제가 생기면 신규 route·버튼·회귀 테스트만 되돌리며 저장 데이터에는 영향이 없다.

## 스펙 검토

Reviewer Agent: critic issue126_spec_review
Review Status: PASS
P0/P1 Findings: 0

초기 P1 2건인 명시적 GET 405/no-store와 BFCache 복원 재검증 계획을 반영했다.

## 리스크와 미결정 사항

- [ ] 제품 결정 블로커 없음. local/CI Supabase Auth fixture가 유효해야 live gate를 실행할 수 있다.
