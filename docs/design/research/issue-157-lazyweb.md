# Issue 157 Lazyweb 디자인 근거

Status: Reviewed reference  
원문: https://www.lazyweb.com/report/lazyweb/e952b275-d0cc-4f09-b0b8-1c8e8769b40d/?source=create

## 근거 범위와 한계

리포트는 모바일 참고 36개와 GYEOP 프로토타입 2개를 바탕으로 한 화면 방향성 자료다. GYEOP의 owner-only 프로필, 관계·카드 3표본 임계값, 1:1 제외와 비연애 공유 allowlist에 선행하는 개인정보 모델은 아니다. 따라서 제품·개인정보 계약은 활성 제품 SSOT와 issue 157 Reviewed spec을 우선한다.

## 적용

- 첫 화면에는 32개 결을 모두 나열하지 않고 대화가 되는 훅 3~5개만 표시한다.
- `왜 이렇게 보일까?`는 native disclosure로 두고 팩 제목·검수된 맥락·기준 충족 단계를 보여 준다.
- 공유 전에 전체 안전 후보를 picker로 제공하고 추천 첫 항목도 owner가 직접 확인하게 한다.
- 9:16 공유 카드는 한 결의 관찰문, 다음 질문, 근거 요약과 같은 source pack CTA만 담는다.
- 기존 GYEOP의 검정·라임·블루·코랄 언어, 모바일 폭과 canvas 공유 구현을 유지한다.

## 적용하지 않음

- 32개 결의 동등한 막대·점수·퍼센트
- MBTI형 고정 코드, 진단, 적합도
- 외부 사례의 공개 프로필·방문자 목록·관계 원자료
- 개인 답변이나 romantic/1:1 근거 공유
- 새 UI dependency 또는 별도 디자인 시스템
