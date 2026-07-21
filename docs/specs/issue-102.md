# Issue 102 구현 스펙: owner 저장 로그인을 Google OAuth 단일 경로로 전환

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/102

## 목표

익명 주인이 셀프 응답을 마친 뒤 이메일 매직 링크 없이 Google OAuth 한 번으로 계정에 연결되고, 기존 질문팩 소유권과 공유 복귀 위치를 그대로 이어 간다.

## 범위

- [ ] `/auth/sign-in`을 `Google로 계속하기` 단일 CTA와 Google 로그인 실패 안내로 구성한다.
- [ ] `/auth/google` GET Route Handler에서 allowlist된 `playId`·`returnTo`, 익명 owner cookie, 완료 play를 검증한 뒤 Supabase Google OAuth PKCE를 시작한다.
- [ ] 기존 10분 signed owner-claim cookie와 `/auth/callback`의 code exchange·원자적 owner claim을 재사용한다.
- [ ] 운영 UI와 API에서 이메일 매직 링크 진입점을 제거한다. 로컬·CI의 실제 Auth claim 회귀 검증은 production에서 항상 닫히는 명시적 test-only endpoint로 격리한다.
- [ ] owner·프로필·공유 만료 화면의 `이메일로 로그인` 문구를 `Google로 로그인`으로 통일한다.
- [ ] 활성 제품·엔지니어링 문서의 owner 계정 연결 계약을 Google OAuth 단일 경로로 갱신하고, 과거 이메일 결정은 새 결정이 대체한다고 기록한다.
- [ ] Google Cloud OAuth 앱과 Supabase provider 준비는 코드 구현의 선행 rollout 조건이며 완료 기준으로 중복 계산하지 않는다.

## 제외 범위

- [ ] 카카오·네이버·비밀번호 로그인과 친구·방문자 로그인 요구는 추가하지 않는다.
- [ ] Google 이름·프로필 사진·계정 이메일을 제품 화면, 공유 문구, analytics, log에 노출하지 않는다.
- [ ] 계정 삭제, 이메일 알림, SMTP/Resend 운영, cross-device 익명 draft handoff를 확장하지 않는다.
- [ ] DB schema·migration과 공개 프로필 기능은 변경하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/product/full-product-plan.md
- docs/engineering/p0-development-plan.md
- docs/design/p0-mobile-ui-spec.md
- docs/specs/issue-92.md (선행 구현 기록이며 이메일 전용 계약은 이 스펙과 새 decision log가 대체)
- AGENTS.md

## 사용자 흐름 영향

- [ ] 주인은 익명으로 10장을 완료한 뒤 저장·공유 CTA에서 `/auth/sign-in`으로 이동하고, Google OAuth 성공 뒤 원래 `/me/plays/{playId}`로 돌아온다.
- [ ] 세션이 만료된 기존 주인은 `/me`와 owner 관리 화면에서 Google 로그인으로 계정을 다시 연다.
- [ ] 방문자는 계속 무가입이며 Google 로그인 CTA나 Google 계정 정보를 보지 않는다.
- [ ] 결과 화면에서 같은 팩을 시작한 새 주인도 동일한 익명 시작 → 완료 시 Google 저장 흐름을 따른다.

## 디자인 영향

- [ ] 기존 검은 카드·라임 primary CTA 구조는 유지한다. 이메일 입력·발송/완료 상태를 제거하고 `Google로 계속하기` 버튼 하나를 44px 이상 탭 영역으로 제공한다.
- [ ] 설명은 `Google 계정으로 저장하면 다른 브라우저에서도 다시 열 수 있어요. 계정 정보는 친구에게 보이지 않아요.`로 개인정보 경계를 함께 알린다.
- [ ] callback/claim 실패는 Google 재시도 안내를 보여 주고, claim 실패는 질문을 시작한 브라우저에서 다시 시도해야 함을 알린다.

## API와 데이터 영향

