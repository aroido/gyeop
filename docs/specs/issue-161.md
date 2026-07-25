# Issue 161 구현 스펙: [P0] 누적 질문 신호 기반 양방향 상위개념 프로필로 개편

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/161

## 목표

`/me`의 owner-only 상위개념 프로필을 자연어 해석문 중심 화면에서 양쪽 개념 끝점, 내 위치, 임계값을 충족한 지인 익명 집계, 누적 질문 근거가 한눈에 보이는 8개 영역 적층 프로필로 개편한다.

## 범위

- [ ] 기존 상위개념 응답의 각 결에 `directionA`와 `directionB`를 제공하고, 기존 `directionScore`를 새 점수로 재계산하지 않은 채 `-1..1`로 clamp하여 내 표시 위치로 재사용한다. `-1`은 `directionA`, `0`은 중립, `1`은 `directionB`다.
- [ ] 지인 익명 집계가 `available`인 결은 기존 익명 중심 위치와 근거 단계를 이용해 비통계적 표시 범위를 제공한다. 이는 확률, 신뢰구간, 백분율, 정밀도 점수가 아니라 근거 적층 단계를 시각화하는 UI 계약이다.
- [ ] 같은 방향으로 모인 A/B 집계는 기존 익명 중심을 `-1..1`로 clamp하고, `trace`는 중심 `±0.36`, `outline`은 `±0.24`, `clear`는 `±0.14` 범위를 사용한다. 시작과 끝도 각각 `-1..1`로 clamp한다.
- [ ] `contextual` 집계는 중앙으로 평균 내지 않고 양쪽 분할 범위로 제공한다. 단계별 범위는 `trace=[-1,-0.20]·[0.20,1]`, `outline=[-1,-0.35]·[0.35,1]`, `clear=[-1,-0.50]·[0.50,1]`이다.
- [ ] `unsettled` 집계는 근거가 늘어도 방향을 단정하지 않도록 `[-0.55,0.55]`의 넓은 중립 범위를 제공한다. 단계 변화는 카드 신호층에만 반영하고 중립 범위를 좁히지 않는다.
- [ ] `privateOthers.status === "locked"`일 때는 기존 `시선을 모으는 중 · n/3` 진행 상태만 유지하며, 지인 중심 위치, 방향, 범위 또는 이를 추정할 수 있는 필드를 API에 포함하거나 UI에 렌더하지 않는다.
- [ ] 8개 영역 각각에 self 질문 신호만으로 area summary를 만든다. 같은 `cardKey`는 영역 안에서 한 번만 세고, 고유 `cardCount`, `packCount`, `contextCount`, 기존 기준으로 계산한 `stage`만 제공한다.
- [ ] 하나의 질문이 여러 `conceptSignals`를 가져도 질문-결 연결은 각 결에 반영하되, 같은 결과 같은 영역의 집계에서는 동일 `cardKey`를 중복 계산하지 않는다. 한 영역의 4개 결 방향값은 합산, 평균 또는 단일 방향으로 변환하지 않는다.
- [ ] 대표 결은 기존 `difference`, `contextual`, `repeated`, `emerging` kind 우선순위와 기존 동률 정렬을 유지한다. 정렬된 목록에서 아직 선택하지 않은 `areaId`의 첫 결을 우선 담아 최대 3개를 만들고, 서로 다른 영역이 3개보다 적을 때만 남은 목록 순서로 채운다.
- [ ] `/me`의 1차 결과 UI에서 자연어 `profileLead`, `observation`, 대화형 `question`/blockquote와 긴 도움말을 제거하고, 대표 결 카드에는 영역명, 결 이름, `directionA — directionB`, 내 위치, 허용된 지인 익명 범위, 고유 문항 수, 근거 단계만 표시한다.
- [ ] 대표 카드의 `trace`, `outline`, `clear`를 색 농도 대신 기존 hard-offset 카드 뒤 신호층 1장, 2장, 3장으로 구분한다. 전면에는 `cardCount`만 표시하고 `packCount`와 `contextCount`는 기존 상세 진입 후에만 표시한다.
- [ ] 나머지 영역은 방향값 없이 `cardCount`, `packCount`, `contextCount`, `stage`만 보여주는 compact area rail로 표시한다.
- [ ] 결과 바로 다음에 기존 공유 동작을 사용하는 대표 공유 CTA를 정확히 한 번만 배치한다. 질문팩 관리는 별도 보조 영역으로 유지한다.
- [ ] 기존 feature flag/빈 결과 fallback, owner 인증, private `Cache-Control: no-store`, 공유 실패 fallback, 접근성 focus 복귀, 기존 분석 이벤트 경계를 보존한다.
- [ ] API와 클라이언트 strict decoder, 단위·통합·E2E 테스트, 제품 결정 문서, 모바일 시각 QA 산출물을 함께 갱신한다.

