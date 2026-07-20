# 이슈 #16 구현 스펙 — 최소 연령·미성년자 정책 UI·API 집행

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/16

## 목표

새 주인 play와 새 방문자 response를 만들기 전에 대한민국에서 이용하는 만 19세 이상이라는 exact 자기확인을 UI와 서버 생성 경계 양쪽에서 요구하고, 미해당 사용자는 답변·프로필·쿠키·분석 데이터를 만들지 않은 채 종료한다.

## 범위

- `/play/new?pack=...`의 새 주인 흐름에 연령·지역 자기확인과 무저장 차단 상태를 추가한다.
- `/i/[publicId]#k=...`의 새 방문자 흐름에서 초대 맥락을 확인한 뒤 관계 선택 전에 같은 자기확인과 차단 상태를 추가한다.
- `/`에 만 19세·대한민국 이용 안내와 `/privacy` 정책·문의 안내 링크를 추가한다. 실제 접수 채널이 없는 동안 준비 중임을 명시하고 production 모집을 열지 않는다.
- 이미 유효한 owner 또는 visitor capability로 기존 도메인 row를 재개할 때는 확인을 반복하지 않는다.
- `POST /api/plays`의 새 play branch와 `POST /api/invites/[publicId]/responses`의 새 response branch에서 exact boolean `eligibilityConfirmed: true`를 요구한다.
- missing, `false`, 문자열·숫자 coercion, unknown field가 도메인 RPC, product analytics, 도메인 rate-limit row, cookie 생성보다 앞에서 거부되는 것을 테스트한다.
- `docs/design/p0-mobile-ui-spec.md`에 owner·visitor eligibility 상태, exact copy, 접근성, responsive 기준과 Lazyweb 근거를 추가한다.
- client request 계약, focused unit/integration test, 320/390/430px Playwright 검수를 함께 갱신한다.

## 제외 범위

- 생년월일, 주민등록번호, 신분증, 휴대전화 본인인증, 보호자 성명·연락처, IP 기반 국가 추론 수집.
- 부모·법정대리인 동의 흐름과 만 19세 미만 예외.
- 이메일 로그인, 계정 연결, 계정 삭제, cross-device 복구. 이는 #8, #33의 범위다.
- 일반 보관 기간·backup purge·미성년자 삭제 job 구현. 이는 #7, #32의 범위다.
- 해외 출시, 해외 법률 판정, 위치 기반 지역 확인.
- 연령 확인 자체를 product analytics event나 application log로 남기는 기능.
- 실재하지 않는 문의 이메일이나 운영되지 않는 외부 접수 채널 노출. 실제 채널·담당자·응답 SLA는 #7과 production release gate에서 연다.

## SSOT

- `docs/product/age-and-minor-policy.md`
- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/design/p0-mobile-ui-spec.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `docs/specs/issue-6.md`
- `AGENTS.md`, `.codex/AGENTS.md`

## 사용자 흐름 영향

### 새 주인

1. 사용자가 홈에서 팩을 고른다.
2. owner cookie가 없으면 `/play/new`는 API를 호출하기 전에 eligibility 화면을 보인다. cookie가 있으면 문법 판정을 UI에서 추측하지 않고 기존 bootstrap API에 전달한다.
3. 확인 항목은 기본 선택하지 않는다. 사용자가 exact 항목을 선택해야 Primary `확인하고 계속`이 활성화된다.
4. 확인 후에만 `eligibilityConfirmed: true`를 포함해 `POST /api/plays`를 호출하고 첫 질문으로 이동한다.
5. `아직 만 19세가 아니에요`를 고르면 요청·저장 없이 차단 화면과 홈 복귀만 제공한다.
6. 유효한 owner cookie로 기존 play를 재개할 때는 확인 화면 없이 현재 resume 경계를 사용한다. malformed·만료·위조 capability는 cookie 삭제를 포함한 기존 generic terminal로 수렴하며, `새 팩 시작`으로 세션을 지운 뒤 eligibility 화면으로 돌아간다.

### 새 방문자

1. 초대 fragment와 공개 metadata를 확인해 팩 제목·초대 종류만 보여 준다.
2. 기존 visitor response capability가 복구되면 현재 답변 위치로 바로 이어진다.
3. 복구되는 response가 없으면 관계·시점 fieldset보다 먼저 eligibility 화면을 보인다.
4. 확인 후에만 관계·시점을 고를 수 있고, 새 response 생성 요청에 exact boolean을 포함한다.
5. 미해당 선택은 response, assignment, cookie, 관계, 답변, 분석 event를 만들지 않고 홈 복귀만 제공한다.

### 방문자에서 새 주인 전환

