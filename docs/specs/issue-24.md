# Issue 24 구현 스펙: [프론트엔드] 방문자 필수 3장·즉시 비교·동일 팩 시작 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/24

## 목표

공개 또는 1:1 초대를 연 방문자가 관계·시점을 고른 뒤 배정된 A/B 질문 3장에 답하고, 제출 전에는 주인의 선택을 전혀 보지 않은 채 제출 직후 자신이 답한 세 카드만 비교한 다음 `나도 이 팩으로 시작하기`로 동일한 `old-friend` owner flow를 바로 시작하게 한다.

이 PR은 `방문자 필수 3장 저장 → 원자 제출 → 즉시 비교 → 동일 팩 전환`을 하나의 복구 가능한 same-browser loop로 닫는다. 선택 2장, 누적 프로필, 철회 transaction은 각각 #25, #27, #26이 소유한다.

## 범위

- `visitor_answers`를 추가하고 배정된 필수 카드의 `a|b`만 response별로 저장한다.
- `visitor_responses`의 상태를 `draft|submitted`로 확장하고 상태별 데이터 불변식을 DB constraint로 고정한다.
- `share_links`에 nullable unique `consumed_response_id`, `consumed_at`을 추가하고 1:1 제출 시 기존 호환 상태 `status='disabled'`와 함께 원자 기록한다.
- named `save_response_answer`, `submit_response`, `get_visitor_response`, `record_visitor_response_event` RPC와 server-only adapter를 추가한다.
- exact `GET /api/responses/[id]`, `PUT /api/responses/[id]/answers/[cardId]`, `POST /api/responses/[id]/submit`, `POST /api/responses/[id]/events`를 구현한다.
- answer 저장 domain RPC 전에 `response_answer_save`, 600초, response key당 120회 rate limit을 적용한다.
- submit domain RPC 전에 `response_submit`, 600초, response key당 10회 rate limit을 적용한다.
- 공개와 1:1 초대 모두 관계·알게 된 시점 선택 뒤 같은 필수 3장 화면으로 연결한다. 유효한 같은 response cookie가 있으면 `get_visitor_response`로 저장 진행·제출 비교를 복구한다.
- 3장 카드, 진행률, optimistic 선택, 순서 보존 save queue, 저장 실패 재시도, 세 저장 완료 뒤 제출 gate를 구현한다.
- 제출 직전에 Web Crypto로 32-byte management secret을 한 번 만들고 response별 browser storage에 `pending`으로 보관한다. submit 성공 또는 submitted reload 복구 뒤 같은 secret을 `completed`로 표시한다.
- 비교 화면에서 같은 항목·다른 항목, 결정적 대표 차이 또는 전부 같음, 관계·알게 된 시점을 보여준다.
- `/responses/manage#token=<raw-management-secret>`을 복사하는 control과 Clipboard 성공·실패 feedback, readonly 수동 선택 fallback을 제공한다.
- Primary CTA는 `/play/new?pack=old-friend&source=same_pack_cta`로 이동한다. 클릭 event 기록은 전환을 막지 않는 `keepalive` 요청으로 시도하며, query source는 #31의 실제 `pack_opened.entry_source=same_pack_cta` 기록 입력으로 보존한다.
- `visitor_required_answer_saved`, `visitor_required_submitted`, `comparison_viewed`, `same_pack_start_clicked`를 답 값·raw token 없이 기록한다.
- `comparison_viewed|same_pack_start_clicked`에는 `(visitor_response_id, event_name)` partial unique index를 두고 event RPC는 response row lock 뒤 insert subtransaction에서 `analytics_visitor_terminal_event_unique_idx` 충돌만 성공으로 흡수해 두 동시 요청 모두 204, DB row는 하나가 되게 한다. 다른 unique constraint 충돌은 다시 throw한다. 이 방식은 analytics table SELECT 권한을 추가하지 않는다. 카드별 최대 3건이 필요한 `visitor_required_answer_saved`는 이 index 대상이 아니다.
- generated DB types, strict decoder, source verifier, unit·pgTAP·integration·Playwright를 함께 갱신한다.

## 제외 범위

- 제출 뒤 선택 2장 추가 배정·저장·비교. #25가 소유한다.
- management link에서 실제 철회하는 `/responses/manage` 화면과 `withdraw_response`. #26이 소유한다. 이번 PR은 #26이 사용할 exact fragment URL과 raw secret 보관·복사만 만든다.
- 주인용 누적 시선 수, 관계별/카드별 집계, 공개 프로필. #27이 소유한다.
- 주인·방문자용 1:1 개별 비교 관리 화면. #28이 소유한다.
- `pack_opened`를 포함한 owner 시작·완료·재공유 전체 event schema와 퍼널 SQL. #31이 소유한다. 이번 PR은 visitor 네 event와 same-pack source 전달까지만 구현한다.
- 이메일·알림 job, Auth 귀속, 계정 삭제, 보관 cleanup.
- 이름·닉네임·연락처·자유 텍스트, 친밀도 점수·순위·AI 요약.
- 이미 가진 owner capability를 폐기해 강제로 새 play를 만드는 동작. P0 same-browser owner는 기존 owner session 계약을 유지하며 CTA는 동일 팩 owner bootstrap으로 직접 이동한다.

