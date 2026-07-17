# Issue 15 구현 스펙: [데이터] 오래된 친구팩 schema·발행 검증·seed 추가

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/15

## 목표

사람이 검수해 동결한 `old-friend-v1`을 빈 local DB에서도 같은 카드 id·순서·문구·선택지로 재현한다. 질문팩 버전은 DB의 단일 발행 함수만 카드 10장·Signature 1장 계약을 검사한 뒤 발행할 수 있게 하고, 발행된 버전과 카드는 불변으로 만든다. 공개 앱은 table을 직접 읽지 않고 published-only allowlist RPC를 사용하며, 비공개 검증팩인 `old-friend`는 별도 활성화 승인 전까지 production에 노출하지 않는다.

## 범위

- `pack_templates`, `pack_versions`, `pack_cards`와 version/template/card 사이 composite key·foreign key·position 제약을 migration으로 추가한다.
- 템플릿의 현재 발행 버전 pointer와 공개 활성 여부를 분리한다. `publish_pack_version`은 유효한 버전을 불변 상태로 만들고 현재 pointer를 설정하지만 `pack_templates.is_active`를 바꾸지 않는다. 따라서 seed의 `old-friend-v1`은 발행 검증을 통과한 재현 가능한 버전이면서 템플릿은 `is_active=false`인 비공개 검증 상태다.
- `publish_pack_version(pack_version_id)` SECURITY DEFINER RPC만 draft version을 발행할 수 있다. 정확히 10장, position 1..10의 연속·유일성, Signature 정확히 1장, template/version composite 일치를 transaction 안에서 검사한다.
- 발행된 `pack_versions`의 내용·삭제와 그 버전에 속한 `pack_cards`의 insert/update/delete를 trigger로 거절한다. 모든 card mutation trigger는 검사 전에 parent `pack_versions` row를 `FOR UPDATE`로 잠가 publish와 같은 lock을 공유하고, UPDATE로 card를 다른 version으로 옮기는 것은 항상 거절한다. 따라서 동시 draft card 변경이 발행 검사 뒤에 늦게 commit하는 경쟁을 만들 수 없다. template의 활성화와 새 version 발행은 기존 버전의 카드 원문을 바꾸지 않는다.
- 세 table 모두 RLS를 켠다. `PUBLIC`, `anon`, `authenticated`, `service_role`은 table·sequence 직접 read/write 권한이 없다. `PUBLIC`·`anon`·`authenticated`는 두 RPC를 실행할 수 없고, `service_role`은 exact signature의 `publish_pack_version`과 `get_published_pack`만 실행한다. 함수 owner인 `gyeop_internal_rpc`는 로그인·inherit·BYPASSRLS 없이 pack table에 필요한 SELECT와 template/version UPDATE만 가지며, exact `TO gyeop_internal_rpc` SELECT/UPDATE RLS policy가 함수 실행 경로를 허용한다. broad `USING(true)` policy를 다른 role과 공유하지 않는다.
- `get_published_pack(slug)` SECURITY DEFINER RPC는 `is_active=true`, current version pointer가 존재하고 `published_at`이 있는 template만 반환한다. 반환 JSON은 slug, title, version, 추천 관계, 민감도와 순서가 고정된 카드의 id·position·주인/방문자 prompt·A/B·Signature만 가진다. status, 내부 UUID, `published_at`, draft, 답변, token 또는 future private column은 반환하지 않는다.
- `lib/db/internal-rpc.ts`에 `getPublishedPack` wrapper와 generated Supabase Database type을 연결한다. wrapper는 RPC 결과의 exact key, 타입, 카드 10장·순서·Signature를 다시 strict decode하고 Supabase 원문 오류를 숨긴다. raw client와 table access는 계속 export하지 않는다.
- `GET /api/packs/[slug]`는 `withPublicRequest(actualRequest, {}, callback)`을 직접 반환하고 network key에 `pack_catalog_read`, 60초 window, 60회 한도를 적용한다. `runRateLimitedDomain`이 허용한 뒤 reviewed published-pack adapter 안에서만 `getPublishedPack`을 호출한다. 초과 시 catalog RPC 0회, 429와 exact `Retry-After`를 반환한다. 없는 slug, inactive template, unpublished version은 같은 redacted 404를 반환한다. public Route가 `internal-rpc`를 직접 또는 임의 helper로 우회하면 HTTP boundary verifier가 실패한다.
- production의 홈과 팩 개봉 server path는 같은 `getPublishedPack` wrapper로 활성 여부와 playable content를 결정한다. 두 path는 `dynamic=force-dynamic`, `revalidate=0`과 no-store server read로 고정해 build 중 secret/DB를 요구하거나 활성 상태를 정적 결과에 굳히지 않는다. inactive/unpublished 또는 runtime DB 오류의 `old-friend`는 fail closed해 기존 production `팩 준비 중`/404를 유지한다. 홈의 disabled preview는 사람 승인 manifest와 presentation registry의 비활성 요약을 표시할 수 있지만, 이 fallback은 active link나 play 질문을 만들 수 없고 DB seed와 exact crosscheck된다. development-only local prototype은 현재 네 팩 fixture와 localStorage 흐름을 유지하되 production published data로 오인되지 않게 명시적으로 분리한다.
- 사람이 검수한 `old-friend-v1` machine manifest를 추가하고 문서의 동결 표, app development fixture, generated seed, DB 조회 결과를 같은 계약으로 교차 검증한다. `supabase/seed.sql`은 manifest에서 결정적으로 생성되는 SQL과 byte-for-byte 일치해야 한다.
- P0 presentation registry는 `old-friend` 하나만 immutable하게 등록한다. `mood_label=따뜻한 회상`, `estimated_minutes=2`, `default_share_kind=public`과 기존 홈 카드의 승인된 CSS-only cover variant를 문서와 1:1 trace한다. 추천 관계·민감도는 template RPC 결과, 질문 수는 카드 배열에서 derive하고 creator/remix/per-card presentation tag는 추가하지 않는다.
- DB code를 사용자 문구로 바꾸는 pack-independent immutable label registry를 둔다. `targetRelationship.old_friend=오래된 친구`, `sensitivity.low=낮은 민감도`를 SSOT와 trace하고 unknown code는 active UI와 inactive preview 모두 fail closed한다. 이 registry는 slug별 presentation metadata가 아니며 관계·민감도 code를 중복 저장하지 않는다.
- CSS-only cover는 별도 생성 이미지가 아니라 현재 검수된 홈 카드 recipe를 id와 exact style 값으로 고정한다. old-friend card는 immutable presentation config에서 만든 inline style을 사용해 일반 cascade가 recipe를 덮지 못하게 하고, target property의 `!important` override는 verifier가 거절한다. seeded/active 가능한 slug에 registry·문서 trace가 없거나 recipe 적용이 사라지면 pack verifier와 build가 실패한다. mobile Chromium은 실제 card의 computed background/color/box-shadow/transform을 검증한다. asset variant를 나중에 쓰면 존재·format·origin/license trace를 모두 요구하며 없는 asset은 실패한다.
- local schema에서 `supabase gen types typescript --local`로 만든 committed type을 재생성 비교하는 gate를 추가한다. migration/함수 signature와 generated type이 어긋나면 full verify가 실패한다.

