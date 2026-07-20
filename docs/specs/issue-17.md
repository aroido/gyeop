# Issue 17 구현 스펙: [백엔드] 같은 브라우저 주인 세션과 draft 귀속 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/17

## 목표

이메일·전화번호·표시 이름 없이 첫 `old-friend` owner play를 만들고, 256-bit 관리 secret을 `Secure`·`HttpOnly`·`SameSite=Lax` cookie에만 보관해 같은 브라우저가 7일 inactivity window 동안 자신의 10장 draft·완료 상태를 저장하고 복구하게 한다. DB와 서버는 raw secret을 저장·반환·기록하지 않고 hash와 play id가 모두 맞을 때만 owner 권한을 인정한다.

## 범위

- `pack_plays`와 `self_answers`를 migration으로 추가한다. P0 owner session은 owner play 하나에 결합하며 별도 계정·프로필 identity를 만들지 않는다.
- owner play를 만들 때 서버가 UUID play id와 32-byte random 관리 secret을 생성한다. cookie에는 version, play id, raw secret을 담고 DB에는 domain-separated SHA-256 hash만 저장한다.
- active current published pack에 대해서만 새 play를 만든다. 생성된 play는 template이 나중에 inactive가 되거나 current version pointer가 이동해도 자신의 동결된 published version과 유효 capability로 관리 상태를 복구한다. template activation은 신규 진입 gate이며 기존 owner 권한 revoke 수단으로 사용하지 않는다.
- 관리 cookie가 없는 최초 `POST /api/plays`만 새 play를 만든다. 유효 cookie가 있으면 같은 play를 반환하고 중복 row를 만들지 않는다. cookie가 존재하지만 malformed·tampered·expired·revoked인 경우 새 play로 바꾸지 않고 generic 404와 cookie 삭제를 반환한다.
- `GET /api/plays/[playId]`, `PUT /api/plays/[playId]/answers/[cardId]`, `POST /api/plays/[playId]/complete`, `DELETE /api/me/session`을 추가한다.
- 답 선택과 현재 위치를 idempotent하게 저장하고, 정확히 10장의 서로 다른 valid pack card에 답한 play만 완료한다. 완료 뒤 self answer는 불변이다.
- 모든 성공한 owner read/write는 DB server time 기준 `last_active_at`과 `management_expires_at = last_active_at + 7 days`를 함께 갱신하고, 반환된 DB TTL·expiry로 cookie를 갱신한다. browser clock 차이로 cookie가 DB expiry보다 잠시 오래 남을 수 있어도 DB expiry가 최종 권한이다.
- save와 complete가 경쟁해도 parent play row lock으로 직렬화한다. 이미 10장인 play의 answer edit 경쟁은 complete-first에서 edit를 거절한다. 9장 play의 마지막 save 경쟁은 complete-first가 incomplete로 끝난 뒤 save를 허용한다.
- 로그아웃은 DB hash를 제거하고 revoke 시각을 기록한 뒤 cookie를 만료한다. missing·malformed·이미 revoked cookie의 로그아웃도 idempotent 204와 cookie 삭제로 끝난다.
- public HTTP boundary, strict JSON schema, no-store 응답, redacted error를 모든 Route에 적용한다. 신규 생성 quota는 play insert와 같은 DB transaction에 두고, read/save/complete만 공통 external access limiter를 사용한다. 로그아웃은 revoke를 막지 않도록 rate-limit 예외로 둔다.
- 모든 owner-scoped DB 함수가 같은 play-bound capability authorization helper를 transaction 안에서 사용하게 하고, 다른 play id에 cookie를 재사용하는 cross-play fixture를 거절한다. 후속 link/profile RPC도 임의 `owner_id`를 만들지 않고 같은 play id+hash helper를 사용해야 한다.
- `docs/product/core-feature-priority.md`, `docs/product/decision-log.md`, `docs/engineering/p0-development-plan.md`에 `비공개 재미 검증`과 `production beta 재승인` 단계를 분리한다. 전자만 무이메일 same-browser owner cookie를 active 계약으로 사용한다. 기존 이메일 Auth·알림·account deletion 설계는 삭제하지 않고 production beta candidate로 명시해 Project #5의 비공개 재미 검증 완료 gate에서 제외한다.
- 현재 development `localStorage` prototype UI는 유지한다. #18이 이 API를 사용해 실제 자동 저장·복구 UI로 전환한다.

## 제외 범위