## SSOT

- `docs/product/core-feature-priority.md` §5.5~5.7
- `docs/product/question-pack-spec.md` §6~9, §12
- `docs/product/decision-log.md`의 방문자 3장, 무가입 관리 링크, 대표 차이, 동일 팩 전환 결정
- `docs/engineering/p0-development-plan.md` §7–13, §15–17
- `docs/specs/issue-22.md`의 response cookie·24시간 고정 TTL·response-start HTTP 계약
- `docs/specs/issue-23.md`의 assignment 3장·공개/1:1 start·필드 allowlist 계약
- `supabase/migrations/20260718000600_visitor_response_session.sql`
- `supabase/migrations/20260718000700_visitor_required_assignments.sql`
- `AGENTS.md`
- `.codex/AGENTS.md`

충돌 시 `.codex/AGENTS.md`에 적힌 순서대로 active product SSOT를 우선한다. 질문·선택지·Signature와 `old-friend-v1` 내용은 바꾸지 않는다.

## 사용자 흐름 영향

### 신규 공개·1:1 방문자

1. 방문자는 `/i/[publicId]#k=<share-secret>`을 연다. fragment secret은 기존처럼 invite metadata/start body에서만 사용하고 path·log에 넣지 않는다.
2. 공개와 1:1 모두 관계·알게 된 시점을 고른다. 1:1은 `나에게 온 1:1 초대`, 공개는 `여러 친구가 함께 참여`라는 맥락만 다르고 입력·3장 흐름은 같다.
3. 기존 start route가 response와 Signature 1장+비-Signature 2장을 반환한다. UI는 response의 position 1부터 질문을 보여준다.
4. A/B를 누르면 화면 선택을 즉시 반영하고 순서 보존 queue에 PUT을 넣는다. 다음 질문으로 이동하되 이전 save 실패가 있으면 queue를 멈추고 선택을 보존한 채 명시적 재시도를 제공한다.
5. 세 카드가 서버에 모두 저장되고 queue/in-flight/failed가 없을 때만 submit을 시작한다. browser storage에 같은 response의 pending secret이 있으면 재사용하고, 없으면 Web Crypto로 한 번 생성해 pending write가 성공한 뒤에만 POST한다.
6. submit 성공 body가 strict submitted state이면 비교 화면을 연고 pending record를 completed로 바꾼다.
7. 비교를 처음 실제 렌더한 뒤 `comparison_viewed`를 idempotent하게 기록한다.
8. `응답 관리 링크 복사`는 사용자가 누른 순간에만 전체 fragment URL을 조립해 Clipboard에 쓴다. 실패하면 같은 URL을 readonly input에 보여주고 선택·수동 복사를 안내한다.
9. `나도 이 팩으로 시작하기`는 pack 탐색이나 선택 2장을 거치지 않고 same-pack URL로 이동한다. `same_pack_start_clicked` 요청 실패를 CTA 실패로 보이지 않는다.

### 새로고침·뒤로 가기·응답 유실

- active invite metadata를 읽은 뒤 공개/1:1 구분 없이 기존 response cookie로 `GET /api/responses/[id]`를 호출한다. 기존 invite start `resume`은 response id를 모를 때의 호환 경로로만 남기고, response를 얻은 뒤 모든 진행 복구는 named GET을 사용한다.
- draft GET은 동일 assignments와 저장된 visitor choice만 반환한다. 첫 미저장 카드로 이동하며 저장된 카드는 이전으로 돌아가 수정할 수 있다.
- 세 답이 모두 저장된 draft를 복구하면 pending secret을 읽거나 새로 만든 뒤 submit을 재시도한다.
- 첫 submit DB commit 뒤 HTTP 응답이 유실되면 browser storage의 pending secret과 기존 24시간 cookie를 유지한다. 같은 POST 재시도는 같은 secret hash일 때 같은 submitted 결과를 200으로 반환한다.
- POST를 재시도하기 전에 reload되어 GET이 submitted를 반환해도, 같은 pending secret을 completed로 승격해 같은 관리 URL과 복사 UI를 복구한다.
- submit이 409를 반환한 뒤 GET이 submitted를 반환하면 저장 hash와 local pending secret이 다르다는 뜻이므로 local record를 제거한다. 비교와 CTA는 열되 관리 링크는 즉시 복구 불가로 안내한다.
- submitted GET은 같은 비교 결과를 반환한다. 뒤로 가기나 duplicate submit은 answer, link consumption, submitted/comparison event를 늘리지 않는다.
- submitted인데 해당 response의 pending/completed raw secret을 browser storage에서 잃은 경우 서버는 재발급하지 않는다. 비교와 CTA는 유지하고 관리 링크만 복구 불가로 안내한다. 정상 success·lost-response·reload 시나리오는 같은 storage record를 유지하므로 항상 같은 복사 UI를 보인다.

