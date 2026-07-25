# Issue 159 구현 스펙: 프로필 상위 개념의 누적 농도 표현과 상위 중심 화면 전환

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/159

## 목표

기존 상위 개념의 근거 누적 단계(`trace → outline → clear`)를 `/me` 카드의 시각적 농도에 연결하고, 개념 결과가 있는 프로필은 상위 개념과 공유 행동을 중심으로 보여준다.

## 범위

- [ ] `app/me/account-profile-view.tsx`의 개념 카드에 기존 `hook.stage`를 DOM 상태로 노출한다.
- [ ] 개념 결과가 있으면 기존 원자료 stack과 relationship 상세를 숨기고 상위 개념 및 대표 공유 CTA를 먼저 보여준다.
- [ ] 질문팩 관리 영역과 개념 결과가 없는 fallback은 유지한다.
- [ ] `app/me/owner-list.module.css`에서 `trace`, `outline`, `clear` 카드의 배경 그라데이션·테두리·강조 강도를 단계별로 구분한다.
- [ ] 기존 단계 라벨과 `N팩 · N맥락` 근거 문구를 유지해 색상 외에도 상태를 식별하게 한다.
- [ ] 단계 DOM 계약과 상위 중심 렌더링을 focused test로 고정한다.
- [ ] 병합 후 운영 환경의 `GYEOP_CONCEPT_PROFILE_ENABLED`를 `true`로 전환하고 exact SHA 배포를 검증한다.

## 제외 범위

- [ ] 공개 숫자 점수, 백분율, 순위
- [ ] MBTI와 같은 고정 유형명
- [ ] 개념 계산식, 단계 임계값, 데이터베이스 스키마 변경
- [ ] 새 디자인 라이브러리 또는 별도 프로필 화면
- [ ] 방문자용 원자료 공개 범위 변경

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- lib/owner-profile/concept-profile-core.mjs
- AGENTS.md

## 사용자 흐름 영향

- [ ] 주인은 여러 질문팩에서 쌓인 상위 개념의 현재 단계를 색·라벨·근거 수로 확인한다.
- [ ] 주인은 원자료 나열보다 상위 개념을 먼저 읽고 대표 CTA로 공유한다.
- [ ] 방문자와 전환된 새 주인의 응답·가입 흐름은 변경하지 않는다.

## 디자인 영향

- [ ] 대상은 모바일 `/me`이며 320px, 390px, 430px에서 확인한다.
- [ ] `trace`는 가장 낮은 명도/채도, `outline`은 중간, `clear`는 가장 강한 그라데이션과 테두리를 사용한다.
- [ ] 농도는 성격 확신도가 아니라 카드·팩·맥락 근거의 폭을 뜻한다.
- [ ] 모든 단계에서 본문 대비와 기존 `흔적/윤곽/선명` 텍스트를 유지한다.
- [ ] 디자인 검토 근거: https://www.lazyweb.com/report/lazyweb/1f80e6e2-e601-4467-95da-f517774f7e82/?source=create

## API와 데이터 영향

- [ ] API, schema, migration, storage, auth 변경 없음.
- [ ] `ConceptProfileStage`와 서버 계산 결과를 그대로 사용한다.

## 구현 계획

- [ ] `account-profile-view.tsx`에서 개념 카드에 `data-stage`를 추가한다.
- [ ] 같은 파일에서 `hasConceptHooks`일 때 legacy stack/relationship 렌더링을 생략한다.
- [ ] `owner-list.module.css`의 기존 `.conceptCard`에 단계별 attribute selector만 추가한다.
- [ ] 기존 테스트를 최소 수정해 stage attribute와 legacy 비노출 계약을 확인한다.
- [ ] focused test, full verify, CI, 병합, Render 배포, 운영 라우트를 순서대로 검증한다.

## 완료 기준

- [ ] `trace`, `outline`, `clear`가 각각 다른 카드 농도로 렌더링된다.
- [ ] 각 카드에 단계 라벨과 팩/맥락 수가 표시된다.
- [ ] 개념 결과가 있으면 원자료 stack과 relationship 상세가 `/me` 본문에 보이지 않는다.
- [ ] 개념 결과가 없거나 feature flag가 꺼지면 기존 fallback이 유지된다.
- [ ] 질문팩 관리와 대표 개념 공유 CTA가 유지된다.
- [ ] 320px, 390px, 430px에서 가로 overflow와 텍스트 잘림이 없다.
- [ ] full verify와 필수 CI가 통과하고 운영이 병합 SHA를 서비스한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] `pnpm test -- --runInBand`가 아닌 저장소 기존 focused test 명령으로 관련 owner-profile 테스트를 실행한다.
- [ ] concept profile live E2E에서 `data-stage`, 단계 라벨, legacy 비노출을 확인한다.
- [ ] concept 결과가 없거나 feature flag가 꺼진 경우 기존 stack/relationship fallback이 표시되는 회귀 테스트를 유지하거나 실행한다.
- [ ] concept 결과가 있어도 대표 공유 CTA와 질문팩 관리 영역이 유지되는지 확인한다.
- [ ] Playwright 모바일 viewport 320/390/430 시각 확인을 수행한다.
- [ ] `git diff --check`

## 분석과 관측성

- [ ] 새 이벤트나 로그 없음. 기존 프로필/공유 분석 이벤트를 유지한다.

## 개인정보와 악용 방지

- [ ] 공개 범위, 소유자 인증, 익명 응답 데이터 처리 변경 없음.
- [ ] 단계는 공개 점수나 확정적 성격 판정으로 표현하지 않는다.

## 롤아웃과 복구

- [ ] 병합 전 feature flag가 꺼진 상태에서 테스트한다.
- [ ] 병합 및 exact SHA 배포 후 Render 환경에서 `GYEOP_CONCEPT_PROFILE_ENABLED=true`로 활성화한다.
- [ ] 회귀 시 환경변수를 `false`로 되돌리면 기존 프로필로 즉시 복구된다.
- [ ] migration이 없으므로 데이터 rollback은 없다.

## 스펙 검토

Reviewer Agent: /root/issue_159_spec_critic
Review Status: PASS
P0/P1 Findings: 0
Review Note: fallback/관리 유지 테스트가 명시되지 않은 P1을 테스트 계획에 반영함.

## 리스크와 미결정 사항

- [x] 구현 전 블로커 없음.
- [ ] 모든 테스트 fixture가 `trace`만 만들 수 있으므로 stage별 CSS 계약은 소스/DOM test로 보완한다.
