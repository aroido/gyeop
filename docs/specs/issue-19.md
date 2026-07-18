# Issue 19 구현 스펙: [백엔드] 재사용 공개 링크 생성·비활성화·secret fragment 진입 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/19

## 목표

`old-friend` 10장을 완료한 owner가 현재 play에 귀속된 공개 또는 1:1 초대 링크를 만들고 외부 공유를 준비할 수 있게 한다. URL은 `/i/{public_id}#k={secret}`으로 고정해 bearer secret이 HTTP request path, reverse-proxy access log, DB, analytics에 남지 않게 하고, 같은 공개 링크는 독립 방문자 여러 명이 안전하게 열 수 있게 한다.

이 PR은 `owner 10장 완료 → 공유 링크 생성 준비 → 방문자 일반 초대 화면 진입`까지를 실제 제품에서 닫는다. Web Share·clipboard 외부 전달은 #21, 방문자의 관계 선택·응답 session은 #22, 3장 제출과 1:1 소비는 #24가 소유한다.

## 범위

- `share_links` table, RLS, indexes, constraints와 `create_share_link`, `disable_share_link`, `rotate_share_link`, `list_owner_share_links`, `get_invite_metadata` RPC를 추가한다.
- owner link RPC 네 개는 Auth UID, `OwnerMutationActor`, 영구 `owner_id`를 사용하지 않는다. 현재 `__Host-gyeop-owner` cookie의 play id와 management secret hash를 받고 같은 transaction에서 #17의 `private.authorize_owner_play_capability`를 정확히 한 번 호출한다.
- owner가 완료한 자신의 play에 대해서만 link create/list/disable/rotate를 허용한다. 다른 play cookie, path play id, link의 `pack_play_id` 불일치는 link row를 만들거나 바꾸지 않는 generic owner 404로 수렴한다.
- 공개 ID와 secret을 CSPRNG로 생성한다. owner는 생성/회전 HTTP 응답에서 raw secret이 포함된 URL을 한 번만 조회할 수 있고, visitor 전송·metadata retry 중 raw secret은 transient request memory에만 있으며 어디에도 저장·기록하지 않는다. DB에는 domain-separated SHA-256 hash만 저장한다.
- exact owner API를 추가한다.
  - `POST /api/plays/[playId]/links`
  - `GET /api/me/plays/[playId]/links`
  - `PATCH /api/links/[linkId]`
  - `POST /api/links/[linkId]/rotate`
- exact visitor metadata API `POST /api/invites/[publicId]/metadata`와 `/i/[publicId]#k={secret}` 진입 화면을 추가한다.
- `/me/plays/[playId]`에 링크 종류 선택, 생성 직후 현재 mounted client만 가진 전체 URL 준비 상태, sanitized 상태 목록, 비활성화, 회전을 구현한다. Web Share·clipboard control은 #21이 같은 client state 위에 추가한다.
- #18 완료 화면의 다음 CTA를 `/me/plays/[playId]` 링크 관리 화면으로 연결한다.
- `old-friend` static presentation의 `defaultShareKind=public`을 최초 추천으로 표시하되 owner가 생성 전 `public|one_to_one`을 명시적으로 바꿀 수 있게 한다.
- 생성/회전 뒤 raw URL은 React memory에만 두고 browser storage, cookie, server 재조회로 복구하지 않는다. 새로고침 뒤에는 안전한 상태 목록과 `새 링크 만들기`/active link `새로 발급` 행동만 제공한다.
- invite metadata 전에 `invite_metadata` action을 network HMAC+public link key로 scope한 fixed window `60회/60초` limiter를 적용한다. 61번째 요청은 domain RPC 전에 429와 정확한 window 잔여 `Retry-After`를 반환한다.
- `share_link_created`, `invite_opened` analytics event를 검수된 최소 property로 기록한다.
- 기존 data-access/HTTP source gate를 play-bound share RPC와 exact route order까지 확장한다.

## 제외 범위

- 방문자 관계·알게 된 시점 입력, 3장 배정/저장/제출, 비교 결과와 방문자 session. #22~#24가 소유한다.
- 1:1 링크 소비와 `consumed_response_id`/`consumed_at` column·FK 연결. #19의 list는 future allowlist 호환을 위해 `consumedAt:null`만 반환하며, 실제 column·constraint·consume transaction은 #24가 소유한다.
- owner 프로필, 집계, 공개 프로필 링크, 대표 팩 선택
- 이메일, Supabase Auth, cross-device owner 복구, 표시 이름
- 연락처 접근, 서비스 내 친구 추가, 채널별 직접 SDK, QR code, Instagram 전용 API
- 자동 만료 기본 기간 확정. 모든 신규 link의 `expires_at`은 null이며 expired fixture와 nullable 계약만 검증한다.
- 링크별 클릭 수·공유 성공률 dashboard와 `share_link_copied`/`share_handoff_succeeded` 수집 endpoint
- visitor가 fragment를 응답 session cookie로 교환하는 동작. #22의 `start_response`가 소유한다.