- 이메일 매직 링크, Supabase Auth 로그인, OTP, 영구 계정, 표시 이름, 전화번호
- 다른 브라우저·기기 handoff, 계정 복구, secret 재발급, 복수 owner play 전환 UI
- 공개·1:1 공유 링크 table과 생성·회전·비활성 API. 이번 PR은 후속 RPC가 재사용할 play-bound capability helper와 cross-play 거절 계약까지만 소유한다.
- 방문자 응답, 비교, 관계 집계, 프로필 API·화면
- analytics event 기록과 알림
- 만료 row 물리 삭제·보관 cleanup. 만료·logout 시 권한 hash 제거까지만 이번 migration이 담당한다.
- `old-friend` production 활성화. seed의 `is_active=false`는 유지하고 integration fixture에서만 활성화한다.
- 현재 질문 카드 화면의 디자인·interaction 변경

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

이슈 #17의 승인된 무이메일 same-browser 요구가 위 문서의 2026-07-15 매직링크 초안보다 최신이다. 다만 supersede 범위는 Project #5의 `비공개 재미 검증` 단계뿐이다. 이번 PR은 다음 절을 exact 수정한다.

- `core-feature-priority.md` §5.1의 P0 로그인 두 bullet을 capability cookie와 복구 불가 문구로 교체하고, production beta의 이메일·계정 삭제는 별도 재승인 stage임을 명시한다.
- `decision-log.md`에 2026-07-18 결정을 추가해 2026-07-15 `P0 계정 연결과 알림은 이메일`, `P0 draft 귀속`, `production beta owner 계정 삭제` 결정이 비공개 재미 검증에는 적용되지 않고 beta candidate에만 남는다고 기록한다.
- `p0-development-plan.md` §2에 두 stage 적용 표를 추가하고 현재 문서 구조에 맞춰 §7 화면·URL, §8 핵심 데이터 모델, §9 원자 규칙·RPC, §10 API 경계, §11 인증·cookie, §14 보안·rate limit, §16 test gate, §17 `OWNER-DRAFT-AUTH` 행을 capability 계약으로 갱신한다. Auth registration/claim, SMTP/notification, account deletion/Cron 내용은 `production beta candidate — inactive until re-review`로 묶어 현재 Project completion과 구분한다.

이 범위 밖의 production beta 후보를 제거하거나 구현하지 않는다.

## 사용자 흐름 영향

1. owner가 최초로 팩 시작 요청을 보내고 관리 cookie가 없으면 서버가 새 play와 secret을 한 번 만든다.
2. 같은 브라우저는 응답의 HttpOnly cookie를 자동 전송하며 play id, 질문별 A/B 선택, 현재 위치, 완료 상태를 서버에서 복구한다.
3. 각 성공 요청은 7일 inactivity window를 다시 시작한다. 브라우저 cookie 시각이 아니라 DB `management_expires_at`이 권한의 기준이다.
4. cookie가 없거나 다른 play id를 가리키거나 secret이 변조·만료·revoke된 경우 모든 owner read/write는 같은 404 body를 반환한다. 다른 play의 존재·상태·pack slug·답 수는 드러내지 않는다. 유효 cookie로 다른 path id를 요청한 cross-play 404는 현재 정상 cookie를 삭제하지 않는다.
5. 10장 완료 뒤 같은 cookie는 완료 상태를 읽을 수 있지만 답을 변경할 수 없다. 후속 공유 링크·프로필 API는 이 play-bound 권한을 재사용한다.
6. 로그아웃 또는 7일 inactivity 뒤에는 해당 play를 복구할 수 없다. 이메일 복구나 자동 계정 전환을 약속하지 않으며, 새 시작은 invalid cookie가 삭제된 다음 명시적인 새 `POST /api/plays`로만 가능하다.

## 디자인 영향

- 사용자 화면 변경은 없다.
- API의 generic 404·incomplete 409 문구만 새 사용자 표시 문자열이다.
- #18 전까지 development 질문 화면의 `localStorage` key와 기존 Playwright 동작을 유지한다.

## API와 데이터 영향

### cookie와 secret 계약

- cookie 이름은 `__Host-gyeop-owner`다.
- 값은 `v1.<uuid>.<base64url-secret>` exact 형식이며 secret은 32 bytes, unpadded base64url 43자다.
- cookie 속성은 `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`이고 `Domain`을 설정하지 않는다.
- hash는 `SHA-256(UTF-8("gyeop-owner-play-v1") || 0x00 || raw-secret-bytes)` 32 bytes다. raw cookie value와 secret은 DB·RPC argument·response JSON·analytics·app log에 들어가지 않는다.
- cookie parser는 version, canonical lower-case UUID, base64url alphabet·길이, decoded length를 exact 검증한다. malformed cookie를 hash하거나 DB에 보내지 않는다.
- authorized create/resume/read/save와 authorized incomplete/completed outcome은 RPC가 반환한 DB 기준 `managementTtlSeconds`를 cookie `Max-Age`로 사용하고 `managementExpiresAt`을 `Expires`로 설정한다. network/browser clock 차이로 cookie가 DB expiry보다 잠시 오래 남을 수 있으며 DB `management_expires_at`만 최종 권한이다. 만료 cookie가 남아도 데이터 접근은 실패한다.
- named cookie 자체가 malformed이거나 cookie id와 같은 path에서 DB가 stale/tampered/expired/revoked credential을 확인한 경우에만 `Max-Age=0`, 과거 `Expires`로 삭제한다. 유효 cookie id와 다른 path id·body slug의 generic 404는 cookie를 보존한다.
- logout은 credential 결과와 관계없이 동일 속성으로 cookie를 삭제한다.

