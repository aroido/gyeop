# Issue 142 구현 스펙: Google 가입 완료 닉네임과 공유 링크 동적 OG 도입

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/142

## 목표

Google claim 직후 Auth owner가 직접 정한 공개용 닉네임을 필수 프로필로 저장하고, 새 공유 링크에 생성 시점 닉네임을 고정해 서버 렌더링 초대 맥락과 안전한 동적 Open Graph 카드에 사용한다.

## 범위

- [ ] `docs/product/core-feature-priority.md`의 P0 시작·공유·방문자·승인 기준을 필수 공개용 닉네임 결정으로 갱신하고, `docs/product/decision-log.md`에는 crawler-visible 자유 닉네임을 private MVP에서만 허용하는 명시적 예외와 public beta moderation 차단 조건을 기록해 2026-07-15 표시 이름 미사용 결정을 supersede한다.
- [ ] `docs/product/question-pack-spec.md`에 초대 화면의 owner 닉네임, 1:1·민감 팩의 일반 문구, 방문자 무가입·이름 미수집·답변 비노출 경계를 기록한다.
- [ ] `docs/product/data-retention-and-deletion-policy.md`에 닉네임을 로그인 owner 데이터로 포함하고 owner 삭제·1년 inactivity·backup 상한을 동일하게 적용한다.
- [ ] Auth UID에 귀속되는 공개용 닉네임 저장소와 읽기/저장 RPC를 추가한다. Google user metadata의 이름·이메일·사진은 읽어 기본값으로 채우거나 앱 프로필에 복사하지 않는다.
- [ ] Google callback에서 claim 성공 뒤 프로필 완성 여부를 확인하고, 닉네임이 없으면 서명된 claim context의 안전한 `returnTo`보다 가입 완료 화면을 먼저 거치게 한다.
- [ ] 기존 Auth owner도 다음 로그인 또는 `/me`, `/me/plays/:playId`, `/me/profile/:playId` 진입 시 닉네임이 없으면 가입 완료 화면을 한 번 거친다.
- [ ] 새 링크와 회전으로 발급한 새 링크에 현재 owner 닉네임을 `preview_nickname` snapshot으로 저장한다. 기존 링크에는 소급 채우지 않는다.
- [ ] preview 공개 종료 시각은 `coalesce(expires_at, created_at + kind별 기본 보관 기간)`으로 계산한다. 기본 기간은 active retention SSOT와 같은 public 30일, one_to_one 7일이며 null-expiry legacy link도 snapshot을 무기한 공개하지 않는다.
- [ ] `publicId`만 받는 읽기 전용 preview lookup과 서버 adapter를 추가해 활성 링크의 닉네임 snapshot, 링크 종류, 팩 slug/version/title/sensitivity만 내부 allowlist로 읽고 exact manifest의 presentation을 결합한다.
- [ ] `/i/[publicId]` 첫 HTML에 초대 맥락을 서버 렌더링하고 `generateMetadata` 및 1200×630 `ImageResponse`를 닉네임·안전한 팩 맥락·presentation으로 생성한다. OG의 한국어와 허용 닉네임 glyph는 로컬 OFL Noto Sans KR subset WOFF로 렌더한다.
- [ ] 잘못됨·비활성·만료·snapshot 없음·DB/manifest/ImageResponse 오류는 닉네임과 팩 정보를 넣지 않은 고정 GYEOP 일반 metadata·일반 이미지·기존 참여 불가 화면으로 수렴시킨다.
- [ ] `public/og/gyeop-share.png`에 검증된 1200×630 일반 PNG를 독립 asset으로 둔다. metadata fallback은 이 파일을 직접 참조하고 dynamic image route도 preview/font/render 실패 시 `ImageResponse`를 거치지 않고 같은 bytes를 반환한다.
- [ ] 닉네임 가입 완료, callback redirect, snapshot, preview privacy, SSR metadata/이미지, 모바일 접근성을 단위·DB·통합·E2E로 검증한다.

## 제외 범위

