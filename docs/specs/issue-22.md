# Issue 22 구현 스펙: [프론트엔드] 공개 링크 방문자 관계 선택과 응답 세션 구현

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/22

## 목표

공개 링크를 연 무가입 방문자가 이름·연락처·계정 없이 팩 주인과의 관계와 알게 된 시점을 선택하고, 해당 공개 링크에 귀속된 독립적인 24시간 response session을 시작하게 한다. 같은 브라우저가 같은 링크를 다시 열면 저장한 관계·시점과 같은 response를 복구하고, 다른 브라우저는 별도 response를 만든다.

이 PR은 핵심 방문자 퍼널의 `공개 링크 방문 → 관계·시점 선택 → response session 시작`까지만 닫는다. Signature 1장과 최소 표본 2장 배정은 #23, A/B 저장·제출·비교·1:1 소비·동일 팩 전환은 #24가 소유한다.

## 범위

- 기존 `/i/[publicId]` active 공개 링크 화면에 관계 8개와 알게 된 시점 6개의 단일 선택 UI를 추가한다.
- stable English code와 사용자용 한글 label을 분리한다. DB와 analytics에는 code만 저장하고, label은 검수된 browser-safe registry에서 derive한다.
- `visitor_responses` table과 공개 링크 전용 `start_response` RPC를 추가한다.
- response credential은 32-byte random secret과 response UUID로 만들고 DB에는 domain-separated SHA-256 hash만 저장한다.
- credential은 `__Host-gyeop-response` Secure·HttpOnly·SameSite=Lax·Path=/ cookie 한 곳에만 보관하며 DB 서버 시각 기준 생성 후 24시간에 고정 만료한다. 성공한 reload가 TTL을 연장하지 않는다.
- `POST /api/invites/[publicId]/responses` 하나에서 `resume`과 `start` intent를 strict body로 구분한다.
- active public link와 fragment secret을 검증하고, 유효한 같은-link cookie는 같은 response와 저장 선택을 idempotent 반환한다.
- 신규 response가 필요한 branch만 `response_start` fixed-window quota `10회/10분/network+public link`를 response insert·analytics insert와 같은 transaction에서 소비한다.
- `relationship_selected`, `visitor_response_started` analytics event를 신규 response와 같은 transaction에서 한 번만 기록한다.
- disabled·expired·invalid link, malformed·tampered·expired same-link session은 방문자 데이터가 없는 같은 generic 404로 수렴한다.
- strict decoder, source policy, pgTAP, integration, mobile Playwright, live Supabase E2E와 문서를 갱신한다.
- `docs/product/question-pack-spec.md`, `docs/product/decision-log.md`, `docs/engineering/p0-development-plan.md`에 exact registry와 단계별 이슈 소유권을 같은 PR에서 반영한다.

## 제외 범위

- 1:1 링크 response 시작. 기존 1:1 invite는 정보 화면만 유지하고 #23이 같은 `start_response` transaction을 `public|one_to_one`과 필수 3장 assignment로 확장한다. #24는 이미 생성·배정된 1:1 response의 제출 시 원자 소비만 소유한다.
- Signature·최소 표본 카드 배정, `visitor_assignments`, 카드 문구 반환.
- A/B 답 저장, 필수 3장 제출, owner self answer·관계 집계·비교 결과 노출.
- 방문자 management secret·철회 링크, 선택 2장, 프로필, 알림, 공개 집계.
- 이름·닉네임·연락처·계정·display name·자유 텍스트 입력.
- 관계별 설명 modal, 민감 관계 공개 설정, 번역, 관계 유형 추가.
- browser storage, JS-readable response token, URL/query/fragment response credential.

## SSOT