## 제외 범위

- `old-friend`의 `is_active=true` 전환과 production 공개 베타 승인
- 셀프 답변, `pack_plays`, 공유 링크, 방문자 응답, 프로필 집계
- 사용자 팩 작성·리믹스·creator metadata·팩 탐색
- development-only 다른 세 팩을 DB seed 또는 공개 catalog로 승격
- 실제 이미지 생성 또는 새 cover 디자인
- admin 발행 UI와 원격 staging/production migration 적용

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- development에서는 기존 `/`와 `/play/old-friend` 로컬 프로토타입의 질문·답변·복구 동작이 그대로 유지된다.
- production에서는 `old-friend`가 비공개이므로 사람 승인 manifest의 요약과 `팩 준비 중`만 보이고 `/play/old-friend`는 404다. DB에 발행 버전이 있다는 이유만으로 active link나 질문이 노출되지 않는다.
- 후속 사람 승인으로 template을 활성화하면 홈과 팩 개봉은 static 복사본이 아니라 allowlisted RPC의 같은 10장 계약을 사용하게 된다.

## 디자인 영향

- 새 화면이나 시각 변경은 없다.
- 오래된 친구팩 홈 카드의 기존 CSS-only 표현을 `old-friend-card-v1` recipe로 이름 붙여 동결한다. 배경 `#dfff00`, 전경 `#050505`, shadow `0.35rem 0.35rem 0 #315cff`, rotation `-0.7deg`를 exact token으로 검증한다.
- 사용자 표시 문구는 `오래된 친구`, `질문 10장`, `약 2분`, `따뜻한 회상`, `낮은 민감도`, `공개 공유 추천`이며 각각 DB derive 값 또는 presentation registry 값으로 추적된다.