### 1:1 경쟁 제출

- 같은 active 1:1 링크로 여러 response가 draft까지 만들어질 수 있다.
- submit은 link row를 잠근다. `consumed_response_id is null`인 첫 response만 제출·소비를 함께 commit한다.
- link가 다른 response에 의해 소비됐으면 현재 response는 draft를 유지한 채 409 `VISITOR_RESPONSE_CONFLICT`를 받는다. management hash, submit event, link timestamp는 바뀌지 않는다.
- 소비한 response 자신의 같은-secret duplicate는 link가 consumed여도 idempotent 200이다. 다른 secret은 409이고 비교 body를 반환하지 않는다.

## 디자인 영향

- 기존 검정 배경, 라임 accent, blue focus/offset 언어를 유지한다. 새 디자인 시스템이나 별도 illustration을 추가하지 않는다.
- Lazyweb quick search에서 확인한 방향은 측정된 전환 근거가 아니라 directional reference다. 한 화면 한 질문, 분명한 `n/3` 진행, 큰 tap target, 결과 직후 단일 primary CTA를 적용한다.
- 질문 화면은 320~430px에서 상단 pack 맥락, `1/3`과 native `progress` 또는 동등한 progressbar, 저장 상태, 방문자 질문, 두 A/B 버튼, 이전 control을 첫 viewport에서 사용할 수 있게 한다.
- A/B 전체 card가 최소 44px target이고 keyboard/Space/Enter로 선택 가능해야 한다. selected는 color만이 아니라 border·`aria-pressed`로 구분한다.
- save status는 `자동 저장`, `저장 중…`, `저장됨`, `저장 실패 · 재시도`를 `aria-live=polite`로 알린다. 오류는 선택과 진행을 지우지 않는다.
- 질문 전환 때 새 h1에 focus하되 저장 status는 focus를 가져가지 않는다. reduced motion에서는 transition duration을 제거한다.
- 비교는 세 카드 각각에 `내가 본 이 사람`과 `이 사람의 실제 답`을 나란히 표시한다. 같음/다름은 text label과 icon/shape를 함께 사용한다.
- 대표 차이가 있으면 Signature 차이를 먼저 강조하고, 없으면 pack position 첫 차이를 강조한다. 세 카드가 같으면 `세 항목을 모두 같게 봤어요`만 표시하고 가짜 차이·점수를 만들지 않는다.
- 관계·알게 된 시점은 registry의 최종 한글 label로만 보여준다.
- 결과 화면의 가장 강한 visual action은 `나도 이 팩으로 시작하기`다. 관리 링크 복사는 secondary, #25의 `2장 더 답하기`는 이번 PR에 렌더하지 않는다.
- Clipboard 실패 fallback은 label이 있는 readonly input, `전체 선택` control, 수동 복사 안내를 제공한다. success/failure 문구는 screen reader에 전달된다.

## API와 데이터 영향

### DB migration

새 additive migration `20260718000800_visitor_required_response.sql`은 다음을 한 transaction에서 적용한다.

- `visitor_responses.status` check를 `draft|submitted`로 교체한다.
  - draft: 기존 관계·시점·session hash/expiry가 있고 management hash·submitted_at·withdrawn_at은 null.
  - submitted: 관계·시점·session hash/고정 expiry가 있고 32-byte management hash·submitted_at이 있으며 withdrawn_at은 null.
- `visitor_answers(response_id, pack_version_id, card_id, choice, created_at, updated_at)`를 추가한다.
  - PK `(response_id, card_id)`.
  - `choice in ('a','b')`.
  - response+pack과 assignment+pack+card composite FK로 배정되지 않은 카드 및 다른 version 카드를 구조적으로 차단한다.
  - RLS enabled, `gyeop_internal_rpc`만 select/insert/update, `PUBLIC|anon|authenticated` 직접 접근 불가.
- 기존 `share_links.status`의 `active|disabled|expired`를 유지하고 `consumed_response_id uuid unique`, `consumed_at timestamptz`를 추가한다.
  - public은 두 consumed field가 항상 null이다.
  - 소비된 one_to_one은 두 field가 함께 non-null이고 기존 호환 상태 `status='disabled'`다. 일반 disabled link는 두 field가 모두 null이다.
  - `visitor_responses`에 unique `(id, share_link_id)`를 두고 `(share_links.consumed_response_id, share_links.id) → visitor_responses(id, share_link_id)` composite FK를 추가해 consumed response가 같은 link에 속하도록 구조적으로 강제한다. submit transaction도 잠금 아래 같은 binding을 재검증한다.
