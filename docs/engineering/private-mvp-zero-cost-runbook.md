# Private MVP `$0` 운영 runbook

Status: Active
결정일: 2026-07-22

## 1. 운영 목표와 비용 상한

현재 목표는 public production 운영이 아니라 주인 → 방문자 → 새 주인 → 재공유 루프의 비공개 재미 검증이다. 월 인프라 비용 hard cap은 정확히 `$0`다.

| 자원 | 허용 상태 | 월 비용 |
|---|---|---:|
| 기존 Render Free Web Service 1개 | active | `$0` |
| 기존 Supabase Free project 1개 | active | `$0` |
| public repository GitHub Actions | active | `$0` |
| 개발자 Mac의 local Supabase | active | `$0` |
| 합계 |  | `$0` |

Render가 제공하는 HTTPS URL을 그대로 사용한다. 유료 server, domain/TLS, paid plan, 별도 service/project와 새 provider는 만들지 않는다.

## 2. 활성 경로

- 배포: `render.yaml`의 기존 Render Free 단일 Docker service.
- HTTP 경계: container 안 HAProxy → `127.0.0.1:3100` Next server.
- 데이터: 기존 Supabase Free project. local/CI는 local Supabase를 사용한다.
- owner 연결: 익명 owner가 10장을 완료한 뒤 Google OAuth 계정 선택/동의 → `/auth/callback` → `/me`.
- 검증: public repository GitHub Actions, local focused test, `pnpm test:render-deploy`.

`app/api/auth/test-magic-link/route.ts`는 local live E2E 전용이고 production에서는 404다. 제품 email claim이나 SMTP readiness로 세지 않는다.

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

1. local에서 `pnpm test:render-deploy`와 필요한 focused test를 통과시킨다.
2. 기존 Render URL에서 홈, 팩 시작, 방문자 제출을 smoke한다.
3. 완료된 owner가 Google OAuth chooser/consent를 거쳐 `/auth/callback` 뒤 `/me`로 돌아오는지 확인한다. provider가 준비되지 않았으면 이메일 claim으로 우회하지 않고 공유를 중단한다.
4. health나 핵심 흐름이 실패하면 신규 모집을 중단한다. external rollback은 별도 사용자 승인을 받은 경우에만 Render의 직전 정상 deploy를 사용한다.

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

## 6. Downstream 이슈 해석

| 이슈 | `$0` private MVP 해석 |
|---|---|
| #29 | 별도 staging·개인 서버·custom SMTP·매직 링크를 구축하지 않는다. local Supabase, GitHub Actions와 기존 Render smoke로 다시 정의하거나 시작 전 body를 정합화하며 Google OAuth만 유지한다. |
| #30 | Resend outbox·5분 worker·email delivery는 비활성·연기한다. |
| #32 | 보관 정책 DB 로직과 local/CI 검증은 별도 재검토할 수 있지만 hosted scheduler와 hosted-data mutation은 자동 승인되지 않는다. production Cron 전제는 연기한다. |
| #33 | self-service account deletion, 미귀속/provider Auth deletion과 retry worker는 비활성·연기한다. |
| #35 | local/CI와 기존 Render Free에서 best-effort 성능을 검증한다. paid load environment와 production SLA는 요구하지 않는다. |
| #36 | 활성 Google OAuth·Render HTTP 경계와 inactive endpoint의 fail-closed 상태만 무료 환경에서 검증한다. email/Cron/deletion 경로를 켜지 않는다. |
| #37 | production release·secret·rollback runbook은 public production 재승인과 별도 예산 결정 전까지 연기한다. #8을 production 승인으로 사용하지 않는다. |

현재 GitHub #29 본문에는 personal server와 draft-claim magic link 전제가 남아 있다. 이 문서는 GitHub body·label을 바꾸지 않으며 #29 시작 전 `gyeop-issue-writer`와 task-harness 절차로 현재 SSOT에 맞춘다.

## 7. 중단 기준

다음 중 하나면 fail closed한다.

- 월 예상 인프라 비용이 `$0`을 넘음
- free plan 유지가 불가능하거나 billing 정보가 필요함
- Google OAuth chooser/callback → `/me`가 동작하지 않음
- Render/Supabase/GitHub 상태를 read-only로 확인할 수 없음
- secret 노출, 핵심 HTTP 경계 실패 또는 public production 기능의 우발적 활성화가 의심됨

중단 뒤에는 유료 전환이나 외부 설정 변경을 추정 승인하지 않는다. 사용자에게 별도 예산·권한 결정을 요청한다.
