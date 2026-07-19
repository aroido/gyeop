# Issue 28 구현 스펙: [프론트엔드] 주인·방문자 전용 1:1 개별 비교 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/28

## 목표

한 명에게 보낸 1:1 링크의 제출 결과를 링크를 만든 주인과 답한 방문자만 각자의 기존 비밀 세션으로 확인하게 하고, 이름·식별자·공개 집계 없이 카드별 `겹침/다름`을 다시 볼 수 있게 한다.

## 범위

- `list_owner_1to1_responses(p_play_id, p_management_secret_hash)`와 `get_private_1to1_comparison(p_play_id, p_management_secret_hash, p_response_id)` SECURITY DEFINER RPC를 추가한다.
- owner 전용 `GET /api/me/plays/[playId]/responses?kind=one_to_one` 목록 API와 `GET /api/me/responses/[responseId]` 상세 API를 추가한다.
- `/me/plays/[playId]` 공유 관리 화면 아래에 완료된 1:1 응답 목록, 빈 상태, 철회 상태, 개별 카드 비교 상태를 구현한다.
- owner 목록은 response/link 상태와 관계 code·시각만 반환하고 답 선택·질문·visitor session·secret/hash를 반환하지 않는다.
- owner 상세는 해당 owner play에 종속된 `submitted` 1:1 response의 답한 카드 비교만 반환한다.
- visitor는 기존 `GET /api/responses/[id]`와 `get_visitor_response`를 그대로 사용하며, 만료 전 동일 response cookie만 자기 비교를 읽는다.
- 철회 뒤 owner 상세와 visitor 상세는 같은 generic 404로 닫고 owner 목록에는 내용 없는 `withdrawn` 상태만 남긴다.
- `docs/product/core-feature-priority.md`와 `docs/product/decision-log.md`를 갱신해 1:1 직접 비교 허용과 `/me` 집계 제외를 동시에 명시한다.
- generated DB types, internal RPC allowlist, strict decoder/client, source verifier, pgTAP, Playwright를 갱신한다.

## 제외 범위

- visitor 이름·닉네임·계정·연락처·작성자 추정.
- 1:1 응답을 `/me` 전체 시선 수, 카드 표본, 관계 집계, 공개 프로필에 포함하는 변경.
- 공개 링크 응답의 owner별 개별 원문 열람.
- 메시지·댓글·반응·답변 수정·owner의 visitor 응답 삭제.
- visitor session 만료 연장, management token 재발급, 다른 기기 복구.
- 이메일 알림, pagination, 검색·필터·정렬 설정, export.
- 새 analytics event나 운영 대시보드.

## SSOT

- `docs/product/core-feature-priority.md` §5.7, §6.1, §6.4
- `docs/product/question-pack-spec.md` §7~8, §10
- `docs/product/decision-log.md`의 1:1 집계 제외 결정
- `docs/engineering/p0-development-plan.md` §9.3~9.5, §11.3, §17
- `docs/specs/issue-24.md`, `docs/specs/issue-25.md`, `docs/specs/issue-26.md`, `docs/specs/issue-27.md`
- `supabase/migrations/20260718000800_visitor_required_response.sql`
- `supabase/migrations/20260719000200_visitor_optional_answers.sql`
- `supabase/migrations/20260719000300_visitor_response_withdrawal.sql`
- `AGENTS.md`, `.codex/AGENTS.md`

## 제품 결정 정합성

- 기존 SSOT의 “1:1 응답은 방문자 즉시 비교에만 사용하고 `/me` 누적에서는 제외” 중 집계 제외는 유지한다.
- 이 이슈는 등록된 후속 재승인 단위로서 **해당 1:1 링크를 만든 현재 play owner의 직접 비교 열람만** 추가한다.
- owner 직접 열람은 aggregate가 아니다. response 한 건의 capability-bound private read이며 공개 링크 response, 다른 play, 다른 owner로 확장하지 않는다.
- 철회된 응답은 답·관계가 제거되므로 owner에게 선택 내용이나 관계를 다시 보여주지 않는다. 다만 이슈 계약대로 1:1 링크가 사용 후 철회됐다는 상태와 시각은 sanitized 목록에 남긴다.

