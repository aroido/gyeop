# Issue 8 구현 스펙: [운영] Auth·이메일·Cron 실행 환경과 용량·비용 확정

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/8

## 목표

production beta를 열기 전에 staging·production의 Linux 실행 환경, Auth SMTP·Resend·Cron·삭제 worker 용량, 월 비용, secret 소유권과 중단 기준을 환경별 수치와 검증 증거로 승인하고 하나의 운영 문서에 고정한다.

## 범위

- [ ] `docs/engineering/production-beta-operations.md`를 추가해 환경별 host·hostname·Unix user/group·port·release/cache/log 경로, Supabase project, provider team, 담당자와 비용을 비밀값 없이 기록한다.
- [ ] staging·production을 별도 hostname·Unix user·port·root-owned 환경 파일·release directory·Supabase project로 분리하고, 같은 host를 쓸 경우 환경별 cgroup·disk quota와 production resource floor의 숫자형 승인값을 기록한다.
- [ ] 기존 `ops/http-boundary/` artifact를 설치 기준으로 사용해 TLS reverse proxy의 canonical header, 환경별 proxy-origin credential, IPv4·IPv6 owner-match loopback firewall, 재부팅 복원 순서와 회전·복구 절차를 승인한다.
- [ ] 환경별 `NEXT_PUBLIC_*` 별도 build, pre-build `NEXT_DEPLOYMENT_ID`, canonical output digest, immutable release·cache 경계, 단일 `next start` systemd service, 75초 drain과 rollback 계약을 실제 host inventory에 매핑한다.
- [ ] 환경별 5분·일일 Cron schedule, UTC daemon, root-owned Node wrapper, shared non-blocking lock, 65초 fetch abort·총 75초 process bound, `CRON_SECRET` 설치·회전·복구와 외부 path 거부 책임을 승인한다.
- [ ] Supabase 기본 SMTP를 staging·production에서 사용하지 않고 custom SMTP provider·Auth 전용 domain/from·project-wide email 한도·사용자별 cooldown·CAPTCHA 또는 동등한 authoritative abuse boundary를 환경별로 승인한다.
- [ ] 활성 owner claim은 현재 SSOT대로 Google OAuth를 유지한다. 이메일 Auth 용량에는 production-beta 후보인 existing-user-only 계정 삭제 재인증과 publishable key를 통한 direct OTP residual 요청만 포함하고, 폐기된 draft-claim 매직 링크 경로를 되살리지 않는다.
- [ ] public OTP direct call이 app의 context rate gate를 우회할 수 있는 잔여 spam·미귀속 Auth 생성 위험에 대해 환경별 예상량·허용 최대량·관측 책임자·beta 중단 기준을 수치로 승인한다.
- [ ] owner 삭제와 미귀속 Auth 삭제의 reason별 rolling 5분 신규·실패·retry·stale·즉시-call crash·permit denied·call-window-expired·prepare-response-loss·중복 invocation·carry-in을 산정하고, 공통 rolling 10회/5분·active 2 permit 안에서 `owner_request` reserved/priority, `unclaimed_auth` minimum progress와 빈 quota borrowing을 승인한다.
- [ ] Resend notification의 환경별 team/domain/from, test recipient 제한, 실제 team RPS·일/월 quota·승인 REST cap·월 비용을 기록하고 Auth SMTP와 team을 분리할지 shared headroom을 둘지 승인한다.
- [ ] notification의 5분 P95 신규, due retry, stale/ambiguous replay, carry-in, provider failure·timeout/reset·429 가정을 분리 산정하고 missed run을 포함한 두 window에서 신규 합계 15 이하, retry/replay 합계 5 이하와 20건/45초/10분 first-attempt 조건을 증명한다.
- [ ] quota header와 typed 429별 pause·경보·upgrade/reset 확인·operator CAS resume/redeploy·beta 중단 책임을 승인하고 실제 용량 70% 또는 provider/유입 가정 변경 시 재승인 담당자와 기한을 고정한다.
- [ ] 모든 server secret의 환경별 소유자, 저장 위치, reader/writer, 회전 주기, redaction, drain query와 retire·재배포 책임을 기록하되 raw secret과 provider credential은 저장소나 증거에 남기지 않는다.
- [ ] `docs/engineering/p0-development-plan.md`의 미결정 운영 blocker를 새 승인 문서 링크로 바꾸고, `docs/product/decision-log.md`에는 provider 격리, beta admission ceiling·중단 기준처럼 제품 출시 경계를 바꾸는 승인만 요약 기록한다.
- [ ] 승인값·담당자·redacted evidence가 하나라도 비어 있으면 이슈와 이메일 알림·계정 삭제·production 배포 후속 작업을 blocked로 유지한다.

