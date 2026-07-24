# 제품 문서 인덱스

## 활성 SSOT

| 문서 | 역할 |
|---|---|
| [핵심 기능 우선순위](core-feature-priority.md) | 현재 제품 루프, P0~P3 범위, 승인 기준 |
| [질문팩 제품 명세](question-pack-spec.md) | 팩·카드·샘플링·응답 결과 규칙 |
| [의사결정 기록](decision-log.md) | 중요한 결정과 변경 이유 |
| [상위개념 그래프 설계](concept-graph-design.md) | 8개 영역·32개 결, 계산·공유·개인정보 경계 |

## 보조 문서

| 문서 | 역할 |
|---|---|
| [전체 제품 기획](full-product-plan.md) | 활성 SSOT를 종합한 문제·사용자·단계별 범위·장기 확장 기획 |
| [모바일 목업](../assets/mockups/) | 제품·플로우·프로필·공유 카드 시각 자료 |
| [Issue 157 Lazyweb 근거](../design/research/issue-157-lazyweb.md) | 모바일 참고 근거와 적용·비적용 결정 |

## 아카이브

`docs/archive/`는 아이디어의 변천을 확인할 때만 사용한다. 현재 기능을 결정할 때는 활성 SSOT를 우선한다.

## 업데이트 규칙

1. 기능의 현재 동작이 바뀌면 `core-feature-priority.md`를 수정한다.
2. 카드나 팩 데이터 규칙이 바뀌면 `question-pack-spec.md`를 수정한다.
3. 되돌리기 어려운 결정이나 핵심 루프 변경은 `decision-log.md`에 기록한다.
4. 관련 승인 기준과 퍼널 이벤트를 함께 수정한다.

## concept v1 런타임 SSOT

- 결 정의: `content/concepts-v1.json`
- 문자열 상한과 context allowlist: `lib/concepts/catalog-core.mjs`
- 카드 신호: 활성 최신 `content/packs/*-vN.json`
- 과거 version/card: `packManifestHistory`, `OFFICIAL_PACK_HISTORY`, `OFFICIAL_PACK_CARD_IDS`
- 집계식: `lib/owner-profile/concept-profile-core.mjs`

TSV는 전수 검수 추적 자료이고 런타임 입력이 아니다. 프로필은 고정 유형·진단·점수를 만들지 않으며 공유 여부는 비공개 others와 분리한 비연애 `shareSafeOthers`에서만 판정한다.
