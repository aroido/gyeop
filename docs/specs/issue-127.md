# Issue 127 구현 스펙: [Frontend] 초대 연결 오류에서 질문팩 탐색 탈출구 제공

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/127

## 목표

초대 메타데이터의 일시 오류에서 재시도를 주 동작으로 유지하면서 홈의 질문팩 탐색으로 빠지는 보조 경로를 제공한다.

## 범위

- [ ] `InviteEntry`의 `retryable` 카드에 `/` 링크 `겹 둘러보기`를 추가한다.
- [ ] 기존 `다시 시도` 버튼의 상태·요청 로직과 `unavailable` 상태 링크를 그대로 유지한다.
- [ ] retryable 주·보조 동작과 320/390/430px 배치를 mock E2E로 검증한다.

## 제외 범위

- [ ] 관계 선택·3장 응답·비교 결과에는 이탈 버튼을 추가하지 않는다.
- [ ] API, 오류 분류, 재시도 횟수·backoff, rate limit, 오프라인 감지는 변경하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- .codex/AGENTS.md

## 사용자 흐름 영향

- [ ] 방문자: 초대 일시 오류 → `다시 시도` 또는 `겹 둘러보기` → 홈 질문팩 탐색. 정상 초대와 새 주인 전환 흐름은 그대로다.

## 디자인 영향

- [ ] 기존 오류 카드와 `unavailable`의 링크 스타일을 재사용한다. 버튼을 먼저, 보조 링크를 다음 DOM 순서로 두고 모두 44px 이상 터치 영역과 focus-visible을 유지한다.

## API와 데이터 영향

- [ ] 없음. client 렌더링과 E2E만 변경한다.

## 구현 계획

- [ ] `app/i/[publicId]/invite-entry.tsx` retryable 분기에 `Link href="/"`를 추가한다.
- [ ] `tests/e2e/share-links.spec.ts` mock을 한 번 retryable로 만든 뒤 재시도 요청과 홈 이동을 각각 검증한다.
- [ ] 기존 모바일 overflow·키보드 검증에 두 동작을 포함한다.

## 완료 기준

- [ ] retryable 상태에 `다시 시도`와 `겹 둘러보기`가 함께 보이고 DOM/시각 계층은 재시도가 우선이다.
- [ ] 재시도는 같은 초대 API를 다시 호출하며 보조 링크는 `/`로 이동한다.
- [ ] unavailable·정상·응답·비교 CTA는 회귀하지 않는다.
- [ ] 320~430px에서 가로 overflow 없이 키보드로 접근할 수 있다.

## 테스트 계획

- [ ] `./scripts/run-ai-verify --mode full`
- [ ] `share-links.spec.ts` retryable focused E2E와 320/390/430px 모바일 검증.

## 분석과 관측성

- [ ] 없음. 탐색 링크 클릭 이벤트를 새로 기록하지 않는다.

## 개인정보와 악용 방지

- [ ] 링크 비밀과 오류 원인을 노출하지 않고 기존 generic 오류 문구를 유지한다.

## 롤아웃과 복구

- [ ] migration·flag 없음. 신규 링크와 해당 E2E만 되돌릴 수 있다.

## 스펙 검토

Reviewer Agent: critic issue127_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 없음.