## 제외 범위

- [ ] `/api/internal/cron`, notification worker, Auth deletion worker, 계정 삭제 route·UI 또는 신규 DB schema·migration을 구현하지 않는다.
- [ ] owner claim을 이메일 매직 링크로 되돌리거나 Google OAuth·현재 비공개 MVP 제품 흐름을 변경하지 않는다.
- [ ] provider credential, secret 원문, 사용자 email·UID, raw OTP·callback·lease proof를 저장소나 승인 증거에 기록하지 않는다.
- [ ] staging 배포·migration·rollback rehearsal은 #29, notification 구현은 후속 notification 이슈, 계정 삭제 구현은 후속 account-deletion 이슈가 담당한다. 이 이슈는 그 작업들이 사용할 승인값과 계정·권한 준비까지만 소유한다.
- [ ] production 트래픽 활성화, public beta 출시 승인, 법률 의견서, provider backup 30일 파기 증빙, privacy 연락 채널 개통을 완료 처리하지 않는다.
- [ ] 현재 Render Free private MVP 서비스의 plan·URL·Auto-Deploy를 production-beta Linux host 계약으로 간주하거나 변경하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/product/data-retention-and-deletion-policy.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `ops/http-boundary/README.md`
- `docs/specs/issue-7.md` (승인 일일 peak·2배 fixture와 50%/70% 재검토 계약)
- `docs/specs/issue-14.md` (proxy header·origin credential·firewall 운영 계약)
- `docs/specs/issue-102.md` (Google OAuth 단일 owner claim으로 이메일 claim 계약을 대체한 구현 기록)
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- [ ] 비공개 재미 검증의 주인 → 방문자 → 새 주인 흐름과 Render 배포는 바뀌지 않는다.
- [ ] 주인은 계속 익명으로 10장을 완료한 뒤 Google OAuth로 저장·공유하며, 이메일 draft-claim CTA나 입력 화면은 추가하지 않는다.
- [ ] production beta 후보에서 계정 삭제를 요청한 기존 주인만 same-browser purpose·원 UID·freshness가 검증된 이메일 재인증을 사용한다. 새 사용자 생성과 recovery-only owner 복구는 허용하지 않는다.
- [ ] notification이 후속 구현으로 활성화될 때 첫 응답·새 관계·세 번째 응답이 겹쳐도 source response당 일반 알림 job은 최대 1개이며, 알림은 현재 핵심 CTA나 방문자 제출을 막지 않는다.
- [ ] 승인·외부 구성·release gate가 하나라도 미완료면 이메일 알림·계정 삭제·미귀속 Auth cleanup·production beta는 사용자에게 노출하지 않는다.

## 디자인 영향

- [ ] 화면·컴포넌트·목업·사용자 문구 변경은 없다.
- [ ] 계정 삭제 재인증과 알림 UI는 후속 구현 이슈에서 현재 mobile/accessibility 계약에 맞춰 다루며, 이 PR은 운영 문서와 external configuration evidence만 추가한다.

## API와 데이터 영향

