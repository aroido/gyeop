# Issue 32 구현 스펙: [데이터] 무료 MVP 보관 cleanup DB 로직·local/CI 검증

Status: Reviewed
> 이 스펙은 `$0` private MVP의 local/CI DB cleanup 경계만 다룬다.

## 목표

보관 정책에서 이미 확정된 최소 cleanup 대상만 DB 내부 함수 하나로 bounded·idempotent하게 정리하고, local/CI pgTAP으로 경계·보존·권한 계약을 고정한다.

## 범위

- [ ] `docs/product/data-retention-and-deletion-policy.md`의 이미 활성화된 local/CI DB cleanup 범위만 구현한다.
- [ ] 새 Supabase migration 하나에서 internal-only cleanup 함수와 필요한 최소 privilege만 추가한다.
- [ ] cleanup은 고정 chunk와 advisory lock으로 동작하며 외부 입력 없이 한 번 호출할 때 과도한 scan·delete를 하지 않는다.
- [ ] category는 아래 5개만 처리한다.
- [ ] 만료된 익명 owner tree: `anonymous_owners.management_expires_at <= now()` 이고 그 owner를 참조하는 모든 `pack_plays.owner_id`가 `NULL`인 owner만 root row에서 삭제한다. 기존 FK cascade로 anonymous play·self answer·share link·visitor data를 함께 제거하되, 참조 play 하나라도 인증 owner에 귀속됐으면 owner tree 전체를 보존한다.
- [ ] 만료된 visitor draft: `visitor_responses.status = 'draft'` 이고 마지막 성공 mutation 기준 cutoff인 `session_expires_at <= now()` 인 draft·answer·assignment를 제거한다. 기존 delete trigger로 연결 raw analytics row의 `id`, `event_name`, `occurred_at`은 30일 상한까지 보존하고 owner/link/response subject와 `properties`만 즉시 scrub한다.
- [ ] draft answer 최초 저장 또는 실제 choice 변경 때만 parent draft의 `session_expires_at = mutation 시각 + interval '24 hours'`로 갱신한다. 동일 choice retry, read, 실패 mutation, owner/Cron 접근은 연장하지 않는다.
- [ ] 만료된 submitted visitor session hash: `visitor_responses.status = 'submitted'` 이고 `session_expires_at <= now()` 인 row의 `session_token_hash`만 `NULL` 처리하고 submitted 본문은 유지한다.
- [ ] 제출 transaction은 `session_expires_at = submitted_at + interval '24 hours'`를 함께 기록한다. DB state constraint는 submitted row에만 만료 후 `session_token_hash IS NULL`을 허용하고 draft에는 기존 non-null invariant를 유지한다.
- [ ] 만료된 rate bucket: `rate_limit_buckets.expires_at + 24시간 <= now()` 인 row를 삭제한다.
- [ ] 만료된 raw analytics: `analytics_events.occurred_at + 30일 <= now()` 인 row를 삭제한다.
- [ ] pgTAP이 category별 boundary, 참조 보존, idempotency, 함수 권한, 결과 shape를 검증한다.

## 제외 범위

- [ ] hosted Cron, background worker, HTTP route, Edge Function, external scheduler는 추가하지 않는다.
- [ ] production/hosted 데이터 mutation, provider API call, secret, 운영 runbook 자동화는 추가하지 않는다.
- [ ] self-service account deletion, owner-request receipt cleanup, 미귀속 Auth deletion, provider Auth deletion placeholder는 이번 이슈에 넣지 않는다.
- [ ] notification lifecycle cleanup, backup purge, aggregate analytics retention은 이번 migration에 넣지 않는다.
- [ ] 사용자가 chunk 크기나 category를 입력하는 public API는 만들지 않는다.

## SSOT

- `AGENTS.md`
- `.codex/AGENTS.md`
- `docs/product/core-feature-priority.md`
- `docs/engineering/private-mvp-zero-cost-runbook.md`
- `docs/product/data-retention-and-deletion-policy.md`
- `supabase/migrations/20260718000100_security_data_access.sql`
- `supabase/migrations/20260718000600_visitor_response_session.sql`
- `supabase/migrations/20260718000800_visitor_required_response.sql`
- `supabase/migrations/20260718001100_core_funnel_events.sql`
- `supabase/migrations/20260719000300_visitor_response_withdrawal.sql`
- `supabase/migrations/20260720000100_anonymous_owner_claim.sql`

## 사용자 흐름 영향

