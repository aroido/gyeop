# 겹 P0 모바일 UI 상태·토큰 명세

- Status: Reviewed
- Version: 1.0
- Issue: https://github.com/aroido/gyeop/issues/11
- 적용 단계: 비공개 재미 검증. 별도 표시된 production beta 후보는 inactive다.

## 1. 이 문서가 고정하는 것

이 문서는 목업의 분위기를 복제하는 자료가 아니라, 겹의 핵심 루프를 모바일에서 일관되게 구현하기 위한 기준이다.

1. 주인은 팩을 고른 뒤 바로 10장에 답한다.
2. 완료한 답과 프로필은 현재 브라우저의 owner capability로 서버에 7일 inactivity window 동안 이어진다.
3. 주인은 공개 또는 1:1 링크를 만든다.
4. 방문자는 로그인 없이 관계·시점을 고르고 필수 3장에 답한다.
5. 제출 전에는 주인의 답을 볼 수 없고, 제출 뒤 자신이 답한 3장만 비교한다.
6. 비교 결과의 가장 강한 행동은 항상 `나도 이 팩으로 시작하기`다.
7. 기존 주인의 `/me`에는 실제 공개 링크 응답만 쌓인다. 데이터가 부족하면 해석을 만들지 않고 `n/3`을 보여 준다.

제품 동작이 이 문서와 충돌하면 `core-feature-priority.md` → `question-pack-spec.md` → `decision-log.md` → `p0-development-plan.md` 순으로 우선한다.

## 2. 현재 단계와 inactive 후보

| 항목      | 비공개 재미 검증                       | production beta 재승인 후보                        |
| --------- | -------------------------------------- | -------------------------------------------------- |
| 주인 저장 | 익명 시작, 완료 뒤 Google OAuth 연결   | 같은 Google 계정의 cross-device 복구 운영 확대     |
| 완료 직후 | Google 연결 → 공유 링크 만들기         | 알림·계정 삭제 등 운영 기능 재승인                 |
| 프로필    | 주인 전용 `/me`, 공개 링크 제출만 누적 | 관계 layer 정책 재승인                             |
| 계정 삭제 | 화면을 노출하지 않음                   | `/me/settings`, 재인증, `/account-deletion/status` |
| 공개 대상 | 특정 팩 플레이 링크                    | 공개 프로필은 P1 이후 별도 결정                    |

현재 완료 화면은 공유 링크를 만들기 전에 Google 계정 연결을 한 번 요구한다. 별도 modal이나 이메일 입력은 두지 않고 다음 문구를 사용한다.

- 저장 안내: `Google 계정으로 저장하면 다른 브라우저에서도 다시 열 수 있어요. 계정 정보는 친구에게 보이지 않아요.`
- Primary: `Google로 계속하기`
- 완료 CTA: `내 질문팩 저장하고 공유하기`
- 로그인 대안: 카카오·네이버·비밀번호·이메일 매직 링크를 표시하지 않음
- 관리 종료: `이 브라우저에서 관리 끝내기`와 `끝내면 다시 복구할 수 없어요` 경고

방문자는 계속 로그인 없이 관계·시점 선택과 필수 3장 응답을 완료한다.

## 3. 목업 01–06 판정

| 목업                   | 유지                                                                                | 수정                                                                           | 현재 단계에서 보류·폐기                                                           |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 01 Product overview    | 큰 한글 typography, 검정 canvas, lime/blue/coral 카드, 한 화면 한 질문, 겹 metaphor | 표시 이름을 `나`·`이 사람`으로 바꾸고 실제 팩 metadata를 우선 노출             | avatar, 확인되지 않은 관계별 결과, `민수` 같은 이름                               |
| 02 End-to-end flow     | 진행, 관계 선택, 새 겹 도착, 프로필로 이어지는 순서                                 | 주인 10장과 방문자 3장을 분리하고 A/B 버튼으로 통일                            | 1~5 점수 척도, 중간 개봉 대기, 답변 전 결과 암시                                  |
| 03 Perspective stack   | 실제 응답이 쌓일수록 card depth가 늘어나는 설명                                     | 현재 `/me`는 셀프 카드 + 공개 링크 카드 표본으로만 표현                        | 실제 데이터 없는 avatar·사람 수, 1:1 응답 포함, 임의 성격 단어                    |
| 04 Profile evolution   | `0 → 1 → threshold → 여러 겹`의 단계감                                              | private MVP 단계는 `셀프 답 → 첫 시선 → 카드 n/3 → 공개 가능한 선택 수`로 번역 | 관계별 레이어는 production beta 정책 전까지 locked candidate                      |
| 05 Share card system   | 검정/blue/lime/coral palette, 한 문장 질문, 겹 symbol                               | P0 공유 card는 특정 팩 참여 CTA와 generic copy만 사용                          | 공개 프로필 card, 표시 이름, avatar, 자동 생성 성격 요약                          |
| 06 Friend contribution | 관계·시점 → 3장 → 비교 → 새 주인 전환                                               | 1~5를 A/B로 바꾸고 Primary를 `나도 이 팩으로 시작하기`로 고정                  | 비교 전에 셀프 답 노출, `나도 내 겹 만들기`처럼 다른 팩으로 갈 수 있는 모호한 CTA |

### 겹 표현의 사용 조건

- 겹은 장식용 3D 카드가 아니라 데이터 상태를 설명해야 한다.
- 회전은 `±1deg` 이내, 동시에 보이는 layer는 최대 4개다.
- layer 하나는 셀프 답 또는 공개 기준을 충족한 실제 aggregate 하나에 대응한다.
- 표본이 부족한 layer는 수치·성격 label 대신 `시선을 모으는 중 · n/3`을 표시한다.
- 같은 정보를 card depth와 숫자로 중복해도 screen reader에는 한 번만 읽히게 한다.

## 4. 디자인 토큰

모든 값은 `:root`의 CSS custom properties로 옮길 수 있다. 기준 font size는 16px이다.

### 4.1 Color

