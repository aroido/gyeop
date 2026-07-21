# Issue 115 구현 스펙: [프론트] 상단 뜯기 제거와 질문 카드 즉시 전환

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/115

## 목표

상단 실링 조각을 뜯는 연출을 제거하고, 개봉 중 첫 질문 데이터를 미리 준비해 팩의 마지막 프레임에서 실제 질문 카드로 즉시 이어지게 한다.

## 범위

- [x] `public/animations/gyeop-pack-opening.json`에서 `tear-strip` 레이어를 제거하고 기존 팩 입구·카드 추출 동작만 유지한다.
- [x] 팩 생성 응답 뒤 첫 질문에 필요한 owner play·pack 데이터를 개봉 중 1회 미리 준비하고 `/play/[playId]` 진입에서 재사용한다.
- [x] 사용자 입력이 먼저 끝났을 때는 카드가 팩에서 빠져나왔지만 아직 settle 전인 Lottie 94번 프레임(`HANDOFF_FRAME = 94`)에서 대기하고, 데이터가 준비되는 즉시 119번 마지막 프레임과 라우트 전환을 연속 실행한다.
- [x] 기존 `opened-waiting` 정지 상태와 `첫 질문을 준비하고 있어요…` 문구를 제거한다.
- [x] 변경된 제품 결정을 `docs/product/decision-log.md`에 기록하고 Lottie 단위 테스트 및 owner Playwright 회귀 테스트를 갱신한다.

## 제외 범위

- [x] 3D/WebGL, Rive, 새 애니메이션 라이브러리, 음향·진동·파티클은 추가하지 않는다.
- [x] 질문 카드 본문 디자인, 답변 저장 방식, 팩 콘텐츠와 카탈로그는 변경하지 않는다.
- [x] 직접 `/play/[playId]`로 진입하거나 `/me/plays/[playId]` 공유 관리로 진입할 때의 서버 재조회와 오류 복구 화면은 변경하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- [x] 홈 또는 `나도 이 팩으로 시작하기`에서 들어온 새 주인은 상단 조각 없이 팩 입구가 벌어지고 카드가 올라오는 장면만 본다.
- [x] 개봉 입력이 데이터보다 먼저 끝나도 열린 팩의 최종 포즈에서 멈추지 않고, 데이터 준비 뒤 남은 추출 동작과 첫 질문 화면이 바로 이어진다.
- [x] 기존 owner의 10장 답변, 방문자 3장 응답, 비교·공유 흐름은 변하지 않는다.

## 디자인 영향

- [x] `/play/new?pack=<slug>`의 팩 개봉 오버레이만 변경한다. TCG 5:7 카드 비율, 검정·라임·블루 시각 언어, 약 220px 스크롤 runway와 85% 스냅은 유지한다.
- [x] Lazyweb가 연결한 Emil Kowalski의 design-engineering 지침에 따라 상태 전환의 목적을 질문 진입 설명으로 한정하고, 완전 정지 뒤 별도 로딩 상태를 노출하지 않으며 transform/opacity 중심의 짧은 handoff를 유지한다.

## API와 데이터 영향

- [x] API route, 응답 schema, DB, migration, auth 변경은 없다.
- [x] 클라이언트의 기존 `POST /api/plays` 응답과 `GET /api/packs/:slug` 결과를 메모리의 1회성 preload로 묶어 다음 owner 질문 route에서만 소비한다. preload 실패 시 해당 항목을 지우고 기존 route 조회 경로로 안전하게 복구한다. `app/me/plays/[playId]/share-link-manager.tsx`의 일반 `loadOwnerFlow` 호출은 preload를 소비하지 않는다.

## 구현 계획

- [x] `lib/owner-flow/owner-flow-client.ts`: 생성 직후 play와 pack을 묶는 1회성 preload/consume 경로를 추가하고 direct route의 기존 load 경로는 유지한다.
- [x] `app/play/new/bootstrap.tsx`: 개봉과 병렬로 preload를 시작하고 성공·실패 어느 경우에도 play id handoff를 계속한다.
- [x] `app/play/[playId]/owner-play.tsx`: 질문 route만 1회성 preload를 먼저 소비하고, 없으면 기존 `loadOwnerFlow`를 호출한다.
- [x] `app/play/play-transition.tsx`: `opened-waiting`을 `committing`으로 대체하고 스크롤 scrub 상한을 94/119로 고정한다. 데이터가 없으면 94번 프레임에 정착하고, 준비되면 119번 프레임 뒤 즉시 `router.replace`한다.
- [x] `public/animations/gyeop-pack-opening.json`: 상단 tear 레이어만 제거한다.
- [x] `docs/product/decision-log.md`, `tests/unit/pack-opening-lottie.test.mjs`, `tests/unit/owner-flow-client.test.mjs`, `tests/e2e/owner-flow-fixture.ts`, `tests/e2e/owner-play.spec.ts`: 새 계약과 회귀 증거를 기록한다.

## 완료 기준

- [x] Lottie 레이어 목록에 `tear-strip`이 없고 상단에서 분리되어 이동하는 조각이 렌더링되지 않는다.
- [x] 정상 생성 경로는 팩 개봉 중 pack 데이터를 준비하며, `/play/[playId]` 진입이 같은 준비 결과를 1회 소비한다.
- [x] 개봉 완료 뒤 `opened-waiting` 상태나 준비 문구가 나타나지 않으며, 마지막 프레임 도달 직후 route handoff가 시작된다.
- [x] 느린 preload에서는 프레임 119가 아니라 정확히 94번 프레임에서 기다렸다가 준비 완료 후 끝까지 진행한다.
- [x] preload의 첫 pack 요청만 1회 실패하면 항목을 폐기하고 route fallback 재조회로 첫 질문이 열린다. pack 요청을 2회 연속 실패시키면 기존 route 오류 화면이 표시된다.
- [x] 직접 owner route의 play read 실패는 preload와 무관하게 기존 오류 화면을 표시한다.
- [x] 역스크롤, 85% 스냅, 버튼, reduced motion, Lottie 실패 fallback, 중복 생성 방지와 direct route 오류 복구가 유지된다.

## 테스트 계획

- [x] `node --test tests/unit/pack-opening-lottie.test.mjs tests/unit/owner-flow-client.test.mjs`
- [x] `pnpm exec playwright test tests/e2e/owner-play.spec.ts --workers=1`
- [x] `scripts/task-harness pr 115`가 소유하는 `./scripts/run-ai-verify --mode full`
- [x] 배포 후 실제 `/play/new?pack=old-friend`에서 상단 조각 부재와 마지막 프레임→첫 질문 연속 전환을 확인한다.

## 분석과 관측성

- [x] 기존 `owner_play_started` 계열 요청·entry source 계약은 유지하며 새 analytics 이벤트나 로그 필드는 추가하지 않는다.

## 개인정보와 악용 방지

- [x] preload는 현재 탭 메모리의 1회성 Promise만 사용하고 cookie, owner capability, 답변 원문을 새 저장소나 로그에 복제하지 않는다.
- [x] play id 검증과 기존 same-origin/no-store API 계약을 그대로 사용한다.

## 롤아웃과 복구

- [x] migration과 feature flag 없이 기존 Render 자동 배포로 반영한다.
- [x] 회귀 시 이 PR의 Lottie 레이어 제거, preload 소비, committing 상태 변경을 함께 되돌리면 기존 정지형 handoff로 복구된다.

## 스펙 검토

Reviewer Agent: issue_103_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 없음. 사용자가 상단 뜯기 제거와 즉시 질문 전환을 명시적으로 확정했다.
