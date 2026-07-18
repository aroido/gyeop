# Issue 23 구현 스펙: [백엔드] Signature 1장과 최소 표본 2장 원자 배정 구현

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/23

## 목표

공개 링크와 active 1:1 링크에서 신규 방문자 response를 시작할 때, 해당 팩의 Signature 카드 1장과 제출 표본이 가장 적은 비-Signature 카드 2장을 response/session/quota/event와 같은 DB transaction에서 정확히 한 번 배정한다. 같은 response session의 재시도와 reload는 quota나 row를 늘리지 않고 저장된 3장과 카드 문구를 그대로 복구한다.

이 PR은 `response 시작 → 필수 3장 배정·복구`까지만 닫는다. A/B 저장, 제출, owner self answer 비교, management token, 1:1 실제 소비는 #24가 소유한다.

## 범위

- `visitor_responses`에 `(id, pack_version_id)` unique key를 추가한다.
- `visitor_assignments` table을 추가하고 response와 card 양쪽에 pack-version composite FK를 둔다.
- 필수 assignment는 response마다 정확히 3개를 한 번에 insert한다. Signature는 position 1, 비-Signature 2장은 position 2·3이다.
- 비-Signature 후보는 같은 owner play의 `submitted` 필수 assignment 표본 수 오름차순, domain-separated `response UUID + card ID` SHA-256 오름차순, pack position/card ID 오름차순으로 정렬해 처음 2장을 고른다.
- `public.start_response`를 `kind in ('public', 'one_to_one')`로 확장하고 신규 response branch에 assignment 생성을 포함한다.
- 유효한 same-link response session의 `resume`과 duplicate `start`는 저장된 assignments를 반환하며 다시 표본을 계산하지 않는다.
- response state에 방문자에게 필요한 exact 카드 필드만 반환한다. owner prompt·self choice·표본 수·내부 pack/play/link ID는 반환하지 않는다.
- analytics policy의 두 visitor-start event가 `public|one_to_one` exact link kind를 허용하게 한다.
- generated DB types, named RPC adapter, strict decoder, HTTP/browser contract, source verifier, pgTAP, concurrency·live HTTP 테스트를 갱신한다.
- 최소 표본 문구의 singleton fallback과 결정적 tie-break를 제품 SSOT에 명시한다.

## 제외 범위

- `visitor_answers`, A/B 답 저장·진행률·저장 재시도.
- 필수 3장 제출, `visitor_responses.status='submitted'` 전이, management token·관리 링크.
- `share_links.consumed_response_id|consumed_at` 추가와 1:1 link 소비. #24가 submit transaction에서 추가·설정하고, 그 migration부터 consumed 1:1의 신규 response 시작을 막는다.
- owner self answer·같음/다름·대표 차이·관계 집계·프로필 노출.
- 선택 2장, 철회, 알림, materialized aggregate.
- `/i/[publicId]`의 1:1 카드 응답 UI. 이 PR은 backend start/assignment contract와 same-session 복구를 열고 #24가 3장 UI와 제출 흐름을 연결한다.
- 이름·닉네임·연락처·계정·자유 텍스트 입력.

## SSOT

- `docs/product/core-feature-priority.md` §5.5
- `docs/product/question-pack-spec.md` §6, §8, §9
- `docs/product/decision-log.md`의 결정적 비교 규칙과 무가입 visitor 경계
- `docs/engineering/p0-development-plan.md` §7, §9.2, §11, §12, §13, §17
- `docs/specs/issue-22.md`의 response/session/cookie/rate-limit/HTTP 계약과 #23 소유권
- `supabase/migrations/20260718000200_pack_catalog.sql`의 published pack·10장·Signature 1장 불변식
- `supabase/migrations/20260718000300_owner_play_session.sql`의 `(pack_play_id, pack_version_id)` 및 self-answer composite FK 패턴
- `supabase/migrations/20260718000600_visitor_response_session.sql`의 `start_response` transaction·RLS·analytics 계약
- `AGENTS.md`
- `.codex/AGENTS.md`

### 최소 표본 규칙 해석

기존 문서의 “최소 표본 group에서 2장”은 최소 group이 1장만 남을 수 있어 그대로는 항상 2장을 보장하지 못한다. 예를 들어 비-Signature 카드 9장의 표본이 `0,1,1,1,1,1,1,1,1`이면 최소 group에는 1장뿐이다.

