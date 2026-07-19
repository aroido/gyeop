# Issue 80 구현 스펙: [콘텐츠] 공식 질문팩 4종 제목을 관계형 시리즈로 개선

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/80

## 목표

비공개 MVP 공식 팩 4종의 제목을 `상대가 보는 나`라는 GYEOP의 핵심 보상이 한눈에 읽히는 관계형 문장 시리즈로 교체하고, 홈 선택부터 공유·비교·동일 팩 시작·프로필까지 같은 제목을 일관되게 사용한다.

## 범위

- [ ] 공식 팩의 사용자 노출 제목을 아래 exact 값으로 변경한다.
  - `old-friend`: `오래 본 너에게 나는?`
  - `first-impression`: `처음 만난 너에게 나는?`
  - `coworker`: `같이 일한 너에게 나는?`
  - `honest-self`: `가까운 너에게 나는?`
- [ ] 제목 원본은 기존 versioned manifest 4개로 유지하고, 결정적 생성물인 `supabase/seed.sql`을 새 제목으로 다시 만든다.
- [ ] 이미 `20260718001200_multi_pack_catalog.sql`이 적용된 DB의 `pack_templates.title`을 새 제목으로 바꾸는 forward-only migration을 추가한다. 과거 migration은 수정하지 않는다.
- [ ] 홈, 주인 시작·진행·완료, 공유 metadata, 방문자 진입·비교, 같은 팩 시작, 프로필의 runtime fallback과 테스트 fixture를 새 제목으로 갱신한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/full-product-plan.md`, `docs/product/decision-log.md`에 현재 공식 제목을 반영하고, 제목 변경으로 달라지는 `old-friend-v1` manifest SHA-256을 `docs/product/question-pack-spec.md` 구현 추적에 갱신한다. 동결 카드 표는 유지한다. 과거 이슈 스펙은 당시 결정의 기록으로 유지한다.
- [ ] 기존 카드 40장의 id·순서·주인/방문자 질문·A/B 선택지·Signature와 presentation metadata가 바뀌지 않았음을 catalog/test gate로 검증한다.

## 팩 콘텐츠 계약

| slug               | 새 제목                  | 관계              | 분위기         | 민감도 | 기본 공유 | 제목이 약속하는 관점                |
| ------------------ | ------------------------ | ----------------- | -------------- | ------ | --------- | ----------------------------------- |
| `old-friend`       | `오래 본 너에게 나는?`   | 오래된 친구       | 따뜻한 회상    | 낮음   | 공개      | 오래 지켜본 친구에게 비친 현재의 나 |
| `first-impression` | `처음 만난 너에게 나는?` | 새로 알게 된 사이 | 가벼운 첫 만남 | 낮음   | 공개      | 첫 만남에서 상대에게 보인 나        |
| `coworker`         | `같이 일한 너에게 나는?` | 직장 동료         | 담백한 관찰    | 낮음   | 공개      | 함께 일한 동료가 관찰한 업무 속 나  |
| `honest-self`      | `가까운 너에게 나는?`    | 가까운 사이       | 차분한 솔직함  | 중간   | 1:1       | 가까운 관계에서만 드러나는 나       |

- [ ] 네 제목은 정답, 친밀도, 점수, 우열을 암시하지 않고 모두 `상대의 관점`을 묻는다.
- [ ] 제목은 팩 분류명 뒤에 `팩`을 붙이지 않으며, 320px 홈 카드에서 의미 단위로 최대 두 줄 안에 읽히게 기존 스타일을 유지한다.
- [ ] 질문·선택지·Signature를 수정하지 않으므로 15장 후보 재선정이나 팩 version 증가는 하지 않는다. 표시 제목은 template metadata이며 기존 응답 해석 계약은 유지한다.

## 제외 범위

- [ ] pack slug, version, template/version/card UUID, card id 변경은 하지 않는다.
- [ ] 질문·선택지·Signature·관계·민감도·분위기·기본 공유 권장값을 변경하지 않는다.
- [ ] 새 팩, 썸·연애팩, 사용자 팩 제작, AI 질문/제목 생성을 추가하지 않는다.
- [ ] 화면 구조, 레이아웃, 색상, 애니메이션, CTA 계층을 변경하지 않는다.
- [ ] 로그인·계정 귀속·공개 beta 승인 범위를 열지 않는다.
- [ ] `docs/specs/issue-77.md` 등 병합된 과거 이슈 스펙의 당시 exact title을 소급 수정하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md` §5.2
- `docs/product/question-pack-spec.md` §2, §4, §11
- `docs/product/decision-log.md`
- `docs/product/full-product-plan.md` §6.2
- `content/packs/*-v1.json`
- `scripts/verify-pack-catalog.mjs`
- `supabase/config.toml`
- `.codex/AGENTS.md`
- `AGENTS.md`

## 사용자 흐름 영향

