# Issue 7 구현 스펙: [기획] 공유 링크 만료와 데이터 보관·완전 삭제 정책 확정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/7
Approval proposal: https://github.com/aroido/gyeop/issues/7#issuecomment-5016965438
Product Owner approval record: https://github.com/aroido/gyeop/issues/7#issuecomment-5017543427

## 목표

제품 책임자가 승인한 보수적 잠정안을 공개·1:1 링크, owner·visitor·Auth·알림·분석 데이터의 단일 보관·삭제 SSOT로 확정하고 후속 schema·cleanup·운영 이슈가 그대로 구현할 수 있는 수치 계약을 남긴다.

## 범위

- [x] `docs/product/data-retention-and-deletion-policy.md`를 canonical SSOT로 추가한다.
- [x] 링크 만료·비활성·재발급, 데이터별 `eligible_at`, 운영 DB hard-delete 상한, backup 잔존 상한을 표로 정한다.
- [x] 익명 owner, visitor draft/submitted/withdrawn, Auth registration·owner deletion receipt·permit, notification tombstone·payload/key reader의 순서를 정한다.
- [x] 일일 만료 peak, 공정성, 경보·catch-up·capacity 재검토, 문의 SLA와 제품·운영 책임을 수치로 정한다.
- [x] `core-feature-priority.md`, `decision-log.md`, `p0-development-plan.md`의 미결정 문구를 canonical 정책 링크와 확정 상태로 바꾼다.
- [x] `full-product-plan.md`의 P0 미결정 항목과 `core-funnel-events.md`의 raw event 보관 계약도 같은 canonical 정책으로 연결한다.
- [x] 문서 정합성 검수와 저장소 전체 검증을 수행한다.

## 제외 범위

- [x] cleanup worker, RPC, migration, schema와 production 기존 데이터 migration 구현은 #32·#33이 담당한다.
- [x] 실제 서버·Supabase·Resend 용량, worker batch/RPS와 비용 승인은 #8·#29가 담당한다.
- [x] 공개 production beta 법률 의견서, provider backup 증빙, privacy 연락 채널 개통은 release gate로 유지한다.
- [x] 비공개 MVP에 Auth 로그인·이메일·계정 삭제 UI를 활성화하지 않는다.

## SSOT

