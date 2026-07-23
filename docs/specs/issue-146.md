# Issue 146 구현 스펙: /me 관계 레이어 프로필 집계와 모바일 화면 개편

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/146

## 목표

로그인한 owner가 `/me/profile/[playId]`에서 공개 링크로 받은 완료 응답을 관계별로 탐색하고, 관계 및 질문별 최소 표본 3개를 충족한 A/B 집계만 비공개로 확인할 수 있게 한다.

## 범위

- [ ] `public.get_owner_profile`에 공개 링크의 `submitted` 응답만 사용한 관계 레이어 집계를 추가한다.
- [ ] 기존 전체 `sightCount`와 owner 셀프 카드의 식별·표시 필드(`cardId`, `position`, prompt/options의 현행 wire field인 `ownerPrompt`·`optionA`·`optionB`, `selfChoice`)는 유지한다. top-level `sampleCount`·`counts`만 아래 안전 projection 의미로 재정의하고 `relationshipLayers`를 추가한다.
- [ ] `lib/visitor-response/visitor-context-core.mjs`의 `RELATIONSHIP_OPTIONS` 8개 code와 선언 순서를 데이터 검증, API decode, 초기 선택, 관계 선택기 순서의 단일 기준으로 재사용한다. 관계 label은 이 registry에서 derive하고 DB/RPC에 중복 저장하지 않는다.
- [ ] `lib/owner-profile/owner-profile.ts`, `lib/owner-profile/owner-profile-core.mjs`, `lib/owner-profile/owner-profile-client.ts`의 타입·strict decoder·client contract를 갱신한다. `app/api/me/profile/route.ts`는 수정 대상이 아니라 기존 auth/status/cache 계약의 회귀 확인 대상이다.
- [ ] `/me/profile/[playId]`의 주 정보 구조를 전체 A/B 목록에서 관계 선택기와 선택 관계의 대표 질문/수집 상태로 개편한다.
- [ ] forward-only Supabase migration, SQL 회귀, unit, integration, E2E, owner profile 검증 스크립트, 제품 문서와 승인 목업 보존본을 함께 갱신한다.

## 제외 범위

- [ ] #147의 관계 인사이트 PNG 생성, 이미지 다운로드, 외부 공유 기능
- [ ] 공개 프로필 URL 또는 미참여 방문자용 프로필 화면
- [ ] 새 share link 종류, 외부 이미지 생성 서비스, 서버 이미지 저장
- [ ] `known_since_code` 교차 집계와 기간별 필터
- [ ] 1:1 응답의 누적 프로필 포함
- [ ] 썸·연인 결과의 외부 공개
- [ ] 방문자 이름·사진·개별 답변 노출
- [ ] 질문팩 또는 방문자 관계 선택 UI 변경
- [ ] AI 요약, 성격 유형, 점수, 순위
- [ ] 활성화된 `이 시선 카드 공유하기` CTA
- [ ] `app/api/me/profile/route.ts`의 구현 변경

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/engineering/p0-development-plan.md
- AGENTS.md
- 이슈 #146 본문
- `lib/visitor-response/visitor-context-core.mjs`의 `RELATIONSHIP_OPTIONS`
- `supabase/migrations/20260719000200_visitor_optional_answers.sql`: required와 optional의 실제 제출 답변을 집계하는 최신 authoritative `get_owner_profile` 본문
- `supabase/migrations/20260720000100_anonymous_owner_claim.sql`: anonymous owner claim 이후에도 owner 권한을 보존하는 최신 auth wrapper
- `supabase/migrations/20260718001000_profile_reshare.sql`: `profile_viewed`와 `profile_reshare_clicked`의 기존 event 계약
- 관계·질문 집계 공개 임계값은 모두 3이며, 이 값은 기존 개인정보 기준을 그대로 따른다.

## 사용자 흐름 영향