- [ ] `GET /auth/google`: 허용 query key는 singleton `playId`·`returnTo`뿐이다. key 중복·추가 key를 거부하고 `/me` 또는 `/me/plays/{canonical UUID}`만 허용한다. play claim이면 owner capability와 completed play를 먼저 검증한다.
- [ ] Supabase SSR client의 `signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } })` 결과 URL로 303 이동하며, 같은 응답에 signed owner-claim cookie와 PKCE verifier cookie를 설정한다.
- [ ] `GET /auth/callback`은 query가 정확히 singleton `code` 하나일 때만 exchange를 시도한다. Google 취소·provider 오류의 `error*` query, 추가·중복·누락 query는 내용을 반영하거나 기록하지 않고 `/auth/sign-in?error=callback`으로 보낸다. code exchange 뒤 owner cookie/context/RPC가 실패한 경우만 `/auth/sign-in?error=claim`으로 보낸다.
- [ ] 기존 `POST /api/auth/magic-link`는 제거한다. 로컬 E2E용 `POST /api/auth/test-magic-link`는 `NODE_ENV !== "production" && GYEOP_E2E_LIVE === "1"`일 때만 연다. JSON body는 기존과 같은 `{ email, playId, returnTo }`, 성공은 private no-store `202 { message }`, 이중 gate가 맞지 않으면 body 처리·Supabase 호출 전에 private no-store 404다.
- [ ] Google client ID·secret은 Google Cloud와 Supabase dashboard에만 저장하며 repo env·코드·문서·테스트 fixture에는 기록하지 않는다.

## 구현 계획

- [ ] `lib/auth/owner-claim-context-core.mjs`에 sign-in target 정규화 helper를 두고 page와 OAuth start route가 같은 allowlist를 사용하게 한다.
- [ ] `lib/http/auth-owner.ts`에 완료 play 검증, Google OAuth 시작 response 생성, test-only magic-link helper를 경계별로 분리한다.
- [ ] `app/auth/google/route.ts`를 추가하고 `app/auth/sign-in/page.tsx`, `app/auth/sign-in/sign-in-form.tsx`, `app/auth/sign-in/sign-in.module.css`, `app/auth/callback/route.ts`를 Google 단일 CTA·오류 계약으로 정리한다.
- [ ] `app/me/page.tsx`, `app/play/[playId]/owner-play.tsx`, `app/me/owner-profile-view.tsx`, `app/me/plays/[playId]/share-link-manager.tsx`, `app/me/plays/[playId]/private-one-to-one-panel.tsx`를 포함해 모든 `/auth/sign-in?returnTo=%2Fme` 호출처와 E2E assertion을 `Google로 로그인`으로 전수 변경한다.
- [ ] `tests/e2e/owner-auth-live-fixture.ts`는 sign-in 화면에서 Google 단일 CTA와 이메일 input 부재를 먼저 검증한 뒤 test-only endpoint를 직접 POST하고, Mailpit verify link로 callback/claim을 완료한다. `claimCompletedOwnerAccount`와 `signInOwnerAccount` 모두 이 helper를 사용한다.
- [ ] owner live E2E에 Google CTA 클릭을 한 번 추가하고 local Supabase `/auth/v1/authorize?...provider=google` 요청을 intercept해 provider·redirect target과 owner-claim/PKCE cookie 설정을 검증한다. 외부 Google credential은 사용하지 않는다.
- [ ] `docs/product/core-feature-priority.md`의 핵심 루프·5.1·5.4, `docs/product/full-product-plan.md`의 owner 저장/복구, `docs/engineering/p0-development-plan.md`의 활성 범위·route/API/auth 계약, `docs/design/p0-mobile-ui-spec.md`의 주인 저장 계약을 Google로 바꾼다. `docs/product/decision-log.md` 맨 위에 2026-07-21 결정을 추가해 2026-07-15 이메일 전용 결정과 `docs/specs/issue-92.md`의 이메일 구현 계약을 명시적으로 대체한다.

## 완료 기준