- `docs/product/core-feature-priority.md` §5.5, §11, §12
- `docs/product/question-pack-spec.md` §7
- `docs/product/decision-log.md`의 관계는 방문자가 직접 선택, 표시 이름 없음, 무가입 visitor 결정
- `docs/engineering/p0-development-plan.md` §8.1~8.3, §9.2, §12, §13.2, §14
- `docs/specs/issue-19.md`의 fragment secret, invite metadata, public/1:1 link 상태 계약
- `supabase/migrations/20260718000100_security_data_access.sql`의 `gyeop_internal_rpc`, rate-limit bucket, direct table access 금지
- `supabase/migrations/20260718000400_share_links.sql`의 active link·secret 검증·analytics policy 계약
- `app/i/[publicId]/invite-entry.tsx`의 loading/unavailable/retryable/active 상태
- `AGENTS.md`
- `.codex/AGENTS.md`

`docs/engineering/p0-development-plan.md`의 `start_response` 카드 배정 서술은 최종 transaction 목표다. 이 PR은 #22 이슈의 명시적 제외 범위에 따라 response/session 원자 생성까지만 구현하고, #23이 같은 RPC transaction을 `visitor_assignments`까지 확장한다.

## 관계·시점 code와 문구

관계 registry는 exact 8개다.

| code | 한글 label |
|---|---|
| `old_friend` | 오래된 친구 |
| `school_friend` | 학교 친구 |
| `coworker` | 직장 동료 |
| `romantic` | 썸·연인 |
| `family` | 가족 |
| `online_friend` | 온라인 친구 |
| `social_follower` | SNS 팔로워·온라인에서만 봄 |
| `other` | 기타 |

알게 된 시점 registry는 exact 6개다. 현재 시점을 기준으로 서로 알게 되거나 팔로우하기 시작한 기간을 고른다.

| code | 한글 label |
|---|---|
| `under_one_year` | 1년 미만이에요 |
| `one_to_three_years` | 1년 이상 · 3년 미만 |
| `three_to_five_years` | 3년 이상 · 5년 미만 |
| `five_to_ten_years` | 5년 이상 · 10년 미만 |
| `ten_years_or_more` | 10년 이상이에요 |
| `not_sure` | 잘 모르겠어요 |

- code는 DB constraint, strict HTTP schema, RPC decoder, analytics policy가 공유하는 immutable identifier다.
- 기간 경계는 현재 시각 기준 `<1`, `>=1 && <3`, `>=3 && <5`, `>=5 && <10`, `>=10`, `unknown`으로 비중첩이다. 저장된 code는 선택 당시 구간을 뜻하며 시간이 지나도 자동 변경하지 않는다.
- 한글 label은 `lib/visitor-response/visitor-context-core.mjs`의 frozen registry에서만 정의한다. `visitor_responses`와 analytics에는 label을 저장하지 않는다.
- #9의 code·label 확정 범위는 #22에 흡수해 중복 이슈를 닫았다. 민감 관계 공개 안내가 필요하면 별도 P1 이슈로 다시 정의한다.

## 사용자 흐름 영향

### 첫 방문

1. 방문자가 `/i/{publicId}#k={secret}`을 연다.
2. 기존 metadata POST가 active public link와 일반 팩 맥락을 확인한다.
3. client가 같은 secret으로 response route에 `{ intent: "resume", secret }`을 한 번 보낸다.
4. response cookie가 없으면 route/RPC는 link만 검증하고 `204 private, no-store`를 반환한다. response, quota, analytics는 바뀌지 않는다.
5. 화면은 `이 사람과 어떤 사이인가요?` 관계 fieldset과 `언제부터 알고 지냈나요?` 시점 fieldset을 순서대로 보여준다.
6. 두 선택 전에는 `3장 답하러 가기`를 disabled로 유지한다. skip과 임의 기본 선택은 없다.
7. 두 code를 고르고 CTA를 누르면 `{ intent: "start", secret, relationshipCode, knownSinceCode }`를 보낸다.
8. 신규 response가 commit되면 `201`과 cookie를 받고 `응답을 시작했어요` 상태로 전환한다. #23 전에는 실제 카드나 가짜 진행률을 만들지 않고 `3장 질문은 다음 단계에서 이어져요.`라고 경계를 표시한다.