따라서 exact 규칙은 후보 전체를 다음 순서로 정렬해 앞의 2장을 선택하는 것으로 고정한다.

1. 같은 owner play의 제출된 필수 assignment 수 오름차순
2. `SHA-256(UTF8("gyeop-required-assignment-v1") || 0x00 || UTF8(response UUID) || 0x00 || UTF8(card ID))` bytes 오름차순
3. pack position 오름차순
4. card ID 오름차순

초기 최소 group에 2장 이상 있으면 둘 다 그 group에서 선택된다. 1장뿐이면 그 1장을 먼저 선택하고, 남은 후보 중 다음 최소 표본 카드를 두 번째로 선택한다. 이 규칙은 정확히 2장, 표본 우선, response별 다양성, 재현 가능한 tie-break를 동시에 보장한다. assignment가 저장된 뒤에는 어떤 표본 변화가 생겨도 같은 response를 재배정하지 않는다.

표본 scope는 pack version 전체가 아니라 현재 link가 속한 `pack_play_id`다. `visitor_assignments.stage='required'`이고 parent `visitor_responses.status='submitted'`인 row만 센다. draft/만료/철회 response와 다른 owner play의 assignment는 세지 않는다. #23 배포 시점에는 submit 경로가 아직 없어 production count는 0이며, #24가 status 전이를 열면 같은 query가 제출 표본을 즉시 반영한다.

## 사용자 흐름 영향

### 공개 링크 신규 시작

1. #22의 관계·시점 선택 뒤 방문자가 `start`를 보낸다.
2. RPC가 public ID, fragment secret, active public link, pack/play/version을 검증한다.
3. 같은 link의 유효 response session이 없을 때만 quota를 소비하고 response·3 assignments·두 analytics event를 한 transaction에 만든다.
4. HTTP는 `201`과 기존 Secure HttpOnly response cookie, exact 3 assignments를 반환한다.
5. 현재 #22 화면은 started placeholder를 유지한다. #24가 반환된 assignments를 3장 카드 UI에 연결한다.

### 1:1 링크 신규 시작

- active 1:1 link도 동일한 route/RPC와 관계·시점 code를 사용해 response와 3 assignments를 만든다.
- #23 시점에는 consumption column·submit 경로가 없으므로 active 1:1은 정의상 미소비다. #24는 `consumed_response_id|consumed_at`을 추가하고 신규 start 전에 미소비를 확인한 뒤 submit에서 원자 소비한다.
- disabled·expired·invalid-secret 1:1은 public과 같은 generic unavailable 결과다.
- 이 PR은 direct API/live integration으로 1:1 start를 검증한다. 1:1 invite 화면의 실제 카드 진입은 #24 범위다.

### reload·중복 시작

- same-link valid draft cookie의 `resume`은 stored response와 stored assignments를 `200`으로 반환한다.
- same-link valid draft cookie로 duplicate `start`가 와도 body의 새 관계·시점과 현재 표본을 무시하고 stored response/assignments를 반환한다.
- 두 branch 모두 `visitor_assignments`, `visitor_responses`, `response_start` bucket, analytics event 수를 바꾸지 않는다.
- assignment 순서와 카드 문구는 pack publication 불변식과 stored card FK를 통해 동일하다.
- valid cookie가 다른 link에 속하면 #22 계약대로 target `resume`은 `204`, 명시적 target `start`는 새 response·새 assignments를 만들고 cookie를 교체한다.

### 실패 상태

- pack에 정확히 Signature 1장과 최소 3장의 유효 카드가 없거나 assignment insert/FK가 실패하면 신규 branch 전체가 rollback된다. response, assignments, quota increment, analytics event가 하나도 남지 않고 HTTP는 기존 redacted internal error 경계로 수렴한다.
- new response/session credential unique collision은 nested transaction 전체를 rollback하고 `collision`을 반환한다. server adapter는 기존 제한 재시도 규칙을 사용한다.
- rate-limit 초과는 assignment/response/event 없이 `429`와 exact `Retry-After`다.
- malformed·tampered·expired response cookie와 disabled/expired/invalid link는 #22의 generic 404·cookie deletion 차이를 그대로 유지한다.
- strict decoder가 assignment cardinality, Signature 수, position, exact keys, card 문구를 거부하면 raw DB payload를 브라우저에 전달하지 않고 generic internal error로 닫는다.

