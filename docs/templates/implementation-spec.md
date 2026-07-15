# GYEOP 구현 스펙 템플릿

Status: Draft
Issue:

## 목표

이슈가 끝났을 때 달성할 제품 또는 엔지니어링 결과를 한 문장으로 작성한다.

## 범위

- 이번 PR에서 구현할 화면, API, 데이터, 문서, 테스트를 작성한다.

## 제외 범위

- 인접하지만 이번 PR에 포함하지 않을 작업을 작성한다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- 주인, 방문자, 전환된 새 주인의 흐름 변화를 작성한다.

## 디자인 영향

- 없음, 또는 변경할 화면과 목업을 작성한다.

## API와 데이터 영향

- 없음, 또는 route, schema, model, migration, storage, auth 변경을 작성한다.

## 구현 계획

- 파일과 모듈 경계를 포함한 구체적인 구현 순서를 작성한다.

## 완료 기준

- 관찰 가능하고 테스트 가능한 pass/fail 조건을 작성한다.

## 테스트 계획

- ./scripts/run-ai-verify --mode full
- 필요한 focused test, lint, e2e 또는 수동 확인을 작성한다.

## 분석과 관측성

- 없음, 또는 퍼널 이벤트, 로그, 대시보드 영향을 작성한다.

## 개인정보와 악용 방지

- 없음, 또는 익명 응답, 공개 링크, 민감 팩 관련 위험과 완화를 작성한다.

## 롤아웃과 복구

- 단계적 배포, feature flag, migration rollback 또는 복구 절차를 작성한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- 없음, 또는 구현 전 해결해야 할 블로커를 작성한다.