### 같은 링크 reload·중복 시작

- metadata 성공 뒤 `resume` 요청이 유효한 same-link session을 찾으면 `200`과 저장된 response context를 반환한다.
- client는 form을 잠깐 노출하지 않고 `응답을 시작했어요` 상태를 복구한다.
- 같은 session에서 `start`가 중복 도착해도 body의 새 선택으로 기존 code를 덮어쓰지 않고 저장된 authoritative context를 반환한다.
- resume·duplicate start는 새 response, `response_start` bucket 증가, analytics event를 만들지 않는다.
- resume response는 원래 `session_expires_at`과 남은 TTL을 반환하고 같은 cookie value를 그 시한까지만 다시 serialize한다. DB expiry를 연장하지 않는다.

### 다른 브라우저와 다른 링크

- 같은 공개 링크를 서로 다른 browser context에서 열면 각 context의 response UUID·session hash·row가 모두 다르다.
- 같은 network+link의 정상 신규 시작은 fixed window 안에서 10개까지 허용한다.
- 유효한 cookie가 다른 공개 링크의 response에 속하면 target link의 `resume`은 `204`로 form을 열고, 명시적 `start`는 quota를 소비해 새 target response를 만든 뒤 cookie를 교체한다.
- syntactically valid cookie의 response id/hash가 DB에 없거나 만료됐으면 새 response로 silently fallback하지 않는다. generic 404와 cookie 삭제로 수렴한다.

### 실패 상태

- metadata가 unavailable이면 기존 generic unavailable 화면을 유지하고 response request를 보내지 않는다.
- metadata 성공 뒤 link가 disabled/expired되거나 secret이 invalid이면 response route는 `INVITE_UNAVAILABLE` generic 404를 반환한다.
- malformed·duplicate response cookie는 domain RPC 전에 generic 404와 삭제 cookie를 반환한다.
- valid shape지만 tampered/expired session은 RPC가 `session_invalid`을 반환하고 HTTP가 같은 generic 404와 삭제 cookie로 매핑한다.
- `response_start` 초과는 `429`, fixed window 잔여 초의 exact `Retry-After`, private no-store를 반환한다. UI는 `잠시 후 다시 시도해 주세요.` alert와 재시도 가능한 CTA를 유지한다.
- network/internal failure는 기존 retryable 패턴을 사용하고 사용자의 두 선택을 mounted state에 보존한다.

## 디자인 영향

- 기존 invite card 안에서 소개 → 관계 선택 → 시점 선택 → 시작 CTA 순서로 이어지며 새 modal·carousel·horizontal swipe를 만들지 않는다.
- Lazyweb mobile probe의 relationship/onboarding 단일 선택 화면을 참고해 각 선택을 full-width 44px 이상 radio-card로 만든다. 선택 표시는 색만이 아니라 native radio state, border, text weight를 함께 사용한다.
- 관계는 8개라 세로 scroll을 허용한다. 320px에서 모든 항목을 한 viewport에 억지로 압축하지 않고 가로 overflow와 nested scroll을 금지한다.
- heading: `이 사람과 어떤 사이인가요?`
- 보조 문구: `이름 없이 관계만 고르면 3장 질문을 시작해요.`
- 관계 legend: `우리 관계`
- 시점 legend: `언제부터 알고 지냈나요?`
- 시점 도움말: `서로 알게 되거나 팔로우하기 시작한 때를 골라주세요.`
- CTA: `3장 답하러 가기`
- started heading: `응답을 시작했어요`
- started body: `고른 관계와 시점을 저장했어요. 3장 질문은 다음 단계에서 이어져요.`
- label 클릭 영역 전체가 radio를 선택하고 각 control은 keyboard·screen reader에서 group과 checked state를 제공한다.
- 320/390/430px에서 44px target, visible focus, reduced motion, 200% text zoom, 가로 overflow 없음 조건을 유지한다.
- start 성공은 started heading으로 focus를 이동한다. validation·rate-limit·retry failure는 `role=alert`, loading·success는 `role=status`/`aria-live=polite` 한 곳만 사용한다.
- 1:1 metadata에서는 관계 form을 렌더하지 않고 기존 `나에게 온 1:1 초대` 맥락과 `1:1 응답은 다음 단계에서 이어져요.` 안내를 유지한다. #23이 1:1 start+assignment를 함께 연다.

