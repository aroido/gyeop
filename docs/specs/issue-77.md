# Issue 77 구현 스펙: [프론트엔드] 검수된 3개 질문팩을 전체 공유 루프에 연결

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/77

## 목표

이미 사람 검수를 거친 질문 30개를 재사용해 질문팩 3개를 추가하고, 기존 팩을 포함한 4개 팩 모두에서 `주인 10장 답변 → 공유 → 방문자 관계 선택과 3장 답변 → 비교 → 같은 팩 새 주인 → 주인 프로필` 핵심 루프가 실제로 동작하게 한다.

## 범위

- [ ] 아래 4개 제목을 팩 매니페스트, 홈, 플레이, 공유, 비교, 프로필 등 사용자 노출 지점에 일관되게 적용한다.
  - `old-friend`: `우리 아직 통할까?`
  - `first-impression`: `나, 첫눈에 어땠어?`
  - `coworker`: `같이 일할 때 나는?`
  - `honest-self`: `가까운 사람만 아는 나`
- [ ] `ffa0f4e:app/play/packs.ts`와 이슈 #54에서 사람 검수된 `first-impression-v1`, `coworker-v1`, `honest-self-v1`의 각 10장 A/B 카드와 Signature 1장을 내용 변경 없이 버전 매니페스트로 옮긴다.
- [ ] `docs/product/core-feature-priority.md`와 `docs/product/decision-log.md`에 기존 단일 팩 결정을 대체하는 결정을 기록한다. 이번 활성화는 공개 베타가 아니라 핵심 루프 재미를 비교하기 위한 비공개 MVP 4팩 검증이며 production beta 승인과 분리한다.
- [ ] 홈에서 네 팩을 모두 활성 상태로 표시하고 각 팩의 관계, 무드, 민감도, 권장 공유 방식, 질문 수, 예상 시간을 보여준다.
- [ ] 팩 선택, 주인 플레이 세션, 완료 후 공유 링크, 방문자 응답/비교, 같은 팩 시작 CTA, 주인 프로필을 팩 slug/version에 따라 동작하도록 일반화한다.
- [ ] 세 팩을 카탈로그 시드에 추가하고 개발/프로덕션 모두 같은 공개 카탈로그를 사용하게 한다.
- [ ] 기존 `old-friend` slug/version/카드 ID/URL/저장 데이터의 호환성을 유지하며 제목만 바꾼다.

## 제외 범위

- [ ] 로그인, 계정 생성, 익명 프로필 계정 귀속 또는 기기 간 복구는 별도 이슈로 남긴다.
- [ ] AI 질문 생성, 사용자 팩 만들기, 선택형 추가 2장, 공개 베타 승인/신고 화면은 구현하지 않는다.
- [ ] 네 팩을 한 계정 프로필에 누적하는 다중 프로필 목록은 구현하지 않는다. 현재 7일 관리 쿠키가 가리키는 주인 플레이 한 건의 프로필만 유지한다.
- [ ] 질문 문구를 새로 창작하거나 기존 검수본의 선택지를 리믹스하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `content/packs/old-friend-v1.json`
- `ffa0f4e:app/play/packs.ts` (추가 3개 팩의 검수된 원문)
- `AGENTS.md`

## 사용자 흐름 영향

- [ ] 첫 사용자는 홈에서 네 팩 중 하나를 선택하고, 선택한 팩의 정확한 10장에 답한 뒤 해당 팩 제목이 표시된 공유 링크를 만든다.
- [ ] 방문자는 링크의 팩과 무관하게 관계/알게 된 시점을 고른 뒤 배정된 3장에 답하고 비교 결과를 본다.
- [ ] 방문자의 `나도 이 팩으로 시작하기`는 초대받은 동일한 팩 slug를 사용한다. 1:1 링크가 소비된 뒤 새로고침해도 응답 세션의 팩 메타데이터로 제목과 CTA를 복구한다.
- [ ] 새 주인은 동일 팩 10장 답변부터 시작하고, 주인 프로필은 그 팩의 카드/제목/통계를 안전하게 해석한다.
- [ ] 다른 팩의 유효한 주인 관리 쿠키가 있으면 기존의 명시적 `새 팩 시작` 복구 동작을 유지하며 묵시적으로 기존 플레이를 덮어쓰지 않는다.

## 디자인 영향

- [ ] 홈 카드의 `…팩` 분류명 대신 공유하고 싶은 궁금증 문장형 제목을 사용한다. Lazyweb의 퀴즈 선택 사례에서 확인한 것처럼 카테고리명보다 사용자가 얻게 될 답을 전면에 둔다.
- [ ] 기존 카드 비주얼을 재사용한다: 오래된 친구는 현재 활성 카드, 첫인상은 파란 카드, 직장 동료는 빨간 카드, 가까운 사람은 검은 카드 계열을 유지한다.
- [ ] 네 카드 모두 `지금 시작` 상태, 상세 메타데이터, 해당 slug의 시작 CTA를 갖는다. 새 화면이나 새 디자인 시스템은 만들지 않는다.
- [ ] 모바일 가로 레일, 키보드 좌우 이동, 접근 가능한 링크/버튼과 현재 reduced-motion 동작을 보존한다.

