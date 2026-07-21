# Issue 100 구현 스펙: 카드팩 개봉 모션을 실링 찢기·TCG 카드 추출 방식으로 교정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/100

## 목표

문처럼 벌어지는 현 개봉 도형을 세로형 포일 팩의 상단 실링을 찢고 표준 TCG 비율 카드를 위로 꺼내는 장면으로 교정한다.

## 범위

- [ ] `app/play/play-transition.tsx`의 좌우 대칭 플랩을 단일 tear strip과 열린 mouth로 바꾸고, 스크롤 진행도를 anticipation → tear → extract → settle 순서로 다시 보간한다.
- [ ] 추출 카드는 표준 트레이딩 카드 2.5×3.5인치와 같은 `aspect-ratio: 5 / 7`을 사용하고, 시작부터 끝까지 같은 비율을 유지한다.
- [ ] `app/play/play-transition.module.css`의 작은 가로형 shell을 카드보다 조금 큰 세로형 포일 wrapper로 바꾼다.
- [ ] 초기 카드 `scale 0.36 → 1` 급확대를 없애고 작은 곡선 이동, 종이 수준의 3–5% 이내 overshoot, 늦게 따라오는 그림자로 추출 무게감을 만든다.
- [ ] 기존 약 220px runway, 85% 스냅, 역스크롤, 버튼, reduced-motion, API 병렬 실행과 질문 handoff 계약을 보존한다.
- [ ] Playwright에서 새 구조·비율·중간 진행도와 기존 owner flow 회귀를 검증한다.

## 제외 범위

- [ ] 사운드, 햅틱, 파티클, WebGL, 이미지·영상 자산은 추가하지 않는다.
- [ ] 실제 포켓몬 카드의 그래픽·캐릭터·상표는 사용하지 않고 크기 비율만 표준 TCG 규격을 따른다.
- [ ] 질문 카드 본문 디자인, 팩 선택 화면, API·DB·Supabase 계약은 바꾸지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- [ ] 주인이 홈에서 팩을 선택하면 기존과 동일하게 owner 생성·재개가 시작되고, 별도 확인 화면 없이 교정된 개봉 장면을 거쳐 첫 질문으로 이동한다.
- [ ] 방문자와 전환된 새 주인의 응답·same-pack 흐름은 변경하지 않는다.
- [ ] 기존 play 직접 진입과 reduced-motion 환경은 개봉을 재생하지 않고 즉시 질문을 보여 준다.

## 디자인 영향

- [ ] 감정 목표는 `손으로 포일을 뜯고 카드를 얻는 기대감`, motion personality는 Playful로 고정한다.
- [ ] setup: 세로형 팩과 카드가 같은 중심축에 있고 카드는 포일 뒤에 가려진다.
- [ ] tear: 좌우 대칭 회전 없이 상단 실링 한 조각이 왼쪽 위 곡선으로 벗겨지고 mouth가 얇게 열린다.
- [ ] extract: 카드가 거의 같은 크기를 유지한 채 작은 x 이동·회전과 함께 위로 빠져나오며 wrapper는 늦게 아래로 물러난다.
- [ ] settle: 카드가 `5 / 7` 비율로 중앙에 정착하고 그림자가 50ms 안쪽으로 뒤따른다.
- [ ] 카드 폭은 320/390/430px에서 viewport의 약 56–60%(최대 15rem), wrapper는 약 61–68%(최대 16.5rem)로 제한해 화면을 과점유하지 않는다.
- [ ] 320×800, 390×844, 430×932에서 팩·카드·문구가 잘리지 않고 44px 버튼을 유지한다.

## API와 데이터 영향

- [ ] 없음. owner API 병렬 실행, route transition, cookie, schema, migration, storage, auth 계약을 그대로 둔다.

## 구현 계획

- [ ] `app/play/play-transition.tsx`: 기존 `leftFlap`/`rightFlap` MotionValue와 markup을 삭제하고 tear strip, mouth, card x/y/rotate/scale, wrapper settle 값만 둔다.
- [ ] `app/play/play-transition.module.css`: `innerCard`와 `packShell`을 `5 / 7` 기반 세로형으로 만들고, tear edge와 foil 질감은 CSS pseudo-element·gradient로만 표현한다.
- [ ] `app/play/new/bootstrap.tsx`, `app/play/[playId]/owner-play.tsx`: begin/resolve/abort/complete 호출 시점과 route handoff state machine이 그대로인지 읽고 확인하되 변경은 필요할 때만 한다.
- [ ] `tests/e2e/owner-play.spec.ts`: 좌우 플랩 부재, 카드 5:7 비율 허용 오차, tear/extract 중간 상태, 320/390/430 viewport를 검증한다.
- [ ] `docs/product/decision-log.md`: #98의 사용자 제어 계약은 유지하되 시각 문법을 대칭 봉인 분리에서 단일 실링 찢기와 TCG 카드 추출로 교정했다고 기록한다.

## 완료 기준

- [ ] DOM과 화면에 좌우 대칭 flap이 없고, 하나의 tear strip이 왼쪽 위로 이동한 뒤 사라진다.
- [ ] 추출 카드의 렌더 폭/높이 비율이 모든 목표 viewport에서 `5 / 7`에 ±0.02 이내다.
- [ ] 0–85%에서는 역스크롤로 tear와 카드가 되감기고 85% 이후에는 기존처럼 완료 위치로 정착한다.
- [ ] 카드 scale은 전체 구간 0.92–1.03 안에 있어 갑자기 커지는 카드처럼 보이지 않는다.
- [ ] 느린 owner API에서는 추출 완료 자세로 기다리고, API·route read 실패에서는 overlay가 제거돼 기존 오류 UI를 막지 않는다.
- [ ] 키보드 `팩 열기`와 `prefers-reduced-motion: reduce` 계약이 유지된다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm exec playwright test tests/e2e/owner-play.spec.ts --project=mobile-chromium`
- [ ] no-preference 환경에서 0%, tear 중간, extract 중간, settle 화면을 캡처하고 문짝 인상·카드 비율·잘림을 수동 검수한다.

## 분석과 관측성

- [ ] 없음. 기존 pack selected·owner start 이벤트와 API 호출 시점을 바꾸지 않는다.

## 개인정보와 악용 방지

- [ ] 없음. 장식 DOM은 `aria-hidden`을 유지하고 owner/visitor 데이터·비밀·링크를 표시하거나 저장하지 않는다.

## 롤아웃과 복구

- [ ] 기존 transition host 내부 변경이라 feature flag와 migration은 없다. 회귀 시 PR revert로 #98 시각 구현으로 복구한다.
- [ ] Render 배포 뒤 `/play/new?pack=<active-slug>`의 새 번들·HTTP 200과 실제 모바일 개봉을 smoke 확인한다.

## 스펙 검토

Reviewer Agent: issue_100_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 없음. 팩/카드 크기는 특정 IP 시각 복제가 아닌 표준 TCG 비율과 자체 GYEOP 그래픽을 사용한다.
