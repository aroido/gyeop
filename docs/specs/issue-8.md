# Issue 8 구현 스펙: [운영] 무료 private MVP 실행 경계 확정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/8

## 목표

월 인프라 예산 hard cap `$0` 안에서 기존 Render Free private MVP, Supabase Free, public repository GitHub Actions와 local Supabase만 사용하는 실행 경계를 SSOT로 확정하고, 이메일·Cron·계정 삭제·public production 기능은 구성된 것처럼 주장하지 않고 명시적으로 비활성·연기한다.

## 범위

- [ ] `docs/product/decision-log.md`에 2026-07-22 `$0 private MVP` 결정을 추가해 기존 이슈 #8·#29의 개인 Linux 서버, 별도 staging/production, custom SMTP와 draft-claim 매직 링크 전제를 현재 단계에서 대체한다.
- [ ] `docs/product/core-feature-priority.md`와 `docs/engineering/p0-development-plan.md`에 현재 활성 배포가 기존 Render Free private MVP 하나뿐이며, owner 저장은 Google OAuth이고 public signup은 없다는 경계를 반영한다.
- [ ] root `README.md`의 배포 smoke에서 stale `share-before-email-claim` 문구를 제거하고 기존 Google OAuth 계정 선택/동의 → `/auth/callback` → `/me` 확인으로 정합화한다.
- [ ] `docs/engineering/private-mvp-zero-cost-runbook.md`를 추가해 허용 자원, 금지 자원, 배포·검증·중단·복구 절차와 downstream 이슈 해석을 한곳에 기록한다.
- [ ] 허용 자원은 기존 Render Free web service, 기존 Supabase Free project, public repository GitHub Actions, 개발자 Mac의 local Supabase로 고정한다. provider가 주는 Render HTTPS URL을 사용하고 유료 domain/TLS를 추가하지 않는다.
- [ ] 현재 owner claim은 `/auth/google` → `/auth/callback`의 Google OAuth PKCE와 `lib/http/auth-owner.ts`의 기존 경계를 그대로 유지한다.
- [ ] 기존 Render/Supabase/GitHub 설정은 plan·연결 상태·공개 여부를 read-only로 확인하고, 날짜와 비밀값 없는 결과만 runbook에 남긴다.
- [ ] 무료 한도가 사라지거나 현재 자원으로 MVP를 유지할 수 없으면 유료 전환하지 않고 해당 기능 또는 private MVP 모집을 중단하는 fail-closed 기준을 기록한다.
- [ ] #29·#30·#32·#33·#35·#36·#37이 `$0 private MVP`에서 수행 가능한 범위와 연기 범위를 명시한다.

## 제외 범위

- [ ] 유료 server, domain, TLS, Supabase/Render/Resend upgrade 또는 새 유료 provider를 생성·구매·연결하지 않는다.
- [ ] 별도 staging/production service·Supabase project, 개인 Linux host, systemd, host Cron, Render Cron job을 만들지 않는다.
- [ ] custom SMTP나 Resend를 연결하지 않고 이메일 알림을 발송하지 않는다.
- [ ] 이메일 매직 링크 owner claim, public email/OTP signup, self-service account deletion, provider Auth deletion worker를 활성화하지 않는다.
- [ ] `/api/internal/cron`, notification outbox/worker, Auth deletion route/worker, 신규 schema·migration을 구현하지 않는다.
- [ ] public production rollout, production SLA, 법률·backup·privacy release gate 완료를 선언하지 않는다.
- [ ] 기존 외부 계정의 plan 변경, secret 입력·회전, provider 설정 변경, 배포 재시작과 hosted data mutation을 수행하지 않는다. read-only 확인은 허용하되 모든 external mutation은 별도 사용자 명시 승인이 필요하다.

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/product/data-retention-and-deletion-policy.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `docs/specs/issue-7.md`
- `docs/specs/issue-12.md`
- `docs/specs/issue-14.md`
- `docs/specs/issue-102.md`
- `README.md`
- `render.yaml`
- `Dockerfile`
- `ops/render-entrypoint.sh`
- `app/auth/google/route.ts`
- `app/auth/callback/route.ts`
- `lib/http/auth-owner.ts`
- `app/api/auth/test-magic-link/route.ts`
- `tests/integration/render-deploy.test.sh`
- 현재 GitHub 이슈 #29 본문: https://github.com/aroido/gyeop/issues/29
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- [ ] 주인 → 방문자 → 새 주인의 기존 private MVP 흐름은 바뀌지 않는다.
- [ ] 주인은 익명으로 질문팩을 완료하고 공유 직전에 Google OAuth로 저장한다. 이메일 입력·매직 링크·독립 public signup UI는 추가하지 않는다.
- [ ] 방문자는 계속 무가입으로 참여하며 이메일 알림을 받거나 요구받지 않는다.
- [ ] 이메일 알림, self-service account deletion, provider Auth cleanup과 public production은 `준비됨`이 아니라 `비활성·연기` 상태로 사용자에게 노출하지 않는다.