## 사용자 흐름 영향

### owner

1. owner는 기존 `/me/plays/[playId]` 공유 링크 화면을 연다.
2. 링크 생성·관리 영역 아래 `1:1로 본 우리` 섹션에서 이 play의 완료된 1:1 응답을 본다.
3. 제출된 항목은 `관계 label · 알게 된 시점 label`, 제출 시각, `비교 보기`만 노출한다. visitor 이름이나 순번 기반 별칭은 만들지 않는다.
4. `비교 보기`를 누르면 같은 화면 안에서 `둘만 보는 1:1 비교` 상세로 전환한다.
5. 상세는 required 3장과 실제로 답한 optional 0~2장만 보여주고 각 카드에 `내 실제 답`과 `친구가 본 나`, `겹침/다름`을 표시한다.
6. 가장 먼저 보여줄 required mismatch는 visitor 비교와 같은 Signature 우선·팩 순서 tie-break로 강조한다.
7. `1:1 목록으로`를 누르면 다시 sanitized 목록으로 돌아간다. 상세 상태에서는 공유 생성 CTA를 중복 노출하지 않는다.
8. 완료 응답이 없으면 이름을 요구하지 않는다는 설명과 함께 빈 상태를 보여준다. 기존 링크 생성 CTA가 페이지의 유일한 primary action으로 남는다.
9. 철회된 항목은 `철회된 1:1 답변`과 “비교 내용은 남아 있지 않아요”만 표시하고 상세 진입을 제공하지 않는다.
10. 목록을 본 뒤 응답이 철회되는 race에서 상세 404를 받으면 선택 내용을 추정하지 않고 목록을 다시 읽어 generic 변경 안내로 수렴한다.

### visitor

1. visitor의 제출 직후 비교 화면과 reload는 기존 `GET /api/responses/[id]`를 계속 사용한다.
2. 정확히 같은 response session cookie이고 24시간 session이 남아 있을 때만 자기 선택과 owner 선택을 비교한다.
3. visitor session이 만료되면 owner cookie가 같은 브라우저에 있어도 visitor API는 generic 404다.
4. owner는 visitor session 만료와 무관하게 자신의 유효한 owner capability로 제출된 1:1 비교를 본다.
5. 철회 뒤에는 owner와 visitor 모두 선택 내용을 읽지 못한다.

## 디자인 영향

- 기존 검정 배경·라임 강조·blue focus·compact card·44px action을 재사용하고 새 디자인 시스템을 만들지 않는다.
- Lazyweb mobile `private answer comparison results` 검색은 직접적인 양자 비교 사례가 희박했지만, 관련도가 높은 Q&A/activity 결과는 상태 설명을 먼저 두고 항목별 정보를 세로 목록으로 스캔하게 하는 공통 구조를 보였다. 이 근거를 과장하지 않고 목록·상세 정보 위계에만 사용한다.
- 화면 순서는 `공유 관리 → 1:1 섹션 제목/비공개 설명 → sanitized 목록 또는 빈 상태`다. 상세 진입 시 해당 섹션만 `비공개 kicker → 결과 요약 → 관계 context → 카드 목록 → 목록으로`로 바뀐다.
- 목록 row 전체를 button으로 만들지 않고 텍스트와 명시적 `비교 보기` button을 분리해 screen reader 이름을 안정적으로 유지한다.
- submitted row와 withdrawn row의 색만으로 상태를 구분하지 않는다. withdrawn은 아이콘 없이 명시적 문구와 disabled surface를 사용한다.
- 비교 카드는 visitor 결과 카드 구조를 재사용하되 관점 label만 `내 실제 답` / `친구가 본 나`로 바꾼다.
- 320/390/430px에서 가로 overflow가 없고 action은 44px 이상, heading focus·`aria-live`·reduced-motion을 유지한다.

## API와 데이터 영향

### owner 목록 응답 allowlist

`GET /api/me/plays/[playId]/responses?kind=one_to_one`의 200 body는 exact `{ "responses": [...] }`다.

각 row는 다음 key만 가진다.

