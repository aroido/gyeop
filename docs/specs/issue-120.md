# Issue 120 구현 스펙: [프론트] 선택한 질문팩 테마를 오픈 애니메이션에 연결

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/120

## 목표

홈에서 선택한 공식 질문팩의 기존 `presentation.coverTone`, `coverRecipe`, 제목을 단일 카드팩 개봉 타임라인에 연결해, 사용자가 선택한 팩과 실제로 여는 팩이 같은 상품으로 인식되게 한다.

## 범위

- [ ] `/play/new` 서버 페이지가 선택한 manifest의 `presentation.coverTone`과 `coverRecipe`를 기존 제목·slug와 함께 bootstrap에 전달한다.
- [ ] `PlayTransitionProvider`의 opening state가 pack slug, 제목, tone, recipe를 한 번 보존하고 `PackOpeningAnimation`에 전달한다.
- [ ] 기존 `/public/animations/gyeop-pack-opening.json` 하나를 fetch한 뒤 정적 fill token을 tone별 팔레트로 복제·치환해 Lottie에 `animationData`로 로드한다.
- [ ] 현재 catalog가 사용하는 exact 6개 tone `lime|blue|coral|ink|violet|cream`을 지원하고, 알 수 없는 값은 `lime`으로 폴백한다.
- [ ] 닫힌 팩 위에 팩 제목과 `coverRecipe`에서 결정적으로 만든 짧은 mark·pattern을 표시하고, 카드 추출이 시작되면 함께 사라지게 한다.
- [ ] Lottie 실패 fallback도 같은 tone·mark·title을 사용한다.
- [ ] 기존 scroll scrub, frame 94 handoff, frame 119 settle, 역스크롤, 키보드 버튼, reduced motion 즉시 진입을 유지한다.
- [ ] 제품 결정 기록과 단위/E2E 회귀 검증을 갱신한다.

## 제외 범위