## 제외 범위

- [ ] 새 DB 테이블, 컬럼, 마이그레이션, 저장 형식 또는 외부 의존성을 추가하지 않는다.
- [ ] 질문팩/카드 콘텐츠, 상위개념 카탈로그 v2, 9:16 공유 카드, 팩 완료 후 신호 확산 애니메이션은 변경하지 않는다.
- [ ] 공개 프로필, 방문자 개인 위치, 응답자 목록, 개별 지인 위치를 추가하지 않는다.
- [ ] MBTI형 코드, 고정 유형, AI 성격 문장, 백분율, 순위, 공개 점수 또는 통계적 신뢰도를 만들지 않는다.
- [ ] 기존 익명 집계 임계값, stage 기준, kind 우선순위 자체를 재정의하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/product/concept-graph-design.md
- docs/design/mockups/concept-profile-v2/29-app-style-precision-growth.png
- AGENTS.md
- GitHub issues #157, #159, #161
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
- [ ] `trace/outline/clear`의 카드 뒤 신호층은 각각 1/2/3장으로 고정하고 reduced motion에서는 전환·이동 애니메이션 없이 최종 상태만 표시한다.
- [ ] compact area rail은 8개 영역 모두를 누락 없이 표시하되 방향 축을 그리지 않고 근거 수와 단계만 표현한다.
- [ ] 320px에서 가로 스크롤, 텍스트 잘림, 축 endpoint 겹침이 없어야 한다. 390px과 430px에서는 정보 순서와 한 번의 공유 CTA를 유지하며 여백만 확장한다.
- [ ] 200% 확대에서도 DOM 읽기 순서, 카드 내용, focus ring, 최소 44×44px 상호작용 영역이 유지되고 고정 높이로 콘텐츠를 자르지 않는다.

## API와 데이터 영향

- [ ] `lib/owner-profile/concept-profile-core.mjs`는 저장된 self/others 신호와 기존 stage/kind 계산기를 재사용해 endpoint, clamp 위치, 익명 표시 범위와 area summary를 계산한다. 계산 결과를 영속화하지 않는다.
- [ ] 각 concept 항목은 기존 키에 `directionA: string`, `directionB: string`을 추가하고 기존 `directionScore: number`를 `-1..1` 범위의 내 표시 위치로 유지한다. NaN, Infinity와 범위 밖 원본은 렌더 경계에서 각각 거부 또는 clamp하며 새 `selfPosition` 같은 중복 필드는 만들지 않는다.
- [ ] `privateOthers`는 status로 구분한다. `locked` variant는 기존 잠금 진행 키만 허용하고 위치·범위 키를 금지한다. `available` variant는 기존 익명 집계 키에 `displayRange`를 추가한다.
- [ ] `displayRange`의 exact-key 계약은 다음과 같다.
  - `directional`: `{ kind, center, start, end }`
  - `contextual`: `{ kind, negative: { start, end }, positive: { start, end } }`
  - `unsettled`: `{ kind, start, end }`
- [ ] 모든 `center`, `start`, `end`는 유한한 `-1..1` 수여야 한다. directional은 `start <= center <= end`, contextual은 `negative.start <= negative.end < 0 < positive.start <= positive.end`, unsettled은 `start < 0 < end`여야 한다. 역전, 범위 초과, 유한하지 않은 값은 decoder가 거부한다.
- [ ] area summary exact-key 계약은 `{ areaId, areaLabel, cardCount, packCount, contextCount, stage }`다. 응답은 카탈로그의 8개 영역을 정확히 한 번씩 포함해야 하며 중복 `areaId`, 알 수 없는 `areaId`, 음수/비정수 count, 허용되지 않은 stage, 누락/추가 키를 decoder가 거부한다.
- [ ] strict decoder는 기존 객체의 허용 키 목록에 위 키만 명시적으로 더한다. concept, `privateOthers`, `displayRange`, 중첩 범위, area summary 각 수준에서 누락 키와 알 수 없는 추가 키를 모두 거부한다.
- [ ] `lib/http/owner-concept-profile.ts`와 `app/api/me/concept-profile/route.ts`는 기존 owner session 인증과 private response의 `Cache-Control: no-store`를 유지한다. 다른 사용자의 응답 내용, 응답자 식별자, 개별 위치를 반환하지 않는다.
- [ ] 기존 DB 질의와 응답의 `cardCount`, `packCount`, `contextCount`, `stage`, `kind`, 익명 임계값을 재사용한다. 새 저장소, 마이그레이션, dependency는 없다.

