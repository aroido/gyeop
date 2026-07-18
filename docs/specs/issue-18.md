# Issue 18 구현 스펙: [프론트엔드] 주인 10장 응답·자동 저장·완료 흐름 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/18

## 목표

모바일 owner가 `오래된 친구팩` 10장에 답하면서 자신의 선택이 서버에 저장되는 상태를 이해하고, 중단·새로고침 뒤 같은 브라우저에서 이어서 완료할 수 있게 한다. 이 PR은 #17의 same-browser capability API를 실제 제품 화면에 연결해 `팩 시작 → 10장 선택 → 자동 저장 → 완료`가 재미 검증 가능한 첫 owner loop가 되게 한다.

## 범위

- `old-friend` manifest와 generated seed를 `active=true`로 전환한다. 비공개 MVP에서 새 owner play를 만들 수 있는 유일한 active pack으로 유지한다.
- 홈의 owner CTA는 `GET /play/new?pack=old-friend` 하나만 제공한다. 다른 pack 미리보기는 준비 중으로 남겨도 되지만 owner 진입 링크는 만들지 않는다.
- legacy `GET /play/old-friend`는 응답 body나 client effect를 거치지 않고 `/play/new?pack=old-friend`로 redirect한다. 임의 non-UUID `/play/[playId]`는 pack slug처럼 해석하지 않고 generic 종료 화면으로 수렴한다.
- `/play/new` client bootstrap은 exact `POST /api/plays` body `{ "packSlug": "old-friend" }`를 호출하고 응답 play id로 `/play/[playId]`를 `replace`한다. React development remount와 중복 click에서도 같은 browser runtime의 in-flight create/resume 요청은 하나만 존재한다.
- `/play/[playId]`는 exact `GET /api/plays/[playId]`를 먼저 호출하고, 성공 응답의 `packSlug`로 exact `GET /api/packs/[slug]`를 호출한다. 두 응답을 strict decode하고 서로의 slug/version/card answer membership을 교차 검증한다.
- 현재 검정·라임·블루 visual language와 큰 A/B 선택지를 유지한다. 320~430px에서 명시적인 `이전`, `나가기`, `n/10`, progress, 저장 상태 chip, 질문, A/B 버튼을 제공한다.
- A/B 선택은 네트워크를 기다리지 않고 즉시 `aria-pressed`와 optimistic answer를 갱신한 뒤 다음 미응답 카드로 이동한다. 선택 handler에서 첫 visible state update까지 150ms 이내여야 한다.
- 모든 save는 한 번에 하나씩 exact `PUT /api/plays/[playId]/answers/[cardId]`로 보내는 순서 보존 queue를 통과한다. 같은 카드의 빠른 재선택도 enqueue 순서대로 서버에 반영하며 이전 응답이 최신 optimistic 선택을 덮지 않는다.
- save 상태를 `자동 저장`, `저장 중…`, `저장됨`, `저장 실패 · 재시도`로 표시한다. 실패한 head와 뒤의 queue를 메모리에 보존하고 명시적 재시도 성공 전 다음 request와 complete를 멈춘다.
- `이전` 버튼으로 앞 카드의 저장·optimistic 선택을 보고 draft 상태에서 수정할 수 있다. swipe, timed-only undo, 자동 되돌리기를 추가하지 않는다.
- `나가기`는 queue가 비어 있고 실패가 없으면 저장 완료 안내 뒤 홈으로 이동한다. pending 또는 failed가 있으면 유실 가능 dialog에서 `계속 답하기`와 `그래도 나가기`를 명시적으로 고르게 한다.
- optimistic answer가 정확히 10개이고 save queue가 비어 있으며 실패가 없을 때만 exact `POST /api/plays/[playId]/complete` body `{}`를 한 번 실행한다. 완료 중 중복 요청을 막는다.
- complete 409 `OWNER_PLAY_INCOMPLETE`는 완료로 취급하지 않고 exact owner GET을 다시 호출해 authoritative answers/current position을 재수화한다. save 409 `OWNER_PLAY_COMPLETED`도 GET으로 completed state를 확인한다.
- completed owner play는 read-only 완료 화면으로 복구한다. `내 답변 10개가 저장됐어요`, 10개 선택 요약, `다음은 친구에게 공유하기` 예고만 제공하며 share link 생성·복사·Web Share는 추가하지 않는다.
- missing·malformed·expired·revoked·cross-play, malformed success body, answer/card/version 불일치는 다른 play 정보를 렌더하지 않는 동일한 generic 종료 화면으로 수렴한다. `새 팩 시작`을 누른 경우에만 exact `DELETE /api/me/session` body `{}` 뒤 `/play/new?pack=old-friend`로 replace한다.
- browser storage를 owner answer, play id, queue, 완료 source로 사용하지 않는다. pending/failed save가 있을 때 `beforeunload` 경고만 등록하며 저장된 state 복구는 항상 #17 API가 담당한다.
- 저장 status/error는 focus를 강제로 이동하지 않는 `aria-live=polite`로 읽고, terminal error와 complete heading만 최초 진입 시 focus한다. interactive target은 최소 44px이고 reduced motion에서는 질문 전환 animation을 제거한다.
- pack activation 결정과 private MVP owner entry를 active product/engineering SSOT에 기록한다.