## SSOT와 결정

- `docs/product/core-feature-priority.md` §5.4, §5.5, §7, §10
- `docs/product/question-pack-spec.md` §12 `default_share_kind`
- `docs/product/decision-log.md`의 `P0 공유 대상은 특정 팩 링크`, `표시 이름 없음`, `same-browser owner capability`
- `docs/engineering/p0-development-plan.md` §7~§10, §13~§16
- `docs/engineering/github-task-workflow.md`
- `docs/specs/issue-17.md`
- `docs/specs/issue-18.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

이번 구현에서 문서 의미를 바꾸는 새 제품 결정은 없다. 구현 후 `p0-development-plan.md`의 URL/API/RPC 표가 실제 route와 일치하지 않는 항목만 exact 갱신한다. `core-feature-priority.md`의 카카오톡·Instagram 등 채널 지원 문구는 P0 방향으로 유지하되, 실제 Web Share·link copy는 후속 #21이 소유한다고 개발 계획에 명시한다.

Lazyweb의 `mobile invite link sharing` 실제 화면 검색에서 공통적으로 확인된 패턴을 적용한다.

- 생성과 외부 전달 action을 분리하고, #19는 준비된 link 상태를 primary result로 둔다. 실제 `공유하기`/`링크 복사` action 우선순위는 #21에서 적용한다.
- 생성과 현재 상태를 한 화면에서 분리하고, 아직 링크가 없을 때 empty state에서 바로 생성할 수 있게 한다.
- 연락처 선택이나 보상 설명은 GYEOP 핵심 loop와 무관하므로 넣지 않는다.
- greenfield report 호출은 기존 screenshot이 없어 deep-design redirect로 끝났으므로, 구현 화면을 띄운 뒤 실제 screenshot으로 최종 visual QA를 수행한다.

## 사용자 흐름 영향

### owner

1. owner가 10장을 완료하면 #18 완료 화면에서 `친구에게 공유하기`를 눌러 `/me/plays/[playId]`로 이동한다.
2. 화면은 `GET /api/me/plays/[playId]/links`로 owner capability와 완료 상태를 확인하고 기존 링크 상태를 복구한다.
3. 최초 선택은 pack manifest의 `defaultShareKind=public`이다. `여러 친구에게 공개`와 `한 친구에게 1:1` 설명을 보고 제출 전에 바꿀 수 있다.
4. 생성 요청이 성공하면 전체 `/i/{publicId}#k={secret}` URL을 해당 mounted 화면 memory에만 보관하고 `공유 링크가 준비됐어요` 상태를 보여준다. 실제 Web Share/clipboard control은 #21이 이 state를 소비한다.
5. 새로고침하면 전체 URL은 사라지고 link 종류·상태·만료·소비 시각만 다시 보인다. active link에는 `새로 발급`, 모든 상태에는 필요 시 `새 링크 만들기`를 제공한다.
6. `새로 발급`은 old active link 비활성화와 같은 kind의 new link 생성을 한 transaction으로 처리한다. 성공한 새 URL만 mounted memory에 교체한다.
7. `비활성화`는 확인 dialog 뒤 실행한다. 성공 뒤 기존 URL을 memory와 DOM에서 즉시 제거하고 상태를 `비활성`으로 표시한다.
8. draft play, 다른 play path/cookie, 만료·변조 capability는 동일한 종료 화면으로 수렴하며 다른 play/link 존재를 드러내지 않는다.

### visitor

1. visitor browser는 `/i/{publicId}#k={secret}` document를 연다. fragment는 HTTP request line, server component props, referrer에 전달되지 않는다.
2. client는 exact fragment `#k=<43-char-base64url>`만 해석한다. missing, duplicate key, extra key, percent-encoding, 잘못된 길이는 API를 호출하지 않고 generic unavailable 화면을 연다.
3. canonical fragment이면 exact metadata POST body `{ "secret": "..." }`를 보낸다. page/client는 `location.href`, body, secret을 console·analytics·error text에 기록하지 않는다.
4. active link이면 `친구가 먼저 답한 질문팩이에요`, `오래된 친구팩`, 공개/1:1 맥락만 보여준다. owner 이름·self answer·답 수·play id는 보여주지 않는다.
5. disabled, expired, wrong secret, unknown public id는 모두 `이 초대는 지금 참여할 수 없어요` 화면으로 수렴한다. 내부 RPC outcome은 테스트 가능하지만 public body로 존재 여부를 구분하지 않는다.
6. 같은 `public` link는 서로 cookie/storage를 공유하지 않는 두 browser context에서 모두 active metadata를 받을 수 있다. metadata 조회는 link를 consume하거나 변경하지 않는다.