- [ ] route, schema, model, migration, RLS, storage 변경은 없다.
- [ ] 후속 `/api/internal/cron`은 loopback 전용 `CRON_SECRET`과 고정 `X-Gyeop-Cron-Schedule` 두 분기만 허용하고 public proxy adapter를 재사용하지 않는 기존 계약을 따른다.
- [ ] 후속 Auth 삭제 route와 모든 Cron invocation은 DB의 rolling 5분 최대 10 permit·active 최대 2 lease를 공유한다. 이 이슈는 그 상한을 변경하지 않고, 승인 유입·실패 가정이 SLA 안에 들어오는지 계산한다.
- [ ] 후속 notification worker는 신규 15건, retry/stale/ambiguous replay 5건의 window class와 45초 worker 예산을 변경하지 않고 승인 provider cap이 이를 만족하는지 검증한다.
- [ ] Auth와 notification에 사용하는 email 주소·UID·provider proof는 승인 문서의 수치 근거나 로그에 복사하지 않는다. 환경별 project/team 식별자는 secret이 아닌 경우에만 기록한다.

## 구현 계획

1. `docs/engineering/production-beta-operations.md`에 다음 표를 먼저 만든다. 모든 표는 staging/production 열, 승인자·승인일·evidence 위치 열을 가지며 `TBD`, 빈 값, 범위형 값이 남으면 완료하지 않는다.
   - host/DNS/TLS inventory와 월 고정비
   - Unix user/group/port/path/file owner·mode inventory
   - systemd hardening, cgroup 숫자, disk quota·production free-space floor, build 위치
   - Supabase project/custom SMTP/Auth domain/from/rate/cooldown/CAPTCHA와 provider 비용
   - Resend team/domain/from/RPS/daily/monthly quota/REST cap/staging recipient/비용
   - Cron daemon/timezone/정확한 두 schedule/wrapper·lock·env path/운영자
   - secret owner/storage/reader/writer/rotation/drain/rollback matrix
