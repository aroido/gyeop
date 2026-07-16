# Issue 50 구현 스펙: 첫 접속 정식 메인 랜딩

Status: Reviewed

## 목표

처음 웹에 접근한 사용자가 질문 진행 화면이 아니라 GYEOP의 정식 메인 랜딩을 보고, 두 시선이 겹치는 제품 가치와 시작 행동을 한눈에 이해하게 한다.

## 범위

- `app/(public)/page.tsx`
  - root에서 `OldFriendPlay`를 직접 렌더링하는 구현을 제거한다.
  - 브랜드, 시선 겹침 비주얼, 짧은 헤드라인, 단일 CTA로 구성한 정적 랜딩을 렌더링한다.
  - development CTA는 정확히 `팩 열어보기` 문구의 `/play/old-friend` 링크다.
  - production CTA는 정확히 `<button type="button" disabled>팩 준비 중</button>`이며 `href`가 없다.
- `app/(public)/page.module.css`
  - 외부 이미지 없이 CSS만으로 두 장의 관점 카드가 겹치는 hero를 구현한다.
  - 왼쪽 카드 `내가 보는 나`, 오른쪽 카드 `친구가 보는 나`, 중앙 `겹` 표시로 제품 의미를 시각화한다.
  - 320–430px 첫 뷰포트에 hero, 헤드라인, CTA가 들어오게 한다.
  - 애니메이션 없이 기존 색상·surface·shadow token만 재사용한다.
  - CTA 44px 이상과 focus-visible을 지원한다.
- `app/globals.css`
  - 변경하지 않고 기존 token의 재사용 기준으로 참조한다.
- `tests/e2e/home.spec.ts`
  - root에 질문 progress와 A/B 입력이 없음을 검증한다.
  - 메인 구성요소와 development CTA 이동을 검증한다.
  - 320x800과 430x932 오버플로와 fold, 키보드 포커스를 검증한다.
- `app/play/old-friend/*`와 `tests/e2e/old-friend-play.spec.ts`
  - 구현은 변경하지 않고 기존 opening, 10장, draft 저장·복구의 회귀만 확인한다.

## 제외 범위

- 질문팩 선택·탐색 화면
- 로그인, 회원가입, 상단 내비게이션
- 질문·결과·공유 화면 변경
- production 팩 활성화
- 신규 API, 데이터베이스, 분석 이벤트
- 외부 이미지, 아이콘 패키지, UI 의존성

## SSOT

- `AGENTS.md`와 `.codex/AGENTS.md`: 모바일 우선, A/B P0, 하나의 명확한 경로를 따른다.
- `docs/product/core-feature-priority.md`: owner 10장 응답이 첫 핵심 행동이며 CTA가 이 흐름으로 이어진다.
- `docs/product/question-pack-spec.md`: 첫 공식 `오래된 친구팩`과 A/B 형식을 유지한다.
- `docs/product/decision-log.md`: production 활성화 전 차단 경계를 유지한다.
- `docs/specs/issue-46.md`: dev-only owner flow와 production 404 경계를 유지한다.
- `docs/specs/issue-48.md`: 실제 질문 UI는 유지하되 root 직접 노출만 되돌린다.
- 사용자 피드백: 처음 접근하면 질문 중간 화면이 아니라 서비스 메인 랜딩이 보여야 한다.

## 사용자 흐름 영향

1. 사용자가 `/`에 접속한다.
2. `겹` 브랜드, 두 관점 카드가 겹치는 hero, `친구가 보는 나는 내가 아는 나와 같을까?` 헤드라인을 본다.
3. development에서 `팩 열어보기`를 누른다.
4. `/play/old-friend` opening 뒤 기존 1/10 질문부터 owner flow를 진행한다.
5. production에서는 `<button type="button" disabled>팩 준비 중</button>`만 보이고 `href`가 없으며 `/play/old-friend`는 404다.

## 디자인 영향