- 기존 `start_response`를 배포 권한상 덮어쓰지 않고 새 `start_required_response` v2를 추가해 consumed 1:1은 해당 response만 재개하고 신규 start는 unavailable로 수렴시킨다. 새 앱은 v2만 호출하고 직전 앱은 v1을 계속 호출할 수 있다.
- 기존 owner link reader/browser의 `active|disabled|expired`, `consumedAt:null` 계약은 이번 migration 뒤에도 유지한다. 소비 row 자체를 `status='disabled'`로 저장하므로 직전 `list_owner_share_links`와 strict decoder도 별도 앱-side mapping 없이 그대로 읽고 `consumed_response_id`를 노출하지 않는다. consumed 전용 owner 표현이 필요해질 때 versioned v2 reader를 별도 추가하며 기존 reader 의미를 깨지 않는다.
- analytics insert policy를 visitor 네 event까지 exact allowlist로 확장한다.
- `comparison_viewed|same_pack_start_clicked` 전용 partial unique index를 추가한다. `record_visitor_response_event`는 submitted response row를 `FOR UPDATE`한 뒤 insert하고 named `analytics_visitor_terminal_event_unique_idx` 충돌만 성공으로 취급하며 다른 unique 충돌은 다시 throw한다.
- 모든 새 `SECURITY DEFINER`는 `search_path=''`, schema-qualified object, public execute revoke, internal role grant를 지킨다.

### response state wire contract

DB/RPC state는 strict union이다. 공통 필드는 다음 exact set을 가진다.

- `id`, `status`, `relationshipCode`, `knownSinceCode`, `sessionExpiresAt`, `sessionTtlSeconds`, `assignments`.
- HTTP layer만 registry-derived `relationshipLabel`, `knownSinceLabel`을 추가한다.
- assignment 공통 필드: `cardId`, `stage='required'`, `position=1|2|3`, `visitorPrompt`, `optionA`, `optionB`, `isSignature`, `visitorChoice`. 직전 앱의 strict draft decoder 호환을 위해 draft에는 새 key를 추가하지 않는다.
- draft의 `visitorChoice`는 `a|b|null`이고 owner choice·match·sample count·owner prompt·pack/play/link 내부 ID는 어떤 key에도 없다.
- submitted assignment만 `packPosition:1..10`, `ownerChoice:'a'|'b'`, `matches:boolean`, `isHighlight:boolean`을 추가한다. 세 visitorChoice는 모두 non-null이어야 하고 highlight는 차이가 있을 때 정확히 하나, 모두 같을 때 0개다.
- submitted top-level은 `allMatched:boolean`을 추가한다. same/different 목록은 assignment의 결정적 order와 `matches`로 derive해 중복 payload를 만들지 않는다.
- assignments는 항상 pack position이 아니라 저장된 required position 1~3 순이다. highlight 선택은 Signature different 우선, 아니면 underlying pack card position 첫 different다.
- 모든 state decoder는 exact key, canonical UUID/card id, timestamp/TTL, 3장/required position/Signature를 검증한다. submitted decoder는 추가로 고유 pack position, choice/match와 Signature 우선·pack position fallback highlight 불변식을 검증하고 위반 시 fail closed한다.

### exact HTTP contract

모든 성공·오류는 `Cache-Control: private, no-store`다. response cookie는 submit에서 회전하지 않고 DB `session_expires_at`까지 기존 Secure HttpOnly fixed expiry를 다시 serialize한다.

| 목적           | method/path                                | body                                                            | 성공                             | 주요 실패                                                       |
| -------------- | ------------------------------------------ | --------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| 진행/비교 복구 | `GET /api/responses/[id]`                  | 없음                                                            | 200 strict draft/submitted state | absent·cross-response·expired·malformed session은 generic 404   |
| 답 저장        | `PUT /api/responses/[id]/answers/[cardId]` | `{ "choice": "a" or "b" }`                                      | 200 strict draft state           | unassigned/cross-response/expired 404, submitted 409, limit 429 |
| 제출           | `POST /api/responses/[id]/submit`          | `{ "managementSecret": "<32-byte base64url>" }`                 | 200 strict submitted state       | incomplete/다른 secret/1:1 경쟁 409, expired 404, limit 429     |
| 화면 event     | `POST /api/responses/[id]/events`          | `{ "event": "comparison_viewed" or "same_pack_start_clicked" }` | 204                              | draft/cross-response/expired 404, invalid input 400             |