### schema

`supabase/migrations/20260718000300_owner_play_session.sql`에 다음을 추가한다.

- `pack_plays`
  - `id uuid primary key`, `pack_version_id uuid not null`, `management_secret_hash bytea`, `management_expires_at timestamptz not null`, `last_active_at timestamptz not null`, `management_revoked_at timestamptz`, `status text not null default 'draft'`, `current_position smallint not null default 1`, `created_at`, `updated_at`, nullable `completed_at`을 가진다.
  - hash는 live session에서만 32 bytes이며 non-null hash partial unique index를 둔다.
  - live session은 `management_secret_hash IS NOT NULL`과 `management_revoked_at IS NULL`이 함께 참이고, revoked session은 hash가 null이고 revoke 시각이 non-null이다.
  - `management_expires_at = last_active_at + interval '7 days'`, `current_position` 1..10, `status` exact `draft|completed`, `completed_at`과 completed status의 nullability pair를 CHECK한다.
  - `(id, pack_version_id)` unique key와 `pack_versions(id)` FK를 둔다. P0 play는 생성 시 동결된 pack version을 유지한다.
- `self_answers`
  - `pack_play_id uuid`, `pack_version_id uuid`, `card_id text`, `choice text`, `created_at`, `updated_at`을 가진다.
  - PK는 `(pack_play_id, card_id)`, choice는 exact `a|b`다.
  - `(pack_play_id, pack_version_id)`는 play의 composite key, `(pack_version_id, card_id)`는 `pack_cards`의 composite PK를 참조해 다른 pack card를 답으로 넣지 못한다.
- 두 table 모두 RLS를 켠다. `PUBLIC`, `anon`, `authenticated`, `service_role`은 direct SELECT/INSERT/UPDATE/DELETE 권한이 없다.
- `gyeop_internal_rpc`만 `pack_plays` SELECT/INSERT/UPDATE, `self_answers` SELECT/INSERT/UPDATE와 이에 대응하는 exact role policy를 가진다. DELETE policy·grant는 이번 범위에 없다.
- self answer INSERT/UPDATE/DELETE trigger는 parent play row를 `FOR UPDATE`로 먼저 잠그고 completed play mutation을 거절한다. UPDATE로 play/version/card identity를 옮길 수 없다.
- exposed schema 밖 `private.authorize_owner_play_capability(play_id, hash, touch)` helper는 id+hash row를 `FOR UPDATE`로 잠그고 `authorized|expired|not_found`만 반환한다. exact expired credential은 hash를 제거한다. authorized+touch는 DB server time으로 activity/expiry를 갱신한다. `gyeop_internal_rpc` 외에는 schema usage와 execute가 없고, 모든 현재·후속 owner-scoped RPC는 이 helper를 같은 transaction 안에서 호출한다.
- `supabase/config.toml`의 exposed schemas에는 `private`를 추가하지 않는다. pgTAP은 API exposed schema inventory, `PUBLIC`·`anon`·`authenticated`·`service_role`의 `private` USAGE/함수 EXECUTE 부재, `gyeop_internal_rpc`만 exact helper를 실행할 수 있음을 함께 증명한다.

### RPC

모든 함수는 `SECURITY DEFINER`, owner `gyeop_internal_rpc`, empty `search_path`, schema-qualified relation을 사용한다. `service_role`만 exact signature를 실행하며 public/anon/authenticated는 실행하지 못한다.