- [ ] 고유 username/`@handle`, 닉네임 중복 검사, 공개 사용자 검색, 공개 프로필 URL, 프로필 이미지, 방문자 로그인·방문자 이름 입력은 추가하지 않는다.
- [ ] Google profile metadata 자동 수집·기본값·외부 노출과 nickname 추천은 추가하지 않는다.
- [ ] 가입 완료 뒤 닉네임을 편집하는 별도 설정 화면은 만들지 않는다. 저장 계약은 owner 자신의 후속 변경을 허용하되 이 PR의 UI는 미설정 상태 완료에만 사용한다.
- [ ] 기존 활성 링크의 `preview_nickname`을 현재 프로필에서 소급 채우거나 요청 시점에 join해 보완하지 않는다.
- [ ] 답변·관계·응답 수·집계·내부 ID가 포함된 결과 공유 카드, Instagram Story 9:16 결과 카드, 외부 이미지 생성 서비스·runtime font fetch·유료 인프라는 추가하지 않는다. 이 이슈에서 허용된 로컬 Noto Sans KR subset과 OFL/provenance 파일만 예외다.
- [ ] 공개 프로필, 관계 레이어 공개, 1:1 응답의 프로필 누적, 계정 삭제 UI/worker와 production beta gate는 이 이슈에서 열지 않는다.
- [ ] 기존 secret fragment 형식, 방문자 3장 배정·제출·비교, 링크 보관 기간과 링크 상태 전이는 변경하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md` §2, §5.1, §5.4~5.7, §5.9, §12
- `docs/product/question-pack-spec.md` §1, §2, §4~§9, §11
- `docs/product/decision-log.md`의 2026-07-21 Google OAuth, 2026-07-20 보관·삭제, 2026-07-19 1:1, 2026-07-15 표시 이름 미사용 결정
- `docs/product/data-retention-and-deletion-policy.md` §2~§6, §9~§11
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- [ ] 신규 owner: 익명으로 팩 선택·10장 완료 → `Google로 계속하기` → OAuth callback/claim → 닉네임 가입 완료 → 원래 `/me/plays/:playId` → 새 링크 생성·공유.
- [ ] callback은 10분 signed claim context에서 검증한 `/me` 또는 `/me/plays/:playId`를 가입 완료 query와 저장 성공 뒤 복귀 목적지까지 그대로 보존한다. 브라우저 query나 현재 URL에서 returnTo를 다시 만들지 않는다.
- [ ] `/me` 로그인을 시작한 재방문 owner: Google callback → 닉네임 미설정이면 가입 완료 → `/me`; 설정되어 있으면 기존처럼 곧바로 `/me`.
- [ ] 세션이 남은 기존 owner: private owner 화면 진입 → 미설정이면 가입 완료 → 허용된 목적지. `/me/profile/:playId`에서 걸린 경우 허용 목록을 넓히지 않고 완료 뒤 `/me`로 복귀한다.
- [ ] 공통 `/me` layout의 old-session gate에는 현재 child pathname이 신뢰할 수 있게 전달되지 않으므로 의도적으로 returnTo를 `/me`로 고정한다. callback의 signed play-specific returnTo 보존과 layout의 안전한 hub fallback을 같은 동작으로 섞지 않는다.
- [ ] 가입 완료 화면은 `Google 계정의 이름·이메일·사진은 공개하지 않으며, 입력한 닉네임만 초대 화면과 링크 미리보기에 표시된다`고 설명한다. 빈 기본값으로 시작하며 Google 정보는 input value나 HTML에 넣지 않는다.
- [ ] 유효한 새 초대의 첫 HTML과 hydrated 화면은 `{닉네임}님이 먼저 답한 질문팩이에요`를 동일하게 표시한다. 방문자는 로그인 없이 관계·시점을 고르고 3장을 시작한다.
- [ ] 일반 공개·낮은 민감도 링크는 팩 제목과 presentation을 함께 보여준다. 1:1 또는 medium/high 팩은 닉네임은 보여주되 팩 제목·팩을 식별하는 cover recipe/mark 대신 기존 일반 초대 문구와 중립 GYEOP presentation을 사용한다.
- [ ] 기존 snapshot 없는 링크와 비활성·만료·잘못된 링크에는 owner 현재 닉네임을 보충하지 않는다. 전자는 유효 secret으로 기존 일반 초대 흐름을 유지하고, 후자는 기존 참여 불가 흐름을 유지한다.
- [ ] owner의 실제 답은 방문자가 필수 3장을 모두 제출하기 전까지 HTML, metadata, OG 이미지, preview lookup, API 어디에도 노출하지 않는다.

## 디자인 영향

- [ ] `app/auth/complete-profile/`에 기존 sign-in card 시각 언어를 재사용한 모바일 우선 가입 완료 화면을 추가한다. label이 연결된 단일 닉네임 input, 2~12자 도움말, 공개 범위 설명, submit pending/error를 제공한다.
- [ ] input과 submit은 44px 이상, 명확한 `:focus-visible`, `aria-describedby`, 오류 `role="alert"`, 제출 중 중복 방지를 갖는다. 브라우저 `minLength`/`maxLength`는 힌트이며 서버 검증을 대체하지 않는다.
- [ ] `app/i/[publicId]/page.tsx`와 `invite-entry.tsx`는 서버 preview를 초기 화면에 사용해 JavaScript 실행 전에도 닉네임 초대 맥락이 보이게 하되, fragment secret 검증 전에는 관계 form이나 답변을 서버 HTML에 포함하지 않는다.
- [ ] 일반 공개·낮은 민감도 OG는 1200×630에서 닉네임, `{닉네임}님을 보는 내 시선은?`, `3개만 고르면 실제 답과 바로 비교할 수 있어요`, 안전한 팩 제목과 검수된 presentation 색/recipe를 사용한다.
- [ ] 1:1·민감·fallback OG는 팩 제목/recipe 없이 같은 추천 문구와 중립 GYEOP 표현만 사용한다. 공식 Google Fonts의 Noto Sans KR에서 만든 OFL subset WOFF와 CSS 도형만 사용하고 runtime network fetch는 하지 않는다.
- [ ] subset은 허용 닉네임의 Hangul syllables U+AC00–D7A3, ASCII A–Z/a–z/0–9와 exact OG 문구 glyph를 모두 포함한다. 원본 배포처·upstream version/commit·원본/산출물 SHA-256·subset 명령·포함 Unicode range를 같은 asset 폴더의 provenance 파일에 기록하고 OFL 원문을 함께 보존한다.
- [ ] 320/390/430px, keyboard, reduced motion, axe serious/critical 0, 수평 overflow 없음으로 가입 완료와 초대 첫 화면을 검증한다.

## API와 데이터 영향

- [ ] 새 migration은 `public.owner_public_profiles`를 만든다. `owner_id uuid primary key references auth.users(id) on delete cascade`, `nickname text not null`, `created_at/updated_at timestamptz`만 저장하며 RLS를 켜고 `anon`/`authenticated`/`service_role`의 직접 table 권한을 주지 않는다.
- [ ] `public.share_links.preview_nickname text null`을 추가한다. null은 migration 이전 링크 또는 안전한 fallback을 뜻하며, migration은 기존 row를 update하지 않는다.
- [ ] canonical nickname은 입력을 NFKC 정규화한 뒤 Unicode code point 기준 2~12자이며 exact `^[가-힣A-Za-z0-9]+( [가-힣A-Za-z0-9]+)*$`만 허용한다. 즉 Hangul syllables U+AC00–D7A3, ASCII A–Z/a–z, 0–9와 덩어리 사이 U+0020 한 칸만 허용하고, 자모·다른 문자권·앞뒤/연속 공백·tab/newline/NBSP·control/format·emoji·기호·구두점은 거부한다. 이는 국제화 이름 계약이 아니라 승인된 private-MVP 입력 범위다.
- [ ] 같은 순수 함수가 API/RPC adapter와 단위 테스트의 SSOT가 된다. DB CHECK도 `nickname = normalize(nickname, NFKC)`, `char_length(nickname) between 2 and 12`, 같은 exact PostgreSQL regex를 모두 적용해 app 검증을 우회한 값도 저장하지 않는다.
- [ ] `get_authenticated_owner_public_profile(p_actor_id)`는 인증 actor 자신의 `{outcome: complete, nickname}` 또는 `{outcome: incomplete}`만 반환한다. `set_authenticated_owner_nickname(p_actor_id, p_nickname)`은 정규화된 canonical 값만 insert/update하고 타 owner를 지정할 입력을 받지 않는다.
- [ ] `PATCH /api/me/account-profile`은 exact `{ "nickname": string }`, UTF-8 JSON 최대 128 bytes, same-origin, 인증 필수, private no-store를 사용한다. 성공은 canonical `{nickname}` 200, 잘못된 닉네임은 400 `INVALID_NICKNAME`, 미인증은 기존 401 redacted 계약, 내부 실패는 기존 500 계약으로 반환한다.
- [ ] `completeOwnerAuthentication()`은 PKCE exchange와 선택적 anonymous claim을 완료한 뒤 owner public profile을 읽어 `returnTo`와 `profileComplete`를 반환한다. callback은 확인된 incomplete에만 `/auth/complete-profile?returnTo=<allowlisted value>`로 303하고 complete이면 기존 returnTo로 303한다. profile lookup/RPC 오류는 throw해 기존 5xx 일반 재시도 응답으로 끝내며 incomplete로 간주하거나 가입 완료 화면으로 redirect하지 않는다.
- [ ] 가입 완료 page와 private owner page guard는 기존 `parseOwnerReturnTo()`만 사용한다. 허용 목적지는 exact `/me`와 `/me/plays/<canonical UUIDv4>`뿐이며 absolute URL, protocol-relative URL, query/hash, 중복 query, 다른 `/me/*`는 `/me`로 fail closed한다.
- [ ] link create/rotate RPC는 client가 보낸 nickname을 받지 않고 `pack_plays.owner_id`와 owner profile을 잠근 뒤 현재 canonical nickname을 새 row의 snapshot으로 복사한다. 프로필이 없으면 `profile_incomplete`로 실패하며 link/analytics row를 만들지 않는다.
- [ ] `preview_nickname`은 link public lookup material이다. disable·rotate의 old row·1:1 consume 및 그 밖의 `active → nonactive` 상태 전이는 같은 transaction에서 snapshot을 즉시 null 처리한다. DB trigger/constraint로 모든 상태 전이 경로에 이 불변식을 한 번 적용하고, rotate의 새 active row만 현재 닉네임 snapshot을 갖는다.
- [ ] 각 row의 `preview_due_at`은 저장 column을 추가하지 않고 `coalesce(expires_at, created_at + case kind when 'public' then interval '30 days' else interval '7 days' end)`로 계산한다. preview lookup은 DB 시각이 due에 닿는 즉시 unavailable이고, retention cleanup은 늦어도 `preview_due_at + 24시간`까지 snapshot을 null 처리한다. link row 삭제 또는 parent play 삭제 시 snapshot은 row/cascade와 함께 사라지고, owner public profile은 Auth user 삭제 cascade에 포함된다.
- [ ] 이 이슈 이후 authenticated create는 DB transaction 시각을 기준으로 public `created_at + 30일`, one_to_one `created_at + 7일`의 실제 non-null `expires_at`을 저장한다. rotate는 기존 non-null expiry를 연장하지 않고 그대로 보존하며, legacy null-expiry old row에서 새 row를 만들 때만 새 row의 kind 기본 expiry를 설정한다. 기존 row의 null을 backfill하거나 보관 종료 시각을 변경하지 않는다.
- [ ] 새 `get_invite_preview(p_public_id)` SECURITY DEFINER RPC는 secret 없이 active이며 미만료인 한 row만 읽고 `{previewNickname, kind, packSlug, packVersion, packTitle, sensitivity}` exact allowlist를 반환한다. invalid/inactive/expired/null snapshot은 구별되지 않는 `unavailable`이며 row 상태·last activity를 update하지 않는다.
- [ ] 최종 migration `supabase/migrations/20260719000500_eligibility_cutover.sql`의 계약을 기준으로 한다. 현재 `get_invite_metadata(text, bytea)`는 analytics insert 없이 metadata만 읽고, `invite_opened`는 `private.record_response_invite_open()`이 유효 visitor response INSERT 뒤 기록한다. 기존 함수/trigger의 이 경계를 바꾸지 않고 새 preview RPC도 완전한 read-only로 둔다.
- [ ] server-only preview adapter는 exact slug/version의 `content/packs/*-vN.json` presentation을 조회한다. manifest가 없거나 DB title/sensitivity와 불일치하면 rich preview를 만들지 않고 일반 fallback을 사용한다. runtime의 slug별 최신 pack 선택 계약은 바꾸지 않는다.
- [ ] preview lookup과 HTML metadata에는 invite fragment/secret/hash, link/play/owner/Auth UID, Google 정보, owner/visitor 답, 관계·시점, 응답 수, analytics subject를 포함하지 않는다. 기존 secret 검증 metadata/response API 계약은 그대로 둔다.
- [ ] `generateMetadata`의 canonical/OG URL과 `og:image` URL은 검증된 `APP_URL` + `/i/<publicId>`만 사용하고 fragment를 포함하지 않는다. Twitter는 `summary_large_image`, OG image는 exact 1200×630과 image content type을 선언한다.
- [ ] rich와 fallback metadata lookup 모두 `dynamic = "force-dynamic"`, `revalidate = 0` 및 server `no-store`를 사용한다. invite HTML과 dynamic image route 응답은 `Cache-Control`에 `no-store`를 포함하고, 앱/CDN 재사용이나 stale-while-revalidate를 허용하지 않는다.
- [ ] generic fallback metadata는 title `겹 · 친구가 먼저 답한 질문팩`, description `3개만 고르면 실제 답과 바로 비교할 수 있어요.`, Twitter `summary_large_image`, 현재 fragment 없는 canonical invite URL과 absolute `/og/gyeop-share.png`로 고정한다. 정적 PNG는 HTTP 200 `image/png`, 1200×630, `겹`·`친구가 먼저 답한 질문팩이에요`·동일 description만 담고 nickname/pack/status를 포함하지 않는다. invalid/unavailable/null snapshot/DB·manifest 오류는 metadata에서 이 asset을 직접 참조한다.
- [ ] `opengraph-image.tsx`의 preview/font/`ImageResponse` 생성·render가 실패하면 검증된 `public/og/gyeop-share.png` bytes를 읽어 plain `Response` 200 `image/png`로 반환한다. 이 실패 경로는 local font와 `ImageResponse`에 의존하지 않으며 dynamic route 응답의 `Cache-Control: no-store`는 유지한다. 정적 asset 직접 요청만 비개인 일반 자산으로서 Next public asset cache 정책을 따를 수 있다.

## 구현 계획

- [ ] 제품 문서 네 곳에서 표시 이름 미사용 결정을 supersede하고 닉네임의 private-MVP 공개 예외·exact validation·보관·1:1/민감 fallback·public beta moderation 차단을 기록한다.
- [ ] `supabase/migrations/<timestamp>_owner_nickname_invite_preview.sql`, `supabase/tests/anonymous_owner_claim.test.sql`, `share_links.test.sql`, `retention_cleanup.test.sql`, `data_access.test.sql`에 profile table/RPC, app과 동일한 NFKC/길이/regex CHECK, kind 기본 non-null expiry create, legacy null-expiry due 계산, snapshot create·rotate·consume/disable/expiry cleanup, read-only preview, cascade·권한 계약을 추가한다.
- [ ] `lib/auth/owner-public-profile-core.mjs`에 canonical nickname 정규화/검증과 strict RPC decoder를 한 번만 구현하고 `tests/unit/owner-public-profile.test.mjs`에서 경계값·Unicode·공백·제어문자·동형 normalization을 고정한다.
- [ ] `lib/db/database.types.ts`, `lib/db/internal-rpc.ts`, `lib/http/auth-owner.ts`, 새 `lib/http/owner-public-profile.ts`, `lib/http/auth-schemas.ts`에 최소 server adapter와 HTTP mapping을 추가한다. Google user metadata를 읽는 별도 helper는 만들지 않는다.
- [ ] `app/api/me/account-profile/route.ts`와 `app/auth/complete-profile/{page.tsx,complete-profile-form.tsx,complete-profile.module.css}`를 추가한다. 저장 성공 시 server가 검증해 prop으로 내린 safe returnTo만 `router.replace`한다.
- [ ] `app/auth/callback/route.ts`에는 claim 직후 completeness 분기를 연결하고, private owner 화면은 새 `app/me/layout.tsx`와 하나의 server-only helper에서만 completeness를 확인한다. layout은 signed-out을 기존 child 화면에 맡기고 confirmed incomplete만 layout 밖 `/auth/complete-profile?returnTo=%2Fme`로 redirect하며 lookup 오류는 가장 가까운 일반 error/retry 경계로 throw한다. 세 page에 gate를 복제하지 않고 anonymous `/play/*`와 visitor route에는 gate를 넣지 않는다.
- [ ] share create/rotate 결과 decoder에 `profile_incomplete`를 추가하고 HTTP는 409 `OWNER_PROFILE_INCOMPLETE`로 매핑해 UI 우회/API 직접 호출도 fail closed한다. 정상 UI는 page guard 때문에 이 응답에 도달하지 않는다.
- [ ] `lib/packs/catalog.ts`에 현재 최신 선택을 바꾸지 않는 exact `(slug, version)` presentation resolver를 추가하고, `lib/share-links/invite-preview.ts`가 DB preview와 manifest를 결합·sanitize·fallback한다.
- [ ] `app/i/[publicId]/page.tsx`에 `generateMetadata`와 server preview load를 추가하고, `invite-entry.tsx`/CSS가 같은 sanitized preview를 초기·hydrated 초대 문구에 사용한다.
- [ ] `app/i/[publicId]/assets/`에 `NotoSansKR-InviteSubset.woff`, `OFL.txt`, `README.md`를 두고 README에 provenance/hash/subset range와 재생성 명령을 기록한다. `opengraph-image.tsx`는 번들된 WOFF ArrayBuffer를 한 번 읽어 `ImageResponse`의 `fonts` option에 전달하고 runtime network 요청 없이 rich PNG를 생성한다.
- [ ] `public/og/gyeop-share.png`를 font/preview와 독립적인 일반 fallback으로 추가한다. `generateMetadata` fallback은 이 경로를 사용하고 image route catch는 파일 bytes를 plain PNG Response로 반환한다. 테스트에 기대 SHA-256과 1200×630 IHDR을 고정해 asset 변경을 명시적 검토 대상으로 만든다.
- [ ] 별도 runtime/dev dependency나 자체 cmap parser는 추가하지 않는다. provenance의 deterministic subset command에 U+AC00-D7A3/U+0041-005A/U+0061-007A/U+0030-0039/exact copy 범위를 명시하고, WOFF SHA-256 고정과 `가힣AZaz09` 실제 PNG boundary visual check로 이번 private-MVP coverage를 검증한다. 허용 범위를 넓힐 때는 cmap 자동 검사를 별도 검토한다.
- [ ] `lib/share-links/share-link-state-core.mjs`, `scripts/verify-share-links.mjs`, `scripts/verify-private-one-to-one.mjs`와 관련 fixture를 새 owner nickname 허용·visitor nickname 금지·secret 비노출 계약에 맞게 갱신한다.

## 완료 기준

- [ ] 최초 Google claim 성공 후 닉네임 미설정 owner는 `/me` 또는 공유 관리보다 가입 완료 화면을 먼저 보고, valid nickname 저장 뒤 원래 allowlisted returnTo로 복귀한다.
- [ ] 이미 닉네임이 있는 owner는 callback/owner screen에서 가입 완료 화면을 반복하지 않는다. 기존 owner는 다음 로그인 또는 private owner 화면 진입 중 먼저 발생한 시점에 한 번 완료한다.
- [ ] Google 이름·이메일·사진은 input 기본값, HTML, API, DB profile, analytics, log, invite/OG에 나타나지 않는다.
- [ ] NFKC 뒤 exact Hangul syllable/ASCII letter/digit/U+0020 separator 닉네임 2~12 code point만 저장된다. 자모·다른 문자권·앞뒤/연속/비ASCII 공백, control/format, emoji/기호/구두점, 1자·13자는 app 400과 DB CHECK 양쪽에서 거부된다.
- [ ] authenticated link create/rotate는 닉네임 없는 owner에게 실패하고, 성공한 새 row에는 생성 transaction에서 읽은 canonical `preview_nickname`이 존재한다.
- [ ] owner nickname을 바꿔도 active 기존 link preview/방문 화면은 생성 시 snapshot을 유지하고, new link만 변경된 nickname을 사용한다. rotate는 old snapshot을 즉시 지우고 새 row에 변경된 nickname을 저장하며 migration 전 link는 일반 문구로 남는다.
- [ ] 이 이슈 뒤 만든 public/one_to_one link의 `expires_at`은 각각 생성 DB 시각+30일/+7일로 non-null이다. legacy null-expiry link는 `created_at` 기준 같은 기본 기간이 지난 즉시 generic preview이고 due+24시간 안에 snapshot이 지워지며 원래 row의 expiry는 backfill되지 않는다.
- [ ] 유효한 일반 공개·낮은 민감도 URL의 server HTML에 snapshot nickname과 pack context의 `og:title`, `og:description`, absolute `og:image`, Twitter large image metadata가 있고 이미지 응답은 1200×630이다.
- [ ] 같은 URL의 SSR 초대 문구와 OG nickname은 동일하다. hydrated secret 검증 뒤에도 현재 owner profile이 아니라 snapshot을 표시한다.
- [ ] 1:1 또는 medium/high 팩은 nickname만 표시하고 HTML/meta/image에서 팩 제목과 식별 가능한 pack presentation을 사용하지 않는다.
- [ ] invalid/inactive/expired/null-snapshot/manifest-mismatch/lookup-error URL은 동일한 일반 metadata·image로 수렴하며 private 정보나 상태 차이를 드러내지 않는다.
- [ ] rich invite HTML과 dynamic PNG route는 앱/CDN no-store이다. fallback metadata는 absolute static PNG를 참조하고, dynamic route catch가 반환한 동일 bytes는 HTTP 200 PNG·1200×630·기대 SHA-256을 만족한다.
- [ ] crawler GET은 fragment 없이 preview를 읽을 수 있지만 `invite_opened`·owner activity·link 상태 mutation을 만들지 않는다. 최종 eligibility migration의 기존 response INSERT trigger만 `invite_opened`를 기록한다.
- [ ] disable·rotate old row·consume에서 snapshot은 commit과 동시에 null이고, 만료 active row는 즉시 lookup 불가이며 계산된 `preview_due_at + 24시간` 안에 null이다. play/link/Auth user 삭제 cascade 뒤 관련 snapshot/profile row가 없다.
- [ ] preview/metadata/image 어디에도 secret/hash, 내부 ID, Google 정보, 답변, 관계, 응답 수가 없고 방문자 필수 3장 전 owner 답 비노출 및 1:1 접근 경계가 유지된다.
- [ ] 320/390/430px 가입 완료·초대 화면에서 수평 overflow가 없고 keyboard/focus/label/오류/44px/axe 기준을 만족한다.

## 테스트 계획

- [ ] `node --test tests/unit/owner-public-profile.test.mjs tests/unit/owner-claim-context.test.mjs tests/unit/share-links.test.mjs`
- [ ] `pnpm test:db`에서 profile RLS/RPC, app과 동일한 DB NFKC/char_length/regex 거부, missing-profile link refusal, public/one_to_one create의 exact non-null 30일/7일 expiry, legacy null-expiry preview due와 due+24h cleanup, null-expiry rotate의 새 default expiry, non-null rotate의 비연장, active snapshot, disable/rotate/consume 즉시 clear, no-backfill, preview active/unavailable, play/link/Auth user cascade를 검증한다.
- [ ] owner auth integration/live E2E에서 신규 claim → nickname → exact returnTo, 기존 profile skip, 기존 미설정 account의 `/me` gate, 외부 returnTo fail-closed, Google metadata 비사용을 검증한다.
- [ ] share/invite E2E에서 JavaScript 비실행 HTML meta, hydrated 문구 일치, public low rich preview, 1:1/medium/high redaction, invalid/inactive/expired/null snapshot fallback, exact no-store cache header를 검증한다.
- [ ] 실제 rich image와 font/render failure를 강제한 fallback endpoint PNG를 artifact로 저장하고 PNG signature/IHDR을 읽어 각각 1200×630을 자동 확인한다. fallback bytes는 `public/og/gyeop-share.png`의 기대 SHA-256과 같아야 한다. `가힣AZaz09`와 exact Korean OG copy가 포함된 rich PNG를 실제 렌더해 QA에서 tofu·깨진 조합·잘림·대비를 육안 판정하고 artifact path/SHA-256을 `docs/temp/qa/issue-142.md`에 기록한다.
- [ ] preview lookup 전후 analytics/link/profile row를 비교해 `invite_opened`, activity timestamp, 상태 mutation이 0건임을 검증하고 실제 visitor response INSERT 뒤 최종 migration의 trigger로 기존 이벤트 1건만 생기는지 확인한다.
- [ ] `pnpm exec playwright test tests/e2e/share-links.spec.ts tests/e2e/private-one-to-one.spec.ts tests/e2e/security-headers.spec.ts --project=mobile-chromium`
- [ ] `./scripts/run-ai-verify --mode full`은 구현·독립 QA 수정이 끝난 exact clean HEAD에서 `scripts/task-harness pr`이 한 번 소유한다.

## 분석과 관측성

- [ ] 새 preview 조회 이벤트를 만들지 않는다. SNS crawler, unfurler, missing fragment, 이미지 fetch는 `invite_opened`나 퍼널 진입으로 세지 않는다.
- [ ] 기존 `invite_opened`는 `20260719000500_eligibility_cutover.sql`의 `private.record_response_invite_open()` visitor response INSERT trigger, share handoff/copy와 profile reshare 이벤트는 기존 명시적 mutation에서만 기록한다.
- [ ] nickname, publicId, secret/hash, Auth UID, Google metadata를 analytics property나 application log에 넣지 않는다. 오류는 `profile_incomplete`, `preview_unavailable`, `preview_render_failed` 같은 allowlisted code와 건수만 관측한다.
- [ ] 일반 fallback 비율은 식별자 없는 aggregate로만 볼 수 있으며 이 이슈의 private MVP 완료 조건에는 대시보드 추가를 요구하지 않는다.

## 개인정보와 악용 방지

- [ ] 닉네임은 공개될 것을 owner에게 저장 전에 명시하고 owner 자신만 저장/변경한다. Google 제공 이름을 동의 없는 공개값으로 전환하지 않는다.
- [ ] NFKC와 Hangul syllable/ASCII/digit/single-space 제한은 private MVP의 invisible/control spoof와 OG layout 깨짐을 줄인다. 국제화 이름 지원, 고유성, 실명 인증, 금칙어 자동 검열을 의미하지 않는다.
- [ ] `publicId`는 의도적으로 crawler-readable preview capability다. 반환 필드를 nickname snapshot과 안전한 pack presentation으로 고정하고 secret·답변·관계·집계·내부 ID는 계속 fragment/owner/visitor capability 뒤에 둔다.
- [ ] 1:1 publicId도 nickname은 공개될 수 있다는 이슈 결정을 따르되, 팩 제목과 구분 가능한 presentation을 숨기고 답변·관계·수신자 정보를 절대 넣지 않는다.
- [ ] medium/high 팩은 link kind와 무관하게 일반 초대 문구/중립 presentation을 사용한다. 민감 결과는 기존 명시적 공개 선택 없이는 공유하지 않는다.
- [ ] template creator와 anon/authenticated DB role은 owner profile·link snapshot·response에 직접 접근하지 못하고 service-role adapter도 exact decoder 밖 필드를 거부한다.
- [ ] 사용자가 명시적으로 승인한 private-MVP 예외로 자유 닉네임은 publicId만 가진 crawler에도 보인다. decision log에 이 공개 범위를 기록하고, moderation·신고/차단 정책 승인 전에는 public beta를 열지 않는다.
- [ ] SNS 사업자의 외부 cache는 disable/expiry 뒤 즉시 삭제를 보장할 수 없다. 앱은 상태 전이 즉시 snapshot을 지우고 no-store를 보내지만 외부 사본 회수를 약속하지 않으므로 nickname과 안전한 제목 외 변하는 개인정보를 카드에 넣지 않는다.

## 롤아웃과 복구

- [ ] additive nullable migration을 앱보다 먼저 적용한다. migration 전 링크는 `preview_nickname is null`이므로 새 앱에서도 일반 fallback이고, migration 중 기존 방문자/secret 흐름은 유지된다.
- [ ] private MVP 범위라 feature flag를 추가하지 않는다. 배포 smoke에서 신규 claim 1건, 새 public/1:1 링크 각 1건, crawler HTML/image, invalid fallback, analytics 무변경을 확인한 뒤 모집을 계속한다.
- [ ] metadata/page/image lookup은 force-dynamic/revalidate 0/server no-store와 dynamic 응답 `Cache-Control: no-store`로 앱·CDN의 stale rich preview를 만들지 않는다. dynamic generic fallback은 동일 no-store·HTTP 200 PNG·1200×630 계약을 지키고, 직접 참조되는 비개인 static PNG만 public asset cache 정책을 따른다. 외부 SNS cache는 통제할 수 없으므로 cache purge를 복구 수단으로 약속하지 않는다.
- [ ] 앱 rollback 시 새 table/nullable column과 snapshot row는 보존하고 이전 앱이 무시하게 한다. DB migration을 즉시 down하지 않으며 기존 secret 기반 invite RPC shape는 유지하므로 방문자 흐름을 복구할 수 있다.
- [ ] rich preview 회귀 시 server adapter를 일반 fallback으로 고정해 nickname/pack 노출을 즉시 닫는다. 가입 완료 회귀 시 owner 데이터와 snapshot을 삭제하지 않고 callback/page gate만 이전 로그인 복귀로 되돌린다.
- [ ] preview가 private 정보를 노출하거나 1:1/민감 제목을 노출하면 신규 link create와 private MVP 모집을 중단하고 fallback-only 배포, 영향 publicId 범위 확인, 필요 시 해당 link disable 순서로 복구한다.

## 스펙 검토

Reviewer Agent: /root/issue142_spec_critic
Review Status: PASS
P0/P1 Findings: 0

독립 critic이 SSOT·코드 경계와 nickname/font/snapshot 계약을 검토해 구현 범위를 승인했다.

## 리스크와 미결정 사항

- [ ] 확정된 Hangul syllable/ASCII 범위는 국제화 이름을 지원하지 않는다. private MVP에는 승인됐지만 다른 문자권 지원은 별도 제품 결정·font coverage·validation migration 없이 넓히지 않는다.
- [ ] 닉네임은 crawler-visible 자유 입력 공개 개인정보이며 사칭·혐오 표현 신고/차단 정책이 아직 없다. private MVP 예외는 승인됐지만 public beta는 별도 moderation 결정과 운영 경로 없이는 열지 않는다.
- [ ] 외부 SNS cache는 링크 disable/expiry를 즉시 반영하지 않을 수 있다. 카드에 snapshot nickname과 안전한 팩 맥락만 넣어 영향 범위를 제한하지만 즉시 회수 보장은 할 수 없다.
- [ ] 로컬 font subset은 허용 범위와 exact copy가 바뀔 때 함께 재생성·license/provenance 갱신이 필요하다. 누락은 rendered PNG visual QA가 release를 차단한다.
- [ ] 그 외 returnTo, 기존 link no-backfill, 1:1/민감 fallback, visitor 무가입·답변 비노출은 이슈와 활성 SSOT로 결정되어 있다.