- dynamic response id는 canonical v4 UUID, card id는 reviewed lower-kebab만 허용하고 `encodeURIComponent`로 구성한다.
- GET은 response path id와 cookie response id가 같아야 한다. 다른 response 존재 여부를 구분하지 않는다.
- PUT/POST는 공통 request boundary의 exact JSON, origin, body-size, abort, private no-store를 사용한다.
- route는 cookie의 response id/session hash를 server-only wrapper에 전달한다. browser JS는 HttpOnly session cookie를 읽지 않는다.
- malformed/expired same response cookie는 delete cookie를 포함한 generic 404로 수렴한다. 다른 response id를 요구한 요청은 현재 valid cookie를 지우지 않는다.
- PUT/submit의 exact 처리 순서는 `(1) path·method·Origin·body schema 검사 → (2) response cookie 문법 검사와 path ID=cookie response ID 확인 → (3) response action rate limit → (4) domain RPC의 session hash·DB expiry·status·assignment/answer/link 검증과 mutation`이다. 1~2 실패는 bucket을 소비하지 않는다. DB를 읽어야 아는 expired/submitted/incomplete/same-secret duplicate 상태는 모두 limiter 뒤에서 판정한다.
- rate-limit key는 raw cookie/hash를 직접 쓰지 않는다. canonical response UUID UTF-8 bytes 앞에 action별 tag와 `0x00`을 붙여 SHA-256한다.
  - answer: `SHA-256(UTF8("gyeop-response-answer-save-v1") || 0x00 || UTF8(response UUID))`
  - submit: `SHA-256(UTF8("gyeop-response-submit-v1") || 0x00 || UTF8(response UUID))`
  - UUID `22000000-0000-4000-8000-000000000001` vector는 answer `51bfa4f29109adfd68625a185fb130cd447ee30266a0a195a7db24d3da01d57a`, submit `4bdcce0d0dfc3f822f89a04b3fb41c608520c27658bf402491b9056c96b73d2a`다.
- structurally valid matching-cookie 요청의 limit+1은 실제 response가 expired/submitted/incomplete이거나 same-secret duplicate여도 domain RPC 전에 429다. limit 안에서는 각각 404/409/409/200이다. arbitrary path와 matching valid cookie 없이는 bucket을 채우거나 이 우선순위를 관찰할 수 없다.
- limit+1 요청은 domain RPC를 호출하지 않으므로 answer/status/event/link consumption이 바뀌지 않는다. `Retry-After`는 fixed window의 남은 양의 정수 초다.

### save transaction

- response row와 session hash를 확인하고 `session_expires_at > clock_timestamp()`, `status='draft'`를 검사한다.
- assignment membership과 같은 pack version을 확인한 뒤 visitor answer를 upsert한다. `a|b` 외 값은 schema와 DB 모두 거부한다.
- 해당 카드의 첫 insert에만 값 없는 `visitor_required_answer_saved`를 같은 transaction에 기록한다. 같은 값 재시도나 수정은 저장은 성공하지만 event를 추가하지 않는다.
- event properties exact set은 `{ packVersion, linkKind }`이고 card id/position/choice/관계/token을 넣지 않는다.
- owner self answer를 읽거나 state에 포함하지 않는다.

### management secret 검증·hash 계약

- active engineering SSOT의 “submit transaction이 raw 형식·길이를 검사한다”는 표현을 이번 PR에서 안전한 server boundary 계약으로 정렬한다. Route가 raw canonical base64url과 decoded 32-byte 길이를 검사하고 hash한 뒤, DB transaction은 exact 32-byte hash만 재검증·저장한다.
- exact hash는 `SHA-256(UTF8("gyeop-visitor-management-v1") || 0x00 || raw 32 bytes)`다. raw bytes `00 01 02 ... 1f`(base64url `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`)의 hash는 `a3d92f51751e5ef82ff0d9ada678b4fdb3ab20a2fef6f4ac58a37e2ca775150d`다.
- raw secret을 SQL/RPC argument로 전달하지 않는 이유는 PostgreSQL statement/error 관측면까지 원문 노출 범위를 넓히지 않기 위해서다. 이 책임 변경을 `p0-development-plan.md` §9.3·§11.3에 같은 PR로 기록하고 #26은 같은 helper와 vector를 재사용한다.

### submit transaction

- Route는 raw management secret이 padding 없는 canonical base64url이며 decode 결과가 정확히 32 bytes인지 검사하고 위 exact SHA-256 hash만 RPC에 전달한다. raw 값은 DB arg, log, analytics, response에 넣지 않는다.
- RPC는 hash가 정확히 32 bytes인지 검사하고 `share_links → visitor_responses` 순서로 row를 잠근다. 이는 후속 notification 교체본의 `pack_plays → share_links → visitor_responses → notification_jobs` 순서와 호환된다.
- draft는 required assignments와 visitor answers가 정확히 3개이고 모두 A/B인지, owner self answer가 세 카드 모두 존재하는지 확인한다. 하나라도 빠지면 상태·link·event·management hash를 바꾸지 않고 `incomplete`다.
- public link는 active 여부와 response binding만 확인한다. 1:1은 consumed null일 때 response submit과 같은 transaction에서 `status='disabled'`, `consumed_response_id=response.id`, `consumed_at=v_now`를 기록한다.
- response를 `submitted`, `submitted_at=v_now`, `management_token_hash=p_hash`로 바꾸고 `visitor_required_submitted`를 정확히 한 번 insert한다.
- 이미 submitted면 저장 hash가 같은 경우에만 같은 submitted state를 반환한다. 다른 hash는 conflict이며 비교를 반환하지 않는다.
- 1:1 link가 같은 response에 의해 이미 consumed된 same-hash duplicate는 idempotent success다. 다른 response가 소비했으면 current response를 변경하지 않는다.
- comparison은 제출 후에만 owner self choice를 join한다. assignment 밖 카드, owner prompt, 다른 visitor, 관계 집계는 반환하지 않는다.
- 같은 transaction의 첫 commit만 response/link/event를 바꾼다. duplicate submit·GET·event 재시도는 결과가 결정적이다.