## API와 데이터 영향

- [ ] 새 forward-only Supabase migration에서 `pack_templates.target_relationship` 허용값을 `old_friend`, `new_connection`, `coworker`, `close_relationship`로 확장한다. 이 값은 팩 대상 관계 메타데이터이며 방문자 관계 레지스트리와 분리한다.
- [ ] 기존 `private.visitor_response_state(uuid)`의 정확한 응답 shape은 변경하지 않는다. 새 sidecar RPC `private.visitor_response_pack_metadata(uuid)`를 추가해 `packSlug`, `packVersion`, `packTitle`만 반환하고, 새 서버가 기존 응답과 조합한다.
- [ ] 새 서버는 sidecar RPC가 아직 없는 구 DB에서는 기존 단일 팩인 `old-friend-v1` 메타데이터로만 엄격하게 fallback한다. 다른 slug/version을 추정하지 않는다. 따라서 `구 앱+신 DB`는 기존 응답 shape로, `신 앱+구 DB`는 old-friend fallback으로 롤링 배포와 롤백이 가능하다.
- [ ] 방문자 응답 HTTP decoder/type에는 서버가 조합한 위 3개 필드를 필수로 추가해 소비된 1:1 초대에서도 응답 세션만으로 UI를 복구한다.
- [ ] `scripts/render-pack-seed.mjs`는 정렬된 네 매니페스트와 고정 UUID 레지스트리로 하나의 결정적 seed를 생성한다. 기존 old-friend template/version UUID는 변경하지 않는다.
- [ ] forward migration 자체가 단일 old-friend 배포 DB를 기준으로 기존 제목을 갱신하고, 새 세 팩의 template/version/card 30장을 고정 UUID로 idempotent 삽입한 뒤 발행·활성화한다. `supabase/seed.sql`은 신규 로컬 reset만 담당하는 유일한 배포 수단으로 취급하지 않는다.
- [ ] `scripts/verify-pack-catalog.mjs`, SQL pgTAP, 데이터 접근/decoder 테스트는 네 팩 각각 정확히 10장, Signature 1장, 고유 순서/ID, 발행 상태를 검증한다.
- [ ] 기존 API route, capability cookie, share secret, RLS, rate limit, cache-control 계약은 바꾸지 않는다.

## 구현 계획

- [ ] `content/packs/`에 검수된 세 JSON 매니페스트를 추가하고 기존 매니페스트 제목을 갱신한다.
- [ ] 팩 프레젠테이션/레이블/공개 pack decoder에 네 팩의 고정 메타데이터를 등록한다.
- [ ] 카탈로그 제약과 방문자 응답 메타데이터를 추가하는 migration을 작성하고 seed 생성기와 `supabase/seed.sql`을 네 팩용으로 갱신한다.
- [ ] 같은 migration에 신규 3팩 데이터 삽입·발행과 기존 팩 제목 갱신을 포함하고, 단일 팩 상태에서 적용했을 때 정확히 네 발행 팩이 되는 pgTAP 회귀를 추가한다.
- [ ] 홈 서버/클라이언트를 단일 old-friend 전용 props에서 활성 팩 요약 배열로 단순화하고 네 CTA가 각 slug를 전달하게 한다.
- [ ] 주인 bootstrap/client, owner play 상태 decoder, share-link 관리 화면, owner profile decoder/type의 old-friend 하드코딩을 네 팩 정적 레지스트리로 치환한다.
- [ ] 방문자 응답 decoder/type과 초대 화면에서 응답의 pack 메타데이터를 사용하고, 비교 완료 CTA를 `response.packSlug`로 만든다.
- [ ] 기존 old-friend 회귀 테스트를 유지하면서 매니페스트/decoder/홈/부트스트랩을 네 팩 파라미터 테스트로 확장한다.

## 완료 기준

- [ ] 홈에 정확한 새 제목의 활성 팩 4개가 보이며 각 카드는 자기 slug로 시작한다.
- [ ] 각 매니페스트는 정확히 10장, Signature 정확히 1장, 중복 없는 ID/position, 서로 다른 A/B 선택지를 가진다.
- [ ] DB reset 뒤 공개 카탈로그가 발행된 네 팩을 반환하고 모든 팩에서 주인 플레이를 만들 수 있다.
- [ ] 최소 한 개 추가 팩의 브라우저 실DB E2E가 주인 10장 완료, 공유 링크 생성, 방문자 3장 제출, 비교, 동일 팩 새 주인 CTA까지 통과한다.
- [ ] 별도의 경량 real-DB 통합 테스트가 네 팩을 모두 순회하며 실제 발행 pack 조회, 주인 10장 완료, 공유 메타데이터/기본 공유 kind, 방문자 3장 배정·제출·비교, 동일 pack slug 메타데이터, 주인 프로필 10장을 검증한다.
- [ ] `honest-self`는 기본 `one_to_one`, OS/복사 공유 제목과 문구는 선택한 `pack.title`, 같은 팩 CTA는 선택한 slug를 사용하는지 명시적으로 검증한다.
- [ ] 소비된 1:1 초대를 응답 쿠키로 재개해도 올바른 팩 제목과 동일 팩 CTA가 나타난다.
- [ ] 각 팩으로 완료한 주인 프로필이 10장과 익명 집계를 해석하며 미표본/3명 미만 비공개 규칙을 유지한다.
- [ ] 기존 old-friend 공개 URL과 저장 play/share/response가 제목 변경 뒤에도 동작한다.