## secret, ID, URL 계약

- internal link id: canonical lower-case UUID v4.
- `public_id`: CSPRNG 16 bytes를 padding 없는 canonical base64url로 인코딩한 exact 22자 `[A-Za-z0-9_-]{21}[AQgw]`(마지막 문자는 `A|Q|g|w`만 허용).
- raw secret: CSPRNG 32 bytes를 padding 없는 base64url로 인코딩한 exact 43자 `[A-Za-z0-9_-]{43}`.
- secret hash: `SHA-256(UTF-8("gyeop-share-link-v1") || 0x00 || raw-secret-bytes)` exact 32 bytes.
- secret hash test vector: raw bytes `00..1f`, base64url `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8` → hex `60da3ea5e671bc19c6357f6c65a6a886fcc25608891c153b2c90685d2cce2cff`.
- invite URL: canonical `APP_URL` origin + `/i/${publicId}#k=${secret}`. query parameter, trailing slash, 다른 fragment key를 만들지 않는다.
- `public_id`는 route와 rate-limit scope용 비밀이 아닌 locator다. raw secret만 bearer proof이며 DB/RPC에는 hash만 전달한다.
- raw secret과 full invite URL은 DB, SQL argument, cookie, browser storage, React key/data attribute, request path/query, server/client console, analytics property, error body에 포함하지 않는다.
- create/rotate response는 `Cache-Control: private, no-store`이며 full `inviteUrl`을 한 번 반환한다. list/metadata RPC와 reload로 secret을 재구성할 수 없다.

## API와 데이터 영향

### 데이터 모델

새 migration `supabase/migrations/20260718000400_share_links.sql`을 추가한다.

### `public.share_links`

- `id uuid primary key`
- `public_id text not null unique` + canonical 16-byte, exact 22-char base64url CHECK
- `pack_play_id uuid not null references public.pack_plays(id) on delete cascade`
- `kind text not null check (kind in ('public','one_to_one'))`
- `secret_hash bytea not null unique check (octet_length(secret_hash)=32)`
- `status text not null default 'active' check (status in ('active','disabled','expired'))`
- `expires_at timestamptz null`
- `created_at timestamptz not null default clock_timestamp()`
- `updated_at timestamptz not null default clock_timestamp()`
- #19의 status CHECK는 `active|disabled|expired`만 허용한다. #22가 `visitor_responses`를 만든 뒤 #24가 `consumed_response_id`, `consumed_at`, exact FK를 추가하고 `consumed`를 확장한다. 그 확장 constraint는 `consumed ⇒ kind=one_to_one and consumed fields non-null`, 다른 상태에서는 consumed fields null을 강제한다.
- `public_id`, `secret_hash` unique 외에 `(pack_play_id, status, created_at desc)` index를 둔다.
- table RLS를 켜고 `PUBLIC`, `anon`, `authenticated`, `service_role`의 direct CRUD를 모두 회수한다.
- `gyeop_internal_rpc`에 필요한 SELECT/INSERT/UPDATE만 grant하고 exact RLS policy를 둔다. DELETE grant/policy는 두지 않는다.
- 기존 `analytics_events`에는 `gyeop_internal_rpc` INSERT만 추가 grant한다. `analytics_share_invite_internal_insert` policy는 event name이 `share_link_created|invite_opened`이고 properties key가 exact `packVersion|linkKind`, `packVersion`이 string, `linkKind`가 exact enum일 때만 INSERT를 허용한다. role에는 analytics SELECT/UPDATE/DELETE를 주지 않는다.

### expiry와 상태

- 이번 PR의 create/rotate route에는 expiry input이 없으며 모든 신규 row의 `expires_at=null`이다.
- effective expiry는 `status='active' and expires_at <= clock_timestamp()`일 때다. 각 link RPC는 target row를 잠근 뒤 이 조건이면 status를 `expired`로 원자 수렴시킨다.
- `list_owner_share_links`도 해당 play의 과거 active expiry를 한 statement로 `expired`에 수렴시킨 뒤 목록을 반환한다.
- allowed transition은 #19에서 `active→disabled`, `active→expired`뿐이다. `consumed` 전이와 column은 #24만 추가한다.
- disable retry는 이미 disabled면 같은 row를 반환하는 idempotent success다. expired link는 변경하지 않고 현재 상태를 반환한다.
- rotate는 exact active link만 old `disabled` + new `active`로 전이한다. 동시 rotate는 old row lock으로 직렬화되어 정확히 한 요청만 새 row를 만든다.

## RPC 계약

모든 RPC는 `SECURITY DEFINER`, owner `gyeop_internal_rpc`, empty `search_path`, schema-qualified relation을 사용한다. `service_role`만 exact signature를 실행하며 public/anon/authenticated는 실행하지 못한다. owner link RPC는 `auth.uid`, actor/recovery 후보, `owner_id`를 받거나 읽지 않는다.

