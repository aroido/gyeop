# Issue 25 구현 스펙: [프론트엔드] 비교 후 선택 2장 추가 응답 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/25

## 목표

필수 3장 비교를 본 방문자가 동일 팩 시작 CTA를 방해받지 않고 선택적으로 표본이 적은 카드 2장을 더 배정받아 저장·비교하며, 같은 response session으로 새로고침해도 추가 진행을 그대로 이어간다.

## 범위

- `visitor_assignments`가 `required 1..3`과 `optional 1..2`를 함께 표현하도록 제약을 확장한다.
- submitted response와 만료 전 동일 response session만 호출할 수 있는 `assign_optional_cards` RPC를 추가한다.
- exact `POST /api/responses/[id]/continue`와 browser client를 추가한다. body는 exact `{}`다.
- 기존 `save_response_answer`와 `get_visitor_response`를 submitted optional assignment 저장·복구·비교까지 확장한다.
- 아직 배정·응답하지 않은 카드 중 현재 필수 제출 표본 수가 적은 카드 2장을 결정적으로 배정한다.
- `optional_answers_started`는 최초 배정 transaction, `optional_answers_completed`는 두 번째 optional answer 최초 저장 transaction에서 각각 한 번만 기록한다.
- owner profile의 질문별 표본에는 submitted 공개 링크의 required와 완료된 optional answer를 모두 포함한다. `sightCount`는 response 수이므로 바꾸지 않는다.
- 비교 화면에서 Primary `나도 이 팩으로 시작하기` 다음에 Secondary `2장 더 답하기`를 배치하고, 추가 2장 진행·재시도·비교·새로고침 복구를 구현한다.
- migration, generated DB types, strict decoder, source verifier, pgTAP, unit/integration, Playwright를 함께 갱신한다.

## 제외 범위

