# Issue 26 구현 스펙: [안전] 비밀 관리 링크와 방문자 응답 철회·실제 제거 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/26

## 목표

무가입 방문자가 제출 직후 받은 비밀 관리 링크만으로 본인 응답을 영구 철회하고, 답·배정·관계·세션·집계 기여를 한 transaction에서 제거하되 1:1 링크 replay 방지용 최소 tombstone만 남긴다.

## 범위

- 새 `/responses/manage#token=...` 모바일 확인·성공·실패 화면을 구현한다.
- URL fragment의 canonical 32-byte management token을 즉시 주소창에서 지우고 process memory에서만 exact `POST /api/responses/withdraw` body로 보낸다.
- network 단위 `response_withdraw 5회/시간` rate limit을 capability 검증 전 적용한다.
- `withdraw_response(p_management_hash bytea)` SECURITY DEFINER RPC를 추가한다.
- 첫 유효 철회 transaction에서 answers·assignments를 삭제하고 response를 최소 tombstone으로 비식별화한다.
- response에 연결된 기존 analytics event의 모든 subject와 properties를 제거하고 subject 없는 `response_withdrawn` event를 한 번 기록한다.
- 공개 프로필·질문 표본·핵심 퍼널에서 철회 응답 기여가 즉시 빠지는지 검증한다.
- 1:1 source link의 `status='disabled'`·`consumed_response_id`·`consumed_at`은 보존해 철회 뒤에도 재사용되지 않게 한다.
- generated DB types, internal RPC allowlist, strict client decoder, source verifier, pgTAP, integration, Playwright를 갱신한다.

## 제외 범위

- 로그인·이메일·신원 확인·management token 재발급·다른 기기 복구.
- owner 계정 전체 삭제, 팩·공유 링크 삭제, 1:1 링크 재개방.
- notification table/job 생성·취소. 후속 이메일 알림 이슈가 동일 RPC를 고정 lock order로 교체한다.
- backup 물리 삭제, retention 기간, 일일 cleanup worker.
- 철회 취소·undo, 응답 수정, 다른 응답 목록·미리보기.
- 새로운 분석 대시보드나 관계별 공개 UI.

## SSOT

- `docs/product/core-feature-priority.md` §5.7, §6.1, §6.4
- `docs/product/question-pack-spec.md` §7~8, §10
- `docs/product/decision-log.md`의 `무가입 방문자 철회는 비밀 관리 링크로 제공`
- `docs/engineering/p0-development-plan.md` §9.3~9.5, §11.3, §17
- `docs/engineering/core-funnel-events.md`
- `docs/specs/issue-24.md`, `docs/specs/issue-25.md`
- `supabase/migrations/20260718000800_visitor_required_response.sql`
- `supabase/migrations/20260718001100_core_funnel_events.sql`
- `supabase/migrations/20260719000200_visitor_optional_answers.sql`
- `AGENTS.md`, `.codex/AGENTS.md`

## 사용자 흐름 영향

1. 방문자는 제출·비교 화면에서 기존처럼 `내 관리 링크 복사`로 `/responses/manage#token=...` 링크를 보관한다.
2. 링크를 열면 브라우저는 exact fragment를 한 번 읽고 즉시 `history.replaceState`로 주소창·history의 token을 제거한다. 서버 렌더·GET·access log·referrer에는 token이 전달되지 않는다.
3. token이 유효한 형태면 `이 답변을 지울까요?` 확인 화면에서 제거 범위와 되돌릴 수 없음을 본다.
4. `답변 남겨두기`는 홈으로 돌아가는 안전한 기본 행동이다. `이 답변 철회하기`를 누를 때만 POST가 발생한다.
5. 요청 중에는 중복 제출을 막고 상태를 `철회하는 중…`으로 알린다.
6. 첫 성공은 `답변을 철회했어요`를 보여주고 raw token과 같은 브라우저의 management record를 제거한다. 되돌리기·재발급은 제공하지 않는다.
7. 틀린 token, 이미 쓴 token, 없는 응답은 모두 동일한 `이 관리 링크는 사용할 수 없어요` 화면과 generic 404로 수렴한다.
8. 일시 오류는 token을 memory에 유지해 명시적 재시도를 허용한다. 429는 `Retry-After`에 맞춘 대기 안내만 보여주고 존재 여부는 밝히지 않는다.
9. 철회 뒤 이전 response session cookie로 비교·추가 답변을 다시 읽거나 저장할 수 없다.

## 디자인 영향