## 제외 범위

- 이메일, Supabase Auth claim, cross-device 복구, owner 계정·복수 play 선택기
- share link 생성·회전·비활성, 링크 복사, Web Share. 이는 #19가 소유한다.
- visitor 질문·제출·결과 비교·프로필. 이는 #21 이후가 소유한다.
- analytics event 저장·전송 backend
- swipe navigation, timed-only undo, 1~2초 강제 opening animation. active SSOT의 기존 `스와이프+버튼` 계약은 이번 private MVP에서 버튼-only로 명시적으로 supersede하고, swipe는 재미 검증 뒤 별도 interaction 이슈로 재평가한다.
- service worker/offline durable queue, background sync, browser storage fallback
- API schema, capability cookie, owner DB/RPC 계약 변경. 필요한 복구는 #17의 공개 응답만 조합한다.
- 다른 pack 활성화 또는 pack 선택기 확장

## SSOT와 결정 기록

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `docs/specs/issue-17.md`
- `AGENTS.md`
- `.codex/AGENTS.md`
- Lazyweb report: https://www.lazyweb.com/report/lazyweb/8f8fb81d-3ed8-4e8d-96e4-b987aeff3247/

이번 이슈는 #17에서 의도적으로 inactive로 남긴 `old-friend` 신규 진입 gate를 비공개 재미 검증용으로 연다. 구현은 다음 SSOT를 exact 수정한다.

- `content/packs/old-friend-v1.json`의 `active`를 `true`로 바꾸고 `node scripts/render-pack-seed.mjs > supabase/seed.sql`과 동일한 generated output으로 seed를 갱신한다. 직접 수동 편집하지 않는다.
- `docs/product/question-pack-spec.md` §12의 `active`를 `true`로 바꾸고 설명을 `private MVP 신규 owner 진입은 활성, public beta 발행 승인은 아님`으로 교체한다. manifest SHA-256도 새 bytes에 맞춘다. frozen 10장 내용·version은 바꾸지 않는다.
- `scripts/verify-pack-catalog.mjs`의 manifest activation expectation을 exact `true`로 갱신해 manifest·문서·generated seed가 다시 다른 값을 가질 수 없게 한다.
- `docs/product/decision-log.md`에 2026-07-18 `old-friend private MVP activation` 결정을 추가한다. production public launch 승인을 뜻하지 않으며 새 play create gate만 연다고 명시한다.
- 같은 decision entry에서 private MVP의 A/B 조작을 명시적 button-only로 고정한다. `core-feature-priority.md` §5.3의 `좌우 스와이프와 버튼 탭을 모두 지원`은 private MVP에 한해 `44px 이상 A/B 버튼 탭과 키보드`로 교체하고, 문서 뒤의 pack-maker 카드 선택 swipe 예시는 P1 제작 흐름이므로 변경하지 않는다.
- `docs/engineering/p0-development-plan.md`에서 #18 owner UI가 #17 capability API를 사용하고, `/play/new`와 `/play/[playId]`가 active private MVP route라는 점을 갱신한다.
- `docs/product/core-feature-priority.md`의 owner flow가 아직 local prototype을 가리키면 server-backed save/recovery 계약으로 고친다. 이미 같은 계약이면 중복 문구를 추가하지 않는다.