```css
:root {
  --g-color-black-950: #050505;
  --g-color-black-900: #0d0d0d;
  --g-color-black-850: #111111;
  --g-color-black-800: #171717;
  --g-color-black-700: #202020;
  --g-color-black-600: #2b2b2b;
  --g-color-line: #767676;
  --g-color-line-strong: #8a8a8a;
  --g-color-white: #ffffff;
  --g-color-text-secondary: #bdbdbd;
  --g-color-text-muted: #929292;

  --g-color-lime-500: #dfff00;
  --g-color-blue-500: #315cff;
  --g-color-coral-500: #ff4d42;

  --g-color-info-text: #d8e0ff;
  --g-color-success-bg: #162314;
  --g-color-success-border: #7ea274;
  --g-color-success-text: #d7ffd0;
  --g-color-danger-bg: #2b1716;
  --g-color-danger-border: #ff7a70;
  --g-color-danger-text: #ffb4ab;

  --g-bg-canvas: var(--g-color-black-950);
  --g-bg-surface: var(--g-color-black-850);
  --g-bg-raised: var(--g-color-black-800);
  --g-bg-muted: var(--g-color-black-700);
  --g-text-primary: var(--g-color-white);
  --g-text-secondary: var(--g-color-text-secondary);
  --g-text-muted: var(--g-color-text-muted);
  --g-action-primary-bg: var(--g-color-lime-500);
  --g-action-primary-text: var(--g-color-black-950);
  --g-action-focus: var(--g-color-blue-500);
  --g-action-focus-on-blue: var(--g-color-lime-500);
  --g-action-focus-on-coral: var(--g-color-black-950);
  --g-focus-width: 0.1875rem;
  --g-focus-offset: 0.1875rem;
  --g-action-danger-bg: var(--g-color-danger-bg);
  --g-action-danger-border: var(--g-color-danger-border);
  --g-action-danger-text: var(--g-color-danger-text);
  --g-overlay: rgb(0 0 0 / 72%);
}
```

사용 규칙:

- lime은 Primary CTA, 현재 선택, progress와 공개된 핵심 상태에만 쓴다.
- blue는 focus, 겹 offset, 정보성 보조 강조에 쓴다. normal body text 색으로 쓰지 않는다.
- focus 기본색은 blue다. blue surface 위에서는 lime, coral surface 위에서는 black으로 component token을 override해 3:1 boundary 대비를 유지한다.
- line은 가장 밝은 dark surface인 `#202020` 위에서도 3:1을 넘고, danger border는 danger bg와 canvas 모두에서 3:1을 넘는다.
- coral은 팩 구분 또는 경고에 쓸 수 있지만 파괴적 상태는 danger semantic을 사용한다.
- `#929292`보다 어두운 회색을 본문에 쓰지 않는다.
- success/error는 색과 함께 `저장됨`, `다시 시도`, icon 또는 border 형태를 제공한다.

### 4.2 Typography

```css
:root {
  --g-font-sans:
    Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --g-font-mono: ui-monospace, SFMono-Regular, Consolas, monospace;

  --g-font-size-2xs: 0.6875rem;
  --g-font-size-xs: 0.75rem;
  --g-font-size-sm: 0.8125rem;
  --g-font-size-md: 0.875rem;
  --g-font-size-base: 1rem;
  --g-font-size-lg: 1.25rem;
  --g-font-size-xl: 1.5rem;
  --g-font-size-2xl: 2rem;
  --g-font-size-display: clamp(2rem, 10vw, 3.2rem);

  --g-font-weight-body: 700;
  --g-font-weight-label: 800;
  --g-font-weight-strong: 900;
  --g-font-weight-display: 950;

  --g-line-tight: 1.05;
  --g-line-heading: 1.15;
  --g-line-body: 1.5;
  --g-letter-display: -0.07em;
  --g-letter-heading: -0.04em;
}
```

- 질문은 최대 세 줄, A/B 선택지는 각 두 줄을 목표로 하며 `word-break: keep-all`을 사용한다.
- display text가 320px에서 세 줄을 넘으면 font를 32px 아래로 줄이기보다 문구를 줄인다.
- 진행 `3/10`, 저장 상태, `n/3`은 tabular number를 사용한다.
- 의미 없는 all caps와 영어 eyebrow는 쓰지 않는다. `PRIVATE TEST` 같은 운영 표시는 사용자 가치보다 앞에 두지 않는다.

### 4.3 Spacing, size, radius

```css
:root {
  --g-space-1: 0.25rem;
  --g-space-2: 0.5rem;
  --g-space-3: 0.75rem;
  --g-space-4: 1rem;
  --g-space-5: 1.25rem;
  --g-space-6: 1.5rem;
  --g-space-8: 2rem;
  --g-space-10: 2.5rem;
  --g-space-12: 3rem;
  --g-space-16: 4rem;

  --g-control-min: 2.75rem;
  --g-control-large: 3.5rem;
  --g-content-max: 30rem;
  --g-home-max: 64rem;
  --g-page-gutter: clamp(0.75rem, 4vw, 1rem);

  --g-radius-xs: 0.45rem;
  --g-radius-sm: 0.55rem;
  --g-radius-md: 0.7rem;
  --g-radius-lg: 0.85rem;
  --g-radius-xl: 1rem;
  --g-radius-pill: 999px;
}
```

- 모든 interactive target의 실제 hit area는 최소 `44×44 CSS px`다.
- card 내부 기본 padding은 16px, 320px에서는 12px까지 줄일 수 있다.
- 연관된 control 간격은 8px, section 간격은 최소 24px, 화면 주요 구간은 32px을 사용한다.
- safe area가 있는 기기에서 하단 CTA padding은 `max(1rem, env(safe-area-inset-bottom))`을 포함한다.

### 4.4 Elevation과 layer