### 공통 owner 권한

- `create_share_link`, `disable_share_link`, `rotate_share_link`, `list_owner_share_links`는 첫 owner authorization 단계에서 `private.authorize_owner_play_capability(p_play_id,p_management_secret_hash,false)`를 정확히 한 번 호출한다.
- helper가 authorized가 아니면 그 outcome을 그대로 내부 반환하고 link를 변경하지 않는다. exact expired에서는 #17 helper 자체의 management hash revoke만 허용하며 share RPC는 play를 추가 변경하지 않는다.
- authorized 뒤 play row는 이미 lock 상태다. path play id와 link `pack_play_id`, play status `completed`를 검사한다.
- 성공 branch에서만 DB server time을 한 번 캡처해 owner `last_active_at`, `management_expires_at=now()+7 days`, `updated_at`을 갱신한다. generic 404 branch는 link mutation과 owner TTL touch가 모두 0회다.
- create/disable/rotate/list의 internal success envelope는 exact `managementExpiresAt`, `managementTtlSeconds=604800`과 route별 `link|links`만 가진다. strict decoder는 ISO expiry, exact TTL, link allowlist를 검증한다. HTTP JSON에서는 management field를 제거하고 같은 raw owner cookie value의 expiry만 DB 값으로 갱신한다.

### `create_share_link`

입력:

`(p_play_id uuid, p_management_secret_hash bytea, p_link_id uuid, p_public_id text, p_secret_hash bytea, p_kind text, p_expires_at timestamptz)`

- owner capability가 가리키는 exact completed play만 허용한다.
- input id/public ID/hash/kind와 nullable future expiry를 strict 검증한다. 이번 Route는 `p_expires_at=null`만 전달한다.
- unique collision은 protected subtransaction을 rollback한 exact `collision` outcome으로 반환해 row/event를 남기지 않는다. app wrapper가 bounded 3회까지 새 credential 전체를 만들어 같은 RPC를 재호출하며 그래도 충돌하면 generic 500이다.
- row insert와 `share_link_created` event insert가 같은 transaction으로 commit한다.
- event properties exact allowlist는 `{ "packVersion": string, "linkKind": "public"|"one_to_one" }`다.
- 결과: `created|collision|expired|not_found|not_completed` internal outcome.

### `disable_share_link`

입력:

`(p_play_id uuid, p_management_secret_hash bytea, p_link_id uuid)`

- owner helper 뒤 link row를 `FOR UPDATE`하고 `pack_play_id=p_play_id`를 검사한다.
- active는 disabled로 전이하고 already disabled는 idempotent success다. expired는 상태를 바꾸지 않고 authorized current link를 반환한다.
- 다른/없는 link는 generic internal `link_not_found`이며 mutation과 TTL touch가 없다.

### `rotate_share_link`

입력:

`(p_play_id uuid, p_management_secret_hash bytea, p_link_id uuid, p_new_link_id uuid, p_new_public_id text, p_new_secret_hash bytea)`

- owner helper와 exact link ownership 뒤 old active row를 잠근다.
- old kind와 nullable expires policy를 new row에 복사한다. #19 생성 link는 expiry null이다.
- old active→disabled와 new active insert, `share_link_created` event를 한 transaction으로 commit한다. new credential collision은 protected subtransaction 전체를 rollback하고 `collision`을 반환하므로 old link는 active로 남으며 wrapper가 새 credential로 bounded retry한다.
- old가 active가 아니거나 동시 rotate에서 이미 바뀌었으면 `link_not_active`로 끝나고 new row/event는 0개다.
- external Route는 `link_not_active`를 409 exact `{ "code":"SHARE_LINK_NOT_ACTIVE", "message":"링크 상태가 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요." }`로 매핑한다. cookie/TTL을 갱신하지 않으며 client는 list를 다시 읽고 one-time URL state를 제거한다.

### `list_owner_share_links`

입력:

`(p_play_id uuid, p_management_secret_hash bytea)`

- exact completed play만 조회한다.
- expiry 상태를 먼저 수렴시키고 created_at 내림차순, id tie-break로 안정 정렬한다.
- HTTP에 노출 가능한 link shape는 exact `id/publicId/kind/status/expiresAt/consumedAt`뿐이다. #19에서는 DB consumed column이 없으므로 `consumedAt`은 exact null literal이다.
- secret/hash, full URL, pack play/version id, owner 답, 생성/수정 시각, consumed response id를 반환하지 않는다.

### `get_invite_metadata`

입력:

`(p_public_id text, p_secret_hash bytea)`

