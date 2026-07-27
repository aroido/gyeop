# Issue 166 구현 스펙: 지인 임계값 전 self-first 3축 프로필 공유 허용

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/166

## 목표

concept-mapped 질문팩을 완료한 owner가 settled self 근거와 유효한 `profileSourcePlayId`를 가진 결을 세 개 이상 보유하면 지인 응답이 0/1/2명이어도 `/me`의 self-first 3축 결과와 `내 겹 공유하기`를 즉시 사용하고, 지인 위치·방향·범위만 기존 개인정보 임계값 뒤에 열리게 한다.

## 범위

- [ ] 기존 concept 후보의 `rankCandidate` 순서와 서로 다른 `areaId` 우선 규칙을 그대로 사용해 대표 결을 첫 축에 고정한 정확히 3축 번들을 만든다. 서로 다른 영역이 세 개 미만일 때만 영역 중복을 허용하고 concept 중복은 허용하지 않으며 별도 self-only rank/source 알고리즘을 만들지 않는다.
- [ ] 기존 `ConceptHook.shareEligible` 하나만 self가 `available`이고 direction이 `a|b`이며 유효한 `profileSourcePlayId`를 가진 결이라는 의미로 재정의·확장한다. `shareSafeOthers`, `shareEvidence`, 지인 stage는 번들 생성과 CTA 노출의 선행 조건으로 사용하지 않는다.
- [ ] 기존 `ConceptShareOption.sourcePlayId` 필드를 유지하되 값을 대표 결의 `profileSourcePlayId`로 정한다. 선택한 대표 결의 source pack으로 기존 공개 초대와 수신자의 `나도 이 팩으로 시작하기`를 이어 간다.
- [ ] 기존 `shareEvidence`와 `shareSourcePlayId|shareSourcePackSlug|shareSourcePackTitle`의 schema, 생성 규칙, strict decoder는 변경하지 않는다. 3축 `others`만 `shareEvidence`를 거치지 않고 현재 snapshot의 `shareSafeOthers`를 직접 투영한다.
- [ ] 각 3축의 `others`를 exact `locked|available` union으로 표현한다. locked는 `{ status: "locked", sightCount: 0|1|2 }`만 허용하고, available은 기존 `shareSafeOthers`의 익명 direction/stage/position에서 파생한 marker/band/split/neutral 표현을 유지한다.
- [ ] 축의 `cardCount`는 지인 상태와 무관하게 해당 결의 self 고유 문항 수인 `self.evidence.cardCount`를 사용한다. 같은 evidence snapshot 안에서는 self position과 cardCount를 그대로 투영하되, threshold가 바뀐 다음 snapshot은 기존 전체 후보 rank와 area diversity를 다시 계산하므로 option 구성·순서·`sourcePlayId` 동일성을 보장하지 않는다.
- [ ] `/me`에서 지인 0/1/2 fixture에도 기존 대표 결 3개와 `내 겹 공유하기` 단일 CTA 및 picker를 표시한다. settled self 후보가 세 개 미만이거나 concept 결과가 없을 때만 기존 `시선 더 모으기`/비개념 fallback을 유지한다.
- [ ] 공유 미리보기와 1080×1920 PNG는 기존 파랑·라임·코랄·검정 hard-offset 3축 카드, 양쪽 endpoint, `● 나 / ○ 지인` 범례를 재사용한다.
- [ ] locked 축은 self marker와 `○ 지인 · 시선을 모으는 중 · n/3`만 렌더한다. available 축은 `trace=wide`를 포함한 기존 익명 marker와 stage band를 표시하고, contextual은 중앙 marker 없는 split, unsettled은 marker 없는 neutral 상태로 표시한다.
- [ ] 기존 Web Share, PNG 저장, 링크 복사, 파일 공유 미지원·취소·`NotAllowedError`·Canvas 실패 복구, 생성 링크 보존, dialog/fallback 후 focus 복귀를 회귀시키지 않는다.
- [ ] owner 인증, `Cache-Control: private, no-store`, feature flag, strict decoder, analytics idempotency, same-pack CTA와 기존 relationship 공유 경계를 유지한다. 새 raw event/payload는 만들지 않고 기존 canonical event에서 계산되는 derived funnel만 회귀 검증한다.
- [ ] 제품 SSOT, focused unit/E2E/Canvas 테스트, 독립 QA verdict와 모바일·접근성 검수 이미지를 같은 구현 PR에서 갱신한다.