| key | submitted | withdrawn |
| --- | --- | --- |
| `id` | response UUID | response UUID |
| `shareLinkId` | source link UUID | source link UUID |
| `status` | `submitted` | `withdrawn` |
| `relationshipCode` | approved code | `null` |
| `knownSinceCode` | approved code | `null` |
| `submittedAt` | ISO timestamp | retained ISO timestamp |
| `withdrawnAt` | `null` | ISO timestamp |

- 목록은 `link.kind='one_to_one'`, `link.pack_play_id=p_play_id`, `link.consumed_response_id=response.id`, response status `submitted|withdrawn`인 row만 포함한다.
- draft, 공개 링크 response, 소비되지 않은 1:1 link, 다른 play response는 포함하지 않는다.
- 최신 제출 우선 `submitted_at desc, response.id`로 결정적으로 정렬한다.
- 선택값·질문·pack/card ID·public ID·session/management token/hash·IP·visitor 식별자는 목록 JSON에 존재하지 않는다.
- query는 key가 정확히 하나인 `kind=one_to_one`만 허용한다. missing, duplicate, 추가 key, 다른 값은 private 400 `INVALID_REQUEST`다.

### owner 상세 응답 allowlist

`GET /api/me/responses/[responseId]`의 200 body는 exact comparison object다.

- top-level: `id`, `packTitle`, `relationshipCode`, `knownSinceCode`, `submittedAt`, `allMatched`, `assignments`.
- assignment: `cardId`, `stage`, `position`, `packPosition`, `visitorPrompt`, `optionA`, `optionB`, `isSignature`, `visitorChoice`, `ownerChoice`, `matches`, `isHighlight`.
- required assignment는 정확히 3장·모두 answer가 있어야 한다.
- optional assignment는 실제 visitor answer가 있는 0~2장만 반환한다. optional 진입·미완료 여부는 owner에게 노출하지 않는다.
- `allMatched`와 `isHighlight`는 required 3장만으로 계산하며 visitor 비교와 동일해야 한다.
- response가 submitted가 아니거나 one-to-one이 아니거나 source link/play binding이 다르면 `response_not_found` 내부 outcome만 반환하고 HTTP에서는 generic owner 404로 수렴한다.

### exact HTTP contract

| 목적 | method/path | 성공 | 실패 |
| --- | --- | --- | --- |
| owner 1:1 목록 | `GET /api/me/plays/[playId]/responses?kind=one_to_one` | 200 exact list | invalid query 400, owner/cross-play 404, limit 429, unexpected 500 |
| owner 1:1 상세 | `GET /api/me/responses/[responseId]` | 200 exact comparison | owner/public/withdrawn/cross-play/absent 404, limit 429, unexpected 500 |
| visitor 비교 | 기존 `GET /api/responses/[responseId]` | 200 기존 visitor state | wrong/expired/cross-response 404 |

- owner route는 `withPublicRequest({ privateNoStore:true })` 뒤 `owner_play_access` network limit `120/600s`를 domain보다 먼저 실행한다.
- owner cookie absent는 404, malformed/expired/revoked는 같은 404와 cookie 삭제, path play와 cookie play 불일치도 같은 404다.
- owner 상세는 cookie의 play ID를 RPC에 전달하고 URL response ID만 별도 검증한다. visitor cookie 유무·만료를 보지 않는다.
- visitor route는 owner cookie를 보지 않고 기존 exact visitor cookie response binding만 유지한다.
- 모든 성공·오류는 `Cache-Control: private, no-store`다.
- 목록·상세의 POST·PUT·PATCH·DELETE·HEAD·OPTIONS는 private 405다.

### additive migration

새 migration `20260719000400_private_one_to_one_comparison.sql`을 한 transaction으로 적용한다.

#### `list_owner_1to1_responses`

- input은 non-null UUID와 exact 32-byte owner management hash만 허용한다.
- `private.authorize_owner_play_capability(..., true)`를 먼저 실행한다. `expired|not_found`는 그대로 비노출 outcome으로 반환한다.
- play가 `completed`가 아니면 `not_completed`만 반환한다.
- 위 목록 binding 조건을 만족하는 response만 exact allowlist JSON으로 aggregate한다.
- 성공은 `outcome='listed'`, `responses`, 갱신된 `managementExpiresAt`, `managementTtlSeconds=604800`만 반환한다.

