# Issue 46 구현 스펙: 오래된 친구팩 10장 로컬 플레이 프로토타입

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/46

## 목표

첫 접속 화면에서 GYEOP의 작동 방식과 오래된 친구팩의 대상·분량·보상을 이해하고, `팩 열어보기` 한 번으로 A/B 카드 10장 응답·이전 답 수정·새로고침 복구·완료 확인까지 이어지는 모바일 로컬 프로토타입을 구현한다.

## 범위

- `app/(public)/page.tsx`, `app/(public)/page.module.css`
  - `/`를 오래된 친구팩 하나에 집중한 모바일 첫 접속 화면으로 재구성한다.
  - 서비스 가치, 팩 제목, `오래된 친구` 추천 관계, 질문 10장, 약 2분, `따뜻한 회상` 분위기, 낮은 민감도, `공개 공유 추천`, 답변 뒤 친구와 비교한다는 보상을 한 화면에서 빠르게 읽게 한다.
  - 여러 팩 탐색이나 설명 섹션을 추가하지 않고 `팩 열어보기`를 유일한 주 CTA로 둔다.
  - development에서만 CTA를 `/play/old-friend`로 연결한다. production build도 같은 첫 화면을 렌더링하되 CTA는 준비 상태로 유지해 미승인 질문을 시작할 수 없게 한다.
- `app/play/old-friend/page.tsx`, `app/play/old-friend/play.tsx`, `app/play/old-friend/page.module.css`
  - production request는 `notFound()`로 차단한다.
  - 기존 홈의 색상 token, 겹친 카드, 둥근 모서리, typography를 재사용한다.
  - 기본 motion에서 1.2초 개봉 상태를 거쳐 첫 카드로 이동한다.
  - `prefers-reduced-motion: reduce`에서는 의도적 지연 없이 첫 카드를 표시한다.
  - 질문 1장, A/B 버튼, `n/10` 진행률, 이전 이동, 선택 수정, 완료 요약, 재시작을 구현한다.
  - 이 스펙의 질문팩 검수 기준을 통과한 고정 질문 10장과 Signature 1장을 코드 fixture로 둔다.
- 고정 질문 fixture

| id | Signature | 질문 | A | B |
|---|:---:|---|---|---|
| `conflict` | ✓ | 서운한 일이 생기면 나는? | 바로 이야기한다 | 생각을 정리한 뒤 말한다 |
| `reunion` |  | 오랜만에 친구를 만나면 나는? | 어제 본 듯 바로 편해진다 | 근황부터 천천히 맞춰 간다 |
| `plans` |  | 약속을 잡을 때 나는? | 미리 날짜를 정한다 | 그때그때 편한 날을 본다 |
| `comfort` |  | 친구가 고민을 털어놓으면 나는? | 먼저 끝까지 들어준다 | 해결 방법부터 같이 찾는다 |
| `gathering` |  | 여러 친구가 모인 자리에서 나는? | 먼저 분위기를 띄운다 | 익숙한 사람 곁에서 시작한다 |
| `reconnect` |  | 연락이 뜸해졌을 때 나는? | 짧게 안부부터 보낸다 | 만날 약속부터 잡는다 |
| `memory` |  | 옛날 이야기가 나오면 나는? | 구체적인 장면부터 떠올린다 | 그때 느낀 감정부터 떠올린다 |
| `travel` |  | 친구와 여행 일정을 정할 때 나는? | 미리 계획을 세운다 | 현장에서 그때그때 정한다 |
| `celebration` |  | 친구의 좋은 소식을 들은 직후 나는? | 바로 연락해 축하한다 | 다음에 만날 때 직접 축하한다 |
| `hard-day` |  | 힘든 날에 나는? | 먼저 연락해 털어놓는다 | 혼자 정리한 뒤 연락한다 |

  모든 카드는 `relationship_tag=old_friend`, `tone=warm_reminiscence`, `sensitivity=low`, `recommended_share=public`, `version=old-friend-v1-draft`, `active=false`다. `공개` 추천은 비밀·민감 정보가 아닌 관찰 가능한 습관을 묻고 오래된 친구 관계의 공유 장벽이 낮다는 P0 선정 근거에 따른 draft 값이다. production pack과 방문자 문구는 #10에서 사람 승인 후 별도로 발행한다.