- 비교 뒤 `나도 이 팩으로 시작하기`는 기존 `/play/new?...&source=same_pack_cta`를 사용한다.
- 이미 owner capability가 있으면 기존 play 재개, 없으면 같은 owner eligibility 화면을 거친다.
- 별도 우회 route나 별도 확인 문구를 만들지 않는다.

## 디자인 영향

### 공통 eligibility 화면

- 공통 client component 한 개로 owner와 visitor의 문구·키보드·focus 동작을 고정한다.
- exact copy:
  - 제목: `겹은 만 19세 이상만 이용할 수 있어요`
  - 설명: `지금은 대한민국에서 이용하는 성인만 참여할 수 있어요. 생년월일이나 신분증은 받지 않아요.`
  - 확인 항목: `만 19세 이상이며 대한민국에서 이용 중이에요.`
  - Primary: `확인하고 계속`
  - 미해당 선택: `아직 만 19세가 아니에요`
  - 차단 제목: `지금은 겹을 이용할 수 없어요`
  - 차단 설명: `답변이나 프로필은 저장되지 않았어요.`
- confirmation은 native checkbox다. 기본 `false`, visible label, 44px 이상 hit area, keyboard Space 전환, `focus-visible` outline을 제공한다.
- 화면당 lime Primary는 한 개만 둔다. 미해당 선택과 차단 뒤 `홈으로`는 Secondary 또는 Tertiary다.
- eligibility와 차단 heading은 상태 진입 때 focus를 받는다. checkbox가 선택되지 않은 Primary에는 가까운 문구로 이유가 보이므로 submit validation alert를 추가하지 않는다.
- 320/390/430px, 200% zoom, safe area, reduced motion에서 가로 overflow나 CTA 가림이 없어야 한다.

### 홈과 정책·문의 안내

- `/`의 팩 목록 아래에 `겹은 대한민국에서 이용하는 만 19세 이상만 참여할 수 있어요. 생년월일이나 신분증은 받지 않아요.`를 표시하고 `/privacy`로 연결한다.
- `/privacy`는 최소 연령, 대한민국 한정, 미성년자 데이터 무저장·신고 시 삭제 정책을 요약한다.
- 현재 비공개 테스트에는 공개 문의 접수 채널이 없으므로 `문의 접수 채널을 준비 중이에요. 공개 모집 전 이 페이지에 안내할게요.`를 정확히 표시한다. #7이 담당자·응답 SLA를 확정하고 실제 채널이 준비되기 전에는 production beta를 열지 않는다.
- 없는 이메일 주소를 만들거나 개인정보를 공개 GitHub issue로 보내도록 유도하지 않는다.

### Lazyweb 근거와 채택 범위

- 현재 390×844 첫 질문 화면을 바탕으로 생성한 improve report: https://www.lazyweb.com/report/lazyweb/8bef4be7-3450-4d83-b4fd-106e5212d3d4/?source=create
- report의 핵심 진단은 현재 첫 질문 앞에 연령·지역 안전 경계가 없고, 질문 화면의 `자동 저장` 문구가 미해당 사용자에게 무저장 약속과 충돌할 수 있다는 것이다.
- 채택: 첫 질문 생성 전 별도 안전 확인, 하나의 dominant confirm CTA, 명시적인 무저장 종료, 개인정보를 받지 않는다는 안심 문구.
- 조정: report의 두 checkbox와 배경 질문 위 bottom sheet는 사용하지 않는다. 제품 SSOT의 exact 단일 확인 항목을 유지하고, play가 아직 생성되지 않았으므로 질문·자동 저장 상태를 배경에 미리 보여 주지 않는 full-screen required step으로 구현한다.
- report는 `degraded=false`, mockup failure 0건이며 무료 결과의 1개 variant를 근거로 사용한다.

## API와 데이터 영향

### 요청 schema

- `createOwnerPlaySchema`
  - 기존 `packSlug`, `entrySource` 유지.
  - `eligibilityConfirmed: z.literal(true).optional()` 추가.
  - optional인 이유는 같은 route의 유효 owner resume branch가 확인을 반복하지 않기 때문이다.
- `visitorResponseSchema`
  - `resume`: `eligibilityConfirmed`, `relationshipCode`, `knownSinceCode`가 모두 없어야 한다.
  - `start`: relationship·known-since와 함께 `eligibilityConfirmed === true`여야 한다.
  - `false`, coercion, unknown key는 strict boundary에서 거부한다.

### route 분기 순서

- owner route는 request boundary 통과 뒤 owner cookie를 분류한다.
  - absent branch는 `eligibilityConfirmed !== true`이면 즉시 `INVALID_INPUT`으로 끝낸다.
  - 그 다음에만 visitor source cookie, create RPC, owner create rate-limit domain row, analytics를 다룬다.
  - valid owner branch는 확인 필드가 없어도 기존 resume rate limit과 RPC를 사용한다.
  - malformed owner branch는 생성하지 않고 기존 generic terminal cookie 삭제 응답을 유지한다.