## API와 데이터 영향

### migration

`supabase/migrations/20260718000600_visitor_response_session.sql`을 추가한다.

`public.visitor_responses`:

- `id uuid primary key`
- `share_link_id uuid not null references public.share_links(id) on update restrict on delete cascade`
- `pack_version_id uuid not null references public.pack_versions(id) on update restrict on delete restrict`
- nullable `relationship_code text`, nullable `known_since_code text`
- `status text not null default 'draft' check (status = 'draft')`
- nullable unique `session_token_hash bytea` with exact 32-byte check
- `session_expires_at timestamptz not null`
- nullable unique `management_token_hash bytea` with exact 32-byte check
- `created_at timestamptz not null`, nullable `submitted_at`, nullable `withdrawn_at`
- #22 상태 constraint는 유일한 허용 상태 `draft`에서 relationship/session hash가 non-null이고 submit/withdraw 시각과 management hash가 null임을 강제한다. #24가 `submitted`를 추가할 때 constraint·RPC·decoder를 함께 교체하고 철회 이슈가 `withdrawn|invalid`를 확장한다.

인덱스는 계획에 이미 있는 query만 추가한다.

- `(share_link_id, status, submitted_at)`
- `(relationship_code, status)`
- `(session_expires_at) where session_token_hash is not null`

table은 RLS를 enable하고 `gyeop_internal_rpc`에 필요한 select/insert/update만 grant한다. `public`, `anon`, `authenticated`, `service_role` direct table 권한은 모두 없다.

`public.analytics_events`에 nullable 내부 subject column `visitor_response_id uuid references public.visitor_responses(id) on update restrict on delete set null`과 withdrawal lookup index를 추가하고 기존 analytics insert policy를 교체한다. 이 column은 외부 HTTP나 analytics properties에 노출하지 않는다.

- 기존 `share_link_created|invite_opened|share_handoff_succeeded|share_link_copied`는 `visitor_response_id is null`과 기존 exact payload를 유지한다.
- `relationship_selected`는 `visitor_response_id is not null`과 exact `packVersion|linkKind|relationshipCode|knownSinceCode`만 허용한다.
- `visitor_response_started`는 `visitor_response_id is not null`과 exact `packVersion|linkKind`만 허용한다.
- `linkKind`는 이 PR에서 `public`만 가능하다.
- analytics `properties`에는 relationship/known-since label, IP/network key, UUID, raw/hash token, A/B choice, user agent, URL을 금지한다. nullable 내부 subject column의 DB-derived response UUID만 예외다.
- 두 신규 event의 `visitor_response_id`는 `start_response`가 방금 insert한 DB row에서 derive한다. 철회 이슈 #26은 이 column으로 연결 event를 잠그고 relationship/known-since property와 subject ID를 같은 transaction에서 제거한다.

### response session credential

`lib/visitor-response/visitor-session-core.mjs`:

