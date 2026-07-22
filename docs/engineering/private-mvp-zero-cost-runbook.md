# Private MVP `$0` 운영 runbook

Status: Active
결정일: 2026-07-22

## 1. 운영 목표와 비용 상한

현재 목표는 public production 운영이 아니라 주인 → 방문자 → 새 주인 → 재공유 루프의 비공개 재미 검증이다. 월 인프라 비용 hard cap은 정확히 `$0`다.

| 자원                             | 허용 상태 | 월 비용 |
| -------------------------------- | --------- | ------: |
| 기존 Render Free Web Service 1개 | active    |    `$0` |
| 기존 Supabase Free project 1개   | active    |    `$0` |
| public repository GitHub Actions | active    |    `$0` |
| 개발자 Mac의 local Supabase      | active    |    `$0` |
| 합계                             |           |    `$0` |

Render가 제공하는 HTTPS URL을 그대로 사용한다. 유료 server, domain/TLS, paid plan, 별도 service/project와 새 provider는 만들지 않는다.

## 2. 활성 경로

- 배포: `render.yaml`의 기존 Render Free 단일 Docker service.
- HTTP 경계: container 안 HAProxy → `127.0.0.1:3100` Next server.
- 데이터: 기존 Supabase Free project. local/CI는 local Supabase를 사용한다.
- owner 연결: 익명 owner가 10장을 완료한 뒤 Google OAuth 계정 선택/동의 → `/auth/callback` → `/me`.
- 검증: public repository GitHub Actions, local focused test, `pnpm test:render-deploy`.

저장소 선언 경계는 `pnpm test:zero-cost-mvp`로 확인한다. 이 명령은 `render.yaml`의 기존 free Docker web service 하나, Dockerfile의 공개 build argument 두 개, 알려진 server-secret `ARG`·`ENV` 부재와 `.dockerignore`의 `.env`·`.env.*` 제외를 검사한다. 실제 provider plan·billing·청구액, 모든 Docker build layer 내용이나 live Google OAuth 성공을 증명하는 명령은 아니다.

`app/api/auth/test-magic-link/route.ts`는 local live E2E 전용이고 production에서는 404다. 제품 email claim이나 SMTP readiness로 세지 않는다.

### 2.1 local 보관 cleanup 검증

`public.run_local_retention_cleanup()`은 고정 category와 batch만 처리하는 service-role DB 함수다. 현재는 local Supabase와 public CI 검증용이며 hosted scheduler, HTTP route와 운영 DB 자동 실행에 연결하지 않는다.

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm exec supabase test db supabase/tests/retention_cleanup.test.sql --local
pnpm supabase:lint
```

pgTAP fixture는 transaction rollback 안에서 cleanup을 실행한다. 실제 local 개발 데이터를 물리 정리하는 수동 호출도 삭제 작업이므로 별도 확인 뒤 trusted local DB session에서만 수행한다. Hosted Supabase 호출, Cron 연결과 운영 데이터 변경은 이 명령의 승인 범위가 아니다.

## 3. 비활성·연기 경로

- 별도 staging/production과 개인 Linux server
- Render Cron, host Cron과 `/api/internal/cron` 운영
- custom SMTP, Resend와 email notification delivery
- standalone public email/OTP signup
- self-service account deletion, 미귀속/provider Auth deletion worker
- public production rollout과 production SLA

future 설계가 문서나 spec에 남아 있어도 별도 제품 결정, 월 예산, external mutation 권한, provider/secret owner와 release gate가 승인되기 전에는 활성 기능이 아니다.

## 4. 외부 상태 확인과 변경 경계

기존 Render·Supabase·GitHub의 free plan, 연결 상태와 공개 repository 여부는 read-only로 확인할 수 있다. 기록에는 확인 날짜, plan 이름, 성공/실패만 남기고 secret, UID, email, OAuth code/state를 복사하지 않는다.

다음은 read-only 확인이 아니며 사용자 명시 승인 없이는 하지 않는다.

- service/project/provider 생성·삭제 또는 plan 변경
- billing 정보 입력과 유료 upgrade
- Auth provider, callback, environment variable과 secret 변경
- 배포 재시작·rollback을 포함한 external deployment mutation
- hosted database/Auth user 변경·삭제

필수 상태가 없거나 paid-only이면 생성하지 않고 해당 기능을 `비활성` 또는 `blocked`로 기록한다.

## 5. 배포 확인과 복구

1. local에서 `pnpm test:zero-cost-mvp`, `pnpm test:secrets`, `pnpm test:render-deploy`를 통과시킨다.
2. local Supabase에서 `pnpm supabase:start`, `pnpm supabase:reset`, `pnpm test:db`, `pnpm supabase:lint`로 현재 migration·seed를 재현한다. PR completion은 `./scripts/run-ai-verify --mode full`과 같은 SHA의 public GitHub Actions `verify`가 담당한다.
3. 기존 Render URL에서는 non-secret GET/HEAD로 홈과 정적 asset의 HTTP 상태만 확인한다. 팩 생성, 방문자 제출, OAuth 시작·callback, hosted database/Auth write는 이 smoke에서 수행하지 않는다.
4. Google 단일 CTA, local Supabase authorize의 `provider=google`, production 조건의 E2E magic-link 404는 local/CI 계약으로 확인한다. 실제 hosted Google OAuth 성공은 별도 승인된 확인 없이는 수행하거나 완료 증거로 주장하지 않는다.
5. read-only 상태나 local/CI 핵심 흐름이 실패하면 신규 모집을 중단한다. 이메일 claim이나 유료 자원으로 우회하지 않는다. External rollback은 별도 사용자 승인을 받은 경우에만 Render의 직전 정상 deploy를 사용한다.

Render Free cold start와 Supabase Free pause는 production SLA가 아니다. free tier가 사라지거나 한도가 부족해지면 자동 upgrade하지 않고 해당 기능 또는 private MVP 모집을 중단한다.

### 5.1 2026-07-22 read-only 확인 기록

- GitHub repository visibility: `PUBLIC`
- latest deployment environment: `main - gyeop-private-mvp`
- deployed commit: `f89d3b2ac7207dd9744d5fbde9055f81c797a7e4`
- deployment state: `success`
- provider URL: `https://gyeop-private-mvp.onrender.com`
- home smoke: HTTP `200`, cold-start 응답 약 `28.1s`
- latest `main` GitHub Actions: `success`

