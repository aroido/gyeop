# Issue 161 구현 스펙: 누적 질문 신호 기반 양방향 상위개념 프로필로 개편

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/161

## 목표

`/me`의 owner-only 상위개념 프로필을 자연어 해석문 중심 화면에서 양쪽 개념 끝점, 내 위치, 임계값을 충족한 지인 익명 집계, 누적 질문 근거가 한눈에 보이는 8개 영역 적층 프로필로 개편한다.

## 범위

- [ ] 내부 `directionScore` 계약인 `+1=directionA`, `-1=directionB`와 기존 direction/kind 판정을 변경하지 않는다. 화면 축은 A가 왼쪽, B가 오른쪽이므로 API 경계에서만 `position = clamp(-directionScore, -1, 1)`로 변환해 `-1=directionA`, `0=중립`, `1=directionB`를 노출한다.
- [ ] raw `directionScore`는 public payload에서 계속 제거한다. self, `privateOthers`, `shareSafeOthers`의 `available` source summary에는 유한한 `-1..1`의 `position`만 추가한다.
- [ ] self와 available others의 direction이 `a`/`b`이면 `position` marker를 표시하고, others에만 stage 기반 `wide/medium/narrow` 비통계적 익명 band를 표시한다. 이는 확률, 신뢰구간, 백분율 또는 정밀도 점수가 아니다.
- [ ] `contextual`은 `position`을 중앙점처럼 렌더하지 않고 양쪽 split pattern/status로, `unsettled`은 marker 없이 넓은 neutral band/status로 표현한다. exact pixel이나 수치 범위는 API·SSOT에 고정하지 않는다.
- [ ] `privateOthers.status === "locked"`일 때는 기존 `시선을 모으는 중 · n/3` 진행 상태만 유지하며, 지인 중심 위치, 방향, 범위 또는 이를 추정할 수 있는 필드를 API에 포함하거나 UI에 렌더하지 않는다.
- [ ] 8개 영역 각각에 self 질문 신호만으로 area summary를 만든다. 같은 `cardKey`는 영역 안에서 한 번만 세고, 고유 `cardCount`, `packCount`, `contextCount`, 기존 기준으로 계산한 `stage`만 제공한다.
- [ ] 하나의 질문이 여러 `conceptSignals`를 가져도 질문-결 연결은 각 결에 반영하되, 같은 결과 같은 영역의 집계에서는 동일 `cardKey`를 중복 계산하지 않는다. 한 영역의 4개 결 방향값은 합산, 평균 또는 단일 방향으로 변환하지 않는다.
- [ ] 대표 결은 기존 one-per-kind 의미와 `difference → contextual → repeated → emerging` kind 순서, kind 내부 current rank를 유지한다. 선택 슬롯이 남아 있는 동안 각 kind에서 아직 선택하지 않은 `areaId` 후보를 우선 한 개씩 선택하고, 모든 kind를 훑은 뒤 3개 미만이면 global rank에서 unused area 후보를 먼저, 그래도 부족할 때만 중복 area 후보를 허용한다.
- [ ] 기존 shareable-hook 보장은 달성 가능한 최대 area 다양성을 깨지 않는 후보 선택/조정 범위에서만 유지한다. pairs가 비어 있지 않으면 대표 결은 정확히 3개여야 하고, 후보가 3개 미만인 응답은 fail-closed invalid다. pairs가 비어 있을 때만 빈 fallback을 허용한다.
- [ ] `/me`의 1차 결과 UI에서 자연어 `profileLead`, `observation`, 대화형 `question`/blockquote와 긴 도움말을 제거하고, 대표 결 카드에는 영역명, 결 이름, `directionA — directionB`, 내 위치, 허용된 지인 익명 범위, 고유 문항 수, 근거 단계만 표시한다.
- [ ] 대표 카드의 `trace`, `outline`, `clear`를 색 농도 대신 기존 hard-offset 카드 뒤 신호층 1장, 2장, 3장으로 구분한다. 전면에는 `cardCount`만 표시하고 `packCount`와 `contextCount`는 기존 상세 진입 후에만 표시한다.
- [ ] 나머지 영역은 방향값 없이 `cardCount`와 `stage`만 전면에 보여주는 compact area rail로 표시한다. `packCount`와 `contextCount`는 API와 대표 카드의 기존 상세에만 남긴다.
- [ ] 결과 바로 다음에 기존 공유 동작을 사용하는 대표 공유 CTA를 정확히 한 번만 배치한다. 질문팩 관리는 별도 보조 영역으로 유지한다.
- [ ] 기존 feature flag/빈 결과 fallback, owner 인증, private `Cache-Control: no-store`, 공유 실패 fallback, 접근성 focus 복귀, 기존 분석 이벤트 경계를 보존한다.
- [ ] API와 클라이언트 strict decoder, 단위·통합·E2E 테스트, 제품 결정 문서, 모바일 시각 QA 산출물을 함께 갱신한다.