2. 현재 repository 배포 경계를 그대로 재사용한다. private MVP의 `render.yaml`, `Dockerfile`, `ops/render-entrypoint.sh`는 현황으로만 기록하고, production-beta Linux 기준은 `ops/http-boundary/README.md`와 `scripts/render-http-boundary-ops.mjs`의 inventory·HAProxy·nftables artifact에 매핑한다. 새 proxy/firewall 생성기를 만들지 않는다.
3. 환경별 app user·proxy user·UID·port·hostname inventory를 검증한 뒤 proxy-origin credential의 exact 32-byte padding 없는 base64url 생성, root-owned `0640` origin-group 파일, current/next 회전과 단계별 rollback을 redacted checklist로 기록한다. canonical 다섯 header와 다른 UID의 IPv4·IPv6 direct/slow/malformed denial, reboot persistence evidence 위치를 함께 지정한다.
4. 환경·commit SHA·public-config fingerprint로 deployment ID를 build 전에 결정하고 환경별 build artifact를 만드는 절차를 기록한다. build 뒤 canonical digest 계산 → cache 연결 → manifest 기록 → 같은 규칙 재계산 순서, immutable `0755` release/current 권한, cache-only `ReadWritePaths`, atomic symlink 전환·health gate·75초 drain·직전 호환 release rollback을 host path에 대입한다.
5. cron daemon·UTC를 확인하고 5분 분기와 일일 분기의 정확한 UTC schedule을 승인한다. 두 분기가 공유하는 환경별 non-blocking lock, root-owned wrapper의 process 내부 native fetch secret 주입, 65초 abort, 70초 TERM+5초 KILL, 잔존 process 0과 `disable → secret 교체 → app restart → 두 분기 smoke → enable` 회전·복구를 명령 원문에 secret을 넣지 않는 체크리스트로 작성한다.
6. Supabase dashboard에서 환경별 custom SMTP, Auth 전용 domain/from, project email limit, per-user cooldown, CAPTCHA/abuse 설정을 확인하고 기본 SMTP 미사용 증거를 남긴다. 활성 owner claim은 Google OAuth임을 명시하고, 기존 사용자 account-delete reauth와 valid-challenge direct OTP residual만 Auth email capacity에 센다.
7. staging의 별도 test recipient와 기존 Auth 사용자로 `shouldCreateUser:false` 재인증 발송 가능성을 provider/API 경계에서 확인한다. same-browser purpose·원 UID·freshness와 recovery-only no-new-user의 실제 app smoke는 route 구현 후 후속 이슈가 수행하며, 이 이슈에서 미구현 route를 만들거나 성공했다고 기록하지 않는다.
8. public publishable key로 missing/invalid challenge는 발송 0, valid challenge는 provider 제한 안에서 발송·미귀속 Auth 생성 가능하다는 residual을 기록한다. 환경별 예상·최대 5분/일 생성량, 관측 metric, 책임자, beta 중단 수치를 승인하고 app DB에 raw email 사본을 두지 않는 후속 cleanup 입력과 연결한다.
9. Auth deletion 계산표에 reason별 신규 peak와 provider failure, due retry, stale lease, 즉시 call crash, permit-denied carry-in, `not_called_call_window_expired` wasted permit/attempt, `prepare_outcome_unknown` committed permit/attempt/lease, duplicate invocation을 각각 넣는다. 합계가 rolling 10/5분·active 2를 넘지 않으면서 owner 24시간 SLA, unclaimed Auth 24시간 SLA, owner reserved/priority, unclaimed minimum progress, 빈 quota borrowing을 만족하는 정수값만 승인한다.
10. Resend Settings Usage에서 환경별 실제 team RPS·daily/monthly quota와 plan 비용을 확인한다. Auth SMTP와 notification REST를 별도 team/credential로 격리하거나, shared team이면 승인 Auth email burst를 제외한 REST cap을 정하고 합산 headroom을 계산한다.
11. notification 계산표에 source response당 최대 1 job coalescing을 적용하고 신규, due retry, stale/ambiguous replay, 각 carry-in, provider failure·timeout/reset·typed/unknown 429를 분리한다. missed run을 포함한 연속 두 window에서 신규 합계 15 이하, retry/replay 합계 5 이하이고 승인 REST cap으로 20건을 45초 안에 호출 준비하면서 event 후 10분 내 첫 시도 95%를 만족하는지 staging fixture 입력으로 검수한다.
12. `rate_limit_exceeded`는 `Retry-After` same-attempt 재개, daily/monthly quota와 unknown 429는 provider pause·경보·미호출 claim 회수·operator CAS resume/redeploy로 처리하는 책임표를 작성한다. 실제 용량 70%, 유입/provider 한도 변경 시 Product Owner와 Operations Owner가 영업일 2일 안에 quota·상한·schedule·비용을 재승인하도록 한다.
13. `ACCOUNT_DELETE_REAUTH_KEYRING`은 환경 분리와 add-reader → switch-writer → 10분 cookie TTL+clock skew 및 recovery/receipt drain 0 → receipt prune → retire 순서, `NOTIFICATION_FINGERPRINT_KEYRING`은 모든 참조 `terminal_at+24시간` drain 0 → retire·재배포 순서를 기록한다. `ORIGIN_PROXY_SECRET`, `CRON_SECRET`, Supabase SMTP credential, `RESEND_API_KEY`, `EMAIL_FROM`도 환경별 소유자·저장 위치·회전 주기와 rollback을 기록한다.
14. `docs/engineering/p0-development-plan.md`의 OPS blocker를 새 문서의 승인 상태와 연결하고, `docs/product/decision-log.md`에는 provider team 분리 여부, 수치형 beta admission ceiling·중단 기준과 승인 책임처럼 제품 출시 조건에 해당하는 결과만 요약한다. raw inventory·비용 계정 식별자·secret은 decision log에 복제하지 않는다.
15. 문서 정합성 검색, secret scan, `scripts/task-harness spec-check docs/specs/issue-8.md`, repository full verify를 실행한다. external evidence는 환경별 승인표에 hash/날짜/보관 위치만 남기고 사용자 데이터나 credential을 복사하지 않는다.

## 완료 기준

