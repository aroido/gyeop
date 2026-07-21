# Issue 98 구현 스펙: 스크롤로 카드팩을 열고 첫 질문으로 이어지는 모션 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/98

## 목표

팩 선택 뒤 한 번 위로 미는 짧은 스크롤로 자체 카드팩의 봉인을 열고 질문 카드를 꺼내며, 그 카드가 라우트 교체 중에도 유지되어 실제 첫 질문으로 끊김 없이 이어지게 한다.

## 범위

- [ ] `motion`을 production dependency로 추가하고 스크롤 진행도, 값 보간, 완료 스프링, reduced-motion 판정에만 사용한다.
- [ ] `/play/new`에 `100svh + 220px` 내외의 짧은 scroll runway와 화면에 고정된 개봉 무대를 둔다.
- [ ] transition host를 `idle -> opening -> opened-waiting -> route-loading -> handoff-complete` 성공 경로와 어느 단계에서도 진입 가능한 `aborted` 경로로 관리하고, 팩 눌림·좌우 봉인 분리·카드 상승·껍질 하강·질문 카드 정착을 겹쳐 재생한다.
- [ ] 진행도 85% 전에는 역스크롤로 되감고, 85%에 도달하면 완료 위치로 정착시킨다.
- [ ] owner 생성·재개 요청을 개봉 입력과 병렬로 실행하고, 둘 중 하나가 늦으면 완료된 쪽의 안정된 상태에서 기다린다.
- [ ] `app/play/layout.tsx` 아래의 지속 client transition host가 `/play/new`와 `/play/[playId]` 사이에서 추출된 카드를 유지하고, 실제 질문 준비 뒤 짧게 전환한다.
- [ ] 포인터·터치 스크롤 외에 `팩 열기` 버튼을 제공하고 `prefers-reduced-motion: reduce`에서는 개봉 입력과 지연 없이 질문으로 이동한다.
- [ ] 기존 잘못된 팩, API 실패, 재시도, 세션 초기화, same-pack CTA, 24개 활성 팩 경로를 보존한다.
- [ ] 제품 SSOT의 고정 620ms CSS 연출을 이번 사용자 제어 개봉 계약으로 대체한다.
- [ ] Motion 경로와 기존 owner flow 회귀를 Playwright로 검증한다.

## 제외 범위