## API와 데이터 영향

### schema

- `pack_templates`
  - `id uuid primary key default gen_random_uuid()`, `slug text not null unique`, `title text not null`, `target_relationship text not null`, `sensitivity text not null`, `is_active boolean not null default false`, nullable `published_version_id uuid`, `created_at timestamptz not null`, `updated_at timestamptz not null`.
  - slug는 1..64자 bounded lower-kebab regex, title은 trim 결과와 같고 1..80자다. `target_relationship`은 P0 exact allowlist `old_friend`, `sensitivity`는 `low|medium|high` allowlist다.
  - `(id, published_version_id)`는 `(pack_versions.template_id, pack_versions.id)`를 참조해 다른 template version을 current pointer로 연결할 수 없다.
- `pack_versions`
  - `id uuid primary key default gen_random_uuid()`, `template_id uuid not null`, `version text not null`, nullable `published_at`, `created_at timestamptz not null`, unique `(template_id, version)`와 `(template_id, id)`.
  - `template_id`는 template을 cascade 없이 참조한다. `version`은 1..80자 bounded lower-kebab id이며 seed는 `old-friend-v1`을 사용한다.
- `pack_cards`
  - `pack_version_id uuid not null`, `id text not null`, `position smallint not null`, `owner_prompt text not null`, `visitor_prompt text not null`, `option_a text not null`, `option_b text not null`, `is_signature boolean not null default false`, `created_at timestamptz not null`이다.
  - composite primary key `(pack_version_id, id)`, unique `(pack_version_id, position)`, `position` 1..10이고 parent version을 cascade 없이 참조한다. id는 1..64자 bounded lower-kebab이다.
  - prompt는 trim 결과와 같고 1..200자, option은 trim 결과와 같고 1..120자이며 A/B는 서로 달라야 한다. nullable boolean이나 `CHECK`의 SQL NULL 통과에 기대는 field는 없다.

### 발행과 불변성

1. 함수는 target version과 template을 잠그고 version이 draft인지 확인한다.
2. 같은 version의 카드 count, position 1..10, Signature count를 한 query로 검사한다.
3. 실패하면 version, template pointer 모두 바뀌지 않은 채 transaction이 실패한다.
4. 성공하면 `published_at=clock_timestamp()`와 template의 `published_version_id`를 같은 transaction에서 기록한다. `is_active`는 변경하지 않는다.
5. 이후 version update/delete와 card insert/update/delete는 DB trigger가 거절한다. 새 draft version과 그 카드는 별도로 만들 수 있다.
6. card INSERT/UPDATE/DELETE trigger는 parent version row를 `FOR UPDATE`로 잠근 뒤 `published_at`을 검사한다. card의 `pack_version_id` 이동은 금지한다. publish 함수도 같은 parent row lock을 먼저 잡고 잠금 보유 상태에서 카드 구성을 검사·발행한다.
7. 두 독립 DB session의 barrier test를 둔다. mutate-first에서는 publish가 parent lock 뒤에서 대기하고 card commit 후 새 내용을 포함해 발행하며, publish-first에서는 card mutation이 대기한 뒤 published 상태를 읽고 실패한다. 어느 순서에서도 발행 commit 뒤 card 내용이 변하지 않는다.