- `create_or_resume_play(p_pack_slug text, p_existing_play_id uuid, p_existing_secret_hash bytea, p_new_play_id uuid, p_new_secret_hash bytea, p_network_key bytea) returns jsonb`
  - existing id+hash pair 또는 new id+hash pair 중 정확히 하나만 non-null이어야 하며 입력 domain과 32-byte hash/network key를 검사한다.
  - existing branch는 capability helper를 touch 없이 호출한다. body slug가 같은 유효 play만 activity를 갱신해 `resumed`하고 owner draft create quota를 소비하지 않는다. slug가 다르면 internal `wrong_pack`으로 cookie를 보존한다. expired exact credential은 `expired`, wrong/stale credential은 `not_found`다. 어느 경우에도 새 row를 만들지 않는다.
  - new branch는 먼저 active template의 current published version을 잠가 존재·active·published를 검증한다. unknown·inactive·unpublished면 exact `{ "outcome": "pack_not_found" }`를 반환하고 bucket·play·cookie를 전혀 바꾸지 않는다.
  - valid pack일 때만 같은 transaction의 보호된 subtransaction에서 `owner_draft_create`, 3600초, 5회 network bucket을 소비한다. allowed일 때 새 draft를 insert하고 `created`를 반환한다. 초과 increment는 rollback해 bucket count를 exact 5로 유지하고, play row 없이 `rate_limited`와 positive integer `retryAfterSeconds`를 반환한다. valid resume과 `pack_not_found`는 bucket count를 바꾸지 않는다.
  - 생성 시각과 expiry를 한 번 캡처한 같은 `v_now := clock_timestamp()` 값에서 만든다. pack/version 검증, allowed bucket 증가, play insert는 한 RPC transaction이며 HTTP의 별도 create limiter를 사용하지 않는다.
- `get_owner_play(p_play_id uuid, p_management_secret_hash bytea) returns jsonb`
  - capability helper로 id+hash의 live·unexpired 상태를 검사한다. 기존 play는 template active/current 여부와 무관하게 자신이 연결된 published version을 유지한다.
  - expired exact credential은 hash 제거 후 `expired`, wrong/stale credential은 `not_found`, 성공은 activity/expiry를 갱신한 `authorized` owner-state를 반환한다.
- `save_owner_answer(p_play_id uuid, p_management_secret_hash bytea, p_card_id text, p_choice text, p_current_position smallint) returns jsonb`
  - capability helper를 touch 없이 호출해 권한·expiry를 확인한 뒤 draft 상태에서만 같은 version card를 idempotent upsert하고 current position·activity를 갱신한다.
  - 성공은 exact `{ "outcome": "saved", "play": <owner-state> }`, completed play는 activity를 갱신한 exact `{ "outcome": "completed", "play": <owner-state> }`, expired는 `expired`, wrong/stale credential은 `not_found`, 유효 owner의 다른/unknown card는 internal `invalid_card`를 반환한다. `invalid_card`는 activity를 갱신하지 않고 외부에서 같은 404로 매핑하되 cookie를 보존한다.
- `complete_owner_play(p_play_id uuid, p_management_secret_hash bytea) returns jsonb`
  - capability helper로 session/play row를 잠그고 같은 version의 서로 다른 카드 10장이 모두 답해졌는지 검사한다.
  - 부족하면 activity를 갱신한 exact `{ "outcome": "incomplete", "play": <owner-state> }`, 정확하면 `completed_at`과 status를 원자 갱신하고 exact `{ "outcome": "completed", "play": <owner-state> }`를 반환한다.
  - 이미 완료된 같은 owner retry도 activity를 갱신하고 같은 completed envelope로 수렴한다. expired는 `expired`, wrong/stale는 `not_found`다.
- `revoke_owner_play_session(p_play_id uuid, p_management_secret_hash bytea) returns boolean`
  - capability helper를 touch 없이 사용한다. exact live credential이면 hash를 제거하고 revoke 시각을 남긴다. exact credential이 이미 expired여도 helper가 hash를 제거한다. missing·wrong은 false이며 외부 logout 응답은 차이를 노출하지 않는다.

owner-state JSON은 다음 exact allowlist만 가진다.

```json
{
  "id": "uuid",
  "packSlug": "old-friend",
  "packVersion": "old-friend-v1",
  "status": "draft",
  "currentPosition": 1,
  "answers": [{ "cardId": "conflict", "choice": "a" }],
  "managementExpiresAt": "ISO-8601",
  "managementTtlSeconds": 604800
}
```

answers는 pack card position 순이며 internal version UUID, hash, revoke/created/updated/completed timestamp, prompt·선택지, 다른 owner 식별자, future private column을 포함하지 않는다. 모든 authorized touch는 DB에서 `v_now := clock_timestamp()`를 정확히 한 번 캡처해 `last_active_at = v_now`, `management_expires_at = v_now + interval '7 days'`를 함께 쓰고, TTL은 별도 clock 호출이나 floor 없이 두 저장값의 차이에서 계산해 touch 직후 exact 604800을 반환한다. TypeScript wrapper가 owner-state와 mutation envelope뿐 아니라 `created|resumed|pack_not_found|rate_limited|authorized|saved|completed|incomplete|expired|not_found|wrong_pack|invalid_card`의 route별 허용 discriminant와 exact key, coercion, duplicate/unknown answer, 순서·status·position·expiry/TTL 불일치를 strict decode해 generic server error로 바꾼다. HTTP는 envelope를 그대로 노출하지 않고 성공 시 `play`만 반환하며 completed-save와 incomplete-complete는 고정 409 error body로 매핑한다.