- `localStorage`
  - key는 `gyeop:old-friend-play:v1` 하나만 사용한다.
  - `{ version: 1, currentIndex, answers }`만 저장한다. `answers` 값은 카드 id별 `"a" | "b"`다.
  - hydration 완료 전에는 기본 state를 저장하지 않는다.
  - JSON parse 실패, version 불일치, 범위 밖 index, 알 수 없는 카드·선택 값은 전체 draft를 폐기하고 초기 상태로 복구한다.
  - `currentIndex`가 첫 미응답 카드보다 뒤면 첫 미응답으로 정규화한다. 첫 미응답보다 같거나 앞이면 이전 답을 검토 중인 유효 상태로 보존한다. 10장 완료 상태는 index 9로 정규화한다.
  - `getItem`, `setItem`, `removeItem` 예외는 화면을 중단하지 않고 해당 session 동안 in-memory state로 계속한다.
- `tests/e2e/home.spec.ts`, `tests/e2e/old-friend-play.spec.ts`
  - 기존 홈 테스트를 실제 route 계약으로 수정한다.
  - 320px 모바일의 10장 완료, 이전/수정, reload 복구, 잘못된 draft 초기화, 완료 전 차단, keyboard focus를 검증한다.

## 제외 범위

- Supabase schema, seed, API, 서버 저장
- 이메일 매직 링크, owner 귀속, 다른 기기 복구
- 공개·1:1 링크, 방문자 응답, 비교 결과, 프로필
- swipe gesture와 분석 event 전송. swipe는 production owner 응답 이슈 #18이 소유하며 이 로컬 prototype은 명시적 버튼만 검증한다.
- production 질문팩 발행 및 `active=true` 전환
- 새 dependency, 상태 관리 library, form library
- 여러 팩 목록, 탐색 내비게이션, 로그인 진입, 공개 랜딩의 추가 설명 섹션
- 첫 화면 밖의 공유·방문자·비교·프로필 UI

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/specs/issue-46.md`의 고정 질문 fixture와 pack metadata
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 주인은 `/` 첫 화면에서 GYEOP이 `내가 먼저 답하고 친구의 시선과 비교하는 서비스`임을 이해하고, 오래된 친구팩의 추천 관계·분량·예상 시간·민감도를 확인한다.
- 주인은 첫 viewport 안의 `팩 열어보기`를 누르고 `/play/old-friend`로 이동한다.
- 개봉 상태 뒤 1번 카드부터 A/B를 선택하며 선택 직후 다음 카드로 이동한다. 카드·이전·완료 전환마다 새 heading으로 focus가 이동하고 진행 상태를 알린다.
- 이전 버튼으로 답한 카드에 돌아가 현재 선택을 확인하고 바꿀 수 있다.
- reload 뒤 저장된 답과 현재 카드가 복구된다.
- 10번째 답 뒤 완료 요약에서 모든 선택을 확인하고 `처음부터 다시 하기`로 로컬 draft를 지울 수 있다.
- 방문자와 전환된 새 주인 흐름은 바뀌지 않는다.

## 디자인 영향

- 첫 화면의 과도한 빈 공간과 화면 아래로 밀린 팩 카드를 제거한다. 320x800에서 브랜드, 핵심 가치, 팩 정보, 주 CTA가 스크롤 없이 보여야 한다.
- 보라색 brand token, 겹친 카드 모티프, 둥근 모서리는 유지하되 현재 grid stretch 배치는 폐기한다.
- 팩 메타데이터는 장식용 pill 나열이 아니라 추천 관계·분량·예상 시간·분위기·민감도·공유 추천을 명시하는 접근 가능한 목록으로 제공한다.
- development와 production은 같은 레이아웃을 사용하고 CTA 상태만 다르게 한다.
- 플레이 화면은 첫 화면과 같은 `app/globals.css` token과 겹친 카드 언어를 사용한다.
- 각 카드에서 질문과 A/B만 주 행동으로 두고 progress와 이전 버튼은 보조 위계로 둔다.
- A/B 버튼은 최소 52px 높이, 명확한 focus outline과 `aria-pressed`를 제공한다.
- 진행률은 native `progress`에 `질문 진행률` accessible name과 현재값/최댓값을 제공한다. 질문 heading은 `tabIndex=-1`, 전환 상태는 `aria-live=polite`로 알린다.
- 320px에서 질문 3줄, 선택지 2줄 이내를 실제 Playwright bounding/overflow 검사로 확인한다.

## API와 데이터 영향

- 네트워크 API, auth, migration 변경은 없다.
- production build에서는 홈 CTA와 `/play/old-friend` prototype 접근을 모두 차단한다.
- 브라우저 한 개의 local draft만 지원한다. localStorage는 신뢰 경계이므로 load 시 전체 shape를 검증한다.
- 답변은 서버나 분석 도구로 전송하지 않는다.
- draft version을 고정해 이후 production persistence와 충돌하지 않게 한다.

## 구현 계획

1. 첫 화면을 가치 설명, 오래된 친구팩 정보, 비교 보상 미리보기, 단일 CTA가 320x800 첫 viewport에 들어오는 흐름으로 재구성한다. development만 CTA를 `/play/old-friend`에 연결한다.
2. 10장 고정 fixture와 `Answer` 타입을 client component 안에 둔다. 단일 소비자이므로 별도 repository/service 추상화는 만들지 않는다.
3. mount 시 motion preference와 localStorage draft를 한 번 읽어 검증·정규화한 뒤 `hydrated=true`로 전환한다. 이 gate 전에는 storage write를 하지 않는다.
4. 선택·이전·수정·완료·재시작 상태를 React state와 native localStorage로 구현하고 storage API 예외는 in-memory fallback으로 흡수한다.
5. 카드 index나 완료 상태가 바뀔 때 해당 heading으로 focus를 이동하고 progress/live region을 갱신한다.
6. 공통 token으로 첫 화면, 개봉, 카드, 선택, 완료 화면을 구성하고 reduced-motion media query를 적용한다.
7. 홈과 플레이 E2E를 추가해 실제 브라우저 흐름, 첫 viewport 정보 위계, 로컬 복구 경계를 고정한다.

## 완료 기준

- [ ] 320x800과 430x932의 `/` 첫 viewport에서 서비스 가치, `오래된 친구팩`, 추천 관계 `오래된 친구`, `질문 10장`, `약 2분`, `따뜻한 회상`, `낮은 민감도`, `공개 공유 추천`, `팩 열어보기`가 모두 보이고 가로·세로 스크롤이 없다.
- [ ] 첫 화면의 브랜드/가치 영역과 팩 영역 사이 시각적 공백이 48px를 넘지 않는다.
- [ ] development `/`에서 `팩 열어보기` 한 번으로 `/play/old-friend`에 진입한다.
- [ ] production `/`는 같은 첫 화면 레이아웃에서 native `<button type="button" disabled>`로 `팩 준비 중`을 표시하고 `href`를 렌더링하지 않으며 `/play/old-friend`는 404다.
- [ ] 기본 motion 개봉 상태는 1초 이상 2초 이내이고 reduced motion은 의도적 timer 없이 첫 카드를 표시한다.
- [ ] 320px~430px에서 가로 스크롤 없이 카드 10장을 답한다.
- [ ] 각 카드 화면의 interactive control은 A/B `<button>` 2개와 첫 카드 이후의 `이전` `<button>` 1개뿐이며, progress는 비interactive native `<progress>`로 제공한다.
- [ ] A/B는 keyboard로 선택 가능하고 각 target 높이는 44px 이상이며 focus outline이 보인다.
- [ ] 이전 카드의 현재 선택을 확인하고 바꾼 뒤 다시 진행할 수 있다.
- [ ] 자동 다음 카드, 이전 카드, 완료 전환 뒤 새 질문 또는 완료 heading이 focus를 받으며 progress의 현재값이 갱신된다.
- [ ] reload 뒤 유효한 `currentIndex`와 선택이 복구된다.
- [ ] hydration 전 기본값이 기존 draft를 덮어쓰지 않는다.
- [ ] malformed JSON, 잘못된 version/index/card/answer는 초기화되고, `currentIndex`가 첫 미응답보다 뒤면 첫 미응답으로 이동하며 같거나 앞이면 답변 검토 위치를 보존하고, 10장 완료 draft는 index 9로 정규화된다.
- [ ] localStorage read/write/remove 예외에서도 현재 session의 10장 진행과 재시작이 동작한다.
- [ ] 9개 답에서는 완료 화면이 나오지 않고 10개 답에서만 완료된다.
- [ ] 완료 요약은 10개 질문과 선택을 표시하고 재시작은 localStorage를 지운다.
- [ ] initial document/static asset navigation 이후 app API·third-party fetch/XHR/beacon과 AI 호출이 0건이다.
- [ ] production build에서 prototype CTA와 route가 노출되지 않는다.
- [ ] 독립 QA의 P0/P1 발견 0건과 `./scripts/run-ai-verify --mode full` PASS를 충족한다.

## 테스트 계획

- `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/old-friend-play.spec.ts --project=mobile-chromium`
- `pnpm build`
- `./scripts/run-ai-verify --mode full`
- Playwright 320x800과 430x932에서 첫 화면 핵심 정보와 CTA의 viewport 포함 여부, intro-pack 간격 48px 이하, overflow, target height, focus-visible, question/option line box 확인
- `page.emulateMedia({ reducedMotion: "reduce" })`에서 opening timer 없이 첫 카드가 보이는지 확인
- localStorage valid/malformed/version/index/card/answer/semantic-index fixture와 storage API throw 테스트
- 자동 다음/이전/완료 후 heading focus, `aria-pressed`, progress current/max 확인
- initial navigation 뒤 fetch/XHR/beacon request 0건 확인
- `pnpm build && pnpm start`에서 `팩 열어보기` 링크와 `href` 부재, native disabled button인 `팩 준비 중`, `/play/old-friend` 404 확인

## 분석과 관측성

- 이번 로컬 프로토타입은 event를 전송하지 않는다.
- P0 production route에서 `pack_detail_viewed`, `pack_opened`, `self_answer_saved`, `self_pack_completed`를 연결할 때 선택값을 payload에 넣지 않는다.

## 개인정보와 악용 방지

- 질문은 사람 이름, 연락처, 비밀, 의료·성적 정보를 요구하지 않는다.
- localStorage에는 카드 id와 A/B만 저장하고 이메일·이름·식별자를 저장하지 않는다.
- 화면은 AI 성격 진단, 점수, 정답 표현을 만들지 않는다.
- 브라우저 저장은 production 소유권 증명이 아니며 공유나 서버 저장에 사용하지 않는다.

## 롤아웃과 복구

- migration과 feature flag는 없다.
- 문제 발생 시 홈 CTA를 준비 상태로 되돌리고 `app/play/old-friend/`와 전용 E2E를 제거하면 된다.
- localStorage key는 versioned라 이후 구현이 새 key를 사용해 안전하게 무시할 수 있다.

## 스펙 검토

Reviewer Agent: issue46_spec_review_v2
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 질문 10장은 이 스펙에 고정한 development-only fixture이며 production `active=true` 발행은 별도 사람 승인과 #10에서 수행한다.
- Lazyweb 디자인 보고서는 첫 화면을 핵심 루프의 진입점으로 다시 생성하며, 보고서의 제안도 이 스펙의 P0 범위를 늘리지 않는 항목만 반영한다.