- cookie name: `__Host-gyeop-response`
- value: `v1.{canonical-response-uuid}.{43-char-base64url-secret}`
- secret: CSPRNG 32 bytes
- secret encoding: regex `^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$`, unpadded base64url decode exact 32 bytes, decode→encode canonical round-trip
- hash bytes: `SHA-256(UTF8("gyeop-visitor-response-v1") || 0x00 || rawSecretBytes)`
- hash vector: raw bytes `00..1f` → `cd14ce89186655f35031108d679cab09551ea0f53bcf4576cbc30f947f4fbaf6`
- response start rate key bytes: `SHA-256(UTF8("gyeop-response-start-v1") || 0x00 || networkKey32 || 0x00 || UTF8(publicId))`
- rate vector: network bytes `00..1f`, public ID `AAAAAAAAAAAAAAAAAAAAAA` → `7f667381a24e34737c6fba266ae316b2070295a195b6c00598f198bd3a363e6a`
- parser는 absent, malformed, exact valid를 구분하고 duplicate cookie name을 malformed로 처리한다.
- serializer는 RPC `sessionTtlSeconds <= 86400`과 `sessionExpiresAt`을 검증하고 serialize 직전 `Max-Age=min(sessionTtlSeconds, floor((expiresAt-now)/1000))`로 clamp한다. 0 이하면 cookie를 serialize하지 않고 generic expired outcome으로 처리한다. Path=/, Expires, Max-Age, HttpOnly, Secure, SameSite=Lax를 고정하며 DB expiry가 최종 권한이다.
- 삭제 serializer는 같은 attributes와 epoch/Max-Age=0을 사용한다.

### `public.start_response`

exact signature:

```sql
start_response(
  p_public_id text,
  p_secret_hash bytea,
  p_intent text,
  p_existing_response_id uuid,
  p_existing_session_hash bytea,
  p_new_response_id uuid,
  p_new_session_hash bytea,
  p_relationship_code text,
  p_known_since_code text,
  p_rate_limit_key bytea
) returns jsonb
```

계약:

1. public ID·hash length·intent·existing pair·new pair·registry code·rate key shape를 검증한다. `resume`은 new credential/codes가 null이고, `start`는 new credential/codes가 모두 non-null이어야 한다.
2. public ID row를 잠그고 secret hash, `kind=public`, `status=active`, expiry를 확인한다. 기한 지난 active link는 `expired`로 수렴한 뒤 `unavailable`을 반환한다.
3. existing pair가 있으면 response row를 잠그고 exact id+hash, `status='draft'`, future DB expiry를 함께 검증한다. 하나라도 어긋나면 `session_invalid`이다.
4. valid draft response가 target link와 같으면 intent/body의 code와 무관하게 `resumed`와 저장 state를 반환한다.
5. valid existing response가 다른 link에 속하면 target에 대해서는 session absent로 취급한다. `resume`은 `no_session`, `start`는 신규 branch로 진행한다.
6. existing pair가 없고 intent가 `resume`이면 `no_session`이다. quota·row·event는 바뀌지 않는다.
7. 신규 branch의 nested exception block에서 `public.consume_rate_limit(p_rate_limit_key,'response_start',600,10)`을 호출한다. over-limit custom SQLSTATE를 catch해 increment를 rollback하고 `rate_limited|retryAfterSeconds`를 반환한다.
8. response row를 target link의 pack version으로 insert하고 `session_expires_at = clock_timestamp() + interval '24 hours'`를 고정한다.
9. 두 analytics event를 방금 생성한 `visitor_response_id` subject와 함께 같은 transaction에 insert한다.
10. credential uniqueness 충돌은 nested block 전체를 rollback하고 `collision`을 반환한다. server wrapper가 새 credential로 제한 재시도하므로 quota·row·event가 남지 않는다.
11. 반환 state는 exact `id|status|relationshipCode|knownSinceCode|sessionExpiresAt|sessionTtlSeconds`다. link/share/play/pack UUID, token/hash, owner answer, assignment, 집계를 반환하지 않는다.

함수 owner는 `gyeop_internal_rpc`, execute는 `service_role`만 허용한다. 내부 state helper도 direct role 실행을 금지한다.

### HTTP route

`POST /api/invites/[publicId]/responses`