## 제외 범위

- [ ] 새 DB 테이블·컬럼·RPC·migration·저장 형식·외부 의존성·API route를 추가하지 않는다.
- [ ] concept catalog, 질문팩 문항·signal·context, stage 기준, direction 계산, kind 우선순위, stable rank 또는 영역 다양성 알고리즘을 변경하지 않는다.
- [ ] threshold 전후 option identity를 고정하는 별도 self-only rank, source 선택, 캐시 또는 snapshot persistence를 추가하지 않는다.
- [ ] `privateOthers`와 `shareSafeOthers`의 관계·질문 개인정보 임계값, romantic/1:1 제외, collecting `sightCount`의 play 간 비합산 규칙을 완화하지 않는다.
- [ ] 공개 프로필, 방문자별 위치·답변, 응답자 목록·신원, 관계 원자료, 점수·백분율·고정 유형·AI 해석문을 추가하지 않는다.
- [ ] 기존 relationship 공유 카드, 공개·1:1 링크 정책, 카드 편집기·테마 picker·animation을 변경하지 않는다.
- [ ] self direction이 `contextual|unsettled`인 결을 하나의 self marker로 꾸미거나 settled 후보가 세 개 미만인 번들을 임의 축으로 채우지 않는다.

## SSOT

- GitHub issue #166과 선행 완료 issue #161, #162
- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/product/concept-graph-design.md
- docs/engineering/core-funnel-events.md
- content/concepts-v1.json
- lib/concepts/catalog-core.mjs
- lib/owner-profile/concept-profile-core.mjs
- lib/owner-profile/concept-profile-client.ts
- lib/owner-profile/profile-share-card-core.mjs
- lib/share-links/share-link-client.ts
- lib/http/auth-owner.ts
- app/api/me/concept-profile/route.ts
- app/i/[publicId]/invite-entry.tsx
- app/api/responses/[id]/events/route.ts
- app/api/me/plays/[playId]/share-events/route.ts
- tests/e2e/owner-play-live.spec.ts
- AGENTS.md

## 사용자 흐름 영향

- [ ] owner는 concept 결과가 있고 settled self 후보가 세 개 이상이면 지인 응답 수와 무관하게 `/me`에서 대표 결 3개 다음의 `내 겹 공유하기`를 누른다.
- [ ] picker는 기존 `영역 · A—B` option을 stable rank로 보여 주며, 선택한 결을 첫 축으로 고정한 뒤 기존 영역 다양성 규칙으로 두 축을 더 고른다.
- [ ] 확정 시 대표 결의 `profileSourcePlayId`로 기존 `profile_reshare_clicked`를 기록하고 `/me/plays/[playId]?entry_source=profile_reshare&share_concept=...` 관리 화면으로 이동한다.
- [ ] 지인이 0/1/2명이면 주인은 현재 snapshot의 각 축에서 내 위치와 `○ 지인 · 시선을 모으는 중 · n/3`만 본다. 지인 임계값을 통과한 다음 snapshot은 후보를 다시 계산하고, 그 snapshot에 선택된 available 축에 기존 익명 위치·stage 표현을 연다.
- [ ] picker와 관리 화면 사이에 evidence가 바뀌면 관리 화면 server가 owner profile을 다시 만들고 현재 `shareConcept + sourcePlayId` option과 일치하지 않는 이전 URL을 404로 닫는다. client는 번들을 재구성하거나 이전 option을 복원하지 않는다.
- [ ] 공유 카드 수신자는 대표 축 source pack의 기존 공개 초대 URL로 들어가 `나도 이 팩으로 시작하기`를 통해 같은 canonical 팩의 owner 흐름을 시작한다.
- [ ] self 후보가 세 개 미만이거나 concept 결과가 없으면 부분 1~2축 카드를 만들지 않고 기존 `시선 더 모으기`, 질문팩 관리 또는 비개념 `/me` fallback을 사용한다.

## 디자인 영향