- visitor route는 intent shape를 먼저 고정한다.
  - `resume`에는 eligibility 필드가 없어야 한다.
  - `start`는 eligibility true가 없으면 `INVALID_INPUT`이며 publicId, capability, domain RPC와 도메인 rate-limit row 처리 전에 종료한다.

### 저장과 migration

- 새 column은 없다.
- 정확한 나이·생년월일·지역·underage 여부를 저장하지 않는다.
- acknowledgement row나 analytics event를 만들지 않는다. 통과 사실은 생성 요청의 일회성 boolean으로만 사용한다.
- `20260719000500_eligibility_cutover.sql`은 정책 이전 private-test 상태를 한 번 초기화한다. `analytics_events`를 먼저 지운 뒤 `pack_plays`를 삭제해 self answer·share link·visitor response·assignment cascade를 사용하고, `rate_limit_buckets`를 비운 뒤 `core_funnel_v1` 측정 시작 시각을 갱신한다.
- migration은 질문팩 template/version/card를 보존한다. 정책 이전 owner·visitor capability가 가리키는 도메인 row가 없어지므로 자동 grandfathering 없이 generic terminal로 끝난다.
- 이는 공개 production 데이터 migration이 아니라 현재 private MVP cutover다. production beta는 별도 법률·문의·release gate 승인 전까지 닫힌다.

## 구현 계획

1. `docs/design/p0-mobile-ui-spec.md`에 eligibility 공통 상태와 owner/visitor 상태표를 추가한다.
2. `app/components/eligibility-gate.tsx`와 전용 CSS module을 추가해 exact copy, checkbox, confirm, blocked, focus 동작을 공유한다.
3. `/`에 최소 연령 안내 링크를 추가하고 `app/privacy/page.tsx`에 실제 운영 상태를 숨기지 않는 최소 정책·문의 안내를 둔다.
4. `app/play/new/page.tsx`는 owner cookie 부재 여부만 확인해 `requiresEligibility`를 전달한다. cookie가 하나라도 있으면 기존 API가 valid/malformed를 판정한다.
5. `app/play/new/bootstrap.tsx`의 state machine을 `eligibility → loading → retryable|terminal`로 확장한다. cookie resume은 기존 `loading`에서 시작하고, malformed·만료 terminal이 cookie를 지운 뒤 `새 팩 시작`은 eligibility로 돌아간다.
6. `app/i/[publicId]/invite-entry.tsx`는 metadata와 기존 response를 복구한 뒤 response가 없을 때 eligibility를 관계 form보다 먼저 렌더한다.
7. `lib/owner-flow/owner-flow-client.ts`와 `lib/visitor-response/visitor-response-client.ts`의 request body와 single-flight key를 새 계약에 맞춘다.
8. `lib/http/owner-play-schemas.ts`, 두 POST route에서 exact create-only enforcement를 구현한다.
9. `20260719000500_eligibility_cutover.sql`과 `tests/integration/eligibility-cutover-upgrade.test.sh`로 정책 이전 private-test row·capability를 제거하고 카탈로그는 보존한다.
10. source verifier가 새 필드를 지우거나 우회를 허용하지 않도록 `scripts/verify-owner-flow.mjs`, `scripts/verify-visitor-response.mjs`, HTTP boundary policy 기대값을 필요한 만큼 보강한다.
11. unit/integration tests에서 신규 create body를 갱신하고 missing·false·coercion·unknown의 무부작용을 검증한다.
12. Playwright helper로 eligibility 확인을 명시적으로 수행하고 owner·visitor·same-pack conversion의 전체 브라우저 흐름을 갱신한다.

## 완료 기준