- request body maximum 256 bytes, strict unknown-key rejection.
- `intent=resume`: exact `{ intent, secret }`; relationship/known-since key가 있으면 400.
- `intent=start`: exact `{ intent, secret, relationshipCode, knownSinceCode }`; 두 code 중 하나라도 없으면 400.
- common public boundary 순서는 proxy proof → Origin → bounded UTF-8 JSON → strict schema → intent별 exact key matrix → public ID → response cookie parse → domain wrapper다.
- malformed/duplicate cookie는 domain RPC 없이 generic 404+deleted response cookie다.
- valid/absent cookie와 새 credential, secret hash, domain-separated network+link rate key만 wrapper에 전달한다.
- `created` → 201 JSON + Set-Cookie.
- `resumed` → 200 JSON + 동일 cookie value를 원 expiry까지만 재serialize.
- `no_session` → 204, Set-Cookie 없음.
- `rate_limited` → 429 + exact Retry-After, Set-Cookie 없음.
- `unavailable|session_invalid` → status, body bytes, cache/security headers가 같은 generic 404. `session_invalid`만 exact deleted Set-Cookie를 추가하며 그 외 header 차이는 없다.
- 모든 outcome은 `Cache-Control: private, no-store`와 common security boundary headers를 가진다.

### browser client

- `resumeVisitorResponse(publicId, secret)`와 `startVisitorResponse(publicId, secret, relationshipCode, knownSinceCode)`만 export한다.
- public ID·secret·codes를 call 전에 allowlist 검증한다.
- `201|200` response context는 exact keys, canonical UUID, draft status, registry codes, parseable future expiry, `1..86400` TTL, code-derived exact label로 strict decode한다.
- 204는 resume의 `null`만 의미한다. start에서 204, body 없는 success, wrong cache header, extra field는 invalid response다.
- same mounted client의 flight key는 `publicId+intent`로 분리한다. initial resume이 settle하기 전에는 form/CTA를 활성화하지 않고, start submit latch로 same-tick double activation의 HTTP request를 정확히 한 번으로 막는다.
- raw secret, response id, 선택 code를 console/error/analytics/storage에 기록하지 않는다.

## 구현 계획

1. 관계·시점 registry, code/label decoder, response session credential/cookie/rate-key core와 unit test를 추가한다.
2. `visitor_responses`, constraints, RLS, analytics policy, state helper, `start_response` migration과 pgTAP을 추가한다.
3. generated DB types와 named internal RPC wrapper·strict outcome decoder를 추가한다.
4. strict request schema, HTTP response mapper, exact response route를 추가한다.
5. browser client와 invite active public state의 resume/form/start/started UI를 구현한다.
6. source policy, integration, Playwright mock/live, 제품 SSOT와 문서 trace를 갱신하고 GitHub #23의 1:1 start 소유권을 정렬한다.
7. 독립 QA와 `./scripts/run-ai-verify --mode full`을 통과한다.

## 완료 기준

- [ ] 이름·연락처·가입 없이 exact 관계 1개와 시점 1개를 선택한다.
- [ ] code만 DB/analytics에 저장되고 한글 label은 registry에서 derive되며 320px에서 설명 없이 선택할 수 있다.
- [ ] 같은 공개 링크의 서로 다른 browser context가 서로 다른 response/session을 만든다.
- [ ] same-link reload·duplicate start는 같은 response와 저장 선택을 복구하고 TTL을 연장하지 않는다.
- [ ] 신규 시작만 network+link별 10회/10분 quota를 원자 소비하고 11번째는 bucket count 10, 새 row/event 0, exact Retry-After로 실패한다.
- [ ] disabled·expired·invalid link와 malformed·tampered·expired same-link session은 방문자 데이터가 없는 generic 404로 거절된다.
- [ ] session raw token은 Secure HttpOnly cookie에만 있고 DB에는 hash만 있으며 URL·JS storage·analytics·log에 없다.
- [ ] analytics에는 IP/network key, token/hash, relationship/known-since label, A/B 값, URL, user agent가 없다.
- [ ] 1:1 link, assignment, owner answer, response 집계는 새 API/UI에서 노출되거나 생성되지 않는다.