- [ ] 만료된 draft visitor는 더 이상 복구되지 않고 새 세션으로 다시 시작해야 한다.
- [ ] submitted visitor의 비교/결과 보존은 유지되지만 만료된 `session_token_hash`는 cleanup 뒤 재사용되지 않는다.
- [ ] 만료된 비로그인 owner tree는 기존 cascade로 제거되지만, 같은 anonymous owner를 참조하는 play 중 하나라도 `owner_id IS NOT NULL`이면 tree 전체가 보존된다.

## 디자인 영향

- [ ] 없음. UI 변경 없음.

## API와 데이터 영향

- [ ] migration 하나에서 internal cleanup 함수를 추가한다.
- [ ] 함수는 외부 입력 없이 실행되며 `jsonb` 결과로 category별 `deleted_count` 또는 `updated_count`, `remaining_count`, `oldest_due_at`, `outcome`만 반환한다.
- [ ] advisory lock을 잡지 못하면 예외 대신 safe outcome을 반환한다.
- [ ] category 이름은 고정 allowlist만 사용한다.
- [ ] draft visitor cleanup은 `visitor_answers`, `visitor_assignments`, draft `visitor_responses`를 같은 transaction에서 제거한다. 기존 delete trigger가 연결 raw analytics row를 삭제하지 않고 subject columns를 `NULL`, `properties`를 `{}`로 scrub한다.
- [ ] submitted cleanup은 `session_token_hash`만 `NULL` 처리한다. `management_token_hash`, `submitted_at`, answer, assignment는 유지한다.
- [ ] `visitor_answers`의 실제 insert 또는 choice 변경을 감지하는 DB trigger가 draft parent의 cutoff를 24시간 연장한다. 동일 값 conflict update는 연장하지 않고, submitted/withdrawn parent도 연장하지 않는다.
- [ ] 제출 write path에 DB trigger 또는 동등한 DB 강제 계약을 추가해 `submitted_at`과 같은 시각을 기준으로 `session_expires_at = submitted_at + 24시간`을 기록한다. `visitor_responses_state_check`를 갱신해 submitted row만 `session_token_hash`의 non-null/NULL을 모두 허용하고 draft·withdrawn invariant는 유지한다.
- [ ] 익명 owner cleanup은 due owner root를 삭제해 기존 FK cascade를 사용한다. 단, 그 owner의 play 중 `owner_id IS NOT NULL`이 하나라도 있으면 건드리지 않는다.
- [ ] 함수 실행 권한은 internal role만 가진다. `anon`, `authenticated`에는 grant하지 않는다.

## 구현 계획

1. `private` schema에 category별 due row를 고정 개수로 처리하는 helper SQL을 둔다.
2. 최상위 cleanup 함수는 transaction 안에서 advisory lock을 시도하고, lock 실패 시 `outcome = 'busy'`와 zero mutation 결과를 반환한다.
3. 익명 owner category는 `management_expires_at` 오름차순으로 due root를 고르되 `not exists (select 1 from public.pack_plays where anonymous_owner_id = owner.id and owner_id is not null)`로 인증 귀속 tree를 건너뛰고, 허용된 root만 삭제해 기존 cascade를 사용한다.
4. `visitor_answers` insert/choice-change trigger는 parent를 잠그고 parent가 draft이며 현재 cutoff 안일 때만 `session_expires_at = clock_timestamp() + 24시간`으로 연장한다. 동일 값 retry에는 연장하지 않는다.
5. draft visitor category는 due draft response ID를 먼저 고정 개수로 선택하고 child·parent response를 삭제한다. 기존 `visitor_response_delete_analytics_scrub` trigger가 raw event를 남기고 subject만 scrub하는지 검증한다.
6. submitted session category는 due submitted row에서 `session_token_hash is not null` 인 대상만 고정 개수로 골라 `NULL` 처리한다.
7. 제출 write path의 DB 강제 계약과 state constraint를 같은 migration에서 갱신해 submit 시점을 session cleanup 기준으로 고정하고 submitted hash nulling을 합법 상태로 만든다. 애플리케이션 함수 전체를 복제하지 않는 trigger 방식을 우선한다. draft constraint는 최초 `created_at + 24시간` 이상인 연장 cutoff를 허용한다.
8. rate bucket과 analytics는 각각 `expires_at`, `occurred_at` 기준 가장 오래된 due row부터 고정 개수 삭제한다.
9. 반환 payload는 category별 개별 결과와 전체 `outcome = 'ok' | 'busy'`만 담고, row ID·hash·답변 값은 담지 않는다.

## 완료 기준