#### `get_private_1to1_comparison`

- input은 non-null play/response UUID와 exact 32-byte owner management hash만 허용한다.
- owner capability를 먼저 검증·touch한 뒤 play가 completed인지 검사한다.
- requested response가 `submitted`, source link가 `one_to_one`, source link의 `pack_play_id=p_play_id`, `consumed_response_id=response.id`일 때만 비교를 만든다.
- required 3장, self answer 3장, visitor answer 3장 invariant가 깨지면 500으로 fail closed한다.
- optional은 실제 visitor answer와 self answer가 모두 있는 row만 추가한다.
- withdrawn tombstone은 answer/assignment가 삭제되어 상세 대상이 아니며 `response_not_found`다.
- 성공은 `outcome='authorized'`, `comparison`, owner management expiry fields만 반환한다.

#### 권한과 성능

- 두 RPC는 `security definer`, `search_path=''`, owner `gyeop_internal_rpc`다.
- PUBLIC/anon/authenticated execute를 revoke하고 service_role만 exact RPC wrapper로 호출한다.
- private helper를 추가하면 service_role execute를 금지하고 `gyeop_internal_rpc`만 허용한다.
- 새 direct table grant/RLS policy는 추가하지 않는다. 기존 server-only role의 SELECT 범위 안에서 읽는다.
- 기존 `share_links_play_status_created_idx`, `visitor_responses_link_status_submitted_idx`, PK/FK binding을 사용한다. 새 index는 query plan 증거가 필요한 경우에만 추가한다.

## 구현 계획

1. product SSOT에서 direct owner 1:1 comparison과 aggregate exclusion을 분리해 명시한다.
2. migration에 owner list/detail RPC와 exact permission을 구현하고 pgTAP으로 field/authorization/withdrawal matrix를 먼저 고정한다.
3. DB types, `internal-rpc.ts`, 전용 strict core decoder, server adapter, data-access/source verifier allowlist를 갱신한다.
4. owner list/detail GET route와 private no-store/error mapping을 구현한다.
5. browser client에 exact response decoder와 list/detail GET single-flight를 구현한다.
6. 공유 관리 화면 아래 별도 1:1 비교 component와 CSS를 추가한다.
7. unit/route/Playwright에서 owner-vs-visitor capability matrix, list/detail/empty/withdraw race/accessibility를 검증한다.
8. focused checks를 묶어 통과한 뒤 clean final commit에서 full verify를 한 번 실행하고 PR·CI·merge한다.

## 완료 기준

- [ ] owner 목록은 현재 owner play의 consumed 1:1 submitted/withdrawn response만 exact sanitized fields로 반환한다.
- [ ] owner 상세는 visitor session cookie·expiry와 무관하게 현재 owner capability에 종속된 submitted 1:1 비교만 반환한다.
- [ ] public response, 다른 play/owner, owner cookie 없는 요청, withdrawn/absent response 상세은 모두 generic 404다.
- [ ] visitor 상세은 동일 response cookie와 만료 전 session만 허용하며 owner cookie만으로 열리지 않는다.
- [ ] owner list/detail JSON 어디에도 visitor 이름·식별자·secret/hash·session expiry·public ID가 없다.
- [ ] required 3장과 답한 optional 0~2장의 choice/match/highlight가 visitor comparison과 정확히 같다.
- [ ] 1:1 response는 `/me` sight count·card sample과 공개/관계 집계에 계속 포함되지 않는다.
- [ ] 철회 뒤 visitor/owner 상세 choice가 즉시 사라지고 source link는 disabled/consumed 상태를 유지하며 owner 목록에는 null 관계의 withdrawn 상태만 남는다.
- [ ] owner 빈 상태·목록·상세·철회 race가 320/390/430px, keyboard, screen reader에서 사용 가능하다.
- [ ] full verify가 list/detail 권한·field allowlist·실브라우저 owner/visitor 흐름을 포함한다.

## 테스트 계획