## 디자인 영향

- [ ] 화면, 컴포넌트, 문구, 목업 변경은 없다.
- [ ] 비활성 기능의 CTA나 준비 중 문구도 추가하지 않는다.

## API와 데이터 영향

- [ ] route, schema, migration, RLS, storage 변경은 없다.
- [ ] `app/api/auth/test-magic-link/route.ts`는 local live E2E 전용 경계로만 남고 production에서는 계속 404다. 이를 제품 매직 링크나 SMTP 준비 증거로 취급하지 않는다.
- [ ] `/api/internal/cron`, Resend client, notification worker, Auth Admin deletion 호출은 추가하거나 활성화하지 않는다.
- [ ] 기존 Render·Supabase secret은 읽거나 문서에 복사하지 않고, 현재 Google OAuth claim과 application data 경계도 변경하지 않는다.

## 구현 계획

1. `docs/product/decision-log.md` 맨 위에 월 예산 `$0`, 기존 무료 자원만 재사용, Google OAuth 유지, 유료 인프라·email delivery·Cron·public signup·account deletion·public production 비활성 결정을 기록한다. 이 결정이 이슈 #8·#29의 개인 서버/custom SMTP/draft-claim 전제를 현재 private MVP에 한해 대체한다고 명시한다.
2. `docs/product/core-feature-priority.md`의 현재 private MVP release boundary에 Render Free·Supabase Free·Google OAuth만 활성임을 추가하고 email notification, public signup, self-service/provider Auth deletion, production Cron과 public production은 후속 재승인 전 inactive임을 고정한다.
3. `docs/engineering/p0-development-plan.md`의 환경·배포·이슈 경계를 현재 실행 상태와 후보 설계로 분리한다. Linux/systemd/Cron/SMTP/Resend 설명은 미래 production 후보 참고로 보존하되 현재 `$0` MVP의 설치·완료 조건처럼 읽히지 않게 한다.
4. root `README.md`의 배포 smoke 절차에서 `share-before-email-claim`과 이메일 claim 표현을 제거한다. 실제 활성 계약대로 익명 owner가 10장을 완료한 뒤 Google OAuth 계정 선택/동의 → `/auth/callback` → `/me`로 복귀하는 smoke와 provider 미준비 시 fail-closed 조건을 적는다.
5. `docs/engineering/private-mvp-zero-cost-runbook.md`에 아래 표와 절차를 작성한다.
   - 월 비용: Render Free `$0`, Supabase Free `$0`, public-repo GitHub Actions `$0`, local Supabase `$0`, 합계 `$0`
   - 활성 경로: Render provider HTTPS → 기존 HAProxy/loopback Next 경계, Supabase Free, Google OAuth
   - 비활성 경로: custom SMTP, Resend, email notification, public signup, self-service/provider Auth deletion, hosted Cron, public production
   - read-only 상태 확인과 secret 비노출 규칙
   - Render deploy smoke, local/CI 검증, free-tier 상실 시 중단, 직전 정상 Render deploy 복구