## 디자인 영향

- 새 화면, modal, animation, visual token은 없다.
- 현재 public started 화면과 1:1 info 화면을 유지한다. #24가 320/390/430px 카드 UI와 접근성 상태를 소유한다.
- browser client는 assignments를 strict decode하지만 이 PR에서 owner answer나 비교 UI를 렌더하지 않는다.

## API와 데이터 영향

### migration

`supabase/migrations/20260718000700_visitor_required_assignments.sql`을 추가한다.

`public.visitor_responses`:

- `unique (id, pack_version_id)`를 추가해 assignment parent composite FK의 대상이 되게 한다.
- #22의 draft-only status/lifecycle constraint는 바꾸지 않는다. #24가 submit lifecycle을 여는 migration에서 교체한다.

`public.visitor_assignments`:

- `response_id uuid not null`
- `pack_version_id uuid not null`
- `card_id text not null`
- `stage text not null check (stage = 'required')`
- `position smallint not null check (position between 1 and 3)`
- `created_at timestamptz not null default clock_timestamp()`
- primary key `(response_id, card_id)`로 한 response의 카드 중복을 금지한다.
- unique `(response_id, stage, position)`으로 필수 순서 중복을 금지한다.
- FK `(response_id, pack_version_id) → visitor_responses(id, pack_version_id) on update restrict on delete cascade`
- FK `(pack_version_id, card_id) → pack_cards(pack_version_id, id) on update restrict on delete restrict`
- index `(response_id, stage, position)`은 unique key가 제공하므로 별도 중복 index를 만들지 않는다.

table은 RLS를 enable하고 `gyeop_internal_rpc`에 select/insert만 허용한다. public, anon, authenticated, service_role에는 direct table 권한이나 policy가 없다. update/delete grant는 이 이슈에 필요 없으며 제출/철회 이슈가 실제 mutation과 함께 추가한다.

### assignment state helper

`private.visitor_response_state(response_id)`는 response 기본 state와 `assignments` array를 함께 반환한다.

assignment exact shape:

```json
{
  "cardId": "conflict-style",
  "stage": "required",
  "position": 1,
  "visitorPrompt": "서운한 일이 생기면 이 사람은?",
  "optionA": "바로 말한다",
  "optionB": "혼자 삭인다",
  "isSignature": true
}
```

- array는 assignment position 오름차순이다.
- exact 3개, position `1,2,3`, Signature 정확히 1개여야 한다.
- `ownerPrompt`, self choice, sample count, relationship aggregate, pack/play/link/version UUID, response/session/secret hash는 assignment item에 없다.
- response top-level에는 기존 `id|status|relationshipCode|knownSinceCode|sessionExpiresAt|sessionTtlSeconds`와 `assignments`만 있다.

### `public.start_response`

exact 함수 signature와 HTTP request body는 #22와 동일하게 유지한다. migration은 `create or replace`로 구현을 확장한다.

1. input shape validation을 먼저 수행한다.
2. link, play, version을 읽고 link row를 잠근다. secret은 constant byte equality, kind는 `public|one_to_one`, status/expiry는 기존 규칙으로 확인한다.
3. existing response pair가 있으면 response를 잠그고 exact id/hash, draft, future DB expiry를 확인한다.
4. same-link valid response는 stored state/assignments를 반환한다. assignment를 다시 계산하거나 quota를 소비하지 않는다.
5. 다른-link valid response와 `resume|start` 분기는 #22 계약을 유지한다.
6. 신규 branch에서 `consume_rate_limit(..., 'response_start', 600, 10)`을 호출한다.
7. response row를 insert한다.
8. current link의 play/version과 published cards를 사용해 Signature 1장과 비-Signature ordered candidates 2장을 계산한다. card set 불변식이 깨지면 명시적 DB exception으로 중단한다.
9. 세 assignments를 한 statement로 insert한다. Signature는 position 1, 두 candidate는 tie-break order대로 2·3이다.
10. `relationship_selected`, `visitor_response_started`를 DB-derived response subject와 exact `linkKind`로 insert한다.
11. response state와 assignments를 반환한다.

steps 6~10은 같은 nested transaction이다. rate-limit, credential collision, assignment cardinality/FK/insert, analytics 중 하나라도 실패하면 신규 branch 전체가 rollback된다. collision과 rate-limit만 기존 typed outcome으로 복구하고, pack/assignment 불변식 실패는 redacted internal error로 fail closed한다.