- `pnpm exec supabase db reset`
- 새 `supabase/tests/private_one_to_one_comparison.test.sql`
  - current owner list exact keys/order와 management TTL refresh
  - public/draft/unconsumed/other-play exclusion
  - submitted detail required/answered optional exact comparison과 highlight parity
  - wrong/expired/revoked/cross-play owner capability, public response, absent response generic outcome
  - PUBLIC/anon/authenticated execute denial과 service wrapper success
  - visitor session 만료 뒤 owner detail success, visitor `get_visitor_response` session_invalid
  - withdrawal 뒤 detail unavailable, list withdrawn null relation, answer/assignment 0, disabled consumed link 유지
  - owner profile sight/card sample이 1:1 전후 계속 불변
- `tests/unit/private-one-to-one.test.mjs`
  - owner list/detail exact-key decoder, code/timestamp/invariant rejection
  - visitor/public/secret-like extra field rejection
  - owner client exact path/query/no-store/single-flight와 404 handling
  - data-access/HTTP boundary source allowlist
- `tests/e2e/private-one-to-one.spec.ts`
  - owner empty state → submitted list → detail → list back
  - no visitor name, correct owner/visitor perspective labels, required highlight와 answered optional only
  - withdrawn row disabled, list-detail withdrawal race refresh
  - absent/malformed/cross-play owner and visitor-only cookie 404
  - visitor comparison reload succeeds before expiry and generic terminal after expiry
  - 320/390/430px, focus, aria-live, no horizontal overflow
- live core MVP gate
  - owner one-to-one link → second context visitor submit/compare → owner list/detail → visitor session expiry matrix → management withdraw → owner detail denial/list withdrawn
- `package.json`의 canonical `pnpm test`에 새 unit 파일을 연결하고 `scripts/ai-verify`가 새 source verifier와 Playwright 파일을 실제 실행하도록 고정한다.
- focused test를 묶은 뒤 clean final SHA에서 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 분석과 관측성

- 새 owner list/detail read event는 기록하지 않는다. private MVP에서 조회 로그를 response subject와 연결해 남길 이유가 없다.
- 기존 1:1 visitor funnel event는 그대로 유지하되 public aggregate query에는 계속 포함하지 않는다.
- public error와 server log에 response/link/play 존재, 관계, 선택, owner/visitor secret/hash를 넣지 않는다.
- route rate-limit bucket은 기존 daily network HMAC과 `owner_play_access` action만 사용한다.

## 개인정보와 악용 방지

- owner와 visitor는 서로 다른 capability를 사용하며 API가 한 capability를 다른 경계의 대체물로 인정하지 않는다.
- owner는 특정 1:1 링크가 제출된 뒤에만 비교를 보며 visitor가 제출하기 전 선택을 미리 볼 수 없다.
- 이름을 받지 않고 목록 row에 가명·순번도 만들지 않아 response 간 visitor 동일인 추정을 돕지 않는다.
- public response 원문을 owner detail로 확장하지 않아 공개 집계 참여자가 개별 추적되지 않는다.
- 철회는 answer/assignment/관계를 실제 제거하고 owner 상세도 즉시 닫는다.
- strict decoder가 unexpected field를 거부해 DB/API drift로 token·identifier가 browser에 노출되는 것을 막는다.

## 롤아웃과 복구

- migration과 app을 같은 PR로 배포한다. 새 UI는 새 RPC가 준비된 뒤에만 호출한다.
- app-only rollback은 owner 비교 진입만 제거하고 visitor 제출·비교·철회 데이터는 그대로 유지한다.
- migration rollback은 두 RPC/권한만 제거하면 되며 table data 변환이 없어 손실 복구가 필요 없다.
- 기존 visitor 비교 API와 owner profile aggregate query를 변경하지 않아 rollback 중에도 public 집계 경계가 유지된다.
- feature flag는 추가하지 않는다. private MVP에서 migration reset/upgrade, capability matrix, real browser gate 통과 뒤 활성화한다.

## 스펙 검토

Reviewer Agent: issue28_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 없음. direct owner read와 aggregate 제외, withdrawn 목록 잔존, visitor 24시간 expiry, exact HTTP/JSON 경계를 이 스펙에서 고정한다.