- [ ] 사운드, 진동, 파티클, 외부 이미지·영상, 특정 카드팩 IP를 추가하지 않는다.
- [ ] 질문 내용, 팩 제목, A/B 선택지, 저장·완료·공유 흐름을 바꾸지 않는다.
- [ ] 방문자 응답, 프로필, 결과 화면에 개봉 연출을 확장하지 않는다.
- [ ] 장기 스크롤 스토리 페이지, 자유 드래그, swipe 답변 이동을 추가하지 않는다.
- [ ] 신규 API, DB schema, migration, analytics event를 추가하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md` 5.3 팩 개봉과 셀프 응답
- `docs/product/question-pack-spec.md` 5. 주인 응답
- `docs/product/decision-log.md` 2026-07-20 비공개 재미 검증 팩 24개와 자체 카드 개봉 결정
- `.codex/AGENTS.md` 모바일 우선, 단일 P0 경로, 제품 SSOT 순서
- GitHub issue #98의 범위·제외 범위·완료 조건

## 사용자 흐름 영향

- [ ] 주인과 same-pack CTA로 전환된 새 주인은 팩 선택 직후 닫힌 팩을 보고 한 번 위로 밀거나 `팩 열기`를 눌러 첫 질문을 꺼낸다.
- [ ] owner API는 입력을 기다리지 않고 시작되며, API가 먼저 끝나도 개봉 완료 전에는 이동하지 않고 개봉이 먼저 끝나면 열린 카드 상태로 응답을 기다린다.
- [ ] owner API 실패 시 개봉 overlay와 scroll 위치를 정리한 뒤 기존 retryable/terminal 화면과 초점 계약을 그대로 사용한다.
- [ ] POST 성공 뒤 `/play/[playId]`의 play 또는 pack GET이 auth/retryable/terminal로 실패하면 route-loading overlay를 `aborted`로 해제하고 해당 오류 heading이 시각·초점 모두를 소유하게 한다.
- [ ] 방문자 응답과 이미 열린 `/play/[playId]` 직접 진입은 변하지 않는다.
- [ ] reduced-motion 사용자는 별도 개봉 gate 없이 현재 계약처럼 첫 질문으로 바로 이동한다.

## 디자인 영향

- [ ] 기존 부채꼴 카드 세 장과 `✦`를 제거하고, 짙은 자체 팩 껍질·라임 봉인선·실제 질문 카드와 같은 라임 면·파란 offset shadow를 사용한다.
- [ ] 진행도 0–15% 팩 압축, 15–35% 봉인 분리, 25–75% 카드 추출, 65–90% 껍질 하강과 카드 확대, 90–100% 질문 카드 정착으로 보간한다.
- [ ] 카드가 상승할수록 그림자가 벌어지고 껍질이 반대 방향으로 내려가되, 주 카드에는 중간 opacity fade를 사용하지 않아 하나의 물체처럼 보이게 한다.
- [ ] 완료 카드의 너비, radius, 회전, 색, 그림자를 `.questionCard`와 맞추고 실제 질문을 뒤에 준비한 뒤 overlay opacity만 120ms 안에 제거한다.
- [ ] 320px~430px를 기준으로 `100svh`와 safe-area를 사용한다. desktop은 레이아웃이 깨지지 않고 scroll 또는 `팩 열기` fallback으로 완료할 수 있게 하되 한 번의 wheel 입력을 완료 조건으로 두지 않는다.
- [ ] `opening`에서만 overlay 안내와 `팩 열기` 버튼을 접근성 트리에 둔다. `opened-waiting`에서는 상태 문구만 남기고, `route-loading`부터 overlay를 `aria-hidden`·pointer 비활성으로 전환해 실제 질문 또는 오류 heading이 유일한 focus owner가 되게 한다.

## API와 데이터 영향

- [ ] `/api/plays`와 `/api/plays/[playId]`, 응답 schema, Supabase 함수·테이블·RLS는 변경하지 않는다.
- [ ] `bootstrapOwnerPlay`의 dedupe와 반환 타입을 유지하고, 응답된 play id만 transition host에 전달한다.
- [ ] client에만 `idle`, `opening`, `opened-waiting`, `route-loading`, `handoff-complete`, `aborted` 상태와 progress·readyPlayId를 두며 localStorage, cookie, URL query에는 저장하지 않는다.
- [ ] 오류·unmount에서 진행 중 animation과 subscription을 정리하고 중복 POST 또는 중복 navigation을 허용하지 않는다.
- [ ] `aborted`는 overlay를 제거하고 scroll을 맨 위로 복구한 다음 호출 화면의 기존 오류 UI와 초점 effect에 제어를 넘긴다.

## 구현 계획

- [ ] `package.json`, `pnpm-lock.yaml`: `motion`을 추가하고 기존 React 19·Next App Router 조합에서 설치를 고정한다.
- [ ] `app/play/layout.tsx`, `app/play/play-transition.tsx`: sibling route 사이에 유지되는 provider/overlay를 만들고 전역 scroll progress, 완료 snap, button fallback, reduced-motion, route handoff를 한 client 경계에서 관리한다.
- [ ] `app/play/new/page.tsx`: pack title과 entry source를 transition 시작에 그대로 전달하는 entrypoint 계약을 확인하고 필요한 prop 외에는 변경하지 않는다.
- [ ] `app/play/new/bootstrap.tsx`: 고정 620ms Promise와 기존 opening markup을 제거하고 transition 시작, owner bootstrap 결과 전달, 오류 reset만 담당한다.
- [ ] `app/play/[playId]/owner-play.tsx`: 첫 질문 flow가 decode돼 실제 `.questionCard`가 준비됐을 때 현재 play id의 handoff 완료를 알리고, auth/retryable/terminal load 결과에서는 transition abort를 알린다.
- [ ] `app/play/[playId]/page.module.css`와 필요 시 전용 module CSS: 팩 껍질·봉인·카드 레이어, runway, sticky/fixed 배치와 reduced-motion 정적 스타일을 작성하고 기존 opening keyframes를 삭제한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/question-pack-spec.md`, `docs/product/decision-log.md`: 사용자 제어 개봉이 별도 확인·선택 화면이 아니라 첫 질문 카드 reveal이라고 명시하고, `question-pack-spec.md` 5.2를 “중간 확인·선택 화면 없이 개봉한 첫 질문부터”로 바꾸며 fallback과 reduced-motion에서는 지연시키지 않는다고 기록한다.
- [ ] `tests/e2e/owner-flow-fixture.ts`: owner POST와 후속 play/pack GET을 각각 지연·실패시킬 수 있는 deterministic option을 추가한다.
- [ ] `tests/e2e/owner-play.spec.ts`: no-preference에서 스크롤 추출·역방향·완료·button fallback·API-first·opening-first·후속 GET abort handoff를 검증하고 기존 reduce 기본 회귀를 유지한다.

## 완료 기준

