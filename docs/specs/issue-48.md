# Issue 48 구현 스펙: 첫 접속 화면 질문 중심 단순화

Status: Reviewed

## 목표

첫 접속 화면에서 설명을 읽지 않아도 실제 질문과 두 선택지를 보고 GYEOP의 핵심 행동을 즉시 이해하게 한다.

## 범위

- `app/(public)/page.tsx`
  - 기존 설명형 랜딩 마크업을 제거한다.
  - development에서는 기존 `OldFriendPlay`를 opening 없이 바로 렌더링한다.
  - production에서는 같은 첫 질문 UI를 비활성 상태로 렌더링해 팩이 준비 중임을 표시한다.
- `app/(public)/page.module.css`
  - 홈 전용 설명형 랜딩 스타일을 삭제한다.
- `app/play/old-friend/play.tsx`
  - root에서 기존 owner flow를 재사용할 수 있도록 opening 생략과 비활성 상태만 최소 prop으로 받는다.
  - development root의 A/B 선택은 실제 첫 답으로 저장되고 바로 2번 카드로 진행한다.
  - production root의 선택지는 native `disabled` 버튼이며 저장·진행하지 않는다.
- `tests/e2e/home.spec.ts`
  - 제거된 카피·팩 정보에 대한 검증을 없앤다.
  - 질문, 실제 A/B 선택, 첫 답 저장, 2/10 진행, 320px 레이아웃과 접근성을 검증한다.
- `tests/e2e/old-friend-play.spec.ts`
  - 기존 `/play/old-friend` opening과 10장 owner flow가 그대로 유지되는지 검증한다.

## 제외 범위

- 오래된 친구팩 질문·선택지 내용 변경
- production 팩 활성화
- 방문자 응답, 비교 결과, 공유 링크, API, 데이터베이스, 분석 이벤트
- 신규 이미지 또는 외부 UI 의존성

## SSOT

- `AGENTS.md`와 `.codex/AGENTS.md`: repo workflow와 제품 불변식, 모바일 우선 원칙을 따른다.
- `docs/product/core-feature-priority.md`: owner가 10장에 답하는 P0 핵심 루프와 모바일 우선 원칙을 따른다.
- `docs/product/question-pack-spec.md`: A/B 전용 형식과 오래된 친구 관계 맥락을 유지한다.
- `docs/product/decision-log.md`: production 활성화와 후속 공유 흐름은 별도 결정으로 남긴다.
- `docs/specs/issue-46.md`: dev-only 로컬 owner flow와 production 차단 경계를 유지한다.
- 사용자 피드백: 설명 대신 화면의 질문과 선택 행동으로 사용법을 전달한다.

## 사용자 흐름 영향

1. development 사용자가 `/`에 접속한다.
2. opening이나 설명 랜딩 없이 `오래된 친구팩`의 1/10 질문과 두 A/B 버튼을 바로 본다.
3. 한 선택지를 누르면 답이 기존 draft에 저장되고 2/10 질문으로 진행한다.
4. 이후 이전 질문, 새로고침 복구, 완료, 재시작은 기존 owner flow와 동일하게 동작한다.
5. production에서는 같은 1/10 질문을 보되 두 선택지가 비활성이고 `팩 준비 중` 상태를 표시하며, `/play/old-friend`는 계속 404다.

## 디자인 영향

- 기존 owner flow의 실제 질문 카드를 첫 화면 전체로 사용한다.
- 브랜드, native progress, 질문, 두 선택지만 남기고 설명형 태그라인·팩 메타·별도 CTA를 두지 않는다.
- Lazyweb의 퀴즈·소셜 질문 화면 참고처럼 질문과 선택지를 즉시 노출하되, 제품 경계를 넘는 내비게이션·게임화 요소는 추가하지 않는다.

## API와 데이터 영향

- 없음.
- 첫 선택은 기존 localStorage draft에 저장한다.
- 저장 키, 검증, 정규화, 복구 로직은 새로 만들지 않고 기존 `OldFriendPlay`를 재사용한다.
- production 비활성 상태에서는 localStorage를 읽거나 쓰지 않는다.
- 네트워크 요청을 추가하지 않는다.

## 구현 계획

1. 홈에서 기존 `OldFriendPlay`를 opening 없이 재사용한다.
2. owner flow에 opening 생략과 production 비활성 prop을 최소로 추가한다.
3. 사용하지 않는 홈 전용 CSS를 삭제한다.
4. 홈과 owner flow E2E를 새 화면 계약에 맞게 갱신한다.
5. 320x800과 430x932에서 스크린샷으로 시각 확인한다.
6. focused E2E와 전체 검증을 실행한다.

## 완료 기준

- 첫 화면에 장문 소개 문단, 결과 설명, `첫 번째 공식 질문팩`, 4칸 팩 정보 표가 없다.
- `오래된 친구팩`, native progress, `1 / 10`, `서운한 일이 생기면 나는?`, A/B 두 버튼이 보이고 별도 시작 CTA가 없다.
- development에서 A/B 버튼은 Tab·클릭 가능하고 선택 후 첫 답이 저장된 채 2/10으로 진행한다.
- production에서 A/B 버튼은 native `disabled`이고 localStorage를 변경하지 않으며 `/play/old-friend`는 404다.
- 320x800에서 가로·세로 오버플로 없이 두 A/B 버튼 전체가 첫 뷰포트에 들어온다.
- 각 A/B 버튼 높이는 44px 이상이고 키보드 포커스 표시가 보인다.

## 테스트 계획

- `pnpm exec playwright test tests/e2e/home.spec.ts --project=mobile-chromium`
  - 핵심 텍스트와 두 선택지 노출
  - 제거 대상 카피 부재
  - 실제 첫 답 저장, 2/10 진행과 포커스
  - 320x800 오버플로 및 fold 검증
- `pnpm exec playwright test tests/e2e/old-friend-play.spec.ts --project=mobile-chromium`
  - `/play/old-friend` opening과 기존 10장 흐름 회귀 없음
- production build smoke
  - `/`의 비활성 A/B 버튼과 `팩 준비 중` 상태
  - `/play/old-friend` 404
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 이번 변경에는 새 이벤트를 추가하지 않는다.
- 후속 production 활성화 시 첫 A/B 선택과 owner 2번 카드 도달을 기존 분석 설계와 함께 정의한다.

## 개인정보와 악용 방지

- 기존 로컬 draft 저장을 root에서도 재사용하며 개인정보 경계 변화가 없다.
- 친구의 답이나 비교 결과를 미리 노출하지 않는다.

## 롤아웃과 복구

- 정적 홈 마크업과 CSS 변경이므로 PR 단위로 배포한다.
- 회귀가 있으면 이 PR을 revert해 #46 화면으로 복구할 수 있다.
- production 팩 활성화는 이번 롤아웃에 포함하지 않는다.

## 스펙 검토

Reviewer Agent: issue48_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- root와 `/play/old-friend`가 같은 localStorage draft를 공유한다. 개발 중 두 경로를 오가도 기존 복구 규칙이 적용되는 것이 의도된 동작이다.
- production 비활성 상태가 client hydration 뒤에도 저장소를 건드리지 않는지 focused test로 고정한다.