- [ ] 주인: `/me`의 기존 owner profile 진입 경로로 들어가 전체 시선 수를 확인하고, 관계 선택기에서 공개 가능 또는 수집 중 관계를 바꿔 본다. 공개 가능한 관계에서는 `내 선택`과 같은 관계의 A/B 집계를 비교하고, 표본이 부족한 질문은 `시선을 모으는 중 · n/3`으로 확인한다.
- [ ] 방문자: 공개 링크에서 관계와 알게 된 기간을 고르고 답하는 기존 흐름은 바뀌지 않는다. 방문자의 이름·사진·개별 답변은 owner profile에 전달하거나 노출하지 않는다.
- [ ] 전환된 새 주인: 기존 `/me` 허브, owner 답변, 공유 관리, #58의 같은 질문팩 재공유 경로를 그대로 이용한다.
- [ ] `sightCount === 0`이고 `relationshipLayers`가 비었으면 관계 선택기와 재공유 CTA를 모두 표시하지 않는다.
- [ ] `sightCount > 0`이면 기존 `시선 더 모으기` 재공유 CTA와 `profile_reshare_clicked` 조건을 유지한다. 이는 기존 질문팩 링크를 다시 공유하는 기능이며 #147의 카드 이미지 공유와 구분한다.

## 디자인 영향

- [ ] `app/me/owner-profile-view.tsx`와 `app/me/owner-profile.module.css`를 승인 목업의 정보 구조로 변경한다: `내 시선 프로필`/전체 `시선 n개` → `관계별로 보는 나` 선택기 → 선택 관계의 관계명·인원·상태 → 공개된 대표 질문 → 다음 수집 중 질문.
- [ ] zero 상태: `sightCount === 0`이고 `relationshipLayers`가 비었으면 관계·A/B 수치와 재공유 CTA를 만들지 않는다. 기존 analytics 조건도 변경하지 않는다.
- [ ] collecting 상태: 선택 관계의 `sightCount`가 1~2이면 관계명과 `시선을 모으는 중 · n/3`만 표시한다. 카드, owner 선택, A/B 수치는 렌더링하지 않는다.
- [ ] available 상태: 선택 관계의 `sightCount`가 3 이상이면 registry/질문팩 순서상 첫 `available` 카드를 대표 질문으로 보여주고 기존 셀프 카드에서 얻은 `내 선택`과 `{a,b}`를 비교한다. 첫 `collecting` 카드는 같은 순서로 `시선을 모으는 중 · n/3` 상태를 보여주되 A/B 수치는 표시하지 않는다.
- [ ] 공개 가능한 카드가 없으면 수집 중 카드만 보여주며, 해당 카드도 없으면 관계 공개 상태만 보여준다. 질문 카드의 `sampleCount` 0은 `0/3`, 1~2는 `n/3`으로만 표시한다.
- [ ] 초기 관계는 `status: "available"`인 관계 중 registry 순서상 첫 항목으로 정한다. 없으면 `status: "collecting"`인 첫 항목을 고른다. 관계와 카드 배열 및 이 규칙만 사용하여 새로고침 후에도 같은 초기 선택과 표시 순서를 보장한다.
- [ ] 관계 선택기는 키보드와 screen reader에 현재 선택 상태를 전달하고, 모든 interactive target은 최소 44px, `focus-visible`, `prefers-reduced-motion`을 지킨다.
- [ ] 320/390/430px에서 가로 overflow가 없어야 하며 긴 한글 관계명·질문·선택지를 자르거나 의미 없이 축약하지 않는다.
- [ ] 승인 목업 source `/Users/macmini/.codex/generated_images/019f8d8d-dab4-7b82-a903-d76c76e9e95f/call_iL4WPC8Puj8k6KH4UMepGQ8Q.png`(SHA-256 `6521916f8b5c40fbf81b82374ffb326ece1c89b69abed7d804605c882c35264c`)를 `docs/assets/mockups/owner-profile-relationship-layers-v1.png`에 동일 바이트로 보존한다. 제품 화면에는 #147 전까지 비활성 공유 CTA도 추가하지 않는다.

## API와 데이터 영향

- [ ] 새 forward-only migration에서 `public.get_owner_profile`의 owner 권한 검사와 기존 반환값을 유지하면서 아래 exact payload의 `relationshipLayers`를 추가한다.