capability outcome별 side effect는 다음으로 고정한다.

| outcome | activity/expiry | hash | cookie |
|---|---|---|---|
| created, resumed, authorized read, saved, completed | DB server time에서 7일로 갱신 | 유지 | 새 TTL로 갱신 |
| authorized incomplete complete, completed-play save 409, completed retry | DB server time에서 7일로 갱신 | 유지 | 새 TTL로 갱신 |
| exact expired credential | 갱신 안 함 | null로 제거, revoke 시각 기록 | 삭제 |
| malformed cookie, same-id wrong/stale credential | 갱신 안 함 | 변경 안 함 | 삭제 |
| valid cookie + different path id/body slug/unknown card | 갱신 안 함 | 변경 안 함 | 보존 |
| logout exact live/expired | 갱신 안 함 | live면 제거, expired면 제거된 상태 유지 | 삭제 |
| missing cookie, wrong/stale logout | 갱신 안 함 | 변경 안 함 | 삭제 |
| external access 429/limiter error | domain RPC 0회 | 변경 안 함 | 보존 |
| atomic create pack_not_found | play row 없음, bucket count 불변 | 생성 안 함 | 설정 안 함 |
| atomic create rate_limited | play row 없음, 초과 increment rollback 후 bucket count exact 5 유지 | 생성 안 함 | 설정 안 함 |

### HTTP

- `POST /api/plays`
  - strict body `{ "packSlug": "old-friend" }`, 최대 128 bytes다.
  - cookie가 아예 없으면 새 play id/secret을 생성해 network key와 함께 `create_or_resume_play` new branch를 정확히 한 번 호출한다. `created`는 201+owner state+cookie, atomic `rate_limited`는 play row 없이 429+exact `Retry-After`다.
  - valid cookie가 있으면 `owner_play_access` limiter 뒤 body slug와 cookie credential을 `create_or_resume_play` existing branch로 복구해 200을 반환하며 owner create quota, 새 row, 새 secret을 만들지 않는다.
  - named cookie가 malformed이거나 DB 검증에 실패하면 새 play를 만들지 않고 generic owner 404와 cookie deletion을 반환한다.
  - cookie id가 가리키는 valid play와 body slug만 다르면 같은 owner 404지만 cookie를 보존한다. cookie가 없는 inactive·unknown·unpublished pack은 RPC의 exact `pack_not_found`를 #15 exact `PACK_NOT_FOUND` 404로 매핑하며 bucket·play를 바꾸거나 cookie를 설정하지 않는다.
- `GET /api/plays/[playId]`
  - path id와 cookie id가 canonical exact match할 때만 RPC를 호출하고 200 owner state를 반환한다.
- `PUT /api/plays/[playId]/answers/[cardId]`
  - strict body `{ "choice": "a"|"b", "currentPosition": 1..10 }`, 최대 96 bytes다.
  - idempotent save 성공은 200, completed outcome은 exact 409다.
- `POST /api/plays/[playId]/complete`
  - strict empty object body `{}`, 최대 16 bytes다.
  - 10장 완료·이미 완료 retry는 200, 부족하면 exact 409다.
- `DELETE /api/me/session`
  - strict empty object body `{}`, 최대 16 bytes다.
  - valid cookie면 revoke RPC 뒤 204, 그 밖에도 RPC 차이를 노출하지 않고 204이며 항상 cookie를 삭제한다.
  - body 없는 DELETE는 #14 mutation boundary의 JSON 계약상 지원하지 않는다. client는 `Content-Type: application/json`과 exact `{}`를 보내며 missing body/content type 회귀 test는 boundary error를 확인한다.

owner 404는 모든 read/save/complete에서 status 404와 exact `{ "code": "OWNER_PLAY_NOT_FOUND", "message": "진행 중인 팩을 찾을 수 없습니다." }`다. status/body는 missing/tampered/expired/cross-play에서 byte-identical하되 위 outcome 표의 `Set-Cookie` 정책은 정상 capability 보존을 위해 다르다. incomplete 409는 `OWNER_PLAY_INCOMPLETE`, completed edit 409는 `OWNER_PLAY_COMPLETED` 고정 code/문구다. 두 authorized 409도 새 owner state를 body에 노출하지 않고 cookie TTL만 갱신한다. 모든 owner 응답은 `Cache-Control: private, no-store`와 #14 security/request-id header를 가진다.

모든 Route는 실제 Request를 `withPublicRequest`에 직접 전달하고 다음 route·branch별 순서를 지킨다.