### browser management secret

- key는 versioned response-scoped 고정 이름을 사용한다. value exact shape는 `{ "version": 1, "responseId", "status": "pending"|"completed", "secret" }`이며 secret은 canonical 32-byte base64url이다.
- 생성은 `crypto.getRandomValues(new Uint8Array(32))`만 사용한다. `Math.random`, UUID, server-issued token을 사용하지 않는다.
- pending write가 throw하거나 round-trip strict decode에 실패하면 submit을 보내지 않고 사용자에게 browser 저장 실패와 재시도를 알린다.
- 같은 response pending/completed record가 있으면 새 secret을 만들지 않는다. malformed record는 제거하고 draft이면 새로 만들 수 있지만 submitted이면 재발급하지 않는다.
- 관리 URL은 복사 action 순간 `window.location.origin + '/responses/manage#token=' + secret`으로 계산한다. URL 전체를 storage, analytics, console, server request에 별도 저장하지 않는다.

## 구현 계획

1. migration에 visitor answer, submitted/consumed constraints, named RPC, analytics policy를 구현하고 generated DB types와 source verifier를 갱신한다.
2. visitor response pure decoder를 draft/submitted union으로 확장하고 save/get/submit/event outcome decoder, management secret encode/decode·storage pure helper, response rate key vector를 추가한다.
3. `lib/db/internal-rpc.ts`에 named wrappers만 추가한다. generic Supabase client나 `.from()`을 다른 module로 내보내지 않는다.
4. HTTP server wrapper에 same-response cookie authorization, rate-limit-before-domain, exact error mapping과 fixed cookie serialization을 구현한다.
5. 네 exact Route Handler와 strict Zod schema를 추가한다. source policy verifier가 method/path/body와 raw token/log 금지 경계를 검사하게 한다.
6. visitor browser client를 GET/PUT/submit/event로 확장하고 exact no-store/error/Retry-After/state decoding을 적용한다.
7. `visitor-flow-core.mjs`에 first-unanswered, optimistic choice, ordered queue, failure/retry, submit eligibility, comparison derivation 검증을 pure state로 구현한다.
8. invite entry를 공개/1:1 공통 관계 form → 3장 → 비교 state machine으로 교체한다. 기존 unavailable/retry redaction과 metadata fragment 처리는 유지한다.
9. management secret pending/completed recovery, copy feedback/manual fallback, same-pack keepalive event와 direct navigation을 연결한다.
10. pgTAP·concurrency·Route integration·source gate·mobile Playwright를 추가하고 focused test, build, full verify를 통과한다.

## 완료 기준

