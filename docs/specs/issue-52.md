# Issue 52 구현 스펙: 원본 비주얼 기반 멀티팩 메인 랜딩

Status: Reviewed

## 목표

첫 접속 메인을 `오래된 친구팩` 전용 시작 페이지가 아니라 GYEOP의 강한 시각 정체성과 여러 질문팩의 확장 가능성을 보여주는 모바일 랜딩으로 재설계한다.

## 범위

- `app/(public)/page.tsx`
  - 서비스 가치가 먼저 읽히는 브랜드 hero와 질문팩 미리보기 영역을 렌더링한다.
  - 브랜드는 정확히 `겹`, 유일한 `h1`은 정확히 `친구가 보는 나는 내가 아는 나와 같을까?`, 팩 목록 `h2`는 정확히 `질문팩`이다.
  - `오래된 친구팩`은 development에서 실제로 열리는 유일한 활성 팩이다.
  - `첫인상팩`, `직장동료팩`, `솔직한 나팩`은 `준비 중` 상태의 정적 미리보기다.
  - development 활성 CTA 문구는 정확히 `팩 열어보기`이고 `/play/old-friend`로 이동한다.
  - production에서는 활성 팩도 정확히 `<button type="button" disabled>팩 준비 중</button>`으로 바뀌며 `href`가 없다.
- `app/(public)/page.module.css`
  - `docs/assets/mockups/01-product-overview.png`와 `03-perspective-stack-profile.png`의 검정 배경, 전기 블루, 네온 라임, 레드, 굵은 한글 타이포, 카드 스택을 CSS로 재현한다.
  - 팩 목록은 JavaScript 없는 가로 스크롤과 scroll snap으로 구현해 320px에서 다음 카드 일부가 보이게 한다.
  - 목록은 `section + h2 + ul/li`로 구성하고 scroll container는 `tabIndex={0}`, `aria-label="질문팩 미리보기"`, `focus-visible`을 지원한다.
  - hero와 팩 카드를 합쳐 320x800 첫 viewport에서 서비스 정체성, 두 개 이상의 팩 존재, 활성 CTA를 확인할 수 있게 한다.
  - CTA 높이 44px 이상, focus-visible, 충분한 명도 대비를 유지한다.
- `tests/e2e/home.spec.ts`
  - 서비스 hero, 활성 팩 1개, 준비 중 팩 3개를 검증한다.
  - development 활성 CTA 이동과 준비 중 팩의 비상호작용을 검증한다.
  - production CTA 차단, root storage 불변, 320x800과 430x932 레이아웃을 검증한다.
  - 키보드 Tab으로 팩 목록에 초점을 두고 ArrowRight로 scrollLeft가 증가한 뒤 다음 Tab에서 활성 CTA에 초점이 가는지 검증한다.
- `app/play/old-friend/*`와 `tests/e2e/old-friend-play.spec.ts`
  - 변경하지 않고 기존 질문 플레이 회귀만 확인한다.

## 제외 범위

- 준비 중 팩의 질문 10장, opening, 응답 저장, 결과 화면
- 추가 팩을 실제 공식 팩으로 발행하거나 활성화하는 작업
- 팩 검색, 정렬, 카테고리, 상세 페이지
- 로그인, 내비게이션, 알림, 프로필
- production 팩 활성화
- 외부 이미지, 아이콘 패키지, UI 의존성
- 자동 재생, 자동 스크롤, 장식 애니메이션

## SSOT

- `AGENTS.md`와 `.codex/AGENTS.md`: 모바일 우선, 실제 제품 화면 검증, 하나의 명확한 핵심 행동을 따른다.
- `docs/product/core-feature-priority.md`: P0 실제 활성 팩은 `오래된 친구팩` 하나이며 후속 후보는 `첫인상팩`, `직장동료팩`, `썸·연애팩`, `솔직한 나팩`이다.
- `docs/product/question-pack-spec.md`: 미리보기 팩을 실제 응답 가능한 팩처럼 노출하지 않고 제목, 관계, 분위기, 민감도를 분리한다.
- `docs/product/decision-log.md`: production beta 차단 경계를 유지한다.
- `docs/specs/issue-46.md`: dev-only owner flow와 production 404 경계를 유지한다.
- `docs/specs/issue-50.md`: root와 질문 화면 분리, storage 불변, 단일 활성 CTA 계약을 유지한다.
- `docs/assets/mockups/01-product-overview.png`, `docs/assets/mockups/03-perspective-stack-profile.png`: 원본 시각 언어의 기준이다.
- 사용자 피드백: 현재 랜딩보다 예전 디자인이 더 힙하며, 여러 팩을 임시로 보여야 제품의 느낌이 산다.