- `POST /api/plays`: `boundary → named cookie lookup/strict parser → absent: atomic create adapter | malformed: domain RPC 없이 generic 404+cookie 삭제 | valid: owner_play_access limiter → resume adapter`다. absent branch에는 external limiter를 두지 않고 RPC 내부 create quota만 쓴다.
- GET/save/complete: `boundary → owner_play_access limiter → named cookie lookup/strict parser → adapter`다. limiter 오류·429에서는 parser 뒤 domain adapter를 포함한 owner domain RPC가 0회다. limiter를 통과한 뒤 missing·malformed cookie는 domain RPC 없이 generic 404로 끝내고 malformed만 cookie를 삭제한다. valid cookie의 id와 path가 다르면 domain RPC 없이 generic 404로 끝내되 cookie를 보존한다. 같은 id만 adapter를 호출한다.
- logout: `boundary → named cookie lookup/strict parser → revoke adapter`다. external limiter가 없고 valid cookie만 revoke를 정확히 한 번 시도한다. missing·malformed는 domain RPC 없이 204로 끝내며 모든 branch가 cookie를 삭제한다.

HTTP verifier는 위 branch별 순서, owner Route의 raw `internal-rpc` import 금지, boundary 밖 domain 호출 금지, eager adapter call 금지, namespace/dynamic/helper/loop/recursive exact-once 우회를 거절하고 atomic create/resume migration·pgTAP evidence를 요구한다.

## 구현 계획

1. 위에 열거한 product/decision/engineering 절에 비공개 검증 same-browser cookie 결정을 기록하고 매직링크·account claim을 production beta candidate로 표시한다.
2. pure secret/cookie value core와 strict owner-state decoder unit test를 먼저 추가한다.
3. owner play migration에 schema, private capability helper, constraints, indexes, RLS/grants, immutable trigger와 다섯 RPC를 구현한다. `create_or_resume_play`의 resume/new XOR branch와 atomic `owner_draft_create` bucket을 pgTAP으로 먼저 증명한다.
4. `supabase/tests/owner_play_session.test.sql`에 schema·grant·RLS·create/save/complete/expiry/revoke·field allowlist test를 추가하고 generated Database type을 재생성한다.
5. `lib/db/internal-rpc.ts`에 exact named wrappers만 추가하고 data-access allowlist/verifier와 direct-access integration fixture를 갱신한다.
6. cookie read/set/delete helper, reviewed owner-play HTTP adapter, strict schemas와 다섯 Route를 구현한다.
7. HTTP boundary verifier에 위 POST absent/malformed/valid, GET·save·complete, logout별 exact 순서와 import/call contract를 추가한다.
8. owner/cross-owner/tamper/reload/expiry/logout/rate-limit/API shape integration test와 save-vs-complete 두 순서 concurrency test를 추가한다.
9. package scripts와 `scripts/ai-verify`에 새 unit/pgTAP/integration gate를 연결하고 secretless build·기존 Playwright 회귀를 확인한다.

직접 변경·검토할 현재 코드 경계는 `lib/http/request-boundary.ts`, `lib/http/rate-limit.ts`, `scripts/verify-http-boundary.mjs`, `lib/db/internal-rpc.ts`, `scripts/verify-data-access.mjs`, `supabase/migrations/20260718000100_security_data_access.sql`, `supabase/migrations/20260718000200_pack_catalog.sql`, `supabase/tests/data_access.test.sql`, `supabase/tests/http_boundary_atomic_contract.test.sql`, `tests/integration/data-access.test.mjs`, `app/play/[slug]/play.tsx`, `package.json`, `scripts/ai-verify`다. 기존 migration은 수정하지 않고 새 forward migration과 verifier allowlist만 확장한다.

## 완료 기준