- [ ] 320px, 390px, 430px viewport에서 약 220px 이내의 한 번 위 스와이프로 닫힌 팩부터 열린 질문 카드까지 도달한다.
- [ ] 85% 이전의 반대 방향 스크롤에서 카드와 봉인이 닫힌 방향으로 돌아가고, 85% 이후에는 중복 완료 없이 100%로 정착한다.
- [ ] 개봉 완료와 API 완료 순서가 어느 쪽이 먼저여도 POST는 한 번이고 올바른 `/play/{playId}`로 한 번만 이동한다.
- [ ] 라우트 전환 중 추출 카드가 유지되고 실제 첫 질문 표시까지 검정 flash, 빈 opening 화면, 현저한 카드 위치 점프가 없다.
- [ ] `팩 열기` 버튼은 키보드로 동작하고 `route-loading`부터 tab order와 접근성 트리에서 빠지며, 실제 질문 또는 오류 heading 하나만 초점을 가진다.
- [ ] POST 성공 뒤 play/pack GET이 실패해도 overlay가 사라지고 auth/retryable/terminal 오류 화면과 기존 복구 action이 보인다.
- [ ] reduced-motion에서는 사용자 입력이나 인위적 timer 없이 첫 질문과 초점에 도달한다.
- [ ] API 실패·재시도·새 팩 시작, `old-friend`, `deadline-mode`, same-pack CTA의 기존 회귀가 통과한다.
- [ ] 외부 asset·sound·analytics·DB 변경이 없고 전체 검증과 동일 HEAD의 named `verify` CI가 통과한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm exec playwright test tests/e2e/owner-play.spec.ts --project=mobile-chromium`
- [ ] Playwright no-preference에서 scroll 전진·역진, 85% snap, button fallback, API-first와 opening-first handoff를 상태·URL·질문 표시로 검증한다.
- [ ] `owner-flow-fixture.ts`의 지연 option으로 API-first는 opening 입력 전 POST 완료, opening-first는 POST 응답 보류 중 개봉 완료를 재현하고, 후속 play/pack GET 실패로 `aborted`를 재현한다.
- [ ] 기존 reduce 기본 E2E에서 중간 gate 없이 첫 질문, 오류 초점, 24개 활성 팩과 same-pack CTA를 재검증한다.
- [ ] 320px·390px·430px 모바일 screenshot/video와 느린 재생으로 봉인 origin, 카드/껍질 반대 운동, 최종 카드 정렬, horizontal overflow 부재를 수동 확인한다.

## 분석과 관측성

- [ ] 기존 `owner_play_started`와 entry source 의미를 바꾸지 않으며 새 analytics event나 사용자별 모션 로그를 만들지 않는다.
- [ ] E2E의 API call 수와 최종 URL을 중복 요청·navigation의 관측 근거로 사용한다.

## 개인정보와 악용 방지

- [ ] 개봉 상태에는 pack title과 공개 slug 외의 owner id, 답변, 관계, token을 넣거나 DOM·URL·로그에 노출하지 않는다.
- [ ] 기존 cookie, capability, rate limit, owner 응답 비공개 계약을 변경하지 않는다.
- [ ] 모션이 입력을 가로채는 동안에도 오류 복구와 reduced-motion·키보드 경로를 제공해 강제 motion 및 scroll trap을 피한다.

## 롤아웃과 복구

- [ ] migration과 feature flag 없이 기존 `/play/new` opening을 한 PR에서 새 개봉으로 바꾼다. 비공개 MVP이므로 별도 이중 모드를 두지 않는다.
- [ ] 배포 전 local mobile E2E와 Render Docker 검증을 포함한 harness full verify를 통과하고, 동일 HEAD의 GitHub `verify` 성공 뒤 merge한다.
- [ ] 운영에서 입력 차단·route flash·성능 회귀가 확인되면 PR revert로 기존 620ms CSS opening을 복원할 수 있으며 데이터 rollback은 필요 없다.

## 스펙 검토

Reviewer Agent: issue_98_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] Motion이 미적 완성도를 자동 보장하지 않으므로 progress 구간과 spring 값은 320px 실제 렌더의 느린 재생으로 조정하되 새로운 모드·옵션으로 노출하지 않는다.
- [ ] mobile browser의 address-bar·overscroll 차이는 `svh`, 짧은 runway, 완료 snap, button fallback으로 제한한다.
- [ ] 지속 overlay와 실제 질문 카드의 픽셀 단위 shared-layout morph는 브라우저 실험 API에 의존하지 않고 동일 geometry와 짧은 crossfade로 구현한다.
- [ ] 현재 구현·제품 결정을 기준으로 해결되지 않은 블로커는 없다.