### RLS와 함수 실행

- `gyeop_internal_rpc` SELECT policy는 세 pack table에 각각 존재하고, UPDATE policy는 `pack_templates`와 `pack_versions`에만 존재한다. INSERT/DELETE policy와 `pack_cards` UPDATE policy는 없다.
- relation grant도 위 policy와 같아야 하며 role은 `pack_templates:SELECT/UPDATE`, `pack_versions:SELECT/UPDATE`, `pack_cards:SELECT` 외 pack privilege를 갖지 않는다.
- pgTAP은 admin session의 direct 함수 호출만으로 성공을 증명하지 않는다. `SET LOCAL ROLE service_role`에서 valid `get_published_pack`/`publish_pack_version`이 RLS를 통과하는지 실행하고, `SET LOCAL ROLE anon`·`authenticated`에서 함수 권한 오류와 table four-verb 거절을 검증한다.

### 공개 RPC와 HTTP

- `get_published_pack(p_slug text) returns jsonb`는 유효한 exact slug 하나만 받고 inactive/unpublished/unknown에는 `null`을 반환한다.
- 성공 JSON shape:

```json
{
  "slug": "old-friend",
  "title": "오래된 친구팩",
  "version": "old-friend-v1",
  "targetRelationship": "old_friend",
  "sensitivity": "low",
  "cards": [
    {
      "id": "conflict",
      "position": 1,
      "ownerPrompt": "서운한 일이 생기면 나는?",
      "visitorPrompt": "서운한 일이 생기면 이 사람은?",
      "optionA": "바로 이야기한다",
      "optionB": "생각을 정리한 뒤 말한다",
      "isSignature": true
    }
  ]
}
```

- cards는 `position` 오름차순이고 정확히 10장이다. wrapper는 extra/missing key, coercion, 중복 id/position, 순서 불일치, Signature 불일치 또는 malformed RPC row를 generic server error로 거절한다.
- `GET /api/packs/[slug]` 성공은 위 JSON만 200으로 반환한다. inactive/unpublished/unknown은 status 404와 정확히 `{ "code": "PACK_NOT_FOUND", "message": "팩을 찾을 수 없습니다." }`만 반환한다. DB 오류와 malformed row는 공통 redacted 500으로 처리한다.
- endpoint는 boundary에서 받은 daily network key로 `pack_catalog_read`를 `windowSeconds=60`, `limit=60`에 정확히 한 번 소비한다. rate-limit RPC 오류/malformed row는 catalog RPC 0회와 redacted 500, limit 초과는 catalog RPC 0회와 429/양의 정수 `Retry-After`, 허용은 그 뒤 catalog RPC 정확히 1회다.
- endpoint의 성공/404/500 모두 #14 boundary의 request ID와 security headers를 가진다. query로 preview/draft/includeInactive 같은 우회 옵션을 받지 않는다.

## 콘텐츠와 presentation 추적

- `content/packs/old-friend-v1.json`을 machine-readable 동결 계약으로 두고 `docs/product/question-pack-spec.md`의 표와 SHA-256 trace를 맞춘다.
- `scripts/render-pack-seed.mjs`는 manifest만 읽어 deterministic transaction SQL을 만들며 committed `supabase/seed.sql`과 diff가 없어야 한다. 임의 SQL row를 seed에 덧붙이거나 카드 문구를 직접 고치면 verifier가 실패한다.
- `scripts/verify-pack-catalog.mjs`는 manifest↔문서 표↔development fixture↔presentation registry↔seed renderer↔CSS recipe를 비교한다. DB reset 뒤 pgTAP은 같은 exact 10개 row와 metadata를 다시 확인한다.
- `lib/packs/presentation.ts`는 frozen null-prototype registry와 frozen nested config를 제공하고 등록되지 않은 slug를 fail closed한다. old-friend config는 mood, minutes, share kind, cover recipe만 소유하고 card의 inline style을 만든다. verifier는 target property의 `!important` override와 recipe 적용 누락 fixture를 거절한다.
- `lib/packs/labels.ts`는 pack-independent frozen null-prototype code→한글 label map을 제공한다. active RPC와 inactive manifest는 같은 decoder를 통과하며 `old_friend`/`low` 외 unknown code를 표시하거나 raw code로 fallback하지 않는다.
- target relationship, sensitivity, question count는 presentation config에 중복 저장하지 않는다.