6. runbook의 downstream 표를 다음처럼 고정한다.
   - `#29`: 별도 staging·개인 서버·custom SMTP·매직 링크 구축으로 진행하지 않는다. local Supabase, GitHub Actions와 기존 Render의 read-only/smoke 검증으로 재정의하거나 시작 전 issue body를 정합화한다. Google OAuth만 유지한다.
   - `#30`: Resend outbox·5분 worker·email delivery는 비활성·연기한다. `$0` 단계에서는 구현·배포하지 않는다.
   - `#32`: 보관 정책의 DB 로직과 local/CI 검증은 별도 재검토할 수 있지만 hosted scheduler와 hosted-data mutation은 자동 승인되지 않는다. production Cron 전제 부분은 연기한다.
   - `#33`: self-service account deletion, 미귀속/provider Auth deletion과 retry worker는 비활성·연기한다. 현재 private MVP가 production deletion 기능을 제공한다고 주장하지 않는다.
   - `#35`: local/CI와 기존 Render Free에서 모바일·API·DB 성능을 best-effort로 검증하되 paid load environment나 production SLA를 요구하지 않는다.
   - `#36`: 현재 활성 Google OAuth·Render HTTP 경계와 비활성 endpoint의 fail-closed 상태만 무료 환경에서 검증한다. disabled email/Cron/deletion 경로를 활성화하지 않는다.
   - `#37`: production release·secret·rollback runbook은 public production 재승인과 별도 예산 결정 전까지 연기한다. #8 병합을 production 승인으로 사용하지 않는다.
7. 현재 GitHub #29 본문은 과거 personal-server/magic-link 전제를 가진다고 runbook에 기록한다. 이 문서 PR은 GitHub body·label을 직접 변경하지 않으며, #29 시작 전 `gyeop-issue-writer`/task-harness 절차로 현재 SSOT에 맞춰 정합화한다.
8. 문서 정합성, repository secret scan, Render Docker integration test와 full verify를 실행한다. 외부 provider 확인은 read-only이며 missing/paid-only 항목은 생성하지 않고 `비활성`으로 기록한다.

## 완료 기준

- [ ] decision log, core priority, p0 development plan과 runbook이 월 인프라 hard cap `$0`와 허용 자원 네 가지를 동일하게 기록한다.
- [ ] 현재 실행 배포는 기존 Render Free private MVP 하나이며 별도 staging/production·개인 서버·Render Cron·유료 domain/TLS가 없다고 명시된다.
- [ ] Google OAuth owner claim이 유일한 활성 계정 연결 경로이고 과거 draft-claim 매직 링크 문구가 현재 요구사항으로 남지 않는다.
- [ ] root `README.md`의 배포 smoke가 stale `share-before-email-claim`을 포함하지 않고 Google OAuth chooser/callback → `/me` 경로와 provider 미준비 시 중단 조건을 정확히 설명한다.
- [ ] custom SMTP, Resend delivery, email notification, public signup, self-service/provider Auth deletion, production Cron과 public production이 모두 `비활성·연기`로 표시된다.
- [ ] `app/api/auth/test-magic-link/route.ts`가 production email 기능이 아니라 production 404인 local E2E fixture임이 명시된다.
- [ ] read-only external inspection과 금지된 plan 변경·서비스 생성·secret 입력·배포·hosted data mutation의 경계가 명확하다.
- [ ] downstream #29·#30·#32·#33·#35·#36·#37 각각의 수행/연기 경계와 #29 body 정합화 절차가 runbook에 있다.
- [ ] 비용 합계가 정확히 `$0`이고 payer·billing approval·external credential이 필요한 항목은 완료 조건에서 제거되지 않고 비활성으로 남는다.
- [ ] free tier 상실·한도 부족·필수 기능의 유료화 시 자동 upgrade 없이 해당 기능 또는 private MVP 모집을 중단하는 절차가 있다.
- [ ] 이 PR만으로 production beta, 삭제 SLA, email SLA 또는 public rollout을 승인했다는 문구가 없다.

## 테스트 계획