```css
:root {
  --g-shadow-card: 0.35rem 0.35rem 0 var(--g-color-blue-500);
  --g-shadow-card-small: 0.2rem 0.2rem 0 var(--g-color-blue-500);
  --g-shadow-modal: 0 1.5rem 3.75rem rgb(0 0 0 / 45%);
  --g-layer-step: 0.35rem;
  --g-tilt-negative: -0.7deg;
  --g-tilt-positive: 0.7deg;

  --g-z-base: 0;
  --g-z-sticky: 10;
  --g-z-overlay: 20;
  --g-z-dialog: 30;
  --g-z-toast: 40;
}
```

- border만 있는 surface가 기본이고 Primary question/summary card 한 개에만 hard offset shadow를 준다.
- card stack은 DOM 순서와 읽기 순서를 바꾸지 않고 pseudo-element 또는 decorative sibling로 만든다.
- modal 뒤에서는 body scroll을 잠그고 focus를 dialog 안에 가둔다.

### 4.5 Motion

```css
:root {
  --g-duration-instant: 0ms;
  --g-duration-fast: 120ms;
  --g-duration-normal: 160ms;
  --g-duration-slow: 220ms;
  --g-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --g-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --g-motion-distance: 0.5rem;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- 선택 반응은 120ms, progress width는 160ms, dialog는 최대 220ms다.
- 질문 이동은 opacity/translate 최대 8px만 허용하며 답변 저장보다 먼저 다음 질문을 보여 주더라도 저장 상태를 숨기지 않는다.
- card가 계속 흔들리거나 자동으로 쌓이는 loop animation은 금지한다.
- reduced motion에서는 정보 순서와 완료 feedback을 그대로 두고 이동만 제거한다.

## 5. 공통 layout과 responsive 규칙

|   viewport |    gutter |                                  content | 규칙                                                                                                                  |
| ---------: | --------: | ---------------------------------------: | --------------------------------------------------------------------------------------------------------------------- |
|      320px |      12px |                                    296px | title·선택지를 줄바꿈하고 2열 action을 1열로 내린다. required flow는 가로 scroll이 없다.                              |
|      390px |      16px |                                    358px | 기본 mobile 기준. 한 화면 한 질문과 56px 이상 A/B 선택을 유지한다.                                                    |
|      430px |      16px |                                    398px | 여백을 늘리기보다 card 폭을 사용하되 line length는 body 약 34자 안쪽으로 제한한다.                                    |
| 768px 이상 | 32px 이하 | 홈 최대 1024px, required flow 최대 480px | 홈만 hero/pack rail 2열 확장을 허용한다. 주인·방문자·비교·설정은 가운데 정렬된 1열 mobile flow와 CTA 순서를 유지한다. |

- page shell은 `min-height: 100svh`, `overflow-x: clip`을 사용한다.
- 홈의 팩 rail만 의도적 horizontal list를 허용한다. 다음 card가 12~20% 보이게 해 scroll 가능성을 알리고, keyboard/focus/scroll-snap을 제공한다.
- 팩 선택 뒤 owner/visitor required flow, 비교, profile, settings에는 horizontal scroll을 사용하지 않는다.
- sticky 하단 CTA를 사용할 때 키보드, safe area, 200% zoom에서 내용과 겹치지 않게 같은 높이의 flow padding을 둔다.
- desktop 홈 2열은 hero를 왼쪽, pack rail을 오른쪽에 두며 DOM 읽기 순서는 brand → hero → pack list다. 별도 navigation, sidebar, hover-only 설명은 추가하지 않는다.

## 6. CTA 위계

| level     | 표현                                          | 예시                                                            | 금지                                         |
| --------- | --------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Primary   | full-width lime, 검정 text, 56px 이상         | `이 팩 시작하기`, `공유 링크 만들기`, `나도 이 팩으로 시작하기` | 한 화면에 두 개, disabled 상태에서 이유 없음 |
| Secondary | transparent/dark surface, 흰 text, 1px border | `2장 더 답하기`, `내 프로필 보기`, `링크 복사`                  | Primary 앞 배치, lime fill                   |
| Tertiary  | text link, underline 또는 chevron             | `이전`, `나중에`, `응답 관리`                                   | 44px 미만 hit area                           |
| Danger    | danger outline/bg/text, 별도 위험 구역        | `응답 철회하기`, `계정 삭제 계속하기`                           | lime, success icon, Primary와 인접 배치      |

동일한 화면에서 Primary는 하나뿐이다. 비동기 진행 중에는 label을 동사형 상태로 바꾸고(`링크 만드는 중…`) control을 중복 제출 불가로 만들되, 기존 결과와 현재 단계는 지우지 않는다.

## 7. 화면 상태 명세

### 7.0 공통 상태 적용표

`empty`가 도메인상 정상일 수 없는 화면은 빈 canvas를 만들지 않고 아래의 지정된 terminal/error 상태로 수렴한다.

| 화면                    | default                              | loading          | error            | empty                                                               | disabled                    | success                           |
| ----------------------- | ------------------------------------ | ---------------- | ---------------- | ------------------------------------------------------------------- | --------------------------- | --------------------------------- |
| 시작·팩 선택            | 팩 목록                              | skeleton         | retry            | active pack 없음                                                    | play 생성 중                | 첫 질문 이동                      |
| 주인 10장               | 질문·A/B                             | 질문 조회        | 저장 retry       | N/A — published pack은 정확히 10장이며 0장은 generic terminal error | 저장·완료 중                | 10장 완료·공유 이동               |
| 공유                    | 방식 선택·목록                       | 목록 조회        | action retry     | 생성 링크 없음                                                      | 생성·복사 중                | 링크 ready·copy feedback          |
| 관계·시점               | 두 fieldset                          | metadata 조회    | retry/validation | N/A — invalid·expired link는 generic terminal error                 | response 생성 중            | 필수 3장 이동                     |
| 방문자 3장              | 질문·A/B                             | assignment 조회  | 저장 retry       | N/A — assignment 0장은 generic terminal error                       | 저장·제출 중                | 비교 이동                         |
| 즉시 비교               | mismatch/all-same 결과               | 결과 조회        | 결과 retry       | N/A — 비교 card 0장은 generic terminal error                        | continuation·복사 action 중 | 실제 3장 비교 + same-pack CTA     |
| 프로필                  | 현재 단일 play stack                 | profile 조회     | retry            | 완료 play 없음 또는 시선 없음                                       | reshare 이동 중             | 새 시선·threshold 공개            |
| 응답 철회               | 철회 범위 안내                       | token 확인       | 철회 retry       | N/A — invalid·expired·reused는 generic terminal                     | 철회 중                     | withdrawn 완료                    |
| 계정 삭제 settings 후보 | 위험 구역                            | 정책·재인증 조회 | 재인증 retry     | N/A — adopted owner 없음은 generic terminal 안내                    | 발송·삭제 준비 중           | receipt 발급 뒤 status route 이동 |
| 계정 삭제 status 후보   | N/A — receipt 조회 뒤 즉시 실제 상태 | receipt 조회     | status retry     | receipt missing/expired generic 안내                                | polling 중                  | completed                         |

모든 `generic terminal error`는 내부 원인과 resource 존재를 구분하지 않는다. 빈 데이터가 정상인 시작·공유·프로필만 전용 empty illustration 없이 짧은 안내와 다음 행동을 제공한다.

### 7.1 시작과 팩 선택 `/`

팩 card 정보 순서는 추천 관계/공유 방식 → 제목 → `10장 · 예상 시간` → 분위기·민감도 → CTA다. 장식 cover보다 선택에 필요한 metadata가 먼저 읽혀야 한다.

| 상태     | 화면                                                 | 행동·복구                        | 접근성·privacy                                     |
| -------- | ---------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| default  | hero 아래 공식 팩 4개, 첫 card 전체와 다음 card 일부 | card 안 단일 `이 팩 시작하기`    | rail은 `ul`, 각 CTA에 팩 제목 포함 accessible name |
| loading  | hero 유지, 실제 card와 같은 높이의 2개 skeleton      | CTA 없음                         | `aria-busy=true`, skeleton은 읽지 않음             |
| error    | `팩을 불러오지 못했어요`와 `다시 시도`               | retry가 같은 요청 재실행         | `role=alert`, 내부 오류 code 미노출                |
| empty    | `지금 시작할 수 있는 팩이 없어요`                    | 홈 새로고침만 제공               | inactive pack 제목을 노출하지 않음                 |
| disabled | create 요청 중 선택한 card만 `시작하는 중…`          | 다른 pack CTA도 중복 create 방지 | disabled 이유를 live status로 알림                 |
| success  | 별도 개봉 대기 없이 `/play/[playId]` 첫 질문         | 첫 질문 heading으로 focus 이동   | redirect 뒤 title 변경                             |
| resume   | 같은 브라우저의 유효 play가 있으면 `이어서 답하기`   | 기존 play로만 이동               | 다른 play 존재를 추정하게 하지 않음                |

팩 목록 아래에는 `생년월일이나 신분증 없이 질문에 답하고 서로의 시선을 비교해요.`와 `/privacy` 링크를 둔다. 공개 문의 채널이 실제로 준비되기 전에는 준비 중임을 표시하고 production 모집을 열지 않는다.

owner는 팩 선택 뒤, visitor는 초대 맥락 뒤 관계 선택으로 바로 이어진다. 공식 질문팩은 전체 연령용 콘텐츠 기준을 지키며, 320/390/430px, 200% zoom, keyboard, safe area, reduced motion에서 가로 overflow와 CTA 가림이 없어야 한다.

### 7.2 주인 셀프 10장 `/play/[playId]`

| 상태             | 화면                                            | 행동·복구                                 | 접근성·privacy                               |
| ---------------- | ----------------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| loading          | pack 제목, `질문 불러오는 중`, progress shell   | 조작 대기                                 | 이전 질문 text를 skeleton 아래 남기지 않음   |
| default          | `3/10`, 질문 1개, A/B 2개, 이전/나가기          | 선택 즉시 optimistic 반응                 | A/B는 button, `aria-pressed` 사용            |
| selected/saving  | 선택 강조 + `저장하는 중…` chip                 | 다음 질문 표시 가능, 중복 선택 잠금       | `aria-live=polite`, focus는 선택 button 유지 |
| saved            | `저장됨` chip, 다음 질문                        | 1초 뒤 visually muted 가능                | 색 외 text로 상태 전달                       |
| save error       | 선택은 남기고 `저장하지 못했어요 · 다시 시도`   | retry 또는 선택 변경                      | 다음 완료는 저장 성공 전 차단                |
| disabled         | 완료 요청 중 A/B·이전 비활성                    | `답변 마무리하는 중…`                     | `aria-disabled`, focus 유실 금지             |
| success          | 10장 요약, same-browser 저장 범위, 공유 Primary | `공유 링크 만들기` → share                | 로그인 modal을 띄우지 않음                   |
| completed/locked | 이미 완료된 답은 read-only                      | 공유 또는 `/me`                           | 수정 가능한 control처럼 보이지 않음          |
| expired/tampered | `이 브라우저에서 더는 이 팩을 관리할 수 없어요` | 홈에서 새 팩 시작                         | play 존재·답변 내용 미노출                   |
| exit confirm     | 현재까지 저장됨 또는 미저장 오류 명시           | `계속 답하기` Primary, `나가기` Secondary | native/dialog focus trap, Escape는 취소      |

### 7.3 공유 `/me/plays/[playId]`

| 상태             | 화면                                                     | 행동·복구                  | 접근성·privacy                                        |
| ---------------- | -------------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| default          | 공개/1:1 두 방식, 차이와 추천 badge                      | 하나 선택 후 `링크 만들기` | radio/fieldset, 민감 팩의 1:1 추천은 강제가 아님      |
| loading          | 기존 링크 목록 유지 + `불러오는 중…`                     | 새 create 잠금             | 기존 raw URL placeholder 금지                         |
| creating         | 선택한 방식에 `링크 만드는 중…`                          | 중복 create 방지           | live status                                           |
| ready/success    | 공유 sheet Primary, 링크 복사 Secondary, manual fallback | OS 공유 → 실패 시 복사     | raw fragment는 명시적 user action 때만 clipboard에 씀 |
| copy success     | `링크를 복사했어요`                                      | 2초 뒤 status만 정리       | `aria-live=polite`                                    |
| copy failure     | `자동 복사가 안 됐어요`와 선택 가능한 field              | `직접 선택하기`            | field에 secret이 보여도 analytics/log 금지            |
| active list      | 방식·상태·만든 시각, 비활성/재발급                       | 한 항목씩 관리             | secret 전체를 다시 복원하지 않음                      |
| consumed 1:1     | `응답이 완료되어 닫힌 링크`                              | `새 1:1 링크 만들기`       | 완료 방문자 정보 미노출                               |
| disabled/revoked | muted card, 공유 control 없음                            | 재활성 대신 안전한 새 발급 | 링크 상태를 text로 표시                               |
| error            | 기존 결과 유지 + 해당 action 옆 오류                     | action-scoped retry        | 전체 화면 error로 성공 링크를 지우지 않음             |
| empty            | `아직 만든 링크가 없어요`                                | mode 선택이 Primary        | empty와 loading skeleton 구분                         |

`내 겹 공유하기`로 들어온 카드 mode는 위 일반 관리 화면과 분리한다. 공개 기준을 통과한 관계·질문 한 장의 결과 미리보기와 `이 카드 공유하기` Primary 하나만 표시하고, 기존 링크 목록·공개/1:1 방식 선택·일반 설명·비활성화 관리는 숨긴다. export PNG는 항상 9:16이며 높이 650px 이하 DOM 미리보기만 첫 viewport의 Primary를 보장하기 위해 4:5로 압축한다. 미리보기와 PNG는 `관계+해당 질문 표본 → 친구 시선의 우세 결과 → 셀프 선택과의 일치 여부`를 먼저 보여 주고 원본 질문과 `A n명 · B n명` 분포를 보조로 둔다. A/B 동수는 `시선이 반으로 갈렸어요`로 표시하고 agreement badge를 만들지 않는다. Primary 한 번으로 필요한 public 링크를 만든 뒤 가능한 즉시 이미지+링크 OS 공유를 시도한다. OS 파일 공유 미지원·취소·실패 시 생성된 링크를 보존하고 `이미지 저장`과 `링크 복사`를 함께 노출하며, 자동 복사 실패 때 선택 가능한 URL field에 focus한다.

### 7.4 방문자 관계·알게 된 시점 `/i/[publicId]#k=…`

