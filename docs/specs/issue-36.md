# Issue 36 구현 스펙: [안전] 무료 MVP 활성 경계 독립 보안 QA

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/36

## 목표

새 provider, secret, hosted worker 또는 유료 자원을 추가하지 않고 현재 활성화된 GYEOP 무료 MVP의 권한·token·rate limit·로그 비노출 경계를 한 명령으로 독립 점검한다. 로컬/CI 정책과 기존 Render Free의 읽기 전용 smoke를 같은 구조화 결과 계약으로 묶는다.

## 범위

- [ ] 활성 인증인 Google OAuth 시작, callback, owner logout Route를 확인한다.
- [ ] 공개 pack, owner play/profile/share, visitor response/withdrawal Route를 확인한다.
- [ ] 기존 data-access, HTTP boundary, zero-cost verifier를 SSOT로 조합한다.
- [ ] 비활성 email provider, application Cron, account-delete endpoint/worker가 계속 비활성인지 확인한다.
- [ ] 정확한 local fixture 또는 Render Free origin에 고정 HEAD/GET security-header smoke를 제공한다.
- [ ] 결과는 response body와 secret 없이 고정 JSON schema와 exit code로 출력한다.

## 제외 범위

- [ ] Resend/custom SMTP 발송과 전달률 검증
- [ ] hosted application Cron/dispatcher와 account deletion Auth Admin worker 실행
- [ ] 새 환경 변수·provider·DB·서비스·유료 penetration test
- [ ] production 데이터 변경과 self-hosted staging 운영 rehearsal

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/engineering/private-mvp-zero-cost-runbook.md
- docs/engineering/p0-development-plan.md
- AGENTS.md

## 사용자 흐름 영향

- [ ] 제품 UI와 owner→visitor→new-owner 흐름은 바꾸지 않는다.
- [ ] 이미 공개된 홈과 pack Route에는 HEAD/GET만 보내며 로그인을 시도하지 않는다.

## 디자인 영향

- [ ] 없음. 제품 UI 변경이 아니므로 Lazyweb/목업 작업도 없다.

## API와 데이터 영향

- [ ] Route, DB schema, migration, storage, auth 설정 변경 없음.
- [ ] production POST/PUT/PATCH/DELETE와 DB mutation 없음.
- [ ] stdout에는 pass/fail, finding count/code, HTTP status/header 존재 여부만 두고 response body, cookie, URL query, capability, 환경 변수 값은 넣지 않는다.

## 구현 계획

- [ ] `scripts/verify-private-mvp-security.mjs`에 저장소 gate 조합, exact target 파서, 고정 read-only request plan, 구조화 결과를 구현한다.
- [ ] data access는 `collectRepositoryPolicyFiles()`와 `verifyDataAccessFiles()`, HTTP boundary는 `verifyRepository()`, 배포 선언은 `verifyZeroCostMvp()`를 직접 재사용한다.
- [ ] 현재 활성 핵심 Route로 아래 정확한 파일을 모두 요구한다.
  - `app/auth/google/route.ts`
  - `app/auth/callback/route.ts`
  - `app/api/auth/logout/route.ts`
  - `app/api/packs/[slug]/route.ts`
  - `app/api/plays/route.ts`
  - `app/api/plays/[playId]/route.ts`
  - `app/api/plays/[playId]/answers/[cardId]/route.ts`
  - `app/api/plays/[playId]/complete/route.ts`
  - `app/api/plays/[playId]/links/route.ts`
  - `app/api/links/[linkId]/route.ts`
  - `app/api/links/[linkId]/rotate/route.ts`
  - `app/api/invites/[publicId]/metadata/route.ts`
  - `app/api/invites/[publicId]/responses/route.ts`
  - `app/api/responses/[id]/route.ts`
  - `app/api/responses/[id]/answers/[cardId]/route.ts`
  - `app/api/responses/[id]/continue/route.ts`
  - `app/api/responses/[id]/submit/route.ts`
  - `app/api/responses/withdraw/route.ts`
  - `app/api/me/plays/route.ts`
  - `app/api/me/profile/route.ts`
- [ ] 아래 exact dormant Route 파일은 없어야 한다.
  - `app/api/internal/cron/route.ts`
  - `app/api/internal/cron/[task]/route.ts`
  - `app/api/account/delete/route.ts`
  - `app/api/me/account/delete/route.ts`
  - `app/api/auth/account-delete/route.ts`
- [ ] 아래 exact dormant worker 파일은 없어야 한다.
  - `scripts/cron-dispatcher.mjs`
  - `scripts/notification-worker.mjs`
  - `scripts/account-delete-worker.mjs`
  - `scripts/auth-deletion-worker.mjs`
- [ ] package dependency `resend`, `nodemailer`, `@sendgrid/mail`을 금지한다.
- [ ] `.env.example`의 server-only secret 선언은 빈 값만 허용하고 CI workflow의 secret job-env 주입을 금지한다.
- [ ] `tests/unit/private-mvp-security.test.mjs`와 `test:security`, `test:security:render` package script를 추가하고 기본 unit/formatter 목록에 연결한다.