이 기록은 당시 상태를 확인한 non-secret evidence일 뿐 상시 가용성이나 응답 시간 SLA가 아니다. 약 28.1초 cold start를 허용하는 best-effort private 검증으로만 사용한다.

### 5.2 무료 성능 smoke

별도 staging·부하 SaaS·RUM 없이 기존 Node와 Playwright만 사용한다. 측정 CLI는 전용 local production origin과 기존 Render Free origin만 받으며 `/`와 공개 질문팩을 `HEAD`/`GET`으로만 읽는다.

```bash
pnpm test:performance

# local Supabase와 production build가 준비된 터미널
pnpm start --port 3120
node scripts/verify-private-mvp-performance.mjs --base-url http://127.0.0.1:3120

# 이미 존재하는 무료 Render를 읽기 전용으로 확인
node scripts/verify-private-mvp-performance.mjs --base-url https://gyeop-private-mvp.onrender.com
```

순서는 cold HEAD 1회, 빈 browser context의 Fast 4G·4× CPU 홈 LCP 3회, warm 홈 GET 3회, 공개 pack GET 20회다. stdout JSON top-level은 `schemaVersion`, `target`, `profile`, `budgets`, `coldStart`, `homeLcp`, `warmHome`, `packRead`, `outcome`으로 고정한다. body·cookie·token·header value는 기록하지 않는다.

Render Free의 cold start는 35초까지 별도 허용하고 warm 표본과 합치지 않는다. 홈 LCP 중앙값 2.5초와 pack GET p95 1초는 private MVP 회귀 smoke 예산이며 production SLA가 아니다. 원격 변동 결과는 required CI에 넣지 않고 실패 시 유료 전환이나 provider 설정 변경을 자동 수행하지 않는다.

## 6. Downstream 이슈 해석

| 이슈 | `$0` private MVP 해석                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #29  | 본문과 reviewed spec을 local Supabase, public GitHub Actions, 기존 Render GET/HEAD smoke와 Google OAuth 단일 경로에 맞췄다. 별도 staging·개인 서버·custom SMTP·매직 링크는 구축하지 않는다. |
| #30  | Resend outbox·5분 worker·email delivery는 비활성·연기한다.                                                                                                                                  |
| #32  | 보관 정책 DB 로직과 local/CI 검증은 별도 재검토할 수 있지만 hosted scheduler와 hosted-data mutation은 자동 승인되지 않는다. production Cron 전제는 연기한다.                                |
| #33  | self-service account deletion, 미귀속/provider Auth deletion과 retry worker는 비활성·연기한다.                                                                                              |
| #35  | local/CI와 기존 Render Free에서 best-effort 성능을 검증한다. paid load environment와 production SLA는 요구하지 않는다.                                                                      |
| #36  | 활성 Google OAuth·Render HTTP 경계와 inactive endpoint의 fail-closed 상태만 무료 환경에서 검증한다. email/Cron/deletion 경로를 켜지 않는다.                                                 |
| #37  | production release·secret·rollback runbook은 public production 재승인과 별도 예산 결정 전까지 연기한다. #8을 production 승인으로 사용하지 않는다.                                           |

## 7. 중단 기준

다음 중 하나면 fail closed한다.

- 월 예상 인프라 비용이 `$0`을 넘음
- free plan 유지가 불가능하거나 billing 정보가 필요함
- 별도 승인된 live 확인에서 Google OAuth chooser/callback → `/me`가 동작하지 않음
- Render/Supabase/GitHub 상태를 read-only로 확인할 수 없음
- secret 노출, 핵심 HTTP 경계 실패 또는 public production 기능의 우발적 활성화가 의심됨

중단 뒤에는 유료 전환이나 외부 설정 변경을 추정 승인하지 않는다. 사용자에게 별도 예산·권한 결정을 요청한다.