- owner capability를 사용하지 않는 public read RPC다.
- public id row를 잠그고 256-bit domain-separated secret hash equality를 함께 검사한다. wrong/unknown은 동일한 `invalid` outcome이며 60/min limiter가 online guess를 제한한다.
- active+future/null expiry만 `active`다. past expiry는 row를 expired로 수렴하고 `unavailable`을 반환한다. disabled/expired도 동일한 `unavailable` external mapping이다. #24가 consumed 상태를 추가할 때 같은 unavailable mapping을 확장한다.
- active success만 `invite_opened` event를 같은 transaction에 insert한다. properties는 `packVersion`, `linkKind`만 허용한다.
- metadata exact allowlist는 `packSlug`, `packVersion`, `packTitle`, `kind`이다. play id, owner 답, owner 표시 이름, link internal id/status timestamps를 반환하지 않는다.
- public link metadata 호출은 link status/consumption을 바꾸지 않으므로 같은 public link를 여러 visitor가 재사용할 수 있다.

## server modules와 strict decoder

- `lib/share-links/share-link-state-core.mjs`
  - browser-safe pure module.
  - canonical UUID/public ID, link list item, created link response, metadata response와 internal RPC envelope를 exact key/discriminant로 decode한다.
  - coercion, extra key, duplicate id/public ID, invalid status pairing, 잘못된 ISO timestamp를 거절한다.
- `lib/share-links/invite-fragment-core.mjs`
  - browser-safe pure module이며 `node:*` import가 없다.
  - exact `#k=<43-char-base64url>`만 parsing하고 missing/duplicate/extra/percent-encoded/wrong-length fragment를 거절한다.
- `lib/share-links/share-link-session-core.mjs`
  - `node:crypto`를 사용하는 server-only credential 생성/hash와 canonical invite URL helper. browser fragment parsing을 포함하지 않는다.
  - public id와 secret canonical round-trip, decoded byte length를 검증한다.
- `lib/share-links/share-links.ts`
  - app-facing server wrapper. raw secret을 생성하고 hash만 `internal-rpc`에 전달한다.
  - RPC success 뒤에만 canonical `APP_URL`로 invite URL을 조립한다. error/log에 raw value를 넣지 않는다.
- `lib/db/internal-rpc.ts`
  - 다섯 exact RPC wrapper를 추가하고 strict internal outcome만 반환한다.
  - 기존 static allowlist의 `create/rotate/disable`를 Auth `OwnerMutationActor` surface에서 제거하고 play-bound capability wrapper로 이동한다. `listOwnerShareLinks`, `getInviteMetadata`도 allowlist한다.
- `scripts/verify-data-access.mjs`
  - 기존 owner session RPC gate와 별도로 four owner link RPC가 capability helper를 정확히 한 번 사용하며 Auth/owner anchor를 금지하는 SQL gate를 추가한다.
  - direct table client와 raw internal client export 금지를 유지한다.
- `scripts/verify-share-links.mjs`
  - raw secret/full URL logging·storage·cookie 금지, exact fragment path, exact route allowlist, strict decoder 단일 구현, default kind trace를 검사한다.

## HTTP 계약

모든 route는 `withPublicRequest`, strict schema, bounded body, proxy/origin proof, redacted error, request id/security header를 사용한다. owner와 invite metadata 응답은 `Cache-Control: private, no-store`다.

### owner 공통

- owner endpoint는 callback 첫 domain 단계에서 `owner_play_access`, network key, 600초, 120회를 적용한다.
- limiter allowed 뒤 named owner cookie를 strict parse한다. missing/malformed는 DB RPC 없이 generic owner 404다.
- play path가 있는 route는 cookie play id와 canonical path id가 exact match해야 한다. link-only path는 RPC가 link ownership을 판단하되 owner cookie play id를 명시적 `p_play_id`로 전달한다.
- missing/malformed/expired/tampered/cross-play/path-link mismatch/not-completed/link-not-found는 status 404와 exact owner error body bytes로 수렴한다. link row mutation은 0회다. `Set-Cookie` 차이는 아래 matrix만 허용한다.
- success만 renewed DB expiry로 기존 owner cookie를 갱신한다.

| branch | HTTP | domain RPC | owner TTL/hash | Set-Cookie |
|---|---:|---:|---|---|
| missing cookie | 404 | 0 | 변화 없음 | 없음 |
| malformed cookie | 404 | 0 | 변화 없음 | exact deletion |
| valid cookie + different play path | 404 | 0 | 변화 없음 | 없음, 정상 cookie 보존 |
| same-id exact expired capability | 404 | 1 | #17 helper가 hash revoke, TTL 변화 없음 | exact deletion |
| same-id wrong/tampered/stale hash | 404 | 1 | 변화 없음 | exact deletion |
| authorized draft/not-completed | 404 | 1 | TTL 변화 없음 | 없음, 정상 cookie 보존 |
| authorized different/missing link | 404 | 1 | link/TTL 변화 없음 | 없음, 정상 cookie 보존 |
| rotate `link_not_active` | 409 | 1 | link/TTL 변화 없음 | 없음, 정상 cookie 보존 |
| external rate-limit exceeded | 429 | 0 | 변화 없음 | 없음, 정상 cookie 보존 |
| limiter error | 500 | 0 | 변화 없음 | 없음, 정상 cookie 보존 |
| create/list/disable/rotate success | 200/201 | 1 | DB server time에서 exact 7일 touch | renewed expiry |
| credential collision retry | 외부 노출 없음 | 같은 credential당 1 | failed subtransaction link/event/TTL 0 | 최종 success에서만 renewed expiry |