- [ ] `/me`의 대표 카드 3개, 8개 area rail, picker, 44×44px control, 현재 focus/reduced-motion 동작은 유지하고 CTA eligibility 문구만 self-first 계약에 맞춘다.
- [ ] 미리보기와 PNG는 기존 3색 hard-offset stack, 닉네임, `● 나 / ○ 지인`, 정확히 3개의 area/concept/endpoints/self marker/self 고유 문항 수를 같은 순서로 표시한다.
- [ ] locked 축의 track에는 others marker, band, split, neutral 좌표를 그리지 않는다. track의 self marker와 별도 상태 문구 `○ 지인 · 시선을 모으는 중 · n/3`만 표시한다.
- [ ] locked 축의 DOM·접근성 읽기 순서는 `area/concept → endpoints → 내 위치 → 지인 수집 상태 → 고유 문항 수`다. 지인 상태의 `aria-label`, hidden text, `data-*`, inline style에는 위치·방향·범위 표현을 넣지 않는다.
- [ ] available `a|b`는 stage의 `trace|outline|clear`를 각각 `wide|medium|narrow` 익명 band와 marker로, contextual은 `split`, unsettled은 `neutral`로 표시한다. 이 표현은 확률·신뢰구간·점수가 아니다.
- [ ] Canvas도 available `trace`의 `wide` band를 DOM 미리보기와 같은 의미로 그리며, locked 축에서는 others 좌표 draw를 실행하지 않는다.
- [ ] 320×568, 390×844, 430×932와 200% 확대에서 endpoint·수집 문구·CTA가 잘리거나 가로로 넘치지 않고, 색상 없이도 self와 locked/available others 상태를 구별할 수 있어야 한다.
- [ ] `prefers-reduced-motion: reduce`에서는 새 이동·전환을 추가하지 않고 최종 상태만 표시한다.

## API와 데이터 영향

- [ ] `ConceptProfile` top-level `{ modelVersion, hooks, shareOptions, areaSummaries }`, owner-only route, `GYEOP_CONCEPT_PROFILE_ENABLED`, `Cache-Control: private, no-store`를 유지한다.
- [ ] `ConceptHook.shareEligible`은 기존 필드명을 유지하되 `self.status === "available"`, `self.direction === "a"|"b"`, 유효한 `profileSourcePlayId`를 뜻하는 self-first eligibility로 재정의·확장한다. 이것만 의미가 바뀌며 `shareSafeOthers`/`shareEvidence`는 기존 개인정보-safe 지인 상태를 나타내되 eligibility를 막지 않는다.
- [ ] `ConceptShareOption` exact keys `{ conceptId, sourcePlayId, bundle }`를 유지한다. `sourcePlayId`는 해당 대표 결의 `profileSourcePlayId`와 같아야 하고, owner profile evidence에 실제 포함된 소유 play여야 한다.
- [ ] `shareEvidence`와 `shareSourcePlayId|shareSourcePackSlug|shareSourcePackTitle`의 exact keys, available/unavailable 판정, copy, source pack 검증과 null 규칙은 기존 #162 계약을 그대로 유지한다. share option eligibility와 axis `others` 검증에만 이 필드들을 사용하지 않는다.
- [ ] `ConceptProfileShareCardModel` top-level exact keys `{ nickname, axes }`와 axes 길이 3을 유지한다. axis exact keys는 `{ areaLabel, conceptLabel, directionA, directionB, selfPosition, others, cardCount }`다.
- [ ] locked `others` exact keys는 `{ status: "locked", sightCount }`이며 `sightCount`는 정수 0/1/2다. `source`, `direction`, `stage`, `position`, `range`, `evidence`, 좌표 별칭과 extra key를 모두 거부한다.
- [ ] available settled `others` exact keys는 `{ status: "available", source: "shareSafeOthers", direction: "a"|"b", stage: "trace"|"outline"|"clear", position, range }`다. `range`는 `trace=wide`, `outline=medium`, `clear=narrow`만 허용하고 direction과 `position` 부호가 일치해야 한다.
- [ ] available contextual `others` exact keys는 `{ status: "available", source: "shareSafeOthers", direction: "contextual", stage: "outline"|"clear", range: "split" }`이며 position을 허용하지 않는다.
- [ ] available unsettled `others` exact keys는 `{ status: "available", source: "shareSafeOthers", direction: "unsettled", stage: "trace"|"outline"|"clear", range: "neutral" }`이며 position을 허용하지 않는다.
- [ ] `selfPosition`은 기존 public position 축 `[-1, 1]`과 `a<=-0.25`, `b>=0.25`를 유지한다. `cardCount`는 `self.evidence.cardCount`와 일치하는 양의 안전한 정수여야 한다.
- [ ] `buildConceptShareBundle`은 각 현재 evidence snapshot에서 기존 stable rank 입력 순서, representative-first, 최대 distinct-area 규칙을 그대로 사용한다. server builder와 `decodeConceptProfile`은 그 snapshot의 self-first eligible 전체 universe를 기준으로 exact 3축, concept 중복 금지, 대표 축 첫 번째, 가능한 area 다양성을 재검증한다.
- [ ] `buildConceptProfile`의 server rebuild가 option 구성과 source ownership의 권위자다. `app/me/plays/[playId]/page.tsx`는 owner auth 뒤 현재 rebuild 결과의 `shareConcept + option.sourcePlayId === playId`만 카드로 조립하고 불일치는 404로 닫는다.
- [ ] standalone share-card decoder는 catalog label/endpoints, exact keys, nickname, self position, locked/available union, stage/range, cardCount와 중복 concept를 fail-closed로 검증한다.
- [ ] owner API나 공개 초대 URL에 raw score, 응답자 ID, 개별 답변·위치, relationship code, 내부 evidence 전체를 새로 직렬화하지 않는다. DB와 public invite/one-to-one token은 변하지 않는다.