- [ ] `scripts/task-harness spec-check docs/specs/issue-8.md`
- [ ] `rg`로 활성 `$0` 자원, Google OAuth, 비활성 email/Cron/deletion/public-production 문구와 stale draft-claim/personal-server 활성 문구를 대조한다.
- [ ] `rg -n 'share-before-email-claim|email claim|magic link|Google|/auth/callback|/me' README.md`로 stale email claim 제거와 Google OAuth 배포 smoke를 검수한다.
- [ ] `pnpm test:secrets`
- [ ] `pnpm test:render-deploy`
- [ ] `node --test tests/unit/owner-claim-context.test.mjs`
- [ ] 기존 Render URL과 provider plan의 read-only smoke/status 확인. 변경·재배포·secret 입력은 하지 않는다.
- [ ] `scripts/task-harness pr 8`이 소유하는 `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- [ ] 신규 analytics event는 없다.
- [ ] 무료 private MVP 운영 확인은 Render deploy/health, Supabase Free 사용량, GitHub Actions 결과만 사용한다.
- [ ] 이메일·Cron·Auth deletion SLA metric은 기능이 비활성이므로 수집·달성했다고 주장하지 않는다.
- [ ] free tier 한도 접근이나 provider 정책 변경이 확인되면 비용을 올리지 않고 신규 모집 또는 해당 기능을 중단한다.

## 개인정보와 악용 방지

- [ ] Google OAuth code/state, UID·email, provider credential과 기존 secret을 문서·로그·승인 증거에 남기지 않는다.
- [ ] standalone public signup과 email OTP를 열지 않아 issue #8의 direct OTP residual 경로를 현재 제품 경로로 만들지 않는다.
- [ ] production에서 test magic-link endpoint가 404인 기존 이중 gate를 유지한다.
- [ ] account deletion/provider cleanup이 비활성인 한 public production으로 승격하거나 production deletion 보장을 표시하지 않는다.

## 롤아웃과 복구

- [ ] 문서 전용 PR이며 route, migration, external provider, Render service 상태를 변경하지 않는다.
- [ ] main 반영 뒤 기존 Render Auto-Deploy가 문서 변경 때문에 runtime 기능을 바꾸지는 않는다. smoke가 실패하면 직전 정상 Render deploy로 복구하되 이 이슈에서 재배포를 수행하지 않는다.
- [ ] free tier가 종료되거나 유료 결제가 요구되면 service/provider를 upgrade하지 않고 private MVP를 중단한 뒤 별도 예산·public-production 결정을 요청한다.
- [ ] future production 설계를 다시 활성화하려면 새 제품 결정, 월 예산, external mutation 권한, provider/secret owner와 release gate를 별도 승인해야 한다.

## 스펙 검토

Reviewer Agent: critic_8_free
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 현재 Render·Supabase·GitHub 계정의 free plan과 연결 상태는 구현 시 read-only로 재확인해야 한다. 확인 실패는 유료 생성으로 보완하지 않고 비활성/blocked로 기록한다.
- [ ] 기존 이슈 #8과 #29 본문에는 personal Linux server, custom SMTP와 draft-claim magic link의 과거 조건이 남아 있다. 이 스펙과 새 decision log가 현재 `$0 private MVP` 해석을 우선하며, #29 시작 전 body를 별도 승인된 GitHub workflow로 정합화해야 한다.
- [ ] self-service/provider Auth deletion과 automatic retention scheduling이 비활성이므로 이 단계는 public production 요건을 충족하지 않는다. public rollout은 계속 차단한다.
- [x] 배포 대상 충돌은 기존 Render Free private MVP 하나로 해결했다. 개인 Linux server나 Render 확장은 하지 않는다.
- [x] 비용·결제 충돌은 월 hard cap `$0`, 기존 free resource만 사용, paid/external mutation 금지로 해결했다.
- [x] Auth 충돌은 Google OAuth 단일 owner claim 유지와 production test-magic-link 404로 해결했다. 과거 draft-claim magic-link 완료 조건은 현재 단계에서 supersede한다.