- `docs/product/data-retention-and-deletion-policy.md` (이번 PR에서 추가)
- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/product/full-product-plan.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/core-funnel-events.md`
- `docs/product/age-and-minor-policy.md`
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- [x] 비공개 owner의 7일 inactivity clock은 capability를 검증한 성공한 owner read/save/complete/resume과 link create·rotate·disable의 DB `last_active_at`만 갱신한다. visitor 접근, OS 공유·복사, cron, 실패 요청은 갱신하지 않으며 만료 뒤 play·셀프 답변·프로필·링크·응답을 24시간 안에 삭제한다.
- [x] visitor draft는 `max(created_at, last_active_at) + 24시간`을 사용한다. 관계·시점 확정과 draft answer save처럼 capability를 검증해 DB를 바꾼 성공 mutation만 `last_active_at`을 갱신하고 read·동일값 retry·실패 요청·owner/cron 접근은 갱신하지 않는다. submitted 응답은 `submitted_at + 1년`, owner play 삭제, visitor 철회 중 먼저 온 시점까지 유지하며 비교·프로필 조회로 연장하지 않는다.
- [x] 공개 링크는 발급 후 30일, 1:1 링크는 발급 후 7일 또는 제출 완료 중 먼저 온 시점에 닫힌다. 비활성·회전된 링크는 되살리지 않고 재발급은 새 링크를 만든다.
- [x] 인증 owner의 1년 clock은 인증된 owner의 account/play/profile 성공 read 또는 owner save/complete/link create·rotate·disable에만 `owner_last_active_at`을 갱신한다. visitor·notification·cron은 갱신하지 않으며 `owner_last_active_at + 1년` 또는 계정 삭제 중 먼저 온 시점에 만료한다.
- [x] 새 주인 전환은 현재 same-pack 흐름을 유지하며 만료·삭제된 capability를 복구하거나 다른 계정에 승계하지 않는다.

## 디자인 영향

- [x] 화면 변경은 없다. 후속 설정·삭제 UI가 표시할 기간과 문의 문구의 canonical 입력만 확정한다.

## API와 데이터 영향

- [x] 이번 PR은 문서 전용이며 route·schema·migration을 바꾸지 않는다.
- [x] 후속 구현 계약은 `eligible_at`부터 운영 DB hard-delete까지 24시간, backup 잔존은 hard-delete부터 최대 30일이다.
- [x] 만료·비활성 링크의 capability material은 24시간 안에 제거하고, 제출 응답 FK에 필요한 최소 link tombstone은 종속 응답 종료까지 유지한 뒤 24시간 안에 삭제한다.
- [x] 철회 tombstone은 `response_id`, `share_link_id`, `status=withdrawn`, `withdrawn_at`만 30일 유지한다. 답변·배정·관계·시점·session/management hash는 24시간 안에 제거한다.
- [x] raw analytics event는 30일, 비식별 집계는 1년, rate-limit bucket은 window 종료+24시간까지만 유지한다. source 삭제 시 raw event subject ID/property는 즉시 비식별화한다.
- [x] Auth adoption grace는 `auth user created_at + 7일`이며 grace 안 adoption과 enqueue는 같은 state lock으로 직렬화한다. enqueue/deleting 뒤 claim·복원은 금지하고 앱 DB에 raw email을 복사하지 않는다.
- [x] Auth provider hard-delete 상한은 eligible/request부터 24시간, backup 잔존은 provider hard-delete부터 30일이다.
- [x] permit은 `max(acquired_at+5분, lease_until)`까지 보존한 뒤 24시간 안에 prune한다.
- [x] owner-request receipt provisional TTL은 Auth 삭제 24시간+24시간이며 nonterminal에는 만료를 적용하지 않는다. completed는 `completed_at+24시간` 이상 유지한 뒤 다음 24시간 안에 recovery/receipt hash·version·tombstone을 함께 삭제한다.
- [x] notification terminal 전이는 `terminal_at` 기록과 owner/source ID·request fingerprint NULL을 같은 transaction에서 수행한다. 최소 job tombstone은 `terminal_at+24시간`까지 유지하고 다음 24시간 안에 지운 뒤 unreferenced payload row, drain=0 확인, key reader retire·재배포 순으로 각각 24시간 안에 처리한다.

### 승인 일일 peak와 산정 근거

아래 수치는 Product Owner가 위 승인 기록으로 확정한 private/초기 production beta 유입 상한이며 cleanup fixture는 각 category의 2배를 하루 만료량으로 사용한다.

| retention category | production 승인 일일 peak | 2배 staging fixture | 근거 |
|---|---:|---:|---|
| anonymous/authenticated owner play | 1,000 | 2,000 | 초기 beta owner 일일 상한 |
| public/1:1 share link | 2,000 | 4,000 | owner당 최대 2개 발급 가정 |
| visitor draft/submitted response | 5,000 | 10,000 | owner당 visitor 5명 가정 |
| withdrawn response tombstone | 500 | 1,000 | submitted의 10% 철회 가정 |
| raw analytics event | 100,000 | 200,000 | visitor당 최대 20개 allowlisted event |
| rate-limit bucket | 100,000 | 200,000 | visitor당 최대 20개 action/window bucket |
| terminal notification job | 5,000 | 10,000 | submitted response당 최대 1개 terminal job |
| `owner_request` + `unclaimed_auth` deletion 합계 | 100 | 200 | 승인안의 두 Auth reason 합산 상한 |
| Auth deletion permit prune | 100 | 200 | 두 Auth reason 합계와 1:1 |
| completed receipt prune | 100 | 200 | owner-request와 1:1 |

peak는 관측된 성장 예측이 아니라 beta admission ceiling이다. 운영자가 이 상한을 강제하고, 실제 유입이 70%에 닿거나 가정이 바뀌면 Product Owner와 Operations Owner가 영업일 2일 안에 재승인한다. worker batch/RPS는 #8·#29가 이 2배 fixture를 24시간 SLA 안에 drain하도록 별도 증명한다.

## 구현 계획

1. `docs/product/data-retention-and-deletion-policy.md`에 적용 단계, 링크·데이터 표, Auth/notification 순서, backup·ledger, peak·운영 SLA, 책임·release gate를 작성한다.
2. `docs/product/core-feature-priority.md` 5.9에서 새 문서를 canonical로 지정하고 미확정 차단 문구를 법률·provider 증빙 release gate로 좁힌다.
3. `docs/product/decision-log.md` 최상단에 2026-07-20 제품 승인 결정과 비공개/production 적용 범위를 기록한다.
4. `docs/engineering/p0-development-plan.md` 9.5·18·19에서 미확정 표현을 제거하고 후속 구현이 canonical 수치·공정성·peak를 따르도록 연결한다.
5. `docs/product/full-product-plan.md`의 P0 미결정 목록과 `docs/engineering/core-funnel-events.md`의 raw event 수명을 canonical 정책으로 연결한다.
6. 문서 검색으로 수치·순서·잔여 미결정 문구를 검수하고 `./scripts/run-ai-verify --mode full`을 실행한다.

## 완료 기준

- [x] 데이터별 접근 종료·logical expiry·hard-delete trigger와 최대 지연이 한 표에서 확인된다.
- [x] public 30일, 1:1 7일/제출, 익명 owner 7일, visitor draft 24시간, submitted 1년, authenticated owner 1년이 명시된다.
- [x] 철회 tombstone 최소 필드와 30일 보존, 원문·token hash 24시간 삭제가 명시된다.
- [x] Auth grace 7일, provider 24시간, backup 30일, permit/receipt prune과 앱 DB raw email 금지가 명시된다.
- [x] notification terminal 직접 식별자 제거와 tombstone→payload→key reader 순서·각 최대 지연이 명시된다.
- [x] 정상 retention은 notification terminal 전에 source 응답을 지우지 않고, 철회·owner-delete만 same-transaction cancel/비식별화 예외임이 명시된다.
- [x] category별 일일 peak와 2배 staging fixture 근거, owner_request 우선·unclaimed_auth 최소 진전·빈 몫 borrowing, reason별 overdue=0 release 기준이 명시된다.
- [x] 각 sliding/fixed clock을 갱신하는 성공 event와 갱신하지 않는 visitor·cron·조회 경계가 명시된다.
- [x] peak 50% 경보, 70%/가정 변경 후 영업일 2일 내 재검토, SLA 위반 예상 시 4시간 내 signed catch-up·신규 유입 제한이 명시된다.
- [x] 문의 영업일 2일 접수·7일 처리/지연 회신, 제품·운영 책임과 production release gate가 명시된다.
- [x] 1:1 철회 뒤 consumed link를 다시 열지 않는다.
- [x] 미성년자 신고 데이터의 live 72시간·backup 30일·backup 밖 HMAC ledger 최소 45일 우선 규칙을 보존한다.

## 테스트 계획

- [ ] `rg`로 새 canonical 링크, 확정 기간, 미결정 표현 제거, notification/Auth 순서를 대조한다.
- [ ] `./scripts/task-harness spec-check docs/specs/issue-7.md`
- [ ] `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- [x] 새 event는 없다.
- [x] 후속 cleanup은 category별 `remaining_count`, `oldest_due_at`, 처리 건수와 allowlisted 오류 code만 기록하고 UID·email·응답 값은 기록하지 않는다.
- [x] reason별 pending, oldest due, overdue를 분리 관측하며 release 기준은 모두 overdue 0건이다.

