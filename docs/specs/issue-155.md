# Issue 155 구현 스펙: 내 겹 공유 카드를 한 번에 공유되는 결과 화면으로 개선

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/155

## 목표

`내 겹 공유하기` 카드 mode를 관리 화면이 아닌 실제 친구 시선 결과 화면으로 재구성하고, `이 카드 공유하기` 한 번으로 공개 초대 링크 생성과 가능한 즉시 이미지+링크 OS 공유까지 이어지게 한다.

## 범위

- [ ] card mode의 중간 `카드 공유 준비하기` 단계를 없애고 Primary를 `이 카드 공유하기` 하나로 통합한다.
- [ ] 공개 초대 URL이 없으면 같은 Primary handler에서 기존 public 링크 API로 링크를 만든 뒤, 가능한 환경에서는 미리 만든 PNG와 링크를 즉시 `navigator.share`에 전달한다.
- [ ] OS 파일 공유 미지원, 취소, 실패 또는 transient activation 만료 시 생성된 링크를 보존하고 `이미지 저장`과 `링크 복사` fallback을 노출한다.
- [ ] 미리보기와 1080×1920 PNG를 같은 presentation model과 정보 위계로 그린다.
- [ ] 카드의 핵심을 `관계+표본 → 친구 시선의 우세 결과 → 내 선택과의 일치 여부`로 올리고, 원본 질문과 A/B 분포는 보조 정보로 내린다.
- [ ] 검정·cobalt·lime·coral 시각 언어와 issue #147의 privacy-safe 카드·public invite 계약을 유지한다.
- [ ] 일반 공유 관리 mode, 기존 링크 lifecycle, analytics, privacy 회귀를 focused unit/E2E와 제품 SSOT로 고정한다.

## 제외 범위