## 사용자 흐름 영향

1. 사용자가 `/`에 접속한다.
2. 검정·네온 hero에서 GYEOP이 여러 관계의 시선을 겹쳐보는 서비스임을 이해한다.
3. 가로 팩 목록에서 `오래된 친구팩`과 준비 중인 후속 팩을 함께 본다.
4. development에서 `오래된 친구팩`의 `팩 열어보기`를 누른다.
5. `/play/old-friend`의 기존 owner 1/10 흐름으로 이동한다.
6. 준비 중 팩은 상태만 확인할 수 있고 이동·저장·응답은 일어나지 않는다.
7. production에서는 모든 팩이 준비 상태이며 `/play/old-friend`는 404다.

## 디자인 영향

- 밝은 베이지·보라 중심 랜딩을 원본 목업의 검정·네온 편집 디자인으로 교체한다.
- hero는 큰 문장과 밑줄 강조, 비스듬히 겹친 색상 면으로 제품 정체성을 전달한다.
- 팩 표시 계약은 다음으로 고정한다.

| 팩 | 상태 | 노출 정보 |
|---|---|---|
| 오래된 친구팩 | 활성 | `오래된 친구`, `질문 10장`, `약 2분`, `따뜻한 회상`, `낮은 민감도`, `공개 공유 추천` |
| 첫인상팩 | 준비 중 | `첫인상팩`, `준비 중`만 표시 |
| 직장동료팩 | 준비 중 | `직장동료팩`, `준비 중`만 표시 |
| 솔직한 나팩 | 준비 중 | `솔직한 나팩`, `준비 중`만 표시 |

- 후속 팩의 관계·분위기·시간·민감도·공유 추천은 승인 전 노출하지 않는다.
- 320px에서 첫 카드 전체와 다음 카드 일부가 보여 가로 탐색 가능성을 설명 없이 드러낸다.
- 준비 중 상태는 카드마다 텍스트로 표시하며 링크, 버튼, disabled 가짜 컨트롤을 만들지 않는다.
- 실제 action은 development의 `팩 열어보기` 하나뿐이다.
- hero 장식은 `aria-hidden="true"`, 페이지 heading은 `h1` 하나, 팩 목록은 `h2`, `ul`, `li`, `article`로 구성한다.
- 결과형 성격 단어, 사람 수, 아바타, 실제 집계처럼 보이는 값은 사용하지 않는다.
- Lazyweb 모바일 퀴즈 홈 참고에서 가져온 다중 카드 발견 구조만 적용하고 검색, 하단 탭, 카테고리는 추가하지 않는다.

## API와 데이터 영향

- 없음.
- 미리보기 팩은 정적 표현이며 API 호출, route, localStorage key를 추가하지 않는다.
- root는 `gyeop:old-friend-play:v1`을 읽거나 쓰지 않고 기존 값은 byte-for-byte 보존한다.
- `/play/old-friend`의 저장 형식과 복구 규칙을 변경하지 않는다.

## 구현 계획

1. root 마크업을 서비스 hero와 4개 팩 미리보기 구조로 교체한다.
2. 홈 CSS를 원본 목업의 검정·네온 카드 시스템과 모바일 가로 스크롤로 재작성한다.
3. 홈 E2E를 다중 팩 표시, 단일 활성 CTA, 준비 중 비상호작용 계약으로 갱신한다.
4. focused E2E와 production smoke를 실행한다.
5. 320x800, 430x932 스크린샷을 직접 검토한다.
6. 전체 검증을 실행한다.