### route별 body/response

| route | input | success response |
|---|---|---|
| `POST /api/plays/[playId]/links` | exact `{ "kind":"public"|"one_to_one" }`, ≤64 bytes | 201 exact `{ "link": <allowlist>, "inviteUrl": string }` |
| `GET /api/me/plays/[playId]/links` | body 없음 | 200 exact `{ "links": [...] }` |
| `PATCH /api/links/[linkId]` | exact `{}`, ≤16 bytes | 200 exact `{ "link": <allowlist> }` |
| `POST /api/links/[linkId]/rotate` | exact `{}`, ≤16 bytes | 201 exact `{ "link": <allowlist>, "inviteUrl": string }` |
| `POST /api/invites/[publicId]/metadata` | exact `{ "secret": "<43-char>" }`, ≤96 bytes | 200 exact metadata allowlist |

- owner create/rotate duplicate submission은 button in-flight lock과 module-scoped promise dedupe로 한 browser runtime에서 한 request만 보낸다. DB row lock/unique constraints가 최종 동시성 경계다.
- create/rotate domain RPC가 commit한 뒤 HTTP 응답이 유실됐는지 판단할 수 없는 network failure는 자동 mutation retry를 하지 않는다. client는 one-time URL을 만들지 않고 list를 다시 읽어 sanitized row 증가 여부를 복구한 뒤, raw URL이 없으면 explicit `새 링크 만들기` 또는 active row `새로 발급`으로만 수렴한다.
- invite route는 canonical public id로 `deriveInviteRateLimitKey(networkKey,publicId)`를 만든다. exact bytes는 `SHA-256(UTF8("gyeop-invite-metadata-v1") || 0x00 || networkKey[32] || 0x00 || UTF8(publicId[22]))`이며 결과 32 bytes만 `consume_rate_limit`에 전달한다.
- scoped key test vector: network key bytes `00..1f`, public id `AAAAAAAAAAAAAAAAAAAAAA` → hex `d50621b4e90346d46a2d186846c5d7190e7eea4f4e2a742b28ee11dc85696b00`.
- limiter는 exact `invite_metadata`, 60초, 60회이며 `get_invite_metadata`보다 먼저 한 번 호출된다. over-limit/limiter error에서 metadata RPC와 analytics insert는 0회다.
- wrong secret/disabled/expired/unknown은 외부 status 404와 exact `{ "code":"INVITE_UNAVAILABLE", "message":"이 초대는 지금 참여할 수 없습니다." }`로 통일한다.
- invite 429는 boundary registry의 `RATE_LIMITED` body와 정확한 positive `Retry-After`를 반환한다. secret/public ID/request body를 echo하지 않는다.

## 디자인 영향

### `/me/plays/[playId]`