## 사용자 흐름 영향

1. 홈에서 owner가 `팩 시작하기`를 누르면 `/play/new?pack=old-friend`로 이동한다.
2. bootstrap은 같은 runtime의 동일 pack in-flight promise를 재사용한다. 성공이 201이면 새 play, 200이면 같은 cookie play 재개지만 UI는 둘을 구분하지 않고 응답 id로 replace한다.
3. `/play/[playId]`는 owner state를 먼저 읽고 그 state의 pack만 읽는다. draft면 서버 answers와 current position에서 첫 화면을 만들고, completed면 곧바로 read-only 완료 화면을 연다.
4. owner가 A/B를 누르면 화면은 즉시 선택을 반영하고 다음 미응답으로 이동한다. save queue는 선택 당시의 card id, choice, 계산된 current position을 순서대로 저장한다.
5. 저장 성공 뒤 remaining queue의 optimistic 선택을 authoritative 응답 위에 다시 적용한다. 따라서 느린 첫 응답이 같은 카드의 두 번째 선택이나 이후 카드 선택을 되돌리지 않는다.
6. save가 실패하면 실패한 head에서 queue가 멈춘다. owner는 답을 계속 바꿀 수 있고 새 operation은 뒤에 쌓이지만, `재시도`가 성공할 때까지 후속 save와 complete는 전송하지 않는다.
7. `이전`은 index만 이동한다. 저장 자체를 취소하거나 answer를 지우지 않는다. 이미 선택한 A/B를 다시 누르면 새 save operation으로 수정한다.
8. 10개 optimistic answer와 성공적으로 drain된 queue가 만났을 때 complete를 호출한다. complete 성공 후 서버가 반환한 completed state만 완료 화면을 연다.
9. 새로고침은 memory queue를 버리지만 서버에 성공한 answers를 owner GET으로 복구한다. pending/failed가 있으면 unload 경고로 유실 가능성을 알린다.
10. generic 종료 화면의 `새 팩 시작`은 현재 capability를 revoke/clear한 다음에만 새 bootstrap으로 간다. DELETE 실패 시 새 create로 진행하지 않고 같은 화면에서 재시도한다.

## URL과 component 경계

- `app/(public)/page.tsx`, `home-client.tsx`
  - production은 현재처럼 runtime published pack을 fail-closed로 읽는다. development는 active manifest presentation을 사용한다.
  - CTA href는 exact `/play/new?pack=old-friend`다. 다른 preview에는 active link를 만들지 않는다.
- `app/play/new/page.tsx`, `bootstrap.tsx`
  - query의 `pack`은 allowlist exact `old-friend`만 허용한다. missing, duplicate, array, unknown 값은 generic start error이며 API를 호출하지 않는다.
  - module-scoped `Map<packSlug, Promise<OwnerPlayState>>`로 settled 전 요청을 dedupe한다. promise는 settle 후 map에서 같은 identity일 때만 삭제한다.
  - POST success를 strict decode한 뒤 `router.replace`; 자동 retry는 없다. 404/429/500/network는 code allowlist에 따른 retry/start error를 표시한다.
- `app/play/old-friend/page.tsx`
  - Next `redirect("/play/new?pack=old-friend")`만 수행한다.
- `app/play/[playId]/page.tsx`, `owner-play.tsx`, `page.module.css`
  - pageId가 canonical lower-case UUID가 아니면 client data request 없이 generic 종료 component를 렌더한다.
  - valid id만 client owner flow에 전달한다. client는 owner GET 성공 전 pack GET을 시작하지 않는다.
