# Issue 11 구현 스펙: [디자인] P0 모바일 화면 상태와 디자인 토큰 명세 확정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/11

## 목표

서로 다른 방향을 보여 주는 목업 01–06과 현재 비공개 MVP 제품 계약을 대조해, 320–430px 모바일에서 구현자가 그대로 CSS custom properties와 화면 상태로 옮길 수 있는 단일 P0 UI 기준을 `docs/design/p0-mobile-ui-spec.md`에 확정한다.

## 범위

- `docs/design/p0-mobile-ui-spec.md`를 새로 만든다.
- 목업 01–06에서 유지할 시각 언어와 제품 SSOT 때문에 폐기하거나 보류할 표현을 명시한다.
- 색상, typography, spacing, radius, elevation/layer, motion, layout 토큰의 이름과 exact 값을 정의한다.
- 다음 화면의 default, loading, error, empty, disabled, success 및 도메인별 복구 상태를 표로 정의한다.
  - 시작과 팩 선택
  - 주인 셀프 10장
  - 공유 링크 관리
  - 방문자 관계·알게 된 시점
  - 방문자 필수 3장
  - 즉시 비교
  - 비공개 최소 프로필
  - 방문자 응답 철회
- 필수 3장 제출 전 셀프 답 잠금, 공개 링크 카드 표본 `n/3`, 비교 결과의 Primary/Secondary CTA 위계를 고정한다.
- 현재 비공개 재미 검증과 production beta 재승인 후보를 분리한다.
  - 현재 단계는 로그인 없이 same-browser owner capability로 저장한다.
  - 이메일 연결과 `/me/settings`, `/account-deletion/status`는 inactive 후보로 표시하되 계정 삭제 화면 상태와 안전한 복구 행동은 구현 가능한 수준으로 명세한다.
- 320/390/430px, 768px 이상 responsive desktop, safe area, 긴 한글 문구, 접근성, reduced motion 규칙을 정의한다.
- Lazyweb의 모바일 personality/profile 결과 사례와 현재 화면 기반 개선 보고서를 외부 디자인 근거로 기록한다.
- `docs/temp/qa/issue-11.md`에 독립 시각·접근성·계정 삭제 walkthrough 결과를 기록한다.

## 제외 범위

- React/Next.js 화면, CSS module, global CSS, route, API, DB, migration, auth 구현 변경
- 팩 이름·질문·선택지·관계 code·label 변경
- 로그인 또는 이메일 매직 링크 활성화
- production beta, 공개 프로필, 관계별 공개 프로필, 표시 이름·프로필 이미지 활성화
- 새 목업 이미지 대량 생성 또는 기존 목업 원본 수정
- 목업의 avatar, 점수, fixed 성격 label을 실제 데이터처럼 구현하는 결정

## SSOT

- `docs/product/core-feature-priority.md`: 비공개 MVP의 네 공식 팩, same-browser 저장, 주인 10장·방문자 3장·즉시 비교·비공개 프로필 경계
- `docs/product/question-pack-spec.md`: 모바일 카드 문구 길이, 관계·시점 registry, Signature와 균형 추출 규칙
- `docs/product/decision-log.md`: 현재 무이메일 owner capability, 공개 링크 시선만 누적, 동일 팩 Primary CTA, AI 없는 프로필
- `docs/engineering/p0-development-plan.md`: route·상태·token·계정 삭제 후보·접근성·성능 계약
- `docs/assets/mockups/01-product-overview.png` ~ `06-friend-contribution-flow.png`: 시각 방향 참고 자료. 제품 SSOT와 충돌하면 폐기하거나 inactive 후보로 분리한다.
- 현재 실행 UI의 `app/globals.css`와 화면별 CSS module: 이미 검증 중인 네온 색·다크 shell·44px target의 구현 기준 참고. 이 문서가 이번 이슈에서 코드를 변경하지는 않는다.
- AGENTS.md
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 예비 주인: 네 팩 중 하나를 고르고 별도 개봉 대기 없이 첫 질문으로 들어간다. 답변 저장·실패·완료 상태와 same-browser 7일 저장 한계를 이해한 뒤 공유로 이동한다.
- 방문자: 관계·시점을 고르고 셀프 답이 잠긴 상태로 필수 3장에 답한다. 제출 후에만 자신의 3장과 주인 답을 비교하고, 가장 눈에 띄는 Primary CTA로 같은 팩의 새 주인이 된다.
- 기존 주인: `/me`에서 실제 공개 링크 제출 수와 카드별 표본 `n/3`을 본다. 데이터가 충분하지 않을 때 성격 결과나 관계 레이어를 꾸며내지 않고, 시선이 한 건 이상일 때 같은 play 공유 관리로 돌아간다.
- 방문자 철회: 비밀 관리 링크가 있는 브라우저에서만 자신의 응답을 철회하며 성공·만료·오류를 구분한다.
- production beta 후보 계정 주인: `/me/settings`의 분리된 위험 구역에서 정책 확인과 재인증을 거친다. 삭제 요청 뒤 owner session과 무관한 `/account-deletion/status`에서 receipt로 pending/retry/completed를 복구하며 receipt 부재·만료는 계정 존재를 노출하지 않는다.