analytics policy는 두 visitor event의 `properties.linkKind`를 `public|one_to_one` exact allowlist로 확장한다. 기존 property key allowlist와 금지 payload는 그대로다.

### deterministic hash

- domain: UTF-8 `gyeop-required-assignment-v1`
- input: `domain || 0x00 || canonical lower-case response UUID text || 0x00 || UTF-8 card ID`
- digest: PostgreSQL `digest(..., 'sha256')`의 32 bytes
- sort: bytea ascending, then `pack_cards.position`, then `pack_cards.id`
- raw session/share secret, network key, relationship code, owner choice는 hash input이 아니다.
- unit/pgTAP에는 고정 response UUID와 old-friend card IDs의 expected order vector를 하드코딩해 SQL 재작성 drift를 막는다.

### server adapter와 strict decoder

- `StartResponseResult.response`에 exact assignment item type을 추가한다.
- DB adapter는 기존 named `startResponse` 한 번만 호출하고 raw internal client/table을 export하지 않는다.
- `decodeVisitorResponseState`, HTTP state decoder, browser response decoder는 top-level exact key와 item exact key를 검사한다.
- item validation은 lower-kebab card ID, `stage='required'`, unique position `1..3`, unique card ID, trimmed non-empty prompt/options, `optionA != optionB`, boolean Signature를 확인한다.
- array는 position 순이고 정확히 한 item만 Signature이며 그 item은 position 1이어야 한다.
- DB/HTTP에 extra field, owner prompt/choice로 보이는 field, reordered/duplicate item, 2장/4장, wrong signature count가 있으면 invalid다.

### HTTP route

`POST /api/invites/[publicId]/responses`의 method/path/body/status/cookie/security header 계약은 바꾸지 않는다.

- `201 created`, `200 resumed` JSON에 assignments가 추가된다.
- public과 one_to_one은 같은 generic status mapping을 사용한다.
- no-session 204, unavailable/session-invalid 404, rate-limit 429, cookie serialize/delete 규칙은 #22와 같다.
- response body는 위 allowlist 외 owner/self/aggregate/internal field를 포함하지 않는다.
- current UI가 one_to_one start를 아직 호출하지 않아도 route-level live test는 valid 1:1 fragment로 created/resumed를 검증한다.

## 구현 계획

1. 최소 표본 singleton fallback, deterministic tie-break, submitted required sample scope를 제품 SSOT에 반영한다.
2. `visitor_responses` composite key, `visitor_assignments`, RLS/privilege/FK, assignment helper와 확장 `start_response` migration을 구현한다.
3. pgTAP sampling matrix로 exact 3장, Signature, duplicate/FK, minimum counts, deterministic vector, public/1:1, same-session idempotency, rollback을 고정한다.
4. generated Supabase types, internal RPC result type, visitor state/outcome strict decoder를 확장한다.
5. HTTP/browser adapter와 source verifier를 exact assignment allowlist에 맞춘다.
6. concurrency test를 response+assignments+quota+events cardinality까지 확장하고 route/live test로 one_to_one, resume, no-self-answer를 확인한다.
7. focused 검증, 독립 QA, `./scripts/run-ai-verify --mode full`을 통과한다.

## 완료 기준

- [ ] public과 active 1:1 신규 start가 response·quota·두 events·필수 assignments를 한 transaction에서 만든다.
- [ ] 필수 assignment는 정확히 3장, unique card 3개, position 1·2·3, Signature 정확히 1장(position 1)이다.
- [ ] 비-Signature 2장은 같은 play의 submitted required sample count가 낮은 순서로 선택되고 singleton minimum은 다음 최소 카드로 채운다.
- [ ] 동률은 exact domain-separated response+card SHA-256 vector로 결정되며 같은 response 재시도 결과가 byte-equivalent하다.
- [ ] 다른 owner play의 sample, draft response, 다른 pack version은 count에 영향을 주지 않는다.
- [ ] response/card pack-version mismatch는 두 composite FK와 RPC source selection으로 거절된다.
- [ ] same-session resume·duplicate start는 assignment/quota/response/event를 늘리지 않고 stored 관계·시점·3장을 반환한다.
- [ ] rate-limit, credential collision, malformed pack, assignment/FK/event failure는 partial response·assignment·bucket·event를 남기지 않는다.
- [ ] direct API roles는 assignments를 읽거나 쓰지 못한다.
- [ ] HTTP에는 visitor prompt, A/B labels, card ID, required position, Signature 여부만 추가되고 self choice·owner prompt·sample count·내부 ID가 없다.
- [ ] disabled/expired/invalid-secret link, malformed/tampered/expired session, 429 Retry-After와 cookie 경계가 #22와 동일하다.