- GYEOP의 검정 배경·라임 기본 CTA·blue focus·compact card 언어를 재사용하고 별도 디자인 시스템을 만들지 않는다.
- Lazyweb mobile `delete account confirmation` 검색에서 가장 관련도가 높았던 Dipsea 사례는 유지 행동을 강한 Primary, 영구 삭제를 명확한 secondary destructive action으로 분리했다. GYEOP도 같은 위계를 쓰되 철회 버튼을 저대비 text link로 숨기지 않고 48px full-width red outline로 표시한다.
- 화면 순서는 `브랜드 → 제목 → 실제 제거 항목 3개 → 되돌릴 수 없음 안내 → 라임 답변 남겨두기 → red outline 철회하기`다.
- 제거 항목은 `내 A/B 답`, `관계·알게 된 시점`, `프로필·집계 기여`만 설명한다. 내부 ID·tombstone·analytics 용어는 노출하지 않는다.
- 성공·사용 불가·rate-limit·일시 실패는 같은 card shell과 한 개의 다음 행동만 사용한다.
- 320/390/430px에서 가로 overflow가 없고 모든 action은 44px 이상이며 keyboard focus, `aria-live`, reduced-motion을 유지한다.
- greenfield Lazyweb 전체 report route는 `WORKFLOW_NOT_FOUND`로 종료되어 재시도하지 않았고, 위 quick-search 근거만 사용한다.

## API와 데이터 영향

### management token과 browser storage

- 기존 token 규격을 유지한다: padding 없는 canonical base64url 43자, decode 결과 exact 32 bytes.
- `parseManagementFragment`는 exact `#token=<canonical>` 하나만 허용한다. percent encoding, 추가 key, 중복 key, 빈 값, query token은 거절한다.
- raw token은 URL fragment, React state, 사용자 복사본, 기존 browser management record 외에 저장하지 않는다.
- `removeManagementRecordMatchingSecret`은 `gyeop:visitor-management:v1:` prefix의 strict record만 검사하고 같은 secret의 record만 제거한다. 다른 응답·임의 localStorage key는 건드리지 않는다.
- success와 terminal 404에서는 token state와 matching record를 지운다. transient 5xx·429에서는 같은 페이지의 retry를 위해 memory에만 유지한다.

### exact HTTP contract

| 목적      | method/path                    | body                             | 성공            | 실패                                                                                                                         |
| --------- | ------------------------------ | -------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 응답 철회 | `POST /api/responses/withdraw` | exact `{ "token": canonical43 }` | 204, empty body | invalid body 400, wrong/reused/absent 404 `RESPONSE_MANAGEMENT_UNAVAILABLE`, limit 429 + exact `Retry-After`, unexpected 500 |

- route는 strict `visitorWithdrawalSchema`, 최대 64 bytes, `privateNoStore: true`를 사용한다.
- `withPublicRequest`가 proxy proof → Origin → bounded UTF-8 JSON → exact schema를 검사한 뒤 제공한 `networkKey`를 그대로 rate bucket key로 사용한다.
- `runRateLimitedDomain`은 action `response_withdraw`, limit 5, window 3600으로 domain RPC보다 먼저 실행한다. canonical wrong token도 quota를 소비해 brute-force를 제한한다.
- server adapter만 기존 domain-separated `hashVisitorManagementSecret`을 호출한다. raw token은 internal RPC argument·DB·analytics·log·오류에 전달하지 않는다.
- RPC의 `withdrawn|unavailable` exact outcome만 decoder가 허용한다. `unavailable`은 원인과 존재 여부를 구분하지 않는다.
- 성공·오류 모두 `Cache-Control: private, no-store`; GET·PUT·PATCH·DELETE·HEAD·OPTIONS는 private 405다.

### additive migration

새 migration `20260719000300_visitor_response_withdrawal.sql`을 한 transaction으로 적용한다.

#### response tombstone

- `visitor_responses.pack_version_id`, `session_expires_at`, `created_at`의 NOT NULL을 제거한다.
- 최신 `visitor_responses_state_check`를 교체한다.
  - draft/submitted는 기존 관계·시점·pack version·created/session 24시간·token 불변식을 그대로 유지한다.
  - withdrawn은 `id`, `share_link_id`, `status='withdrawn'`, non-null `submitted_at`, non-null `withdrawn_at`만 보존한다.
  - withdrawn의 `pack_version_id`, `relationship_code`, `known_since_code`, `session_token_hash`, `session_expires_at`, `management_token_hash`, `created_at`는 모두 null이어야 한다.
- `public.withdraw_response(p_management_hash bytea)`는 non-null exact 32-byte hash만 받고 matching `status='submitted'` row를 `FOR UPDATE`한다.
- row가 없거나 이미 withdrawn/draft이면 `unavailable`만 반환하며 어떠한 answer·event·token 상태도 바꾸지 않는다.
- 첫 성공은 다음을 한 transaction에서 순서대로 수행한다.
  1. response id와 link id, submitted timestamp를 transaction-local 변수에만 보관한다.
  2. 해당 response의 `visitor_answers`와 `visitor_assignments`를 실제 DELETE한다.
  3. 연결 analytics rows를 scrub한다.
  4. response를 위 최소 tombstone으로 UPDATE한다.
  5. subject 없는 `response_withdrawn` event를 INSERT한다.