- [ ] `/auth/sign-in?playId={id}&returnTo=/me/plays/{id}`에는 Google CTA만 보이고 이메일 입력·매직 링크·카카오·네이버 문구가 없다.
- [ ] 유효한 완료 play에서 Google CTA가 Supabase의 Google authorize URL로 이동하며 owner-claim cookie와 PKCE verifier cookie를 설정한다.
- [ ] Google callback 성공 뒤 익명 owner의 모든 play가 Auth UID에 연결되고 요청한 내부 owner 화면으로 돌아온다.
- [ ] 잘못된·중복된 query, 외부 return URL, 미완료/다른 owner play, 누락·변조·만료 context, provider 취소는 외부 redirect나 소유권 우회 없이 실패한다.
- [ ] `/api/auth/magic-link`는 존재하지 않고 test-only magic-link endpoint는 production에서 404다.
- [ ] 친구·방문자 화면과 analytics/log에는 Google 계정 이메일·이름·프로필 사진이 추가되지 않는다.

## 테스트 계획

- [ ] `node --test tests/unit/owner-claim-context.test.mjs`
- [ ] `pnpm lint && pnpm typecheck`
- [ ] `GYEOP_E2E_LIVE=1` owner live E2E에서 Google authorize 시작 cookie/URL과 test-only Auth claim 회귀를 확인한다.
- [ ] 비-live mobile E2E에서 sign-in 화면의 단일 Google CTA, 내부 href, 이메일 UI 부재를 확인한다.
- [ ] `rg -n 'user_metadata|raw_user_meta_data|identity_data|console\\.' app/auth lib/http/auth-owner.ts` 결과로 Google 계정 속성·OAuth query logging을 추가하지 않았음을 확인한다.
- [ ] `scripts/task-harness pr 102`가 소유하는 `./scripts/run-ai-verify --mode full`
- [ ] 배포 뒤 실제 Chrome에서 Google 로그인 시작 → Google 계정 선택 화면 → `/auth/callback` 복귀를 smoke test한다.

## 분석과 관측성

- [ ] 신규 analytics 이벤트는 추가하지 않는다. 기존 owner claim과 공유 funnel 결과를 그대로 사용한다.
- [ ] OAuth code/state, Google UID·email·이름·사진, client ID·secret, owner capability를 app log·analytics에 남기지 않는다.
- [ ] 운영 확인은 Supabase Auth user/provider 상태와 callback 성공 여부만 사용하고 사용자 식별값을 작업 기록에 복사하지 않는다.

## 개인정보와 악용 방지

- [ ] owner claim은 same-browser HttpOnly capability, 10분 signed context, Supabase PKCE, callback의 fresh Auth actor 검증을 모두 통과해야 한다.
- [ ] `returnTo`는 `/me`와 정확한 `/me/plays/{id}`만 허용해 open redirect를 막고, query 중복·추가 key를 fail closed 처리한다.
- [ ] Google 계정 속성은 인증 식별에만 쓰며 친구·방문자 응답, 공유 링크, 프로필 표현으로 전달하지 않는다.
- [ ] test-only 이메일 endpoint는 production과 일반 development에서 닫고, 로컬 live E2E 명시 환경에서만 연다.

## 롤아웃과 복구

- [ ] migration은 없다. Google Cloud 앱을 프로덕션으로 게시하고 Supabase Google provider를 먼저 켠 뒤 코드를 배포하므로 새 CTA가 노출될 때 provider가 준비되어 있다.
- [ ] 배포 뒤 OAuth 시작 URL과 callback을 smoke test한다. 실패하면 코드 배포를 되돌리고 Supabase Google provider를 비활성화한다.
- [ ] client secret 노출 의심 시 Google Cloud에서 secret을 회전하고 Supabase 값을 즉시 갱신한다. 저장소에는 secret이 없어 Git rollback 대상이 아니다.

## 스펙 검토

Reviewer Agent: spec_review_102
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 외부 설정 블로커 없음. Google Cloud `GYEOP Web` OAuth client, 운영 callback URI, 프로덕션 audience와 Supabase Google provider 활성화를 확인했다.
- [ ] 자동 E2E는 외부 Google 계정 credential을 CI에 넣지 않는다. OAuth 시작 경계는 로컬 Supabase authorize redirect로 검증하고, callback/owner claim은 production에서 닫힌 test-only magic link로 기존 실제 Auth 회귀를 유지한다.
