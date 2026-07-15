# GYEOP GitHub Issue Template

```md
## 목표
이슈 완료 시 달성되어야 하는 결과를 한 문장으로 작성한다.

## 배경/문제
- 왜 필요한지와 현재 사용자·제품·기술 문제를 작성한다.
- 선행 결정이나 관련 이슈를 연결한다.

## 범위
- 변경할 화면, API, 데이터, 문서, 테스트를 작성한다.
- 예상 파일과 모듈 경로를 가능한 만큼 작성한다.

## 참조 문서
- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 완료 기준
- 관찰 가능하고 테스트 가능한 조건만 작성한다.

## 검증
- ./scripts/run-ai-verify --mode full
- 필요한 focused test, lint, e2e 또는 수동 확인

## 산출물
- 구현 코드
- docs/specs/issue-<number>.md
- 테스트와 문서 업데이트
- PR

## 의존성/블로커
- 선행 이슈, secret, 외부 접근, 제품 결정을 작성한다.
- 없으면 `없음`이라고 작성한다.

## 제외 범위
- 이번 이슈에서 하지 않을 작업과 후속 이슈를 작성한다.
```

## Split rules

- 한 화면 또는 하나의 응집된 화면 흐름
- 하나의 API·서비스 경계
- 하나의 데이터·분석 경로
- 하나의 QA·워크플로우 개선
- 분리할 경우 임시로 깨진 상태가 생기는 작은 vertical slice는 함께 유지

## Title examples

- `[Planning] P0 첫 공식 질문팩과 Signature 카드 확정`
- `[Frontend] 방문자 관계 선택과 3장 응답 화면 구현`
- `[Backend] 공개·1:1 팩 링크와 응답 저장 API 구현`
- `[Data] 관계별 시선 집계와 퍼널 이벤트 스키마 추가`
- `[QA] 주인→방문자→새 주인 바이럴 루프 회귀 게이트 추가`

