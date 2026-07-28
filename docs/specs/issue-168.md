# Issue 168 구현 스펙: 과거 완료 팩도 상위개념 프로필에 안전하게 집계

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/168

## 목표

과거 버전 팩 완료 기록도 카드 의미가 현재 상위개념 매핑과 동일한 범위에서만 안전하게 재사용하여 `/me` 상위개념 프로필과 3축 공유 카드를 만든다.

## 범위

- [ ] `packManifests`를 현재 팩의 권위 있는 SSOT로 사용하고 `packManifestHistory`는 완료 기록의 정확한 slug/version 과거 매니페스트 조회에만 사용한다. `selectConceptProfileSourcePairs`는 두 입력을 분리해 같은 slug의 현재 매니페스트와 호환 가능한 과거 카드를 판별한다.
- [ ] 호환 어댑터는 과거 매니페스트의 10장·순서·owner 선택 불변성을 유지한다. 위치가 같은 현재 카드의 유효한 `conceptContext`를 각 과거 카드에 부여하고, `conceptSignals`는 항상 배열로 만든다.
- [ ] 과거 카드와 현재 카드의 `id`, `position`, `ownerPrompt`, `visitorPrompt`, `optionA`, `optionB`가 모두 같을 때만 현재 `conceptSignals`를 재사용한다. 하나라도 다르면 `conceptSignals: []`로 만들고 수집기는 빈 배열을 방향·근거·단계 계산에 기여하지 않는 카드로 처리한다.
- [ ] 최신 팩의 기존 집계, slug별 최신 완료 1건 선택, 결과 불변성 계약을 유지한다.
- [ ] 호환·비호환 카드와 새 버전 회귀를 focused unit test로 고정하고, 과거 완료 계정 형태의 `/me` 및 공유 카드 경로를 회귀 검증한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/question-pack-spec.md`, `docs/product/decision-log.md`에 정확한 버전만 허용하던 규칙의 안전한 예외와 여섯 필드 완전 일치 계약을 기록한다.

## 제외 범위

- [ ] DB schema, migration, 저장된 완료 데이터, 게시된 팩 버전을 변경하지 않는다.
- [ ] API 응답 schema, 인증·인가, UI와 문구를 변경하지 않는다.
- [ ] 의미가 달라진 과거 카드에 수동 매핑이나 추정 신호를 부여하지 않는다.
- [ ] 상위개념 모델, 임계값, 최신 팩 매핑과 개인정보·공유 정책을 변경하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- [ ] 과거 버전 팩만 완료한 주인도 안전하게 일치한 카드가 충분하면 `/me`에서 관계형 폴백 대신 상위개념 프로필과 3축 공유 카드를 본다.
- [ ] 의미가 바뀐 카드는 결과에 섞이지 않는다. 방문자 응답·결과와 `나도 이 팩으로 시작하기` 전환 흐름은 바뀌지 않는다.

## 디자인 영향

- [ ] 없음. 기존 `/me` 상위개념 프로필과 공유 카드 UI를 그대로 사용한다.

## API와 데이터 영향

- [ ] route와 API schema 변경은 없다. 기존 owner play, profile, pack manifest를 읽어 서버 내부 소스 선택과 카드 신호 구성만 보정한다.
- [ ] DB schema, migration, storage, auth 변경은 없다. 저장 데이터와 게시 버전은 수정하지 않는다.

## 구현 계획

- [ ] `lib/http/auth-owner.ts`는 `packManifestHistory`의 과거 조회용 `manifests`와 `packManifests`의 현재 SSOT용 `currentManifests`를 `selectConceptProfileSourcePairs`에 별도 인자로 전달한다.
- [ ] `lib/owner-profile/concept-profile-core.mjs`는 `manifests`를 완료 기록의 정확한 slug/version 조회에만 쓰고, `currentManifests`만 같은 slug의 현재 개념 매니페스트 선택에 사용한다. 과거 이력에 `conceptVersion: 1` 항목이 여러 개 생겨도 현재 선택은 `packManifests`에 의해 결정적이어야 한다.
- [ ] 현재 매니페스트와 정확히 일치하는 최신 경로는 그대로 둔다. 과거 경로는 10장 배열과 owner 선택을 보존하고 같은 위치의 현재 카드에서 `conceptContext`를 복사한다. 여섯 필드가 모두 같은 카드에는 현재 `conceptSignals`, 하나라도 다른 카드에는 `[]`를 부여한다. 입력 매니페스트와 저장 완료 데이터는 변경하지 않는다.
- [ ] `lib/owner-profile/concept-profile-core.mjs`의 신호 수집이 `conceptSignals: []`를 유효하지만 기여가 없는 카드로 처리하는 계약을 명시적으로 고정한다.
- [ ] `tests/unit/concept-profile.test.mjs`에 실제 버전별 호환 카드 수와 여섯 필드 각각의 불일치를 표 기반 회귀 테스트로 추가한다.
- [ ] `tests/integration/owner-profile-session.test.mjs`에서 과거 완료 세션이 `lib/owner-profile/concept-profile-feature.mjs`와 `lib/http/owner-concept-profile.ts` 경로를 거쳐 상위개념 프로필을 반환하는지 검증한다.
- [ ] `tests/e2e/concept-profile-live.spec.ts`에서 legacy completed account fixture로 `/me` 상위개념 프로필과 3축 공유 카드를 검증한다.
- [ ] `docs/product/core-feature-priority.md`에는 과거 완료 팩 지원 우선순위와 안전 경계를, `docs/product/question-pack-spec.md`에는 어댑터·완전 일치 규칙을, `docs/product/decision-log.md`에는 정확한 버전 규칙의 제한적 예외 결정을 기록한다.

## 완료 기준

- [ ] `coworker-v1`에서 현재 `coworker-v2`로 10장 모두 현재 개념 신호를 재사용한다.
- [ ] `group-chat-role-v1`과 `group-chat-role-v2`는 각각 현재 `group-chat-role-v3`와 비교하여 `decision`, `inside-joke`를 제외한 8장만 현재 개념 신호를 재사용한다.
- [ ] `old-friend-v1`은 현재 `old-friend-v3`와 비교하여 `celebration`을 제외한 9장만, `old-friend-v2`는 10장 모두 현재 개념 신호를 재사용한다.
- [ ] 모든 과거 소스는 카드 10장과 owner 선택을 그대로 유지하며 각 카드가 유효한 `conceptContext`와 배열인 `conceptSignals`를 가진다.
- [ ] 제외된 카드의 주인 선택은 상위개념 방향, 근거 카드 수, 단계에 영향을 주지 않는다.
- [ ] 현재 `conceptVersion: 1` 팩과 이후 새 버전의 기존 선택·집계 동작이 회귀하지 않는다.
- [ ] `packManifestHistory`에 같은 slug의 `conceptVersion: 1` 과거 항목이 여러 개 있어도 `packManifests`가 지정한 현재 버전만 비교 기준으로 선택된다.
- [ ] 과거 완료 기록만 있는 계정 형태에서 `/me` 상위개념 프로필과 3축 공유 카드가 노출된다.
- [ ] DB/API/UI 계약과 최신 팩·개인정보·공유 안전 동작이 변경되지 않는다.
- [ ] 병합된 정확한 main SHA와 Render 운영 배포 SHA가 일치하고, 그 배포에서 과거 완료 계정 형태의 `/me` 결과를 확인한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] `node --test tests/unit/concept-profile.test.mjs`
- [ ] focused unit test에서 `coworker-v1→v2` 10장, `group-chat-role-v1/v2→v3` 각각 8장, `old-friend-v1→v3` 9장, `old-friend-v2→v3` 10장 호환과 새 버전 회귀를 검증한다.
- [ ] `id`, `position`, `ownerPrompt`, `visitorPrompt`, `optionA`, `optionB`를 하나씩 바꾸는 표 기반 테스트가 각 경우 `conceptSignals: []`와 방향 무기여를 검증한다.
- [ ] 결정적 현재 선택 unit test는 `packManifestHistory`에 같은 slug의 `conceptVersion: 1` 이력을 여러 개 넣고도 `currentManifests`의 버전만 호환 기준으로 사용됨을 검증한다.
- [ ] `node --test tests/integration/owner-profile-session.test.mjs`
- [ ] `tests/e2e/concept-profile-live.spec.ts`를 legacy completed account fixture로 실행하여 `/me` 상위개념 프로필과 3축 공유 카드 노출을 확인한다.
- [ ] 병합 후 Render 배포가 정확한 main SHA를 사용했는지 확인하고 운영 `/me`를 과거 완료 계정 형태로 검증한다.

## 분석과 관측성

- [ ] 없음. 이벤트 이름·속성, 로그, 대시보드 계약을 변경하지 않는다.

## 개인정보와 악용 방지

- [ ] 기존 owner 전용 조회, 방문자 응답 비공개, 공유 카드 공개 범위를 유지한다.
- [ ] 카드 문구와 선택지가 완전히 같은 경우에만 개념 신호를 재사용하여 과거 답변을 다른 의미로 재해석하지 않는다.
- [ ] 완료 데이터나 방문자 응답 원문을 새로 노출·복제·변경하지 않는다.

## 롤아웃과 복구

- [ ] schema와 데이터 변경이 없어 별도 feature flag나 단계적 migration은 필요하지 않다.
- [ ] 병합된 main SHA, Render 배포 SHA, 운영 확인 시각과 결과를 배포 증거로 남긴다.
- [ ] 문제가 생기면 이 PR의 코드 변경을 revert하여 기존의 정확한 `conceptVersion: 1` 버전만 집계하는 동작으로 복구한다.

## 스펙 검토

Reviewer Agent: issue_168_critic
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 구현 전 블로커와 미결정 사항은 없다.
- [ ] 위험은 문구가 같아 보여도 카드 의미가 달라진 경우의 오집계이며, 여섯 필드 완전 일치와 변경 카드의 빈 신호 배열 처리로 제한한다.