- `lib/owner-play/owner-play-state-core.mjs`
  - #17의 기존 `decodeOwnerPlayState`와 owner-state/card-order/UUID validation을 `owner-play-session-core.mjs`에서 browser-safe pure module로 추출한다. `node:*`, cookie, secret, crypto를 import하지 않는다.
  - server session core와 browser owner flow가 같은 decoder를 import한다. `owner-play-session-core.mjs`는 기존 named export를 re-export해 #17 server wrapper/test 호환성을 유지하며 decoder 구현을 복제하지 않는다.
- `lib/owner-flow/owner-flow-core.mjs`
  - shared `decodeOwnerPlayState`를 사용한 initialization cross-check, pure reducer/queue transition, next-unanswered/current-position 계산을 둔다. DOM, fetch, storage, timers를 import하지 않는다.
- `lib/owner-flow/owner-flow-client.ts`
  - 아래 exact same-origin endpoint만 구성하는 reviewed adapter를 둔다. `credentials: "same-origin"`, `cache: "no-store"`, exact method/content-type/body를 사용한다.
  - generic path/HTTP client, arbitrary URL argument, Supabase client, table query를 제공하지 않는다.
- 기존 `app/play/packs.ts`와 localStorage prototype은 제거한다. catalog 검증은 manifest, generated seed, published decoder, presentation metadata를 직접 비교한다.

## client state와 ordered save queue

state는 최소 다음 discriminated 상태를 갖는다.

- `loading`
- `draft`: `serverPlay`, `answersByCard`, `currentIndex`, `queue`, `saveState`, `completionState`
- `completed`: strict completed play와 pack
- `terminal`: generic 종료 reason은 내부에서만 구분하고 사용자 copy는 동일

queue operation은 immutable `{ sequence, cardId, choice, currentPosition }`다. `sequence`는 runtime에서 단조 증가하는 safe integer이며 wire로 보내지 않는다.

### 선택과 위치

- `choose(cardId, choice)`는 현재 pack에 있는 card만 허용하고 현재 draft가 아니면 no-op한다.
- optimistic map을 먼저 갱신한 뒤 현재 index 다음부터 끝까지, 그 다음 처음부터 현재 index 전까지 순환하며 첫 미응답을 찾는다.
- 미응답이 있으면 그 card의 1-based position으로 이동하고 save body `currentPosition`도 그 값을 쓴다.
- 모든 card가 answered면 현재 card에 머물고 save body `currentPosition=10`을 쓴다. 완료 여부는 position이 아니라 10개 valid card answer와 queue drain으로만 결정한다.
- 기존 answered card를 수정할 때도 새 operation을 append하며 앞 operation을 collapse하지 않는다. 서버 request 순서가 사용자 선택 순서를 그대로 나타내게 한다.

### drain과 reconciliation

- network worker는 queue head 하나만 in-flight로 표시한다. head 성공 전 다음 operation을 보내지 않는다.
- save 200의 strict owner state를 새 authoritative base로 적용한 뒤 아직 성공하지 않은 queue operations를 sequence 순으로 다시 overlay한다.
- 성공 head만 제거한다. 응답의 play id/pack slug/version 또는 answer membership이 현재 state와 다르면 terminal로 전환하고 queue를 더 전송하지 않는다.
- network/429/5xx는 head를 `failed`로 유지하고 worker를 pause한다. `재시도`는 같은 sequence/body를 다시 전송한다. automatic exponential retry를 만들지 않는다.
- 400/403/404 또는 malformed body는 generic terminal이다. 409 `OWNER_PLAY_COMPLETED`만 owner GET으로 재확인해 completed면 수렴하고, 그렇지 않거나 GET 실패면 terminal이다.
- retry success 뒤 worker가 remaining queue를 순서대로 drain한다.
- unmount/route change 뒤 response는 state를 갱신하지 않는다. pending fetch는 AbortController로 취소하되 이미 서버가 저장했을 가능성을 UI에서 저장 실패로 단정하지 않고 다음 진입 GET으로 복구한다.

### completion