- [ ] 주인은 홈에서 상대 관계에 맞는 제목을 보고 팩을 고른 뒤 기존과 동일한 10장 응답을 시작한다.
- [ ] 공유 title/text는 선택한 팩의 새 제목을 사용하고, 방문자는 링크 진입·3장 제출·비교에서 같은 제목을 본다.
- [ ] 방문자의 Primary CTA `나도 이 팩으로 시작하기`는 기존 slug를 그대로 전달하며 새 주인의 bootstrap에서도 같은 새 제목을 표시한다.
- [ ] 주인의 `/me` 프로필과 재공유 흐름은 저장된 slug/version을 유지하고 현재 template title만 새 값으로 보여준다.

## 디자인 영향

- [ ] 레이아웃과 시각 토큰은 변경하지 않는다. 새 제목 길이는 각각 공백 포함 11~13자로 기존 카드의 2줄 제목 영역 안에 들어간다.
- [ ] 320/390/430px 홈에서 제목이 카드 경계 밖으로 넘치거나 CTA·metadata를 밀어내지 않는지 기존 home E2E와 스크린샷으로 확인한다.
- [ ] 접근 가능한 링크 이름이 새 제목을 사용하며 기존 키보드 탐색·focus·reduced-motion 동작을 보존한다.

## API와 데이터 영향

- [ ] 공개 API shape, route, auth, capability cookie, RLS와 rate limit은 변경하지 않는다. `title` 필드 값만 바뀐다.
- [ ] 새 migration `20260719000100_pack_titles.sql`은 고정 template UUID와 slug가 모두 맞는 기존 행만 새 제목으로 갱신한다. `20260718001200_multi_pack_catalog.sql` 뒤 migration, seed 순서인 fresh reset에서는 추가 3팩이 존재하고 `old-friend`는 아직 없을 수 있으며, 기존 배포 DB에서는 네 팩 모두 존재할 수 있다. 두 상태를 정상으로 처리한다.
- [ ] migration은 transaction 안에서 `first-impression`, `coworker`, `honest-self`의 exact UUID+slug가 반드시 존재하는지 검증한다. `old-friend`는 부재 또는 exact UUID+slug 한 행만 허용한다. 네 대상 중 동일 UUID의 다른 slug나 동일 slug의 다른 UUID가 하나라도 있으면 갱신 전에 실패시킨다.
- [ ] 존재하는 정확한 대상 3행 또는 4행만 원자 갱신하고 갱신 행 수 및 present exact slug/title 집합을 검증한다. fresh reset의 seed는 이후 `old-friend`를 새 manifest 제목으로 삽입하므로 최종 네 제목이 수렴한다. 동일 migration은 Supabase migration ledger로 한 번만 적용된다.
- [ ] 새 앱이 구 DB와 잠시 겹치는 동안 서버가 반환한 기존 제목도 string schema에는 유효하므로 API 오류를 만들지 않는다. migration 적용 뒤 DB와 새 앱 fallback이 같은 제목으로 수렴한다.
- [ ] 신규 reset에서는 `content/packs/*-v1.json`에서 생성한 `supabase/seed.sql`이 새 제목을 넣는다. 기존 `20260718001200_multi_pack_catalog.sql`은 배포 역사로 남고 새 migration이 그 값을 전진 갱신한다.

## 구현 계획

- [ ] 네 pack manifest의 `title`만 exact 새 값으로 바꾸고 `node scripts/render-pack-seed.mjs` 출력으로 `supabase/seed.sql`을 기계적으로 갱신한다.
- [ ] 새 forward-only migration에서 네 template title을 원자적으로 갱신하고 SQL catalog 테스트에 exact title 집합을 반영한다.
- [ ] `app/play/new/bootstrap.tsx`, `lib/db/internal-rpc.ts`, `lib/visitor-response/visitor-context-core.mjs`, `lib/visitor-response/visitor-responses.ts`의 허용된 fallback/decoder 제목 registry를 갱신한다.
- [ ] home, share, visitor, profile, core live E2E와 unit/integration fixture의 현재 제목 literal을 새 값으로 바꾼다. 과거 문서·과거 migration literal은 제외한다.
- [ ] 활성 제품 SSOT의 공식 팩 목록을 갱신하고 결정 로그 맨 위에 사용자 피드백을 반영한 제목 변경 결정을 추가한다. old-friend manifest의 새 바이트 SHA-256을 `question-pack-spec` 구현 추적에 기록하되 카드 동결 표는 바꾸지 않는다.
- [ ] manifest/seed drift, unit/integration, SQL, home/share/core MVP focused 검증을 묶어 실행한 뒤 최종 clean commit에서 full verify를 한 번 실행한다.

## 완료 기준