## 제외 범위

- [ ] 새 DB 테이블, 컬럼, 마이그레이션, 저장 형식 또는 외부 의존성을 추가하지 않는다.
- [ ] 질문팩/카드 콘텐츠, 상위개념 카탈로그 v2, 9:16 공유 카드, 팩 완료 후 신호 확산 애니메이션은 변경하지 않는다.
- [ ] #162 범위인 `ConceptProfileShareCardModel`, Canvas/PNG 공유 카드, `shareOptions`의 `safeCopy`/`safeQuestion`, share picker와 `shareEvidence` shape/copy는 변경하지 않는다.
- [ ] 공개 프로필, 방문자 개인 위치, 응답자 목록, 개별 지인 위치를 추가하지 않는다.
- [ ] MBTI형 코드, 고정 유형, AI 성격 문장, 백분율, 순위, 공개 점수 또는 통계적 신뢰도를 만들지 않는다.
- [ ] 기존 익명 집계 임계값, stage 기준, kind 우선순위 자체를 재정의하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/product/concept-graph-design.md
- content/concepts-v1.json
- lib/concepts/catalog-core.mjs
- lib/owner-profile/concept-profile-client.ts
- lib/http/auth-owner.ts
- docs/design/mockups/concept-profile-v2/29-app-style-precision-growth.png
- AGENTS.md
- GitHub issues #157, #159, #161, #162
- 반응형 디자인 참고 provenance: https://raw.githubusercontent.com/wshobson/agents/main/plugins/ui-design/skills/responsive-design/SKILL.md
- 접근성 참고 provenance: https://raw.githubusercontent.com/addyosmani/web-quality-skills/main/skills/accessibility/SKILL.md

## 사용자 흐름 영향

- [ ] 주인은 `/me` 진입 후 설명문을 먼저 읽지 않고 대표 결 3개의 양쪽 끝점, 내 위치, 허용된 지인 익명 범위와 근거 두께를 바로 확인한다.
- [ ] 주인은 대표 결과 아래 한 번만 노출되는 공유 CTA로 기존 공유 흐름을 시작한다. native share가 거절되거나 지원되지 않을 때 기존 복사 fallback과 focus 복귀를 그대로 사용한다.
- [ ] 지인 응답이 3개 미만이면 주인은 `시선을 모으는 중 · n/3`만 보고 위치나 범위를 보지 못한다. 3개 이상이고 기존 공개 조건을 만족한 경우에만 익명 집계 표현을 본다.
- [ ] 주인은 대표 결 아래 compact area rail로 8개 영역의 근거 깊이를 비교하되 영역별 성향 방향으로 오해할 수 있는 축이나 점수를 보지 않는다.
- [ ] 질문팩 관리와 기존 상세 진입은 보조 동작으로 남는다. 방문자 및 새 주인 전환 흐름, 답변 제출 흐름은 바뀌지 않는다.

## 디자인 영향