기존 verifier 결과 매핑은 고정한다. finding 배열이 비어 있지 않으면 `findingCount`는 배열 길이, `codes`는 `policy_findings` 하나다. verifier가 throw하면 `findingCount: 1`, `codes: ["verification_error"]`다. 정상은 `findingCount: 0`, 빈 `codes`다. 원래 finding text나 예외 message는 JSON에 복사하지 않는다.

## 완료 기준

- [ ] 기본 명령은 저장소 matrix를 실행하고 원격 smoke는 `not_run`으로 명시한다.
- [ ] CLI는 인자 없음 또는 정확히 `--base-url <approved-origin>`만 허용한다.
- [ ] 승인 origin은 `http://127.0.0.1:3120`과 `https://gyeop-private-mvp.onrender.com`뿐이며 임의 host/path/query/hash/credential/port는 network 전에 거부한다.
- [ ] request plan은 `HEAD /`, `GET /api/packs/old-friend` 두 건뿐이고 body, credential, redirect, referrer를 보내지 않는다.
- [ ] 두 response는 status 200과 CSP, HSTS, Referrer-Policy, X-Content-Type-Options를 요구한다.
- [ ] JSON top-level은 정확히 `schemaVersion`, `target`, `checks`, `outcome`이다.
- [ ] checks는 `dataAccess`, `httpBoundary`, `zeroCost`, `activeSurfaces`, `inactiveFeatures`, `repositorySecrets`, `renderReadOnly`를 포함한다.
- [ ] `dataAccess`, `httpBoundary`, `zeroCost`, `activeSurfaces`, `inactiveFeatures`, `repositorySecrets`는 정확히 `{ passed: boolean, findingCount: number, codes: string[] }`다. inventory 검사는 각 누락/금지 항목에 path 또는 dependency를 붙인 safe code 하나를 넣고 `findingCount === codes.length`를 지킨다.
- [ ] `renderReadOnly`는 정확히 `{ passed, status, requestCount, codes, responses }`다. status는 `not_run|passed|failed`, requestCount는 0 또는 2다. response는 정확히 `{ method, path, status, headers, passed }`, headers는 정확히 `{ contentSecurityPolicy, strictTransportSecurity, referrerPolicy, xContentTypeOptions }` boolean만 가진다.
- [ ] 기존 verifier finding은 위 매핑에 따라 text를 버리고 `policy_findings` 또는 `verification_error`만 노출한다.
- [ ] 모든 check가 통과할 때만 `outcome: pass`, 실패는 exit 1, 잘못된 CLI/target은 exit 2다.
- [ ] P0/P1 보안 finding 0과 exact-head full verify를 요구한다.
- [ ] Render의 두 public request는 proxy/security-header 배포 표본일 뿐이다. 인증이 필요한 owner/visitor 권한은 production에서 probe하지 않고 기존 data-access/HTTP verifier, unit/integration/E2E와 full verify로만 판정한다.

## 테스트 계획

- [ ] target allowlist와 CLI 인자 거부 unit test
- [ ] 고정 HEAD/GET, body-free, timeout/failure/header 판정 unit test와 `127.0.0.1:3120` fixture
- [ ] active Route 누락, forbidden route/worker, email dependency, non-empty secret, CI secret 주입의 fail-closed unit test
- [ ] `pnpm test:security`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
- [ ] 승인된 Render Free origin의 exact HEAD/GET smoke 1회
- [ ] `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- [ ] 새 analytics event, log sink, 외부 scanner, dashboard 없음.
- [ ] 결과 JSON은 각 check의 boolean/count/code만 포함하고 사용자 데이터와 HTTP body를 저장하지 않는다.

## 개인정보와 악용 방지

- [ ] 요청 allowlist와 고정 method/path가 SSRF·임의 endpoint·hosted mutation을 막는다.
- [ ] `credentials: omit`, `redirect: error`, `referrerPolicy: no-referrer`, `cache: no-store`, 15초 timeout을 사용한다.
- [ ] 검증 예외는 secret 값이나 source 내용을 출력하지 않고 safe code/finding count로 정규화한다.

## 롤아웃과 복구

- [ ] 앱 런타임과 DB 변경이 없어 배포 순서나 data rollback이 없다.
- [ ] 회귀 시 security CLI, unit test, package script, runbook 변경만 PR revert한다.
- [ ] Render smoke는 point-in-time evidence이며 CI required 원격 gate나 SLA로 사용하지 않는다.

## 스펙 검토

Reviewer Agent: /root/critic_35
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 기존 verifier가 finding을 반환하면 gate는 부분 성공으로 낮추지 않고 전체 fail한다.
- [ ] 외부 네트워크 실패와 header 계약 실패는 같은 smoke fail로 수렴하되 body나 provider 내부 상태를 추정하지 않는다.
- [ ] GitHub Actions nightly schedule은 무료 CI 회귀 검증이며 application Cron 활성화로 분류하지 않는다.
