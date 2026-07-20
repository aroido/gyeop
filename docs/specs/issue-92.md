# Issue 92 구현 스펙: 익명 소유자 다중 팩과 공유 전 계정 연결

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/92

## 목표

가입 없이 시작한 여러 질문팩을 하나의 익명 소유자 아래 보존하고, 셀프 10장 완료 뒤 공유하려는 시점에 이메일 매직 링크로 소유자를 계정에 원자적으로 연결해 같은 데이터와 공유 기능을 다른 브라우저에서도 복구한다.

## 범위

- `anonymous_owners`를 익명 capability SSOT로 추가하고 기존 `pack_plays`를 동일 ID·답변·링크를 유지한 채 backfill한다.
- 기존 `__Host-gyeop-owner` capability cookie의 wire format과 hash를 호환 유지하되 UUID의 의미를 play가 아닌 anonymous owner로 전환한다.
- 같은 익명 owner가 공식 팩별 play를 하나씩 생성·재개하고 다른 팩 진입 때문에 기존 play가 폐기되거나 고립되지 않게 한다.
- 셀프 10장 완료 전에는 공유 링크를 만들 수 없고, 완료 뒤 `내 질문팩 저장하고 공유하기`에서 Supabase Auth 이메일 매직 링크 로그인을 시작한다.
- callback에서 PKCE code를 교환한 직후 fresh `auth.getUser()`와 익명 owner capability를 함께 검증하고 단일 RPC transaction으로 claim한다.
- claim 뒤 owner 공유·프로필 API는 fresh Auth actor를 검증하며, 다른 브라우저의 같은 계정에서도 연결된 play 목록과 상세 화면을 연다.
- 공개/1:1 링크 방문자 흐름은 로그인 없이 그대로 유지한다.
- active SSOT, 데이터 보관 정책, 구현 문서와 개인정보 문구를 실제 동작에 맞춘다.
- schema/RPC pgTAP, server 단위·통합 테스트, 모바일 Chromium E2E와 기존 방문자 회귀 테스트를 추가한다.

## 제외 범위