## 구현 계획

- [ ] `lib/owner-profile/concept-profile-core.mjs`: 기존 `directionScore` clamp, stage별 directional 표시 범위, contextual 양쪽 분할, unsettled 중립 범위, locked 완전 비노출, `cardKey` 중복 제거 area summary, 대표 결의 서로 다른 `areaId` 우선 선택을 순수 계산으로 구현한다.
- [ ] `lib/owner-profile/concept-profile.ts`: core 결과의 TypeScript 타입과 owner-only 응답 조립을 새 discriminated union 및 8개 area summary 계약에 맞춘다. 기존 count/stage/kind 입력을 재사용한다.
- [ ] `lib/http/owner-concept-profile.ts`: strict decoder에 endpoint, 위치, displayRange variant와 area summary exact-key 검증을 추가하고 중복 영역 및 잘못된 위치 관계를 거부한다.
- [ ] `app/api/me/concept-profile/route.ts`: 새 응답을 전달하면서 현행 auth, feature flag, 오류 응답, `no-store` 헤더를 보존한다.
- [ ] `app/me/account-profile-view.tsx`: 1차 UI의 `profileLead`, `observation`, `question`/blockquote, 긴 도움말을 제거하고 대표 결 3개, 위치/범위, area rail, 결과 직후 공유 CTA 한 번, 기존 fallback/상세/팩 관리 흐름을 렌더한다. screen reader 요약과 공유 fallback focus를 유지한다.
- [ ] `app/me/owner-list.module.css`: 기존 색 토큰과 hard-offset 스타일 안에서 단계별 1/2/3 신호층, 축, 서로 다른 marker, compact area rail, 320/390/430px 반응형, 200% 확대, focus-visible, reduced-motion 규칙을 최소 변경으로 추가한다.
- [ ] `tests/unit/concept-profile.test.mjs`: clamp 경계, 다중 conceptSignals, concept/area별 동일 `cardKey` dedupe, 8개 summary count/stage, 4개 결 방향 미합산, distinct-area 대표 선택, stage별 directional/contextual/unsettled 범위, locked 비노출을 검증한다.
- [ ] `tests/unit/concept-profile-client.test.mjs`: 새 exact-key 응답의 성공과 누락/추가 키, NaN/범위 밖/역전 위치, locked 위치 키 혼입, 중복·미지·누락 areaId의 실패를 검증한다.
- [ ] `tests/e2e/concept-profile-live.spec.ts`: feature flag on/off, owner auth, 빈 결과 fallback, 0/1/2/3 지인 임계값, 초기/누적 근거 fixture, 대표 결 3개와 8개 rail, 공유 CTA 단일 노출 및 fallback, 기존 상세 이벤트를 검증한다.
- [ ] `docs/product/concept-graph-design.md`: endpoint, 위치, 익명 표시 범위, area summary를 비통계적 시각 계약으로 기록한다.
- [ ] `docs/product/decision-log.md`: 자연어 해석문보다 양방향 누적 신호를 우선하는 결정과 개인정보 비노출 경계를 기록한다.
- [ ] `docs/temp/qa/issue-161.md`: 독립 QA reviewer가 검증 명령, P0/P1/P2 판정, 접근성·시각 증거와 스크린샷 경로를 기록한다.

## 완료 기준