## 디자인 영향

- 앱 shell은 목업과 현재 구현의 검정 배경, 흰 글자, lime/blue/coral 강조를 단일 dark theme로 통합한다.
- `#dfff00`은 Primary CTA·선택·진행에, `#315cff`는 focus와 layer offset에, `#ff4d42`는 보조 팩 색 또는 경고에 사용한다. 파괴적 행동은 lime Primary와 분리된 danger semantic을 사용한다.
- 목업의 비스듬한 카드와 겹 표현은 실제 응답 축적을 설명할 때만 사용한다. 회전은 최대 1도, stack은 최대 4겹, avatar·관계 label·숫자는 실제 집계가 있을 때만 표시한다.
- 현재 비공개 `/me`는 공개 링크 제출만 누적하므로 목업 03·04의 관계별 다중 레이어는 production beta 후보로 잠근다. 현재 단계에서는 셀프 카드 위에 공개 링크 표본 상태를 쌓는 구조만 허용한다.
- comparison의 `나도 이 팩으로 시작하기`는 모든 성공 결과에서 첫 번째, full-width, lime Primary다. `2장 더 답하기`, 응답 관리 링크, 홈 이동은 Secondary 이하이며 Primary보다 먼저 배치하지 않는다.
- 계정 삭제는 설정 본문과 구분된 위험 구역, danger outline, 재인증 후 최종 확인으로 표현한다. pending/retry는 success color·완료 icon을 사용하지 않는다.

## API와 데이터 영향

- API, schema, migration, auth, storage, runtime data 변경 없음.
- 상태표는 기존 route와 domain state를 새로 만들지 않고 사용자에게 어떻게 표현할지만 정의한다.
- 문서에는 raw secret, 실제 invite URL, 이메일, 개별 답변 값을 예시 데이터로 넣지 않는다.
- production beta account deletion 상태는 `pending`, `retry`, `completed`, receipt missing/expired의 public-generic 표현만 정의하고 내부 job·UID·오류 원문을 노출하지 않는다.

## 구현 계획

1. 현재 실행 홈을 320/390/430px에서 캡처하고 목업 01–06 및 Lazyweb 모바일 quiz/profile 사례와 비교한다.
2. 제품 SSOT를 기준으로 목업 요소를 `유지`, `수정`, `inactive 후보`, `폐기`로 분류한다.
3. 기존 CSS 값과 WCAG 대비·44px target을 고려해 primitive/semantic/layout/motion token registry를 exact CSS custom property 값으로 작성한다.
4. 핵심 화면 8개와 production beta 계정 삭제 2개 화면의 상태표, CTA 순서, loading/error/recovery 행동을 작성한다.
5. 320/390/430px 및 desktop 규칙, focus, live region, reduced motion, 긴 문구 checklist를 작성한다.
6. 독립 spec review에서 P0/P1 0건을 확인하고 `status:implementing`으로 전환한다.
7. 최종 문서를 문구·visual·accessibility·계정 삭제 walkthrough로 독립 QA하고 `docs/temp/qa/issue-11.md`에 증거를 남긴다.
8. focused 문서 검사와 마지막 clean commit에서 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 완료 기준