- `answersByCard`가 pack 10개 card를 정확히 모두 포함하고 queue length 0, in-flight 없음, failed 없음, completionState idle일 때만 complete effect가 시작된다.
- complete POST는 같은 mounted play에서 한 번만 in-flight다. 성공 response가 strict `status=completed`이고 10 answers를 포함할 때만 completed 화면으로 전환한다.
- 409 `OWNER_PLAY_INCOMPLETE`는 owner GET을 정확히 한 번 실행한다. GET draft가 9장 이하면 authoritative answers를 재구성하고 첫 미응답으로 이동한다. 동시 탭 save 때문에 GET이 10장 draft를 반환하면 자동 complete loop를 만들지 않고 `completionState=retryable`과 `완료 다시 시도`를 표시한다. 사용자가 누른 한 번에만 complete를 재호출한다.
- 409의 다른 allowlisted code, 400/403/404, malformed success는 terminal이다. 429/5xx/network는 answers를 유지한 retryable completion error이고 explicit `완료 다시 시도`를 제공한다.

## API와 데이터 영향

browser adapter가 사용하는 endpoint는 다음뿐이다.

| 목적 | method/path | body | 성공 |
|---|---|---|---|
| create/resume | `POST /api/plays` | `{ "packSlug": "old-friend" }` | 200/201 owner state |
| owner restore | `GET /api/plays/[playId]` | 없음 | 200 owner state |
| pack restore | `GET /api/packs/[packSlug]` | 없음 | 200 published pack |
| answer save | `PUT /api/plays/[playId]/answers/[cardId]` | `{ "choice", "currentPosition" }` | 200 owner state |
| complete | `POST /api/plays/[playId]/complete` | `{}` | 200 owner state |
| explicit new start | `DELETE /api/me/session` | `{}` | 204 |

- dynamic path segment는 strict decoded play/pack/card id만 `encodeURIComponent`해 구성한다.
- owner-state decoder는 새로 만들지 않고 #17의 exact decoder를 browser-safe pure module로 추출해 server와 client가 함께 사용한다. canonical UUID, exact key set, timestamp/TTL, unique ordered answer membership, status/current position 계약과 기존 error redaction을 유지한다.
- published pack은 `decodePublishedPack`을 재사용한다. owner play의 `packSlug`/`packVersion`과 published pack slug/version이 exact match해야 한다.
- 오류 body는 `{ code, message }` exact key와 allowlisted code만 해석한다. 서버 message나 response text를 그대로 DOM·console에 출력하지 않는다.
- client와 Route는 cookie/token을 읽거나 기록하지 않는다. `document.cookie`, browser storage, request/response body logging, analytics payload를 추가하지 않는다.
- 기존 #17 owner API의 `Cache-Control: private, no-store`, generic 404, Origin/proxy/rate-limit boundary는 변경하지 않는다. frontend tests는 모든 owner API mock response에도 no-store를 넣고 실제 통합 test는 #17 boundary를 계속 검증한다.
- `scripts/verify-owner-flow.mjs`는 `app/play/**`와 `lib/owner-flow/**`의 browser storage·Supabase/direct table·document.cookie 사용 금지, exact endpoint allowlist, generic arbitrary URL client 부재, legacy redirect와 home CTA를 정적으로 검사한다. verifier 자체의 positive/negative fixture unit test를 둔다.

## 디자인 영향