## 테스트 계획

- `supabase/tests/visitor_required_assignments.test.sql`
  - table/column/PK/unique/composite FK/RLS/privilege inventory
  - old-friend fixed UUID hash order vector와 exact 3장/Signature/position
  - 0/동률, skew, singleton-minimum, 다른 play, draft 제외 sampling matrix
  - 다른 pack-version card/response FK rejection
  - public·one_to_one created/resumed, disabled/expired unavailable
  - same-session retry에서 assignment 3, quota 1, event 2 고정
  - malformed pack/forced assignment failure와 11번째 rate-limit rollback
- `tests/unit/visitor-response.test.mjs`
  - exact assignments decode, duplicate/reordered/cardinality/signature/extra-field/self-field rejection
  - HTTP/browser strict state와 existing single-flight regression
- `tests/integration/visitor-response-concurrency.test.mjs`
  - same credential concurrent start에서 created/collision, response 1, assignments 3, quota 1, events 2
  - committed response의 concurrent same-session retry가 stored assignments만 반환
- live route test
  - public·1:1 created/resumed exact JSON
  - body deep key scan에 `owner|self|choice|sample|packVersionId|playId|linkId|hash|token` 금지
  - 1:1 inactive/invalid secret generic 404, public/session security regression
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:visitor-response`
- focused pgTAP/integration/live Playwright
- `./scripts/run-ai-verify --mode full`

submitted sampling skew fixture는 pgTAP transaction 안에서 #22의 draft-only status check를 잠시 대체해 future `submitted` rows를 seed하고, test transaction rollback으로 실제 migration schema를 복원한다. production migration은 #24 전까지 draft-only lifecycle을 유지한다.

## 분석과 관측성

- 새 event 이름은 추가하지 않는다.
- `relationship_selected`, `visitor_response_started`의 exact payload와 response subject를 유지하고 `linkKind`만 public|one_to_one으로 확장한다.
- assignment card ID, position, sample count, tie hash, prompt, A/B option/choice는 analytics·log에 넣지 않는다.
- raw fragment/session secret, stored hash, network key/IP는 기존대로 log 금지다.

## 개인정보와 악용 방지

- 방문자 이름·계정·연락처를 요구하거나 저장하지 않는다.
- response cookie는 기존 Secure HttpOnly 24시간 capability이며 JS storage·URL에 복제하지 않는다.
- owner self choice와 다른 방문자의 선택·관계·sample count는 pre-submit API에서 반환하지 않는다.
- assignment table direct access는 service/anon/authenticated까지 모두 차단한다.
- rate limit은 신규 public·1:1 response 모두 network+public-ID key로 10회/10분이며 resume은 소비하지 않는다.
- deterministic hash는 secret이나 개인정보가 아닌 response UUID/card ID만 사용하며 외부에 hash를 반환하지 않는다.

## 롤아웃과 복구

- additive table/constraint와 `create or replace start_response` migration으로 배포한다.
- empty local DB에서 migrations+seed, pgTAP, generated types를 재현한다.
- rollback rehearsal은 app artifact를 이전 버전으로 되돌릴 때 추가 response JSON key를 strict old client가 거부할 수 있으므로 migration 단독 선배포를 금지하고 app+migration을 같은 release로 취급한다.
- 배포 실패 시 신규 start traffic을 차단하고 forward-fix migration으로 function/helper/policy를 교체한다. 이미 생성된 response/assignments는 FK와 저장 순서가 유효하면 보존한다.
- #24 migration은 submitted lifecycle·visitor_answers·1:1 consumption을 추가하면서 #23 sampling query와 state decoder를 호환 확장해야 한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- 블로커 없음.
- 최소 group singleton 모순은 위 ordered-candidate 규칙과 제품 SSOT 수정으로 해소한다.
- #23 시점의 active 1:1은 submit/consumption state가 아직 존재하지 않아 모두 미소비다. consumed guard와 실제 소비는 #24의 한 transaction에서 함께 추가한다.
