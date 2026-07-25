# Issue 162 구현 스펙: [P0] 상위개념 3축 프로필 공유 카드와 같은 팩 CTA 구현

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/162

## 목표

`/me`에서 주인이 privacy-safe 상위개념 하나를 고르면 서로 다른 영역을 우선한 정확히 3축의 양방향 프로필 공유 카드가 만들어지고, 기존 공유·저장·복사 복구와 대표 축의 같은 팩 참여 CTA까지 한 흐름으로 이어지게 한다.

## 범위

- [ ] #161의 owner-only `ConceptProfile`과 기존 집계를 재사용해 선택한 공유 가능 결을 첫 축으로, 다른 `shareEligible` 결 최대 2개를 보조 축으로 고정한 공유 번들을 만든다.
- [ ] 번들은 정확히 3개의 서로 다른 `concept`를 요구하고, 가능한 경우 세 축 모두 서로 다른 `area`를 선택한다. 서로 다른 영역이 3개 미만일 때만 같은 영역을 허용한다.
- [ ] 세 축 모두 `shareEvidence.status === "available"`, `shareSafeOthers.status === "available"`, others stage `outline|clear`, others direction `a|b|contextual`을 만족해야 한다. `self`는 available이면서 direction `a|b`인 축만 허용하고 self `contextual|unsettled`은 정확한 한 위치로 표현하지 않고 공유 후보에서 제외한다. 하나라도 부족하면 새 상위개념 공유 카드를 만들지 않는다.
- [ ] 3축 전용 `ConceptProfileShareCardModel`과 strict decoder를 만들고 기존 관계별 `RelationshipProfileShareCardModel` 경로는 분리해 보존한다.
- [ ] `/me` 공유 picker에는 `영역 · A—B` 레이블을 사용하고 주인이 고른 대표 축을 항상 첫 축으로 유지한다.
- [ ] 관리 화면의 공유 미리보기와 1080×1920 PNG를 같은 3축 정보·GYEOP 팔레트·hard-offset 카드 스타일로 렌더한다.
- [ ] 미리보기와 PNG에는 닉네임, `● 나 / ○ 지인` 범례, 세 축의 영역/개념, 양쪽 endpoint, 내 위치, 지인 익명 집계의 단계 기반 범위, 축별 고유 문항 수만 표시한다.
- [ ] 기존 Web Share, PNG 다운로드, 링크 복사, OS 미지원·취소·`NotAllowedError` 실패 복구, 생성 링크 보존, focus 복귀, 44px target을 그대로 사용한다.
- [ ] 대표 축의 기존 `sourcePlayId`를 same-pack CTA에 재사용하고 공개·1:1 링크 정책과 pack identity를 변경하지 않는다.
- [ ] `profile_reshare_clicked`, 공유 성공, same-pack 전환 이벤트를 기존 경계에서 한 번만 기록한다.
- [ ] 제품 결정 문서, focused unit/integration/E2E/Canvas 테스트, 독립 QA verdict와 9:16 검수 이미지를 같은 PR에 포함한다.

## 제외 범위

- [ ] 상위개념 계산식, catalog, 질문팩 문항·signal·context, #161 대표 hook 선정 규칙을 변경하지 않는다.
- [ ] DB, migration, RPC, analytics schema, 새 API route, 새 dependency를 추가하지 않는다.
- [ ] 공개 프로필, 사용자 검색, 랭킹, 방문자별 답변·개별 위치·응답자 목록을 만들지 않는다.
- [ ] 기존 팩별 관계 공유 카드의 모델, 미리보기, PNG, 공개·1:1 링크 정책을 바꾸지 않는다.
- [ ] 공유 카드 편집기, 스티커, 템플릿 picker, 팩 완료 분배 animation을 만들지 않는다.
- [ ] 목업 파일을 수정·재생성하거나 사용자의 별도 concept graph 초안을 이 PR에 흡수하지 않는다.

## SSOT