## 완료 기준

- `/`에 서비스 hero와 `오래된 친구팩`, `첫인상팩`, `직장동료팩`, `솔직한 나팩`이 보인다.
- 브랜드 `겹`, 유일한 `h1` `친구가 보는 나는 내가 아는 나와 같을까?`, `h2` `질문팩`이 정확히 보인다.
- development에서 링크는 `오래된 친구팩`의 `팩 열어보기` 하나뿐이며 `/play/old-friend`로 이동한다.
- 준비 중 팩 3개는 각각 `준비 중`으로 표시되고 link, button, href가 없다.
- production에서는 `팩 열어보기` 링크와 href가 없고 native disabled `팩 준비 중` 버튼만 하나 있다.
- production `/play/old-friend`는 404다.
- root 방문 전후 빈 storage는 `null`, 기존 유효 draft는 byte-for-byte 불변이다.
- 320x800에서 hero, 첫 팩 전체, 다음 팩 일부, 활성 CTA가 첫 viewport에 보인다.
- 430x932에서 2개 이상의 팩 존재가 보이고 가로·세로 오버플로 오류가 없다.
- 320/430 스크린샷에서 검정 배경, 전기 블루·네온 라임·레드, 굵은 흰색 한글 h1, 비스듬히 겹치거나 offset된 카드 면이 모두 확인된다.
- 일반 텍스트 대비는 4.5:1 이상, 큰 텍스트와 focus indicator 대비는 3:1 이상이다.
- 활성 CTA는 44px 이상이며 키보드 focus-visible이 보인다.
- 팩 목록은 키보드 focus-visible이 보이고 ArrowRight로 가로 이동할 수 있으며 준비 중 카드에는 focus 가능한 요소가 없다.
- 결과형 성격 단어, 사람 수, 아바타, 실제 집계처럼 보이는 값이 없다.
- 기존 owner flow E2E가 회귀 없이 통과한다.

## 테스트 계획

- `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/old-friend-play.spec.ts --project=mobile-chromium`
  - 서비스 hero와 4개 팩 표시
  - 개발 환경의 단일 활성 CTA 이동
  - 준비 중 팩 3개의 비상호작용
  - root storage 미생성과 기존 draft byte-for-byte 보존
  - 320x800, 430x932의 overflow, fold, focus
  - 팩 목록 Tab focus, ArrowRight scroll 증가, 다음 Tab의 활성 CTA focus
  - 스크린샷에서 검정 배경, 블루·라임·레드, 굵은 흰색 h1, offset 카드 면 확인
  - 일반 텍스트 4.5:1 이상, 큰 텍스트·focus indicator 3:1 이상 확인
  - 기존 opening, 10장, 이전, 복구, 완료, 재시작 회귀
- production build smoke
  - `/` 200, native disabled CTA, active href 0, storage null
  - `/play/old-friend` 404
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 미리보기 팩에는 이벤트를 추가하지 않는다.
- 실제 팩 활성화 시 팩 카드 노출과 시작 이벤트를 별도 정의한다.

## 개인정보와 악용 방지

- 활성 팩은 승인된 메타데이터를, 후속 팩은 후보 팩명과 준비 상태만 표시하며 사용자 답, 친구 수, 집계, 신원을 표시하지 않는다.
- 민감한 `썸·연애팩`은 이번 임시 미리보기에서 제외한다.

## 롤아웃과 복구

- 정적 root와 CSS, E2E 변경만 PR로 배포한다.
- 회귀 시 이 PR을 revert하면 #50 랜딩으로 복구된다.
- 미리보기 팩을 실제 활성화하는 근거로 사용하지 않는다.

## 스펙 검토

Reviewer Agent: issue52_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 준비 중 팩이 출시 확정으로 오해되지 않게 상태를 카드 상단에 명확히 표시한다.
- 가로 스크롤이 숨겨지지 않도록 다음 카드 일부를 의도적으로 노출한다.
- 원본 목업의 결과형 단어와 사람 수는 실제 데이터처럼 보일 수 있어 랜딩에서는 사용하지 않는다.
