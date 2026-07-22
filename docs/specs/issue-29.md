# Issue 29 구현 스펙: [운영] 무료 MVP 배포·migration·복구 검증 기반 구축

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/29

## 목표

현재 저장소가 월 `$0` private MVP 운영 경계에서 벗어나는 Render 유료·추가 hosted resource와 server secret build argument를 자동 거부하고, 기존 local Supabase·public GitHub Actions·Render Docker smoke를 한 runbook에서 재현·중단 판단할 수 있게 한다.

## 범위

- [ ] `render.yaml`이 정확히 하나의 `web` service만 선언하고 그 service가 기존 `gyeop-private-mvp`, Docker runtime, `plan: free`를 유지하는지 검증한다.
- [ ] `render.yaml`에 두 번째 service, Cron·worker·database 등 추가 hosted resource 또는 free가 아닌 plan이 들어오면 실패하는 저장소 검증을 추가한다.
- [ ] `Dockerfile`의 build `ARG`가 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 두 공개 값만 허용하고 `SUPABASE_SECRET_KEY`, `ORIGIN_PROXY_SECRET`, `RATE_LIMIT_SECRET`, account deletion key 등 server secret을 build 단계에 넣으면 실패하도록 한다. 기존 runtime environment 주입은 바꾸지 않는다.
- [ ] 검증 로직은 Node 표준 라이브러리만 사용하는 작은 script와 fixture 단위 테스트로 만들고, 기존 static/full verify에서 실행되게 연결한다.
- [ ] `docs/engineering/private-mvp-zero-cost-runbook.md`에 자동 검증 명령, local Supabase reset·검증 명령, Docker smoke의 기대 결과, read-only Render smoke와 모집 중단·승인 후 복구 순서를 실제 저장소 명령에 맞게 정리한다.
- [ ] 기존 Google OAuth 단일 owner 경로와 production의 `/api/auth/test-magic-link` 404 계약은 새 인증 코드를 만들지 않고 현행 E2E/full verify 증거로 확인한다.

## 제외 범위

- [ ] 별도 staging/production 환경, 개인 Linux server, systemd, 새 Render service·database·worker, 새 Supabase project를 만들지 않는다.
- [ ] Render/Supabase plan 변경, billing 정보 입력, 유료 domain/TLS, 새 provider 연결을 하지 않는다.
- [ ] custom SMTP, Resend, 이메일 매직 링크 제품 경로, 알림 outbox·worker를 구현하거나 활성화하지 않는다.
- [ ] Render Cron, host Cron, `/api/internal/cron`, self-service/provider Auth deletion worker를 구현하거나 활성화하지 않는다.
- [ ] Render deploy 재시작·rollback, provider/callback/secret 변경, hosted database/Auth user mutation을 수행하지 않는다.
- [ ] public production 승인, production SLA, 무료 tier cold start 제거, 자동 rollback 시스템을 이번 완료로 주장하지 않는다.
- [ ] 기존 owner·visitor 제품 화면, API, schema, migration, seed 데이터의 동작을 변경하지 않는다.

## SSOT

- GitHub issue #29 최신 본문
- `docs/product/core-feature-priority.md` 4.1 현재 private MVP 운영 경계와 5.1 Google OAuth 단일 owner 연결
- `docs/product/question-pack-spec.md`의 private 검증 활성화와 public beta 분리 계약
- `docs/product/decision-log.md`의 `2026-07-22 — private MVP 인프라 월 예산을 0달러로 고정` 결정
- `docs/engineering/private-mvp-zero-cost-runbook.md`
- `.codex/AGENTS.md`
- `AGENTS.md`
- `render.yaml`
- `Dockerfile`
- `package.json`
- `.github/workflows/ci.yml`
- `scripts/ai-verify`
- `tests/integration/render-deploy.test.sh`
- `app/api/auth/test-magic-link/route.ts`
- `lib/http/auth-owner.ts`
- `tests/e2e/owner-play.spec.ts`
- `tests/e2e/owner-auth-live-fixture.ts`

## 사용자 흐름 영향

- [ ] 주인 → 방문자 → 새 주인 → 재공유의 화면과 입력 흐름은 바뀌지 않는다.
- [ ] 주인은 계속 익명으로 10장을 완료한 뒤 `Google로 계속하기`를 통해서만 owner를 계정에 연결한다. 카카오·네이버·비밀번호·이메일 입력 경로는 추가하지 않는다.
- [ ] 무료 자원 또는 Google OAuth 핵심 경계가 실패하면 다른 로그인이나 유료 자원으로 우회하지 않고 신규 private MVP 모집과 공유를 중단한다.
- [ ] 운영자는 local/CI에서 동일 commit을 재현하고, 기존 Render URL은 non-secret read-only smoke로만 확인한다. 외부 rollback은 사용자가 별도로 명시 승인한 경우에만 직전 정상 deploy를 대상으로 수행한다.