| 상태                     | 화면                                                         | 행동·복구                            | 접근성·privacy                                        |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------- |
| metadata loading         | `친구가 먼저 답한 질문팩이에요`, skeleton                    | 대기                                 | owner 이름·답변 미노출                                |
| default                  | pack 맥락, 관계 8개, 시점 6개                                | 둘 다 선택하면 `3장 답하기` 활성     | 두 fieldset과 legend, 최소 44px option                |
| partial/disabled         | 선택한 field는 유지, CTA disabled                            | 미선택 field 바로 아래 안내          | color만으로 validation 표시 금지                      |
| validation error         | `관계를 골라 주세요` 또는 `알게 된 시점을 골라 주세요`       | 첫 오류로 focus                      | live assertive는 submit 때 한 번만                    |
| submitting               | 선택 유지, `질문 준비하는 중…`                               | 중복 제출 방지                       | option을 skeleton으로 바꾸지 않음                     |
| restored                 | 같은 response session이면 저장된 context와 3장 진행으로 복구 | 이어서 답하기                        | 다른 response 맥락 미노출                             |
| expired/invalid/consumed | `이 링크로는 지금 답할 수 없어요`                            | 홈 이동 또는 공유자에게 새 링크 요청 | 404/expired/revoked 원인을 구분 노출하지 않음         |
| error                    | generic network 오류                                         | retry                                | relationship/time을 analytics나 오류 문구에 넣지 않음 |