- [ ] 이메일·표시 이름·전화번호·Auth user 없이 active `old-friend` play 하나를 만들고 exact 10장 A/B draft와 현재 위치를 저장·복구한다.
- [ ] 첫 create만 201이며 같은 cookie의 재호출·새로고침은 같은 play id와 state를 200으로 반환하고 duplicate play를 만들지 않는다.
- [ ] cookie는 exact `__Host-` 속성과 256-bit secret을 사용하고 DB·RPC response·source log·analytics에는 raw secret이 없다.
- [ ] cookie id+hash가 모두 맞는 같은 browser만 자신의 play를 읽고 저장·완료한다. 다른 owner cookie, path id 변조, missing/malformed/tampered/revoked/expired cookie는 byte-identical 404 body이고 대상 존재를 드러내지 않는다. cross-play path/body 404는 valid cookie를 보존하고 malformed/same-id stale·tampered/expired만 삭제한다.
- [ ] 성공한 owner action은 DB server time 기준 7일 inactivity expiry와 cookie를 갱신하고, 만료 credential은 hash가 제거된 뒤 복구되지 않는다.
- [ ] logout은 DB hash와 browser cookie를 제거하고 반복 호출에도 204다. 이메일·cross-device·자동 복구 경로가 없다.
- [ ] unknown/inactive/unpublished pack의 new branch는 exact `pack_not_found`를 반환해 #15 `PACK_NOT_FOUND`로 매핑하고 bucket·play·cookie를 바꾸지 않는다. production seed의 `old-friend` 비활성 상태는 바뀌지 않는다. 이미 생성된 play는 later inactive/current-version 이동 뒤에도 유효 capability로 관리 state를 읽고 logout할 수 있다.
- [ ] 다른 version card, unknown card, malformed choice/position은 저장되지 않는다. 답 수정은 draft에서 idempotent하고 완료 뒤에는 어떤 self answer insert/update/delete도 실패한다.
- [ ] 9장 이하·중복·다른 version answer로 complete할 수 없고 exact 10장만 완료된다. 완료 retry는 같은 state로 수렴한다.
- [ ] 10장 play의 기존 answer edit와 complete 경쟁은 save-first면 수정값을 포함해 완료하고 complete-first면 edit 409다. 9장 play의 10번째 save와 complete 경쟁은 save-first면 완료 성공, complete-first면 incomplete 후 save 성공이다. 어느 경우에도 완료 commit 뒤 답이 변하지 않는다.
- [ ] public/anon/authenticated/service_role direct table 접근과 public/anon/authenticated RPC 실행이 거절되고 service_role exact RPC만 RLS 안에서 성공한다.
- [ ] owner-state/API allowlist 밖 internal UUID, hash, raw secret, private timestamp, prompt, 다른 owner 데이터가 반환되지 않고 future private column도 누출되지 않는다.
- [ ] read/save/complete/resume의 120회/10분 access limiter는 domain RPC보다 먼저 실행되고 limit 초과·limiter error에서 domain RPC가 0회다. POST는 boundary 뒤 cookie absent/malformed/valid branch를 먼저 결정해 absent만 atomic create, valid만 access limiter+resume을 실행한다. 새 draft는 5회/시간/network를 `create_or_resume_play` 안에서 bucket+insert 원자 처리하고 valid resume과 `pack_not_found`는 create quota를 소비하지 않으며 6번째 차단 뒤 count는 exact 5다.
- [ ] private capability helper와 verifier가 모든 owner RPC의 same-transaction play id+hash 검증을 강제하며 cross-play test가 실패한다. 후속 링크·프로필은 이 helper를 쓰는 것이 #19/#27의 진입 계약이고 실제 resource 구현은 이번 PR에 없다.
- [ ] current development 질문 UI와 `gyeop:old-friend-play:v1` localStorage prototype은 회귀하지 않는다.
- [ ] create response/Set-Cookie 유실 fixture에서는 접근 불가능한 orphan play 하나가 남고 cookie 없는 명시적 retry는 새 quota를 소비해 새 play를 만든다. raw secret 복구는 없으며 #32 retention cleanup 대상으로 추적된다.
- [ ] DB lint, pgTAP, generated type diff, focused unit/integration/concurrency test, secretless build, mobile Playwright와 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `node --test tests/unit/owner-play-session.test.mjs tests/unit/data-access-policy.test.mjs tests/unit/http-boundary-policy.test.mjs`
- `pnpm supabase:reset && pnpm test:db`에서 `private` schema 비노출·role별 USAGE/EXECUTE 부재와 internal exact helper 권한을 포함한 pgTAP을 실행한다.
- `node scripts/verify-supabase-types.mjs`
- `pnpm supabase:lint`
- `node --test tests/integration/data-access.test.mjs tests/integration/owner-play-session.test.mjs tests/integration/owner-play-concurrency.test.mjs`
- atomic create는 valid pack에서 network당 5회/시간까지 play+bucket commit, 6번째 `rate_limited`+positive integer `Retry-After`+play row 0+bucket count exact 5를 확인한다. unknown/inactive/unpublished의 `pack_not_found`는 bucket·play 0 change이고 valid resume도 bucket count를 바꾸지 않는지 검증한다.
- access limiter는 120회/10분 다음 요청 429와 domain RPC 0회를 확인
- 같은 cookie reload, 두 owner cross-swap, path/body id swap cookie 보존, secret 한 글자 tamper, malformed cookie, DB expiry hash 제거, repeated logout의 exact status/body/Set-Cookie/row 확인
- capability outcome 표의 activity/hash/cookie side effect를 RPC/API에서 모두 검증하고 returned DB TTL로 cookie를 갱신한 뒤 DB expiry가 최종 권한임을 확인
- 10장 existing edit-vs-complete와 9장 final-save-vs-complete를 각각 두 lock 순서로 실행하는 concurrency test
- create response/Set-Cookie 유실 뒤 orphan 접근 불가, no-cookie retry의 새 quota·새 play, raw secret 복구 부재 test
- DB future private column fixture와 captured server stdout/stderr/source AST에서 raw cookie secret·hash input의 log/response 누출이 없음을 확인
- `env -u NEXT_PUBLIC_SUPABASE_URL -u SUPABASE_SECRET_KEY pnpm build`
- `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/old-friend-play.spec.ts --project=mobile-chromium`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 이번 이슈는 analytics event를 만들지 않는다. `pack_opened`, `self_answer_saved`, `self_pack_completed`는 사용자 UI가 실제 API를 호출하는 #18에서 추가한다.
- app log에는 raw cookie, raw secret, hash, owner answer, play id+secret 조합, Supabase 원문 오류를 기록하지 않는다.
- 외부 오류에는 request id와 고정 error code만 사용한다. generic 404를 missing/tampered/expired/cross-owner로 세분화하지 않는다.
- rate-limit bucket은 기존 운영 관측 범위를 사용하며 owner secret이나 play id를 rate key로 넣지 않는다.