## 테스트 계획

### unit/source policy

- 관계 8개·시점 6개의 exact code/label registry와 unknown/extra/coerced input 거절.
- response credential canonical regex/32-byte round-trip/exact hash vector, cookie absent/malformed/duplicate/valid, delayed-response Max-Age clamp·0 이하 거절, delete serializer.
- response-start rate key exact byte layout/vector와 network/public ID scope.
- start-response outcome·HTTP context exact decoder가 extra/missing/wrong type/expired/label mismatch를 거절.
- source verifier가 direct table access, raw client export, non-allowlisted RPC, response token log/storage, loose route schema를 거절.

### pgTAP

- table constraint, RLS, direct role denial, exact function owner/grant.
- active public create가 relation/time code, 24시간 expiry, hash-only credential, exact events를 commit.
- same session resume·duplicate start가 response/event/bucket count를 바꾸지 않고 stored codes를 반환.
- same public link의 두 credential이 독립 row를 만든다.
- RPC에 동일 new credential을 준 동시 start 두 건은 정확히 `created` 1건·`collision` 1건, response 1건, event pair 1개, bucket count 1로 끝난다.
- server wrapper가 처음 받은 `collision` subtransaction은 bucket·row·event 0으로 rollback되고 fresh credential bounded retry 한 번의 결과만 남는다.
- 10 starts 후 11번째가 rate_limited이며 bucket 10·response 10·event pair 10을 유지.
- invalid secret, disabled, expired, 1:1 link의 unavailable과 expired status convergence.
- missing/tampered/expired valid-shape session이 `session_invalid`, cross-link valid session resume이 `no_session`.
- invalid code, label, malformed hash, wrong intent combination이 transaction을 변경하지 않음.

### integration/API

- exact POST path/method, strict body byte/UTF-8/unknown-key/intent-field matrix.
- `resume` absent 204, created 201, resumed 200, private no-store와 cookie exact flags/expiry.
- malformed cookie와 DB tamper/expiry의 generic 404·cookie deletion, invalid link와 status/body bytes/cache/security header 동일성 및 deletion Set-Cookie만의 허용 차이.
- new-response 429 exact Retry-After와 domain row/event 0.
- anon/service direct table/RPC 접근 차단과 server-only wrapper allowlist.
- response body·error·headers에 raw/hash secret, label, owner answer, assignment, IDs beyond response id가 없음.
- random live credential test는 Playwright trace/screenshot/video를 강제로 끄고 failure attachment·console·request/response dump에 Cookie/Set-Cookie를 출력하지 않는다.

### Playwright

- active public invite가 관계 8개와 시점 6개, 선택 전 disabled CTA를 표시.
- radio keyboard·label activation, checked state, 44px target, focus order.
- initial resume settle 전 form 비활성, 두 선택 뒤 exact start body 한 번, same-tick double click의 HTTP request 정확히 한 번, started heading focus.
- resume 204는 form, 200은 stored started state를 form flash 없이 복구.
- rate-limit/retry failure가 선택을 보존하고 accessible feedback을 제공.
- 1:1 invite에 form/start request가 없음.
- 320/390/430px, 200% zoom, reduced motion, no horizontal overflow.

### live Supabase E2E

- 실제 owner 완료·public link 생성 뒤 metadata→resume absent→start→reload resume.
- 두 isolated browser context가 같은 public link에서 독립 response를 생성.
- DB에는 두 distinct hash/response, raw token·label 0건, 두 신규 event의 내부 `visitor_response_id`와 exact analytics payload만 존재.
- cookie tamper, DB expiry, link disable/expiry, 11번째 start, duplicate request를 실제 Route/RPC로 검증.

### final

- independent QA reviewer: P0/P1 0건.
- `./scripts/run-ai-verify --mode full` PASS.