### 7.5 방문자 필수 3장

| 상태                | 화면                                               | 행동·복구                     | 접근성·privacy                                       |
| ------------------- | -------------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| locked invariant    | 질문과 A/B만 표시, owner answer/aggregate DOM 없음 | 3장 제출 전 해제 불가         | blur·opacity·offscreen으로 답을 미리 render하지 않음 |
| loading             | `1/3`, question skeleton                           | 대기                          | owner answer skeleton도 만들지 않음                  |
| default             | `이 사람은?` 질문, A/B 2개, progress               | 답 선택                       | button + `aria-pressed`                              |
| selected/saving     | 선택 유지 + inline saving                          | 다음 질문 가능                | live polite                                          |
| save error          | 선택 유지 + retry                                  | 제출은 실패 card 저장 전 차단 | 오류 뒤 owner answer 노출 금지                       |
| submitting/disabled | 세 선택 유지, `비교 결과 만드는 중…`               | duplicate submit 방지         | management token 원문 미노출                         |
| success             | comparison으로 전환                                | heading focus 이동            | 제출 commit 후에만 owner answer 요청·render          |
| session expired     | generic 접근 종료                                  | 홈 이동                       | 답·관계·시점 미노출                                  |

### 7.6 즉시 비교

결과 순서는 `결과 요약 → 3개 card 비교 → Primary → optional continuation → 응답 관리`다.