- [ ] 기준 목업 `docs/design/mockups/concept-profile-v2/29-app-style-precision-growth.png`의 결과 우선 정보 구조와 적층감을 참고하되, 현재 GYEOP의 `#050505` 배경, `#315cff` 파랑, `#dfff00` 라임, `#ff4d42` 코랄, 굵은 검정 윤곽, hard offset 스타일을 재사용한다.
- [ ] 대표 카드 3개는 모바일 단일 열에서 영역명/결 이름, 양쪽 endpoint, 공통 축, `● 내 위치`, 허용된 `○ 지인 익명 집계`, 고유 문항 수, 근거 단계를 위에서 아래 순서로 읽게 한다.
- [ ] `directionA`와 `directionB`는 축의 양끝에 텍스트로 함께 표시한다. 내 위치와 익명 집계는 모양, 레이블, 접근성 이름을 함께 사용해 색상이나 좌표만으로 구분하지 않는다.
- [ ] self와 available others의 direction이 `a`/`b`이면 marker를 표시하고 others에만 stage 기반 `wide/medium/narrow` band를 더한다. `contextual`은 중앙 marker 없는 split pattern/status, `unsettled`은 marker 없는 neutral band/status로 표시한다.
- [ ] `trace/outline/clear`의 카드 뒤 신호층은 각각 1/2/3장으로 고정하고 reduced motion에서는 전환·이동 애니메이션 없이 최종 상태만 표시한다.
- [ ] compact area rail은 8개 영역 모두를 누락 없이 표시하되 방향 축을 그리지 않고 고유 문항 수와 단계만 표현한다. 팩 수와 맥락 수는 전면 rail에 노출하지 않는다.
- [ ] 320px에서 가로 스크롤, 텍스트 잘림, 축 endpoint 겹침이 없어야 한다. 390px과 430px에서는 정보 순서와 한 번의 공유 CTA를 유지하며 여백만 확장한다.
- [ ] 200% 확대에서도 DOM 읽기 순서, 카드 내용, focus ring, 최소 44×44px 상호작용 영역이 유지되고 고정 높이로 콘텐츠를 자르지 않는다.

## API와 데이터 영향

- [ ] top-level exact keys는 `{ modelVersion, hooks, shareOptions, areaSummaries }`다. pairs가 비어 있으면 `hooks`, `shareOptions`, `areaSummaries`가 모두 `[]`여야 한다. pairs가 비어 있지 않으면 `hooks`는 정확히 3개, `areaSummaries`는 catalog order의 8개여야 한다.
- [ ] `ConceptHook`은 기존 exact keys에 `areaId`, `directionA`, `directionB`를 추가한다. `areaId`와 endpoint 문구는 `content/concepts-v1.json`/`lib/concepts/catalog-core.mjs`의 해당 concept와 정확히 일치해야 한다.
- [ ] 내부 `directionScore`는 `+1=A`, `-1=B`를 유지하고 payload 생성 시에만 `position = clamp(-directionScore, -1, 1)`을 계산한다. raw `directionScore`와 중복 위치 필드는 public payload에 넣지 않는다.
- [ ] self, `privateOthers`, `shareSafeOthers`의 모든 `available` `ConceptSourceSummary`는 기존 exact keys에 `position`을 포함하며 값은 유한한 `-1..1` 수여야 한다. `privateOthers`의 locked variant exact keys는 `{ status, sightCount }`뿐이며 position, direction, stage, evidence 또는 범위 키를 허용하지 않는다.
- [ ] API에 `displayRange`, band 폭 또는 split/neutral 좌표를 추가하지 않는다. client UI는 기존 `direction`, `stage`, `position`만으로 `wide/medium/narrow/split/neutral` 표현을 파생한다.
- [ ] decoder는 `direction=a`이면 `position <= -0.25`, `direction=b`이면 `position >= 0.25`, `direction=unsettled`이면 `abs(position) < 0.25`를 요구한다. `direction=contextual`은 position이 유한한 `-1..1`이면 통과시키되 UI marker로 사용하지 않는다.
- [ ] 각 source의 `stage`가 기존 evidence-derived stage와 일치하는지 검증한다. 새로운 threshold를 만들지 않고 현행 evidence→stage 계산을 단일 근거로 재사용한다.
- [ ] area summary exact-key 계약은 `{ areaId, areaLabel, cardCount, packCount, contextCount, stage }`다. catalog order의 8개 영역을 정확히 한 번씩 포함해야 하고 stage는 self 고유 count에 현행 count→stage 계산을 적용한 값과 일치해야 한다. 중복·미지·순서 변경·누락 `areaId`, 음수/비정수 count, 잘못된 stage, 누락/추가 키를 거부한다.
- [ ] 실제 strict decoder는 `lib/owner-profile/concept-profile-core.mjs`에 둔다. `lib/owner-profile/concept-profile-client.ts`는 decoder를 호출하는 client boundary이고, `lib/http/owner-concept-profile.ts`와 `lib/http/auth-owner.ts`는 loader/auth 경계로 유지한다.
- [ ] `shareOptions`와 각 option의 `shareEvidence`, `safeCopy`, `safeQuestion` 기존 exact shape/copy는 #162까지 그대로 보존한다.
- [ ] `lib/http/owner-concept-profile.ts`, `lib/http/auth-owner.ts`, `app/api/me/concept-profile/route.ts`는 기존 owner session 인증과 private response의 `Cache-Control: no-store`를 유지한다. 다른 사용자의 응답 내용, 응답자 식별자, 개별 위치를 반환하지 않는다.
- [ ] 기존 DB 질의와 응답의 `cardCount`, `packCount`, `contextCount`, `stage`, `kind`, 익명 임계값을 재사용한다. 새 저장소, 마이그레이션, dependency는 없다.