- [ ] 공개와 1:1 모두 관계·시점 선택 뒤 stored Signature 1장+비-Signature 2장을 정확히 한 번 보여주며 reload에서 같은 assignments를 복구한다.
- [ ] 필수 3장 submit 전 UI, GET, PUT, RPC 어디에도 owner prompt·owner choice·match·관계 집계가 없다.
- [ ] 배정되지 않은 card, 다른 pack version card, A/B 외 choice는 저장되지 않는다.
- [ ] 첫 save만 response/card answer row와 값 없는 saved event를 만들고 같은 값 재시도·수정은 row를 늘리지 않는다.
- [ ] save 120/10분/response 뒤 121번째는 domain mutation 없이 429와 window 잔여 `Retry-After`를 반환한다.
- [ ] 세 answer가 모두 persisted되고 queue/in-flight/failed가 없을 때만 submit한다. 0~2장에서는 owner choice를 반환하지 않는 409다.
- [ ] submit 10/10분/response 뒤 11번째는 response/link/event를 바꾸지 않고 429와 정확한 `Retry-After`를 반환한다.
- [ ] 첫 submit은 status, management hash, submitted event, 1:1 consumption을 한 transaction으로 commit한다.
- [ ] 서로 다른 1:1 response의 동시 submit은 정확히 하나만 성공하고 다른 response는 draft·unmanaged 상태와 409를 유지한다.
- [ ] 같은 response+same secret duplicate submit은 같은 비교를 200으로 반환하고, 다른 secret은 409이며 event를 늘리지 않는다.
- [ ] first commit response 유실 뒤 같은 pending secret 재시도 또는 submitted GET reload가 같은 비교와 같은 관리 링크를 복구한다.
- [ ] DB에는 management hash만 있고 raw secret/전체 관리 URL은 browser storage·fragment·사용자 clipboard 외에 남지 않는다.
- [ ] submitted state는 방문자가 답한 세 카드의 owner choice만 반환하고, match/highlight/allMatched가 Signature 우선·pack 순서 규칙으로 매번 같다.
- [ ] 차이가 있으면 highlight가 정확히 하나이고 세 카드가 같으면 `세 항목을 모두 같게 봤어요`와 highlight 0개다.
- [ ] 관계·시점은 final Korean registry label로 표시되고 내부 code만 wire/event에 허용된다.
- [ ] management copy 성공·권한 거부·기타 실패가 접근 가능한 feedback을 내고 실패 시 readonly 전체 URL을 선택·수동 복사할 수 있다.
- [ ] `comparison_viewed`, `same_pack_start_clicked`는 submitted response에서 각각 최대 한 번이며 event 요청 실패가 비교나 CTA를 막지 않는다.
- [ ] 두 화면 event의 동시 요청은 모두 204로 끝나고 partial unique+row lock+conflict-ignore로 DB에는 event별 정확히 한 row만 남는다. saved-answer event 3건은 partial unique 대상이 아니다.
- [ ] Primary CTA가 `/play/new?pack=old-friend&source=same_pack_cta`로 직접 이동하고 pack 탐색·선택 2장을 거치지 않는다.
- [ ] visitor 네 event properties에 A/B 값, 관계, card id, token, URL, IP, user agent가 없다.
- [ ] expired/cross-response/malformed session은 answer/submit/compare/event를 수행하지 않고 다른 response 존재 여부를 노출하지 않는다.
- [ ] 320/390/430 viewport에서 horizontal overflow가 없고 progress, 44px target, keyboard/focus, aria-live, reduced-motion을 통과한다.

## 테스트 계획

- `node --test tests/unit/visitor-response.test.mjs tests/unit/visitor-flow-core.test.mjs tests/unit/visitor-response-policy.test.mjs`
  - strict draft/submitted state와 leakage key 거절
  - saved answer 복구, ordered queue, same-card 수정, failed head/retry, submit gate
  - Signature 우선 highlight, pack-order fallback, all-match
  - Web Crypto 32-byte/base64url vector, pending/completed storage, malformed/lost record
  - exact GET/PUT/POST/event method/path/body/no-store/Retry-After
  - raw fragment/storage/log/direct data client 금지 source fixture
- pgTAP
  - visitor answer assignment/composite FK/RLS/status constraints
  - save first-event idempotency, expired/submitted rejection
  - submit incomplete, public success, 1:1 consume, same-secret duplicate, different-secret conflict
  - comparison exact field allowlist/highlight/all-match
  - `PUBLIC|anon|authenticated` direct table/RPC denial과 SECURITY DEFINER catalog gate
- `node --test tests/integration/visitor-response-session.test.mjs tests/integration/visitor-response-concurrency.test.mjs`
  - 실제 GET → 3 PUT → submit → GET reload
  - pre-submit leakage, unassigned/invalid choice, expired/cross-session generic response
  - answer-save 120+1, submit 10+1 atomic 429/Retry-After
  - draft·expired·submitted answer와 incomplete·same-secret duplicate submit 각각에 대해 limit-1/limit/limit+1 오류 우선순위와 domain/event 무변경 matrix
  - 다른 1:1 response 동시 submit exactly-one commit
  - duplicate/lost-response recovery와 event count
  - comparison/CTA event 각각 동시 2회 요청은 HTTP 204 두 건·DB count 1
- `pnpm exec playwright test tests/e2e/visitor-response.spec.ts --project=mobile-chromium`
  - 공개/1:1 관계 form → 3장 → 비교 → same pack
  - refresh/back/saved progress/failed save retry/submit response loss
  - management Clipboard success, NotAllowedError, generic failure, manual fallback, reload same URL
  - 320/390/430, keyboard, focus, aria-live, reduced motion
- `GYEOP_E2E_LIVE=1 pnpm exec playwright test tests/e2e/visitor-response-live.spec.ts --project=mobile-chromium --workers=1`
  - local Supabase와 실제 Secure HttpOnly cookie로 public/1:1 happy path, DB comparison·consumption·events 확인