- Lazyweb 검토에서 강점으로 확인된 라임 질문 카드, blue offset shadow, 큰 A/B, `n/10` 구조를 유지한다.
- 상단 첫 행은 44px 이상 `이전`과 `나가기`, 가운데 brand 또는 pack title로 구성한다. 첫 카드에서도 `이전` control의 자리를 유지하되 disabled 상태와 accessible name을 제공해 layout shift를 막는다.
- progress 아래 save chip을 두고 `aria-live="polite"`, `aria-atomic="true"`를 사용한다. 연속 `저장 중…`을 중복 announce하지 않는다.
- 질문 h1과 A/B를 primary focus order로 둔다. 선택 후 다음 질문 h1에 programmatic focus해 keyboard/screen-reader 사용자가 전환을 이해하게 한다. save status change는 focus를 가져가지 않는다.
- exit dialog는 native `<dialog>` 또는 동등한 modal semantics, label, focus trap/return, Escape를 제공한다. pending/failed일 때만 확인을 요구한다.
- terminal과 complete 최초 진입은 h1에 focus한다. retry 뒤 성공하면 정상 질문 focus 규칙으로 돌아간다.
- choice, 이전, 나가기, retry, dialog action은 모든 viewport에서 최소 44×44px다.
- 320×800, 390×844, 430×932에서 가로 overflow가 없고 질문/두 선택/save chip/상단 controls가 첫 viewport 안에서 사용 가능해야 한다. 작은 세로 화면에서는 summary만 세로 scroll을 허용한다.
- motion은 opacity/transform 150ms 이하만 허용한다. `prefers-reduced-motion: reduce`에서 duration을 제거한다.
- 완료 화면은 share button처럼 보이는 disabled control을 만들지 않는다. `다음은 친구에게 공유하기` 설명만 두어 #19 기능을 거짓 약속하지 않는다.

## 구현 계획

1. manifest active flag를 변경하고 seed를 generator로 갱신한 뒤 catalog verifier, manifest hash, activation SSOT를 맞춘다.
2. #17의 strict owner decoder를 browser-safe `owner-play-state-core.mjs`로 무동작 변경 추출하고 기존 server unit test를 유지한다. `owner-flow-core.mjs`에는 shared decoder를 사용한 pack cross-check, next-unanswered, reducer와 ordered queue transition만 node:test로 구현한다.
3. exact browser API adapter와 source-policy verifier/unit fixture를 구현한다.
4. `/play/new` deduped bootstrap, legacy redirect, UUID `/play/[playId]` route를 구현한다.
5. 기존 play visual을 재사용해 server-backed owner component, save worker, retry, previous, exit, completion/terminal 화면을 구현하고 localStorage prototype/pack registry를 제거한다.
6. 홈의 유일 active CTA와 runtime pack test를 새 URL/activation 계약으로 갱신한다.
7. Playwright mock fixture로 delayed save, ordered response, failure/retry, incomplete reload, completed reload, exit와 mobile/a11y를 결정적으로 검증한다. 별도의 serial live-browser happy path는 local Supabase와 실제 #17 Route를 사용하고 context에 test proxy canonical headers를 주입해 browser가 Secure HttpOnly cookie를 받아 create→첫 save→reload restore→10장 complete를 수행하도록 한다.
8. package scripts와 `scripts/ai-verify`에 owner-flow unit/static gate를 연결하고 focused tests, build, full verify를 통과한다.

## 완료 기준