## 개인정보와 악용 방지

- owner session에는 이메일, 전화번호, 표시 이름, IP, user agent를 저장하지 않는다.
- cookie는 JavaScript에서 읽을 수 없고 cross-site mutation은 Origin boundary와 SameSite=Lax로 차단한다.
- 32-byte random secret의 hash만 저장하며 path UUID만으로 권한을 얻을 수 없다.
- 다른 owner/expired/revoked 상태는 같은 404를 사용한다. response와 로그에 답 선택·secret·hash를 넣지 않는다.
- 신규 create는 network당 시간당 5회를 DB insert와 원자 제한하고, owner read/save/complete/resume은 10분당 120회로 제한해 orphan play 생성과 DB probe를 줄인다. logout revoke는 limiter로 막지 않는다.
- 완료 self answer 불변성과 server-side card membership 검증으로 client가 임의 카드·선택·완료 상태를 주입하지 못한다.

## 롤아웃과 복구

- migration과 seed는 local reset, pgTAP, generated type diff 뒤 staging 빈 DB에 forward 적용한다. migration은 `old-friend.is_active`를 바꾸지 않아 배포만으로 새 공개 흐름이 생기지 않는다.
- 앱 Route는 pack 활성화 전 create 404이므로 backend를 먼저 배포할 수 있다. #18 UI 연결과 별도 사람 승인 activation 뒤 smoke한다.
- 앱 회귀는 Route/wrapper commit을 되돌릴 수 있지만 생성된 play/answer row는 유지한다. schema와 저장 데이터는 down migration으로 삭제하지 않고 forward fix한다.
- secret/hash 계약 변경은 기존 cookie를 조용히 다른 owner에게 연결하지 않는다. 새 cookie version과 명시적 invalidation을 별도 migration/배포로 진행한다.
- 만료·revoked row 물리 삭제는 retention 이슈에서 추가하며, 그 전에도 hash가 제거돼 권한은 복구되지 않는다.

## 스펙 검토

Reviewer Agent: issue17_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- `old-friend`는 현재 production inactive이므로 이번 PR만 배포해 실제 owner play가 생성되지는 않는다. 이는 #15의 안전한 activation gate를 유지하는 의도된 상태다.
- create 응답 또는 `Set-Cookie`가 유실되면 DB에 접근 불가능한 orphan draft가 하나 남고 cookie 없는 retry는 새 quota와 새 row를 사용한다. raw secret을 서버에 보관하거나 복구 채널을 만드는 대신 atomic 5회/시간 limit과 #32 retention 이슈에서 물리 cleanup한다.
- P0 cookie는 owner play 하나에 결합한다. 복수 팩·복수 play 선택은 핵심 재미 검증 뒤 별도 schema/UI 결정이며 이번 API가 임의 다른 play를 자동 채택하지 않는다.
- template inactive는 신규 생성만 막고 기존 capability를 revoke하지 않는다. 운영 kill switch가 필요하면 template flag를 재사용하지 않고 별도 owner-play revoke 정책과 사용자 영향 결정을 추가한다.
- 기존 engineering 문서의 이메일 Auth·account deletion 설계는 이번 active P0 결정과 충돌한다. 이번 PR은 active P0 override를 명시하며, 해당 기능을 다시 Project에 넣을 때 새 privacy/retention 결정과 함께 별도 리뷰해야 한다.
- 구현 전 해결해야 할 외부 블로커는 없다.