- update와 event insert 중 하나라도 실패하면 answer 삭제와 tombstone 전이를 포함해 전부 rollback한다.
- concurrent duplicate 호출은 response row lock과 token/status 전이로 정확히 하나만 `withdrawn`, 나머지는 `unavailable`이 된다.
- 1:1 `share_links.status='disabled'`, non-null `consumed_at`, non-null `consumed_response_id`는 수정하지 않는다. 현재 스키마에 별도 `consumed` status는 없다.

#### analytics scrub과 event

- 철회 대상과 연결된 `analytics_events.visitor_response_id` rows는 `owner_play_id`, `share_link_id`, `visitor_response_id`를 모두 null, `properties='{}'`로 바꾼다.
- 기존 analytics row의 `id`, `event_name`, `occurred_at`만 남고 response·link·play·pack·entry source·관계·선택을 복구할 subject/property는 남지 않는다.
- table UPDATE 권한은 scrub 대상 네 column에만 부여한다. 전용 UPDATE policy는 old response subject 존재와 new subject 전부 null·exact empty properties를 허용하고, BEFORE UPDATE trigger가 `event_name|occurred_at|id` 불변과 scrub-only transition을 추가로 강제한다.
- 기존 INSERT allowlist는 건드리지 않고 별도 permissive `response_withdrawn` insert policy를 추가한다. exact 조건은 모든 subject null, `properties='{}'`다.
- `response_withdrawn`은 first successful transaction에서만 한 건 생기며 response id·link id·pack version·relation·choice·token/hash를 포함하지 않는다.
- 최신 analytics normalizer와 forbidden-payload restrictive policy를 유지한다.

#### 권한과 호환성

- `withdraw_response`는 `security definer`, `search_path=''`, schema-qualified object, owner `gyeop_internal_rpc`를 사용한다.
- PUBLIC/anon/authenticated execute를 revoke하고 service_role만 exact RPC allowlist로 호출한다.
- generated DB types와 `scripts/verify-data-access.mjs`의 named wrapper↔RPC pair를 함께 갱신한다.
- withdrawn row는 visitor state RPC에서 session hash가 null이므로 generic unavailable이며 공개 table access는 계속 RLS로 막힌다.

## 구현 계획

1. migration에 nullable tombstone schema, state check, analytics scrub trigger/policy, `withdraw_response`, event insert를 구현한다.
2. pgTAP으로 exact residue·transaction rollback·replay·1:1 disabled 소비 상태 유지·profile/funnel 감소·권한을 먼저 고정한다.
3. DB types, `internal-rpc.ts`, strict outcome decoder와 data-access/source verifier allowlist를 갱신한다.
4. withdrawal strict schema, server domain adapter, HTTP mapper와 exact static route를 추가한다.
5. management fragment parser·matching record cleanup·browser POST client를 구현한다.
6. `/responses/manage` confirmation/terminal client screen과 CSS를 기존 shell/token으로 구현한다.
7. unit/integration/Playwright로 fragment 제거, no-GET mutation, retry, 404 convergence, rate limit, accessibility를 검증한다.
8. focused checks를 묶어 통과한 뒤 clean final commit에서 full verify를 한 번 실행하고 PR·CI·merge한다.

## 완료 기준

- [ ] management raw token은 fragment·process memory·사용자 복사본·현재 브라우저 strict record 밖에 저장·전송·기록되지 않는다.
- [ ] 페이지가 token을 서버로 보내기 전에 주소 fragment를 제거하고 GET만으로 상태를 바꾸지 않는다.
- [ ] 올바른 token의 첫 POST만 204이며 concurrent/순차 replay, wrong, absent token은 같은 404다.
- [ ] 첫 철회 뒤 answer·assignment가 0건이고 response tombstone의 허용 필드 외 모든 개인·capability 값이 null이다.
- [ ] 연결 analytics row는 event 이름·시각 외 subject/property가 없고 `response_withdrawn`은 subject/payload 없이 한 번만 남는다.
- [ ] submitted 공개 response의 profile sight/card sample과 visitor funnel 기여가 즉시 1 감소한다.
- [ ] 철회한 1:1 response의 source link는 `status='disabled'`와 non-null `consumed_at`·`consumed_response_id`를 유지하고 다시 시작할 수 없다.
- [ ] 과거 response session cookie로 read/save/submit/continue가 모두 generic unavailable이다.
- [ ] 6번째 canonical 요청은 domain RPC 전에 429와 exact `Retry-After`를 받고 response 존재 여부를 노출하지 않는다.
- [ ] update trigger/RLS가 analytics event name/time 변경, non-empty properties, 일부 subject 잔존을 거부한다.
- [ ] confirmation/success/unavailable/retry 화면이 320/390/430px·keyboard·screen reader에서 사용 가능하다.