- GitHub issue #162와 선행 완료 issue #161
- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/concept-graph-design.md
- docs/product/decision-log.md
- docs/design/mockups/concept-profile-v2/29-app-style-precision-growth.png
- lib/concepts/catalog-core.mjs
- lib/share-links/share-link-client.ts
- app/i/[publicId]/invite-entry.tsx
- app/api/responses/[id]/events/route.ts
- app/api/me/plays/[playId]/share-events/route.ts
- AGENTS.md

## 사용자 흐름 영향

- [ ] 공유 가능한 결이 세 개 이상인 주인은 `/me` 결과 바로 다음의 단일 공유 CTA를 눌러 picker를 열고 `영역 · A—B` 중 대표 축 하나를 고른다.
- [ ] 선택을 확정하면 기존 `profile_reshare_clicked` 기록 후 대표 축의 `sourcePlayId` 관리 화면으로 이동하고, server가 선택 축을 첫 번째로 둔 정확히 3축 번들을 재검증해 미리보기를 보여 준다.
- [ ] 주인은 기존 primary action으로 OS 공유를 시도한다. 파일 공유 미지원·취소·권한 거절·PNG 생성 실패에서는 기존 이미지 저장·링크 복사 복구가 보이고 생성된 링크는 사라지지 않는다.
- [ ] 공유 카드 수신자는 카드에 포함된 원래 공개 초대 링크로 같은 팩 참여를 시작한다. owner-only 프로필 API나 내부 축 payload를 공개 URL로 제공하지 않는다.
- [ ] 공유 가능한 결이 0~2개면 `/me`는 새 concept picker/카드를 열지 않고 `시선 더 모으기`를 보여 준다. 기존 팩별 관계 공유는 계속 사용할 수 있다.

## 디자인 영향

- [ ] `/me` picker option은 개념 해석문 대신 `areaLabel · directionA—directionB`만 읽고, 선택·취소·확정 버튼은 320px에서도 최소 44×44px이다.
- [ ] 미리보기는 결과 우선으로 `닉네임의 겹`과 `● 나 / ○ 지인` 범례를 먼저 보이고, blue/yellow/red 세 축을 hard-offset stack으로 배치한다.
- [ ] 각 축은 area·고유 문항 수 pill, concept label, 양쪽 endpoint, self marker, share-safe others range를 색상 외 모양·텍스트·DOM 읽기 순서로 구별한다.
- [ ] `outline`과 `clear`의 익명 range 폭은 통계 신뢰구간이 아닌 기존 stage 시각 표현이다. `contextual`은 중앙점이 없는 양쪽 split range로 렌더한다.
- [ ] `observation`, `safeCopy`, `safeQuestion`, `stageText`, `~하는 편` 해석문, 고정 성격 type, 점수, 백분율, 응답자 수를 미리보기·PNG·접근성 텍스트에 넣지 않는다.
- [ ] 320×568, 390×844, 430×932, 200% 확대에서 가로 넘침·텍스트 잘림·축 겹침 없이 같은 정보 순서가 유지된다.
- [ ] 목업 29는 시각 근거로만 읽고, 실제 contract는 #161 개인정보·단계 의미와 현재 앱 팔레트/typography를 우선한다.

## API와 데이터 영향