- [ ] staging·production host, hostname, TLS, Unix user/group, port, path, Supabase project, 운영 책임자와 월 비용이 모두 실제 값으로 승인되고 빈 칸이 없다.
- [ ] 환경별 cgroup·disk quota 숫자와 production resource/free-space floor가 승인되며 staging stress/build가 production health를 침범하지 않는 probe 책임·증거 위치가 있다.
- [ ] exact 32-byte base64url proxy-origin current/next 회전, canonical single-value header, duplicate/comma-list/누락/불일치 거부, IPv4·IPv6 cross-UID denial·reboot persistence, immutable release/digest/cache 경계, non-root systemd hardening, 75초 drain·rollback의 환경별 checklist가 승인된다.
- [ ] 환경별 32-byte 이상 `CRON_SECRET`, root-owned `0640` 환경 파일, app과 같은 Unix user의 argv 비노출 Node wrapper, 정확한 두 schedule, 65초 abort·75초 process bound·shared lock·잔존 process 0, 회전·복구 책임이 승인된다.
- [ ] PR 검증에는 Cron을 설치하지 않으며 staging SLA 증거는 #29의 격리 staging service·crontab에서만 취득한다는 권한·비용 경계가 기록된다.
- [ ] Supabase 기본 SMTP가 아닌 환경별 custom SMTP, Auth domain/from, project-wide email limit, per-user cooldown, CAPTCHA/abuse boundary, secret owner가 승인된다.
- [ ] 현재 owner 저장 경로가 Google OAuth임이 유지되고 이메일 용량표가 폐기된 draft-claim 매직 링크를 세지 않는다. account-delete reauth와 direct OTP residual만 별도 행으로 계산된다.
- [ ] staging test recipient와 기존 사용자에 대한 `shouldCreateUser:false` provider 발송 준비가 확인되고, app의 same-browser purpose·UID·freshness smoke는 후속 account-deletion route 구현 전에는 통과로 기록하지 않는다.
- [ ] direct OTP residual의 예상·최대 미귀속 Auth 생성량, 관측 책임자와 수치형 beta 중단 기준이 승인된다.
- [ ] Auth deletion의 모든 신규·failure·retry·stale·crash·permit-denied·wasted-permit·prepare-response-loss·duplicate·carry-in 항목과 reason별 reserved/minimum/borrowing이 rolling 10/5분·active 2 안에서 각 24시간 SLA를 만족한다.
- [ ] Resend 환경별 domain/from, staging recipient 제한, production volume·RPS·daily/monthly quota·REST cap·월 비용과 quota 70% 재검토 기준이 승인된다.
- [ ] notification의 두 window 신규 합계가 15 이하, retry/stale/ambiguous replay 합계가 5 이하이고 20건/45초·10분 first-attempt SLA를 동시에 만족하는 수치·근거·승인자가 있다.
- [ ] Auth SMTP와 notification REST가 별도 provider team/credential이거나, shared team의 승인 Auth burst+notification fast-response가 실제 team RPS 이하라는 headroom 증거가 있다.
- [ ] typed 429·unknown 429별 pause, claim 회수, 경보, upgrade/reset, CAS resume/redeploy, 기한 내 복구 실패와 beta 중단 책임이 승인된다.
- [ ] 모든 secret의 환경별 owner·storage·reader/writer·rotation 주기와 account-delete/fingerprint drain·retire·재배포 책임이 기록되고 repository secret scan이 깨끗하다.
- [ ] 승인 문서, p0 개발 기준, decision log가 현재 Google owner claim과 production-beta inactive 경계를 일관되게 설명한다.
- [ ] 현행 법률 서면 검토, provider backup 파기·restore 증거, privacy 연락 채널이 별도 release gate로 남아 있으며 이 이슈만으로 production beta를 열지 않는다.

## 테스트 계획