- [ ] local/CI에서 cleanup 함수를 수동 호출하면 5개 category가 policy 경계대로만 변한다.
- [ ] 만료된 비로그인 owner tree는 삭제되고, 인증 귀속 play가 하나라도 있는 owner tree는 보존된다.
- [ ] draft answer 최초 저장과 실제 choice 변경은 cutoff를 24시간 연장하지만 동일 choice retry와 read는 연장하지 않는다.
- [ ] submit이 `session_expires_at = submitted_at + 24시간`을 기록하며, expiry 전에는 session hash를 유지한다.
- [ ] submitted response 본문·assignment·analytics identity는 유지되고 expiry 뒤 `session_token_hash`만 `NULL` 된다.
- [ ] draft response 삭제 뒤 연결 raw analytics event는 남고 subject columns와 properties만 scrub된다.
- [ ] 같은 cleanup을 연속 두 번 실행하면 두 번째 결과는 추가 mutation 없이 idempotent하다.
- [ ] 함수 권한은 internal-only이며 anon/authenticated 호출은 불가능하다.

## 테스트 계획

- [ ] pgTAP: busy lock outcome, ok outcome, category 결과 key shape.
- [ ] pgTAP: `management_expires_at` 경계 전/후 비로그인 owner tree cascade 삭제와 인증 귀속 owner tree 보존.
- [ ] pgTAP: draft visitor cleanup이 answer/assignment/response를 지우고 raw analytics `id/event_name/occurred_at`은 보존하면서 subject columns와 properties를 scrub함.
- [ ] pgTAP: draft answer insert/choice change는 session cutoff를 mutation 시각+24시간으로 연장하고 동일 choice retry는 cutoff를 바꾸지 않음.
- [ ] pgTAP: submit 시 `submitted_at + 24시간`으로 session expiry가 갱신되고, expiry 전에는 hash 유지, expiry 뒤에는 submitted content를 보존한 채 `session_token_hash`만 `NULL`.
- [ ] pgTAP: state constraint가 draft NULL hash는 거부하고 submitted expired NULL hash와 withdrawn invariant는 허용함.
- [ ] pgTAP: `rate_limit_buckets.expires_at + 24시간`, `analytics_events.occurred_at + 30일` 경계 검증.
- [ ] pgTAP: 동일 fixture에서 cleanup 2회 실행 시 두 번째 mutation count가 0.
- [ ] focused DB lint/test 명령으로 새 migration과 pgTAP만 검증한다.

## 분석과 관측성

- [ ] 함수 반환값은 category, 처리 건수, `remaining_count`, `oldest_due_at`, `outcome`만 포함한다.
- [ ] log/결과에 UID, token/hash 원문, 답변 값, raw properties를 넣지 않는다.

## 개인정보와 악용 방지

- [ ] cleanup은 정책에서 이미 만료된 데이터만 대상으로 한다.
- [ ] advisory lock과 고정 chunk로 폭주 호출과 과도한 delete를 막는다.
- [ ] internal privilege만 부여해 공개 API 경로에서 임의 호출되지 않게 한다.

## 롤아웃과 복구

- [ ] local/CI 수동 실행만 지원한다. hosted scheduler가 없으므로 production enable 신호로 사용하지 않는다.
- [ ] 회귀 시 migration rollback 대신 후속 migration으로 함수 계약을 수정한다. 이미 삭제된 데이터 복구는 범위 밖이다.

## 스펙 검토

Reviewer Agent: /root/critic_32
Review Status: PASS
P0/P1 Findings: 0

- [ ] hosted Cron/route/provider cleanup을 제외했다.
- [ ] Auth deletion placeholder를 제외했다.
- [ ] 인증 귀속 play가 하나라도 있는 익명 owner tree를 삭제하지 않는 보존 규칙을 명시했다.
- [ ] submitted response는 full delete가 아니라 session hash nulling만 하도록 고정했다.
- [ ] submit 시점부터 24시간을 session hash cleanup 기준으로 고정했다.
- [ ] draft source 삭제 시 raw analytics row는 30일 동안 보존하고 subject만 scrub하도록 고정했다.

## 리스크와 미결정 사항

- [ ] local/CI only라 overdue 자동 수렴은 아직 없다. 이 이슈는 정책의 hosted 운영 경로를 승인하지 않는다.
- [ ] draft cleanup의 raw analytics는 기존 trigger와 정책대로 row를 보존하고 subject만 scrub한다. 별도 analytics hard-delete는 `occurred_at + 30일` category만 담당한다.
- [ ] category chunk 크기는 고정 상수로 둔다. peak tuning이나 fair round-robin은 hosted 운영 승인이 생길 때 다시 확장한다.