- [ ] 공개 account 프로필, 전체 프로필 공유, 프로필 검색·팔로우·댓글·DM·인앱 채팅은 추가하지 않는다.
- [ ] 활성 public 링크 목록이나 raw secret 복원, 새 link kind, 새 API·DB·RPC·migration·Storage를 추가하지 않는다.
- [ ] 관계·질문·색상·폰트·레이아웃 편집기, 3색 테마 선택기, 복수 템플릿과 새 공유 채널 SDK를 만들지 않는다.
- [ ] 점수·순위·MBTI·AI 요약·성격 문장·방문자 신원이나 개별 답변을 만들거나 공개하지 않는다.
- [ ] Instagram Story 직접 게시, 자동 메시지, 수신·열람 확인은 지원하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md` §2, §5.4, §5.7, §6.5
- `docs/product/question-pack-spec.md`의 발행 질문·선택지·관계 registry
- `docs/product/decision-log.md`의 2026-07-24 관계 인사이트 카드 공유 결정
- `docs/design/p0-mobile-ui-spec.md` §5, §6, §7.3, §7.7, §10
- `docs/engineering/core-funnel-events.md`
- `docs/specs/issue-147.md`
- `.codex/AGENTS.md`
- GitHub issue #155
- Lazyweb improve report [GYEOP share card result screen](https://www.lazyweb.com/report/lazyweb/29e22c98-1f20-4d90-af83-b3cadaf1c22b/?source=create)
- W3C [Web Share API](https://www.w3.org/TR/web-share/)의 transient activation과 share promise 계약
- 현행 코드:
  - `app/me/plays/[playId]/share-link-manager.tsx`
  - `app/me/plays/[playId]/profile-share-card.tsx`
  - `app/me/plays/[playId]/profile-share-card.module.css`
  - `app/me/plays/[playId]/share-links.module.css`
  - `lib/owner-profile/profile-share-card-core.mjs`
  - `lib/share-links/share-handoff-core.mjs`
  - `lib/share-links/share-link-client.ts`
  - `tests/unit/profile-share-card.test.mjs`
  - `tests/e2e/share-links.spec.ts`

## 사용자 흐름 영향

- [ ] owner는 safe card mode에 들어오면 관리 설명이나 링크 종류·목록 대신 친구들이 본 결과 카드와 `이 카드 공유하기` Primary 하나를 본다.
- [ ] PNG는 화면 진입 뒤 자동으로 준비한다. 준비 중에는 현재 결과를 유지하고 `카드를 준비하는 중…` 상태로 중복 제출을 막으며, 준비되면 Primary를 활성화한다.
- [ ] Primary를 누르면 공개 초대 링크가 없을 때 같은 action 안에서 링크를 생성한다. 성공한 URL은 즉시 메모리에 보존하고, 파일 공유가 가능하면 별도 두 번째 클릭 없이 PNG+text+URL OS 공유를 시도한다.
- [ ] 링크 생성 실패는 `카드를 공유하지 못했어요 · 다시 시도`로 복구하며 공유 성공으로 표현하지 않는다.
- [ ] `AbortError`, `NotAllowedError`, 일반 reject와 `canShare({files}) === false`는 모두 생성된 링크를 지우지 않고 fallback을 연다. 취소도 성공 event 0건이며 `공유를 취소했어요. 링크는 그대로 있어요.`를 표시한다.
- [ ] 파일 공유가 가능한 취소·실패 상태에서는 `이 카드 공유하기` 재시도 Primary를 유지할 수 있다. 파일 공유 자체가 미지원이면 반복해서 실패할 Primary를 숨기고 `이미지 저장`·`링크 복사`를 제공한다.
- [ ] fallback에서 PNG가 준비됐으면 `이미지 저장`과 `링크 복사`를 함께 제공한다. PNG render 자체가 실패한 예외에서는 이미지 성공을 가장하지 않고 보존된 링크 복사만 제공한다.
- [ ] clipboard 실패 시 기존 읽기 전용 URL field를 노출하고 focus·전체 선택해 직접 복사할 수 있게 한다.
- [ ] 일반 `/me/plays/[playId]` 공유 관리 진입의 공개/1:1 선택, 링크 생성·회전·비활성화·native link share는 그대로 유지한다.
- [ ] 외부 방문자는 함께 전달된 기존 public invite URL로 로그인 없이 같은 팩 3장 응답에 진입한다. 방문자 비교와 `나도 이 팩으로 시작하기` 순서는 바꾸지 않는다.

## 디자인 영향

- [ ] Lazyweb의 F1 `카드 공유 준비하기` 중간 단계와 F2 preview/관리 도구처럼 읽히는 위계를 해소한다. 무료 variant의 테마 picker는 채택하지 않는다.
- [ ] card mode shell은 `← 프로필로`, 짧은 결과 맥락, 결과 카드, 단일 Primary 순서만 둔다. export PNG는 항상 9:16이고, 높이 650px 이하 DOM 미리보기만 첫 viewport의 Primary를 보장하기 위해 4:5로 압축한다. 기존 jumbo action 제목, 반복 pack 제목, generic 설명, share kind, 링크 목록과 1:1 panel은 렌더하지 않는다.
- [ ] DOM 미리보기와 PNG는 같은 presentation model을 다음 순서와 강조로 사용한다.
  1. `오래된 친구 · 3명의 시선`처럼 관계와 해당 질문 표본 수
  2. 친구들이 더 많이 고른 실제 선택지를 가장 큰 결과 문장으로 표시
  3. `match`는 `내 선택도 같아요`, `mismatch`는 `내 선택은 달라요`와 실제 내 선택을 표시
  4. 원본 질문과 `A n명 · B n명` 분포를 보조 정보로 표시
  5. pack 제목과 `겹` brand는 한 번만 낮은 위계로 표시
- [ ] `tie`는 결과 문구를 정확히 `시선이 반으로 갈렸어요`로 표시하고 agreement badge를 표시하지 않는다. 내 선택은 해석 없이 보조 행으로만 표시한다.
- [ ] 검정 canvas, warm paper, cobalt, lime, coral, 굵은 한글 typography와 절제된 stack offset은 유지한다. 큰 빈 공간과 동일 제목 반복은 제거한다.
- [ ] 분포와 match/mismatch는 색만으로 구분하지 않고 문구·count·shape를 함께 사용한다.
- [ ] 360×800과 320×568에서 body 가로 overflow가 없고 결과 핵심과 단일 Primary가 순서대로 접근 가능해야 한다. 세로 scroll은 허용하되 preview 위에 관리 설명을 쌓지 않는다.
- [ ] 버튼은 44px 이상이며 `:focus-visible`, keyboard focus 복귀, `aria-live`, 200% zoom과 reduced motion에서도 같은 완료가 가능해야 한다.

## API와 데이터 영향

- [ ] 새 API·schema·migration·storage는 없다. 카드 자격과 safe model은 issue #147의 `GET /api/me/profile`, `buildProfileShareCardModel`, 기존 public 링크 생성 API를 재사용한다.
- [ ] safe card model의 allowlist `packTitle`, `relationshipLabel`, `prompt`, `optionA`, `optionB`, `selfChoice`, `counts`는 바꾸지 않는다.
- [ ] `lib/owner-profile/profile-share-card-core.mjs`의 공통 presentation helper는 safe model만 받아 다음 값을 결정적으로 만든다.
  - `sampleCount = counts.a + counts.b`
  - `dominantChoice = "a" | "b" | null`
  - `resultState = "match" | "mismatch" | "tie"`
  - 우세 결과·내 선택·질문·분포에 사용할 exact 문구
- [ ] `counts.a === counts.b`이면 `dominantChoice=null`, `resultState="tie"`다. 그 외에는 큰 count의 choice가 우세이며 `selfChoice`와 같으면 `match`, 다르면 `mismatch`다.
- [ ] 전체 표본은 관계 전체 `sightCount`가 아니라 반드시 공유한 해당 질문의 `counts.a + counts.b`다.
- [ ] DOM과 Canvas는 위 공통 presentation model만 소비한다. 두 renderer가 우세·tie·agreement 문구나 표본 수를 별도로 재계산하지 않는다.
- [ ] public invite URL은 기존 fragment secret 계약을 유지하며 PNG pixel·filename·model에는 넣지 않는다. 새로 생성한 raw URL은 현재 card mode 메모리에만 보존한다.
- [ ] Web Share는 transient activation을 요구하므로 create fetch 뒤 브라우저가 activation을 만료시켜 `NotAllowedError`를 낼 수 있다. 성공을 보장하지 않고 같은 click handler에서 즉시 시도한 뒤 보존된 링크 fallback으로 복구한다.

## 구현 계획

- [ ] `lib/owner-profile/profile-share-card-core.mjs`에 `match|mismatch|tie`, 해당 질문 표본, 우세·내 선택·분포 exact copy를 만드는 작은 pure presentation helper를 추가한다.
- [ ] `profile-share-card.tsx`는 DOM preview와 1080×1920 Canvas renderer가 동일 helper 결과를 소비하도록 바꾼다. 결과 문장을 가장 크게 두고 질문·분포·내 선택의 위계를 맞춘다.
- [ ] `profile-share-card.module.css`는 큰 빈 row와 반복 header를 제거하고 기본 9:16 결과-first layout, 장문 줄바꿈과 3자리 count bounds를 유지한다. 단, 높이 650px 이하 DOM 미리보기만 4:5로 압축하며 9:16 export에는 영향을 주지 않는다.
- [ ] `share-link-manager.tsx`는 card mode 전용 Primary handler 하나에서 action latch → 필요 시 public link create → `readyLink` 저장 → 가능 시 `navigator.share`를 순서대로 실행한다.
- [ ] 같은 handler에서 이미 준비된 `readyLink`는 재사용하고 취소·실패·미지원 시 지우지 않는다. native resolve일 때만 기존 성공 event를 한 번 기록한다.
- [ ] card mode의 `forceCardFallback`, feedback, focus 복귀를 취소까지 같은 계약으로 정리하고, 일반 manager의 `create`, `shareReadyLink`, rotate/disable/copy 경로는 회귀 없이 유지한다.
- [ ] `share-links.module.css`는 card mode 상단 중복 문구를 줄이고 Primary·fallback·manual URL이 320px와 200% zoom에서 한 열로 복구되게 한다.
- [ ] `tests/unit/profile-share-card.test.mjs`와 `tests/e2e/share-links.spec.ts`를 최소 수정하고, 제품 SSOT 세 문서를 한 번 공유 결과 화면과 direct Primary 계약으로 갱신한다.

## 완료 기준

- [ ] card mode 첫 안정 상태에는 결과 카드와 `이 카드 공유하기` Primary만 있고 `카드 공유 준비하기`, `카드와 링크 공유하기`, share kind, 만든 링크 목록, 1:1 panel이 없다.
- [ ] 링크가 없는 상태의 Primary 한 번으로 public 링크 POST가 정확히 한 번 실행되고, 파일 공유 가능 환경에서는 그 응답 뒤 `navigator.share`가 PNG+기존 text+URL로 정확히 한 번 호출된다.
- [ ] 같은 tick 중복 클릭은 create/share를 중복 실행하지 않는다.
- [ ] share promise resolve에만 `share_handoff_succeeded`가 기존 `entrySource=profile_reshare`로 한 번 기록된다.
- [ ] `AbortError`, create 뒤 `NotAllowedError`, 일반 reject, `canShare=false`는 성공 event 0건이고 생성된 URL을 유지하며 fallback을 노출한다.
- [ ] 실패 뒤 재시도는 기존 `readyLink`를 사용해 새 public 링크를 만들지 않는다.
- [ ] fallback의 링크 복사 성공만 기존 `share_link_copied`를 기록하고 clipboard 실패는 manual URL field에 focus·전체 선택한다.
- [ ] presentation helper가 `match|mismatch|tie`를 정확히 만들고 tie에는 `시선이 반으로 갈렸어요`만 표시하며 agreement badge가 없다.
- [ ] preview와 PNG의 관계, `counts.a+counts.b` 표본, 결과 상태 문구, 원본 질문, A/B count, 내 선택이 일치한다.
- [ ] Canvas는 정확히 1080×1920 PNG를 만들며 장문 한글과 3자리 count가 영역 밖으로 잘리거나 겹치지 않는다.
- [ ] `romantic`, 1:1 응답, 닉네임, 내부 ID, relationship code, URL/secret, 관리 URL은 model·DOM·Canvas·file metadata에 들어가지 않는다.
- [ ] 일반 공유 관리 mode의 public/1:1 링크 생성, native link share, copy, rotate, disable과 기존 lifecycle이 회귀하지 않는다.
- [ ] 360×800, 320×568, keyboard, focus-visible, 200% zoom, screen reader feedback와 reduced motion 검증이 통과한다.

## 테스트 계획

- [ ] `node --test tests/unit/profile-share-card.test.mjs tests/unit/share-handoff.test.mjs`
- [ ] Unit presentation cases:
  - A 우세+self A → `match`
  - B 우세+self A → `mismatch`
  - A/B 동수 → `tie`, exact `시선이 반으로 갈렸어요`, agreement badge 없음
  - 모든 case의 `sampleCount === counts.a + counts.b`
- [ ] `pnpm lint && pnpm typecheck && pnpm build`
- [ ] Focused Playwright: `pnpm exec playwright test tests/e2e/share-links.spec.ts --project=mobile-chromium --workers=1`
- [ ] One-click fixture: 첫 Primary click에서 public link create 응답 뒤 file+text+URL share가 한 번 호출되고 중간 CTA가 나타나지 않는지 검증한다.
- [ ] Activation expiry fixture: create fetch가 resolve된 뒤 `navigator.share`가 `NotAllowedError`를 던지게 하고 URL 보존, fallback 노출, 성공 event 0건을 검증한다.
- [ ] Cancellation/failure fixture: `AbortError`와 일반 reject 모두 fallback을 열고 재시도 Primary가 기존 링크를 재사용하는지 검증한다.
- [ ] Unsupported fixture: `canShare=false`에서 native Primary를 반복 노출하지 않고 이미지 저장+링크 복사로 복구하는지 검증한다.
- [ ] DOM/Canvas parity: Canvas context의 `fillText`를 capture해 relation+sample, 우세/tie 결과, match/mismatch 또는 plain self text, 질문, A/B count 핵심 문자열이 DOM과 동일한 presentation model에서 나온 값인지 검증한다.
- [ ] PNG fixture: File을 decode해 1080×1920, `image/png`, safe filename, 장문 bounds와 금지 필드 부재를 검증한다.
- [ ] General manager regression: selection 없는 일반 화면에서 native link share, public/1:1 create, copy, rotate, disable이 유지되는지 검증한다.
- [ ] Viewport/accessibility: 360×800과 320×568, 200% zoom, keyboard focus 복귀, reduced motion, 44px target, 가로 overflow 0을 검증한다.
- [ ] 최종 gate는 `scripts/task-harness pr 155`가 실행하는 `./scripts/run-ai-verify --mode full`과 GitHub named `verify` CI다.

## 분석과 관측성

- [ ] 새 event, GA4 event, property, custom dimension을 추가하지 않는다.
- [ ] card mode 진입은 기존 `profile_reshare_clicked`, native promise resolve는 `share_handoff_succeeded`, 실제 링크 복사 성공은 `share_link_copied`를 재사용한다.
- [ ] 링크 생성만으로 share 성공을 추정하지 않는다. 취소·`NotAllowedError`·일반 실패·다운로드는 성공 event를 기록하지 않는다.
- [ ] 기존 `entrySource`, `packVersion`, `linkKind` allowlist 외에 관계·질문·A/B·count·nickname·ID·URL·secret을 event나 log에 보내지 않는다.

## 개인정보와 악용 방지

- [ ] 관계 완료 3건 이상과 동일 관계·질문 표본 3건 이상을 통과한 submitted public 집계만 기존 safe model로 받는다.
- [ ] 전체 표본은 해당 질문의 공개 가능한 A/B count 합만 사용하며 서로 다른 질문·관계·play의 소표본을 합치지 않는다.
- [ ] `romantic`, 1:1 결과, `known_since_code`, 방문자 이름·사진·개별 선택·response/session ID는 공유 후보와 renderer에서 계속 제외한다.
- [ ] derived presentation model은 safe model의 문구·count만 포함하고 ID·URL·secret을 새로 받지 않는다.
- [ ] PNG는 클라이언트 메모리에서만 만들고 서버·Storage·analytics·error log에 업로드하지 않는다.
- [ ] stale selection이나 threshold 하락은 기존 profile 재검증에서 fail closed하며 임의의 다른 카드를 대신 공유하지 않는다.

## 롤아웃과 복구

- [ ] migration·외부 서비스·새 dependency가 없어 feature flag를 추가하지 않고 기존 Next.js/Render 배포로 반영한다.
- [ ] 실패 시 card mode의 combined handler와 presentation layout만 issue #147의 두 단계 UI로 되돌릴 수 있다. 일반 링크 관리와 데이터는 그대로 남는다.
- [ ] 배포 rollback 판단 전 focused manual fixture로 native share 성공·취소·`NotAllowedError`·미지원 fallback을 확인한다. 새 analytics나 browser error 수집은 추가하지 않고 오류 원문과 URL도 log에 남기지 않는다.
- [ ] 배포 뒤 merged SHA의 Render success와 production `/`, `/me`, `/me/profile/[playId]`, `/me/plays/[playId]`를 확인하고 인증 fixture로 one-click·fallback을 검증한다.

## 스펙 검토

Reviewer Agent: issue155_critic
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] Web Share transient activation은 network await 동안 브라우저별로 만료될 수 있다. 같은 click handler에서 즉시 시도하되 `NotAllowedError`를 정상 복구 상태로 취급하고 보존된 링크 fallback을 제품 계약으로 둔다.
- [x] 우세가 없는 동수는 match/mismatch를 만들지 않고 `tie`와 `시선이 반으로 갈렸어요`로 고정한다.
- [x] OS가 file+URL을 실제 대상 앱에 함께 보존하는지는 보장하지 않는다. 성공 정의는 share promise resolve이며 이미지 저장+링크 복사를 항상 복구 경로로 둔다.
- [x] 테마 picker와 카드 편집기는 결과-first 한 장 공유 검증에 필요하지 않아 제외한다.