- 새 질문·새 팩·5장 초과 응답, 관계별 집계, 공개 프로필, AI 해석·점수.
- response 철회와 관리 화면은 #26, owner profile의 새 화면·정책은 기존 #27 범위를 유지한다.
- 1:1 응답을 `/me` 누적에 포함하거나 주인에게 공개하지 않는다.
- Auth, 로그인, 이메일 복구, 알림, 계정 귀속을 추가하지 않는다.
- optional 진행 중 required 답을 수정하거나 optional 배정을 다시 추첨·교체하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md` §5.5~5.7
- `docs/product/question-pack-spec.md` §6, §9
- `docs/product/decision-log.md`의 3장 즉시 비교·동일 팩 Primary·최소 표본 결정
- `docs/engineering/p0-development-plan.md` §9.2~9.3, §11.3, §17
- `docs/specs/issue-24.md`의 response cookie·strict state·save/get/event 계약
- `supabase/migrations/20260718000700_visitor_required_assignments.sql`
- `supabase/migrations/20260718000800_visitor_required_response.sql`
- `supabase/migrations/20260718000900_owner_profile.sql`
- `supabase/migrations/20260718001000_profile_reshare.sql`
- `supabase/migrations/20260718001100_core_funnel_events.sql`의 최신 analytics allowlist·normalizer·funnel view 계약
- `AGENTS.md`, `.codex/AGENTS.md`

## 사용자 흐름 영향

1. 방문자는 기존처럼 필수 3장을 제출하고 즉시 세 카드 비교를 본다.
2. 가장 강한 행동은 계속 `나도 이 팩으로 시작하기`이며 바로 동일 팩 owner flow로 이동한다.
3. 그 아래 `2장 더 답하기`를 누르면 POST continue가 같은 response에 optional 2장을 한 번만 배정한다.
4. 추가 질문은 `1 / 2`, `2 / 2` 진행과 자동 저장 상태를 보인다. 저장 실패 시 선택과 현재 위치를 유지하고 명시적으로 재시도한다.
5. 추가 진행에서 `비교로 돌아가기`를 누르면 필수 비교와 Primary를 다시 사용할 수 있다. 미완료 Secondary는 `2장 이어서 답하기`가 된다.
6. 두 저장이 끝나면 필수 3장 비교 아래에 추가 2장 비교가 붙고 Secondary 대신 `2장 추가 비교 완료` 상태를 보여준다. Primary와 관리 영역의 순서는 유지한다.
7. optional 배정 전 reload는 기존 3장 비교, 배정 뒤 미완료 reload는 첫 미저장 optional 질문, 완료 뒤 reload는 5장 비교를 연다. 어느 경우에도 새 assignment를 만들지 않는다.
8. optional을 건너뛰거나 중간에 나가도 필수 비교·same-pack CTA·관리 링크는 사용할 수 있다.

## 디자인 영향

- 현재 검정 배경·라임 Primary·blue focus 언어를 유지하고 새 디자인 시스템을 만들지 않는다.
- 실제 360px 비교 화면을 캡처해 Lazyweb quick search와 report `f2b240a9-4f41-42f7-9d8f-eda7f0af4eaf`를 확인했다. 참고안 중 Primary 앞에 Secondary를 두거나 sticky split CTA로 동급화하는 안은 active SSOT와 충돌하므로 적용하지 않는다.
- exact 순서는 `결과 요약 → 필수 3장 비교 → 라임 filled Primary → outlined Secondary/완료 상태 → optional 비교(있을 때) → 응답 관리`다.
- Secondary는 44px 이상 button, 라임 채움 없음, Primary보다 작은 시각 무게를 사용한다. DOM·키보드 순서도 Primary가 먼저다.
- optional 질문은 기존 A/B 카드·focus 이동·`aria-pressed`·`aria-live` 저장 상태를 재사용하고 progress label을 `추가 답변 진행`으로 분리한다.
- `비교로 돌아가기`는 tertiary text/outline action이고 답이나 assignment를 삭제하지 않는다.
- 320/390/430px에서 가로 overflow가 없어야 하며 reduced-motion 계약을 유지한다.

## API와 데이터 영향

### additive migration

새 migration `20260719000200_visitor_optional_answers.sql`을 한 transaction으로 적용한다.

- `visitor_assignments.stage` check를 `required|optional`로, position check를 `(required,1..3)|(optional,1..2)`로 교체한다. 기존 PK `(response_id, card_id)`와 unique `(response_id, stage, position)`이 중복 카드·중복 위치를 막는다.
- `private.visitor_required_response_state`를 전체 visitor response state serializer로 교체하되 함수 이름은 호환을 위해 유지한다.
  - draft는 required 3장만 반환하며 기존 exact wire shape를 바꾸지 않는다.
  - submitted는 required 3장과 optional 0장 또는 2장을 `required position → optional position` 순으로 반환한다.
  - submitted assignment 공통 key는 기존 `packPosition`, `ownerChoice`, `matches`, `isHighlight`를 유지한다. unanswered optional은 `visitorChoice|ownerChoice|matches = null`, `isHighlight=false`; answered optional은 세 값이 non-null이다.
  - required 세 장은 기존처럼 모두 non-null이며 top-level `allMatched`와 `isHighlight`는 required 세 장만으로 결정한다. optional은 headline highlight를 바꾸지 않는다.
  - owner choice는 required answer가 제출됐거나 해당 optional answer가 저장된 카드에만 반환한다. 미응답 optional의 owner choice는 null이다.
- `public.assign_optional_cards(p_response_id, p_session_hash)`를 추가한다.
  - canonical non-null input과 32-byte hash를 검사하고 response row를 `FOR UPDATE`한다.
  - matching session, `status='submitted'`, `session_expires_at > clock_timestamp()`가 아니면 `session_invalid` 또는 `not_submitted`다.
  - optional assignment가 이미 정확히 2장이면 새 계산·insert·started event 없이 같은 state를 `assigned`로 반환한다. 1장만 존재하는 불가능한 상태는 exception으로 fail closed한다.
  - 기존 required/optional assignment와 answer card를 제외한다. 남은 후보의 표본 수는 현재 response의 `share_link.pack_play_id`와 같은 play에 속한 public·1:1 source의 `submitted response required assignment`만으로 계산한다. 같은 pack version을 쓰는 다른 owner play의 표본은 절대 섞지 않는다. `SHA-256('gyeop-optional-assignment-v1' || 0x00 || response_id || 0x00 || card_id)` byte 순서, pack position, card id로 동률을 푼 앞의 2장을 저장한다.
  - 정확히 2장을 만들 수 없으면 partial insert/event 없이 invariant exception으로 rollback한다.
  - 최초 성공 transaction에서만 값 없는 `optional_answers_started`를 기록한다.
- `public.save_response_answer`를 stage-aware로 교체한다.
  - draft는 기존 required assignment만 저장한다. submitted는 동일 response의 optional assignment만 저장한다.
  - submitted required card, unassigned card, cross-pack card는 저장하지 않는다.
  - optional first/duplicate/update 모두 state를 반환하되 두 optional 카드가 처음 모두 답변된 transition에서만 `optional_answers_completed`를 insert한다.
- 최신 `analytics_internal_insert_allowlist` policy에 두 event를 추가한다. `owner_play_id|share_link_id`는 null, `visitor_response_id`는 non-null, properties는 exact `{packVersion, linkKind}`다. 카드·choice·관계·token·URL은 금지하고 기존 `analytics_event_normalizer`도 그대로 통과해야 한다.
- `(visitor_response_id,event_name)` partial unique index의 predicate를 기존 두 terminal event와 optional 두 event로 확장한다. named conflict만 idempotent success로 흡수하고 다른 unique violation은 다시 throw한다.
- `public.get_owner_profile`의 카드 sample subquery에서 `assignment.stage='required'` 제한만 제거한다. submitted public link와 stored answer 조건은 유지하므로 optional 미응답·1:1·draft·철회 응답은 누적되지 않는다.
- `private.core_funnel_stage_counts`는 기존 funnel stage를 보존하면서 `visitor_optional` funnel의 `comparison_viewed → optional_answers_started → optional_answers_completed` subject count를 추가한다. started는 comparison 이후, completed는 같은 response의 started 이후 event만 센다.
- 모든 SECURITY DEFINER는 `search_path=''`, schema-qualified object, PUBLIC/anon/authenticated execute revoke, `gyeop_internal_rpc` grant를 지킨다.

### strict response state

- draft: assignments exact 3, 모두 `stage='required'`, position 1..3, visitorChoice nullable, comparison key 없음.
- submitted: assignments exact 3 또는 5. required는 정확히 3, optional은 0 또는 정확히 2다. cardId와 `(stage,position)`, packPosition은 모두 고유하다.
- optional 2장이 있으면 미응답 0..2를 허용한다. `visitorChoice`가 null이면 `ownerChoice|matches`도 null이고, 답이 있으면 모두 non-null이며 match 식과 일치한다.
- required는 기존 highlight 불변식을 유지하고 optional `isHighlight`는 항상 false다.
- HTTP layer만 pack/relationship/known-since label을 붙인다. DB ID, sample count, 다른 response, owner prompt는 반환하지 않는다.

### exact HTTP contract

| 목적          | method/path                                     | body                               | 성공                       | 주요 실패                                                                     |
| ------------- | ----------------------------------------------- | ---------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| optional 배정 | `POST /api/responses/[id]/continue`             | exact `{}`                         | 200 strict submitted state | draft 409, absent/cross-response/expired/malformed 404                        |
| optional 저장 | 기존 `PUT /api/responses/[id]/answers/[cardId]` | choice가 `a` 또는 `b`인 exact JSON | 200 strict submitted state | required submitted 409, unassigned/cross-response/expired 404, 기존 limit 429 |
| 진행 복구     | 기존 `GET /api/responses/[id]`                  | 없음                               | 200 strict state           | absent/cross-response/expired/malformed 404                                   |

- continue route는 `emptyOwnerMutationSchema`, maximum 2 bytes, Origin/body/path 검증 뒤 response cookie의 id 일치를 확인하고 domain RPC를 호출한다.
- continue는 유효한 HttpOnly same-response capability로 한 번만 insert하는 idempotent mutation이므로 별도 rate bucket을 추가하지 않는다. 임의 response ID나 다른 cookie로 배정을 만들거나 상태를 관찰할 수 없다.
- 성공과 오류는 `Cache-Control: private, no-store`; 성공은 기존 고정 DB expiry까지 동일 cookie를 재serialize한다.
- `not_submitted`는 409 `VISITOR_RESPONSE_CONFLICT`, session/cross-response는 기존 generic 404로 매핑한다.

## 구현 계획

1. migration에 assignment constraint, state serializer, optional assign/save, event policy/index, profile sample 확장을 구현하고 DB types/source verifier를 갱신한다.
2. `visitor-context-core.mjs`와 `internal-rpc.ts`의 strict state/outcome type을 required+optional union으로 확장한다.
3. server adapter·HTTP wrapper·exact continue route와 empty schema/source policy를 추가한다.
4. browser client에 `continueVisitorResponse`를 추가하고 existing save/get decoder를 재사용한다.
5. `invite-entry.tsx`의 comparison에 Primary 다음 Secondary를 추가하고 optional progress/save queue/retry/back/complete branch를 연결한다. required 제출·management secret 경로는 건드리지 않는다.
6. CSS는 existing question/result tokens를 재사용해 Primary/Secondary 위계와 mobile overflow만 보강한다.
7. pgTAP, unit/integration, mocked/live Playwright로 sampling·authorization·reload·event·profile·시각 위계를 검증한다.

## 완료 기준

- [ ] optional을 건너뛰어도 필수 비교·same-pack Primary·관리 링크가 정상 동작한다.
- [ ] first continue는 정확히 2장의 optional assignment를 만들고 required 3장 및 서로 중복되지 않는다.
- [ ] duplicate/concurrent continue는 동일 2장을 반환하며 assignment와 started event가 각각 한 세트·한 건이다.
- [ ] 배정은 최소 required 표본·결정적 hash 규칙을 따르고 retry/reload에서 다시 계산하지 않는다.
- [ ] draft, expired, cross-response cookie는 optional 배정·저장·owner choice 조회를 할 수 없다.
- [ ] optional 미응답 owner choice는 null이고 저장한 optional 카드만 본인의 비교를 반환한다.
- [ ] 미완료 reload는 저장된 선택과 첫 미저장 카드, 완료 reload는 같은 추가 2장 비교를 복구한다.
- [ ] optional 완료 후 submitted 공개 응답의 두 answer가 `/me` 카드 sample에 포함되고 sightCount는 늘지 않는다. 1:1 optional은 `/me`에 포함되지 않는다.
- [ ] started/completed event는 각각 최대 한 번이고 properties에 답 값·card·관계·token이 없다.
- [ ] 라임 Primary가 위치·색·DOM/focus 순서에서 outlined Secondary보다 강하며 optional은 전환 선행 조건이 아니다.
- [ ] 320/390/430px, keyboard, focus, aria-live, reduced-motion에서 기존 접근성 계약을 유지한다.

## 테스트 계획

- `node --test tests/unit/visitor-response.test.mjs tests/unit/visitor-response-policy.test.mjs`
  - 3/5 assignment strict state, optional nullable comparison, duplicate/stage/position/leakage 거절
  - exact continue POST/body/method/no-store/error mapping과 browser client
- `pnpm exec supabase db reset`
- `pnpm exec supabase test db supabase/tests/visitor_optional_answers.test.sql`
  - exact 2장, exclusion, deterministic under-sampling, duplicate/concurrent continue
  - 같은 pack version의 두 owner play 표본 격리
  - draft/expired/cross-session, optional save/update, incomplete/complete reload
  - started/completed event uniqueness·payload, PUBLIC/anon/authenticated denial
  - public profile optional sample 포함·sightCount 불변·1:1 제외
- `node --test tests/integration/visitor-response-session.test.mjs tests/integration/visitor-response-concurrency.test.mjs`
  - continue route capability boundary와 concurrent idempotency
  - submitted optional save가 기존 answer rate limit 및 cookie expiry 계약을 유지
- `pnpm exec playwright test tests/e2e/visitor-response.spec.ts --project=mobile-chromium`
  - skip branch, start→1장→reload→2장→additional comparison, save retry, comparison back/continue
  - Primary first/filled, Secondary second/outlined, same-pack direct href, no overflow
- focused test를 묶어 통과한 뒤 clean final commit에서 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 분석과 관측성

- `optional_answers_started`는 배정 성공, `optional_answers_completed`는 두 카드 저장 완료를 의미한다.
- 둘 다 server transaction에서 기록해 UI retry·reload·동시 요청으로 부풀지 않는다.
- properties exact set은 `{packVersion, linkKind}`다. choice/card/관계/secret/URL/IP/UA를 추가하지 않는다.
- 기존 `comparison_viewed`와 `same_pack_start_clicked` 정의·카운트는 바꾸지 않는다.

## 개인정보와 악용 방지

- 24시간 fixed response session cookie와 path response id가 같은 요청만 optional response에 접근한다.
- owner choice는 방문자가 해당 카드에 답한 뒤에만 내려보내 선행 노출과 응답 유도를 막는다.
- optional assignment와 answer는 기존 composite FK/RLS/internal RPC 경계를 재사용한다.
- 1:1 optional은 방문자 본인의 즉시 비교에만 남고 owner profile aggregate에 섞이지 않는다.
- 이름·자유 텍스트·답 값 analytics·raw capability 저장을 추가하지 않는다.

## 롤아웃과 복구

- additive migration과 동시 app 배포다. 기존 required 3장 row와 submitted response는 그대로 유효하다.
- app-only rollback은 Secondary를 숨기되 이미 optional row가 있는 response를 읽을 수 있도록 3/5장 decoder와 5장 state serializer를 유지한 호환 빌드를 사용한다. 3장-only 구버전으로 즉시 되돌리면 strict decoder가 기존 optional response를 거절하므로 허용하지 않는다.
- DB까지 되돌려야 하면 optional row와 두 optional event를 먼저 삭제한 뒤 stage/position check, state/save/profile/funnel function과 event index/latest allowlist policy를 이전 정의로 복원하고 나서 3장-only 앱을 배포한다.
- feature flag는 추가하지 않는다. private MVP에서 exact route·session gate와 CI를 통과한 뒤 함께 활성화한다.

## 스펙 검토

Reviewer Agent: issue25_spec_review
Review Status: PASS
P0/P1 Findings: 0

- [resolved] optional 표본 집계를 current response의 동일 `pack_play_id`로 격리하고 cross-owner pgTAP을 추가했다.
- [resolved] optional row 생성 뒤 3장-only 이전 앱 rollback을 금지하고 optional-aware forward rollback 또는 DB 정리 순서를 고정했다.

## 리스크와 미결정 사항

- 없음. Primary 우선, optional sampling 기준, 미응답 owner choice null, profile 포함 범위를 이 스펙에서 고정했다.