- [ ] 홈에 네 exact 새 제목이 표시되고 각 카드는 기존 slug의 주인 10장 흐름을 연다.
- [ ] 네 팩 각각 manifest·fresh seed·forward migration 결과·runtime fallback의 제목이 일치한다.
- [ ] `question-pack-spec`의 old-friend manifest SHA-256이 변경된 manifest 바이트와 일치하고 동결 카드 표는 기존 10장과 동일하다.
- [ ] 기존 published template 4행은 UUID/slug/version/active 상태를 유지한 채 title만 변경된다.
- [ ] 공유 metadata와 Web Share/복사 문구가 선택한 팩의 새 제목을 사용한다.
- [ ] 방문자 3장 비교와 `나도 이 팩으로 시작하기` 뒤 bootstrap이 같은 팩의 새 제목을 사용한다.
- [ ] `/me` 프로필과 재공유가 저장된 기존 play를 깨지 않고 새 제목을 표시한다.
- [ ] 카드 40장, Signature 4장, 관계·민감도·기본 공유 권장값과 analytics slug/version 식별자가 변경되지 않는다.
- [ ] 320/390/430px 홈에서 제목이 최대 두 줄 안에 읽히고 가로 overflow가 없다.
- [ ] targeted 검증과 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- [ ] `node scripts/verify-pack-catalog.mjs`
- [ ] `node --test tests/unit/pack-catalog.test.mjs tests/unit/share-links.test.mjs tests/unit/visitor-response.test.mjs tests/unit/owner-profile.test.mjs`
- [ ] DB 상태와 test server port를 공유하는 통합 테스트는 병렬로 묶지 않고 아래 순서로 각각 독립 실행한다.
  - `node --test tests/integration/pack-catalog.test.mjs`
  - `node --test tests/integration/pack-runtime.test.mjs`
  - `node --test tests/integration/owner-play-session.test.mjs`
- [ ] `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/share-links.spec.ts tests/e2e/visitor-response.spec.ts`
- [ ] `supabase test db supabase/tests/pack_catalog.test.sql` 또는 repo full verify에 포함된 동일 pgTAP gate
- [ ] fresh pre-seed reset에서 추가 3팩만 존재하는 migration 상태와, 네 팩이 존재하는 기존 배포 상태를 각각 재현해 정상 갱신을 확인한다. 동일 slug/다른 UUID와 동일 UUID/다른 slug fixture는 transaction rollback을 확인한다.
- [ ] `pnpm exec playwright test tests/e2e/core-mvp-live.spec.ts`로 DB reset 이후 추가 팩 owner→share→visitor→same-pack 흐름 확인
- [ ] 320/390/430px home screenshot 또는 기존 viewport assertion으로 제목 wrapping/overflow 확인
- [ ] 최종 clean commit에서 `./scripts/run-ai-verify --mode full` 한 번 실행

## 분석과 관측성

- [ ] 이벤트 이름과 payload는 바꾸지 않는다. funnel은 안정된 `packVersion`으로 계속 구분한다.
- [ ] 제목 문자열을 새 analytics dimension으로 추가하지 않는다.

## 개인정보와 악용 방지

- [ ] 제목은 개인정보나 응답값을 포함하지 않는다.
- [ ] `honest-self`의 중간 민감도와 1:1 기본 권장은 유지한다.
- [ ] 새 제목은 친밀도 점수, 정답 맞히기, 관계 우열을 암시하지 않는다.
- [ ] 익명 방문자, 제출 전 self answer 비공개, secret hash 저장과 집계 경계는 변경하지 않는다.

## 롤아웃과 복구

- [ ] migration을 먼저 적용해 DB title을 갱신한 뒤 앱을 배포한다. 짧은 혼재 구간에도 title은 표시 문자열이므로 기존 API decoder와 저장 데이터는 유효하다.
- [ ] 배포 문제 시 앱을 이전 버전으로 롤백해도 slug/version 계약은 같아 기능은 동작한다. 제목만 일시적으로 DB 신값과 앱 fallback 구값이 섞일 수 있으며 데이터 손실은 없다.
- [ ] 제목 자체를 되돌려야 하면 기존 migration을 수정하지 않고 네 title을 이전 값으로 갱신하는 새 corrective migration을 추가한다.
- [ ] 병합 후 현재 LAN/터널 테스트 서버를 새 main으로 재시작해 실제 홈·공유 경로에서 확인한다.

## 스펙 검토

Reviewer Agent: issue80_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] DB title은 현재 저장 play가 참조하는 template의 표시 metadata이므로 과거 생성된 링크/응답도 새 제목을 보게 된다. 이는 사용자 피드백에 따른 의도된 전체 변경이다.
- [ ] `honest-self`의 제목 `가까운 너에게 나는?`는 연인만을 뜻하지 않도록 홈 관계 label `가까운 사이`와 함께 표시한다.
- [ ] `supabase db reset`은 migration 뒤 seed를 실행하므로 migration 시점의 old-friend 부재는 정상이고, seed 이후 pack catalog pgTAP이 최종 네 제목을 검증한다.
- [ ] 구현 전 제품 결정을 요구하는 미결정 사항은 없다.