- `node scripts/verify-visitor-response.mjs`
- `pnpm typecheck`
- `pnpm build`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- `visitor_required_answer_saved`: 해당 card가 처음 저장된 transaction에서 한 번. properties `{packVersion, linkKind}`.
- `visitor_required_submitted`: 첫 submit commit에서 response당 한 번. properties `{packVersion, linkKind}`.
- `comparison_viewed`: submitted comparison 최초 실제 render 뒤 response당 최대 한 번. properties `{packVersion, linkKind}`.
- `same_pack_start_clicked`: Primary CTA action에서 response당 최대 한 번. properties `{packVersion, linkKind}`.
- 네 event 모두 `visitor_response_id` FK로 내부 연결하지만 properties에는 response id를 복제하지 않는다.
- `same_pack_start_clicked` 뒤 URL source는 #31이 `pack_opened.entry_source=same_pack_cta`와 대조한다. 이번 PR은 전체 funnel SQL이나 dashboard를 만들지 않는다.
- client/server는 raw response body, choice, token, fragment URL을 console/log에 남기지 않는다. 기존 redacted request id와 오류 code만 유지한다.

## 개인정보와 악용 방지

- 제출 전 owner self choice는 DB join조차 하지 않는 draft state builder로 차단한다. 제출 뒤에도 답한 세 카드만 join한다.
- response session cookie의 DB expiry가 권한의 최종 근거다. browser cookie 존재·Max-Age를 신뢰하지 않는다.
- response path와 cookie id가 다르면 동일한 generic 404다. 다른 response의 assignment·answer·상태를 반환하지 않는다.
- raw management secret은 browser Web Crypto가 만들고 서버 memory에서 validate/hash한 뒤 버린다. DB, analytics, log, URL path/query, response body에 넣지 않는다.
- 관리 URL은 fragment를 사용해 reverse proxy/referrer에 secret이 전달되지 않게 한다. `/responses/manage`는 #26 전까지 철회 기능을 열지 않지만 fragment는 그 exact 후속 계약을 따른다.
- 1:1 link consumption은 row lock과 unique consumed response로 경쟁 제출을 막는다. 철회해도 재개방하지 않는 규칙은 #26이 이어받는다.
- rate-limit key와 analytics에는 IP/user-agent/choice 원문이 없다. answer save·submit limit은 response UUID에서 domain-separated hash로 derive한다.
- event insert policy는 허용 event별 exact properties를 강제한다. 브라우저가 임의 event 이름이나 property를 보낼 수 없다.

## 롤아웃과 복구

- migration은 기존 #22/#23 draft response를 그대로 유효하게 유지한다. 새 `visitor_answers`는 비어 있고 consumed field는 null이므로 backfill mutation이 없다.
- DB migration을 먼저 적용하면 기존 app은 draft start/assignment를 계속 읽을 수 있다. 새 app은 migration 이후에만 PUT/submit route를 연다.
- migration은 additive 후 constraint 교체라 배포 후 destructive down migration을 실행하지 않는다. 심각한 UI 회귀는 app을 직전 호환 release로 rollback하고 신규 answer/submit route를 닫되 이미 submitted/consumed row를 draft로 되돌리거나 management hash를 삭제하지 않는다.
- submit RPC 회귀는 forward-fix migration으로 교체한다. consumed 1:1을 다시 active로 만들지 않는다.
- production smoke 전 local reset에서 public/1:1 happy path, concurrent consume, lost-response recovery, pre-submit leakage를 통과한다.
- rollback 기준 artifact는 소비 DB row에 저장된 기존 상태 `disabled`와 기존 projection `consumedAt:null`을 그대로 strict decode한다. migration fixture는 submitted response+소비 link를 만든 뒤 현재/직전 owner list가 다른 링크까지 함께 strict decode하고, 소비 invite는 unavailable이며 raw consumed response ID가 노출되지 않음을 검증한다.
- submitted public response를 가진 같은 browser가 기능 이전 artifact로 invite를 다시 열면 비교 기능이 없으므로 generic fail-closed 화면으로 수렴할 수 있다. 다른 owner link 목록이나 미제출 방문자 흐름까지 함께 깨지는 rollback은 허용하지 않는다.

## 스펙 검토

Reviewer Agent: issue24_spec_rereview
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- browser storage가 막힌 환경에서는 복구 가능한 management secret을 보장할 수 없으므로 submit을 보내지 않는다. server-issued fallback이나 재발급은 제품 결정과 충돌해 추가하지 않는다.
- same-browser owner capability가 이미 있으면 same-pack CTA의 `/play/new`가 기존 owner play를 재개할 수 있다. 이번 이슈에서 기존 owner 데이터를 폐기하지 않으며, 새 owner multi-play 정책은 재미 검증 뒤 별도 결정이다.
- `same_pack_start_clicked` keepalive가 navigation 중 유실될 수 있다. CTA를 막지 않는 제품 우선순위를 유지하고 #31에서 실제 `pack_opened` source와 함께 퍼널 누락률을 검증한다.
- 비교 조회 권한은 24시간 response session이다. 장기 재조회는 management link 철회 capability와 별개이며 이번 P0 범위에 없다.
- 구현 전 해결해야 할 외부 블로커는 없다.