```ts
type RelationshipCode =
  // lib/visitor-response/visitor-context-core.mjs의 RELATIONSHIP_OPTIONS 8개 code
  (typeof RELATIONSHIP_OPTIONS)[number]["code"];

type Counts = Readonly<{ a: number; b: number }>;

type OwnerProfileRelationshipCard =
  | Readonly<{
      cardId: string;
      sampleCount: number; // 0~2, 실제 제출 답변 수
      status: "collecting";
      // counts key 없음
    }>
  | Readonly<{
      cardId: string;
      sampleCount: number; // 3 이상, 실제 제출 답변 수
      status: "available";
      counts: Counts; // a + b === sampleCount
    }>;

type OwnerProfileRelationshipLayer =
  | Readonly<{
      relationshipCode: RelationshipCode;
      sightCount: 1 | 2;
      status: "collecting";
      cards: readonly [];
    }>
  | Readonly<{
      relationshipCode: RelationshipCode;
      sightCount: number; // 3 이상
      status: "available";
      cards: readonly OwnerProfileRelationshipCard[]; // 정확히 top-level 10장
    }>;

type OwnerProfileCard = Readonly<{
  cardId: string;
  position: number;
  ownerPrompt: string;
  optionA: string;
  optionB: string;
  selfChoice: "a" | "b";
  sampleCount: number; // 안전 projection 결과: 0 또는 3 이상
  counts: Counts | null; // sampleCount 0이면 null, 3 이상이면 합계
}>;

type OwnerProfilePayload = Readonly<{
  playId: string;
  packSlug: string;
  packVersion: string;
  packTitle: string;
  sightCount: number;
  sightStatus: "empty" | "has_sight";
  cards: readonly OwnerProfileCard[]; // 기존과 동일한 self-card 10장
  relationshipLayers: readonly OwnerProfileRelationshipLayer[];
}>;
```

- [ ] `relationshipLayers`에는 현재 owner play·pack version에 속한 공개 링크의 유효한 `submitted` 응답이 1건 이상인 관계만 넣는다. 1:1 링크, draft, withdrawn, 삭제·철회·무효 응답, 다른 owner play, 다른 pack version은 전체·관계·질문 집계에서 모두 제외한다.
- [ ] 집계 SQL은 `20260719000200_visitor_optional_answers.sql`의 최신 authoritative RPC를 기준으로 한다. 방문자가 실제로 제출한 required와 optional 답변을 모두 집계하고, 답하지 않은 optional 문항을 답변으로 합성하지 않는다. `20260720000100_anonymous_owner_claim.sql`의 owner auth wrapper와 `20260718001000_profile_reshare.sql`의 event 계약을 그대로 보존한다.
- [ ] 배열은 shared relationship registry 순서로 반환한다. `cards`는 현재 pack의 기존 카드/질문 registry 순서로 반환하며, 새로운 점수나 순위로 재정렬하지 않는다.
- [ ] 관계 `sightCount`는 해당 관계의 유효 완료 응답 수다. 1~2이면 `cards`는 반드시 빈 배열이며 관계명과 `n/3` 외의 질문 표본 및 A/B 수치를 API에서도 노출하지 않는다.
- [ ] 관계가 3명 이상일 때만 카드 목록을 반환한다. available layer는 top-level self-card 10장과 동일한 `cardId`를 동일 순서로 각각 정확히 한 번 반환한다. 카드 `sampleCount`는 해당 질문에 실제 제출된 유효 답변 수이고 관계 `sightCount` 이하이며, 0~2이면 `counts` key 자체를 생략한다. 3 이상이면 `counts.a + counts.b === sampleCount`인 `{a,b}`를 반환한다.
- [ ] top-level `cards`의 표시·self 필드는 배포 호환을 위해 유지하되 `sampleCount`·`counts`는 안전 projection으로 계산한다. 각 cardId마다 `status: "available"`인 관계의 `status: "available"` 카드만 합산한다. collecting 관계와 collecting 카드는 0건으로 취급하여 절대 기여시키지 않는다.
- [ ] 안전 projection에 기여하는 관계 카드가 없으면 top-level `sampleCount: 0`, `counts: null`이다. 하나 이상이면 공개 가능한 관계 카드들의 `sampleCount`, `counts.a`, `counts.b`를 각각 합산하므로 top-level `sampleCount`는 반드시 3 이상이고 `counts.a + counts.b === sampleCount`다. 서로 다른 숨은 관계의 2+1 또는 2+2 표본을 합쳐 threshold를 우회하지 않는다.
- [ ] 모든 방문자가 받는 Signature 질문도 같은 카드 규칙을 따르므로, 같은 관계의 유효 완료 응답이 3건이면 첫 공개 관계 인사이트가 될 수 있다.
- [ ] `known_since_code`는 기존 저장을 유지하지만 RPC의 교차 집계, 필터, payload에 추가하지 않는다.
- [ ] strict decoder는 exact key set과 다음 교차 불변식을 모두 검사한다: payload 전체에서 `relationshipCode`는 unique, `sum(relationshipLayers[*].sightCount) === profile.sightCount`, `sightCount === 0` iff `relationshipLayers`가 비고 `sightStatus === "empty"`, 각 관계 카드 `sampleCount <= layer.sightCount`.
- [ ] available layer의 cardId는 top-level 10장과 동일한 ID·순서이며 layer 내부에서 각각 한 번만 나와야 한다. 같은 cardId가 서로 다른 관계 layer에 반복되는 것은 정상이며 허용한다. collecting layer의 `cards`는 비어 있어야 한다.
- [ ] decoder는 relationship layer로부터 위 안전 projection을 다시 계산해 모든 top-level 카드의 `sampleCount`·`counts`와 정확히 일치하는지 교차 검증한다. 알 수 없는 key, registry 밖 code, 중복 관계, layer 내부 중복/누락/순서 오류 카드, 음수·비정수 count, status와 threshold 불일치, 합계 불일치, 숨은 count 노출, projection 불일치는 모두 fail-closed한다.
- [ ] `/api/me/profile`의 fresh auth, owner-only capability, 기존 exact HTTP status, `Cache-Control: private, no-store` 계약은 변경하지 않는다.

