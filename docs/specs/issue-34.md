# Issue 34 구현 스펙: [QA] 세 핵심 가설 모바일·접근성 E2E 게이트 구축

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/34

## 목표

빈 로컬 DB에서 owner 생성·최초 공유, 방문자 3명의 응답·same-pack 전환, 공개 프로필 누적·재공유·후속 응답까지 세 핵심 가설을 하나의 모바일 브라우저 fixture로 완주하고, 동일 실행에서 접근성과 SQL 퍼널 수치를 검증하는 필수 게이트를 만든다.

## 범위

- `tests/e2e/core-mvp-live.spec.ts`에 issue #34 전용 live Playwright fixture를 추가한다.
- fixture 하나가 다음 흐름을 순서대로 실제 UI와 로컬 Supabase에 실행한다.
  - owner가 오래된 친구 팩 10장에 답하고 공개 링크를 만든다.
  - native share 미지원과 clipboard 실패에서도 원본 링크가 남고, 재시도한 복사는 성공한다.
  - 서로 다른 브라우저 context의 방문자 3명이 관계를 선택하고 필수 3장에 답해 비교 결과를 본다.
  - 첫 방문자가 `나도 이 팩으로 시작하기`로 같은 팩의 새 owner가 된다.
  - 원래 owner 프로필이 공개 시선 3개와 공통 Signature 카드의 3명 집계를 보이며, 표본 3개 미만인 나머지 카드는 계속 숨긴다.
  - 원래 owner가 프로필 CTA로 이동해 active 공개 링크를 UI에서 재발급하고, replacement URL을 재공유한 뒤 네 번째 후속 방문자가 그 링크에서 제출·비교를 완료한다.
- owner 및 방문자 context에 320×800, 390×844, 430×932 viewport를 배치해 한 fixture에서 세 폭을 모두 통과시킨다.
- 핵심 화면마다 가로 overflow 없음, primary CTA 비절단, 최소 44px target, 예상 heading focus, keyboard activation, reduced-motion media 적용을 확인한다.
- `@axe-core/playwright`의 WCAG 2 A/AA 분석으로 핵심 화면의 `critical`/`serious` 위반 0건을 자동 검증한다.
- 실행 전후 `private.core_funnel_stage_counts` delta를 읽어 UI로 일으킨 행동과 세 funnel stage 수가 일치하는지 확인한다.
- `package.json`의 live E2E 명령과 `scripts/ai-verify`를 연결해 이 fixture 실패가 전체 검증·PR CI를 실패시킨다.
- `docs/engineering/core-mvp-e2e-gate.md`에 자동 검증 범위와 키보드·focus·reduced motion 모바일 체크 기록을 남긴다.
- gate가 발견한 비교 화면 focus 회귀는 `ResponseFlow`의 기존 heading ref를 사용해 최소 수정하고 mocked regression test로 고정한다.

## 제외 범위