- [ ] `ConceptProfile`의 owner-only 응답 경계, feature flag, `Cache-Control: private, no-store`를 유지한다.
- [ ] server-side `buildConceptProfile` 결과에 대표 option별 3축 번들을 결정할 최소 공개 안전 필드를 추가하거나 기존 hook을 option과 결합하되, client가 임의의 보조 축을 선택하지 않게 한다.
- [ ] 대표 축의 `sourcePlayId`는 선택한 결의 기존 share-safe source를 사용한다. 보조 축의 source가 달라도 same-pack CTA와 entry URL은 대표 축 source 하나만 사용한다.
- [ ] `ConceptProfileShareCardModel`의 top-level exact keys는 `nickname`, `axes`이고 `axes` 길이는 정확히 3이다. 각 axis exact keys는 `areaLabel`, `conceptLabel`, `directionA`, `directionB`, `selfPosition`, `others`, `cardCount`다.
- [ ] settled `others` exact union은 `{ source: "shareSafeOthers", direction: "a"|"b", stage: "outline"|"clear", position, range: "medium"|"narrow" }`다. `outline↔medium`, `clear↔narrow`만 허용한다.
- [ ] contextual `others` exact union은 `{ source: "shareSafeOthers", direction: "contextual", stage: "outline"|"clear", range: "split" }`다. `position` 키를 포함하지 않고 renderer도 단일 marker를 그리지 않는다.
- [ ] `selfPosition`과 settled others `position`은 #161 public position 축의 유한 범위 `[-1, 1]`을 사용하고 catalog direction threshold와 부호가 일치해야 한다. `cardCount`는 해당 source evidence의 중복 제거된 양의 정수다.
- [ ] standalone share-card decoder는 top-level/axis/others union exact keys, catalog labels/endpoints로 파생한 concept identity, 중복 concept, position, stage/range, cardCount, unknown/extra key를 fail-closed로 검증한다.
- [ ] 대표 축 고정과 달성 가능한 area 다양성은 전체 eligible universe를 가진 server `buildConceptShareBundle`과 owner `ConceptProfile` decoder가 검증한다. standalone public card만 보고 제외된 후보를 추측하거나 다양성을 재판정하지 않는다.
- [ ] `others.range`는 server가 stage/direction에서 만든 익명 enum이며 raw 좌표·score·표본 수·개인별 값은 포함하지 않는다. unsettled는 공유 불가라 model에 들어올 수 없다.
- [ ] nickname은 인증된 owner account display value를 관리 화면에서 카드 모델에 bounded text로 전달하되 owner/visitor ID, 관계명, respondent count, `privateOthers`, 원문 응답을 포함하지 않는다.
- [ ] 저장소 schema와 public invite/one-to-one token에는 변화가 없다.

## 구현 계획