| 상태                    | 화면                                               | 행동·복구                         | 접근성·privacy                                         |
| ----------------------- | -------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| loading                 | 제출 완료 문구 + 비교 skeleton                     | 결과 재조회                       | 제출 전 화면으로 돌아가지 않음                         |
| mismatch                | 결정 규칙으로 고른 차이 1개 highlight, 나머지 card | `나도 이 팩으로 시작하기` Primary | `실제 답`과 `내가 본 답`을 dl 또는 명확한 label로 구분 |
| all same                | `세 항목을 모두 같게 봤어요`                       | 같은 Primary                      | 차이를 꾸며내거나 점수화하지 않음                      |
| primary                 | 결과 직후 full-width lime                          | 동일 pack owner flow로 직행       | accessible name에 pack 제목 포함 가능                  |
| continuation            | Primary 아래 Secondary `2장 더 답하기`             | 선택 2장으로 이동 후 다시 결과    | Primary를 선행 조건으로 막지 않음                      |
| management ready        | tertiary 영역 `응답 관리 링크 복사`                | 명시적 복사                       | fragment를 analytics/log에 넣지 않음                   |
| management copy failure | manual select field                                | 직접 복사                         | field label과 실패 live status                         |
| error                   | 제출 성공은 유지, `비교를 불러오지 못했어요`       | retry                             | owner answer 일부만 먼저 노출하지 않음                 |
| session expired         | generic 결과 접근 종료                             | 홈 또는 same-pack 새 시작         | 주인의 셀프 답 미노출                                  |

Primary는 error가 comparison 내용만 가리는 동안에도 새 owner 전환에 필요한 pack identity가 안전하게 확정된 경우 유지할 수 있다. pack identity조차 확정되지 않으면 retry만 표시하고 다른 팩 탐색으로 보내지 않는다.

### 7.7 비공개 최소 프로필 `/me`

| 상태                      | 화면                                      | 행동·복구                                     | 접근성·privacy                        |
| ------------------------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------- |
| loading                   | pack heading·summary skeleton             | 대기                                          | 이전 사용자 profile 잔상 금지         |
| empty                     | 셀프 10장 + `아직 도착한 시선이 없어요`   | `시선 모으기`는 완료 play의 share 관리로 연결 | 새 play를 만들지 않음                 |
| first sight success       | 전체 시선 `1`, `새 시선이 도착했어요`     | 같은 play `시선 더 모으기` 한 번              | animation 없이도 live status 제공     |
| under threshold           | 각 card에 `시선을 모으는 중 · n/3`        | 선택 수 숨김                                  | `n`은 공개 링크 submitted 필수 응답만 |
| threshold met             | 셀프 선택 + 공개 가능한 A/B count         | card별 실제 count                             | AI 요약, 점수, 고정 성격 label 없음   |
| mixed                     | threshold 충족·미달 card가 한 목록에 공존 | card 상태별 표시                              | 미달 card의 count 추정 불가           |
| empty account profile     | `<닉네임>의 겹` + 한 줄 + compact 지표    | `질문팩 시작하기` → `/`, draft는 아래 관리    | 별도 empty 설명 박스를 만들지 않음    |
| completed, no share card  | 제목 + 짧은 상태 + compact 지표 + stack   | `시선 더 모으기` → `/me/plays/[playId]`       | 공개 기준 전 수치를 공유하지 않음     |
| completed, shareable card | 제목 + 짧은 상태 + compact 지표 + stack   | `내 겹 공유하기` → 안전한 관계·질문 카드 선택 | `romantic`·1:1·소표본 제외            |
| error                     | `프로필을 불러오지 못했어요`              | 현재 `/me`를 `다시 시도`                      | stale count·부분 play·login 오인 금지 |
| session expired/revoked   | same-browser 관리 종료 generic 안내       | 홈에서 새 시작                                | 기존 play·시선 존재 미노출            |

현재 private MVP의 layer 정의:

1. base card: 주인의 셀프 선택
2. pending edge: 공개 링크 card 표본 `0/3`, `1/3`, `2/3`
3. revealed layer: 같은 card가 공개 기준을 충족했을 때 실제 A/B count
4. account stack: 인증 owner의 `/me`는 완료 play별 첫 셀프 카드와 각 play에서 이미 공개 가능한 관계 질문을 최대 4개 layer로 보여 준다. 전체 시선만 play별 `sightCount`를 합하고, 관계·질문 threshold는 play 경계를 넘어 다시 계산하지 않는다.

account `/me` 상단은 `<닉네임>의 겹` → 상태별 한 줄 → 단일 CTA → `시선 N`·`완료한 겹 N`·`관계 N` → stack 순서만 사용한다. 완료 play가 없을 때 한 줄은 `질문팩에 답하고, 내가 보는 나부터 쌓아보세요.`다. 공개 가능한 카드가 있으면 한 줄은 `친구가 본 내 모습을 한 장으로 나눠보세요.`, CTA는 `내 겹 공유하기`다. 완료 play는 있지만 공유 가능한 카드가 없으면 `친구의 답이 더 모이면 내 겹을 공유할 수 있어요.`와 `시선 더 모으기`를 사용한다. 지표의 `계정 프로필 요약` 접근성 이름은 유지하되 `완료 응답 기준` 같은 보조 설명, 아이콘, 다중 action은 추가하지 않는다. per-play 시선 0건 재공유 숨김 규칙은 그대로다.

`/me`의 시각 기준은 검정 canvas의 목업 01·03·04다. 흰 canvas의 `owner-profile-relationship-layers-v1`은 원본 질문·셀프 선택·관계 threshold 구조만 참고한다. 목업의 `오래된 친구 7명`, avatar row, 여러 관계별 성격 단어는 현재 화면에 사용하지 않는다. submitted 1:1 응답과 민감 관계도 `/me` 누적에서 제외한다.

### 7.8 방문자 응답 철회 `/responses/manage#token=…`