## 구현 계획

- [ ] `lib/owner-profile/concept-profile-core.mjs`: 기존 candidate/rank/bundle/profile source 함수를 그대로 재사용하고 `shareEligible`만 self-first로 재정의한다. `shareOptions.sourcePlayId`는 현재 candidate의 `profileSourcePlayId`, axis `cardCount`는 self evidence를 사용하며 locked/available `shareSafeOthers`를 `shareEvidence` 없이 strict share axis로 직접 투영한다. `shareEvidence`와 `shareSource*` 생성·decoder는 변경하지 않는다.
- [ ] `lib/owner-profile/concept-profile.ts`, `lib/owner-profile/owner-profile.ts`: `ConceptProfileShareOthers`를 locked/available exact union으로 바꾸고 기존 profile/share option 필드명은 유지한다.
- [ ] `lib/owner-profile/profile-share-card-core.mjs`: locked exact keys와 available settled/contextual/unsettled variant를 검증하고 private 위치 키·extra key·stage/range 불일치를 거부한다. 기존 relationship decoder는 변경하지 않는다.
- [ ] `app/me/account-profile-view.tsx`: 지인 threshold가 아니라 self-first `shareOptions` 존재 여부로 CTA/picker를 표시한다. 기존 dialog, 중복 클릭 guard, 오류 문구, focus 복귀와 `profile_reshare_clicked` 호출을 재사용한다.
- [ ] `app/me/plays/[playId]/page.tsx`: owner auth 뒤 server가 현재 profile을 rebuild하는 경계를 source ownership의 권위자로 유지한다. 현재 `shareConcept + sourcePlayId` option만 nickname과 카드로 조립하고 threshold/rank drift로 사라진 이전 selection과 위조는 404로 닫는다.
- [ ] `app/me/plays/[playId]/profile-share-card.tsx`: preview와 Canvas의 axis loop에 locked 분기와 available `trace=wide`, `unsettled=neutral`을 추가한다. locked에서는 self marker와 수집 문구만, available에서는 marker/band/split/neutral만 그린다.
- [ ] `app/me/plays/[playId]/profile-share-card.module.css`: locked 수집 문구, `wide|neutral` 상태와 320/390/430px·200% 확대 스타일만 현재 토큰 안에서 최소 추가한다.
- [ ] `app/me/plays/[playId]/share-link-manager.tsx`, `app/i/[publicId]/invite-entry.tsx`, 공유·visitor event route는 변경하지 않고 기존 공개 링크 생성, Web Share/저장/복사 fallback, same-pack CTA와 analytics 회귀 테스트의 근거로 사용한다.
- [ ] `tests/unit/concept-profile.test.mjs`: 지인 0/1/2 각각의 현재 snapshot에서 self eligible option과 정확히 3축이 생기고 source가 해당 candidate의 `profileSourcePlayId`인 경우, 기존 stable rank/area diversity 재계산, 같은 snapshot의 self position/cardCount 투영, self 후보 0~2 fallback을 검증한다. threshold 간 option identity/order/source 동일성은 비교하지 않는다.
- [ ] `tests/unit/profile-share-card.test.mjs`: locked 0/1/2와 available settled/contextual/unsettled exact union, `wide|medium|narrow|split|neutral`, locked 위치 키 혼입, catalog·position·cardCount·duplicate/extra key 거부를 검증하고 relationship fixture를 보존한다.
- [ ] `tests/unit/concept-profile-client.test.mjs`: owner-only strict decoder와 private `no-store` 응답, invalid locked payload의 fail-closed를 확인한다.
- [ ] `tests/e2e/concept-profile-live.spec.ts`: 지인 0/1/2 각각 `/me` 3개 hook·공유 CTA·picker·preview를 확인하고 대표 locked fixture에서 DOM/접근성 비노출과 1080×1920 PNG, 3명 snapshot에서 available 익명 표현을 검증한다.
- [ ] `tests/e2e/share-links.spec.ts`: 실제 preview/Canvas에서 locked others 좌표 draw가 없고 수집 문구만 있는지, available 기존 렌더, Web Share/`NotAllowedError`/저장/복사/focus 복구, same-pack source를 검증한다.
- [ ] `tests/e2e/owner-play-live.spec.ts`: 대표 `profileSourcePlayId`의 canonical pack으로 기존 same-pack click/open과 derived `visitor_same_pack` funnel이 이어지는지 회귀 검증한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/concept-graph-design.md`: self 결과와 카드 공유는 즉시 열고 지인 위치·방향·범위만 임계값으로 잠그는 활성 계약과 fallback을 반영한다.
- [ ] `docs/product/decision-log.md`: #162의 others-first eligibility를 대체하는 self-first 공유 결정, 이유, 개인정보 경계와 새 DB 없음 결론을 기록한다.
- [ ] `docs/temp/qa/issue-166.md`와 `docs/temp/qa/issue-166/*.png`: 독립 verifier가 P0/P1/P2 판정, 명령, viewport·접근성·locked/available·share 증거를 기록한다.

## 완료 기준

- [ ] settled self 후보가 세 개 이상이면 지인 0/1/2명 각각에서 `/me` 대표 결 3개, `내 겹 공유하기`, picker와 정확히 3축의 미리보기/PNG가 보인다.
- [ ] self 후보가 세 개 미만이거나 concept 결과가 없으면 부분 축을 만들지 않고 기존 `시선 더 모으기` 또는 비개념 fallback이 보인다.
- [ ] 각 option은 선택 concept를 첫 축에 두고 stable rank와 가능한 최대 영역 다양성을 보존하며 `sourcePlayId === 대표 결.profileSourcePlayId`다.
- [ ] locked axis 모델의 `others`에는 `status`와 `sightCount` 외 키가 없고 API JSON, client state, DOM, hidden/접근성 text, `aria-*`, `data-*`, inline style, Canvas draw/copy 어디에도 지인 위치·방향·범위가 없다.
- [ ] locked preview와 PNG는 self marker와 `○ 지인 · 시선을 모으는 중 · n/3`만 표시하고, legend의 `○ 지인`을 track 위치 marker로 오해시키는 표현을 만들지 않는다.
- [ ] 현재 snapshot에서 임계값을 통과한 available 축은 기존 `shareSafeOthers`의 익명 settled marker/band, contextual split 또는 unsettled neutral을 표시하고 개인·관계 원자료를 노출하지 않는다.
- [ ] 각 snapshot은 기존 candidate rank와 area diversity를 다시 계산한다. 같은 snapshot의 axis는 candidate self position과 self 고유 문항 수를 그대로 쓰지만 threshold 전후 concept 구성·순서·`sourcePlayId` 동일성은 완료 조건이 아니다.
- [ ] 미리보기와 다운로드 PNG가 동일한 세 축·locked/available 상태를 표시하며 PNG 크기가 정확히 1080×1920이다.
- [ ] 대표 축 source pack 공개 초대 생성과 수신자 `나도 이 팩으로 시작하기`가 기존 canonical template id+slug로 이어진다.
- [ ] Web Share 성공, 파일 미지원, 취소, `NotAllowedError`, Canvas/font/toBlob 실패에서 기존 링크 보존, 이미지 저장·링크 복사, 사용자 상태 문구와 focus 복귀가 동작한다.
- [ ] `profile_reshare_clicked`, `profile_share_succeeded`, `same_pack_start_clicked`, `new_owner_pack_opened`의 기존 raw 발생·idempotency 경계가 유지되고 새 event/payload를 만들지 않는다. `profile_reshare`, `visitor_same_pack` derived funnel은 `docs/engineering/core-funnel-events.md`의 기존 subject/order 규칙으로 별도 회귀 검증한다.
- [ ] owner session 없는 concept API는 401이고 owner 응답과 오류 응답은 `Cache-Control: private, no-store`를 유지한다. 위조된 concept/source play, mixed legacy query와 invalid model은 404 또는 strict decoder 실패로 닫힌다.
- [ ] 320/390/430px, 200% 확대, 키보드, focus-visible/복귀, screen reader 읽기 순서, 색상 비의존, reduced motion 검증이 통과한다.
- [ ] 제품 SSOT 세 문서가 같은 계약으로 갱신되고 새 DB/migration/dependency 없이 focused 검증, `./scripts/run-ai-verify --mode full`, 동일 HEAD 필수 CI가 통과한다.

## 테스트 계획

- [ ] Unit: `node --test tests/unit/concept-profile.test.mjs tests/unit/profile-share-card.test.mjs tests/unit/concept-profile-client.test.mjs`
- [ ] Integration: owner auth/no-store, feature flag on/off, self source option 재검증, invalid/mixed query 404, 기존 relationship share를 확인한다.
- [ ] E2E: live fixture에서 지인 0/1/2 각각 `/me → picker → representative-first preview`를 자동화하고, 대표 locked fixture는 PNG 저장/복사까지, 3명 fixture는 현재 snapshot의 available 표현과 same-pack CTA까지 확인한다.
- [ ] Failure E2E: Web Share 미지원·취소·`NotAllowedError`, `navigator.canShare` false, `document.fonts.ready`, Canvas context/toBlob 실패에서 생성 링크와 복구 action·focus를 확인한다.
- [ ] Privacy inspection: owner concept API JSON과 serialized client model의 locked exact keys를 확인하고, 미리보기 subtree의 text/attribute/style 및 Canvas harness draw/text에서 others 위치·방향·범위 신호가 없는지 검사한다.
- [ ] Viewport: 320×568, 390×844, 430×932에서 44×44px target, 가로 넘침, endpoint/수집 문구/legend 잘림, sticky/fixed 겹침을 확인한다.
- [ ] Accessibility: 200% 확대, Tab/Shift+Tab/Enter/Space/Escape, dialog와 fallback 후 focus 복귀, `닉네임→범례→축별 endpoint/self/locked 또는 available others/cardCount→CTA` 순서, 색상 비의존과 reduced motion을 확인한다.
- [ ] Visual QA: 자동화된 0/1/2 검증과 별도로 대표 `locked.png`, `available.png`, `min-viewport.png`, `zoom-200.png`만 남겨 locked/available 의미, 최소 viewport와 확대 상태를 확인한다.
- [ ] Full: clean HEAD에서 harness PR gate가 `./scripts/run-ai-verify --mode full`을 한 번 실행하고 동일 SHA의 필수 CI와 named `verify`를 확인한다.

## 분석과 관측성

- [ ] picker 열기만으로 event를 기록하지 않고, 공유 내용을 확정할 때 대표 결의 `profileSourcePlayId`로 기존 `profile_reshare_clicked`를 owner play별 한 번 기록한다.
- [ ] canonical public link가 준비된 공유 성공은 기존 `profile_share_succeeded`, 수신자 CTA는 response별 `same_pack_start_clicked`, 실제 새 owner 생성은 canonical template id+slug의 `new_owner_pack_opened` raw 경계를 유지한다.
- [ ] 새 raw event·property·payload는 추가하지 않는다. `profile_reshare`와 `visitor_same_pack` derived funnel은 `docs/engineering/core-funnel-events.md`의 canonical subject와 ordered stage 규칙으로 검증하며 raw event 성공과 derived funnel 성공을 같은 주장으로 합치지 않는다.
- [ ] 지인 locked/available 상태, `sightCount`, 위치, 모델 또는 응답 내용을 새 analytics property·로그·대시보드에 추가하지 않는다.
- [ ] decoder/Canvas 실패는 민감 payload를 기록하지 않고 기존 사용자 복구 문구와 오류 경계를 재사용한다.

## 개인정보와 악용 방지

- [ ] owner auth 뒤에서만 profile과 3축 번들을 만들고, owner profile payload나 3축 모델을 공개 초대 URL에 직렬화하지 않는다.
- [ ] locked `shareSafeOthers`는 0/1/2 중 기존 최대 단일 collecting `sightCount`만 사용한다. 여러 play·관계의 소표본을 합쳐 3으로 만들거나 위치를 우회 추론하지 않는다.
- [ ] locked union은 exact-key decoder로 위치·방향·stage·range·evidence 혼입을 거부하고 UI가 CSS로 숨기는 방식 대신 해당 값을 아예 받지 않게 한다.
- [ ] available은 기존 non-romantic 공개 관계의 threshold-safe aggregate만 사용한다. `privateOthers`, romantic, 1:1, 응답자 ID·이름, 개별 응답·좌표, raw score와 관계별 원자료를 섞지 않는다.
- [ ] 닉네임 외의 사람 식별값, 관리 URL, secret, 내부 ID를 카드 모델·DOM·PNG에 넣지 않고 기존 닉네임 정규화·길이 제한을 유지한다.
- [ ] 점수·퍼센트·통계적 신뢰도·진단·고정 유형으로 익명 band와 concept 결과를 과장하지 않는다.

## 롤아웃과 복구

- [ ] 기존 `GYEOP_CONCEPT_PROFILE_ENABLED` flag 안에서 server builder, strict decoder, `/me`, preview/Canvas를 같은 PR로 배포해 계약 불일치 시간을 만들지 않는다.
- [ ] feature flag가 꺼지거나 concept 결과/self 후보가 부족하면 기존 비개념 `/me`와 relationship 공유로 fail-closed 한다.
- [ ] DB 변화가 없으므로 데이터 rollback은 없다. 회귀 시 flag를 끄거나 #166 구현 PR만 되돌리면 #162의 threshold-safe 3축 eligibility와 기존 fallback으로 복구된다.
- [ ] 배포 후 정확한 merge SHA가 Render에서 live인지 확인하고 `/`, `/me`, unauth concept API 401/no-store, owner locked 0/1/2 공유, available 3+, same-pack CTA와 legacy relationship query를 smoke test한다.

## 스펙 검토

Reviewer Agent: issue_166_critic
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 외부 제품 블로커는 없다. #161/#162의 stable rank, `profileSourcePlayId`, owner auth/no-store, public invite와 analytics 계약을 그대로 재사용하는 것이 구현 전제다.
- [ ] available `trace|outline|clear`와 `unsettled` 표현은 #161의 기존 `wide|medium|narrow|neutral` 의미를 공개 카드에 재사용하며, Canvas `wide` 추가에도 통계 의미나 새 threshold를 만들지 않는다.
- [ ] `shareEligible`만 self-first로 재정의·확장한다. 기존 `shareEvidence`/`shareSource*` 이름과 의미가 남아 있어도 병렬 모델이나 별칭을 추가하지 않고, axis는 `shareSafeOthers`를 직접 투영한다.
- [ ] picker 이후 evidence drift로 current server rebuild의 option이 달라지면 이전 관리 URL이 404가 될 수 있다. 이는 threshold 간 동일성을 위한 캐시를 추가하지 않는 fail-closed 복구 경계이며 owner는 `/me`에서 현재 option을 다시 선택한다.