## production runtime 경계

- `/`와 `/play/[slug]`는 production에서 dynamic/no-store다. `next build`는 `SUPABASE_SECRET_KEY`와 local DB 없이 통과해야 하고 catalog call을 실행하지 않는다.
- runtime에는 server-only `NEXT_PUBLIC_SUPABASE_URL`과 `SUPABASE_SECRET_KEY`가 필요하지만, 조회 오류는 root 전체 500이나 active CTA로 승격하지 않는다. 홈은 disabled approved preview, play route는 404로 fail closed한다.
- production smoke는 한 번 build한 server에서 DB template을 inactive→active→inactive로 바꾸고 각 새 request가 disabled→active link→disabled를 재빌드 없이 반영하는지 확인한다. DB 연결을 실패시킨 별도 runtime smoke에서도 홈은 disabled preview이고 play는 404다.
- active 결과에도 framework fetch cache나 module-level pack result cache를 사용하지 않는다. Supabase client 자체의 process singleton은 허용하되 RPC result는 매 request 새로 조회한다.

## 구현 계획

1. `content/packs/old-friend-v1.json`과 문서 trace를 추가하고, deterministic renderer로 `supabase/seed.sql`을 생성한다.
2. 새 migration에 세 table·composite constraint·RLS·internal role exact privilege, `publish_pack_version`, `get_published_pack`, immutable trigger를 추가한다. 함수는 `gyeop_internal_rpc` owner와 empty search path를 사용하고 모든 relation/function을 schema-qualified 한다.
3. `supabase/tests/pack_catalog.test.sql`에 schema NOT NULL/check/FK, exact seed, null/blank/invalid-id·invalid code, invalid 9/11장·0/2 Signature, cross-template pointer, publish rollback, published card/version immutable, inactive/public filtering, field allowlist와 `SET ROLE service_role` RLS 실행·public role 거절 test를 추가한다. 두 psql session을 조율하는 `tests/integration/pack-publication-concurrency.test.mjs`에 mutate-first/publish-first barrier 경쟁을 추가한다. 기존 `data_access.test.sql`의 exact internal relation/service function allowlist와 policy allowlist를 함께 갱신한다.
4. generated Database type을 추가하고 local DB reset 뒤 재생성 diff gate를 `scripts/ai-verify`에 연결한다.
5. `lib/db/internal-rpc.ts`에 exact-decoded `getPublishedPack`을 추가한다. `scripts/verify-data-access.mjs`의 named export/RPC allowlist를 최소 확장하고 direct table/raw client 금지는 유지한다.
6. `lib/http/published-pack.ts`와 `app/api/packs/[slug]/route.ts`를 추가한다. Route는 `runRateLimitedDomain`의 fixed catalog limit 뒤에만 published adapter를 호출한다. HTTP verifier는 exact adapter 하나만 `internal-rpc` import를 허용하고 Route/다른 reachable helper의 우회, rate limit 생략·순서 역전을 계속 거절한다.
7. production 홈과 `/play/[slug]` server path를 dynamic/no-store로 두고 published wrapper를 통해 활성 pack만 받도록 client/prototype 경계를 분리한다. inactive/DB-error 홈 preview는 approved manifest/presentation 요약만 disabled 상태로 쓰고, development fixture의 질문 내용과 localStorage key는 바꾸지 않는다.
8. `lib/packs/presentation.ts`의 named cover variant를 old-friend card inline style에 연결하고 `lib/packs/labels.ts`의 pack-independent code label을 active/inactive UI가 함께 사용하게 한다. unknown/missing/changed recipe, `!important` override, unknown relationship/sensitivity fixture를 pack verifier unit test로 검증한다.
9. `tests/unit/pack-catalog.test.mjs`, HTTP/data-access policy fixture, API integration/E2E에 published-only shape, inactive 404, no leakage, exact UI metadata와 computed cover style, development 회귀를 추가한다. production runtime smoke는 secret 없는 build, DB error fail-closed와 rebuild 없는 inactive/active 반영을 검증한다.
10. package scripts, formatter/linter 범위, `scripts/ai-verify`와 CI의 기존 full verify path에 catalog, generated type, DB/API/browser gate를 연결한다.