- #18의 black/lime/blue visual language와 max-width mobile shell을 재사용한다.
- server page는 `getPackPresentation("old-friend")`의 `defaultShareKind`만 prop으로 전달한다. client는 기존 `loadOwnerFlow(playId)`를 재사용해 exact owner GET→pack GET으로 completed 상태·title·slug/version을 검증한 뒤 exact link list GET을 호출한다. owner slug가 `old-friend`가 아니거나 server presentation과 mismatch이면 terminal로 수렴하며 browser registry를 복제하거나 hardcode하지 않는다.
- 상단에는 `내 답변` back link, `공유 링크` heading, verified published pack title을 둔다.
- 링크 종류는 두 개의 44px 이상 radio-card로 제공한다.
  - `여러 친구에게 공개` — 여러 명이 참여할 수 있음
  - `한 친구에게 1:1` — 한 명 완료 뒤 닫힘(소비 동작은 #24)
- manifest default에는 `추천` badge를 표시하되 owner selection을 강제하지 않는다.
- create primary button은 `공유 링크 만들기`다. in-flight 중 중복 click을 막고 `만드는 중…`을 표시한다.
- invite URL이 memory에 있을 때 `공유 링크가 준비됐어요`와 `이 전체 링크는 현재 화면에서만 사용할 수 있어요`를 표시한다. full URL 전달·copy/share controls와 성공/실패 feedback은 #21이 추가한다.
- 상태 목록은 kind, active/disabled/expired, nullable expiry와 `consumedAt=null`만 보여준다. secret placeholder나 일부 masking도 표시하지 않는다.
- destructive disable은 native dialog의 explicit 확인 뒤 실행하고 focus를 trigger로 복귀시킨다.
- active link rotate는 `새로 발급`이며 기존 링크가 즉시 비활성화된다는 설명을 dialog에 둔다.
- terminal generic owner state는 #18과 같은 heading/copy로 수렴하고 다른 play/link 정보를 렌더하지 않는다.

### `/i/[publicId]`

- server page는 public id 형식과 일반 shell만 렌더하며 fragment나 metadata를 server prop으로 받지 않는다.
- client metadata success 전 skeleton은 owner 이름이나 pack 내용을 추측하지 않는다.
- active heading은 `친구가 먼저 답한 질문팩이에요`, body는 `이 사람을 어떻게 보고 있는지 3장으로 답해보세요.`다.
- #22 전까지 CTA는 disabled fake button을 두지 않고 `친구 답변은 다음 단계에서 이어져요` 안내만 둔다. #22가 같은 screen에 관계 선택과 response session 시작을 연결한다.
- unavailable/fragment malformed/429 retryable을 구분한다. unavailable은 generic home link, 429/network는 explicit `다시 시도`를 제공한다.
- owner 표시 이름, self answer, 선택 count, relationship 추정, private status를 렌더하지 않는다.
- heading 최초 진입 focus, retry status `aria-live`, 44px control, visible focus, reduced motion, 320/390/430px no horizontal overflow를 만족한다.

## 구현 계획

1. `20260718000400_share_links.sql`에 table, RLS, policies, owner/public RPC, analytics insert를 구현하고 pgTAP으로 권한·constraint·transition·event payload를 고정한다.
2. local DB reset 뒤 generated `lib/db/database.types.ts`를 갱신한다.
3. share credential/hash, strict decoder, internal RPC/server wrapper와 scoped invite limiter key를 구현한다.
4. data-access/HTTP/share source verifier를 play-bound capability와 exact route order로 확장하고 negative fixture tests를 추가한다.
5. owner API 4개와 invite metadata API를 strict boundary 위에 구현한다.
6. `/me/plays/[playId]` link management/one-time-ready UI, #18 completed CTA, `/i/[publicId]` fragment metadata UI를 구현한다. Web Share/clipboard는 구현하지 않는다.
7. focused unit/pgTAP/integration/Playwright를 추가하고 실제 local Supabase+Chromium에서 create 응답 URL→새 context invite open→rotate/disable/reload를 검증한다.
8. 실제 390×844 screenshot을 Lazyweb/visual QA로 확인하고 overflow/focus를 보정한다.
9. `./scripts/run-ai-verify --mode full`을 통과한다.

## 완료 기준

- [ ] completed owner와 exact same-play capability만 public/one-to-one link를 생성한다.
- [ ] owner link RPC 네 개가 같은 transaction에서 capability helper를 정확히 한 번 사용하고 Auth UID/owner anchor가 없다.
- [ ] missing/malformed/expired/tampered/cross-play/not-completed/link mismatch는 generic 404, link mutation 0회이며 cross-play valid cookie를 보존한다.
- [ ] DB에는 public id와 domain-separated hash만 있고 raw secret/full URL/self answer가 없다.
- [ ] create/rotate response만 full fragment URL을 한 번 반환하고 reload/list는 상태 allowlist만 복구한다.
- [ ] default public 추천과 owner의 one-to-one override가 실제 create body/RPC row kind에 반영된다.
- [ ] disable retry가 idempotent이고 rotate가 old disable+new insert를 한 transaction으로 처리한다.
- [ ] concurrent rotate에서 new link/event가 정확히 하나만 생긴다.
- [ ] same public link를 독립 visitor 두 명이 열어 active metadata를 받고 link는 active로 남는다.
- [ ] disabled/expired/wrong-secret/unknown invite가 owner 이름·답·존재 여부 없이 동일 unavailable UI로 수렴한다.
- [ ] invite metadata 60회까지만 domain RPC를 실행하고 61번째는 429/정확한 Retry-After/domain RPC 0회다.
- [ ] `share_link_created`, `invite_opened` event에는 packVersion/linkKind 외 secret/URL/answer/network 원문이 없다.
- [ ] 320/390/430px owner/invite 화면에 overflow가 없고 44px target, keyboard, focus, dialog, reduced motion, aria-live가 동작한다.
- [ ] full verify가 통과한다.

## 테스트 계획

### unit/source policy

- public ID/secret canonical encode-decode와 domain separator hash vector
- strict link/RPC/metadata decoder: extra key, coercion, invalid timestamp/status pairing, duplicate link 거절
- fragment parser: missing/duplicate/extra/percent-encoded/wrong length 거절
- invite scoped network+link key가 같은 pair에는 안정적이고 다른 network/link에는 달라짐
- data-access gate가 share RPC의 Auth actor/owner_id/helper 누락·중복·late mutation을 거절
- HTTP gate가 limiter 뒤 domain, arbitrary fetch/path, raw secret log/storage를 거절

### pgTAP

- table columns/check/index/FK/RLS/grant/function owner/signature exact inventory
- completed same-play create success, draft/cross-play/tampered/expired 실패와 mutation 0
- list field allowlist/order와 expiry 수렴
- disable idempotency와 단일 transaction rotate atomicity
- public repeated metadata no consume, wrong hash invalid, disabled/expired unavailable
- analytics event allowlist와 raw secret/answer 부재

### integration/API

- real proxy/origin boundary를 거친 create/list/disable/rotate cookie renewal
- cross-play body/status/header equality와 Set-Cookie 보존
- create/rotate URL fragment를 decode한 hash만 DB row와 일치하고 DB 전체 text/bytea/event에 raw secret 없음
- 독립 DB session concurrency test에서 concurrent rotate one winner와 UUID/public ID/hash collision 각각의 old link/event/owner TTL 불변
- invite 60/61 atomic limiter, exact Retry-After, 61번째 metadata/event 0
- 같은 public URL을 cookie/storage가 분리된 두 browser context에서 metadata open
- secretless production build와 data-access policy

### Playwright

- completed owner 화면→link manager→default public 생성→one-time-ready state
- one-to-one override가 request와 상태에 반영
- reload 후 full URL 없음, 상태만 복구, new create/active rotate 가능
- disable dialog/focus/state, rotate 후 old URL unavailable/new URL active
- valid invite 일반 문구, malformed/disabled/expired/unknown generic unavailable
- 320/390/430 mobile overflow, 44px, keyboard, reduced motion, no browser storage write

### final

- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- `share_link_created`: exact `packVersion`, `linkKind`만 기록한다.
- `invite_opened`: valid active metadata에서 exact `packVersion`, `linkKind`만 기록한다.
- event에 `playId`, internal link id/public id, full URL, secret/hash, IP/network key, owner/visitor A/B, user agent, channel을 넣지 않는다.
- Web Share/clipboard와 그 성공 event는 이번 PR에 없고 #21에서 구현한다. #19는 생성 성공을 외부 전달 성공으로 과대 집계하지 않는다.

## 개인정보와 악용 방지

- fragment secret은 HTTP path/query/referrer/access log에 전달되지 않는다. metadata POST body는 application log에서 절대 출력하지 않는다.
- owner API와 create/rotate response는 private no-store다. visitor metadata도 bearer input을 다루므로 private no-store다.
- public ID 단독으로 owner/play/pack metadata를 읽지 못한다. secret hash까지 일치해야 한다.
- invite metadata response에는 표시 이름, self answer, 방문자 답, 응답 수가 없다.
- owner link API는 valid capability라도 다른 play/link에 사용하지 못하며 failure에서 current valid cookie를 보존한다.
- owner server는 create/rotate response 생성 직후 raw secret 참조를 버리고 재조회/복구 기능을 제공하지 않는다. visitor client는 fragment와 metadata retry 중 transient memory에만 두며 storage/log/analytics에 남기지 않는다.
- network limiter는 기존 daily HMAC network key와 public ID를 다시 domain-scope하며 원 IP를 저장하지 않는다.
- CSP, HSTS, `Referrer-Policy: no-referrer`, `nosniff` 기존 header gate를 유지한다.

## 롤아웃과 복구

- migration은 additive다. `share_links`가 비어 있으면 기존 owner 10장 흐름에 영향이 없다.
- #18 완료 화면 CTA는 link APIs가 정상일 때만 새 화면을 사용하지만 API 실패 시 owner 답 완료 상태는 유지된다.
- rollback 시 UI/API route를 이전 release로 되돌려도 table과 link row는 보존한다. 이미 발급된 URL이 404가 되는 product impact를 명시하고, DB migration을 down/drop하지 않는다.
- 재배포 뒤 같은 migration/RPC가 existing row와 status를 읽어 기존 public URL을 다시 활성 상태로 제공해야 한다.
- secret/hash schema나 domain separator는 기존 URL을 모두 깨뜨리므로 version 없이 변경하지 않는다.

## 스펙 검토

Reviewer Agent: issue19_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 공개·1:1 자동 만료 기본값은 미결정이다. #19는 `expires_at=null` 생성과 과거 expiry fixture만 구현한다.
- 1:1 `consumed_response_id`/`consumed_at` column·FK와 실제 consume 전이는 #24의 visitor submit/consume migration에서 완성한다.
- Web Share/clipboard와 플랫폼별 channel 우선순위는 후속 #21 범위다.
- greenfield 단계에는 비교할 실제 screenshot이 없으므로, 구현 screenshot이 생긴 뒤 existing-screen visual report와 실제 browser QA로 마무리한다.