## 구현 계획

- [ ] `content/concepts-v1.json`, `lib/concepts/catalog-core.mjs`: 변경하지 않고 concept→area/endpoints와 8개 catalog order의 검증 근거로 재사용한다.
- [ ] `lib/owner-profile/concept-profile-core.mjs`: 내부 direction/kind 판정은 보존하고 API `position` 부호 변환, top-level/source/area exact-key decoder, catalog·direction·stage 상호 검증, locked 완전 비노출, `cardKey` 중복 제거 area summary, one-per-kind와 area 다양성을 보존하는 정확히 3개 대표 결 선택을 구현한다.
- [ ] `lib/owner-profile/concept-profile.ts`: core 결과의 TypeScript 타입과 owner-only 응답 조립을 `position`, endpoint, 8개 area summary 계약에 맞춘다. 기존 count/stage/kind 입력과 `shareOptions/shareEvidence` shape를 재사용한다.
- [ ] `lib/owner-profile/concept-profile-client.ts`: core strict decoder를 사용하는 client boundary로 유지하고 partial/invalid payload를 fail-closed fallback으로 보낸다.
- [ ] `lib/http/owner-concept-profile.ts`, `lib/http/auth-owner.ts`: 새 decoder 구현을 두지 않고 기존 loader/owner auth 경계를 보존한다.
- [ ] `app/api/me/concept-profile/route.ts`: 새 응답을 전달하면서 현행 auth, feature flag, 오류 응답, `no-store` 헤더를 보존한다.
- [ ] `app/me/account-profile-view.tsx`: 1차 UI의 `profileLead`, `observation`, `question`/blockquote, 긴 도움말을 제거하고 대표 결 3개, direction별 marker/split/neutral 표현, area rail, 결과 직후 공유 CTA 한 번, 기존 fallback/상세/팩 관리 흐름을 렌더한다. `ConceptProfileShareCardModel`, Canvas/PNG, share picker는 변경하지 않는다.
- [ ] `app/me/owner-list.module.css`: 기존 색 토큰과 hard-offset 스타일 안에서 단계별 1/2/3 신호층, `wide/medium/narrow/split/neutral` 의미 상태, 서로 다른 marker, compact area rail, 320/390/430px 반응형, 200% 확대, focus-visible, reduced-motion 규칙을 최소 변경으로 추가한다.
- [ ] `tests/unit/concept-profile.test.mjs`: `directionScore`→`position` 부호/clamp, 기존 direction/kind 불변, 다중 conceptSignals, 같은 `cardKey`가 같은 area의 서로 다른 두 conceptSignals일 때 area는 1회·각 concept는 1회 계산되는 fixture, 8개 summary count/stage와 catalog order, 4개 결 방향 미합산, one-per-kind/distinct-area/shareable 선택, non-empty 정확히 3개와 empty fallback, locked 비노출을 검증한다.
- [ ] `tests/unit/concept-profile-client.test.mjs`: top-level/source/area exact keys, catalog endpoints/areaId/order, position 유한성·부호, direction↔position, stage↔evidence, count↔area stage, locked 추가 키, 후보 3개 미만, 중복·미지·누락 areaId의 실패를 검증한다.
- [ ] `tests/e2e/concept-profile-live.spec.ts`: feature flag on/off, owner auth, 빈 결과 fallback, 0/1/2/3 지인 임계값, 초기/누적 근거 fixture, 대표 결 3개와 8개 rail, 공유 CTA 단일 노출 및 fallback, 기존 상세 이벤트를 검증한다.
- [ ] `docs/product/core-feature-priority.md`: owner-only `/me` 결과 우선 프로필의 활성 P0 계약에 양방향 endpoint, position, 익명 단계 표현, 8개 area rail과 단일 공유 CTA를 반영한다.
- [ ] `docs/product/concept-graph-design.md`: 내부 점수와 API position의 부호 차이, endpoint, 익명 `wide/medium/narrow/split/neutral`, area summary를 비통계적 시각 계약으로 기록한다.
- [ ] `docs/product/decision-log.md`: 자연어 해석문보다 양방향 누적 신호를 우선하는 결정과 개인정보 비노출 경계를 위 두 활성 SSOT 갱신과 같은 변경에서 기록한다.
- [ ] `docs/temp/qa/issue-161.md`: 독립 QA reviewer가 검증 명령, P0/P1/P2 판정, 접근성·시각 증거와 스크린샷 경로를 기록한다.