- [ ] `scripts/task-harness spec-check docs/specs/issue-8.md`
- [ ] `rg`로 환경별 승인표의 빈 값·`TBD`·`미정`, 폐기된 draft-claim 이메일 문구, 수치·담당자·증거 누락을 확인한다.
- [ ] `pnpm test:secrets`
- [ ] `node scripts/verify-http-boundary.mjs`로 재사용하는 proxy/firewall artifact 계약을 확인한다.
- [ ] staging/production dashboard·host의 redacted evidence checklist로 custom SMTP, Auth/Resend quota, Cron/UTC, systemd/cgroup/disk, TLS/proxy/firewall, secret file owner/mode를 수동 검수한다.
- [ ] 계산표 검수로 Auth deletion `<=10/5분`, `active<=2`, notification 신규 `<=15`, retry/replay `<=5`, 20건/45초, first-attempt 10분, provider RPS·daily/monthly headroom을 확인한다.
- [ ] `scripts/task-harness pr 8`이 소유하는 `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- [ ] 신규 제품 analytics event는 추가하지 않는다.
- [ ] Auth deletion은 reason별 pending/retry/stale/overdue, 5분 permit 사용량, active lease, denied·expired·ambiguous prepare 결과를 allowlisted count와 error code로만 본다.
- [ ] notification은 신규/retry/replay queue depth·oldest due, first-attempt latency P95, REST RPS, `ratelimit-*`, `Retry-After`, daily/monthly quota header와 typed 429를 환경별로 관측한다.
- [ ] Auth email은 provider send count·rate/cooldown/CAPTCHA 거부량과 미귀속 registration count만 집계하며 email·UID·OTP·callback URL은 관측 기록에 남기지 않는다.
- [ ] 실제 값이 승인 capacity의 50%에 닿으면 같은 영업일 경보 검토, 70% 또는 가정 변경 시 영업일 2일 안에 Product Owner·Operations Owner가 재승인한다.

## 개인정보와 악용 방지

- [ ] Supabase CAPTCHA·project-wide email limit·per-user cooldown을 authoritative abuse boundary로 취급하고 app의 5/hour context gate만으로 direct OTP를 막았다고 주장하지 않는다.
- [ ] valid-challenge direct OTP가 이메일 발송과 미귀속 Auth 생성을 일으킬 수 있음을 residual risk로 승인하고, no-draft session의 owner mutation 거부와 정책 grace 뒤 cleanup은 후속 구현 gate로 유지한다.
- [ ] SMTP·Resend·proxy-origin·Cron·keyring credential은 환경별 root/provider secret store에만 두고 repo, shell argv, crontab, stdout/stderr, app/proxy log와 evidence에 남기지 않는다.
- [ ] raw email·UID·응답 내용·lease proof·fingerprint를 계산표나 운영 로그에 넣지 않고 count·고정 reason/error code만 사용한다.
- [ ] keyring reader는 승인된 drain query가 0이 되기 전에 retire하지 않으며 DB cleanup은 key material을 생성·변경·삭제하지 않는다.

## 롤아웃과 복구

- [ ] 문서 PR과 external configuration 준비만 수행하므로 runtime route·migration·feature flag rollout은 없다. 승인 문서가 병합돼도 production beta는 자동 활성화되지 않는다.
- [ ] 적용 순서는 staging 계정·host inventory 승인 → secret slot과 최소 권한 설치 → custom SMTP/Resend 설정 → proxy/firewall/systemd/Cron checklist → capacity fixture → production 적용 승인이다.
- [ ] proxy-origin, Cron secret, account-delete keyring, notification fingerprint keyring은 각 승인된 current/next 또는 reader/writer rotation 순서와 단계별 복구를 따른다. secret 노출 의심 시 해당 provider/환경 credential을 폐기·회전하고 redacted incident evidence를 남긴다.
- [ ] 배포 실패는 직전 호환 release·cache로 `current`를 되돌리고 service 재시작·health gate를 통과시킨다. Cron handler 호환이 불명확하면 schedule을 disable/update하고 두 분기를 smoke한 뒤 missed work를 reconciliation한다.
- [ ] quota/unknown 429는 provider를 pause하고 미호출 claim만 회수한다. 승인된 upgrade/reset 확인 뒤 operator가 CAS resume하며, 기한 내 복구하지 못하면 typed failure·beta 중단 계약을 적용한다.
- [ ] 수치나 provider 계약이 바뀌면 문서 값을 조용히 덮어쓰지 않고 decision log에 변경 이유·승인자·날짜를 추가한 뒤 staging 재검수한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- [ ] Linux host: 사용할 서버, staging/production 동일 host 여부, OS, CPU/RAM/disk, 접속 권한, root/deploy/Operations Owner, 월 비용이 결정되지 않았다.
- [ ] 현재 비공개 MVP는 Render Free Docker 서비스지만 이슈 #8은 유료 가능성이 있는 개인 Linux 서버를 staging/production 전제로 한다. production beta도 개인 서버로 갈지, 현재 Render 계열 배포 계약을 확장할지 사용자 승인이 없으며 두 환경을 같은 것으로 간주할 수 없다.
- [ ] DNS/TLS: staging·production hostname/domain, DNS·인증서 발급/갱신 책임자와 비용이 결정되지 않았다. Render의 private MVP URL은 이 결정을 대신하지 않는다.
- [ ] resource: 환경별 `MemoryMax`, `TasksMax`, `CPUQuota`, production `MemoryMin`, `CPUWeight`, `IOWeight`, release/cache/log disk quota, production free-space floor와 staging build 위치가 결정되지 않았다.
- [ ] schedule: 일일 Cron의 정확한 UTC 시각, cron daemon 운영자, 장애 경보·on-call 연락 채널이 결정되지 않았다. 5분 schedule은 `*/5 * * * *`로 고정한다.
- [ ] Supabase: staging/production project, plan·비용, custom SMTP provider credential, Auth domain/from, project email limit, per-user cooldown, CAPTCHA 설정과 dashboard owner가 준비·승인되지 않았다.
- [ ] Resend: staging/production team, verified domain/from, separate/shared team 선택, 실제 RPS·daily/monthly quota, REST cap, test recipient 제한, 월 예상 발송량·비용 상한과 billing owner가 결정되지 않았다.
- [ ] Auth abuse: valid-challenge direct OTP의 환경별 예상·최대 미귀속 Auth 생성량, owner 삭제 요청 peak, account-delete reauth 최대 burst, 관측 책임자와 beta 중단 수치가 결정되지 않았다.
- [ ] Auth deletion capacity: reason별 신규·failure·retry·stale·crash·permit-denied·call-window-expired·prepare-response-loss·duplicate·carry-in 수치와 owner reserved/unclaimed minimum/borrowing 비율이 결정되지 않았다.
- [ ] notification capacity: production 유입, provider failure·timeout/reset·429 비율, 신규/retry/replay P95·carry-in, shared Auth headroom과 70% 도달 판단 기준의 실제 수치·근거가 결정되지 않았다.
- [ ] secret operations: 각 환경의 실제 secret 저장소, 설치·회전 owner, 회전 주기, break-glass 접근자, drain query 실행·검증·재배포 담당자가 결정되지 않았다.
- [ ] release ownership: Product Owner, Operations Owner, Security Reviewer의 실제 이름·연락 채널·승인일과 영업일 2일 재승인 담당이 지정되지 않았다.
- [ ] 개인 서버, domain/TLS, Supabase 유료 plan, SMTP/Resend upgrade를 포함한 모든 유료 지출은 월 상한과 결제 주체에 대한 사용자 명시 승인이 필요하다. 이 스펙이나 문서 PR은 구매·계정 연결 권한을 부여하지 않으며 승인 전 이슈를 blocked로 유지한다.
- [ ] provider backup 30일 파기 증빙, 격리 restore 재삭제 drill, 현행 한국 법률 서면 검토, 공개 privacy 연락 채널은 이 이슈 밖의 production release blocker로 남아 있다.
- [ ] 이슈 본문의 `draft-claim 매직 링크` 완료 조건은 2026-07-21 Google OAuth 단일 owner claim 결정과 충돌한다. 구현 전에 이슈 설명을 현재 SSOT에 맞게 정합화하되, 제품에서 이메일 owner claim을 다시 도입한다는 별도 결정이 없는 한 이 스펙은 Google OAuth를 우선한다.