| 상태                   | 화면                                     | 행동·복구                            | 접근성·privacy                              |
| ---------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------------- |
| loading                | generic `응답 관리 정보를 확인하는 중…`  | 대기                                 | URL token을 본문·title에 반복하지 않음      |
| default                | 철회되는 범위와 되돌릴 수 없음           | danger `응답 철회하기`               | 다른 결과·owner 정보 미노출                 |
| confirm                | 명시적 확인 dialog                       | `취소`가 초기 focus, danger는 마지막 | focus trap, Escape 취소                     |
| submitting/disabled    | `응답을 철회하는 중…`                    | duplicate 방지                       | success icon 금지                           |
| success                | `응답이 철회됐어요`                      | 홈 이동                              | 기존 비교·선택 값 제거                      |
| invalid/expired/reused | `이 링크로 관리할 수 있는 응답이 없어요` | 홈 이동                              | 존재·과거 철회 여부를 구분하지 않음         |
| error                  | `철회하지 못했어요`                      | retry 또는 나가기                    | 실패면 기존 응답이 철회됐다고 표현하지 않음 |

## 8. Production beta 후보: 계정 삭제 UI

이 절은 구현 기준을 미리 고정하지만 현재 비공개 재미 검증 route에는 노출하지 않는다. 보관 기간·backup 삭제 시한을 임의 숫자로 약속하지 않는다.

### 8.1 `/me/settings` 위험 구역

| 상태                                    | 화면                                                                                                   | 행동·복구                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| default                                 | 일반 설정과 32px 이상 분리된 `계정 삭제` 위험 구역, 삭제 범위·복구 불가·정책 링크                      | danger outline `삭제 절차 시작`                                |
| policy unavailable                      | 확정되지 않은 기간을 숨기고 `현재 삭제 요청을 받을 수 없어요`                                          | CTA disabled, 지원/나중에 확인                                 |
| reauth sending                          | 현재 인증 email로 재인증 링크 발송 중                                                                  | 중복 발송 잠금                                                 |
| reauth sent                             | `같은 브라우저에서 이메일 링크를 열어 주세요`                                                          | 재발송 cooldown과 취소                                         |
| reauth error/expired                    | generic 재인증 실패                                                                                    | `다시 인증하기`                                                |
| fresh confirm                           | 삭제 대상 목록, checkbox `삭제 후 복구할 수 없음을 이해했어요`                                         | checkbox 후 danger `계정 삭제 계속하기` 활성                   |
| submitting                              | `삭제 요청을 준비하는 중…`                                                                             | 모든 owner mutation 잠금, 중복 DELETE는 같은 job 복구          |
| response lost · receipt 있음            | 브라우저가 receipt cookie를 받은 경우 `/account-deletion/status`가 실제 pending/retry/completed를 복구 | 새 job 없이 status로 이동                                      |
| response lost · receipt 없음·인증 유효  | 성공/실패를 추정하지 않고 동일 actor의 유효한 fresh evidence로 같은 DELETE를 idempotent하게 재실행     | retained job을 찾아 같은 receipt를 재발급받은 뒤 status로 이동 |
| response lost · receipt 없음·signed-out | `요청 처리는 끝났어요` generic completed/no-new-job 안내                                               | 계정 존재를 구분하지 않고 새 job·재인증 없이 홈 이동           |

삭제 CTA는 일반 저장 button과 같은 줄에 두지 않는다. confirm 화면에서 email, UID, pack 답변을 재출력하지 않는다.

### 8.2 `/account-deletion/status`

이 route는 owner session이 없어도 status receipt cookie만으로 동작한다. 모든 문구는 public-generic이어야 한다.

| 상태                                    | heading·표현                                                                    | reload/poll 행동                                   | 금지                                               |
| --------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| pending                                 | `삭제 요청을 처리하고 있어요`, neutral spinner/progress                         | backoff polling과 `상태 새로고침`                  | success 색·check icon, 완료 시각 약속              |
| retry                                   | `삭제를 계속 처리하고 있어요`, `잠시 후 다시 확인해 주세요`                     | receipt 유효 동안 polling 연장                     | 내부 provider 오류·attempt 수 노출, 실패 확정 표현 |
| completed                               | `삭제가 완료됐어요`, success text/icon                                          | polling 종료, 홈 이동                              | 삭제된 account 상세·과거 답변 노출                 |
| receipt missing                         | `현재 브라우저에서 확인할 삭제 상태가 없어요`                                   | 홈 이동                                            | 계정 없음/삭제 완료/다른 job 구분                  |
| receipt expired                         | missing과 같은 generic 안내                                                     | cookie 제거 후 홈 이동                             | `완료됐을 가능성` 같은 추정                        |
| network error                           | `상태를 불러오지 못했어요`                                                      | 수동 retry, 기존 pending을 completed로 바꾸지 않음 | receipt·job identifier 출력                        |
| response loss · receipt 있음            | status route 첫 load에서 pending/retry/completed 중 실제 상태                   | owner session 재로그인 요구 없음                   | 새 deletion job 생성                               |
| response loss · receipt 없음·인증 유효  | settings recovery가 동일 DELETE를 재실행해 같은 receipt를 받은 뒤 이 route 진입 | 발급 뒤 실제 상태 조회                             | 새 job·attempt·active lease takeover               |
| response loss · receipt 없음·signed-out | `요청 처리는 끝났어요` generic completed/no-new-job 안내                        | 홈 이동                                            | 계정·job 존재 추정, 새 job, 재인증 강요            |

상태 전이는 `pending → retry → pending|completed` 또는 `pending → completed`로 보일 수 있다. retry는 terminal failure가 아니며 receipt가 유효한 동안 reload로 같은 job 상태를 복구한다.

## 9. Feedback와 문구 규칙

- loading: 무엇을 기다리는지 동사로 쓴다. 예: `링크 만드는 중…`.
- error: 실패한 action과 다음 행동을 함께 쓴다. 예: `저장하지 못했어요 · 다시 시도`.
- empty: 데이터가 없다는 사실과 시작점을 쓴다. 삭제·오류로 오해할 표현을 피한다.
- disabled: control만 회색으로 만들지 않고 바로 가까이에 이유를 둔다.
- success: 짧은 결과와 다음 행동을 둔다. confetti나 반복 animation은 사용하지 않는다.
- privacy: `친구`, `이 사람`, `나`를 사용하고 표시 이름·방문자 이름을 요구하지 않는다.
- score: `친밀도 82점`, `신중형` 같은 fixed 결과를 쓰지 않는다.
- network/security: `404`, `token`, `UID`, `job`, provider 오류를 사용자 문구에 쓰지 않는다.