## 디자인 영향

- [ ] 제품 화면, 문구, 반응형 레이아웃, 접근성 동작 변경은 없다.
- [ ] 별도 목업과 시각 QA는 필요하지 않다. QA는 저장소 정책 검증과 기존 HTTP·인증 계약에 집중한다.

## API와 데이터 영향

- [ ] 새 API route, schema, migration, table, RPC, storage bucket, Auth provider는 추가하지 않는다.
- [ ] local Supabase는 기존 migration과 `supabase/seed.sql`을 `pnpm supabase:reset`으로 재적용하며 hosted Supabase에는 쓰지 않는다.
- [ ] `app/api/auth/test-magic-link/route.ts`는 local live E2E fixture로만 남고 `NODE_ENV=production` 또는 live fixture 비활성 상태에서 404를 반환한다.
- [ ] Render server secret은 기존처럼 runtime environment로만 주입한다. build stage에는 두 `NEXT_PUBLIC_*` 값 외의 environment argument를 전달하지 않는다.
- [ ] 새 검증 script는 repository file을 읽기만 하며 network, provider API, secret store, database를 호출하지 않는다.

## 구현 계획

- [ ] `scripts/verify-zero-cost-mvp.mjs`에 현재 저장소와 문자열 fixture 모두 검증할 수 있는 순수 검증 함수를 두고 CLI 실행 시 `render.yaml`과 `Dockerfile`을 읽는다. YAML 전체 기능을 재구현하거나 새 package를 설치하지 않고, 현재 Blueprint의 service 항목·type·name·runtime·plan과 Docker `ARG` 선언이라는 제한된 계약만 fail closed로 검사한다.
- [ ] 검증기는 Render service가 1개가 아니거나, 허용된 기존 `web`/Docker/free service와 다르거나, 추가 hosted resource 종류가 있거나, Docker build `ARG` 이름이 두 공개 Supabase 값의 정확한 집합과 다르면 원인이 드러나는 오류로 실패한다.
- [ ] `tests/unit/zero-cost-mvp.test.mjs`에서 현재 파일 통과와 최소 변형 fixture 실패를 확인한다: 두 번째 web service, Cron service, paid plan, database resource, server secret `ARG`, 허용 공개 `ARG` 누락·추가.
- [ ] `package.json`에 focused 검증 명령을 추가하고 기존 `test`, `format`, `format:check` 경로에 새 script/test를 포함한다. 새 dependency는 추가하지 않는다.
- [ ] `scripts/ai-verify`의 static 검증에서 저장소 `$0` 검증 CLI를 실행해 public GitHub Actions와 exact-head full verify가 같은 정책을 적용하게 한다.
- [ ] `docs/engineering/private-mvp-zero-cost-runbook.md`의 검증·복구 절차에 focused `$0` 명령, local Supabase reset, `pnpm test:render-deploy`, production magic-link 404/Google-only 기존 검증, read-only smoke와 외부 mutation 금지를 명시한다.
- [ ] `render.yaml`, `Dockerfile`, 인증 구현, migration에는 현행 계약을 바꿀 필요가 확인되지 않는 한 손대지 않는다.

## 완료 기준

- [ ] 현재 `render.yaml`의 기존 Render Free Docker web service 1개는 검증을 통과한다.
- [ ] 추가 service·Cron·worker·database, 기존 service의 paid plan·다른 runtime/name, 두 공개 값 이외의 Docker build `ARG`를 넣은 fixture는 각각 실패한다.
- [ ] 새 검증은 network와 외부 mutation 없이 실행되고 public GitHub Actions static lane 및 exact-head full verify에 포함된다.
- [ ] local Supabase migration·seed 재현 명령과 Docker smoke 명령이 runbook에 있으며, Docker smoke는 home `200`, animation JSON `200`, origin이 일치하는 mutation API의 기존 기대 응답 `204`를 요구한다.
- [ ] 사용자 노출 owner 로그인은 Google 하나라는 기존 E2E와 production에서 test magic-link endpoint가 404라는 기존 계약이 유지된다.
- [ ] runbook이 read-only 확인과 외부 변경을 구분하고, 실패 시 `신규 모집 중단 → local/CI 재현 → 사용자 승인 시에만 직전 정상 Render deploy rollback` 순서를 기록한다.
- [ ] 월 예상 인프라 비용은 `$0`이며 새 provider, billing 정보, 유료 plan, 별도 staging/production, SMTP, hosted Cron을 요구하지 않는다.
- [ ] `./scripts/run-ai-verify --mode full`이 exact clean HEAD에서 통과한다.