## 테스트 계획

- [ ] `node --test`로 pack catalog, published pack, owner flow/state/profile, visitor response, share metadata 관련 unit/integration 테스트를 집중 실행한다.
- [ ] `supabase db reset` 후 pgTAP 카탈로그/주인/방문자 SQL 테스트를 실행한다.
- [ ] 단일 old-friend DB fixture에 forward migration을 적용해 발행 팩 4개와 카드 40장이 되는 migration 테스트를 실행한다.
- [ ] 네 팩을 순회하는 경량 real-DB 통합 테스트를 실행하고, Playwright는 기존 old-friend live E2E와 추가 팩 1개의 핵심 루프 E2E만 실행한다. 네 팩에 동일한 장시간 브라우저 E2E를 복제하지 않는다.
- [ ] 방문자 메타데이터 조합은 `구 응답 RPC+신 앱 old-friend fallback`, `구 앱 decoder+신 DB 기존 응답 shape`, `신 DB sidecar+신 앱 동적 pack` 세 조합을 테스트한다.
- [ ] 모바일 뷰포트에서 홈 네 카드 제목/활성 상태/CTA slug와 비교 화면 동일 팩 CTA를 확인한다.
- [ ] 최종 clean commit에서만 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 분석과 관측성

- [ ] 기존 이벤트 이름과 payload allowlist를 유지한다. 이미 존재하는 `packVersion`, `linkKind`로 네 팩 퍼널을 구분한다.
- [ ] `same_pack_start_clicked`는 동적 팩 CTA에서도 기존과 동일하게 기록한다.
- [ ] 질문/선택 답변 값, 이름, 자유 텍스트는 analytics에 기록하지 않는다.

## 개인정보와 악용 방지

- [ ] medium 민감도의 `가까운 사람만 아는 나`는 기본 `one_to_one` 권장을 유지한다.
- [ ] 방문자 응답 상태에 추가하는 팩 slug/version/title은 이미 초대 메타데이터에 공개되는 값으로 제한한다.
- [ ] 익명성, 3명 미만 집계 비공개, capability secret 해시 저장, no-store, 만료, 1:1 단일 소비 규칙을 그대로 유지한다.
- [ ] 새로운 자유 입력, 로그인 개인정보, 공개 검색/목록 노출은 추가하지 않는다.

## 롤아웃과 복구

- [ ] 먼저 기존 RPC shape을 보존하는 forward migration을 배포해 세 팩과 sidecar metadata RPC를 추가하고, 이후 새 앱을 배포한다. 앱은 공개 카탈로그에서 발행된 팩만 활성화한다.
- [ ] migration은 기존 행/ID를 삭제하지 않는 forward-only 변경이다. 앱 롤백 시 새 팩은 DB에 남아도 구버전 홈이 old-friend만 조회하고 기존 visitor RPC shape이 유지되므로 안전하다.
- [ ] 신 앱이 구 DB에 먼저 올라가도 sidecar 미존재를 old-friend 전용 fallback으로 처리한다. migration 이후에는 sidecar를 사용하며 fallback 사용 여부는 서버 오류 로그에 secret/답변 없이 기록한다.
- [ ] 문제 팩은 `is_active=false` 또는 발행 상태 해제로 홈에서 비활성화할 수 있고 old-friend는 계속 서비스한다.
- [ ] 병합 뒤 main을 빌드하고 현재 공개 테스트 터널이 새 빌드를 가리키도록 앱 서버를 재시작한다.

## 스펙 검토

Reviewer Agent: issue77_spec_review
Review Status: FAIL
P0/P1 Findings: 4 (제품 SSOT, 배포 DB materialization, 롤링 호환, 4팩 실DB 검증을 반영해 재검토 요청)

## 리스크와 미결정 사항

- [ ] 로그인 없이 프로필을 7일 쿠키에만 연결하는 현재 한계는 의도된 제외 범위이며 후속 이슈가 필요하다.
- [ ] 카드 원문은 과거 검수본을 바이트 단위로 재사용하되 JSON 포맷팅과 새 제목/팩 메타데이터만 변경한다.
- [ ] 공개 베타 승인 없이 4팩을 활성화하는 목적은 현재 비공개 테스트 터널에서 팩별 재미 차이를 비교하는 것으로 제한한다.
- [ ] 구현 전 제품 결정을 요구하는 미결정 사항은 없다.