- 제품 문구·레이아웃·시각 디자인, API, RPC, migration, analytics schema 변경
- 기존 `owner-play-live.spec.ts`가 소유한 보안·rate limit·1:1 링크·credential 경계의 재구현
- desktop 최적화, 성능 부하 시험, production 배포, 독립 보안 감사
- 선택 2장, 이메일, 응답 철회, 계정 삭제
- fixture용 DB row를 직접 만들어 UI 단계를 우회하는 방식

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/core-funnel-events.md`
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 시각적 동작은 바뀌지 않는다. 방문자 제출 뒤 keyboard·screen reader focus가 비교 결과 h1으로 이동하도록 기존 의도를 복구한다.
- 자동 fixture가 실제 사용자의 핵심 loop를 그대로 수행해 다음 세 질문을 독립적으로 증명한다.
  1. 첫 사용자가 팩을 완료하고 공개 링크를 공유할 수 있는가.
  2. 공유받은 친구가 3장에 답해 비교하고 같은 팩의 새 owner가 될 수 있는가.
  3. 친구 시선 3개가 프로필에 쌓이고 원래 owner가 재공유해 후속 응답을 받을 수 있는가.

## 디자인 영향

- 제품 UI 변경 없음.
- 기존 화면의 반응형·focus·target·reduced-motion 계약을 실제 DB 경로 위에서 검증한다.
- 한 fixture 안에서 owner 시작/공유는 390px, 방문자 1/2/3은 각각 320/390/430px, 프로필 재공유는 owner page를 320px과 430px로 바꿔 확인한다.

## API와 데이터 영향

- API와 schema 변경 없음.
- fixture는 앱 route만 호출하고, 테스트 assertion 용도로만 로컬 Docker Postgres의 private funnel view를 읽는다.
- 각 context는 고유 `x-forwarded-for`를 사용해 공개 rate limit과 세션을 독립시킨다.
- 공유 링크 raw secret은 브라우저 fragment와 fixture 메모리에만 두고 로그·문서·DB assertion 결과에 출력하지 않는다.

## 구현 계획

1. `@axe-core/playwright`를 dev dependency로 고정하고 `pnpm-lock.yaml`을 갱신한다.
2. 새 live spec에 최소 helper를 둔다: 팩 활성화, funnel count 읽기, viewport/overflow/target 검사, critical·serious axe 검사, owner 10장 완료, 방문자 3장 완료.
3. 390px owner가 공개 링크를 만들고 native share 미지원/clipboard 실패→수동 링크 유지→clipboard 재시도 성공을 실제 UI로 검증한다.
4. 320/390/430px의 세 visitor context가 같은 공개 링크에서 관계 선택→3장 답변→비교를 완료하고, 각 핵심 상태에서 모바일·접근성 계약을 검사한다.
5. 첫 visitor의 same-pack CTA를 키보드로 활성화해 새 owner route와 질문 1을 확인한다.
6. 원래 owner 프로필에서 정확히 3개의 공개 시선과 공통 Signature 카드의 3명 집계만 공개되고, 표본 3개 미만인 나머지 9장은 `n/3` 상태로 계속 숨는지 확인한다. 320/430px에서 CTA·overflow·focus도 검사한다.
7. 프로필 재공유 entry source로 공유 관리 화면에 진입하고, raw secret을 복원하지 않은 채 active 공개 링크를 UI에서 안전하게 재발급한다. replacement URL을 재공유한 뒤 네 번째 visitor가 그 링크에서 3장 제출과 비교 화면까지 완료한다.
8. stage count delta가 `owner_share=1/1/1`, `visitor_same_pack=4/4/1/1`, `profile_reshare=1/1/1/1`인지 확인한다. 네 번째 visitor도 required submit과 comparison cohort에 포함되므로 visitor 첫 두 stage는 4다.
9. live E2E script와 full verifier에 새 gate를 연결하고 QA 체크 문서를 작성한다.
10. live gate가 검출한 비교 화면 heading focus 누락을 수정하고 mocked visitor E2E에도 같은 assertion을 추가한다.

## 완료 기준

- [ ] 하나의 독립 live E2E test가 owner→공개 공유→방문자 3명→same-pack 새 owner→프로필 3시선→재공유→후속 visitor 제출을 완주한다.
- [ ] 320/390/430px 모두 document 가로 overflow가 없고 확인한 primary CTA가 viewport에서 잘리지 않으며 interactive target이 44×44px 이상이다.
- [ ] 관계 선택, 질문 이동, 비교 CTA, 프로필 재공유의 heading/focus 순서와 최소 한 번의 keyboard activation이 통과한다.
- [ ] 방문자 제출 직후와 제출 완료 응답 reload 뒤 비교 결과 h1이 focus를 받는다.
- [ ] fixture context가 `prefers-reduced-motion: reduce`를 사용하고 앱이 이를 인식한다.
- [ ] 핵심 owner/share/visitor/comparison/profile 화면의 axe `critical`/`serious` 위반이 0이다.
- [ ] native share 미지원과 clipboard 실패가 성공 event를 만들지 않고 raw 링크를 유지하며, 같은 화면의 재시도 복사가 성공한다.
- [ ] 프로필은 3명 전까지 aggregate 선택 수를 숨기고 세 번째 제출 뒤 공통 Signature 카드의 3명 집계만 보인다. 표본이 분산된 나머지 9장은 실제 `n/3` 상태로 계속 숨긴다.
- [ ] 세 funnel SQL delta가 fixture의 행동 수와 정확히 일치한다.
- [ ] 새 gate 실패가 `./scripts/run-ai-verify --mode full`과 GitHub CI를 실패시킨다.

## 테스트 계획

- `pnpm exec playwright test tests/e2e/core-mvp-live.spec.ts --project=mobile-chromium --workers=1`은 live flag 없이 skip되는지 확인한다.
- `GYEOP_E2E_LIVE=1 pnpm exec playwright test tests/e2e/core-mvp-live.spec.ts --project=mobile-chromium --workers=1`
- `pnpm typecheck`
- `pnpm format:check`
- `./scripts/run-ai-verify --mode full`은 최종 clean commit에서 한 번만 실행한다.

## 분석과 관측성

- 기존 `private.core_funnel_stage_counts`만 사용하며 새 event나 dashboard를 만들지 않는다.
- fixture는 시작 시 baseline을 저장하고 종료 시 delta만 비교해 이전 로컬 데이터에 영향받지 않는다.
- stage 수는 event row가 아닌 distinct owner/response subject이므로 UI 행동 수와 그 의미가 동일한지 확인한다.

## 개인정보와 악용 방지

- 테스트는 결정적 로컬 key와 문서화된 가짜 IP만 사용하며 production credential이나 실제 사용자 데이터를 사용하지 않는다.
- DB fixture를 직접 insert하지 않고 공개/owner HTTP 경계와 HttpOnly cookie를 그대로 거친다.
- raw invite secret, cookie, owner/response UUID를 assertion 실패 메시지나 문서에 직접 넣지 않는다.
- axe 결과는 rule id와 영향도만 출력하고 화면 입력값이나 URL fragment를 첨부하지 않는다.

## 롤아웃과 복구

- production runtime의 시각·데이터 계약은 바뀌지 않으며, 비교 화면 heading focus 복구만 포함한다.
- 새 gate가 flaky하면 제품 코드를 완화하지 않고 fixture의 대기 조건·context 격리·고유 IP를 수정한다.
- 복구는 live script에서 새 spec 연결을 제거하고 test/doc/dependency 파일을 되돌리는 것이다.
- gate는 로컬 full verify와 PR CI에서 동일한 명령으로 실행한다.

## 스펙 검토

Reviewer Agent: issue34_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 기존 live owner test와 새 fixture가 같은 DB를 사용하므로 live 명령은 worker 1로 직렬 실행해야 한다.
- axe scan은 비동기 데이터 로딩이 끝나고 focus 이동이 안정된 상태에서만 실행한다.
- 세 viewport 전체 flow를 세 번 반복하지 않고 서로 다른 actor/context에 분배한다. 각 화면별 mocked 접근성 테스트도 full verify에 계속 포함해 중복 실행 시간을 제한한다.