## 개인정보와 악용 방지

- [x] 개인정보보호법상 목적 종료 뒤 지체 없는 파기 원칙을 24시간 운영 DB 상한으로 구체화하되 공개 beta 전 법률 검토를 유지한다.
- [x] backup 복구 시 삭제 ledger를 재적용하고 0건 검증 전 서비스 연결을 금지한다.
- [x] raw email, UID 사본, raw receipt/proof/key, 응답 원문을 cleanup 로그·analytics·notification tombstone에 남기지 않는다.
- [x] 만료 secret을 재발급하지 않고 새 링크·token만 발급해 폐기된 권한이 되살아나지 않게 한다.

## 롤아웃과 복구

- [x] 문서 변경이므로 runtime rollout과 migration rollback은 없다. 잘못된 수치는 후속 구현 시작 전에 같은 SSOT를 수정하고 결정 로그에 변경 이유를 남긴다.
- [x] 비공개 MVP에는 현재 7일/24시간 capability 계약만 적용한다. Auth·notification·계정 삭제는 production beta 재승인 뒤 활성화한다.
- [x] 현행 한국 법률 서면 검토, #8의 provider backup 30일 증빙, restore 재삭제 drill, privacy 연락 채널 중 하나라도 없으면 공개 production beta를 열지 않는다.

## 스펙 검토

Reviewer Agent: issue58_qa_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 제품 기간은 위 Product Owner 승인 기록으로 승인됐다. 법률 의견서와 provider backup 증빙은 구현 내용을 바꾸지 않는 production release gate로 남는다.
- [x] 실제 worker batch/RPS·비용은 #8·#29가 소유하며, 승인 peak 2배 fixture를 drain하지 못하면 값을 임의 완화하지 않고 release를 막는다.