## 구현 계획

- [ ] `supabase/migrations/*owner_profile_relationship_layers*.sql`: `20260719000200_visitor_optional_answers.sql`의 required+optional 실제 답변 집계를 authoritative 본문으로 삼고, `20260720000100_anonymous_owner_claim.sql`의 owner auth wrapper를 보존해 관계 집계와 안전 projection payload를 추가한다. 기존 migration은 수정하지 않는다.
- [ ] `supabase/tests/owner_profile*.test.sql`: 0/1/2/3명, 관계 다중화, 질문 표본 0/1/2/3, required+optional 실제 답변, Signature, 철회·삭제·무효, 1:1 제외, 다른 play/version 격리, 숨은 관계 2+1·2+2의 top-level 0/null projection을 SQL 수준에서 고정한다.
- [ ] `lib/owner-profile/owner-profile.ts`, `lib/owner-profile/owner-profile-core.mjs`, `lib/owner-profile/owner-profile-client.ts`: payload 타입과 exact strict decoder를 위 discriminated union에 맞게 확장하고, `RELATIONSHIP_OPTIONS`를 재사용한 순서·label derive, 안전 projection 교차 검증, 결정적 초기 선택/표시 모델을 추가한다. 새 registry나 label 사본은 만들지 않는다.
- [ ] `app/api/me/profile/route.ts`: 구현은 수정하지 않는다. integration/E2E에서 기존 fresh auth, owner-only capability, exact status, `private, no-store`가 새 RPC payload에서도 유지되는지만 회귀 확인한다.
- [ ] `app/me/owner-profile-view.tsx`, `app/me/owner-profile.module.css`: 기존 `/me` 이동 경로와 셀프 답변 데이터를 재사용해 zero/collecting/available 모바일 UI와 접근 가능한 관계 선택기를 구현한다.
- [ ] `tests/unit/owner-profile*.test.mjs`: exact decoder 정상/거부 payload, registry 순서, threshold, 초기 관계/카드 선택과 안전 projection을 검증한다. 중복 relationshipCode, layer sightCount 합과 profile sightCount 불일치, card sample이 relation sight 초과, available layer의 카드 누락·중복·순서 오류, 숨은 count 노출, top-level projection 불일치 reject fixture를 각각 둔다. 관계 간 같은 cardId 반복은 accept fixture로 둔다.
- [ ] `tests/integration/owner-profile*.test.mjs`: owner capability/auth, 새 RPC payload, status와 `private, no-store`를 검증한다.
- [ ] `tests/e2e/owner-profile.spec.ts`: 0건, 2/3 관계 잠금, 복수 관계 전환, 공개 질문, 0/3·1/3·2/3 질문, 새로고침 결정성, 모바일 폭, 키보드/focus를 검증한다.
- [ ] `scripts/verify-owner-profile.mjs`: 새 migration, payload contract, 관련 unit/integration/E2E와 문서/목업 경계가 focused owner-profile 검증에 포함되도록 갱신한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/decision-log.md`, `docs/engineering/p0-development-plan.md`: owner 전용 관계 레이어의 P0 복귀, 표본 기준, 공개 프로필/PNG 분리를 기록한다.
- [ ] `docs/assets/mockups/owner-profile-relationship-layers-v1.png`: 확정 source를 동일 바이트로 복사하고 SHA-256이 `6521916f8b5c40fbf81b82374ffb326ece1c89b69abed7d804605c882c35264c`인지 검증한다.

## 완료 기준

- [ ] 공개 링크의 `submitted` 응답이 관계별로 분리되어 exact `relationshipLayers` payload로 반환된다.
- [ ] 1:1·draft·withdrawn·삭제·철회·invalid·다른 play/version 응답이 전체·관계·질문 집계에 섞이지 않는다.
- [ ] 관계 완료 응답 1~2명에서는 API의 `cards`가 비어 있고 UI에는 관계명과 `n/3`만 보인다.
- [ ] 관계 완료 응답 3명 이상에서만 관계 레이어가 열리며, 질문 `sampleCount` 0~2에서는 API에 `counts`가 없고 UI에도 A/B 수치가 없다.
- [ ] 질문 `sampleCount` 3 이상에서만 `{a,b}`를 반환·표시하며 `a + b === sampleCount`다.
- [ ] top-level 각 카드의 `sampleCount`·`counts`는 공개 가능한 관계 카드만 합산한 안전 projection과 정확히 일치하고, 값은 `0/null` 또는 `3 이상/{a,b}`다.
- [ ] 서로 다른 collecting 관계의 동일 카드 표본이 2+1 또는 2+2여도 top-level은 `sampleCount: 0`, `counts: null`이며 UI·API 어디에도 합산 수치가 노출되지 않는다.
- [ ] Signature 질문은 같은 관계 3명 완료 시 registry 순서에 따라 첫 대표 관계 인사이트가 될 수 있다.
- [ ] relationship code는 shared registry의 8개 값만 허용하고, 관계 label과 관계 순서는 같은 registry에서 derive한다.
- [ ] owner는 공개 가능·수집 중 관계를 선택기로 탐색할 수 있고 초기 관계와 카드 표시 순서는 새로고침 후에도 동일하다.
- [ ] `known_since_code`, 방문자 신원·개별 답변, 관계×기간 교차표, AI 요약·유형·점수·순위가 API와 UI에 없다.
- [ ] 기존 `/me` 허브, owner 답변, 공유 관리, #58 재공유, 로그인/권한 경계, 전체 `sightCount`, 셀프 카드 계약이 회귀하지 않는다.
- [ ] `sightCount === 0`/empty layers에서는 재공유 CTA가 없고, `sightCount > 0`에서는 기존 질문팩 `시선 더 모으기` CTA와 `profile_reshare_clicked` 계약이 유지된다.
- [ ] profile viewed analytics의 이벤트명, 발생 조건, 속성은 변경되지 않는다.
- [ ] 320/390/430px, 키보드, screen reader 선택 상태, `focus-visible`, 44px target, reduced-motion 검증을 통과한다.
- [ ] #147의 PNG 생성·다운로드·외부 공유 코드와 CTA가 포함되지 않는다.
- [ ] 관련 focused test와 `./scripts/run-ai-verify --mode full`이 동일 HEAD에서 통과한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] SQL: 관계 0/1/2/3명, 질문 표본 0/1/2/3, required+optional 실제 답변, 다중 관계, Signature, 철회·삭제·무효, 1:1 제외, 다른 play/version 격리, 숨은 관계 2+1·2+2의 top-level `0/null`
- [ ] Unit: exact decoder 허용/거부 행렬, 8개 code와 registry 순서, unique 관계, layer/profile sight 합, card/relation sight 상한, available layer 10장 ID·순서·유일성, 관계 간 cardId 반복 허용, threshold, 안전 projection 일치, 결정적 초기 관계와 카드 표시
- [ ] Integration: fresh owner auth/capability, 새 RPC payload, 기존 exact status, `Cache-Control: private, no-store`
- [ ] E2E: zero에서 CTA 없음, sightCount>0에서 기존 재공유 CTA 유지, 관계 2/3 잠금, 복수 관계 전환, available 대표 질문, collecting 질문 0/3·1/3·2/3, 새로고침, 320/390/430px, 키보드·screen reader 상태·focus
- [ ] 회귀: `pnpm test:owner-profile`, 관련 profile/share E2E, `node scripts/verify-owner-profile.mjs`
- [ ] 수동: 긴 한글 관계명·질문·선택지의 줄바꿈, 가로 overflow 없음, 44px target, reduced-motion, 관계 1~2명에서 DevTools 응답에도 카드/A/B count가 없는지 확인

## 분석과 관측성

- [ ] `20260718001000_profile_reshare.sql`의 `profile_viewed`와 `profile_reshare_clicked` 이벤트명, eligibility, 발생 조건과 속성을 그대로 유지한다. zero 상태에서 CTA를 렌더링하지 않을 뿐 event 함수나 조건은 바꾸지 않는다. 관계 선택, 관계 공개, 질문 공개에 대한 새 이벤트·속성·대시보드는 추가하지 않는다.
- [ ] API 로그에 relationship code, 집계 수치, 개별 응답 또는 payload를 새로 남기지 않는다. 기존 오류 로깅 범위만 유지한다.

## 개인정보와 악용 방지

- [ ] 화면과 API는 fresh auth를 통과한 해당 play owner에게만 제공하고 `private, no-store`를 유지한다.
- [ ] 공개 링크의 유효 `submitted` 응답만 익명 합계에 포함하며 1:1 응답과 개별 응답은 포함하지 않는다.
- [ ] 관계 표본 1~2명에서는 질문 목록·표본·A/B 수치를 모두 숨기고, 관계 3명 이상이어도 질문 표본 0~2이면 A/B 수치를 생략한다.
- [ ] 기존 top-level 카드도 같은 공개 경계를 우회하지 않는다. collecting 관계·카드는 안전 projection에 기여하지 않으며 여러 소표본을 합쳐 3을 만드는 것을 금지한다.
- [ ] threshold 위반 payload는 UI에서 부분 표시하지 않고 decoder에서 전체 fail-closed한다.
- [ ] `known_since_code`와 관계를 교차하지 않아 재식별 가능한 소표본을 만들지 않는다.
- [ ] 관계 label 외에 방문자 이름·사진·식별자·개별 답변을 반환하거나 노출하지 않으며, 민감한 관계 결과를 외부 공유하지 않는다.

## 롤아웃과 복구

- [ ] 기존 migration은 수정하지 않고 `20260719000200_visitor_optional_answers.sql` 본문과 `20260720000100_anonymous_owner_claim.sql` auth wrapper를 기준으로 한 새 forward-only migration에서 RPC를 갱신한다. 스키마/저장 데이터 변경이나 backfill은 없으며 `known_since_code` 저장도 그대로 둔다.
- [ ] 배포 전 SQL·focused 검증과 전체 검증을 통과시키고, 앱과 migration을 같은 릴리스 범위로 배포한다. 별도 feature flag는 추가하지 않는다.
- [ ] 배포 후 owner 계정으로 zero/collecting/available 응답, owner-only, `private, no-store`를 smoke check한다.
- [ ] 문제가 생기면 destructive down migration이나 데이터 삭제를 하지 않는다. 앱을 이전 동작으로 복구하고, 필요하면 직전 `get_owner_profile` 계약을 복원하는 새 forward-only 교정 migration을 배포한다.
- [ ] 개인정보 임계값 위반이 확인되면 관계 레이어 렌더링을 중지하고 교정 migration을 우선 배포한다. 기존 전체 집계와 저장 응답은 삭제하지 않는다.

## 스펙 검토

Reviewer Agent: critic:/root/issue_146_spec_critic
Review Status: PASS
P0/P1 Findings: 0

- critic P0 해소: hidden 관계/카드 표본이 기존 top-level 합계로 새는 경로를 안전 projection과 decoder 교차 검증으로 차단했다.
- critic P1 해소: zero 상태 CTA, authoritative RPC/auth/event migration 계보, 관계·카드·합계 decoder 불변식과 reject fixture를 확정했다.
- critic P2 해소: `app/api/me/profile/route.ts`를 수정 의무에서 제외하고, 승인 목업 source·target·SHA-256을 고정했다.
- Missing references 해소: relationship registry, 세 migration, owner-profile 타입/decoder/client, 검증 스크립트와 목업 경로를 파일 단위로 명시했다.

## 리스크와 미결정 사항

- [ ] 구현 블로커는 없다.
- [ ] RPC 갱신 시 기존 strict decoder와 배포 순서가 어긋나면 owner profile이 fail-closed할 수 있으므로 앱과 migration을 같은 릴리스 범위에서 검증·배포해야 한다.
- [ ] 관계 3명 이상의 카드 목록에 0표본 항목까지 포함하므로 payload가 늘지만, 현재 질문팩 크기 안에서만 반환하고 pagination·새 캐시는 추가하지 않는다.
- [ ] 제품·개인정보·API 계약의 미결정 사항은 없다.
