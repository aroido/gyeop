# Issue 150 구현 스펙: `/me` 계정 통합 프로필과 질문팩 보조 관리

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/150

## 목표

로그인한 주인이 `/me`에 들어오자마자 질문팩 목록이 아니라 자신의 실제 셀프 선택과 공개 가능한 관계 시선이 여러 완료 팩에서 한곳으로 쌓이는 계정 통합 프로필을 보고, 팩 이어하기·공유 관리는 그 아래 보조 영역에서 계속 사용할 수 있게 한다.

## 범위

- `/me`를 `<닉네임>의 겹` 사람 중심 계정 프로필로 개편한다.
- 인증된 owner의 닉네임, 계정에 연결된 play 목록, 완료 play별 기존 strict-decoded `OwnerProfile`을 server-only에서 읽는다.
- 완료 play의 프로필을 계정 모델로 조합하는 순수 함수를 추가한다.
  - 전체 시선은 완료 play별 `sightCount`의 합이다.
  - 완료한 겹은 완료 play 수다.
  - 도착한 관계는 `relationshipLayers`에 실제로 존재하는 `relationshipCode`의 distinct 수다.
  - 완료 play의 대표 셀프 카드는 각 strict-decoded `profile.cards[0]`이다. 카드가 없거나 profile 계약이 깨지면 해당 결과를 임의 보정하지 않고 계정 프로필 로드를 실패시킨다.
  - 관계 카드는 같은 play·같은 관계에서 이미 `status: "available"`인 질문만 사용한다.
  - `status: "collecting"`인 관계의 `1/3`·`2/3`은 해당 play 경계와 함께 유지하고 다른 play 표본과 합치지 않는다.
  - 관계가 available이어도 질문 카드가 collecting이면 그 질문의 선택 수를 계정 모델에 넣지 않는다.
- `/me`의 첫 viewport를 승인 목업의 사람 중심 정보 구조로 구현한다.
  - `겹 · 내 프로필`
  - `<닉네임>의 겹`
  - `시선 n개`, `완료한 겹 n개`, `관계 n개`
  - 실제 데이터 하나와 대응하는 최대 4개의 blue/lime/coral/black 카드 레이어
  - 선택한 관계의 원본 질문, `내 선택`, 공개 가능한 A/B 집계
  - threshold 미달 상태의 `시선을 모으는 중 · n/3`
  - 현재 상태에서 가능한 하나의 dominant CTA
- 완료 play가 없으면 profile chrome 안에서 `아직 완성한 겹이 없어요`와 `질문팩 시작하기`를 표시한다.
- 완료 play는 있으나 시선이 없으면 대표 셀프 카드와 `친구 시선 모으기`를 표시한다.
- 시선이 있으면 공개 가능한 관계 질문을 먼저 보상으로 보여 주고, 없다면 collecting 상태나 대표 셀프 카드를 보여 준다.
- 기존 play 목록은 `내 질문팩 관리` 보조 영역으로 이동한다.
  - draft: `이어서 답하기`
  - completed: `공유·상세 관리`
  - 다른 질문팩 시작, 로그아웃 경로 유지
- 기존 `/me/profile/[playId]`, `/me/plays/[playId]`, `/play/[playId]`는 삭제하거나 의미를 바꾸지 않는다.
- signed-out, incomplete nickname redirect, 빈 계정, draft-only, completed-only, mixed, profile load failure를 명시적으로 처리한다.
- active SSOT와 디자인 명세를 계정 통합 프로필 결정에 맞춘다.
- 순수 모델 단위 테스트, focused Playwright, 기존 live owner 회귀를 갱신한다.

## 제외 범위