## 테스트 계획

- [ ] `pnpm test:zero-cost-mvp` 또는 동등한 focused 명령으로 현재 repository 통과와 드리프트 fixture 실패를 확인한다.
- [ ] `pnpm test:secrets`로 committed env·CI에 server secret 값이 들어가지 않는 기존 계약을 확인한다.
- [ ] `pnpm test:render-deploy`로 Docker build, HAProxy → loopback Next 경계, home `200`, animation `200`, mutation API `204`를 확인한다.
- [ ] `pnpm supabase:start`, `pnpm supabase:reset`, `pnpm test:db`, `pnpm supabase:lint`는 local Supabase에만 실행한다. full verify가 이 순서를 소유하므로 PR 단계의 exact-head full verify와 중복 실행하지 않는다.
- [ ] 기존 Playwright owner 경로에서 `Google로 계속하기` 단일 CTA, Supabase authorize 요청의 `provider=google`, 비-live/production test magic-link 404 계약을 확인한다.
- [ ] `git diff --check`와 변경 파일의 format check를 실행한다.
- [ ] `scripts/task-harness pr 29`가 exact clean HEAD에서 소유하는 `./scripts/run-ai-verify --mode full` 1회를 통과하고, 같은 SHA의 GitHub Actions named `verify`가 성공해야 merge한다.

## 분석과 관측성

- [ ] 새 analytics event, log payload, dashboard, metric은 추가하지 않는다.
- [ ] 검증 성공 시 허용된 resource 개수·plan과 공개 build argument 이름만 출력하고, secret 값·UID·email·OAuth code/state는 출력하지 않는다.
- [ ] 실패 시 파일과 위반한 선언 종류를 non-secret 오류로 출력해 CI에서 원인을 찾을 수 있게 한다.
- [ ] 기존 Render URL 확인 기록은 날짜, plan/상태, HTTP 성공·실패만 runbook에 남기는 best-effort evidence이며 SLA로 해석하지 않는다.

## 개인정보와 악용 방지

- [ ] repository 검증은 local file read-only이며 owner/visitor 답변과 hosted user data에 접근하지 않는다.
- [ ] OAuth token, callback code/state, Supabase key 값, owner capability, email을 검증 출력·문서·fixture에 복사하지 않는다.
- [ ] server secret은 Docker build layer와 GitHub Actions workflow에 넣지 않고 runtime secret 경계에만 둔다.
- [ ] Google OAuth가 동작하지 않으면 이메일 매직 링크나 운영자 복구로 우회하지 않고 공유를 중단한다.
- [ ] external provider 설정과 hosted data 변경은 이 이슈의 승인 범위가 아니며, 필요한 상태가 없으면 fail closed한다.

## 롤아웃과 복구

- [ ] 새 검증을 static/full verify에 먼저 연결하고 기존 Blueprint와 Dockerfile이 통과하는지 확인한 뒤 PR로 병합한다. feature flag와 data migration은 필요 없다.
- [ ] 검증이 실패한 PR은 hosted 배포 전에 merge를 막고, 유료·추가 resource 선언 또는 secret build argument를 제거해 마지막 통과 상태로 복구한다.
- [ ] 기존 Render read-only smoke가 실패하면 신규 private MVP 모집을 중단하고 같은 commit을 local Supabase와 Docker smoke에서 재현한다.
- [ ] external deploy rollback은 자동화하지 않는다. 사용자가 해당 외부 변경을 별도로 승인한 경우에만 Render의 직전 정상 deploy로 되돌린다.
- [ ] free tier가 사라지거나 billing/upgrade가 필요하면 자동 전환하지 않고 기능 또는 private MVP를 중단한 뒤 새 예산·권한·public production 결정을 요청한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- [ ] YAML 전체 parser를 새로 만들지 않는 제한된 검증은 현재 `render.yaml` 형태만 지원한다. Blueprint 구조를 의도적으로 바꿀 때는 `$0` 불변식을 유지하는 fixture와 verifier를 같은 PR에서 갱신해야 한다.
- [ ] repository 검증은 선언 드리프트를 막지만 Render/Supabase의 실제 plan 변경이나 provider 장애를 증명하지 못한다. 실제 상태는 runbook의 non-secret read-only 확인으로만 다루며 외부 수정은 별도 승인 대상이다.
- [ ] 현재 구현을 시작하기 전에 해결해야 할 제품 미결정 사항과 외부 블로커는 없다. 월 `$0`, Google OAuth only, private MVP 중단 기준은 SSOT에서 확정됐다.