## 완료 기준

- [ ] pairs가 비어 있지 않으면 대표 결이 정확히 3개이고, one-per-kind/current rank와 shareable-hook 보장을 유지하면서 달성 가능한 최대 서로 다른 `areaId`를 선택한다. 후보가 3개 미만인 payload는 부분 렌더하지 않는다.
- [ ] 각 대표 카드에 catalog와 일치하는 `areaId`, `directionA`, `directionB`가 있고 양쪽 endpoint가 항상 함께 보인다.
- [ ] 내부 `directionScore`의 `+1=A/-1=B`와 기존 direction/kind가 변하지 않고, public payload에는 raw score 없이 `position = clamp(-directionScore)`만 있어 `-1=A/0=중립/1=B`가 단위 테스트와 screen reader 문구에서 일치한다.
- [ ] 지인 집계가 locked인 0/1/2 응답 상태에서는 `n/3` 외에 중심, 방향, 범위, 숨은 접근성 텍스트 또는 DOM 속성으로도 위치 정보가 노출되지 않는다.
- [ ] self/others의 `a`/`b`는 marker로 보이고 others만 stage 기반 `wide/medium/narrow` band를 가진다. `contextual`은 중앙점 없는 split, `unsettled`은 중앙점 없는 neutral로 렌더되며 exact 좌표·확률·신뢰도·백분율 문구를 사용하지 않는다.
- [ ] 같은 `cardKey`가 같은 area의 서로 다른 두 conceptSignals에 연결되면 area는 1회, 각 concept는 각각 1회 세고, catalog order 8개 area summary에는 count와 count-derived stage 외의 방향 합산값이 없다.
- [ ] `trace/outline/clear` 카드가 각각 1/2/3장의 신호층을 보이고 전면에는 `cardCount`만, 상세에는 기존 `packCount/contextCount`가 보인다.
- [ ] 1차 프로필에 `profileLead`, 자연어 `observation`, 대화형 `question`/blockquote, AI 성격 문장, 고정 타입, 공개 점수, 백분율이 렌더되지 않는다.
- [ ] 대표 결과 바로 다음에 공유 CTA가 정확히 한 번 있고, 공유 성공·권한 거절·미지원 환경의 기존 fallback과 분석 이벤트가 회귀하지 않는다.
- [ ] feature flag off 또는 개념 결과 없음 fallback, 질문팩 관리, owner auth, private `no-store` 경계가 그대로 동작한다.
- [ ] decoder가 top-level/source/area exact keys, catalog endpoint/order, direction↔position, stage↔evidence, count↔area stage를 강제하고 locked 위치 혼입, non-empty 3개 미만, 중복·미지·누락 areaId를 거부한다.
- [ ] `shareOptions/shareEvidence/safeCopy/safeQuestion`, `ConceptProfileShareCardModel`, Canvas/PNG, share picker의 기존 shape·copy·동작이 변경되지 않는다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/concept-graph-design.md`, `docs/product/decision-log.md`가 같은 변경에서 새 계약으로 갱신된다.
- [ ] 320/390/430px, 200% 확대, 키보드 전용 사용, focus-visible/복귀, screen reader 읽기 순서, reduced motion 검증이 모두 통과하고 지정 스크린샷 산출물이 남는다.
- [ ] 새 DB/마이그레이션/dependency 없이 focused 검증, `./scripts/run-ai-verify --mode full`, 동일 HEAD 필수 CI가 통과한다.

## 테스트 계획

- [ ] Unit: `node --test tests/unit/concept-profile.test.mjs tests/unit/concept-profile-client.test.mjs`
- [ ] Integration: `concept-profile-client.ts` client boundary에서 invalid payload의 fail-closed fallback을, `owner-concept-profile.ts`/`auth-owner.ts` 경계에서 owner session이 없는 요청의 거부, owner 요청의 성공, private `Cache-Control: no-store`, feature flag off/빈 결과 fallback을 확인한다.
- [ ] E2E: `tests/e2e/concept-profile-live.spec.ts`에서 임계값 0/1/2/3, a/b marker와 stage band, contextual split, unsettled neutral, 대표 결 3개와 8개 rail, 상세, 공유 성공과 fallback을 실행한다.
- [ ] Visual QA: 목업 29와 실제 `/me`를 비교해 정보 순서, GYEOP 색/윤곽/hard offset, 신호층 1/2/3, 축 겹침, 단일 공유 CTA를 확인한다. 목업은 읽기 전용이며 수정하거나 결과물로 덮어쓰지 않는다.
- [ ] Viewport: 320×568, 390×844, 430×932에서 대표 결과와 8개 rail의 가로 넘침, 텍스트 잘림, 44×44px target, sticky/fixed 요소 겹침을 확인한다.
- [ ] Accessibility: 브라우저 200% 확대, Tab/Shift+Tab/Enter/Space, focus-visible과 공유 fallback 후 focus 복귀, screen reader의 endpoint→내 위치→지인 상태→문항 수→근거 단계 순서, 색상 비의존 표현, `prefers-reduced-motion: reduce`를 확인한다.
- [ ] Screenshot: `docs/temp/qa/issue-161/320.png`, `390.png`, `430.png`, `zoom-200.png`, `locked.png`, `contextual.png`, `unsettled.png`, `keyboard-focus.png`, `reduced-motion.png`를 남기고 QA 문서에서 fixture와 viewport를 연결한다.
- [ ] Full: PR 생성 단계에서 저장소 정책에 따라 `./scripts/run-ai-verify --mode full`을 정확한 clean HEAD에 실행하고 동일 HEAD의 필수 CI를 확인한다.

## 분석과 관측성

- [ ] 기존 `concept_profile_viewed`는 새 프로필이 실제 노출될 때의 경계를, `concept_detail_opened`는 대표 결 상세 진입 경계를 그대로 유지한다. 이벤트명, 발생 횟수, payload의 개인정보 수준을 확장하지 않는다.
- [ ] 공유 CTA는 기존 공유 이벤트와 native share/복사 fallback 분기를 그대로 사용한다. 같은 CTA를 중복 렌더해 view/click을 이중 집계하지 않는다.
- [ ] 새 로그, 대시보드, 사용자별 위치 로그를 추가하지 않는다. decoder 오류는 기존 오류 처리 경계에서 민감 payload 없이 처리한다.

## 개인정보와 악용 방지

- [ ] 프로필 API와 화면은 owner-only다. 기존 인증을 우회하거나 공유 링크를 통해 owner profile payload를 공개하지 않는다.
- [ ] `privateOthers` locked 상태는 위치 관련 키 자체를 반환하지 않는 fail-closed 계약으로 유지한다. CSS로만 숨기거나 `aria-label`, data attribute, 직렬화 payload에 값을 남기지 않는다.
- [ ] available 상태도 유한한 익명 `position`과 기존 direction/stage/evidence만 제공하며 UI가 비통계적 표현을 파생한다. 개인 응답, 응답자 ID, 개별 좌표, 원문, `displayRange`는 포함하지 않는다.
- [ ] 영역 summary는 self 질문 신호만 사용하며 지인의 방향이나 개인 응답을 섞지 않는다.
- [ ] private 응답의 `Cache-Control: no-store`, owner auth, 기존 익명 임계값과 민감 관계 결과 정책을 보존한다.

## 롤아웃과 복구

- [ ] 기존 `GYEOP_CONCEPT_PROFILE_ENABLED` feature flag를 그대로 사용한다. 꺼져 있으면 기존 fallback을 표시하고 새 endpoint/rail UI를 노출하지 않는다.
- [ ] DB와 저장 형식 변화가 없으므로 데이터 롤백은 없다. 회귀 시 flag를 끄거나 해당 PR을 되돌리면 기존 fallback으로 복구된다.
- [ ] decoder와 UI는 같은 PR에서 배포해 응답 계약 불일치 시간을 만들지 않는다. 배포 후 owner auth, no-store, locked/available fixture, `/me` fallback과 공유 fallback을 smoke test한다.

## 스펙 검토

Reviewer Agent: issue_161_critic_final
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 외부 블로커는 없다. #157과 #159의 기존 stage, kind, 익명 임계값 및 이벤트 계약을 변경하지 않는 것이 구현 전제다.
- [ ] 구현 중 현재 응답 키와 위 exact-key 계약이 충돌하면 필드 별칭이나 느슨한 decoder를 추가하지 않고 독립 spec reviewer에게 계약 수정을 요청한다.