## 완료 기준

- [ ] 빈 local DB reset 뒤 `old-friend`, `old-friend-v1`, 정확한 10개 카드가 manifest/문서와 같은 id·순서·문구·A/B·Signature로 재현되고 template은 `is_active=false`다.
- [ ] UUID/FK·slug/title/relationship/sensitivity/active/version/card position/prompt/option/Signature의 exact NOT NULL과 domain check가 있고, null/blank/invalid lower-kebab id·invalid code, 9장·11장, position gap/duplicate, Signature 0장·2장, 다른 template version pointer는 발행되지 않고 부분 update가 남지 않는다.
- [ ] 발행 성공 뒤 version update/delete와 해당 card insert/update/delete가 실패하며 새 draft version 작업은 가능하다. 두 session barrier test의 mutate-first/publish-first 모두 parent row lock으로 직렬화되고 발행 commit 뒤 card 내용이 달라지지 않는다.
- [ ] `PUBLIC`·`anon`·`authenticated`·`service_role`은 세 table을 직접 읽거나 쓸 수 없고, 앞의 세 role은 publish/read RPC도 실행할 수 없다. service-role function grant와 internal owner relation privilege는 exact allowlist와 일치한다.
- [ ] inactive/unpublished/unknown slug는 SQL RPC와 HTTP에서 같은 not-found 의미이고, active published fixture만 공개 allowlist JSON을 position 순으로 반환한다.
- [ ] 공개 응답에 내부 UUID, status/published timestamp, 답변, draft/token 또는 extra DB field가 없으며 wrapper가 malformed/extra/coerced 결과를 fail closed한다.
- [ ] public Route는 실제 Request를 #14 boundary에 직접 전달하고 `pack_catalog_read` 60회/60초 network rate limit 허용 뒤에만 reviewed published-pack adapter를 호출한다. 429/limiter 오류에는 catalog RPC가 0회이며 adapter 밖에서 internal RPC를 호출할 수 없다.
- [ ] production 홈/팩 개봉은 direct table 없이 published wrapper 결과로 active/playable 여부를 결정하고 inactive `old-friend`는 approved static preview만 준비 중으로 표시하며 play는 404다. static fallback이 active link/질문 payload를 만들지 못하고 development 네 팩 prototype과 `gyeop:old-friend-play:v1` 복구는 회귀하지 않는다.
- [ ] active/inactive UI는 같은 pack-independent label registry로 `old_friend→오래된 친구`, `low→낮은 민감도`를 표시하고 raw/unknown code로 fallback하지 않는다. unknown code는 fail closed하며 production active smoke가 정확한 한글 문구를 검증한다.
- [ ] secret/DB 없는 `next build`가 catalog를 실행하지 않고 통과한다. 같은 production build에서 runtime DB 오류는 disabled/404로 fail closed하며 inactive→active→inactive 변경이 rebuild 없이 다음 request에 반영된다.
- [ ] 오래된 친구팩 카드, metadata, 문서 trace, generated seed, DB row가 교차 검증되고 임의 문구/순서 변경이 build를 실패시킨다.
- [ ] 홈 카드의 추천 관계·질문 10장·예상 시간·분위기·민감도·기본 공유 추천과 `old-friend-card-v1` CSS recipe가 DB derive 값/presentation registry/문서에서 재현된다. mobile Chromium computed background/color/box-shadow/transform이 exact 계약과 일치하고 unknown slug, trace 누락, recipe 적용 누락, `!important` override, 없는 asset fixture는 실패한다.
- [ ] DB lint, pgTAP, generated type diff, focused unit/integration/E2E와 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `node scripts/verify-pack-catalog.mjs`
- `node --test tests/unit/pack-catalog.test.mjs tests/unit/data-access-policy.test.mjs tests/unit/http-boundary-policy.test.mjs`
- `pnpm supabase:reset && pnpm test:db`
- `node scripts/verify-supabase-types.mjs`
- `pnpm supabase:lint`
- `node --test tests/integration/pack-catalog.test.mjs tests/integration/pack-publication-concurrency.test.mjs tests/integration/pack-runtime.test.mjs`
- `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/old-friend-play.spec.ts tests/e2e/pack-catalog.spec.ts --project=mobile-chromium`
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- catalog 조회 자체는 제품 analytics event를 만들지 않는다.
- log에는 raw RPC response, SQL/Supabase 오류, secret, 내부 UUID, inactive slug 목록을 남기지 않는다. 외부에는 request ID와 고정 error code만 사용한다.
- `PACK_NOT_FOUND`는 unknown/inactive/unpublished를 구분하지 않아 비공개 pack 존재 여부를 누출하지 않는다.