## 분석과 관측성

- 신규 response transaction만 `relationship_selected`와 `visitor_response_started`를 각각 한 번 기록하고 두 event의 nullable 내부 subject column에 같은 DB-derived response ID를 둔다.
- `relationship_selected`: `packVersion`, `linkKind=public`, `relationshipCode`, `knownSinceCode`.
- `visitor_response_started`: `packVersion`, `linkKind=public`.
- resume, duplicate start, invalid/unavailable/session-invalid/rate-limited/collision에는 event를 기록하지 않는다.
- raw IP 대신 UTC-day HMAC network key를 quota table에 저장하고 24시간 retention 계약을 유지한다. analytics에는 network key도 넣지 않는다.
- 이 event는 session 생성 신호이며 필수 3장 완료가 아니다. #24의 `visitor_required_submitted`와 대조한다.

## 개인정보와 악용 방지

- 방문자 신원, 이름, 연락처, 계정, 자유 텍스트를 수집하지 않는다.
- relationship/known-since code는 response의 제품 기능 데이터다. label 중복 저장을 피하고 후속 철회에서 nullable 비식별화할 수 있게 한다.
- raw response secret은 process memory와 HttpOnly cookie 밖으로 나가지 않는다. server component props, JSON, DOM, React state, storage, URL, log, analytics에 전달하지 않는다.
- 256-bit share secret과 response secret은 각각 domain-separated hash를 사용해 context 혼동을 막는다.
- link invalid와 session invalid의 public body/status를 동일하게 만들어 row·만료·token 일치 여부를 노출하지 않는다.
- quota key는 network 일일 HMAC+public ID domain hash이며 원문 IP·public secret을 저장하지 않는다.
- client가 보낸 label, link kind, pack version, status, expiry, response id를 신뢰하지 않는다. 모두 DB 또는 server credential에서 derive한다.

## 롤아웃과 복구

- migration은 additive다. app rollback 뒤 새 table/RPC/policy/nullable analytics subject column이 남아도 기존 invite metadata와 share flow는 계속 동작한다.
- app 배포는 migration 적용 뒤 진행한다. route가 없거나 실패하면 기존 generic invite 정보 화면으로 rollback할 수 있다.
- response 시작을 끄기 위한 feature flag·UA 분기는 추가하지 않는다. 문제가 있으면 app release를 이전 버전으로 돌리고 신규 route 호출을 제거한다.
- DB down migration으로 response를 삭제하지 않는다. 비공개 검증 데이터 정리가 필요하면 retention/withdrawal 계약에 맞는 별도 승인 작업으로 처리한다.
- #23은 같은 table/RPC를 교체해 `kind=public|one_to_one` validation과 assignment를 한 transaction에 추가하되 response/session/cookie/event/quota 계약을 유지한다. #24는 그 결과의 1:1 제출 소비만 소유한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- 관계·시점 code/label은 #22에서 P0 검증 문구로 제품 SSOT에 고정하고 중복 #9를 닫았다. 민감 관계 공개 안내가 필요하면 별도 P1 이슈로 다시 정의한다.
- 하나의 `__Host-gyeop-response` cookie만 사용하므로 같은 브라우저에서 동시에 유지하는 active visitor session은 하나다. 다른 링크를 명시적으로 시작하면 cookie가 새 response로 교체된다. P0 핵심 지표는 링크별 독립 browser 참여이며 multi-tab multi-response 복구는 요구하지 않는다.
- metadata 성공과 start 사이 link가 비활성화될 수 있다. start RPC의 row lock과 상태 재검증이 최종 권한이다.
- response commit 뒤 Set-Cookie가 유실되면 raw session secret을 복구할 수 없다. #22는 cookie를 JS storage에 복제하지 않는다. 동일 HTTP response 유실의 별도 idempotency key는 실제 발생률을 측정한 뒤 검토한다.