- [ ] 팩별 Lottie JSON 24개 또는 tone별 JSON 6개를 만들지 않는다.
- [ ] 개봉 타임라인, 프레임 수, 스크롤 거리, preload·라우팅 계약을 다시 설계하지 않는다.
- [ ] manifest·DB·published pack API schema에 새 필드를 추가하지 않는다. `coverTone`과 `coverRecipe`는 기존 manifest 값을 재사용한다.
- [ ] routed owner/visitor 실제 질문 화면 전체를 팩별 테마로 바꾸지 않는다. browser owner 화면은 published pack API만 사용한다는 SSOT 때문에 별도 API 계약 결정이 필요하다.
- [ ] 사운드, 진동, 파티클, 외부 이미지·폰트·특정 카드 IP를 추가하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md
- .codex/AGENTS.md
- content/packs/*-v1.json
- scripts/verify-pack-catalog.mjs

## 사용자 흐름 영향

- [ ] 주인: 홈에서 본 팩의 색·제목·mark가 `/play/new` 개봉에도 이어지고, 기존과 동일하게 첫 질문으로 진입한다.
- [ ] 전환된 새 주인: `나도 이 팩으로 시작하기`로 들어온 동일 팩도 같은 manifest presentation을 사용한다.
- [ ] 방문자: 방문 응답·비교 화면과 응답 선택 로직은 바뀌지 않는다.

## 디자인 영향

- [ ] 대상은 모바일 `/play/new?pack=<slug>` 개봉 overlay다.
- [ ] tone 팔레트는 홈 카드의 현재 색 조합을 계승한다: lime `#dfff00/#315cff`, blue `#315cff/#dfff00`, coral `#ff4d42/#050505`, ink `#0a0a0a/#dfff00`, violet `#7654ff/#dfff00`, cream `#ffe8b5/#ff4d42`.
- [ ] 포장 body·detail·halo·추출 카드 accent는 tone 팔레트로 치환한다. contrast를 위해 off-white와 dark 단계는 tone별 고정 shade를 사용한다.
- [ ] pack identity overlay는 title과 recipe 기반 영문 mark(예: `first-impression-card-v1` → `FI`)를 보이며, recipe hash로 소수의 CSS pattern 중 하나를 고른다. 별도 이미지 asset은 없다.
- [ ] identity overlay는 초기 닫힌 팩에서만 읽히고 extraction 구간 전에 opacity/transform으로 사라져 Lottie 움직임과 분리되어 떠 보이지 않게 한다.

## API와 데이터 영향

- [ ] API, Supabase schema, migration, storage, auth 변경은 없다.
- [ ] `findPackManifest`가 이미 반환하는 `manifest.presentation.coverTone`과 `coverRecipe`를 server-to-client props로만 전달한다.
- [ ] client boundary에서 tone allowlist를 정규화하고 예상하지 못한 값은 lime으로 폴백한다.

## 구현 계획

- [ ] `lib/packs/opening-theme.mjs`에 tone 정규화, recipe mark/pattern 결정, `structuredClone` 기반 Lottie fill 치환을 순수 함수로 둔다.
- [ ] `app/play/new/page.tsx`와 `bootstrap.tsx`가 presentation props를 전달하고 `beginOpening` signature를 확장한다.
- [ ] `app/play/play-transition.tsx`가 base JSON을 직접 fetch하고 theme helper를 적용해 단일 `animationData`를 로드한다. fetch/import/data failure는 기존 fallback으로 수렴한다.
- [ ] `app/play/play-transition.module.css`에 tone CSS 변수와 identity/pattern/fallback 표현을 추가한다.
- [ ] `package.json`의 명시적 `pnpm test` 목록에 `tests/unit/opening-theme.test.mjs`를 포함한다.
- [ ] `docs/product/decision-log.md`에 단일 타임라인·manifest presentation 상속 결정을 기록한다.
- [ ] 기존 unit/E2E에서 six-tone, unknown fallback, base JSON 불변성, blue pack identity와 기존 handoff 회귀를 검증한다.

## 완료 기준

- [ ] `first-impression` 진입 시 opening stage의 normalized tone이 `blue`이고 닫힌 포장 body가 blue 팔레트, accent가 lime으로 렌더된다.
- [ ] lime, blue, coral, ink, violet, cream의 themed Lottie fill fingerprint가 서로 다르다.
- [ ] 같은 blue tone인 `first-impression`과 `reply-temperature`는 title/recipe mark 또는 pattern으로 구분된다.
- [ ] unknown tone은 예외 없이 lime 팔레트와 접근 가능한 기존 흐름으로 폴백한다.
- [ ] base Lottie 객체를 mutate하지 않으며 theme 변경마다 동일한 0–119 frame timeline을 보존한다.
- [ ] asset fetch 실패 시 tone이 적용된 fallback, 팩 제목과 mark가 남고 `팩 열기`로 첫 질문까지 갈 수 있다.
- [ ] 기존 frame 94 대기, ready 후 frame 119·route 연결, 역스크롤, no-overflow, 키보드와 reduced-motion 검증이 통과한다.

## 테스트 계획

- [ ] `node --test tests/unit/pack-opening-lottie.test.mjs tests/unit/opening-theme.test.mjs`
- [ ] `pnpm test`가 `tests/unit/opening-theme.test.mjs`를 포함해 기본 CI에서도 theme helper 회귀를 검증한다.
- [ ] `pnpm exec playwright test tests/e2e/owner-play.spec.ts --workers=1`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `scripts/task-harness pr 120`이 소유하는 `./scripts/run-ai-verify --mode full`
- [ ] 390×844 모바일에서 blue와 coral 팩 초기 화면을 캡처해 색·title·mark, 가로 overflow, 개봉 후 질문 handoff를 육안 확인한다.

## 분석과 관측성

- [ ] 새 analytics, log, dashboard는 없다. 기존 pack slug와 entry source로 팩별 시작·전환을 구분할 수 있다.

## 개인정보와 악용 방지

- [ ] presentation metadata는 저장된 답변이나 사용자 식별자가 아닌 저장소 소유 공식 팩 정보다.
- [ ] raw 답변, owner/visitor capability, 공유 secret, Auth 정보의 수집·노출·로그 계약은 바뀌지 않는다.
- [ ] title은 이미 홈에서 공개된 공식 팩 제목만 사용하고 임의 사용자 문자열을 style·selector로 삽입하지 않는다.

## 롤아웃과 복구

- [ ] migration과 feature flag 없이 현재 Render 배포에 포함한다.
- [ ] 실패 시 presentation props와 theme helper·identity CSS를 되돌리면 기존 단일 기본 Lottie로 복구된다.
- [ ] unknown value와 asset failure는 각각 lime palette와 정적 fallback으로 fail-open 한다.

## 스펙 검토

Reviewer Agent: issue_120_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 실제 routed 질문 화면의 팩별 테마는 published pack API가 presentation을 노출하지 않아 이번 이슈에서 제외한다. 개봉에서 실제 질문 화면까지 색 연속성이 추가로 필요하다는 사용자 검증이 나오면 API SSOT를 먼저 결정한다.
- [ ] Lottie source color token이 변경되면 theme helper와 unit test가 함께 실패하도록 exact token 검증을 둔다.
- [ ] 현재 구현 전 미결정 제품 블로커는 없다.