## 개인정보와 악용 방지

- pack catalog는 사람이 승인한 공개 가능 콘텐츠만 반환하며 self/visitor answer, draft, token, owner 또는 visitor 식별자를 schema와 반환 allowlist 양쪽에서 포함하지 않는다.
- table direct access와 broad service key client export를 열지 않고 모든 읽기를 named RPC의 고정 projection으로 제한한다.
- inactive 검증팩을 slug 추측으로 preview할 수 없고 include-inactive query나 admin bypass를 public Route에 만들지 않는다.

## 롤아웃과 복구

- migration과 seed는 먼저 local reset, pgTAP, generated type diff를 통과한 뒤 staging 빈 DB rehearsal에서 적용한다. `old-friend`가 inactive이므로 migration만으로 production 노출이 바뀌지 않는다.
- 발행된 version/card는 down migration이나 직접 수정으로 되돌리지 않는다. 콘텐츠 수정은 새 version과 새 forward migration으로 발행하고 template pointer를 이동한다.
- 앱 wrapper/화면 회귀는 app commit을 되돌릴 수 있지만 DB schema·발행된 v1은 유지한다. 권한 문제는 grant를 넓히는 임시 조치 대신 forward-fix migration으로 exact function/privilege만 교정한다.
- template 활성화는 이 PR 범위 밖의 별도 사람 승인 작업이며, 활성화 전 published RPC/API 404 smoke를 필수로 확인한다.

## 스펙 검토

Reviewer Agent: issue15_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- `published_at`과 template `is_active`를 분리하지 않으면 비공개 동결 계약과 발행 불변성 검증을 동시에 만족할 수 없다. 이 스펙은 version 발행/불변과 public 활성화를 별도 상태로 고정한다.
- development-only 네 팩 fixture는 현재 재미 검증을 위한 로컬 UI 자산이다. DB catalog의 공식 P0 seed는 old-friend 하나뿐이며 다른 세 팩을 generated seed나 production published path에 포함하지 않는다.
- Supabase generated type 출력은 CLI 버전에 영향을 받으므로 repository가 pin한 `supabase@2.109.1`만 사용하고 diff가 생기면 schema 변경과 같은 PR에서 검토한다.
- CSS-only recipe는 기존 검수 UI를 식별하고 drift를 막기 위한 계약이다. 새 시각 디자인이나 이미지 생성은 하지 않는다.
- 구현 전 해결해야 할 외부 블로커는 없다.