- [ ] manifest와 generated seed에서 `old-friend`만 active이며 active create/read가 성공하고 inactive/unknown pack은 redacted 404를 유지한다.
- [ ] 홈의 유일 owner CTA와 `/play/old-friend`가 `/play/new?pack=old-friend` bootstrap으로 모인다.
- [ ] Strict Mode/remount fixture에서 create/resume POST가 한 번만 전송되고 valid cookie는 같은 play id를 resume한다.
- [ ] `/play/[playId]`는 owner GET 성공 후 그 응답 pack의 GET만 실행하며 server card position, answers, current position, completed state를 strict 복구한다.
- [ ] localStorage/sessionStorage/IndexedDB/document.cookie가 비어 있거나 throw해도 저장된 서버 answer 복구가 동일하다. source static gate가 browser storage와 direct data client 회귀를 거절한다.
- [ ] delayed save fixture에서 A/B press 후 selected/next question visible state가 150ms 이내 바뀌고 save 응답을 기다리지 않는다.
- [ ] 빠른 연속 선택과 같은 card `a→b` 수정에서 PUT이 enqueue sequence와 동일하게 직렬 실행되고 마지막 UI/server fixture choice가 `b`다.
- [ ] save status `자동 저장→저장 중…→저장됨`과 `저장 실패 · 재시도`가 visual/aria-live로 구분되며 failed head와 이후 선택이 retry 동안 사라지지 않는다.
- [ ] 이전 버튼으로 draft answer를 보고 수정할 수 있다. 모든 기능을 button/keyboard로 수행하며 swipe/timer에 의존하지 않는다.
- [ ] clean exit은 저장 완료 안내 뒤 홈으로 이동하고 pending/failed exit은 유실 경고 dialog에서 stay/leave를 선택한다.
- [ ] 9 answers, pending, in-flight, failed 중 하나라도 있으면 complete API를 호출하지 않는다. 10 saves success 뒤 complete가 한 번 호출된다.
- [ ] incomplete 409는 owner GET authoritative draft를 재수화하고 completed로 오인하지 않는다. 404/malformed state는 generic 종료, 5xx/network는 explicit retry로 수렴한다.
- [ ] completed response와 completed reload는 answer edit control 없는 동일한 10개 summary와 share-next copy를 렌더한다.
- [ ] generic 종료에서 다른 play/answer/credential 상태를 구분해 표시하지 않고, explicit new start는 DELETE 성공 뒤에만 bootstrap으로 간다.
- [ ] 320/390/430 mobile viewport에서 horizontal overflow가 없고 모든 target 44px, keyboard order/focus, aria-live/dialog, reduced motion test가 통과한다.
- [ ] 실제 owner API integration이 create/resume→10 ordered save→complete→reload, 9장 incomplete, cross-play/expired/revoked generic 계약과 `private, no-store`를 계속 통과한다.
- [ ] 실제 Chromium happy path가 canonical test proxy headers와 local Supabase를 사용해 Secure HttpOnly owner cookie를 browser에서 수신·재전송하고, UI create→save→reload restore→complete를 mock 없이 통과한다.
- [ ] secretless build, focused unit/static/integration/Playwright, `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `node --test tests/unit/owner-flow-core.test.mjs tests/unit/owner-flow-policy.test.mjs`
  - shared strict owner-state extra/coerced/duplicate/reordered/invalid timestamp·TTL 거절과 server/client 동일 decoder 사용
  - owner/pack slug·version·card mismatch 거절
  - next-unanswered wrap, all-answered position 10
  - ordered queue, same-card edit, stale success overlay, failure pause, exact retry, completed/incomplete transition
  - source verifier positive repository trace와 storage/arbitrary endpoint/Supabase negative fixture
- `node scripts/verify-owner-flow.mjs`
- `node scripts/verify-pack-catalog.mjs`
- `node --test tests/integration/owner-play-session.test.mjs`
  - active seed create/resume, 10 save, completed reload와 private no-store
  - transaction에서 임시 inactive로 바꾼 create와 unknown pack redacted 404
  - 9장 incomplete, cross-play, expiry, revoke 계약은 기존 fixture를 보강한다.
- `node --test tests/integration/pack-runtime.test.mjs`
  - production runtime active 홈은 `/play/new?pack=old-friend`, inactive/broken backend는 CTA 없음, legacy redirect는 activation과 무관하게 bootstrap URL로만 이동
- `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/owner-play.spec.ts --project=mobile-chromium`
  - API route fixture는 exact method/path/body, no-store와 server state mutation을 구현하고 non-allowlisted request를 실패시킨다.
  - bootstrap dedupe/resume, restore, optimistic 150ms, ordered delayed save, failure/retry, previous edit, saved/pending exit, complete/incomplete/completed reload
  - 320/390/430, keyboard/focus, aria-live/dialog, reduced motion, browser storage 비사용
- `GYEOP_E2E_LIVE=1 pnpm exec playwright test tests/e2e/owner-play-live.spec.ts --project=mobile-chromium --workers=1`
  - full verify에서 이미 실행 중인 local Supabase status의 API URL/secret을 test runner가 읽어 별도 test server env에 주입한다. test-only proxy secret과 `x-forwarded-for`, `x-forwarded-host=127.0.0.1`, `x-forwarded-proto=https`, `x-forwarded-port=443`, `x-gyeop-origin-verify`를 browser context에 넣고 mutation browser Origin은 local `APP_URL`과 exact match시킨다.
  - `old-friend`를 test 시작 transaction에서 active로 확인하고 종료 뒤 seed active 상태를 복원한다. 실제 POST Set-Cookie가 browser cookie jar의 `Secure`·`HttpOnly`·`SameSite=Lax` cookie가 되고 reload GET에 자동 전송되는지 확인한다.
  - 일반 focused Playwright는 mock으로 빠르게 단독 실행 가능하게 유지하고, `scripts/ai-verify`가 mock suite 뒤 live suite를 필수 실행한다.
- `env -u NEXT_PUBLIC_SUPABASE_URL -u SUPABASE_SECRET_KEY pnpm build`
- `./scripts/run-ai-verify --mode full`

## 개인정보와 악용 방지

- 화면과 client state는 #17 owner play id와 A/B choice만 일시적으로 다룬다. 이메일, 전화번호, 표시 이름, IP, user agent를 새로 수집하지 않는다.
- raw management secret은 HttpOnly cookie에만 있으며 JavaScript, DOM, log, analytics, storage에서 접근하지 않는다.
- terminal copy는 missing, malformed, expired, revoked, cross-play를 구분하지 않는다. 서버 error message와 다른 owner state를 표시하지 않는다.
- retry는 새 play create가 아니라 실패한 save/complete를 명시적으로 다시 시도한다. 새 create는 owner가 generic 종료 화면에서 session delete를 성공시킨 뒤에만 가능해 orphan draft와 quota 소비를 줄인다.
- owner answer를 console/server log에 기록하지 않는다. Playwright fixture log도 endpoint와 sequence만 기록하고 request choice는 assertion memory 밖으로 출력하지 않는다.

## 롤아웃과 복구

- manifest·seed activation, UI, tests를 한 PR로 배포해 active backend가 localStorage UI와 분리되어 노출되는 중간 상태를 만들지 않는다.
- 배포 전 local Supabase reset에서 active seed create와 inactive override fail-closed를 모두 검증한다.
- production smoke는 홈 CTA → play id replace → 첫 save `저장됨` → reload restore까지만 test owner capability로 확인하고 실제 공유 링크는 만들지 않는다.
- 심각한 owner-flow 회귀 시 UI/manifest commit을 revert하고 generated seed를 `active=false`로 되돌리는 forward change로 신규 create를 닫는다. 이미 생성된 play와 answers를 삭제하거나 다른 owner에 연결하지 않는다.
- completed/draft data와 cookie contract는 #17 그대로여서 frontend rollback 뒤에도 DB row를 보존한다. retention/physical cleanup은 별도 이슈다.

## 분석과 관측성

- 이번 PR은 analytics event backend를 추가하지 않는다. 사용자 재미 검증 event는 실제 저장/공유 loop가 완성된 뒤 별도 결정한다.
- save chip은 API status를 owner가 이해하기 위한 product state이지 telemetry가 아니다.
- 개발 test instrumentation은 monotonic time으로 optimistic visible update가 150ms 이내인지 측정하고 production code에 answer/timing log를 남기지 않는다.
- HTTP boundary의 기존 request id와 redacted server error만 유지한다. client는 raw response text를 log하지 않는다.

## 스펙 검토

Reviewer Agent: issue18_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- hard reload 순간 in-memory pending save는 durable하지 않다. browser storage/background sync를 추가하지 않고 `beforeunload` 경고와 성공한 server save 복구로 제한한다.
- create response 또는 Set-Cookie 유실 시 #17의 orphan play 규칙이 그대로 적용된다. client automatic create retry를 하지 않고 error+명시적 retry를 제공한다.
- `POST /api/plays`는 malformed/expired cookie에서 generic 404와 cookie 삭제를 반환한다. 첫 error 화면에서 자동 두 번째 create를 하지 않으며 사용자가 `새 팩 시작`으로 DELETE를 승인한 뒤 진행한다.
- complete incomplete response는 security 계약상 owner state를 body에 담지 않는다. client가 owner GET으로 다시 읽어 authoritative draft를 복구한다.
- same-browser capability는 owner play 하나만 가리킨다. 다른 pack/복수 play 선택은 private 재미 검증 뒤 별도 product decision이다.
- 구현 전 해결해야 할 외부 블로커는 없다.