- 카카오·구글 등 복수 OAuth 제공자와 비밀번호 로그인
- 이메일 알림, 웹 푸시, 방문자 재촉
- 계정 설정·계정 삭제 worker와 미귀속 Auth 자동 cleanup 전체
- 서로 다른 anonymous owner의 자동 병합, 같은 팩 중복 해소 UI
- 질문팩 제작·검색·결제·공개 사용자 프로필
- 기존 익명 데이터를 cookie 없이 운영자나 이메일만으로 복구하는 기능
- production SMTP/provider 자격증명과 public beta 출시 승인

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/product/data-retention-and-deletion-policy.md`
- `docs/engineering/p0-development-plan.md`
- `docs/design/p0-mobile-ui-spec.md`
- `AGENTS.md`

충돌 시 이번 이슈에서 `core-feature-priority.md`와 `decision-log.md`에 기록하는 2026-07-20 결정을 우선한다. 과거의 play-bound 무이메일 결정은 이 수직 슬라이스로 대체하되 방문자 무가입 불변식은 유지한다.

## 사용자 흐름 영향

1. 새 브라우저에서 공식 팩을 고르면 서버가 anonymous owner와 첫 play를 만들고 owner capability cookie를 발급한다.
2. 답변 중 홈으로 나가 다른 공식 팩을 선택해도 같은 owner 아래 해당 팩 play를 만들거나 재개하며, 이전 팩의 답변은 남는다.
3. 완료되지 않은 play는 기존처럼 저장·재개하되 공유 링크 생성 UI와 API를 열지 않는다.
4. 10장 완료 화면의 주 CTA를 `내 질문팩 저장하고 공유하기`로 바꾼다. 누르면 현재 URL을 안전한 same-origin return target으로 가진 `/auth/sign-in`으로 이동한다.
5. 이메일을 입력하면 앱의 전송 제한을 통과한 뒤 Supabase Auth가 매직 링크를 보낸다. 같은 브라우저에서 링크를 열어 callback이 성공하면 anonymous owner의 모든 play가 해당 Auth UID에 연결되고 원래 완료 화면으로 돌아간다.
6. 완료 화면에서 공개 또는 1:1 링크를 생성한다. 로그인하지 않았거나 claim되지 않은 요청은 일반화된 `auth_required` 응답만 받고 row를 만들지 않는다.
7. `/me`는 인증 계정에 연결된 owner가 가진 공식 팩 play 목록을 보여주고, `/me/plays/[playId]`는 선택한 play의 프로필·공유 관리 화면을 연다.
8. 다른 브라우저에서 `/auth/sign-in?returnTo=/me`로 같은 계정에 로그인하면 claim된 play 목록을 복구한다.
9. 방문자는 기존 공유 URL에서 회원가입 없이 관계·시점을 고르고 3장 응답·비교·같은 팩 새 owner 시작을 완료한다.

## 디자인 영향

- 완료 화면의 기존 직접 공유 진입을 계정 연결 CTA 하나로 정리한다. 로그인된 owner에게만 기존 공유 관리 UI를 보여준다.
- `/auth/sign-in`은 모바일 단일 카드로 `이메일`, `로그인 링크 보내기`, 발송 완료·재시도 상태만 제공한다. 이메일이 공개 프로필이나 친구에게 보이지 않는다는 짧은 설명을 둔다.
- callback 실패는 기존 play 삭제나 새 pack 생성을 유도하지 않는다. `로그인 다시 시도`와 `내 질문으로 돌아가기`만 제공한다.
- `/me`는 계정에 연결된 play를 최신 활동순 카드 목록으로 보여준다. 팩 제목, 진행 상태, `n/10`, 최근 활동 시각만 노출하고 이메일·owner ID를 표시하지 않는다.
- 좁은 모바일 폭, 44px 이상 입력/버튼, 키보드 focus와 오류 연결을 기존 토큰·컴포넌트로 구현한다. 새 디자인 시스템이나 모달 프레임워크는 만들지 않는다.

## API와 데이터 영향

### 데이터 모델과 migration

- 다음 migration 하나에 capability만 소유하는 `public.anonymous_owners`를 추가한다.
  - `id uuid primary key`
  - anonymous capability의 `management_secret_hash`, `management_expires_at`, `last_active_at`, `management_revoked_at`
  - `created_at`, `updated_at`과 lifecycle 제약
- `pack_plays.anonymous_owner_id uuid not null references anonymous_owners(id)`를 익명 묶음으로 추가한다. 공식 pack version 하나당 익명 owner의 play 하나를 `(anonymous_owner_id, pack_version_id)` unique 제약으로 보장한다. template-level 중복 정리는 새 version 발행 정책과 함께 후속 결정한다.
- `pack_plays.owner_id uuid null references auth.users(id) on delete restrict`를 기존 engineering 계약의 adopted-owner anchor로 추가한다. claim은 anonymous owner에 속한 모든 play의 이 컬럼을 같은 Auth UID로 채운다. 한 UID가 여러 anonymous owner의 play를 가질 수 있고 `/me`가 이를 합쳐 조회하며 anonymous owner row를 자동 병합하지 않는다.
- 기존 row마다 `anonymous_owners.id = pack_plays.id`인 owner를 만들고 기존 capability hash·만료·활동 시각을 복사한 뒤 `pack_plays.anonymous_owner_id`를 같은 UUID로 채운다. `pack_plays.owner_id`는 기존 비가입 데이터에서는 null이다. 따라서 기존 cookie와 play/answer/link ID는 바뀌지 않는다.
- 기존 `pack_plays` capability column은 migration 직후 접근 경로에서 사용하지 않고 null/revoked 처리해 이중 권한을 막되, 데이터 없는 후속 cleanup migration 전까지 deprecated column으로 남긴다.
- `anonymous_owners`와 `pack_plays.anonymous_owner_id`는 backfill 검증 뒤 `not null`로 고정한다. `pack_plays.owner_id`는 claim 전 null을 허용한다. app table의 RLS, default privilege 회수, `SECURITY DEFINER search_path = ''` 규칙을 유지한다.

### capability와 claim

- cookie 이름, `v1.<uuid>.<secret>` 형식, 256-bit secret, `Secure`·`HttpOnly`·`SameSite=Lax`, 기존 domain-separated hash는 호환을 위해 유지한다. TypeScript 의미만 `playId`에서 `ownerId`로 바꾸며 raw secret/hash를 log·DB 추가 column·analytics에 복제하지 않는다.
- 기존 이름의 `private.authorize_owner_play_capability(play_id, hash, touch)`가 `play → anonymous_owner`를 따라 capability 생명주기와 소속을 transaction 안에서 확인한다. 기존 public capability RPC와 정적 verifier 계약은 유지한다.
- `public.claim_anonymous_owner(anonymous_owner_id, capability_hash, actor_id, recovery_actor_candidates)`는 owner와 대상 play를 잠근다. live capability가 맞고 완료 play가 하나 이상 있으며 모든 `pack_plays.owner_id`가 null이면 actor UID를 adopted-owner anchor에 채운다. 모두 같은 UID면 idempotent 성공, 다른 UID·stale capability·만료·동시 loser는 데이터 존재를 숨긴 동일 계열 실패다.
- claim Route는 기존 `withOwnerMutationActor`를 통해 callback 직전 fresh `auth.getUser()` 1회, retained recovery candidate와 30초 deadline을 만들고 internal wrapper에 전달한다. browser body/query에서 UID·candidate를 받지 않는다. account-deletion schema는 아직 inactive이므로 `private.assert_owner_mutation_actor`를 가짜로 만들지 않으며, 이를 활성화하는 이슈는 현재 `pack_plays.owner_id` anchor를 그대로 사용한다.

### route와 응답

- `POST /api/plays`: cookie가 없으면 owner+play를 생성하고, 있으면 같은 owner의 요청 팩 play를 재개하거나 새로 만든다. 현재 팩과 다르다는 이유로 오류나 기존 play 교체를 만들지 않는다.
- 기존 `/api/plays/[playId]/**` 저장·완료 route는 cookie의 owner secret hash와 path play ID를 함께 넘겨 owner-play 소속을 다시 검증한다. cookie UUID 자체는 create/resume에서 anonymous owner selector로만 쓴다.
- `GET /api/me/plays`: fresh Auth actor에 연결된 모든 owner의 play 요약을 최신 활동순으로 반환한다. private `no-store`와 일반화된 401/404를 사용한다.
- `POST /api/plays/[playId]/links`, link list/rotate/disable, owner profile/1:1 comparison은 기존 capability 검증에 더해 대상 `pack_plays.owner_id is not null`을 DB에서 요구한다. 따라서 가입 전 secret만으로 공유 row를 만들 수 없다. callback 성공 뒤 같은 브라우저의 capability cookie는 7일 inactivity 범위에서 유지해 기존 공유 관리 코드를 재사용한다.
- `/auth/sign-in`은 allowlisted `returnTo`, completed `playId`, anonymous owner ID를 nonce가 있는 10분 `HttpOnly; Secure; SameSite=Lax` claim-context cookie에 보존한다. owner capability 원문·email은 넣지 않는다. OTP 호출 전 `magic_link_send`를 network+owner context 기준 5회/시간으로 제한하고 provider cooldown도 그대로 적용한다.
- private local MVP에서는 Supabase local SMTP/Inbucket으로 확인한다. CAPTCHA가 구성된 환경에서는 `signInWithOtp`에 검증 token을 전달하며, CAPTCHA와 production custom SMTP가 없는 환경은 public signup/public beta로 승격하지 않는다. 이번 로컬 수직 슬라이스가 CAPTCHA를 우회 가능한 production 인증으로 승인하지 않는다.
- `/auth/callback`은 same-browser Supabase SSR PKCE verifier → 10분 claim context/nonce → code exchange → fresh user 검증 → owner capability와 completed play 검증 → claim RPC → context cookie 삭제 → code 없는 same-origin redirect 순서다. code/state/UID/email/capability는 app log와 analytics에 남기지 않는다.
- 로그인만 하고 claim할 anonymous owner가 없으면 기존 계정의 `/me`로 이동한다. 미완료 owner를 공유하려는 claim은 거부하지만 그 owner 데이터는 지우지 않는다.

## 구현 계획

1. active 제품 SSOT와 결정 로그를 anonymous multi-pack, 공유 전 Auth claim, 방문자 무가입 계약으로 갱신한다.
2. `public.anonymous_owners`, `pack_plays.anonymous_owner_id`, adopted `pack_plays.owner_id`, backfill, capability/claim/auth owner RPC와 privilege를 migration에 추가하고 pgTAP fixture를 확장한다.
3. `lib/owner-play` cookie/credential 타입을 owner 의미로 전환하되 v1 wire compatibility를 유지하고, `lib/db` internal RPC wrapper에 owner create/resume/claim/auth query를 추가한다.
4. play create/resume/save/complete route를 multi-pack owner 기준으로 바꾸고 기존 blank/stale cookie 복구를 보존한다.
5. Supabase SSR sign-in/callback, app-side `magic_link_send` 제한, 10분 claim context와 strict return target parser를 구현한다. OTP/callback 단위 테스트는 SDK boundary를 mock하고 로컬 Supabase Auth/Inbucket 통합 테스트를 별도로 둔다.
6. share API에 adopted-owner gate를 추가하고, fresh Auth actor로 읽는 `/api/me/plays`와 play별 profile 조회를 추가한다.
7. 완료 화면, sign-in 화면, callback 오류 화면, `/me` play 목록을 기존 UI 컴포넌트로 연결한다.
8. 익명 다중 팩 → 완료 → 로그인/claim → 공유 → 방문자 → 다른 브라우저 복구 E2E와 security/concurrency 회귀를 통과시킨다.

## 완료 기준

- [ ] 가입하지 않은 새 사용자가 셀프 답변을 저장하고 새로고침 뒤 같은 상태를 복구한다.
- [ ] 같은 브라우저에서 서로 다른 공식 팩 두 개를 시작해도 두 play와 각 답변이 같은 owner 아래 남고 각각 재개된다.
- [ ] 기존 배포의 유효 v1 cookie와 play row가 migration 뒤에도 해당 play를 복구한다.
- [ ] anonymous owner의 share create/list/rotate/disable 요청은 private `no-store` 인증 필요 응답으로 실패하며 링크 row를 만들거나 바꾸지 않는다.
- [ ] 10장 완료 owner만 로그인 CTA와 claim을 진행하며, callback 성공은 기존 play ID와 답변을 복사 없이 동일 owner에 연결한다.
- [ ] callback 재실행/claim 재호출은 같은 UID에 idempotent하고 다른 UID·invalid/stale capability·만료 claim context·PKCE verifier가 없는 다른 브라우저·동시 claim loser가 owner 존재나 데이터를 알아내지 못한다.
- [ ] claim 성공 뒤 공개와 1:1 링크를 생성·관리하고 기존 visitor 무가입 3장·비교·same-pack 전환이 끝까지 동작한다.
- [ ] 다른 브라우저의 같은 계정 로그인에서 claim된 모든 play 목록과 선택한 프로필을 복구한다.
- [ ] Auth email, UID, capability, 질문·응답 값은 app log와 analytics properties에 기록되지 않는다.
- [ ] active 문서·개인정보 문구가 실제 owner/Auth/보관 동작과 모순되지 않는다.

## 테스트 계획

- [ ] migration pgTAP: 기존 row backfill/ID 보존, anonymous owner+version uniqueness, adopted `owner_id` anchor, RLS/privilege, anonymous capability 격리, claim idempotency·different UID·expiry·동시성, anonymous share gate
- [ ] 단위: v1 cookie compatibility, owner credential hash, strict same-origin `returnTo`, claim-context TTL/nonce, `magic_link_send`, sign-in/callback error mapping, fresh Auth actor enforcement
- [ ] 통합: anonymous owner 두 팩 create/resume/save, legacy cookie 복구, claim 뒤 Auth read/mutation, 다른 계정 거부, 링크 생성 0-row/성공 전환
- [ ] mobile Chromium E2E: 익명 두 팩 저장 → 한 팩 10장 → 로그인 → 공유 → 방문자 제출 → 다른 browser context 계정 복구
- [ ] 기존 owner self-answer, 공개/1:1 visitor, profile, withdrawal 회귀
- [ ] `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 기존 ordered funnel event의 subject와 순서를 유지한다. 공유 성공 event는 실제 claim 이후 링크 생성 성공에서만 기록한다.
- 이번 수직 슬라이스에는 새 analytics event를 추가하지 않는다. 로그인 시작·claim 자체보다 기존 `owner_completed → share_link_created` 전환을 먼저 본다.
- auth/claim 실패 log는 allowlisted 오류 code와 request correlation만 남기고 사용자·owner 식별자는 남기지 않는다.

## 개인정보와 악용 방지

- 이메일은 Supabase Auth provider에만 있고 app DB·analytics·log·공개 프로필에 복사하지 않는다.
- OTP 요청은 Supabase cooldown/rate limit을 적용하고 존재 여부를 숨기는 동일 성공 문구를 사용한다. production 공개 전 CAPTCHA·custom SMTP·미귀속 Auth cleanup은 별도 release gate다.
- callback은 same-browser PKCE verifier, 10분 HttpOnly claim context/nonce, strict same-origin return target, HttpOnly owner capability와 fresh `getUser()`를 모두 요구한다. query/body UID나 client session claim은 신뢰하지 않는다.
- claim transaction은 anonymous owner/대상 play row lock과 adopted `pack_plays.owner_id` 비교를 같은 commit에 넣어 중복·동시 다른 UID 귀속을 막는다. capability는 private MVP의 같은-browser 공유 관리용으로 남고 기존 7일 inactivity expiry·revoke 규칙을 그대로 적용한다.
- anonymous owner는 마지막 검증 활동+7일, authenticated owner는 마지막 활동+1년이라는 기존 보관 상한을 유지한다. 이번 이슈가 account deletion이나 cleanup worker를 열지는 않는다.
- 방문자 답변과 관계·시점은 Auth 계정에 연결하지 않고 기존 response capability·철회·보관 정책을 유지한다.

## 롤아웃과 복구

- private MVP에 한 번에 적용하되 migration 전에 application DB user-data dump와 row-count checksum을 남긴다.
- migration은 기존 ID를 유지하는 forward backfill이며 적용 중 한 transaction으로 실패한다. 검증 전에는 기존 capability column을 삭제하지 않는다.
- 배포 순서는 migration/RPC → 호환 app이다. v1 cookie fixture, 기존 row profile/share regression과 backfill count가 맞지 않으면 traffic을 열지 않는다.
- 실패 시 app release를 직전 버전으로 되돌리기 전에 DB 호환 여부를 확인한다. 새 owner write가 발생하지 않았다면 검증된 dump로 복구하고, 발생했다면 데이터를 버리지 말고 roll-forward 수정한다.
- production SMTP, public signup, account deletion은 이 이슈 성공만으로 활성화하지 않는다.

## 스펙 검토

Reviewer Agent: issue92_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 로컬 Supabase Auth email catcher의 API/UI를 통합·E2E에서 확인해야 한다. production provider 자격증명은 blocker가 아니다.
- 동일 계정이 여러 anonymous owner를 claim하면 owner row는 병합하지 않고 `/me`에서 합쳐 보여준다. 중복 pack 정리는 후속 사용성 이슈다.
- 기존 capability column 제거, account deletion, 미귀속 Auth cleanup은 데이터 마이그레이션 안정성을 확인한 후 별도 이슈로 분리한다.