- 메인과 질문 진행 화면을 시각·라우팅 양쪽에서 분리한다.
- 장문 설명, 팩 메타 표, A/B 미리보기 입력은 메인에 두지 않는다.
- 두 관점 카드와 중앙 겹침 표식이 제품 설명을 대신한다.
- hero 전체는 `aria-hidden="true"`인 장식이며 페이지 heading은 헤드라인 `h1` 하나만 둔다.
- 헤드라인은 한 문장, 행동은 단일 CTA 하나로 제한한다.
- 보조 정보는 `10개 질문 · 약 2분` 한 줄만 허용한다.
- Lazyweb의 모바일 welcome screen 참고처럼 hero와 primary CTA를 첫 뷰포트에 유지하고, 앱 내비게이션·다중 CTA는 추가하지 않는다.

## API와 데이터 영향

- 없음.
- root는 localStorage를 읽거나 쓰지 않는다.
- 빈 저장소에서는 CTA 전 draft가 생성되지 않고, 기존 유효 draft가 있으면 byte-for-byte 그대로 보존된다.
- `/play/old-friend`의 기존 storage key와 복구 규칙을 변경하지 않는다.

## 구현 계획

1. root를 독립 랜딩 마크업으로 교체한다.
2. 홈 전용 CSS module에 겹치는 관점 카드 hero와 모바일 레이아웃을 구현한다.
3. 홈 E2E를 메인/질문 분리 계약으로 갱신한다.
4. focused E2E와 production smoke를 실행한다.
5. 320x800, 430x932 스크린샷을 직접 확인한다.
6. 전체 검증을 실행한다.

## 완료 기준

- `/`에 질문 progress, `1 / 10`, 첫 질문 heading, A/B 버튼이 없다.
- `/`에 `겹`, 두 관점 카드 hero, 짧은 헤드라인, `10개 질문 · 약 2분`, 단일 CTA가 보인다.
- development의 `팩 열어보기` 링크는 `/play/old-friend`로 이동한다.
- production은 `href` 없이 `<button type="button" disabled>팩 준비 중</button>`을 노출하고 `/play/old-friend`는 404다.
- 빈 저장소에서 root 방문 후 `gyeop:old-friend-play:v1`은 `null`이다.
- 유효한 기존 `gyeop:old-friend-play:v1` 값을 넣고 root를 방문해도 값이 byte-for-byte 불변이다.
- 320x800과 430x932에서 가로·세로 오버플로 없이 CTA 전체가 첫 뷰포트에 들어온다.
- CTA 높이는 44px 이상이고 키보드 포커스 표시가 보인다.
- 기존 owner flow focused E2E가 회귀 없이 통과한다.

## 테스트 계획

- `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/old-friend-play.spec.ts --project=mobile-chromium`
  - 메인과 질문 진행 화면 분리
  - `팩 열어보기` 단일 CTA 이동
  - root storage 미생성과 기존 유효 draft byte-for-byte 보존
  - 320x800 및 430x932 overflow, fold, focus
  - opening, 10장, 이전, 복구, 완료, 재시작 회귀
- production build smoke
  - `/` 200, native disabled CTA, storage null
  - `/play/old-friend` 404
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 이번 변경에는 이벤트를 추가하지 않는다.
- production 활성화 이슈에서 메인 CTA와 owner 1번 카드 도달을 함께 정의한다.

## 개인정보와 악용 방지

- root는 입력·저장·공유가 없어 개인정보 경계 변화가 없다.
- hero는 실제 사용자 답이나 친구 데이터를 표시하지 않는 정적 표현이다.

## 롤아웃과 복구

- 정적 root 마크업과 CSS 변경으로 PR 단위 배포한다.
- 회귀 시 이 PR을 revert하면 #48의 질문 직접 진입 화면으로 복구된다.
- production 팩 활성화는 포함하지 않는다.

## 스펙 검토

Reviewer Agent: issue50_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 정적 hero가 결과 화면으로 오해되지 않도록 실제 수치·답변·완료 상태는 표시하지 않는다.
- CTA 뒤 기존 opening을 유지해 메인에서 질문 화면으로의 전환 맥락을 보존한다.