- `docs/design/p0-mobile-ui-spec.md`에 CSS custom properties로 복사할 수 있는 color, type, space, radius, shadow/layer, motion, layout token 이름과 exact 값이 있다.
- 목업 01–06 각각의 유지·수정·보류/폐기 결론과 이유가 제품 SSOT에 연결된다.
- 시작, 주인 10장, 공유, 관계·시점, 방문자 3장, 비교, 프로필, 철회의 default/loading/error/empty/disabled/success 상태와 복구 행동이 있다.
- 필수 3장 제출 전 셀프 답은 어떤 loading/error 상태에서도 노출되지 않는다.
- 현재 비공개 프로필에서 공개 링크 시선만 누적하고, 카드 표본 미달은 선택 수 대신 `시선을 모으는 중 · n/3`으로 표시한다.
- 목업의 관계 layer는 현재 private MVP 데이터 경계와 production beta 후보가 구분되며, avatar·점수·성격 label을 꾸며내지 않는다.
- 비교 성공의 Primary CTA는 항상 `나도 이 팩으로 시작하기`이고 Secondary가 선행하거나 같은 강조를 갖지 않는다.
- `/me/settings`와 `/account-deletion/status`의 정책 안내, 파괴적 확인, 재인증, pending, retry, completed, receipt 부재/만료, 오류가 정의된다. 응답 유실은 receipt가 있으면 status reload, 없고 인증 증거가 유효하면 동일 DELETE의 idempotent receipt 재발급, signed-out이면 계정 존재를 노출하지 않는 generic completed/no-new-job 안내로 수렴한다.
- 계정 삭제 pending/retry는 완료로 오인할 색·icon·문구를 쓰지 않고, receipt 부재/만료는 계정·job 존재를 노출하지 않는다.
- 320/390/430px에서 required flow의 가로 넘침이 없고 44×44 target, visible focus, WCAG AA, screen reader status, reduced motion 기준이 있다.
- Lazyweb search와 current-screen report URL, 3개 viewport 검수 결과, 독립 시각 review, 접근성 checklist가 문서 또는 QA artifact에 남는다.
- `./scripts/task-harness spec-check docs/specs/issue-11.md`, `./scripts/task-harness qa-check docs/temp/qa/issue-11.md`, `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `./scripts/task-harness spec-check docs/specs/issue-11.md`
- 문서 focused 검사
  - token 표의 모든 항목이 `--g-*` 이름과 exact CSS 값 보유
  - 화면 상태표 10개와 required state keyword 존재
  - 목업 01–06 대조표, viewport 320/390/430, accessibility checklist 존재
- Playwright로 실행 중인 비공개 홈을 320×800, 390×844, 430×932에서 캡처해 현재 baseline의 overflow, pack 선택 위계, 44px target을 확인한다.
- account deletion walkthrough: settings → reauth → destructive confirmation → status pending → retry → completed, response loss의 receipt 있음/없음+인증 유효/없음+signed-out 세 분기, receipt missing/expired generic 안내를 문서 상태 전이로 추적한다.
- 독립 reviewer가 목업, 제품 경계, CTA 위계, WCAG/reduced motion을 확인한다.
- 마지막 clean commit에서 `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- analytics event 추가·변경 없음.
- UI 상태 명세는 event payload에 관계, 시점, 응답 선택, email, raw URL/secret을 추가하지 않는다.
- loading/error/success 표현은 observability의 내부 오류 원문이나 identifier를 사용자 문구로 노출하지 않는다.

## 개인정보와 악용 방지

- 필수 3장 제출 전 셀프 답과 집계를 placeholder 뒤에 미리 render하거나 blur로 노출하지 않는다.
- profile layer에는 집계 threshold를 통과한 실제 공개 링크 데이터만 사용하며 1:1 응답, 민감 관계, 개별 방문자 선택을 넣지 않는다.
- 방문자 관리 링크와 account deletion receipt는 화면의 명시적 복사/상태 요청 외 analytics·log·문서 예시에 기록하지 않는다.
- 파괴적 화면은 사용자에게 삭제 범위를 설명하되 account/job 존재, UID, email, 내부 retry 이유는 노출하지 않는다.
- 색만으로 selection, match/mismatch, error, success, locked 상태를 전달하지 않고 문구·icon/shape·ARIA state를 함께 사용한다.

## 롤아웃과 복구

- 문서 전용 PR이며 runtime rollout, feature flag, migration 없음.
- 후속 UI 이슈는 이 문서의 token/state section을 참조하되, 현재 private MVP와 inactive production beta section을 섞어 구현하지 않는다.
- 문서가 제품 SSOT와 충돌하면 제품 SSOT가 우선하며 이 문서와 해당 후속 이슈를 함께 수정한다.
- 회귀 시 이 PR의 design/spec/QA 문서만 되돌리면 runtime 동작은 바뀌지 않는다.

## 스펙 검토

Reviewer Agent: issue11_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- Lazyweb 보고서가 외부 패턴을 제안하더라도 fixed personality score, avatar social proof, 강제 가입은 제품 SSOT와 충돌하므로 채택하지 않는다.
- 현재 private MVP에는 owner 로그인과 계정 삭제가 없다. 계정 연결·삭제 명세는 production beta 재승인 후보일 뿐 이번 PR에서 활성화하지 않는다.
- 정확한 보관 기간과 backup 완전 삭제 시한은 아직 차단점이며 UI는 확정되지 않은 숫자를 약속하지 않는다.
- 관계별 layer와 공개 프로필은 P1/production beta 후보이므로 현재 `/me` 명세에서 활성 결과처럼 보이지 않게 한다.