- 새 owner는 checkbox 확인 전 `POST /api/plays`가 0회이고 첫 질문이 생성되지 않는다.
- 새 visitor는 확인 전 관계·시점 controls와 새 response 생성 CTA에 접근할 수 없다.
- owner·visitor의 확인 항목은 기본 선택되지 않고 exact copy와 하나의 Primary를 사용한다.
- 미해당 선택 뒤 exact 차단 copy가 focus되고 owner/visitor 생성 요청, domain row, cookie, analytics가 0개다.
- 새 owner·visitor 생성의 missing, false, string/number coercion, unknown field는 private no-store 400으로 끝나고 rate-limit/domain/analytics row가 늘지 않는다.
- true인 정상 요청은 기존 owner 10장, visitor 3장, 비교, same-pack owner 전환을 완료한다.
- 기존 유효 owner·visitor capability resume은 eligibility를 다시 요구하지 않는다.
- malformed·expired capability는 resource 존재나 연령 상태를 드러내지 않는 기존 generic terminal로 수렴한다.
- policy cutover upgrade test 뒤 정책 이전 play·answer·link·response·assignment·analytics·rate-limit row는 0이고 발행 질문팩 4종은 유지된다.
- `/`의 만 19세 안내와 `/privacy`의 미성년자 정책·문의 준비 상태가 정확히 표시되며, 실제 문의 채널 전에는 production 모집이 차단된다.
- exact copy와 state table이 product policy와 mobile UI SSOT에 동일하다.
- 320×800, 390×844, 430×932에서 keyboard, 44px target, no horizontal overflow, reduced motion 조건을 만족한다.
- focused verification과 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `./scripts/task-harness spec-check docs/specs/issue-16.md`
- `pnpm exec prettier --check` on changed files
- `pnpm exec eslint` on changed app/lib/test files
- `pnpm exec tsc --noEmit`
- `tests/integration/owner-play-session.test.mjs`: owner와 visitor direct API의 missing·false·coercion·unknown·true create, valid resume, same-pack source, cookie/rate-limit/analytics counts. 이 파일은 이미 `scripts/ai-verify`에서 실행된다.
- `tests/integration/eligibility-cutover-upgrade.test.sh`: `20260719000400` legacy fixture에 play·answer·link·response·assignment·analytics·rate-limit을 넣고 migration 적용 뒤 도메인 row 0과 발행 pack 보존을 검증한다. `scripts/ai-verify`의 shell syntax gate와 순차 integration 실행 목록에 등록한다.
- unit: owner and visitor client exact body, single-flight key, strict schema unknown/coercion rejection
- Playwright: `/`·`/privacy` copy/link, owner confirm/blocked/retry/resume, visitor confirm/blocked/relationship, same-pack conversion, 320/390/430 responsive and keyboard focus
- `python3 scripts/verify_project.py`
- `./scripts/run-ai-verify --mode full`

전체 검증은 독립 QA가 최종 SHA를 승인한 뒤 한 번 실행하고 PR·merge 단계는 그 exact-SHA 성공 marker를 재사용한다.

## 분석과 관측성

- 새 analytics event, dashboard, KPI property를 추가하지 않는다.
- 확인·미해당·추정 연령·지역·입력 문구를 application log에 남기지 않는다.
- 기존 `pack_opened`, `visitor_response_started`, `relationship_selected` 등은 domain row가 실제로 생성된 뒤에만 현재 의미로 기록된다.
- 미확인·미해당 요청을 별도 카운트하지 않는다. 서버 안전성은 request rejection과 DB side-effect integration test로 증명한다.

## 개인정보와 악용 방지

- exact boolean true는 나이 값이 아니라 현재 경계를 통과했다는 일회성 assertion이다.
- DOB, ID, phone, guardian data, IP geolocation을 수집하거나 전송하지 않는다.
- blocked user에 대한 cookie, relationship, answer, owner notification, product analytics를 금지한다.
- owner와 링크 공유자에게 특정 방문자의 차단 사실을 노출하지 않는다.
- client-only UI는 우회 가능하므로 서버 create branch의 exact enforcement가 보안 경계다.
- valid capability resume과 invalid capability terminal을 동일한 generic privacy 규칙 아래 유지한다.

## 롤아웃과 복구

- feature flag 없이 private MVP 기본 경계로 배포한다. production beta 활성화는 법률 검토, #7, privacy contact/runbook 완료 전까지 차단된다.
- 배포 write를 잠시 중지하고 `20260719000500_eligibility_cutover.sql`을 먼저 적용해 도메인 row 0과 발행 pack 보존을 확인한 뒤 새 앱을 연다. 이 순서로 정책 이전 capability의 자동 grandfathering을 막는다.
- API 변경은 fail-closed다. 구버전 client의 새 create 요청은 필드가 없어 400이 되며 도메인 데이터는 생성되지 않는다.
- rollback은 PR 전체 revert다. rollback 동안 production 모집을 재개하지 않고 private test만 중지한다.
- cutover 삭제는 되돌리지 않는다. 앱 rollback은 가능하지만 private test를 중지하고 이전 client로 새 데이터를 만들지 않는다.

## 스펙 검토

Reviewer Agent: issue16_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- owner cookie 부재 검사는 새 생성 전에 UI를 고르는 최적화일 뿐 authorization이 아니다. cookie가 있으면 malformed를 포함해 기존 API가 판정하며 실제 resume/create 권한 판정은 API와 DB RPC가 유지한다.
- syntactically valid하지만 만료된 owner cookie는 eligibility를 건너뛴 뒤 기존 terminal로 끝난다. 사용자가 세션을 지우고 새 팩을 고르면 eligibility부터 다시 시작한다.
- visitor는 eligibility 전에 public invite metadata를 읽지만 owner 답·관계·response row는 읽거나 만들지 않는다.
- product SSOT로 해결되지 않은 P0/P1 미결정 사항은 없다.