## 10. 접근성 기준

### 필수 checklist

- [ ] text와 icon은 WCAG AA를 충족한다. normal text 4.5:1, large text 3:1, focus/control boundary 3:1 이상이다.
- [ ] 모든 interactive target은 최소 44×44 CSS px다.
- [ ] A/B, 관계, 시점은 native button/radio semantics와 visible label을 사용한다.
- [ ] focus-visible은 `var(--g-focus-width)` blue outline과 `var(--g-focus-offset)`을 사용하고 overflow에 잘리지 않는다. blue/coral surface에서는 context focus token으로 바꾼다.
- [ ] heading은 화면당 하나의 `h1`부터 순서대로 사용하며 route 전환 뒤 main heading으로 focus를 옮긴다.
- [ ] 저장·복사·제출 feedback은 `aria-live=polite`, 즉시 수정해야 할 submit 오류는 한 번만 `role=alert`로 알린다.
- [ ] skeleton, decorative stack, asterisk는 screen reader에서 숨긴다.
- [ ] locked owner answer는 접근성 tree와 DOM에도 존재하지 않는다.
- [ ] match/mismatch, success/error, selected/unselected는 색 외 text·shape·state를 함께 쓴다.
- [ ] 200% zoom, 320px width, 긴 한글 문구에서 가로 overflow와 CTA 가림이 없다.
- [ ] modal은 initial focus, focus trap, Escape 취소, 닫힌 뒤 trigger focus 복귀를 지원한다.
- [ ] reduced motion에서 transform/transition을 제거해도 진행·저장·완료 상태를 이해할 수 있다.
- [ ] OS share/clipboard 실패 시 keyboard로 선택 가능한 manual copy fallback이 있다.

## 11. Lazyweb와 현재 화면 근거

- 빠른 사례 검색: `personality quiz profile results`, mobile. 결과 화면에서 profile/result를 먼저 보여 주고 share와 match/next action을 분리한 Tolan, 저장·연결을 결과 뒤에 제안하는 Breeze, 결과 card를 중심으로 둔 Storia 패턴을 검토했다.
- 채택: 결과를 먼저 보상하고 공유/다음 행동을 분명히 하는 구조, 로그인이나 연결을 콘텐츠 경험 뒤에 두는 순서, 하나의 dominant CTA.
- 미채택: personality score, avatar social proof, 가입으로 결과를 잠그는 방식, generic quiz discovery로 되돌리는 CTA.
- 현재 화면 기반 Lazyweb improve report: [GYEOP mobile UI improve report](https://www.lazyweb.com/report/lazyweb/fc21cfcf-ca51-449b-b6fd-ae9769fc43f0/?source=create). 생성 결과는 `degraded=false`, mockup failure 0건이다.
- 내 겹 카드 improve report: [GYEOP share card result screen](https://www.lazyweb.com/report/lazyweb/29e22c98-1f20-4d90-af83-b3cadaf1c22b/?source=create). 중간 준비 단계를 제거하고 결과 카드와 direct Primary를 중심에 두는 진단을 채택하며 테마 picker는 제외한다.
- 현재 홈 baseline: 검정 canvas와 네온 palette는 식별력이 높지만 pack 선택 rail은 다음 card가 일부 보인다는 것만으로 scroll affordance에 의존한다. metadata 순서, focus 가능한 rail, 한 card 한 Primary를 이 명세로 고정한다.

### 320/390/430px 현재 baseline 검수

| viewport | 결과 | 관찰과 이 문서의 기준                                                                                                                    |
| -------: | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
|  320×800 | PASS | 12px gutter 안에서 hero와 첫 pack card가 잘리지 않고 Primary가 44px 이상이다. 다음 card 일부 노출은 의도한 rail affordance로만 허용한다. |
|  390×844 | PASS | 첫 pack의 추천 관계, 제목, 시간·분위기·민감도, CTA가 한 card 안에서 순서대로 읽힌다.                                                     |
|  430×932 | PASS | content를 불필요하게 늘리지 않고 첫 card와 다음 card가 분리된다. rail 밖의 required flow에는 이 가로 pattern을 재사용하지 않는다.        |
| 1024×900 | PASS | public home이 hero/pack rail 2열로 확장되고 pack CTA 위계는 mobile과 같다. required flow는 이 2열 pattern을 상속하지 않는다.             |

세 viewport 모두 body 자체의 가로 overflow는 없었다. rail의 잘린 다음 card text는 현재 화면에서 의도한 preview지만, focus가 rail 안으로 들어오면 해당 card 전체로 scroll-snap 되어야 한다.

## 12. 구현 handoff

후속 UI PR은 다음 순서로 적용한다.

1. `app/globals.css`에 `--g-*` primitive/semantic token을 추가한다.
2. 화면별 중복 `--lime`, `--blue`, black/gray literal을 semantic token으로 교체한다.
3. 한 화면씩 상태표와 실제 domain state를 매핑한다. inactive production beta 상태를 private MVP bundle에 넣지 않는다.
4. owner answer lock과 profile threshold는 CSS가 아니라 API/data boundary를 함께 확인한다.
5. 320/390/430px screenshot, keyboard-only, screen reader live status, reduced motion을 확인한다.
6. Primary/Secondary 순서와 exact copy가 바뀌면 product SSOT와 이 문서를 같은 PR에서 갱신한다.

### PR review 질문

- 이 layer와 숫자는 실제 어떤 submitted public response에서 왔는가?
- 이 loading/error 상태에서도 주인 답이나 raw secret이 먼저 render되는가?
- 첫 번째로 보이는 CTA가 현재 사용자를 핵심 루프의 다음 단계로 보내는가?
- 320px, 200% zoom, reduced motion, keyboard-only에서 같은 완료가 가능한가?
- private MVP와 inactive production beta UI가 섞이지 않았는가?