## 테스트 계획

- `pnpm exec supabase db reset`
- `pnpm exec supabase test db supabase/tests/visitor_response_withdrawal.test.sql`
  - submitted required+optional 공개 응답의 exact answer/assignment 삭제와 tombstone null set
  - analytics subject/property scrub, subjectless event one-time
  - wrong/replay/concurrent token, PUBLIC/anon/authenticated denial
  - profile sight/card sample과 core funnel 감소
  - 1:1 `status='disabled'`·`consumed_at`·`consumed_response_id` 유지와 source URL 재사용 unavailable
  - forced analytics failure에서 delete/update/event 전체 rollback
- `node --test tests/unit/visitor-management.test.mjs tests/unit/visitor-response.test.mjs tests/unit/data-access-policy.test.mjs tests/unit/http-boundary-policy.test.mjs`
  - exact fragment/token, matching local record만 제거, strict outcome
  - raw client/RPC/table bypass와 unsupported route method 거절
- integration route test
  - first 204, wrong/replay 404 convergence, no-store, empty body
  - network bucket 5/hour, sixth 429 + exact Retry-After, limiter-before-domain
- `pnpm exec playwright test tests/e2e/visitor-management.spec.ts --project=mobile-chromium`
  - fragment 즉시 제거, safe Primary, destructive confirmation, loading lock
  - success cleanup, transient retry, 404 terminal, 429 안내
  - 320/390/430px, focus, aria-live, no horizontal overflow
- live core MVP test에 management copied link → actual withdraw → profile decrease → old session/link replay denial을 추가한다.
- focused test를 묶은 뒤 clean final SHA에서 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 분석과 관측성

- `response_withdrawn`은 철회량만 세는 subjectless counter event다. response·owner·link·pack·관계·선택별 drill-down은 의도적으로 불가능하다.
- 철회된 response와 연결됐던 기존 event도 subject/property를 제거하므로 core funnel view에서 즉시 제외된다.
- rate-limit bucket에는 daily network HMAC과 action/window/count만 있고 IP·token·response ID는 없다.
- public error와 server log에 raw token/hash, response 존재, 선택·관계·link 정보를 넣지 않는다.

## 개인정보와 악용 방지

- capability는 256-bit random secret의 domain-separated SHA-256 hash 비교로만 검증한다.
- canonical token 형태 검증, network 5/hour 제한, generic 404로 brute-force와 존재 탐색을 억제한다.
- 철회는 account·name 없이 해당 capability 한 건에만 한정된다. 링크 분실 복구나 운영자 우회는 없다.
- 답·배정은 실제 삭제하고 최소 tombstone은 1:1 replay 방지와 철회 상태 증명에 필요한 필드만 남긴다.
- analytics scrub은 삽입 allowlist와 별도로 update trigger/RLS를 두어 새 데이터 수정 우회로가 되지 않게 한다.
- page는 token을 HTML/server component/URL query/cookie/analytics에 포함하지 않는다.

## 롤아웃과 복구

- migration과 app을 같은 PR로 배포한다. 새 page/API가 호출되기 전에는 기존 제출·비교 흐름에 변화가 없다.
- app-only rollback은 안전하다. 이미 철회된 tombstone은 기존 session hash가 null이라 이전 앱에서도 읽을 수 없고 profile query도 submitted만 센다.
- migration rollback으로 삭제된 answer·assignment·scrubbed analytics를 복원할 수 없으므로 데이터 되살리기를 시도하지 않는다.
- DB schema를 되돌려야 하면 새 RPC·policy·trigger 실행을 먼저 차단하고 withdrawn tombstone은 별도 archive/delete한 뒤에만 NOT NULL·이전 state check를 복원한다. 철회 데이터를 submitted로 되돌리는 복구는 금지한다.
- feature flag는 추가하지 않는다. private MVP에서 migration reset/upgrade, residue test, exact route, live browser gate를 통과한 뒤 활성화한다.

## 스펙 검토

Reviewer Agent: issue26_spec_review
Review Status: PASS
P0/P1 Findings: 0

조치 완료:

- 실제 `share_links` 스키마에 맞게 1:1 소비 상태를 `status='disabled'`·non-null `consumed_at`·non-null `consumed_response_id`로 고정했다.

## 리스크와 미결정 사항

- 없음. tombstone 필드, analytics scrub 범위, 1:1 replay 보존, HTTP outcome, rate-limit, destructive UI 위계를 이 스펙에서 고정한다.