- 공개 사용자 프로필 URL과 미참여 방문자에게 보이는 계정 프로필
- 관계 인사이트 PNG·외부 프로필 공유(#147)
- AI 요약, 성격 단어, MBTI형 고정 유형, 점수, 순위
- avatar, Google 계정 이름·사진, 방문자 이름·사진
- 고유 방문자 수 추정과 서로 다른 팩 참여자의 identity stitching
- 서로 다른 팩의 소표본을 합쳐 threshold를 여는 정책
- 1:1 응답을 계정 통합 프로필에 포함하는 변경
- 팩 중복 병합·삭제·사용자 정렬 설정
- 새 DB migration, 새 public RPC, aggregate table
- 기존 play별 profile event schema 변경과 새 analytics event

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/design/p0-mobile-ui-spec.md`
- `docs/engineering/p0-development-plan.md`
- `docs/specs/issue-27.md`
- `docs/specs/issue-92.md`
- `docs/specs/issue-146.md`
- `lib/db/internal-rpc.ts`
- `lib/db/owner-mutation-actor.ts`
- `lib/db/owner-mutation-actor-core.mjs`
- `lib/owner-profile/owner-profile-core.mjs`
- `lib/owner-profile/owner-profile.ts`
- `lib/visitor-response/visitor-context-core.mjs`
- `lib/http/owner-public-profile.ts`
- `app/me/layout.tsx`
- `supabase/migrations/20260720000100_anonymous_owner_claim.sql`
- `supabase/migrations/20260723000200_owner_profile_relationship_layers.sql`
- `scripts/verify-owner-profile.mjs`
- `scripts/verify-data-access.mjs`
- `scripts/ai-verify`
- `package.json`
- `docs/assets/mockups/01-product-overview.png`
- `docs/assets/mockups/03-perspective-stack-profile.png`
- `docs/assets/mockups/04-profile-evolution.png`
- `docs/assets/mockups/owner-profile-relationship-layers-v1.png`
- `AGENTS.md`
- `.codex/AGENTS.md`

충돌 시 이번 이슈가 `core-feature-priority.md`와 `decision-log.md`에 기록하는 계정 통합 private profile 결정을 우선한다. #92의 계정 다중 팩 보존·복구는 유지하되 “`/me`는 최신 활동순 pack list가 첫 정보 구조”인 부분만 대체한다. #146의 play별 관계·질문 threshold와 privacy 경계는 그대로 유지한다.

## 사용자 흐름 영향

1. 로그인하지 않은 사용자가 `/me`를 열면 기존처럼 계정 존재를 드러내지 않는 Google 로그인 카드만 본다.
2. 로그인했지만 닉네임이 없으면 `/me` layout이 기존처럼 `/auth/complete-profile?returnTo=%2Fme`로 보낸다.
3. 닉네임을 완료한 주인은 `/me` 첫 화면에서 `<닉네임>의 겹`과 현재 계정 전체의 실제 누적 상태를 먼저 본다.
4. 완료 play가 없으면 빈 profile chrome에서 질문팩 시작 CTA를 누른다. draft는 아래 `내 질문팩 관리`에서 이어 답을 수 있다.
5. 완료 play가 있고 시선이 없으면 대표 셀프 카드가 seed layer가 된다. CTA는 deterministic한 최신 완료 play의 `/me/plays/[playId]` 공유 관리로 연결한다.
6. 관계 시선이 1~2개뿐이면 해당 play의 collecting 상태만 보여 주며 A/B 선택 수는 숨긴다.
7. 한 play에서 관계·질문 threshold가 모두 열린 결과가 있으면 그 원본 질문과 셀프 선택, 관계별 A/B 수를 계정 프로필 카드에서 본다.
8. 여러 완료 팩이 있으면 대표 셀프 카드와 공개 가능한 관계 카드가 한 프로필 stack에 기여한다. 주인은 먼저 팩을 고르지 않아도 프로필 보상을 본다.
9. 답변 이어하기, 팩별 상세 관계 프로필, 공유·1:1 관리는 아래 보조 목록에서 기존 경로로 이동한다.
10. 방문자 응답·비교·같은 팩 새 주인 전환 흐름은 바뀌지 않는다.

## 디자인 영향

- `/me`는 검정 canvas, 큰 한글 typography, lime/blue/coral/black 카드 레이어를 사용한다.
- `/me`의 직접 시각 기준은 검정 canvas의 `01-product-overview.png`, `03-perspective-stack-profile.png`, `04-profile-evolution.png`이다. 흰 canvas의 `owner-profile-relationship-layers-v1.png`에서는 원본 질문·셀프 선택·관계 threshold·collecting 상태의 정보 구조만 재사용하고 배경·첫 화면 구성·비활성 공유 CTA는 복제하지 않는다.
- 목업의 시각 위계는 유지하되 표현은 다음처럼 실제 데이터로 번역한다.
  - `민수의 겹` → owner가 직접 입력한 `<닉네임>의 겹`
  - `신중함` 같은 성격 단어 → 원본 질문의 실제 `내 선택`
  - avatar·`관계 6명` → `시선 n개`와 distinct `관계 n개`
  - 관계별 색상 카드 → 공개 가능한 관계 질문 또는 해당 play의 collecting 상태
- 동시에 보이는 decorative/data layer는 최대 4개다. 각 layer는 실제 대표 셀프 카드, 공개 가능한 관계 질문, 또는 play-bound collecting 상태 하나와 대응한다.
- 데이터가 4개보다 많으면 첫 화면 stack은 deterministic한 순서로 4개만 보여 주고, 관계 선택기와 관리 영역으로 나머지 결과에 접근한다.
- 우선순위는 available 관계 질문 → collecting 관계 → 대표 셀프 카드다. 같은 우선순위에서는 `listAuthenticatedOwnerPlays()`의 최신 활동순, 관계 registry 순서, 카드 position 순서를 사용한다.
- 프로필 first viewport에는 하나의 dominant CTA만 둔다.
  - 완료 play 없음: `질문팩 시작하기` → `/`
  - 완료 play 있음: `시선 더 모으기` → 최신 완료 play의 `/me/plays/[playId]`
- `내 질문팩 관리`, 다른 질문팩 고르기, 로그아웃은 profile reward 아래 secondary/tertiary 위계다.
- 320/390/430px에서 body 가로 overflow가 없어야 한다.
- interactive target은 최소 44px이며 focus-visible, `aria-pressed`, heading 순서, reduced-motion을 유지한다.
- 카드 stack의 시각적 중복 정보는 `aria-hidden` decorative layer로 분리하고 screen reader가 실제 데이터 card를 한 번만 읽게 한다.
- 기존 저장소 Lazyweb report의 “결과를 먼저 보상하고 다음 행동은 하나로 분명히 한다”는 방향만 사용한다. personality score, avatar social proof, 결과 잠금, generic discovery는 채택하지 않는다.

## API와 데이터 영향

### 인증과 server-only 조회

- `/me` page는 `loadOwnerPublicProfileGate()`와 `loadAuthenticatedOwnerPlays()`를 사용한다.
- completed play별 `getAuthenticatedOwnerProfile({ playId })`는 기존 `withOwnerMutationActor`와 strict decoder를 통과한 결과만 신뢰한다.
- 새 server-only loader는 play 목록의 completed 항목만 조회한다. 반환 결과가 `authorized`가 아니거나 play ID·pack metadata가 목록과 불일치하면 부분 프로필을 성공으로 꾸미지 않고 generic authenticated profile load failure로 수렴한다.
- 한 Auth UID에는 서로 다른 anonymous owner에서 claim된 중복 play도 있을 수 있으므로 completed play 수를 공식 pack 수로 제한하거나 임의 절단하지 않는다.
- `lib/db/internal-rpc.ts`에 `getAuthenticatedOwnerAccountProfiles(playIds)`를 추가한다. 이 함수는 `withOwnerMutationActor()`를 정확히 한 번 실행해 fresh Auth actor와 기존 30초 total-deadline `signal`을 얻은 뒤, 같은 actor UID와 같은 signal로 기존 `get_authenticated_owner_profile` RPC를 최대 4개씩 bounded concurrency로 호출한다.
- 기존 `getAuthenticatedOwnerProfile(playId)`를 반복 호출해 fresh-auth를 N회 수행하지 않는다. 새 함수의 내부 row decoder는 기존 `decodeOwnerProfileOutcome()`을 그대로 재사용한다.
- completed play ID를 임의 절단하지 않으며, 30초 signal abort·한 건의 RPC/decode/ownership mismatch도 부분 성공으로 낮추지 않고 전체를 generic load failure로 수렴한다.
- bounded worker helper에는 RPC reader를 주입할 수 있게 두어 stub reader 테스트에서 5번째 요청이 앞선 slot 완료 전 시작하지 않는지, 모든 호출이 동일 actor/signal을 받는지, abort 뒤 새 작업을 시작하지 않는지 검증한다.
- `scripts/verify-data-access.mjs`와 `tests/unit/data-access-policy.test.mjs`가 새 internal RPC wrapper도 one fresh actor, actor UID argument, shared signal, static RPC name 경계를 지키는지 검사하도록 갱신한다.
- 브라우저에서 여러 `/api/me/profile?playId=…` 요청을 만들지 않는다. 계정 통합은 RSC server-only 경계에서 수행한다.
- RSC payload에는 owner에게 허용된 self choice와 이미 공개 가능한 aggregate만 포함한다. collecting 관계에는 기존 strict profile이 반환한 관계 code·`sightCount`와 상태만 포함하고 숨은 A/B count를 새로 조회·직렬화하지 않는다.

### 계정 프로필 모델

새 순수 모델은 다음 입력만 받는다.

- normalized nickname
- `AuthenticatedOwnerPlaySummary[]`
- completed play ID와 strict-decoded `OwnerProfile`의 대응 목록

파생 출력은 다음을 포함한다.

- `nickname`
- 원래 순서를 유지한 `plays`
- `completedPlayCount`
- per-play `sightCount` 합인 `sightCount`
- 실제 도착 layer의 distinct `relationshipCode` 수
- 완료 play별 `profile.cards[0]` 대표 셀프 카드
- play ID·pack title·relationship code를 함께 가진 available 관계 질문
- play ID·pack title·relationship code·1|2 sight count를 함께 가진 collecting layer
- CTA 대상인 최신 completed play ID

출력은 exact key 계약으로 고정한다.

- account root: `nickname`, `plays`, `completedPlayCount`, `sightCount`, `relationshipCount`, `selfLayers`, `availableLayers`, `collectingLayers`, `ctaPlayId`
- self layer: `kind`, `playId`, `packTitle`, `cardId`, `position`, `prompt`, `optionA`, `optionB`, `selfChoice`
- available layer: self layer key에 `relationshipCode`, `sampleCount`, `counts:{a,b}`를 추가한다. `sampleCount`는 같은 play·관계·질문에서 이미 threshold를 통과한 값이다.
- collecting layer: `kind`, `playId`, `packTitle`, `relationshipCode`, `sightCount`, `status`만 가진다. 질문 `cardId`, `sampleCount`, `counts`, prompt/options/selfChoice는 넣지 않는다.
- exact-key decoder는 예상하지 않은 key, play/profile metadata 불일치, collecting layer의 질문 표본/count, available layer의 3 미만 sample/count 불일치를 거절한다.

모델은 다음을 하지 않는다.

- 관계별 sight count를 서로 다른 play 사이에서 합쳐 `available`로 승격
- available 관계 안의 collecting question sample을 다른 play와 합산
- 동일 방문자 dedupe 또는 사람 수 추정
- 성격 label·문장·점수 생성
- 입력에 없는 fallback 질문·선택 생성

### DB·route

- DB schema, RLS, RPC, threshold SQL은 바꾸지 않는다.
- `/api/me/profile` 계약은 바꾸지 않는다.
- `/me/profile/[playId]` client refresh, watermark, `profile_viewed`, `profile_reshare_clicked` 계약은 유지한다.
- 계정 통합 `/me` 조회 자체에는 play 하나로 귀속할 수 없는 기존 analytics event를 억지로 발행하지 않는다.

## 구현 계획

1. `docs/product/core-feature-priority.md`, `docs/product/decision-log.md`, `docs/design/p0-mobile-ui-spec.md`, `docs/engineering/p0-development-plan.md`에서 `/me` 사람 중심 통합 프로필과 pack 관리 보조 위계를 기록하고 stale single-play 문구를 정리한다.
2. `lib/owner-profile/account-profile-core.mjs`에 계정 모델 파생 순수 함수를 만들고 exact input validation, deterministic ordering, cross-pack threshold 비합산을 단위 테스트한다.
3. `lib/owner-profile/account-profile.ts`에 TypeScript 공개 타입을 둔다.
4. `lib/http/auth-owner.ts`에 nickname·play list·completed profile을 읽는 server-only loader를 추가한다. 기존 strict RPC decoder를 재사용하고 partial failure를 generic auth/profile failure로 처리한다.
5. `app/me/account-profile-view.tsx`를 추가해 사람 중심 heading, metrics, stack, 관계 선택, actual question/choice/aggregate, empty/collecting, dominant CTA, 보조 pack 관리 목록을 렌더링한다.
6. `app/me/page.tsx`는 signed-out login card는 유지하고, signed-in에서는 account profile loader 결과를 새 view에 전달한다.
7. `app/me/owner-list.module.css`를 `/me` 통합 profile의 검정 canvas와 layer system으로 개편한다. 기존 `owner-profile.module.css`의 토큰과 승인 목업의 색·shadow를 재사용하되 CSS 추상화 파일은 새로 만들지 않는다.
8. `tests/unit/account-owner-profile.test.mjs`에 pure derivation과 privacy 경계를 추가한다.
9. `tests/e2e/owner-profile.spec.ts`, `tests/e2e/owner-play-live.spec.ts`, `tests/e2e/core-mvp-live.spec.ts`, `tests/e2e/owner-auth-live-fixture.ts`의 `/me` heading·링크 기대를 새 계약으로 갱신하고 multi-pack 390px 상태를 검증한다.
10. 390px current/after screenshot을 `docs/temp/qa/issue-150/`에 남기고 320/390/430px overflow·focus·44px를 한 번에 검수한다.

## 완료 기준

- [ ] 로그인한 owner가 `/me`를 열면 첫 `h1`이 `저장한 질문팩`이 아니라 `<닉네임>의 겹`이다.
- [ ] `/me` 첫 viewport에 `시선 n개`, `완료한 겹 n개`, `관계 n개`와 실제 account profile layer가 보인다.
- [ ] 완료 팩이 2개 이상이면 각 strict profile의 대표 셀프 카드와 공개 가능한 관계 결과가 사용자가 먼저 팩을 고르지 않아도 한 계정 모델에 기여한다.
- [ ] 전체 `시선`은 per-play submitted 공개 응답 수 합계이며 고유 사람 수나 `n명`으로 표시되지 않는다.
- [ ] 서로 다른 play의 관계 `2+1`, `2+2`를 합쳐 available 관계나 A/B count를 만들지 않는다.
- [ ] 관계가 available이어도 질문 표본이 1~2개면 그 질문의 count가 모델, DOM, RSC payload, 접근성 이름에 없다.
- [ ] 원본 질문·셀프 선택·공개 가능한 관계 A/B count 외 성격 단어·AI 요약·점수·순위·avatar가 없다.
- [ ] 완료 play가 없을 때 빈 profile과 `질문팩 시작하기`가 보이며 draft는 `내 질문팩 관리`에서 이어 답을 수 있다.
- [ ] 완료 play가 있으면 하나의 `시선 더 모으기` CTA가 최신 완료 play의 기존 공유 관리 경로로 연결된다.
- [ ] 모든 draft와 completed play가 `내 질문팩 관리`에서 각각 이어 답기와 공유·상세 관리 경로를 유지한다.
- [ ] signed-out login card와 incomplete nickname redirect가 기존처럼 fail-closed한다.
- [ ] 인증은 유효하지만 account profile 조합이 timeout·decode mismatch·내부 오류로 실패하면 `프로필을 불러오지 못했어요`와 `다시 시도`만 보이고 stale 수치·부분 play·signed-out 로그인 문구를 보여 주지 않는다. retry는 현재 `/me`를 새로 요청한다.
- [ ] 기존 `/me/profile/[playId]`, `/me/plays/[playId]`, owner answer, share, visitor flow가 회귀하지 않는다.
- [ ] 320/390/430px에서 body overflow가 없고 44px target, 키보드 관계 선택, focus-visible, heading, reduced-motion 검증을 통과한다.
- [ ] 관련 focused test, exact clean HEAD의 `./scripts/run-ai-verify --mode full`, named `verify` CI가 통과한다.

## 테스트 계획

- [ ] 단위 `tests/unit/account-owner-profile.test.mjs`
  - 빈 입력
  - draft-only
  - one completed profile
  - multiple completed profiles and deterministic order
  - `sightCount` 합과 distinct relationship count
  - representative `cards[0]`
  - cross-play collecting `2+1`, `2+2` 비합산
  - available relationship의 collecting question count 비노출
  - malformed/mismatched play/profile fail-closed
- [ ] server loader 통합 테스트
  - injected profile reader로 completed play 5개를 주고 동시 실행이 4개를 넘지 않는지 검증
  - `withOwnerMutationActor()`를 한 번만 실행하고 모든 RPC가 같은 actor UID와 기존 30초 total-deadline signal을 받는지 검증
  - shared signal abort 뒤 새 작업이 시작되지 않고 generic failure로 수렴하는지 검증
  - 한 profile의 unauthorized/decode mismatch가 partial account profile을 반환하지 않는지 검증
  - exact output keys와 collecting layer에 `cardId`, `sampleCount`, `counts`, prompt/options/selfChoice가 없는지 검증
- [ ] focused static verification에서 새 model/test가 기본 `pnpm test`와 owner profile verifier에 포함됐는지 확인
- [ ] Playwright mocked profile은 기존 `/me/profile/[playId]` 상세 회귀에만 사용하고 server-only `/me` account composition의 증거로 사용하지 않는다.
- [ ] live owner fixture:
  - signed-out `/me`
  - nickname incomplete redirect
  - 한 Auth 계정에 completed play 2개 이상과 draft 1개를 만들고 `<닉네임>의 겹`에 두 대표 셀프 layer가 함께 보이는지 검증
  - 한 play의 available 관계·질문과 다른 play의 collecting `1/3|2/3`를 만든 뒤 available count만 DOM에 보이는지 검증
  - collecting play의 대표 카드가 아닌 두 번째 카드에서 고유한 원본 질문·선택지 문자열 하나를 forbidden sentinel로 고정한다.
  - authenticated `page.goto("/me")`의 `document` 응답 body와 홈의 `내 프로필` Next `Link` client navigation에서 `request.headers().rsc === "1"`이고 `content-type`이 `text/x-component`인 응답 body를 각각 캡처한다.
  - 두 raw body 모두에서 forbidden 질문·선택지 sentinel과 JSON key `"counts"`·`"sampleCount"`가 collecting layer 근처에 직렬화되지 않는지 검사한다. 숫자 `1`·`2` 자체는 충돌하므로 raw 숫자 부재 증거로 사용하지 않고, exact-key model/loader test가 collecting numeric key 부재를 증명한다.
  - available/collecting 관계 선택, dominant CTA, management 링크
  - 다른 브라우저 복구
  - existing profile/share management
- [ ] 320×800, 390×844, 430×932 screenshot와 `scrollWidth <= clientWidth`
- [ ] 키보드 Tab/Enter, focus-visible, 최소 44px hit target, reduced-motion
- [ ] `scripts/task-harness pr 150`이 exact clean HEAD에서 소유하는 `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 새 analytics event를 추가하지 않는다.
- 기존 play별 `profile_viewed`와 `profile_reshare_clicked`는 `/me/profile/[playId]` 상세 경로에서 유지한다.
- 계정 통합 `/me` view를 최신 completed play 하나의 `profile_viewed`로 기록하지 않는다. 여러 play를 본 행동을 한 play에 잘못 귀속하지 않기 위해서다.
- 이번 PR의 성공은 manual/private MVP에서 `/me` 진입 후 프로필 보상 인지와 기존 share manager 접근 가능 여부로 확인한다. 계정 profile funnel event는 별도 schema 결정으로 분리한다.
- app log에는 nickname, 질문·응답 값, relationship code, play list를 새로 기록하지 않는다.

## 개인정보와 악용 방지

- `/me`와 모든 profile 조회는 fresh Auth UID와 play ownership을 기존 server/RPC 경계에서 검증한다.
- account profile 조합은 owner 본인의 private RSC에서만 수행하고 public URL이나 metadata/OG에 넣지 않는다.
- 같은 관계가 여러 팩에서 1~2개씩 있어도 합쳐 공개하지 않는다. 기존 관계 threshold와 질문 threshold를 play마다 독립 적용한다.
- 1:1, draft, withdrawn, invalid, 다른 pack version 응답은 기존 profile RPC에서 제외된 상태를 그대로 신뢰하며 새 query로 우회하지 않는다.
- `시선 n개`는 응답 수다. 고유 인원이나 실제 친구 수로 표현하지 않아 중복 참여를 사람 수로 오해시키지 않는다.
- Google 계정 이메일·이름·사진을 쓰지 않고 owner가 직접 입력해 공개 링크에도 사용하는 normalized nickname만 본인 private heading에 재사용한다.
- RSC error와 signed-out state는 owner/play 존재·개수를 드러내지 않는 generic copy를 사용한다.

## 롤아웃과 복구

- DB migration 없이 app release 한 번으로 배포한다.
- 기존 `/me/profile/[playId]`, `/me/plays/[playId]`, `/api/me/profile`을 유지하므로 새 `/me`에서 문제가 생겨도 저장 데이터와 기존 deep link는 보존된다.
- 배포 전 390px before/after와 세 viewport 수동 검수를 완료한다.
- 배포 뒤 signed-out `/me`, authenticated `<닉네임>의 겹`, management deep link, `/me/profile/[playId]`를 smoke한다.
- 문제 발생 시 app release를 직전 commit으로 되돌린다. migration과 data rewrite가 없으므로 DB rollback은 없다.
- 이번 변경만으로 public profile, relation image share, production beta를 승인하지 않는다.

## 스펙 검토

Reviewer Agent: issue150_spec_critic3
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- `listAuthenticatedOwnerPlays()`의 최신 활동순을 계정 profile과 CTA의 deterministic order로 사용한다. 별도 대표 팩 설정은 제외한다.
- completed play 수만큼 기존 profile RPC가 실행되지만 임의 절단하지 않는다. 한 fresh actor와 기존 30초 total-deadline signal 안에서 최대 4개 bounded concurrency로 request 폭주와 auth N회 실행을 막는다. private MVP 실측이 이 budget을 반복해서 넘을 때 account aggregate RPC를 후속 검토한다.
- 한 방문자가 여러 팩에 참여할 수 있으므로 전체를 `시선`으로만 부르고 고유 사람 수로 해석하지 않는다.
- RSC raw body negative test는 collecting layer의 고유 relationship/play marker 앞뒤 deterministic window를 잘라 `"counts"`·`"sampleCount"` 부재를 검사하고, 문서 전체의 available layer key와 혼동하지 않는다.
- 구현 전 미결정 제품 질문은 없다. 독립 spec review의 P0/P1 findings가 0이 되어야 구현을 시작한다.