- [ ] `lib/owner-profile/concept-profile-core.mjs`: 선택된 대표 share option을 첫 축으로 고정하고 기존 `rankCandidate` 결과 순서를 그대로 재사용해 다른 영역을 우선하는 두 보조 축을 결정한다. catalog index는 기존 마지막 tie-break로만 남긴다. 다양성을 위해 후보를 건너뛴 뒤에도 남은 후보의 `difference→contextual→repeated→emerging`, stage/evidence rank 순서를 바꾸지 않는다.
- [ ] `lib/owner-profile/concept-profile-core.mjs`와 `lib/owner-profile/concept-profile.ts`: 각 owner-only share option에 public-safe axis와 server-selected bundle을 연결한다. 전체 eligible option universe를 가진 builder와 profile decoder가 representative-first, exact 3, eligibility, duplicate concept, 달성 가능한 최대 distinct area를 같은 deterministic 함수로 검증한다.
- [ ] `lib/owner-profile/profile-share-card-core.mjs`: 기존 relationship decoder를 건드리지 않고 3축 concept model exact decoder와 bounded nickname/position/range/cardCount/catalog 검증을 구현한다.
- [ ] `lib/owner-profile/owner-profile.ts`: `ConceptProfileShareCardModel`을 3축 전용 type으로 교체하고 relationship union을 보존한다.
- [ ] `app/me/account-profile-view.tsx`: picker label과 3축 부족 fallback을 구현하고 기존 dialog focus, 중복 클릭 guard, analytics failure message를 재사용한다.
- [ ] `app/me/plays/[playId]/page.tsx`와 관리 화면 server 경계: `entry_source=profile_reshare&share_concept=<representative>`를 owner auth 뒤 다시 검증하고 정확히 일치하는 server bundle만 전달한다. legacy relationship query와의 혼합은 계속 404 처리한다.
- [ ] `app/me/plays/[playId]/share-link-manager.tsx`: 기존 공개 invite URL 생성, native share, download/copy fallback, analytics/same-pack CTA 경로를 재사용하고 concept 모델 조립에 authenticated nickname과 validated bundle만 전달한다.
- [ ] `app/me/plays/[playId]/profile-share-card.tsx`: concept preview와 Canvas를 정확히 세 axis loop로 렌더하되 기존 relationship branch는 변경하지 않는다. font readiness, text fit, `toBlob` 실패 처리와 filename을 재사용한다.
- [ ] `app/me/plays/[playId]/profile-share-card.module.css`: 세 축 hard-offset stack, marker/range/split, compact viewport/reduced motion/focus 스타일만 최소 변경한다.
- [ ] `lib/concepts/catalog-core.mjs`는 변경하지 않고 share-card decoder의 catalog identity SSOT로 직접 재사용한다.
- [ ] `app/i/[publicId]/invite-entry.tsx`, `lib/share-links/share-link-client.ts`, `app/api/responses/[id]/events/route.ts`: 기존 public invite와 수신자 `source=same_pack_cta`, `same_pack_start_clicked` 기록 경계를 참조해 회귀 테스트만 보강하고 새 event/API를 만들지 않는다.
- [ ] `app/api/me/plays/[playId]/share-events/route.ts`: owner 공유 준비의 `entry_source=profile_reshare`와 canonical public link 기반 `profile_share_succeeded` server 경계를 그대로 보존한다.
- [ ] `tests/unit/concept-profile.test.mjs`: representative-first, 3개 exact, distinct-area 우선, unavoidable duplicate-area, diversity 때문에 skip한 뒤의 기존 rank, 0/1/2 eligible fallback, others contextual 허용, self contextual/unsettled과 others unsettled 거부, sourcePlayId를 검증한다.
- [ ] `tests/unit/profile-share-card.test.mjs`: exact keys, catalog identity, bounds, stage range, duplicates, unknown/extra/private keys, exact three axes, nickname limits를 검증하고 relationship fixtures 회귀를 유지한다.
- [ ] `tests/e2e/concept-profile-live.spec.ts`: `/me` picker→관리 화면 preview→Web Share/download/copy→same-pack 흐름, analytics 중복 방지, 3축 부족 fallback, owner/no-store 경계를 live fixture로 검증한다.
- [ ] `tests/e2e/share-links.spec.ts`: legacy relationship share, mixed query rejection, native share/`NotAllowedError`/PNG failure/focus 복구가 회귀하지 않는지 검증한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/concept-graph-design.md`, `docs/product/decision-log.md`: 정확히 3축, privacy-safe fields, stage range의 비통계 의미, same-pack source와 fallback 결정을 기록한다.
- [ ] `docs/temp/qa/issue-162.md`와 `docs/temp/qa/issue-162/*.png`: 독립 verifier의 P0/P1/P2 verdict, 명령, viewport·접근성·시각 증거를 기록한다.

## 완료 기준

- [ ] `/me`에서 대표 축을 고르면 그 축이 첫 번째이고 서로 다른 share-safe 결 두 개가 더해진 정확히 3축 bundle이 만들어진다.
- [ ] 세 개 이상의 영역이 가능하면 세 축의 영역이 모두 다르고, 부족할 때만 같은 영역을 허용하며 concept는 항상 중복되지 않는다.
- [ ] 세 축 중 하나라도 privacy/share eligibility, stage, direction 계약을 충족하지 않으면 새 concept 공유 카드가 생성되지 않고 `/me`는 `시선 더 모으기`를 보여 준다.
- [ ] share-card decoder가 `nickname/axes`, axis/others exact union, exact length 3, catalog labels/endpoints, position, stage/range, cardCount, duplicate concept를 검증하고 private·unknown·extra 데이터를 거부한다. 전체 eligible universe를 받는 bundle validator는 representative-first와 achievable area diversity를 별도로 검증한다.
- [ ] 공유 미리보기와 1080×1920 PNG에 닉네임, `● 나 / ○ 지인`, 세 축의 endpoint, 내 위치, 익명 집계 범위, 고유 문항 수가 동일하게 보인다.
- [ ] `observation`, `safeCopy`, `safeQuestion`, `stageText`, 자연어 성격문, raw score, 백분율, 응답자 수, 이름·관계명·개인 답변·개별 위치가 모델·DOM·PNG에 없다.
- [ ] contextual은 중앙 marker 없는 split range이고 unsettled은 공유 불가이며, stage range를 통계 신뢰구간으로 표현하지 않는다.
- [ ] blue/yellow/red hard-offset stack과 현재 앱 팔레트·윤곽·typography가 미리보기와 PNG에서 일치한다.
- [ ] 대표 축의 기존 `sourcePlayId`와 public invite URL로 `나도 이 팩으로 시작하기`가 이어지고 공개·1:1 링크 정책이 변하지 않는다.
- [ ] Web Share, download, copy, OS 미지원, 취소, `NotAllowedError`, Canvas/font/PNG 실패에서 생성 링크 보존·복구 action·focus 복귀가 동작한다.
- [ ] 기존 팩별 relationship share model/preview/PNG와 legacy query는 회귀하지 않는다.
- [ ] owner 확정은 기존 owner play identity로 `profile_reshare_clicked`, canonical public link가 생긴 공유 성공은 기존 `profile_share_succeeded`, 수신자 CTA는 response identity로 `same_pack_start_clicked`, 실제 새 owner 생성은 canonical template id+slug identity로 `new_owner_pack_opened`가 기존 idempotency 경계에서 각각 한 번만 집계된다.
- [ ] 320/390/430px, 200% 확대, 키보드, focus-visible/복귀, screen reader 읽기 순서, 색상 비의존, reduced motion 검증이 통과한다.
- [ ] 새 DB/migration/dependency 없이 focused 검증, `./scripts/run-ai-verify --mode full`, 동일 HEAD 필수 CI, 정확한 Render merge SHA와 운영 smoke가 통과한다.

## 테스트 계획

- [ ] Unit: `node --test tests/unit/concept-profile.test.mjs tests/unit/profile-share-card.test.mjs tests/unit/concept-profile-client.test.mjs`
- [ ] Integration: owner auth/no-store, feature flag on/off, exact bundle parsing, mixed/invalid query 404, legacy relationship share를 확인한다.
- [ ] E2E: live fixture에서 picker 선택→representative-first preview→native share/download/copy→same-pack CTA, 0/1/2 eligible fallback, contextual, analytics one-shot을 실행한다.
- [ ] Failure E2E: Web Share 미지원·취소·`NotAllowedError`, `navigator.canShare` false, `document.fonts.ready`, Canvas context/toBlob 실패에서 복구 action과 focus를 확인한다.
- [ ] Viewport: 320×568, 390×844, 430×932에서 최소 44×44px target, 가로 넘침, 축/endpoint/legend 잘림, sticky/fixed 겹침을 확인한다.
- [ ] Accessibility: 200% 확대, Tab/Shift+Tab/Enter/Space/Escape, dialog 닫힘·fallback 후 focus 복귀, `닉네임→범례→축1~3 area/concept/endpoints/self/others/cardCount→CTA` 순서, 색상 비의존, reduced motion을 확인한다.
- [ ] Visual QA: 목업 29와 실제 preview/PNG를 비교해 3색 hard-offset stack과 marker/range semantics를 확인하되 목업의 raw totals는 구현하지 않는다.
- [ ] Screenshot: `docs/temp/qa/issue-162/320.png`, `390.png`, `430.png`, `zoom-200.png`, `contextual.png`, `keyboard-focus.png`, `reduced-motion.png`, `share-preview.png`, `share-png.png`를 남긴다.
- [ ] Full: clean HEAD에서 harness PR gate의 `./scripts/run-ai-verify --mode full`과 동일 SHA의 모든 CI 및 named `verify`를 확인한다.

## 분석과 관측성

- [ ] `/me` picker를 여는 것만으로 share click을 기록하지 않는다. 기존 `recordOwnerProfileReshareClicked(sourcePlayId)`가 성공한 확정 action에서 owner play identity별 `profile_reshare_clicked`를 idempotent하게 한 번 기록한다.
- [ ] `profile_share_succeeded`는 native share promise 자체가 아니라 profile-source owner와 canonical public link의 기존 server 집계 identity를 보존한다. 취소·fallback·retry로 링크가 재사용돼도 같은 owner play 성공을 중복 집계하지 않는다.
- [ ] 수신자 CTA의 `same_pack_start_clicked`는 source response identity별 기존 idempotent event를, 실제 `new_owner_pack_opened`는 유효한 response capability와 같은 canonical `pack_templates.id + slug`에서 새 owner가 생성된 경우만 보존한다. click과 open의 상호 도착 순서는 요구하지 않는다.
- [ ] owner가 `/me`에서 공유 관리 화면으로 들어가 링크를 준비·생성하는 upstream 경계만 `entry_source=profile_reshare`를 사용한다. 수신자의 `나도 이 팩으로 시작하기`는 기존 `/play/new?pack=<slug>&source=same_pack_cta`와 canonical template id+slug identity를 사용한다. 새 event name, payload field, 로그, 대시보드를 추가하지 않는다.
- [ ] decoder/PNG 오류에는 민감 model이나 위치 payload를 로깅하지 않고 기존 사용자 복구 문구만 사용한다.

## 개인정보와 악용 방지

- [ ] 3축 bundle 구성과 관리 화면 검증은 owner auth 뒤에서만 수행하며 owner profile payload를 공개 invite URL에 직렬화하지 않는다.
- [ ] 각 axis는 `shareSafeOthers`의 outline/clear aggregate만 사용한다. `privateOthers`, romantic/민감 관계, 응답자 ID·이름, 개별 응답·좌표, raw count를 섞지 않는다.
- [ ] 0/1/2 threshold, unsettled, invalid stage/range, 세 축 부족은 fail-closed다. CSS로 숨긴 payload나 `aria-label`, data attribute, Canvas copy에도 위치를 남기지 않는다.
- [ ] 공개 카드의 nickname 외 사람을 식별하는 값은 없고 nickname은 기존 owner display 경계와 길이 제한을 사용한다.
- [ ] `Cache-Control: private, no-store`, owner session, feature flag, public/1:1 secret 경계를 보존한다.

## 롤아웃과 복구

- [ ] 기존 `GYEOP_CONCEPT_PROFILE_ENABLED` flag 안에서 배포한다. off이거나 정확한 3축이 없으면 기존 `/me` fallback과 팩별 relationship share만 보인다.
- [ ] DB 변화가 없으므로 데이터 rollback은 없다. 긴급하게 flag를 끄면 #161 concept profile 전체가 숨겨지고 기존 비개념 `/me` fallback과 relationship 공유만 남는다.
- [ ] #161 프로필을 유지하면서 #162 공유만 복구해야 하면 #162 PR만 되돌린 뒤 재배포한다. 이 경우 #161의 단일축 공유 계약 코드가 함께 복원되는지 exact merge parent에서 검증한다.
- [ ] server bundle, client decoder, preview/Canvas를 같은 PR에서 배포해 계약 불일치 시간을 만들지 않는다.
- [ ] 병합 후 Render `live for <merge SHA>`를 확인하고 `/`, `/me`, owner profile API의 unauth 401/private no-store, feature flag true, 기존 relationship query와 concept 부족 fallback을 smoke test한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- [ ] 외부 블로커는 없다. 선행 #161은 PR #163, merge SHA `13bbf2c5071867f1ff2ed9a5bd3f52df169e2129`로 완료됐다.
- [ ] 구현 중 정확히 3축과 기존 share option shape가 충돌하면 client-side 즉석 선정을 추가하지 않고 server bundle/decoder 계약을 독립 reviewer에게 다시 검토받는다.
- [ ] 목업 29는 사용자 root의 읽기 전용 untracked asset이므로 이 PR에서 수정·이동·커밋하지 않는다. QA는 해당 경로와 실제 결과의 시각 비교만 기록한다.