- [ ] 대표 결 최대 3개가 기존 kind 정렬을 기반으로 가능한 한 서로 다른 `areaId`에서 선택되고, 각 카드에 `directionA`와 `directionB`가 항상 함께 보인다.
- [ ] 기존 `directionScore`가 `-1..1`로 clamp된 내 위치로 표시되며 `-1/0/1`의 endpoint 의미가 단위 테스트와 screen reader 문구에서 일치한다.
- [ ] 지인 집계가 locked인 0/1/2 응답 상태에서는 `n/3` 외에 중심, 방향, 범위, 숨은 접근성 텍스트 또는 DOM 속성으로도 위치 정보가 노출되지 않는다.
- [ ] available directional 집계는 trace/outline/clear별 고정 폭, contextual은 양쪽 분할, unsettled은 넓은 중립 범위로 렌더되며 확률·신뢰도·백분율 문구를 사용하지 않는다.
- [ ] 같은 `cardKey`가 여러 신호를 가져도 같은 결과 area summary에서 한 번만 세고, 8개 area summary에는 count와 stage 외의 방향 합산값이 없다.
- [ ] `trace/outline/clear` 카드가 각각 1/2/3장의 신호층을 보이고 전면에는 `cardCount`만, 상세에는 기존 `packCount/contextCount`가 보인다.
- [ ] 1차 프로필에 `profileLead`, 자연어 `observation`, 대화형 `question`/blockquote, AI 성격 문장, 고정 타입, 공개 점수, 백분율이 렌더되지 않는다.
- [ ] 대표 결과 바로 다음에 공유 CTA가 정확히 한 번 있고, 공유 성공·권한 거절·미지원 환경의 기존 fallback과 분석 이벤트가 회귀하지 않는다.
- [ ] feature flag off 또는 개념 결과 없음 fallback, 질문팩 관리, owner auth, private `no-store` 경계가 그대로 동작한다.
- [ ] decoder가 객체별 exact keys를 강제하고 잘못된 위치 관계, 범위 밖 수, locked 위치 혼입, 중복·미지·누락 areaId를 거부한다.
- [ ] 320/390/430px, 200% 확대, 키보드 전용 사용, focus-visible/복귀, screen reader 읽기 순서, reduced motion 검증이 모두 통과하고 지정 스크린샷 산출물이 남는다.
- [ ] 새 DB/마이그레이션/dependency 없이 focused 검증, `./scripts/run-ai-verify --mode full`, 동일 HEAD 필수 CI가 통과한다.

## 테스트 계획

- [ ] Unit: `node --test tests/unit/concept-profile.test.mjs tests/unit/concept-profile-client.test.mjs`
- [ ] Integration: owner session이 없는 요청의 거부, owner 요청의 성공, private `Cache-Control: no-store`, feature flag off/빈 결과 fallback, strict decoder 실패를 기존 route/client 테스트에서 확인한다.
- [ ] E2E: `tests/e2e/concept-profile-live.spec.ts`에서 임계값 0/1/2/3, directional/contextual/unsettled, 대표 결/area rail, 상세, 공유 성공과 fallback을 실행한다.
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
- [ ] available 상태도 익명 중심과 비통계적 표시 범위만 제공하며 개인 응답, 응답자 ID, 개별 좌표, 원문을 포함하지 않는다.
- [ ] 영역 summary는 self 질문 신호만 사용하며 지인의 방향이나 개인 응답을 섞지 않는다.
- [ ] private 응답의 `Cache-Control: no-store`, owner auth, 기존 익명 임계값과 민감 관계 결과 정책을 보존한다.

## 롤아웃과 복구

- [ ] 기존 `GYEOP_CONCEPT_PROFILE_ENABLED` feature flag를 그대로 사용한다. 꺼져 있으면 기존 fallback을 표시하고 새 endpoint/rail UI를 노출하지 않는다.
- [ ] DB와 저장 형식 변화가 없으므로 데이터 롤백은 없다. 회귀 시 flag를 끄거나 해당 PR을 되돌리면 기존 fallback으로 복구된다.
- [ ] decoder와 UI는 같은 PR에서 배포해 응답 계약 불일치 시간을 만들지 않는다. 배포 후 owner auth, no-store, locked/available fixture, `/me` fallback과 공유 fallback을 smoke test한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- [ ] 외부 블로커는 없다. #157과 #159의 기존 stage, kind, 익명 임계값 및 이벤트 계약을 변경하지 않는 것이 구현 전제다.
- [ ] 구현 중 현재 응답 키와 위 exact-key 계약이 충돌하면 필드 별칭이나 느슨한 decoder를 추가하지 않고 독립 spec reviewer에게 계약 수정을 요청한다.
