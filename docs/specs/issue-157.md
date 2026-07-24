# Issue 157 구현 스펙: P0 상위개념 그래프 기반 24개 질문팩·소유자 프로필·공유 경험 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/157

## 목표

활성 최신 24개 공식 질문팩의 240문항을 새 불변 버전으로 발행하고, 각 문항의 1~2개 상위개념 신호를 기존 임계값을 우회하지 않는 누적 모델에 연결한다. 인증된 소유자는 `/me`에서 고정 유형 대신 실제 장면에서 나온 대화 훅 3~5개를 보고, 안전 기준을 충족한 결 하나를 질문과 같은 팩 초대가 포함된 9:16 카드로 공유할 수 있어야 한다.

이 변경의 제품 결과는 다음 문장으로 확인한다.

> 한 질문의 사실 비교가 여러 팩의 서로 다른 장면에서 반복되는 결로 확장되고, 소유자는 사람 전체를 규정하지 않는 한 문장을 골라 다음 대화를 시작한다.

## 범위

### 1. 활성 제품 계약과 설계 근거

- 원본 탐색안인 `docs/product/concept-graph-design.md`를 활성 Reviewed 문서로 승격한다.
  - 8개 영역과 32개 양방향 결을 `content/concepts-v1.json`과 동일하게 고정한다.
  - 방향, 선명도, 반복, 시선 차이, 상황 의존, 훅 순위, 공유 가능 기준을 이 스펙의 계산식으로 기록한다.
  - 런타임 SSOT는 `content/concepts-v1.json`과 최신 팩 매니페스트이며 TSV는 전수 검수 추적 자료임을 명시한다.
- 원본 작업공간의 아래 자료를 이 작업공간으로 가져와 검토 이력을 보존한다.
  - `docs/product/concept-card-mapping-v0.tsv`: 24팩·240문항·289개 신호
  - `docs/product/concept-card-rewrites-v0.tsv`: 재작성 48문항
- 아래 활성 문서를 같은 변경에서 맞춘다.
  - `docs/product/core-feature-priority.md`
  - `docs/product/question-pack-spec.md`
  - `docs/product/decision-log.md`
  - `docs/product/full-product-plan.md`
  - `docs/product/README.md`
  - `docs/engineering/p0-development-plan.md`
- `p0-development-plan.md`의 기존 관계 카드 중심 `/me`, 1팩 seed/history 설명을
  concept profile 3~5 hooks, owner 선택형 safe share picker, 활성 최신 24개 v2/v3와
  전체 69 version·690 card history 계약으로 동기화한다.
  `scripts/verify_project.py`의 SSOT drift 검사에도 이 문서와 핵심 anchor를 포함한다.
- Lazyweb 리포트의 원문 URL과 적용/비적용 결정을 `docs/design/research/issue-157-lazyweb.md`에 보존한다.
  - 원문: https://www.lazyweb.com/report/lazyweb/e952b275-d0cc-4f09-b0b8-1c8e8769b40d/?source=create
  - 근거 범위: 모바일 참고 36개와 GYEOP 프로토타입 2개를 바탕으로 한 방향성 근거이며, GYEOP의 개인정보 모델과 같은 선행 사례는 아니라는 한계를 함께 기록한다.

### 2. 상위개념 카탈로그

`content/concepts-v1.json`은 정확히 다음 구조를 갖는다.

```ts
type ConceptCatalogV1 = Readonly<{
  version: 1;
  areas: readonly Readonly<{
    id: "rel" | "exp" | "act" | "dec" | "coop" | "reg" | "att" | "pref";
    label: string;
  }>[];
  concepts: readonly Readonly<{
    id: string;
    areaId: ConceptCatalogV1["areas"][number]["id"];
    label: string;
    directionA: string;
    directionB: string;
  }>[];
}>;
```

- 영역은 `관계의 흐름`, `표현과 소통`, `계획과 실행`, `선택과 탐색`, `협업과 돌봄`, `회복과 조절`, `주의와 기억`, `취향과 발견`의 8개다.
- 결은 탐색안에 정의된 `rel.entry`부터 `pref.familiarity`까지 정확히 32개다.
- 모든 결은 한 영역에만 속하고, A/B는 우열이나 점수가 아닌 두 방향이다.
- 카탈로그 decoder는 exact-key, 중복 id, 알 수 없는 영역, 빈/과도한 문구를 거부하고 결과를 동결한다.
- 사용자에게 영역을 유형이나 진단으로 노출하지 않는다. 영역은 카탈로그와 근거 상세의 분류에만 쓴다.

문자열 상한은 `lib/concepts/catalog-core.mjs`가 export하는 아래 exact 상수 하나를 사용한다.

```ts
const CONCEPT_COPY_LIMITS = Object.freeze({
  conceptId: 64,
  context: 40,
  areaLabel: 24,
  conceptLabel: 24,
  directionText: 40,
  observation: 160,
  question: 80,
  evidenceText: 80,
  packTitle: 80,
});
```

- 길이는 JavaScript string length 기준이며 모든 값은 trim 후 1 이상이어야 한다.
- catalog, pack manifest, `ConceptProfile`, `ProfileShareCardModel` strict decoder가
  이 상수를 직접 import한다. 같은 숫자를 다른 파일에 복사하지 않는다.
- 1080×1920 canvas fit 검증도 이 상수의 각 최대 길이 fixture를 사용한다.
  한글 연속 문자열과 공백 없는 Latin 문자열 모두에서 clipping/overflow가 생기면 실패하며,
  상한을 넘는 입력을 font 축소로 억지 수용하지 않고 decoder에서 거부한다.

### 3. 24개 질문팩의 새 불변 버전

공개된 기존 파일은 수정하지 않는다. 현재 최신본을 복제한 뒤 아래 버전을 새로 만든다.

| 팩 | 원본 | 새 버전 |
|---|---|---|
| after-work | after-work-v2 | after-work-v3 |
| algorithm-mirror | algorithm-mirror-v2 | algorithm-mirror-v3 |
| camera-roll | camera-roll-v2 | camera-roll-v3 |
| comment-section | comment-section-v2 | comment-section-v3 |
| compliment-receipt | compliment-receipt-v2 | compliment-receipt-v3 |
| coworker | coworker-v1 | coworker-v2 |
| deadline-mode | deadline-mode-v1 | deadline-mode-v2 |
| decision-spiral | decision-spiral-v2 | decision-spiral-v3 |
| emoji-subtitles | emoji-subtitles-v2 | emoji-subtitles-v3 |
| first-impression | first-impression-v2 | first-impression-v3 |
| friend-fusion | friend-fusion-v2 | friend-fusion-v3 |
| group-chat-role | group-chat-role-v2 | group-chat-role-v3 |
| honest-self | honest-self-v2 | honest-self-v3 |
| laugh-track | laugh-track-v1 | laugh-track-v2 |
| old-friend | old-friend-v2 | old-friend-v3 |
| reply-temperature | reply-temperature-v2 | reply-temperature-v3 |
| room-temperature | room-temperature-v2 | room-temperature-v3 |
| small-luxury | small-luxury-v2 | small-luxury-v3 |
| snack-personality | snack-personality-v2 | snack-personality-v3 |
| social-battery | social-battery-v2 | social-battery-v3 |
| spontaneous-plan | spontaneous-plan-v2 | spontaneous-plan-v3 |
| tiny-routine | tiny-routine-v2 | tiny-routine-v3 |
| trip-chemistry | trip-chemistry-v2 | trip-chemistry-v3 |
| weekend-escape | weekend-escape-v2 | weekend-escape-v3 |

새 매니페스트는 루트에 `conceptVersion: 1`을 추가하고, 각 카드에 다음 exact-key 필드를 추가한다.

```ts
type ConceptSignalV1 = Readonly<{
  conceptId: string;
  directionForOptionA: "a" | "b";
}>;

type ConceptCardFieldsV1 = Readonly<{
  conceptContext: string;
  conceptSignals: readonly [ConceptSignalV1] | readonly [
    ConceptSignalV1,
    ConceptSignalV1,
  ];
}>;
```

- `concept-card-mapping-v0.tsv`의 `concept:A`는 `directionForOptionA: "a"`, `concept:B`는 `"b"`로 옮긴다.
- 한 카드 안에서 같은 `conceptId`를 두 번 쓸 수 없다.
- 240문항 모두 비어 있지 않은 맥락 하나와 1~2개 신호를 가진다.
- `concept-card-rewrites-v0.tsv`는
  `pack, source_version, card_id, owner_prompt, visitor_prompt, option_a, option_b, signals`
  8개 열을 exact-key로 갖고 정확히 48행이어야 한다.
- 48행의 `owner_prompt`, `visitor_prompt`, `option_a`, `option_b`를 각각 새 매니페스트의
  `ownerPrompt`, `visitorPrompt`, `optionA`, `optionB`에 정확히 적용한다.
  `visitor_prompt`는 모두 같은 장면과 두 선택지의 의미를 유지하는 자연스러운 3인칭 관찰 질문이며,
  구현 중 자동 변환하거나 기존 방문자 문구로 대체하지 않는다.
- verifier와 단위 테스트는 48개 `pack + source_version + card_id` join이 모두 하나씩 존재하고,
  TSV 네 문구 필드와 매니페스트 네 문구 필드가 canonical JSON deep equality로 일치함을 전수 검증한다.
  각 rewrite 행의 `signals`도 같은 key의 `concept-card-mapping-v0.tsv.signals`와 순서까지 정확히 같아야 한다.
- 나머지 192문항은 원본 문구와 선택지를 보존하고 신호 필드만 추가한다.
- 카드 id, position, Signature 위치, presentation, sensitivity, target relationship은 원본과 동일하다.
- 새 최신 카탈로그 전체에서 다음 조건을 강제한다.
  - 팩 24개, 카드 240개, 신호 289개, 미매핑 0개
  - 8개 영역, 32개 결
  - 팩당 카드 10개와 Signature 정확히 1개
  - 팩당 최소 4개 영역과 6개 결
  - 같은 결은 한 팩에서 최대 3카드
  - 결마다 최소 6카드·3팩·3맥락
- `conceptContext`는 점수용 taxonomy가 아니라 근거 상세에 그대로 보이는 display tag다.
  v1 allowlist는 `concept-card-mapping-v0.tsv` 240행의 `context` exact string 집합 215개로 고정하고,
  `lib/concepts/catalog-core.mjs`의 `CONCEPT_CONTEXT_V1_ALLOWLIST`와 verifier가 그 집합을 exact match한다.
- runtime은 allowlist에 없는 자유 입력, trim/대소문자/구분점 변형, prefix·상위어 자동 묶음을 허용하지 않는다.
  예를 들어 `여행·준비`와 `여행·변경`은 서로 다른 두 exact context다.
  새로운 taxonomy나 context 추가는 별도 issue에서 manifest/TSV를 검토해 버전 올리며,
  이 issue에서는 새 필드나 대규모 remap을 만들지 않는다.
- `lib/packs/catalog.ts`는 새 버전을 활성 최신본으로 가져오되 모든 이전 버전을 `packManifestHistory`에 남긴다.
- `lib/packs/official-pack-registry.mjs`는 활성 최신 24개만 담는 `OFFICIAL_PACKS`와,
  기존 45개 및 신규 24개를 모두 담는 `OFFICIAL_PACK_HISTORY`를 분리한다.
  `OFFICIAL_PACK_CARD_IDS`는 `OFFICIAL_PACK_HISTORY`에서 생성해
  `slug + "\0" + version` 키 69개와 카드 id 배열 690개를 보존한다.
  owner profile, owner play state, visitor invite decoder는 현재 버전 목록이 아니라 이 이력 registry를 사용한다.
- 현재 version 하나만 허용하는 visitor/metadata decoder는 `slug + version`을 history에서 정확히 찾도록 바꾼다. 새 app은 content pointer 전환 전의 원본 버전과 전환 후의 새 버전을 모두 읽어야 하며, 존재하지 않는 조합은 계속 거부한다.
- `scripts/render-pack-seed.mjs`, `scripts/verify-pack-catalog.mjs`, `tests/unit/pack-catalog.test.mjs`가 새 필드와 69개 전체 버전·690카드의 생성 결과를 검증한다.
- `supabase/seed.sql`은 모든 과거 버전과 새 버전, 즉 24 template·69 version·690 card를 포함하도록
  `scripts/render-pack-seed.mjs`에서 다시 생성한다. 수동으로 별도 seed 경로를 만들지 않는다.

### 4. 의미 식별자와 화면 위치의 분리

저장되는 답은 계속 의미 식별자 `"a" | "b"`다. 화면의 첫 번째/두 번째 버튼 위치는 저장값과 분리한다.

- `lib/packs/choice-order.mjs`에 순수 함수 하나를 둔다.
  - owner는 카드 `position` 1~10을 그대로 global ordinal로 쓴다.
  - visitor required assignment는 `position` 1~3을 global ordinal 1~3으로,
    optional assignment는 `3 + position`으로 계산해 global ordinal 4~5로 쓴다.
  - global ordinal이 홀수면 `a, b`, 짝수면 `b, a` 순서로 렌더한다.
  - 반환 항목은 `{ choice: "a" | "b", label: string }`이므로 클릭 시 화면 위치가 아니라 `choice`를 저장한다.
- required 3문항 뒤 optional 2문항까지 이어지는 fixture의 화면 순서는 정확히
  `a,b / b,a / a,b / b,a / a,b`다. optional stage의 raw `position` 1~2로 홀짝을 다시 시작하지 않는다.
- 한 응답을 다시 열거나 뒤로 이동해도 같은 질문의 화면 순서는 바뀌지 않는다.
- 결과·프로필·DB는 화면 좌우를 해석하지 않고 저장된 의미 식별자만 사용한다.
- `app/play/[playId]/owner-play.tsx`와 `app/i/[publicId]/invite-entry.tsx`가 같은 helper를 사용한다.
- 기존 A/B API payload와 DB choice constraint는 변경하지 않는다.

### 5. DB와 발행 계약

두 개의 forward-only migration을 사용한다.

1. `supabase/migrations/20260724000100_concept_graph.sql`
   - `pack_versions.concept_version smallint`를 nullable로 추가한다.
   - `pack_cards.concept_context text`, `pack_cards.concept_signals jsonb`를 nullable로 추가한다.
   - 과거 발행본은 세 필드가 `null`인 채 그대로 남긴다.
   - `concept_version = 1`인 버전은 발행 시 카드 10개 모두에 유효한 맥락과 1~2개 exact-key 신호가 있어야 한다.
   - 신호의 `conceptId` 형식, `directionForOptionA in ('a','b')`, 카드 안 중복 금지를 `publish_pack_version`에서 검사한다.
   - `concept_version is null`인 과거 버전은 기존 발행 조건을 그대로 적용한다.
   - 기존 `guard_pack_version_immutability`, `guard_pack_card_mutation`, `publish_pack_version` 경계를 낮추지 않는다.
   - `get_published_pack` 응답에는 `conceptContext`와 `conceptSignals`를 넣지 않는다. 질문 결과를 미리 추론하게 하지 않고 기존 공개 API shape를 유지한다.
   - 내부 프로필 집계가 쓰는 기존 `get_owner_profile`의 방문자 집계와 반환 shape도 변경하지 않는다.
   - `list_authenticated_owner_plays` 응답에 기존 `updatedAt`을 보존하면서
     완료 시각인 `completedAt`을 추가한다. draft는 `null`, completed는 ISO timestamp여야 한다.
     concept dedupe만 `completedAt`을 사용하고 기존 목록 정렬 계약은 바꾸지 않는다.
   - `concept_profile_viewed`와 `concept_detail_opened` 분석 이벤트 계약을 추가하되
     concept id, 방향, 답변, 관계는 properties에 기록하지 않는다.
   - authenticated concept event 기록 함수는 owner actor의 source play 소유권을 다시 확인하고,
     `concept_profile_viewed` row의 `owner_play_id`는 non-null, visitor/share-link id는 null,
     properties는 exact `{ "packVersion": <source immutable version> }`일 때만 insert한다.
     event별 check/normalizer는 extra property와 client 제공 packVersion을 거부한다.
2. `supabase/migrations/20260724000200_pack_content_concepts_v1.sql`
   - 새 24개 pack version과 240카드를 insert하고 발행한다.
   - 각 template의 `published_version_id`를 이 스펙의 새 버전으로 이동한다.
   - 기존 version/card row를 update/delete하지 않는다.
   - 전체 migration은 하나의 transaction이다. deterministic UUID insert의 재실행을 위해
     `ON CONFLICT DO NOTHING`은 허용하지만, 충돌 row를 성공으로 간주하지 않는다.
   - insert가 끝난 뒤 어떤 `publish_pack_version` 호출이나 pointer update보다 먼저,
     같은 transaction의 expected values와 DB readback을 비교한다.
     - template: `id, slug, title, target_relationship, sensitivity, is_active`
     - version: `id, template_id, version, concept_version`
     - card: `pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b,
       is_signature, concept_context, concept_signals`
     - 정확히 24 version·각 10장·총 240장이어야 하고 version별 추가/누락 카드가 없어야 한다.
       `concept_signals`는 jsonb canonical deep equality로 비교한다.
   - 위 immutable field 중 하나라도 다르거나 deterministic UUID가 다른 slug/version/card에 이미 쓰였거나,
     24/240가 부분 상태면 `RAISE EXCEPTION`으로 transaction 전체를 abort한다.
   - 새 publish helper는 만들지 않는다. clean 실행은 24 version·240 card readback이 전부 통과한 뒤,
     기존 `public.publish_pack_version(expected_version_id)`을 deterministic manifest 순서로 정확히 24번 호출한다.
     이 함수가 version을 발행하면서 해당 template의 `published_version_id`도 순차 이동한다.
   - 순차 pointer update는 같은 migration transaction 안에 있으므로 다른 transaction에는 중간 상태가 노출되지 않고
     `COMMIT` 시 24개가 한 번에 원자적으로 보인다. 어느 publish 호출이나 후검증이 실패해도 앞선 publish/pointer까지
     transaction 전체가 rollback된다.
   - 호출 뒤 24개 version 모두 `published_at is not null`, 각 template pointer가 expected version,
     `get_published_pack` readback이 expected current manifest인지 확인하고 하나라도 다르면 `RAISE`한다.
   - idempotent 재실행에서는 이미 발행되고 pointer가 expected인 version을 다시 publish하지 않는다.
     unpublished expected version만 같은 기존 함수를 호출하며, published/pointer 상태가 부분적이거나 어긋나면
     성공으로 간주하지 않고 후검증에서 전체 abort한다.

재생성되는 `supabase/seed.sql`도 content migration과 같은 fail-closed 원칙을 더 큰 history 범위에 적용한다.

- 하나의 seed transaction에서 24 template, 69 version, 690 card를 먼저 insert한 뒤
  어떤 `publish_pack_version` 호출보다 먼저 모든 canonical immutable field를 generated expected values와 exact readback한다.
- template/version/card 필드는 위 content migration 목록과 같고, 과거 45 version·450 card의
  `concept_version/concept_context/concept_signals = null`, 신규 24 version·240 card의 concept v1 값까지 비교한다.
- mismatch, 누락/추가, partial history, deterministic UUID conflict는 `RAISE`로 seed 전체를 abort한다.
- clean seed는 readback 뒤 기존 `publish_pack_version()`을 version chronology 순으로 호출해
  commit 시 최종 current 24 pointer가 신규 v2/v3를 가리키게 한다.
  재실행은 이미 발행된 exact row를 검증·재사용하되 최종 69/690 history와 24 pointer를 다시 후검증한다.
- `scripts/render-pack-seed.mjs`가 expected values CTE/readback/RAISE/publish/post-check SQL을 모두 출력하고,
  verifier는 생성된 seed에 이 gate가 없거나 publish가 readback보다 앞서면 실패한다.

DB는 개인정보 임계값을 적용한 기존 play별 입력만 제공하고, 방향·선명도 계산은 `lib/owner-profile/concept-profile-core.mjs` 한 곳에서 수행한다. 같은 계산을 SQL과 TypeScript에 중복 구현하지 않는다.

DB와 런타임 매니페스트의 일치는 다음으로 증명한다.

- seed/migration의 `concept_version`, `concept_context`, `concept_signals`는 같은 매니페스트에서 생성한다.
- DB 테스트는 새 최신 24버전의 240행이 매니페스트와 canonical JSON deep equality로 일치하는지 확인한다.
- 과거 45버전·450카드의 content column이 `null`이고 기존 문구·version id·published_at이 변하지 않았음을 확인한다.
- clean DB 최초 실행, 같은 migration 재실행, expected version UUID에 충돌하는 다른 canonical field를
  미리 넣은 상태를 각각 테스트한다. 최초/재실행은 같은 24/240 readback과 pointer를 만들고,
  conflicting deterministic UUID와 partial row fixture는 publish/pointer 전 전체 abort해야 한다.

response/card 중복 제거의 소유권은 DB/RPC에만 둔다.

- `visitor_assignments`와 `visitor_answers`의 기존 primary key `(response_id, card_id)`,
  assignment의 unique `(response_id, pack_version_id, card_id)`,
  response→assignment→answer의 exact `pack_version_id + card_id` foreign key/join을 유지한다.
- `get_owner_profile`/`get_authenticated_owner_profile` SQL은 submitted response를 위 exact key로 join하고,
  합법적인 response/card 한 쌍을 한 번만 A/B 집계에 반영한다.
- concept builder는 이미 집계 완료된 `OwnerProfile.relationshipLayers[].cards[].counts`만 받으며
  response id를 받거나 중복을 감지·제거하지 않는다.
- 동일 submit의 idempotent retry와 같은 answer API 중복 시도는 기존 row를 갱신/재사용할 뿐
  assignment·answer row 수나 owner profile 집계 기여 수를 늘리지 않아야 한다.

### 6. 안전한 집계 입력

`lib/owner-profile/concept-profile-core.mjs`는 인증 계정의 완료 play 목록과 기존
`get_authenticated_owner_profile` 결과만 입력으로 받는다. 기존 decision-log의
owner-only 프로필, 관계 3명·관계/카드 3표본, `romantic` 공유 제외, 기존 public pack 링크 재사용 결정을
그대로 보존하며 아래 두 others 투영을 명시적으로 분리한다.

- self 입력:
  - 완료된 owner play의 10개 `selfChoice`
  - 해당 `packVersion + cardId`와 일치하는 로컬 매니페스트의 `conceptContext`, `conceptSignals`
- `privateOthers` 입력:
  - owner-only `/me`에만 쓰며 `relationshipLayers`의 8개 관계
    `old_friend|school_friend|coworker|romantic|family|online_friend|social_follower|other`를 대상으로 한다.
  - 관계 `status = "available"`이고 관계 카드 `status = "available"`인 threshold-safe A/B 수만 사용한다.
    따라서 기준을 통과한 `romantic`도 owner의 비공개 프로필에는 포함될 수 있다.
- `shareSafeOthers` 입력:
  - 같은 `relationshipLayers`에서 기존 `isProfileShareRelationship()`가 허용하는
    `old_friend|school_friend|coworker|family|online_friend|social_follower|other`만 사용하고
    `romantic`은 무조건 제외한다.
  - 각 관계 3명 이상 및 관계·카드 3표본 이상을 각각 통과한 available 카드만 사용한다.
  - `privateOthers`에서 계산된 합계를 사후 필터링하지 않고, 허용 관계 layer 원본에서 별도로 다시 계산한다.
- 두 투영 모두 같은 `playId + packVersion + cardId`의 허용 관계별 counts를 먼저 합친 뒤
  해당 카드를 한 번만 정규화한다. builder는 response id를 보지 않으며,
  DB/RPC가 반환한 카드별 aggregate를 관계 수만큼 별도 근거로 세지 않는다.
- `relationshipLayers.status = "collecting"` 또는 관계 카드 `status = "collecting"`의 선택 수는
  어느 투영에도 넣지 않는다.
- DB에는 `invalid` visitor status를 새로 만들지 않는다. schema/RPC/strict decoder를 통과하지 못한 요청과 불완전한 assignment/answer 조합이 issue의 `invalid`에 해당하며, 제출 전 거부되어 집계 입력이 되지 않는다.
- 기존 `/me` account loader 계약을 먼저 그대로 수행한다.
  `listAuthenticatedOwnerPlays()`의 draft/completed 전체를 strict-decode하고,
  모든 completed play를 기존 `getAuthenticatedOwnerAccountProfiles()`로 읽은 뒤
  전체 `plays + profiles`를 `buildAccountOwnerProfile()`에 전달한다.
  과거 v1/v2와 같은 slug 반복 완료 play도 기존 `plays`, self layer, relationship layer,
  detail/count에서 제거하거나 합치지 않는다.
- concept 계산은 위 과정에서 이미 읽은 completed summary/profile pair만 재사용한다.
  추가 profile RPC를 호출하지 않고, `status = completed`, `completedAt != null`,
  history manifest의 `conceptVersion = 1`인 pair만 concept candidate로 남긴다.
- concept candidate 안에서 같은 slug를 `completedAt DESC, playId ASC`로 정렬한 첫 pair 하나로 dedupe한다.
  active 공식 slug가 24개이므로 concept model 입력만 최대 24 pair다.
  `updatedAt`은 concept dedupe에 절대 사용하지 않는다.
- 동일 `completedAt`이면 UUID 문자열의 오름차순 `playId`를 선택한다.
  share-link 생성·재공유, visitor 제출 도착, nickname 변경처럼 `updated_at`만 바뀌는 작업은
  선택된 concept source pair를 바꾸지 않아야 한다.
- API와 `/me` 서버 렌더는 같은 `selectConceptProfileSourcePairs()` 순수 helper를 사용하되,
  그 결과를 기존 account profile의 play/layer/count를 만드는 입력으로 역사용하지 않는다.
- 다른 pack version의 card id가 같아도 `packVersion`이 매니페스트와 정확히 맞지 않으면 사용하지 않는다.
- `conceptVersion !== 1`인 과거 매니페스트와 해당 play는 기존 프로필에는 남지만 상위개념 근거에는 포함하지 않는다.

### 7. 방향 정규화

내부 계산에서 결의 A 방향을 `+1`, B 방향을 `-1`로 둔다. 숫자는 API나 UI에 노출하지 않는다.

#### self 카드 점수

```text
directionForOptionA = a:
  selfChoice a => +1
  selfChoice b => -1

directionForOptionA = b:
  selfChoice a => -1
  selfChoice b => +1
```

#### private/share-safe others 카드 점수

`privateOthers`와 `shareSafeOthers`의 별도 threshold-safe counts를 각각 결 방향으로 뒤집은 뒤
카드 하나를 최대 가중치 1로 정규화한다.

```text
directionACount = option A가 결 A 방향이면 counts.a, 아니면 counts.b
directionBCount = option A가 결 A 방향이면 counts.b, 아니면 counts.a
cardScore = (directionACount - directionBCount) / (directionACount + directionBCount)
```

- 표본 3명과 300명의 카드 모두 `cardScore` 범위는 `-1..+1`이므로 한 장면이 무한 가중되지 않는다.
- 같은 결이 한 팩에서 여러 카드에 연결되면 먼저 팩 안 카드 점수의 평균을 낸다.
- 결의 최종 `directionScore`는 팩별 평균의 산술평균이다. 카드가 많은 팩도 한 팩의 가중치만 가진다.
- `directionScore >= 0.25`는 A 방향, `<= -0.25`는 B 방향, 그 사이는 `아직 한쪽으로 모이지 않음`이다.
- 이 임계값은 상수로 한 파일에 두고 단위 테스트로 고정한다.

### 8. 선명도와 상황 의존

방향과 별개로 source별 고유 근거 수를 센다.

```ts
type ConceptStage = "trace" | "outline" | "clear";

trace:
  distinctCards >= 1

outline:
  distinctCards >= 3
  distinctPacks >= 2
  distinctContexts >= 2

clear:
  distinctCards >= 6
  distinctPacks >= 3
  distinctContexts >= 3
```

- 화면 문구는 각각 `흔적`, `윤곽`, `선명`이다.
- 같은 카드의 방문자 수가 늘어도 distinctCards, distinctPacks, distinctContexts는 늘지 않는다.
- 결 집계가 쓰는 고유 카드 키는 한 helper에서 정확히
  `packSlug + "\0" + packVersion + "\0" + cardId`로 만든다.
  clarity/stage, contextual의 A/B 양쪽 생존 조건, evidence count와 모든 dedupe가 이 키를 공유한다.
- 같은 `cardId`라도 pack slug 또는 version이 다르면 서로 다른 카드다.
  반대로 concept source 선택 전에 같은 slug의 반복 play를
  `completedAt DESC, playId ASC`로 하나만 남기므로 같은 slug/version/card가 반복 완료 play 때문에
  distinct card나 evidence에 두 번 들어가지 않는다.
- `outline`, `clear` 조건을 동시에 만족하면 더 높은 단계만 쓴다.
- 근거가 없으면 source 자체가 `locked`이며 단계나 방향을 반환하지 않는다.

상황 의존은 가운데 점수와 구분한다. context evidence의 distinct 기준은 정규화한 상위어가 아니라
manifest `conceptContext` 전체 exact string이다.

- 같은 source에서 A를 지지하는 카드 점수 `>= 0.25`가
  2개 distinct card·2개 distinct pack·2개 distinct exact context 이상이어야 한다.
- B를 지지하는 카드 점수 `<= -0.25`도 독립적으로
  2개 distinct card·2개 distinct pack·2개 distinct exact context 이상이어야 한다.
- 즉 상반된 두 방향이 각각 pack-stage 반복 기준을 충족하고 source stage가 `outline` 이상이어야 한다.
- 이 조건을 모두 만족하면 방향 대신 `contextual`과 문구 `상황에 따라 양쪽 모습이 또렷함`을 쓴다.
- 조건을 못 채운 중앙값은 `상황 의존`으로 올리지 않고 `아직 한쪽으로 모이지 않음`으로 둔다.

### 9. 대화 훅 선정

`ConceptProfile`은 32개 동일 막대를 반환하지 않고 중복 없는 결 3~5개만 반환한다.

```ts
type ConceptHookKind = "difference" | "contextual" | "repeated" | "emerging";
type ConceptHookBasis = "self" | "others" | "both";
type ConceptDirection = "a" | "b" | "contextual" | "unsettled";

type ConceptEvidenceSummary = Readonly<{
  cardCount: number;
  packCount: number;
  contextCount: number;
  packs: readonly Readonly<{
    packSlug: string;
    packTitle: string;
    contexts: readonly string[];
  }>[];
}>;

type ConceptSourceSummary =
  | Readonly<{ status: "locked"; sightCount: 0 | 1 | 2 }>
  | Readonly<{
      status: "available";
      stage: ConceptStage;
      direction: ConceptDirection;
      directionText: string;
      evidence: ConceptEvidenceSummary;
    }>;

type SelfProfileEvidence = Readonly<{
  source: "self";
  evidence: ConceptEvidenceSummary;
}>;
type PrivateOthersProfileEvidence = Readonly<{
  source: "privateOthers";
  evidence: ConceptEvidenceSummary;
}>;
type ConceptProfileEvidence =
  | readonly [SelfProfileEvidence]
  | readonly [PrivateOthersProfileEvidence]
  | readonly [SelfProfileEvidence, PrivateOthersProfileEvidence];

type ConceptShareEvidence =
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "available";
      source: "shareSafeOthers";
      stage: "outline" | "clear";
      direction: "a" | "b" | "contextual";
      directionText: string;
      observation: string;
      question: string;
      evidence: ConceptEvidenceSummary;
    }>;

type ConceptHook = Readonly<{
  conceptId: string;
  conceptLabel: string;
  areaLabel: string;
  kind: ConceptHookKind;
  basis: ConceptHookBasis;
  stage: ConceptStage;
  observation: string;
  question: string;
  self: Exclude<ConceptSourceSummary, { status: "locked" }>;
  privateOthers: ConceptSourceSummary;
  shareSafeOthers: ConceptSourceSummary;
  profileEvidence: ConceptProfileEvidence;
  shareEvidence: ConceptShareEvidence;
  shareEligible: boolean;
  profileSourcePlayId: string;
  profileSourcePackSlug: string;
  profileSourcePackTitle: string;
  shareSourcePlayId: string | null;
  shareSourcePackSlug: string | null;
  shareSourcePackTitle: string | null;
}>;

type ConceptShareOption = Readonly<{
  conceptId: string;
  safeCopy: string;
  safeQuestion: string;
  shareEvidence: Exclude<ConceptShareEvidence, { status: "unavailable" }>;
  sourcePlayId: string;
}>;

type ConceptProfile = Readonly<{
  modelVersion: 1;
  hooks:
    | readonly []
    | readonly [ConceptHook, ConceptHook, ConceptHook]
    | readonly [ConceptHook, ConceptHook, ConceptHook, ConceptHook]
    | readonly [
        ConceptHook,
        ConceptHook,
        ConceptHook,
        ConceptHook,
        ConceptHook,
      ];
  shareOptions: readonly ConceptShareOption[];
}>;
```

`directionText`는 임의 생성 문장이 아니라 카탈로그와 고정값에서만 도출한다.

- `a` → 해당 concept의 `directionA`
- `b` → 해당 concept의 `directionB`
- `contextual` → `상황에 따라 양쪽 모습`
- `unsettled` → `아직 한쪽으로 모이지 않음`

훅 자격, `basis`, `observation`, `question`은 다음 고정 규칙을 따른다.

1. `difference`
   - self와 `privateOthers`가 모두 `outline` 이상이다.
   - 두 source가 각각 A 또는 B 방향이며 서로 반대다.
   - `basis = "both"`
   - observation:
     `나는 “{self.directionText}” 쪽인데, 주변 시선은 “{privateOthers.directionText}” 쪽이에요.`
   - question: `너는 내가 어떤 장면에서 그렇게 보였어?`
2. `contextual`
   - self 또는 `privateOthers`가 이 스펙의 상황 의존 조건을 만족한다.
   - 둘 다 contextual이면 `basis = "both"`와
     `나와 주변 모두 {conceptLabel}이 상황에 따라 양쪽으로 또렷해요.`
   - self만 contextual이면 `basis = "self"`와
     `내 선택에서는 {conceptLabel}이 상황에 따라 양쪽으로 또렷해요.`
   - `privateOthers`만 contextual이면 `basis = "others"`와
     `주변 시선에서는 {conceptLabel}이 상황에 따라 양쪽으로 또렷해요.`
   - question: `너는 언제 반대쪽 모습이 나와?`
3. `repeated`
   - self가 `outline` 이상이고 A/B 방향 중 하나다.
   - `abs(directionScore) >= 0.5`이며 2팩·2맥락 이상이다.
   - `basis = "self"`
   - observation: `여러 장면에서 “{self.directionText}” 쪽이 반복됐어요.`
   - question: `너도 이런 장면에서는 같은 쪽이야?`
4. `emerging`
   - self 근거가 1개 이상인 나머지 결이다.
   - `basis = "self"`
   - A/B 방향 observation:
     `최근 장면에서 “{self.directionText}” 쪽의 흔적이 보이기 시작했어요.`
   - contextual이 아닌 중앙 observation:
     `최근 장면에서 서로 다른 모습이 함께 보이기 시작했어요.`
   - question: `너는 이런 상황에서 어느 쪽을 고를 것 같아?`

선정은 `difference → contextual → repeated → emerging` 순서로 종류별 최상위 하나를 먼저 선택하고, 남는 자리를 아직 선택하지 않은 `repeated`, `emerging`으로 채운다.

- 같은 concept는 한 번만 쓴다.
- hook stage는 `basis = self`면 `self.stage`, `basis = others`면 `privateOthers.stage`,
  `basis = both`면 `trace < outline < clear` 순서에서 두 source의 낮은 단계다.
  두 source의 카드/팩/맥락 수를 더해 stage나 evidence count를 만들지 않는다.
- candidate의 전체 rank는 kind 우선순위 `difference → contextual → repeated → emerging`,
  높은 hook stage, profileEvidence source별 최대 packCount, source별 최대 contextCount,
  catalog의 canonical concept 순서 순이다.
- self 근거가 있는 결이 3개 이상이면 정확히 3~5개를 반환한다.
- 새 버전 팩 하나는 최소 6개 결을 가지므로 완료 play가 하나라도 있으면 최소 3개 훅을 만들 수 있다.
- `profileEvidence`는 `basis = self`면 self 한 항목, `basis = others`면 privateOthers 한 항목,
  `basis = both`면 self·privateOthers 순서의 두 항목만 가진다. 각 evidence의 pack은
  `packSlug ASC`, context는 Unicode 문자열 오름차순으로 정렬하고 API에는 slug/title과
  중복 제거된 context만 반환한다.
- `profileSourcePlayId`는 `profileEvidence`에 기여한 deduplicated play 가운데
  `completedAt DESC, playId ASC` 첫 항목이며 slug/title은 그 play의 매니페스트와 정확히 일치해야 한다.

`shareSafeOthers`와 `shareEvidence`는 final hook 3~5개를 선정하기 전에
self 근거가 있는 모든 concept candidate에 대해 계산한다.

- `shareSafeOthers.status = available`, stage가 `outline|clear`, direction이
  `a|b|contextual`일 때만 `shareEvidence.status = available`이다.
- A/B observation은
  `주변 시선에서는 여러 장면에서 “{shareSafeOthers.directionText}” 쪽이 반복됐어요.`,
  question은 `너는 내가 어떤 장면에서 그렇게 보였어?`로 고정한다.
- contextual observation은
  `주변 시선에서는 {conceptLabel}이 상황에 따라 양쪽으로 또렷해요.`,
  question은 `너는 언제 반대쪽 모습이 나와?`로 고정한다.
- evidence는 `shareSafeOthers.evidence`와 canonical deep equality여야 한다.
- source play는 share-safe 근거에 실제 기여한 deduplicated play 가운데
  `completedAt DESC, playId ASC` 첫 항목이다. 기존 public invite를 재사용하거나 같은 play에서 새 public invite를
  만들 수 있어야 하며, hook top-level `shareSourcePlayId/shareSourcePackSlug/shareSourcePackTitle`은
  해당 play와 매니페스트에 일치해야 한다.
- 이 조건을 하나라도 못 채우면 `{ status: "unavailable" }`과 top-level share source 세 필드 `null`을 반환한다.
- `shareEligible`은 오직 `shareEvidence.status === "available"`일 때만 `true`다.
  available이면 top-level share source 세 필드는 non-null이어야 한다.
  self-only 공유, romantic-only 근거 공유, `trace`, `unsettled`, collecting 근거 공유는 금지한다.
- owner-only `privateOthers`에 romantic 근거가 포함되어 difference/contextual 훅이 보이더라도,
  독립적인 비-romantic `shareSafeOthers`가 위 조건을 만족하지 않으면 공유할 수 없다.

`shareOptions`는 final hooks와 별개로 전체 candidate의 모든 share-eligible concept에서 만든다.

- 전체 rank comparator로 stable 정렬하고 concept id 중복 없이 최대 32개를 반환한다.
- option exact keys는 `conceptId`, `safeCopy`, `safeQuestion`, `shareEvidence`, `sourcePlayId`뿐이다.
  `safeCopy/safeQuestion`은 해당 available `shareEvidence.observation/question`과 exact equality이고,
  `sourcePlayId`는 share-safe 근거의 authorized source play다.
- `privateOthers`, romantic layer, self-only evidence, raw count/answer/relationship, profile observation은
  option에 넣지 않는다. romantic-only·self-only·trace·unsettled candidate는 option을 만들지 않는다.
- 전체 share-eligible candidate가 없으면 빈 배열, 있으면 누락 없이 모두 포함한다.
  final hooks 3~5 밖의 eligible concept도 선택권에 남는다.
- strict decoder는 길이 `0..32`, stable rank, concept uniqueness, catalog copy,
  available shareEvidence deep equality와 source ownership/nullability를 교차 검증한다.

초기 hook 3~5개를 고른 뒤 공유 가능 surface를 다음처럼 보정한다.

- 전체 candidate 중 share-eligible이 없으면 초기 selection을 그대로 둔다.
- selected hook에 share-eligible이 하나라도 있으면 교체하지 않는다.
- 전체에는 share-eligible이 있지만 selected에는 없으면, 전체 rank가 가장 높은 share-eligible candidate를 고른다.
  rank가 같으면 catalog canonical concept 순서가 앞선 것을 고른다.
- selected의 non-shareable 중 전체 rank가 가장 낮은 하나를 제거하고 위 candidate를 넣은 뒤
  selected set을 같은 comparator로 다시 정렬한다. hook 수 3~5와 concept uniqueness는 유지한다.
- 이 승격은 대표 hooks에서 공유 CTA를 발견할 수 있게 할 뿐 `shareOptions`의 전체 선택권을 줄이지 않는다.
- rank 1 option은 selector의 추천/default highlight일 뿐 자동 선택·자동 확정하지 않는다.
  non-shareable hook에는 직접 공유 CTA가 없다.
- 이 보정도 self-only·romantic-only·trace·unsettled를 share-eligible로 승격하지 않는다.

`privateOthers` 또는 `shareSafeOthers`가 잠겨 있을 때는 하위 선택 수를 합치지 않는다.

- 결과 방향·퍼센트·관계 문구를 반환하지 않는다.
- 각 투영의 `sightCount`는 그 투영이 허용하는 관계 안에서, 해당 결 source play들 가운데
  하나의 기존 cohort/card 진행도 중 가장 큰 0~2만 사용한다.
- 서로 다른 play, 관계, 카드의 2+1을 3으로 더하지 않는다.
- 화면에는 정확히 `시선을 모으는 중 · n/3`만 표시한다.

### 10. strict decoder와 API

다음 모듈을 추가한다.

- `lib/concepts/catalog-core.mjs`
- `lib/concepts/catalog.ts`
- `lib/owner-profile/concept-profile-core.mjs`
- `lib/owner-profile/concept-profile.ts`
- `lib/owner-profile/concept-profile-client.ts`
- `lib/owner-profile/owner-profile-client.ts`
- `lib/http/owner-concept-profile.ts`
- `app/api/me/concept-profile/route.ts`

`GET /api/me/concept-profile` 계약:

- 인증 owner account만 접근한다.
- 서버는 `listAuthenticatedOwnerPlays()`와 `getAuthenticatedOwnerAccountProfiles()`를 재사용한다.
- capability가 없는 다른 계정의 play는 기존 authenticated RPC에서 `not_found`가 되고 전체 요청은 실패 닫힘 처리한다.
- 성공은 `200`과 strict-decoded `ConceptProfile`을 반환한다.
- 미인증은 기존 owner auth 오류 계약을 따른다.
- 모든 응답은 `Cache-Control: private, no-store`다.
- rate-limit은 기존 `owner_play_access` 경계를 재사용한다.
- payload는 재귀적으로 exact-key를 검사한다. `modelVersion`은 1만 허용하고 hooks 길이는
  concept v1 완료 play가 없을 때만 0, 그 밖에는 3~5여야 하며 concept id는 중복될 수 없다.
- concept/area label과 A/B `directionText`는 `content/concepts-v1.json` 값과 정확히 같아야 한다.
  contextual/unsettled 문구, `basis`와 kind 조합, hook stage, `profileEvidence` source 순서·개수,
  observation/question은 위 고정 템플릿으로 재계산해 정확히 일치하지 않으면 거부한다.
- hook stage는 self/others basis의 해당 source stage 또는 both basis의 두 source 중 낮은 stage와
  정확히 같아야 한다. both의 profileEvidence 두 count를 합친 파생 count나 합산 evidence field는 거부한다.
- evidence count는 양의 안전 정수이며 `cardCount <= 240`, `packCount <= 24`, `contextCount <= 215`,
  `cardCount >= contextCount`, `packCount <= cardCount`,
  `packCount === packs.length`, `contextCount === 전체 context union 크기`여야 한다.
  pack slug/title은 실제 history manifest와 일치해야 하며 pack 중복, context 중복·빈 값,
  `packSlug ASC`/context 오름차순 위반을 거부한다.
- `privateOthers`와 `shareSafeOthers`는 각각 별도 필수 키다.
  `shareEvidence.status = available`이면 `shareSafeOthers`와 stage/direction/directionText/evidence가
  canonical deep equality이고 share source가 실제 share-safe provenance에 있어야 한다.
  `shareEligible`, shareEvidence status와 top-level share source nullability가 어긋나거나
  share 문구가 고정 템플릿과 다르면 거부한다.
- `shareOptions`는 전체 share-eligible candidate의 stable-rank projection과 exact equality여야 한다.
  hook selection 밖 option도 허용하되 누락·추가·순서 변경·32개 초과·private/romantic/self-only 근거 혼입을 거부한다.
- decoder 뒤의 builder invariant는 share-safe 계산에 romantic layer가 한 건이라도 들어오거나,
  source play가 완료·dedupe 규칙과 다르면 전체 요청을 실패 닫힘 처리한다.
  response/card 중복 검사는 builder 책임이 아니며 DB PK/FK와 profile SQL 통합 테스트가 소유한다.
- 금지 식별자는 visitor response/link/session과 외부 사용자 식별자다.
  visitor id, link id, 관계별 raw count, 개인 답변, 퍼센트, 이메일은 payload에 넣지 않는다.
- owner-only 동작에 필요한 internal owner play source id는 strict-decoded hook top-level
  `profileSourcePlayId`/`shareSourcePlayId`와 privacy-safe `shareOptions[].sourcePlayId`에만 허용한다.
  evidence/provenance, 공유 카드/text/URL 문구에는 넣지 않고 DB에서는 internal `owner_play_id` column에만 기록한다.
  analytics properties와 애플리케이션 로그에는 어떤 owner play id도 기록하지 않는다.

기존 `AccountOwnerProfile` exact shape에는 `conceptProfile` key를 추가하지 않는다.
`app/me/page.tsx`의 internal page-data loader가 한 번 읽은 전체 plays/profiles로
기존 `AccountOwnerProfile`과 별도 `ConceptProfile`을 만들고 두 값을 `AccountProfileView` props로 전달한다.
`/me` 서버 렌더와 위 GET API는 동일한 pure concept builder/strict decoder를 사용해 계산이 갈리지 않게 한다.
feature가 disabled면 기존 `AccountOwnerProfile`만 만들고 렌더하는 현재 경로를 그대로 사용한다.

### 10.1 server-only feature gate

`lib/owner-profile/concept-profile-feature.mjs`에 exact parser 하나를 둔다.

```ts
parseConceptProfileEnabled(undefined) === false;
parseConceptProfileEnabled("false") === false;
parseConceptProfileEnabled("true") === true;
// "", "TRUE", "1", "0", 공백 포함 문자열과 그 밖의 값은 throw
```

- app runtime, `scripts/validate-env.mjs`, API route, `app/me/page.tsx`는 모두 이 parser를 사용하며
  직접 truthy 비교나 parser 복제는 금지한다.
- missing과 exact `"false"`는 fail-closed disabled, exact `"true"`만 enabled다.
  그 밖의 값은 `GYEOP_CONCEPT_PROFILE_ENABLED must be true or false` startup validation error다.
- `validateRuntimeEnv()` 결과에 secret이 아닌 boolean `conceptProfileEnabled`만 포함한다.
  기존 `predev`, `prestart`, Render entrypoint의 validation이 invalid production deploy를 시작 전에 중단한다.
- disabled이면 기존 `/me` account profile의 모든 play/layer/count와 v1/v2/v3 owner·visitor read를 유지하고,
  concept UI는 렌더하지 않으며 concept profile API와 기존 profile event route의 concept variant는
  일반 `404 not_found`로 실패 닫힘 처리한다.
  DB schema/history와 current pack pointer는 이 flag로 변경하지 않는다.
- `.env.example`은 `GYEOP_CONCEPT_PROFILE_ENABLED=false`,
  `render.yaml`의 server-only 기본값도 다음 한 항목으로 literal `"false"`를 선언한다.
  ```yaml
      - key: GYEOP_CONCEPT_PROFILE_ENABLED
        value: "false"
  ```
  이 항목은 secret이 아닌 fail-closed boolean config라 `sync: false`를 쓰지 않는다.
  기존 secret/public env 항목은 계속 `sync: false`만 허용하며 값 literal을 저장소에 넣지 않는다.
- `scripts/verify-zero-cost-mvp.mjs`는 위 key에 한해서만 exact quoted scalar
  `value: "false"`를 허용하고, 누락·중복·다른 값·`sync: false`·unquoted false 및 다른 env의
  `value` literal을 모두 거부한다. 기존 server secret pattern, Docker ARG/ENV,
  hosted resource 수와 모든 `sync: false` 검증은 완화하지 않는다.
- `tests/unit/zero-cost-mvp.test.mjs`가 이 단 하나의 예외와 위 거부 fixture를 고정하고,
  `tests/integration/render-deploy.test.sh`는 container를 exact false로 시작해 startup validation,
  legacy `/me`와 concept API `404`를 확인한다. full verify에서 zero-cost unit와 Render deploy 회귀가
  기존 secret 정책을 포함해 통과해야 한다.
- `tests/unit/validate-env.test.mjs`는 missing/false/true/empty/대소문자/숫자 값을,
  route/page tests는 disabled UI·404, enabled UI·200, invalid startup failure를 검증한다.

### 10.2 owner flow의 exact historical pack read

공개 `GET /api/packs/[slug]`는 계속 template의 현재 published version만 반환한다.
과거 play를 이어 읽는 owner capability 경계에만 `GET /api/plays/[playId]/pack`을 추가한다.
이 호환 route는 concept UI feature flag와 무관하게 항상 활성화한다.

- route는 `GET /api/plays/[playId]`와 같은 capability-cookie 우선, authenticated owner fallback,
  `owner_play_access` rate limit, `private, no-store` 정책을 사용한다.
- 유효한 capability session 또는 authenticated owner actor가 해당 play를 소유하는지 먼저 확인한 뒤,
  `pack_plays.pack_version_id`를 exact join해 그 immutable version의 published pack을 기존 공개 pack shape로 반환한다.
  client가 보낸 slug/version이나 현재 template pointer로 version을 다시 찾지 않는다.
- 새 internal RPC `get_owner_play_pack`과 `get_authenticated_owner_play_pack`은 각각 기존 owner play read와
  같은 management secret/actor 소유권을 검사하고, 소유한 play의 exact `pack_version_id`에 연결된
  published version/card만 반환한다. unpublished·불일치 row는 성공으로 반환하지 않는다.
- draft와 completed 모두 `200` 대상이다. v1/v2 draft 이어하기를 보존해야 하므로 pack read에서
  completed status를 요구하거나 draft를 `OWNER_PLAY_INCOMPLETE`로 거부하지 않는다.
- malformed/unknown play id, 만료·잘못된 capability, 다른 owner의 play는 기존 owner play read처럼
  `404 OWNER_PLAY_NOT_FOUND`로 동일하게 감춘다. capability가 없고 authenticated owner session도 없으면
  `401 OWNER_AUTH_REQUIRED`, 내부 오류는 `500 INTERNAL_ERROR`, rate limit은 `429 RATE_LIMITED`다.
- `preloadOwnerFlow(play)`은 slug로 public current pack을 읽지 않고 play id로 위 exact route를 읽는다.
  `loadOwnerFlow(playId)`도 owner play state와 exact historical pack을 play id 경계에서 읽어 결합한다.
  `decodeOwnerFlow`의 `play.packSlug === pack.slug && play.packVersion === pack.version` strict guard는 그대로 두며,
  어느 한 응답이라도 불일치하면 전체 owner flow를 실패 닫힘 처리한다.
- v1/v2 draft는 저장된 답과 다음 위치에서 계속 진행할 수 있고, v1/v2 completed는 같은 exact pack으로
  read-only 완료 화면을 열 수 있다. 현재 v2/v3 play도 같은 경로에서 현재 exact version을 읽는다.
- public pack route의 current-only 계약은 바뀌지 않는다. 과거 version id나 version 문자열을 query/path로
  직접 지정하는 공개 API는 추가하지 않는다.

기존 아래 계약은 유지한다.

- `GET /api/me/profile?playId=...`
- `get_owner_profile`
- `OwnerProfile`
- owner capability cookie와 authenticated owner actor
- `private, no-store`
- 기존 관계별 카드/수집중 layer

### 11. `/me` 소유자 전용 프로필

`app/me/account-profile-view.tsx`와 `app/me/owner-list.module.css`를 모바일 우선으로 바꾼다.

- 공개 프로필 route를 추가하지 않는다. `/me`의 기존 로그인 redirect와 owner-only gate를 유지한다.
- 첫 화면 순서는 다음과 같다.
  1. `{nickname}의 겹`과 한 줄 가치 문장
  2. 대화 훅 3~5개
  3. 안전한 결을 직접 고르는 `한 장으로 나누기` 행동
  4. 기존 관계별 상세와 질문팩 관리는 아래 보조 영역
- 32개 막대, 총점, 순위, 유형 코드를 만들지 않는다.
- 훅 카드는 다음을 한 번에 읽을 수 있어야 한다.
  - `여러 장면에서 반복`, `나와 주변의 차이`, `상황에 따라 달라짐`, `새로 보이는 결` 중 하나의 eyebrow
  - 한 문장 관찰
  - `나: {방향}`과 threshold-safe 비공개 `주변: {privateOthers 방향}` 또는 `시선을 모으는 중 · n/3`
  - hook stage `흔적/윤곽/선명`
  - `basis = self`: `내 답변 {self.evidence.packCount}팩 · {self.evidence.contextCount}맥락` 한 줄
  - `basis = others`: `주변 시선 {privateOthers.evidence.packCount}팩 · {privateOthers.evidence.contextCount}맥락` 한 줄
  - `basis = both`: 위 `내 답변 …`과 `주변 시선 …`을 각각 독립된 두 줄/필드로 표시
- both UI는 두 source count를 더한 `서로 다른 팩 n개` 또는 합계 evidence를 표시하지 않는다.
- `왜 이렇게 보일까?`는 native `<details><summary>`로 구현한다.
  - 열리는 내용은 팩 제목과 맥락 태그 묶음뿐이다.
  - 카드 id, 질문 문구, 개별 선택, 관계, respondent count, 방문자 식별자는 보이지 않는다.
- primary `한 장으로 나누기`는 bottom sheet 또는 dialog 형태의 최소 selector를 열고
  `shareOptions`의 safe copy를 stable rank 순서로 보여준다.
- rank 1은 `추천`/default highlight만 표시하고 owner의 option 선택·확인 전에는 공유를 확정하거나 이동하지 않는다.
  option 0개면 CTA와 selector를 렌더하지 않는 prestate, 1개면 단일 option 확인을 요구하고,
  2개 이상이면 rank 2 이후 non-default option도 동일하게 선택할 수 있어야 한다.
- selected 3~5 hook 안의 share-eligible CTA는 같은 selector를 열되 대응 option을 preselected할 수 있다.
  preselection도 owner 확인 전 자동 생성·이동하지 않는다.
- owner가 확인한 option만
  `/me/plays/{option.sourcePlayId}?entry_source=profile_reshare&share_concept={option.conceptId}`
  로 이동한다. 프로필 관찰이 romantic을 포함한 `privateOthers`에서 만들어졌더라도,
  selector와 공유 카드는 option의 비-romantic `shareEvidence`만 사용한다.
- trace 또는 unsettled 훅은 프로필에서 볼 수 있지만 공유할 수 없다.
- 완료한 concept v1 play가 없으면 기존 계정 프로필을 그대로 보여주고 새 팩을 시작하도록 안내한다.

접근성 계약:

- 320px에서도 가로 스크롤이 없어야 하고 390/430px에서 정보 순서가 바뀌지 않는다.
- CTA와 summary는 최소 44px hit target, 명확한 `:focus-visible`을 갖는다.
- heading 순서를 건너뛰지 않는다.
- stage를 색만으로 전달하지 않고 텍스트를 함께 쓴다.
- native disclosure를 키보드와 screen reader로 사용할 수 있어야 한다.
- `prefers-reduced-motion: reduce`에서는 카드 등장/확장 transition을 제거한다.

### 12. 하나의 9:16 공유 카드

기존 `ProfileShareCard`의 1080×1920 canvas, 파일 공유, 다운로드, 링크 복사, 수동 복사 fallback을 재사용하고 모델만 상위개념 훅으로 교체한다.

- `ProfileShareSelection`은 `share_concept` 하나를 받는 `ConceptShareSelection`으로 전환한다.
- `parseProfileShareSelection`은 catalog에 있는 concept id 하나만 허용한다.
- `app/me/plays/[playId]/page.tsx`는 authenticated session에서 ConceptProfile을 다시 계산해
  URL의 `playId + share_concept`와 exact match하는 `shareOptions` 항목 하나를 찾는다.
  source play ownership, current eligibility, available shareEvidence와
  `entry_source === "profile_reshare"`를 서버에서 모두 재검증한다.
- forged/unknown concept, 다른 owner source, concept/source 불일치, 더 이상 eligible하지 않은 option은
  enumeration을 막는 기존 owner `404`로 실패하고 client/card generator를 렌더하지 않는다.
- `ShareLinkManager`는 server-validated `ConceptShareOption` 하나만 prop으로 받고,
  selector에서 확인한 option 외 다른 hook/profile data를 카드 모델 입력으로 사용하지 않는다.
- client가 query 문구를 그대로 카드에 쓰지 않는다.
- 카드 모델은 다음 정보만 가진다.

```ts
type ProfileShareCardModel = Readonly<{
  conceptLabel: string;
  observation: string;
  stageText: "윤곽" | "선명";
  evidenceText: string;
  question: string;
  packTitle: string;
}>;
```

- 카드 모델의 `observation`, `question`, `stageText`, `evidenceText`, `packTitle`은
  selected option의 `safeCopy`, `safeQuestion`, `shareEvidence`와 authorized source pack에서만 만든다.
  따라서 self-only 또는 romantic-only 관찰 문구가 canvas, share text, clipboard로 이동할 수 없다.
- 카드 내용 순서:
  1. `겹 · {결 이름}`
  2. 한 문장 관찰
  3. `윤곽/선명 · 서로 다른 팩 n개 · 맥락 n개`
  4. 상대에게 묻는 한 문장
  5. `같은 팩 답하기`
- 공유 질문은 hook kind가 아니라 share-safe 방향에서 도출한다.
  - A/B: `너는 내가 어떤 장면에서 그렇게 보였어?`
  - contextual: `너는 언제 반대쪽 모습이 나와?`
- 공유 카드와 share text에는 32개 전체 결과, 관계명, 응답자 수, 개인 답변, 퍼센트, 닉네임, 고정 유형, 점수를 넣지 않는다.
- concept 카드 공유는 public 링크만 허용한다. 1:1 링크는 집계/재공유에 쓰지 않는다.
- 기존 share/download/copy/fallback은 모두 동일한 public invite URL을 붙인다.
- invite를 완료한 방문자의 `나도 이 팩으로 시작하기`는 selected option의 source pack으로 이어지고
  기존 `same_pack_cta` 흐름은 변경하지 않는다.

기존 `share_relationship`, `share_card` query로 열리는 질문 단위 결과 카드는 새 `/me`에서 생성하지 않는다. 직접 저장된 URL은 일반 share manager로 안전하게 내려가고 query의 결과 문구를 표시하지 않는다.

### 13. 분석과 관측성

민감한 결 내용은 분석 속성으로 보내지 않는다.

| 사용자 행동 | 이벤트 |
|---|---|
| account-level `/me` concept 훅 1개 이상 성공 렌더 | 신규 `concept_profile_viewed` |
| 기존 concrete play 프로필 진입 | 기존 `profile_viewed` |
| final selected 훅의 `왜 이렇게 보일까?` session 최초 열기 | 신규 `concept_detail_opened` |
| `한 장으로 나누기` 선택 | 기존 `profile_reshare_clicked` |
| OS share 성공 | 기존 `share_handoff_succeeded` |
| 링크 복사 | 기존 `share_link_copied` |
| 방문자 결과 뒤 같은 팩 시작 | 기존 `same_pack_start_clicked` |
| 같은 팩 새 owner play 생성 | 기존 `new_owner_pack_opened` 퍼널 집계 |

기존 non-path route `POST /api/me/profile/events` 하나를 재사용한다.
`ownerProfileEventSchema`는 다음 네 exact object의 strict discriminated union이며 각 variant의 추가 키를 거부한다.

```ts
type OwnerProfileEventRequest =
  | Readonly<{ event: "profile_viewed"; playId: string }>
  | Readonly<{ event: "profile_reshare_clicked"; playId: string }>
  | Readonly<{ event: "concept_profile_viewed"; playId: string }>
  | Readonly<{
      event: "concept_detail_opened";
      playId: string;
      conceptId: string;
    }>;
```

- 모든 `playId`는 profile/source owner play의 canonical UUID다. HTTP body에는 별도
  `profileSourcePlayId`나 `shareSourcePlayId` key를 두지 않고 항상 `playId`로 보낸다.
- 기존 `{ event: "profile_viewed", playId }`와
  `{ event: "profile_reshare_clicked", playId }`의 body, 인증·ownership, idempotency,
  선행 `profile_viewed`, status와 stored properties 의미는 변경하지 않는다.
- `concept_profile_viewed`는 feature가 enabled이고 strict-decoded hooks가 1개 이상인 concept section이
  브라우저에 성공적으로 렌더된 뒤, 정렬된 첫 hook의 `profileSourcePlayId` 값을 `playId`로 보내는 노출이다.
  exact body는 `{ event: "concept_profile_viewed", playId }`다.
- `AccountProfileView`의 once-per-mount `useRef`가 노출을 정확히 한 번 시도한다.
  React strict rerender, prop/state rerender와 visibility refresh는 같은 mount에서 추가 전송하지 않고,
  실제 browser reload는 새 page load라 새 노출 1건을 보낸다. 성공·HTTP 오류·network 오류 뒤 같은 mount에서 재시도하지 않는다.
- `concept_detail_opened`는 사용자가 enabled profile의 최종 selected 3~5 hook 중 실제 렌더된 detail을 열 때만 보낸다.
  exact body는 `{ event: "concept_detail_opened", playId, conceptId }`이고
  `playId`는 그 hook의 `profileSourcePlayId` 값이다.
- detail client는 `sessionStorage`의 exact key `playId + "\0" + conceptId`를 request 전에 기록한다.
  같은 browser tab session에서는 rerender·닫기/다시 열기·성공/HTTP 오류/network 오류 뒤 재전송하지 않고,
  다른 eligible hook은 다른 key라 한 번씩 보낼 수 있다.
- feature disabled, server/client prestate, hooks 0개, concept profile load/decode/render 실패,
  final selected hook에 없는 concept 또는 source를 확정할 수 없는 unavailable 상태에서는
  두 신규 event request를 보내지 않는다. `shareEvidence.status = unavailable`이어도
  profile source가 있는 selected detail 자체는 열 수 있으므로 detail event 자격을 막지 않는다.
- 서버는 신규 두 variant에 대해 exact feature parser enabled, authenticated owner session,
  `playId` 소유권을 다시 확인한다. exposure는 현재 canonical 첫 hook source와 일치해야 하고,
  detail은 `conceptId` catalog allowlist, 현재 canonical final selected hook 포함 여부,
  그 hook의 profile source와 `playId` 일치를 모두 재검증한다.
- 검증 직후 detail `conceptId`를 버려 DB와 application log에 전달하지 않는다.
  두 신규 event 모두 source는 internal `owner_play_id`로만 기록하고 source play의 immutable version에서
  stored properties를 정확히 `{ packVersion }`으로 만든다.
  owner play id, concept id, visitor/관계/count/방향/context는 properties와 log에 넣지 않는다.
- 성공은 body 없는 `204`다. malformed JSON, discriminated union/schema/extra-key 위반,
  잘못된 event·UUID·conceptId 형식은 `400 INVALID_REQUEST`; 미인증은 `401 OWNER_AUTH_REQUIRED`;
  unknown/cross-owner/not-selected/source mismatch는 enumeration을 막기 위해
  `404 OWNER_PLAY_NOT_FOUND`로 collapse하고 `403`은 사용하지 않는다.
  feature disabled도 일반 `404 not_found`, rate limit은 `429 RATE_LIMITED`,
  예상하지 못한 오류는 `500 INTERNAL_ERROR`이며 모든 응답은 `private, no-store`다.
- 기존 이벤트의 canonical properties는 변경하지 않는다.
  - `profile_viewed`: `{ packVersion }`
  - `profile_reshare_clicked`: `{ packVersion, entrySource: "profile_reshare" }`
  - 일반 share/copy: `{ packVersion, linkKind }`
  - profile 재공유에서 발생한 share/copy:
    `{ packVersion, linkKind, entrySource: "profile_reshare" }`
  - `same_pack_start_clicked`: `{ packVersion, linkKind }`
  - `pack_opened`: `{ packVersion, entrySource: "home" | "same_pack_cta" }`
- analytics normalizer/DB allowlist는 properties의 `conceptId`와 모든 extra property를 거부하고,
  네 route variant, 신규 event별 exact `{packVersion}`, 기존 event별 canonical key 집합을 각각 테스트한다.
- account-level `/me`는 `profile_viewed`를 만들지 않는다. concrete profile의 기존 `profile_viewed`와
  concept 노출 `concept_profile_viewed`를 분리한다.
- 신규 product event는 consent 기반 GA4 route-class `page_view`와 별개다.
  GA4에 복제하거나 page_view custom parameter로 추가하지 않는다.
- 실패 로그에도 API payload나 concept 결과를 출력하지 않고 기존 일반 오류 문구를 사용한다.

#### v1/v2 → v2/v3 same-pack rollover 퍼널

same pack의 영속 identity는 exact pack version 문자열이 아니라 `pack_templates.id`와 그 stable `slug`다.

- `create_or_resume_play_with_source`의 `same_pack_cta` source 검증은 기존
  response id, session hash, submitted status, session expiry, source visitor 연결을 모두 유지한다.
  추가로 source response의 version과 새 current version을 각각 `pack_versions → pack_templates`로 join하고
  template id와 slug가 모두 같을 때만 `visitor_response_id`와 `entrySource = same_pack_cta`를
  새 `pack_opened` event에 연결한다. exact version equality는 요구하지 않는다.
- 다른 template/slug, 만료·불일치 session, submitted가 아닌 response는 기존처럼 source 연결을 거부한다.
  event properties의 `packVersion`은 source v1/v2가 아니라 실제 새 owner play의 현재 v2/v3를 기록한다.
- `private.core_funnel_stage_counts`도 `clicked.pack_version = opened.pack_version` 문자열 비교를 제거한다.
  `visitor_required_submitted → comparison_viewed → same_pack_start_clicked → pack_opened`가
  같은 `visitor_response_id`로 이어지고 marker 이후이며 `pack_opened.owner_play_id`가 존재하고
  `entrySource = same_pack_cta`인 기존 chain을 그대로 요구한다.
- 브라우저 click 기록과 owner play open 요청은 경합할 수 있으므로
  `same_pack_start_clicked`와 연결된 `pack_opened`의 상호 `occurred_at` 도착 순서는 요구하지 않는다.
  submitted/comparison의 기존 선행·연결 조건과 measurement marker 경계는 그대로 보존한다.
  이 issue에서 바꾸는 funnel semantics는 same-pack identity를 exact version equality에서
  canonical template id와 stable slug equality로 바꾸는 것뿐이다.
- 마지막 단계에서 source response version과 opened owner play version의 template id/slug를 DB join으로 비교한다.
  client properties의 slug나 concept 값을 신뢰하지 않는다.
- 통합 fixture는 v2 response 제출·비교 뒤 click→open과 open→click 두 도착 순서 모두
  current v3 `new_owner_pack_opened` 1건으로 집계됨을 증명한다.
  같은 response chain이라도 template id 또는 slug가 하나라도 다른 current play는 0건이며,
  v2→v2 same-version 기존 경로도 계속 1건이어야 한다.

## 제외 범위

- MBTI형 4글자 코드, 단일 성격 유형, 진단·적합도·채용 해석
- 공개 사용자 프로필, 사용자 검색, 랭킹, 다른 사람의 concept profile
- 방문자 목록, 방문자별 concept, 개인 답변, 응답자 식별, 관계별 원자료
- 1:1 응답의 상위개념 집계 또는 공유
- 임계값 미만 play/관계/카드의 합산
- AI 요약, 추천 알고리즘, 질문팩 추천, 사용자의 결 카탈로그 편집
- 채팅, 댓글, 알림, 공개 피드
- 기존 v1/v2 매니페스트 또는 기존 play/answer row 수정
- 결별 수치 점수, 퍼센트, 백분위 노출
- 서버에 이미지 파일을 저장하는 기능

## SSOT

저장소 작업 계약으로 루트 `AGENTS.md`와 `.codex/AGENTS.md`를 읽고 따른다.

충돌 시 아래 순서를 따른다.

1. `docs/product/core-feature-priority.md`
2. `docs/product/question-pack-spec.md`
3. `docs/product/decision-log.md`
4. 이 구현 스펙
5. Reviewed `docs/product/concept-graph-design.md`

same-pack funnel의 운영·marker·도착 순서 계약은
`docs/engineering/core-funnel-events.md`를 활성 운영 SSOT로 함께 갱신한다.
문서에도 click/open 상호 도착 순서를 요구하지 않고 canonical template id+slug만 identity로 쓴다는
위 문구를 동일하게 기록한다.
6. `docs/product/full-product-plan.md`
7. `docs/design/research/issue-157-lazyweb.md`는 방향성 근거이며 개인정보/제품 계약을 덮지 않는다.

런타임 데이터의 단일 출처:

- 결 정의: `content/concepts-v1.json`
- 문자열 상한: `lib/concepts/catalog-core.mjs`의 `CONCEPT_COPY_LIMITS`
- 카드 신호: 최신 `content/packs/*-vN.json`
- pack version/card 이력: `packManifestHistory`, `OFFICIAL_PACK_HISTORY`, `OFFICIAL_PACK_CARD_IDS`
- DB 발행본: 위 매니페스트에서 생성된 migration/seed
- 집계식: `lib/owner-profile/concept-profile-core.mjs`
- 비공개 others: 기존 관계 3명·카드 3표본을 통과한 8개 관계 layer의 `privateOthers`
- 공유 여부: `isProfileShareRelationship()`와 같은 7개 비-romantic allowlist로 별도 계산한
  `shareSafeOthers` 및 이 스펙의 share eligibility
- rollover funnel identity: DB의 `pack_templates.id + slug`; analytics의 `packVersion` 문자열은 관측값이며
  same-pack identity 판정의 SSOT가 아니다.

## 사용자 흐름 영향

### 소유자

1. 기존처럼 공식 팩 10문항에 답한다. 버튼 좌우는 질문 순서에 따라 섞이지만 저장 의미는 A/B로 유지된다.
2. 완료한 새 버전 팩의 답은 `/me`에서 결의 self 근거가 된다.
3. 첫 팩부터 3~5개의 `흔적`을 보고, 다른 팩을 완료할수록 `윤곽`, `선명`으로 변한다.
4. 비공개 프로필에는 threshold-safe romantic 시선도 포함될 수 있지만 관계명·원자료는 보이지 않는다.
5. 비-romantic 공유 안전 시선이 없으면 `시선을 모으는 중 · n/3`만 보고 concept 공유는 할 수 없다.
6. 안전한 시선과 여러 팩의 근거가 쌓이면 반복·차이·상황 의존 훅을 본다.
7. `왜 이렇게 보일까?`에서 팩과 맥락만 확인한다.
8. share-safe 근거가 있는 결 하나를 골라 기존 play의 public invite와 9:16 카드를 공유한다.

### 방문자

1. 기존처럼 설치 없이 공개 링크를 연다.
2. 관계를 선택하고 Signature 1장+저표본 2장의 필수 질문에 답한다.
3. 화면 좌우가 섞여도 저장 의미와 비교 결과는 변하지 않는다.
4. 제출 전에는 owner 답을 볼 수 없다.
5. 제출 뒤 기존 비교 결과와 `나도 이 팩으로 시작하기`를 그대로 사용한다.

### 전환된 새 소유자

1. `same_pack_cta`로 같은 slug의 현재 발행 버전을 바로 시작한다.
   과거 v1/v2 invite에서 전환되어도 과거 응답은 그대로 읽고 새 owner play만 현재 v2/v3로 만든다.
2. 10문항을 완료하면 자신의 `/me`에 독립적인 self 결이 생긴다.
3. 원래 소유자의 profile이나 방문자 답은 새 소유자에게 복사되지 않는다.

## 디자인 영향

Lazyweb 리포트의 다음 권고를 적용한다.

- 첫 화면에는 대화가 되는 결 3~5개만 보인다.
- 근거는 서로 다른 팩·맥락·기준 충족 여부로 설명한다.
- 공유 카드는 하나의 안전한 결과, 하나의 질문, 같은 팩 CTA만 담는다.
- profile의 primary action은 `한 장으로 나누기`다.

다음은 적용하지 않는다.

- 32개 동등 막대
- 고정 유형 코드
- 개인 응답·방문자 식별·관계별 원자료
- 외부 레퍼런스의 개인정보 모델을 GYEOP에 그대로 복사하는 것

실제 UI는 기존 GYEOP의 검정·라임·블루·코랄 시각 언어, 모바일 폭, canvas 공유 기반을 유지한다. 새 디자인 시스템이나 UI dependency는 추가하지 않는다.

## API와 데이터 영향

### 유지되는 공개/내부 계약

- `GET /api/packs/[slug]` 응답 shape와 current published version만 반환하는 의미
- owner/visitor choice `"a" | "b"`
- `GET /api/me/profile`
- `public.get_owner_profile`
- 공개 링크와 1:1 링크의 기존 상태 기계
- `private, no-store`, strict decoder, rate limit, owner actor/capability

### 추가/변경 계약

- `GET /api/me/concept-profile`
- owner capability 전용 `GET /api/plays/[playId]/pack` exact historical pack read
- 기존 `POST /api/me/profile/events` strict union의 concept exposure/detail variant
- `ConceptCatalogV1`, `ConceptProfile`, `ConceptHook`, `ConceptSourceSummary`
- `ConceptHookBasis`, `ConceptProfileEvidence`, `ConceptShareEvidence`, `ConceptShareOption`
- `CONCEPT_COPY_LIMITS`
- `pack_versions.concept_version`
- `pack_cards.concept_context`, `pack_cards.concept_signals`
- `concept_detail_opened` 내부 분석 이벤트
- `share_concept` query와 strict parser
- stable template/slug 기반 `create_or_resume_play_with_source`와 `core_funnel_stage_counts`

### 개인정보 경계

- DB의 기존 threshold-safe 결과를 application에서 다시 합칠 때도 임계값 미만 값은 입력하지 않는다.
- collecting progress는 최대 한 cohort의 0~2만 보여주며 합산하지 않는다.
- `privateOthers` 방향은 8개 관계, `shareSafeOthers` 방향은 romantic을 제외한 동일 helper의
  7개 관계에서 관계와 카드 기준을 모두 통과한 카드만 별도 계산한다.
- evidence pack/context는 원자료가 아니라 distinct provenance다.
- 응답자 수는 방향 가중치와 선명도에 쓰지 않는다.

## 구현 계획

### 1단계 — 콘텐츠와 검증기

1. 원본 concept 설계와 두 TSV를 작업공간에 추가한다.
2. `content/concepts-v1.json`과 decoder/type을 만든다.
3. 24개 새 매니페스트를 만든다.
4. 48개 rewrite와 240개 mapping을 적용한다.
5. `lib/packs/catalog.ts`, registry, seed renderer, catalog verifier를 갱신한다.
6. choice order helper와 owner/visitor 렌더를 global ordinal 1~10/1~5에 연결한다.

### 2단계 — DB 발행

1. additive schema migration과 publish validation을 작성한다.
2. 새 24버전 content migration에 pre-publish 24/240 exact readback과 fail-closed pointer gate를 넣는다.
3. renderer에 24/69/690 pre-publish readback gate를 넣고 `supabase/seed.sql`을 재생성한다.
4. DB에서 과거 불변성, clean/re-run/conflict, 새 metadata, pointer, threshold 필터를 검증한다.
5. same-pack source와 funnel view를 stable template/slug rollover에 맞추되 click/open 상호 도착 순서를
   요구하지 않으며, `docs/engineering/core-funnel-events.md`를 같은 계약으로 갱신한다.
6. local Supabase reset으로 새 migration을 모두 적용한 뒤 canonical type generator 출력으로
   `lib/db/database.types.ts`를 갱신하고 generated schema drift를 0으로 만든다.

### 3단계 — 집계 모델과 API

1. `concept-profile-core.mjs`에 exact card identity helper, 정규화·팩 평균·선명도·상황 의존·훅 선정을 순수 함수로 구현한다.
2. 기존 account profile builder/output은 유지하고 internal page-data에서 이미 읽은 pair로 concept를 별도 계산한다.
3. strict types/decoder/client와 `GET /api/me/concept-profile`을 추가한다.
4. private/share-safe 투영 분리, 임계값 미만 progress 비합산,
   `completedAt DESC, playId ASC` 동일 slug 중복 제거를 단위/통합 테스트한다.
5. owner play capability route가 immutable `pack_version_id`의 historical pack을 반환하게 하고
   owner flow client가 public current pack 대신 이 exact route를 사용하게 한다.

### 4단계 — `/me`와 공유

1. AccountProfileView의 첫 화면을 3~5 훅과 전체 safe `shareOptions` selector로 바꾼다.
2. native details 기반 provenance를 추가한다.
3. owner가 확인한 `share_concept + sourcePlayId`를 server revalidation 뒤 share manager에 연결한다.
4. 기존 canvas를 validated option 하나만 받는 concept 카드 모델로 바꾼다.
5. 기존 public link share/copy/download/fallback과 downstream CTA를 회귀 검증한다.

### 5단계 — 분석·문서·회귀

1. 신규 concept exposure/detail 이벤트를 추가하고 기존 profile/share/copy properties 계약을 회귀 고정한다.
2. exact feature parser, env validation, Render false default와 운영 runbook을 추가한다.
3. 제품 SSOT, `docs/engineering/p0-development-plan.md`와 Lazyweb 보존본을 갱신하고
   `scripts/verify_project.py`의 SSOT drift 검사를 맞춘다.
4. `package.json`의 hard-coded unit 목록과 `scripts/ai-verify` full/CI lane에 새 검사를 실제 연결한다.
5. unit, DB, integration, Playwright, mobile regression을 통과시킨다.
6. 320/390/430px 실제 렌더를 QA에서 시각 확인한다.

## 예상 변경 파일

### 콘텐츠·문서

- `content/concepts-v1.json`
- `content/packs/after-work-v3.json` 외 위 표의 새 버전 24개
- `docs/product/concept-graph-design.md`
- `docs/product/concept-card-mapping-v0.tsv`
- `docs/product/concept-card-rewrites-v0.tsv`
- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/product/full-product-plan.md`
- `docs/product/README.md`
- `docs/engineering/private-mvp-zero-cost-runbook.md`
- `docs/engineering/core-funnel-events.md`
- `docs/engineering/p0-development-plan.md`
- `docs/design/research/issue-157-lazyweb.md`
- `docs/specs/issue-157.md`

### 카탈로그·집계·HTTP

- `lib/concepts/catalog-core.mjs`
- `lib/concepts/catalog.ts`
- `lib/packs/catalog.ts`
- `lib/packs/official-pack-registry.mjs`
- `lib/packs/published-pack-core.mjs`
- `lib/packs/choice-order.mjs`
- `lib/visitor-response/visitor-context-core.mjs`
- `lib/owner-flow/owner-flow-core.mjs`
- `lib/owner-flow/owner-flow-client.ts`
- `lib/owner-profile/owner-profile-core.mjs`
- `lib/owner-profile/concept-profile-core.mjs`
- `lib/owner-profile/concept-profile.ts`
- `lib/owner-profile/concept-profile-client.ts`
- `lib/owner-profile/concept-profile-feature.mjs`
- `lib/owner-profile/account-profile-core.mjs`
- `lib/owner-profile/account-profile.ts`
- `lib/owner-profile/profile-share-card-core.mjs`
- `lib/http/owner-concept-profile.ts`
- `lib/http/owner-profile.ts`
- `lib/http/owner-play.ts`
- `lib/http/owner-play-schemas.ts`
- `lib/http/auth-owner.ts`
- `lib/db/database.types.ts`
- `lib/db/internal-rpc.ts`
- `lib/owner-play/owner-play-state-core.mjs`

### DB·API·UI

- `supabase/migrations/20260724000100_concept_graph.sql`
- `supabase/migrations/20260724000200_pack_content_concepts_v1.sql`
- `supabase/seed.sql`
- `.env.example`
- `render.yaml`
- `package.json`
- `scripts/ai-verify`
- `.github/workflows/ci.yml`
- `scripts/verify_project.py`
- `scripts/validate-env.mjs`
- `scripts/verify-zero-cost-mvp.mjs`
- `scripts/render-pack-seed.mjs`
- `scripts/verify-pack-catalog.mjs`
- `app/api/me/concept-profile/route.ts`
- `app/api/plays/[playId]/pack/route.ts`
- `app/api/me/profile/events/route.ts`
- `app/me/page.tsx`
- `app/me/account-profile-view.tsx`
- `app/me/owner-list.module.css`
- `app/me/plays/[playId]/page.tsx`
- `app/me/plays/[playId]/share-link-manager.tsx`
- `app/me/plays/[playId]/profile-share-card.tsx`
- `app/me/plays/[playId]/profile-share-card.module.css`
- `app/play/[playId]/owner-play.tsx`
- `app/i/[publicId]/invite-entry.tsx`

### 테스트

- `tests/unit/concept-catalog.test.mjs`
- `tests/unit/validate-env.test.mjs`
- `tests/unit/concept-profile.test.mjs`
- `tests/unit/choice-order.test.mjs`
- `tests/unit/owner-flow-core.test.mjs`
- `tests/unit/owner-flow-client.test.mjs`
- `tests/unit/pack-catalog.test.mjs`
- `tests/unit/http-boundary-policy.test.mjs`
- `tests/unit/zero-cost-mvp.test.mjs`
- `tests/unit/account-owner-profile.test.mjs`
- `tests/unit/owner-profile.test.mjs`
- `tests/unit/profile-share-card.test.mjs`
- `tests/integration/owner-profile-session.test.mjs`
- `tests/integration/owner-play-session.test.mjs`
- `tests/integration/pack-catalog.test.mjs`
- `tests/integration/render-deploy.test.sh`
- `tests/integration/visitor-response-concurrency.test.mjs`
- `tests/integration/concept-graph-upgrade.test.sh`
- `supabase/tests/owner_play_session.test.sql`
- `supabase/tests/pack_catalog.test.sql`
- `supabase/tests/core_funnel.test.sql`
- `tests/e2e/owner-profile.spec.ts`
- `tests/e2e/share-links.spec.ts`
- `tests/e2e/owner-play.spec.ts`
- `tests/e2e/visitor-response.spec.ts`
- `tests/e2e/owner-play-live.spec.ts`
- `tests/e2e/core-mvp-live.spec.ts`
- `tests/e2e/google-analytics.spec.ts`

구현 중 기존 공통 helper가 같은 계약을 이미 제공하는 경우 그 파일을 재사용하고, 같은 역할의 새 abstraction은 만들지 않는다. 반대로 strict decoder·보안 경계·접근성 검증은 파일 수를 줄이기 위해 생략하지 않는다.

기존 계약을 확인하되 수정하지 않는 SSOT/code 참조는 다음과 같다.

- 기존 publish/pointer helper:
  `supabase/migrations/20260718000200_pack_catalog.sql`
- assignment/answer PK·FK:
  `supabase/migrations/20260718000700_visitor_required_assignments.sql`,
  `supabase/migrations/20260718000800_visitor_required_response.sql`
- profile/share analytics properties:
  `supabase/migrations/20260718000400_share_links.sql`,
  `supabase/migrations/20260718001000_profile_reshare.sql`,
  `supabase/migrations/20260718001100_core_funnel_events.sql`
- 현재 same-pack funnel view:
  `supabase/migrations/20260719000200_visitor_optional_answers.sql`
- authenticated list와 same-pack source binding:
  `supabase/migrations/20260720000100_anonymous_owner_claim.sql`
- 현재 threshold-safe relationship layer RPC:
  `supabase/migrations/20260723000200_owner_profile_relationship_layers.sql`
- 현재 app 호출 경계:
  `lib/http/auth-owner.ts`, `lib/db/internal-rpc.ts`,
  `lib/owner-profile/owner-profile-core.mjs`,
  `lib/packs/published-pack-core.mjs`,
  `lib/owner-play/owner-play-state-core.mjs`,
  `app/me/page.tsx`
- owner flow exact-version/capability 경계:
  `lib/owner-flow/owner-flow-client.ts`, `lib/owner-flow/owner-flow-core.mjs`,
  `app/api/plays/[playId]/route.ts`, `lib/http/owner-play.ts`, `lib/db/internal-rpc.ts`,
  `supabase/migrations/20260718000300_owner_play_session.sql`,
  `supabase/migrations/20260720000100_anonymous_owner_claim.sql`
- pack history/current pointer SQL·integration assertion:
  `supabase/tests/pack_catalog.test.sql`, `tests/integration/pack-catalog.test.mjs`
- funnel SQL assertion:
  `supabase/tests/core_funnel.test.sql`, `docs/engineering/core-funnel-events.md`
- choice ordinal consumer와 회귀:
  `app/play/[playId]/owner-play.tsx`, `app/i/[publicId]/invite-entry.tsx`,
  `tests/unit/choice-order.test.mjs`, `tests/e2e/owner-play.spec.ts`,
  `tests/e2e/visitor-response.spec.ts`
- feature/config와 운영 경계:
  `.env.example`, `scripts/validate-env.mjs`, `tests/unit/validate-env.test.mjs`,
  `render.yaml`, `scripts/verify-zero-cost-mvp.mjs`, `tests/unit/zero-cost-mvp.test.mjs`,
  `tests/integration/render-deploy.test.sh`, `docs/engineering/private-mvp-zero-cost-runbook.md`
- canonical Supabase type check:
  `lib/db/database.types.ts`, `scripts/verify-supabase-types.mjs`
- verification wiring:
  `package.json`, `scripts/ai-verify`, `scripts/run-ai-verify`, `.github/workflows/ci.yml`
- P0 계획 SSOT drift:
  `docs/engineering/p0-development-plan.md`, `scripts/verify_project.py`

검증 연결은 다음 exact contract를 따른다.

- `package.json`의 hard-coded `pnpm test` command에 새 unit 세 파일
  `tests/unit/concept-catalog.test.mjs`, `tests/unit/concept-profile.test.mjs`,
  `tests/unit/choice-order.test.mjs`를 직접 추가한다.
- `scripts/ai-verify`의 `run_static_verification`은 기존 `sh -n` syntax check와 별개로
  `bash tests/integration/render-deploy.test.sh`를 무조건 실제 실행한다.
  따라서 `full`과 같은 함수를 호출하는 CI `ci-static` lane 모두 literal-false container smoke를 실행한다.
- `run_data_core_verification`은 local Supabase를 시작한 뒤
  `bash tests/integration/concept-graph-upgrade.test.sh`를 path-based skip 없이 무조건 실제 실행한다.
  따라서 `full`과 CI `ci-data-core` lane 모두 clean/re-run/conflict upgrade fixture를 실행한다.
- `.github/workflows/ci.yml`의 기존 matrix는 `./scripts/run-ai-verify --mode ci-static`과
  `--mode ci-data-core`를 호출하고 final `verify` job이 두 lane 성공을 요구한다.
  같은 함수를 통한 위 wiring으로 충분하므로 별도 workflow lane을 복제하지 않는다.
- `full`은 위 두 command가 실제 exit 0을 반환한 뒤에만 exact-HEAD marker를 만들 수 있다.
  command 누락, path-based skip, `sh -n`만 수행, nonzero 종료 중 하나라도 발생하면 verification wiring
  regression으로 실패하고 marker를 기록하지 않는다.

Supabase type은 hand-edit하지 않는다.

1. local Supabase reset으로 이 issue의 migration/seed를 모두 적용한다.
2. `pnpm exec supabase gen types typescript --local`의 stdout을 Prettier
   `parser: "typescript"`로 format한 exact 결과를 `lib/db/database.types.ts`로 갱신한다.
3. `node scripts/verify-supabase-types.mjs`가 같은 local schema에서 다시 생성·format한 결과와
   committed file을 byte equality로 비교한다.
4. `scripts/ai-verify`의 data-core/full lane에서 reset 뒤 이 checker를 실행해 RPC/table type drift가 있으면 실패한다.

`list_authenticated_owner_plays`의 additive `completedAt`,
exact historical pack RPC 두 개, `create_or_resume_play_with_source`, analytics function/check,
`core_funnel_stage_counts` 변경은
새 `20260724000100_concept_graph.sql`에서 `create or replace`로 적용해 과거 migration을 불변으로 둔다.
pack publish는 새 helper 없이 기존 `public.publish_pack_version(uuid)`만 사용한다.

## 완료 기준

- [ ] `content/concepts-v1.json`과 활성 SSOT에 8개 영역·32개 양방향 결이 exact-key로 정의된다.
- [ ] 위 표의 활성 최신 24개 팩이 새 버전으로 발행된다.
- [ ] 최신 240문항 전부가 맥락 1개·신호 1~2개를 가지며 신호 합계가 289개다.
- [ ] rewrite TSV가 exact 8열·48행이며 48개 owner/visitor 문구·선택지가 새 매니페스트와
  canonical JSON deep equality로 일치하고 각 `signals`가 mapping TSV와 순서까지 정확히 같다.
- [ ] 기존 v1/v2 45버전·450카드와 과거 play/answer row가 변경되지 않는다.
- [ ] content migration은 clean/re-run 모두 24 version·240 card canonical readback 뒤에만 발행/pointer 이동하며,
  clean 실행은 기존 `publish_pack_version()` 24회가 transaction commit에서 원자 노출되고,
  partial/conflict/호출·후검증 실패는 pointer를 포함해 전체 rollback한다.
- [ ] regenerated `supabase/seed.sql`도 publish 전 24 template·69 version·690 card를 exact readback하고,
  clean/re-run은 같은 history/current pointer를 만들며 partial/conflicting UUID는 전체 abort한다.
- [ ] `OFFICIAL_PACK_HISTORY`와 `OFFICIAL_PACK_CARD_IDS`가 기존 45+신규 24=69버전,
  690카드를 보존하고 모든 `slug + "\0" + version`을 읽는다.
- [ ] `supabase/tests/pack_catalog.test.sql`과 `tests/integration/pack-catalog.test.mjs`의
  기존 history count/current pointer assertion을 69 version·690 card와 신규 current 24개로 명시적으로 갱신하고,
  위 표에서 v3가 된 모든 slug의 exact current v3 id/version도 검증한다.
- [ ] 실제 과거 v1/v2 completed play의 owner profile, 기존 public invite/visitor result,
  same-pack CTA를 읽을 수 있고 CTA의 새 owner play만 같은 slug의 현재 v2/v3에서 시작한다.
- [ ] owner exact pack route가 immutable `pack_version_id`로 v1/v2 draft를 이어하고 completed를 읽으며,
  현재 v2/v3도 읽는다. cross-owner/unknown은 같은 404이고 public pack route는 current-only다.
- [ ] account-level `/me`가 전체 draft/completed를 list·strict-decode하고 모든 completed profile로
  기존 `buildAccountOwnerProfile`을 만들어 v1/v2·반복 play의 plays/self/relationship/detail/count를 보존한다.
- [ ] verifier가 `packs=24`, `cards=240`, `concepts=32`, `signals=289`, `unmapped=0`과 팩/결 분포 기준을 증명한다.
- [ ] 화면 위치를 바꿔도 owner/visitor 저장 choice와 비교 결과가 의미 A/B를 유지하고,
  visitor required→optional global ordinal fixture가 정확히
  `a,b / b,a / a,b / b,a / a,b`이며 optional에서 홀짝을 재시작하지 않는다.
- [ ] self/privateOthers/shareSafeOthers 방향, 흔적/윤곽/선명, 반복, 차이, 상황 의존이
  한 pure model과 strict API에서 일치한다.
- [ ] privateOthers는 threshold-safe romantic을 포함할 수 있고 shareSafeOthers는
  `isProfileShareRelationship()`와 같은 7개 관계만 포함한다.
- [ ] 같은 카드의 응답자 수 증가만으로 direction weight나 선명도가 증가하지 않는다.
- [ ] 같은 팩 반복 완료와 한 팩 안 여러 카드가 전체 결과를 중복 가중하지 않는다.
- [ ] clarity/contextual/evidence가 모두
  `packSlug + "\0" + packVersion + "\0" + cardId`를 사용해 같은 cardId의 다른 팩은 distinct로 세고,
  동일 slug 반복 play는 source dedupe 뒤 중복하지 않는다.
- [ ] 같은 slug의 source는 completed concept-v1 play 중 `completedAt DESC, playId ASC`로 고정되며
  updated_at, 재공유, visitor 도착으로 바뀌지 않는다.
- [ ] concept slug dedupe는 이미 읽은 completed summary/profile pair에만 적용되고 추가 RPC가 없으며,
  그 결과만 active 24 slug 이하로 제한된다.
- [ ] assignment/answer PK·FK와 exact version/card join으로 합법적인 response/card가 한 번만 집계되며,
  동일 submit/idempotent answer retry와 중복 API 시도가 row 수·집계 기여를 늘리지 않는다.
- [ ] 임계값 미만, 1:1, draft, withdrawn, invalid, 다른 play/version 데이터가 concept 방향에 포함되지 않는다.
- [ ] 임계값 전에는 others 방향 대신 `시선을 모으는 중 · n/3`만 보이고 2+1을 합치지 않는다.
- [ ] `/me` 첫 화면에 실제 데이터 기반 훅 3~5개가 표시된다.
- [ ] 반복, self/others 차이, 상황 의존 훅이 각각 자격을 만족할 때 결정적으로 선정된다.
- [ ] v1 context는 mapping TSV exact 215개 allowlist만 허용하고 전체 exact string으로 distinct를 세며,
  contextual은 A/B 각각 2카드·2팩·2 exact context를 충족해야 한다.
- [ ] `ConceptProfile`의 exact top-level shape, basis, profile/share evidence, source provenance와
  catalog+고정 템플릿 문구가 strict decoder에서 교차 검증된다.
- [ ] `shareOptions`가 모든 share-eligible concept을 stable rank·최대 32개로 보존하고
  safe copy/question/evidence/source만 포함하며 romantic/private/self-only raw data를 포함하지 않는다.
- [ ] hook stage는 self/others 해당 stage 또는 both의 낮은 stage이며,
  both evidence는 내 답변/주변 시선 두 줄로 분리되고 count를 합치지 않는다.
- [ ] concept id/context/area·concept label/direction/share copy가 `CONCEPT_COPY_LIMITS` 하나를 사용하고,
  exact-max 1080×1920 한글/공백 없는 Latin fixture가 clipping 없이 맞으며 max+1은 거부된다.
- [ ] `왜 이렇게 보일까?`에는 팩과 맥락 provenance만 표시된다.
- [ ] selector에서 owner가 확인한 share option 하나로만 1080×1920 카드 preview/file을 만들고
  public invite를 share/copy/download/fallback할 수 있다.
- [ ] 모든 concept 공유는 비-romantic `shareSafeOthers` 윤곽 이상 및 A/B/contextual 근거를 요구하고
  self-only·romantic-only·trace·unsettled 공유를 거부한다.
- [ ] 전체 candidate에 share-eligible이 있으면 최종 3~5 hook 중 최소 하나가 결정적 승격 규칙으로 보장되고,
  이 발견성 승격과 무관하게 전체 `shareOptions`에서 non-default eligible concept도 선택할 수 있다.
- [ ] shareOptions 0개면 CTA가 없고, 1개면 owner 확인 뒤 진행하며, 2개 이상이면 추천 rank 1이
  자동 확정되지 않고 다른 option을 선택할 수 있다.
- [ ] non-default option 선택이 정확한 safe copy/card와 source pack same-pack CTA로 이어지고,
  romantic-only option은 없으며 forged concept/source는 server 404다.
- [ ] 공유 카드에 전체 결과, 방문자/관계 원자료, 개인 답변, 고정 유형, 점수, 퍼센트가 없다.
- [ ] v1/v2 response의 same-pack CTA가 같은 template/slug의 현재 v2/v3 owner play를 만들고
  `new_owner_pack_opened` 1건으로 집계되며 다른 slug는 집계되지 않는다.
- [ ] `same_pack_start_clicked`와 `pack_opened`는 어느 것이 먼저 저장돼도 marker 이후 같은 response와
  canonical template id+slug면 v2→v3가 1건이며, wrong template/slug는 0건이다.
  `docs/engineering/core-funnel-events.md`도 exact-version·상호 도착 순서를 요구하지 않는 같은 계약이다.
- [ ] analytics 요청의 conceptId는 자격 검증 뒤 폐기된다.
  신규 exposure/detail은 각각 `{packVersion}`만, 기존 profile/share/copy는 기존
  `entrySource`/`linkKind` canonical properties를 그대로 저장한다.
- [ ] account-level `/me`는 synthetic `profile_viewed` subject를 만들지 않고,
  enabled+hooks 성공 렌더에만 canonical 첫 hook source로 `concept_profile_viewed`를 mount당 1회 기록한다.
  strict rerender는 1회, browser reload는 새 1회이며 disabled/prestate/0 hooks/unavailable은 0회다.
- [ ] `concept_profile_viewed` exact body와 400/401/404-collapse/429/500 계약, source 소유권/allowed-hook 검증,
  internal owner_play_id와 exact `{packVersion}` property allowlist가 통과한다.
- [ ] 기존 profile event route가 기존 두 body를 그대로 받고 신규 exposure/detail 두 body만 추가하는
  strict discriminated union이며, variant별 extra key를 400으로 거부한다.
- [ ] detail은 final selected hook을 실제 열 때 `playId + "\0" + conceptId` sessionStorage key당 1회만 보내고,
  concept allowlist/selected hook/source ownership을 서버에서 재검증한 뒤 conceptId를 폐기한다.
- [ ] detail은 request `playId`가 selected hook의 profile source인지 재검증하고,
  기존 reshare는 share source play semantics를 그대로 유지해 각각 internal owner_play_id로만 기록한다.
- [ ] visitor/external id는 payload에서 금지되고 internal owner source id는 hook top-level,
  `shareOptions[].sourcePlayId`, DB owner_play_id에만 있으며
  analytics properties·로그·공유 산출물에는 없다.
- [ ] feature parser는 missing/false를 disabled, true만 enabled, 나머지를 startup error로 처리하고
  Render 기본 false→운영자 true 전환→운영자 false rollback runbook과 UI/API 동작이 검증된다.
- [ ] zero-cost verifier는 `GYEOP_CONCEPT_PROFILE_ENABLED`의 exact `value: "false"` 하나만 literal로 허용하고
  다른 env의 literal과 기존 secret/`sync: false` 위반을 계속 거부하며 full verify 회귀가 통과한다.
- [ ] hard-coded `pnpm test`가 concept catalog/profile/choice-order 새 unit 세 파일을 포함한다.
- [ ] `scripts/ai-verify --mode full`은 concept graph upgrade와 Render deploy smoke를 syntax check가 아닌
  실제 command로 무조건 실행하고, CI `ci-data-core`/`ci-static`도 같은 command를 실행한다.
- [ ] exact-head full verify가 두 integration 중 하나를 skip·누락하거나 실패를 무시하면 marker를 만들지 못하고
  final CI `verify`도 실패한다.
- [ ] reset local schema에서 canonical Supabase type을 재생성한
  `lib/db/database.types.ts`와 `scripts/verify-supabase-types.mjs` 결과가 byte-equal이며 drift가 0이다.
- [ ] `docs/engineering/p0-development-plan.md`가 concept hooks 3~5, owner safe share picker,
  활성 최신 24개와 69 version·690 card history를 설명하고 `scripts/verify_project.py` SSOT drift 검사를 통과한다.
- [ ] 새 concept API와 모든 owner 응답은 인증·rate limit·`private, no-store`·strict decoder를 통과한다.
- [ ] 320/390/430px, keyboard, focus-visible, screen reader name, reduced motion 회귀가 통과한다.
- [ ] 독립 비평의 P0/P1이 0이고 이 문서가 Reviewed로 전환된다.
- [ ] 독립 QA의 P0/P1이 0이고 QA 문서가 PASS다.
- [ ] task harness가 소유한 exact-HEAD full verify와 필수 CI가 통과한다.

## 테스트 계획

### Unit

- concept catalog exact keys, 8영역/32결, 중복/미등록 id 거부
- 24팩·240카드·289신호·48rewrite·0미매핑
- rewrite TSV exact 8열·48행, 네 문구 전수 deep equality, mapping TSV signals 순서 포함 exact equality
- context v1 exact 215 allowlist, unknown/near-match 거부, exact 전체 문자열 distinct
- `OFFICIAL_PACK_HISTORY`/`OFFICIAL_PACK_CARD_IDS` 69버전·690카드와 모든 과거 key 조회
- 팩당 영역/결/반복, 결당 카드/팩/맥락 생존 기준
- A/B 의미 방향 정규화와 좌우 순서 독립성, owner ordinal 1~10,
  visitor required 1~3/optional 4~5 exact 순서
- card score 범위와 respondent count 비가중
- pack 평균과 exact `packSlug + "\0" + packVersion + "\0" + cardId` dedupe
- 같은 cardId/다른 pack은 distinct, 같은 slug 반복 play는 source dedupe 뒤 동일 카드 1개 fixture
- 동일 slug `completedAt DESC, playId ASC` tie-break와 updatedAt 비의존
- 전체 completed/profile pair를 읽은 뒤 concept-only slug dedupe, 추가 RPC 0, model pair 최대 24
- trace/outline/clear 경계
- 중앙 unsettled와 A/B 각각 2카드·2팩·2 exact context인 contextual 구분
- repeated/difference/contextual/emerging 자격·우선순위·tie-break
- collecting 2+1 비합산과 0/1/2 progress
- concept profile/share payload strict decoder
- hook basis/profileEvidence/shareEvidence 조합, 고정 문구 재도출, romantic share 혼입 거부
- privateOthers romantic 포함 fixture와 shareSafeOthers romantic 제외 fixture
- self-only·romantic-only·trace·unsettled share unavailable
- shareable candidate가 초기 selection 밖에 있을 때 최하위 non-shareable 교체와 canonical tie-break
- 전체 share-eligible candidate의 stable-rank shareOptions, 최대 32, hook 밖 option 보존
- shareOptions exact safe fields와 romantic/private/self-only raw data 부재
- selector 0/1/2+ 상태, rank 1 추천 미자동확정, non-default option 선택
- hook stage self/others/both-min 및 source별 evidence line/count 비합산
- feature parser missing/false/true/empty/TRUE/1
- owner flow client가 public slug route 대신 play-id exact pack route를 호출하고
  `decodeOwnerFlow`가 slug/version mismatch를 거부함
- profile event strict union 네 variant와 extra/missing key 거부
- concept exposure client의 mount 1회/strict rerender 1회/오류 후 무재시도,
  detail `playId + "\0" + conceptId` sessionStorage 1회/오류 후 무재시도와 exact body
- zero-cost Render parser의 concept flag literal false 단일 예외와 다른 literal/secret/sync 위반 거부
- `CONCEPT_COPY_LIMITS` exact max/max+1 decoder와 1080×1920 한글/공백 없는 Latin fit
- canvas 공개 금지 필드 부재

### DB

- `bash tests/integration/concept-graph-upgrade.test.sh`를 local Supabase에 대해 직접 실행한다.
  이 스크립트는 clean content migration, idempotent re-run, partial/conflicting UUID,
  publish 호출 중 강제 실패, post-check 강제 실패, generated seed clean/re-run/conflict를
  각각 독립 transaction/DB fixture로 만들고 pointer/history count를 SQL assertion한다.
- migration fresh apply와 기존 migration upgrade
- content migration clean/re-run 24/240 pre-readback, 기존 publish helper 24회,
  transaction 중간 pointer 비노출, 호출/후검증/partial/conflict rollback
- generated seed clean/re-run 24/69/690 pre-readback과 partial/conflicting UUID rollback
- 과거 version/card concept column null과 immutable trigger
- 새 24 version의 concept_version=1, 240 card metadata 일치
- pack catalog SQL/integration의 69 version·690 card와 신규 current 24 pointer,
  위 표의 모든 current v3 exact id/version assertion
- publish 시 0/3/10개 metadata, malformed JSON, 알 수 없는 방향, 중복 signal 거부
- capability/authenticated exact pack RPC의 v1/v2 draft·completed와 current v2/v3,
  cross-owner/unknown/unpublished 격리
- 관계 유효 응답자 0/1/2/3과 카드 표본 0/1/2/3
- public/1:1, submitted/draft/withdrawn, 다른 play/version 격리
- 동일 카드 3명/300명의 API 안전 입력이 카드 하나로 유지
- 합법적인 response→assignment→answer exact version/card join이 한 번만 집계됨
- 동일 submit/idempotent answer retry·중복 API 시도 뒤 row 수와 집계 기여 불변
- 신규 `concept_profile_viewed`/`concept_detail_opened` 각각 `{packVersion}`,
  internal owner_play_id, 기존 profile/share/copy canonical properties 회귀,
  validation-only conceptId 폐기와 properties conceptId 거부
- reset local schema에서 `lib/db/database.types.ts` canonical generation/check drift 0
- core funnel의 v2 response→current v3 opened가 click→open/open→click 모두 같은 template/slug 집계 1,
  다른 template/slug 집계 0, 기존 same-version 집계 1

### Integration

- authenticated owner만 concept profile을 읽음
- 다른 계정 play 혼입 실패 닫힘
- `private, no-store`, 401/404/429/500 경계
- exact historical pack route의 capability/authenticated owner 성공, v1/v2 draft 이어하기·completed read,
  current v2/v3 read, cross-owner/unknown 404와 public pack current-only 회귀
- account server render와 GET API payload 동일
- 같은 slug의 completedAt 최신 선택 및 completedAt 동률 playId ASC 선택
- 모든 completed play profile을 기존처럼 읽고 account profile에 보존하며 concept builder 추가 RPC는 0
- v1/v2와 같은 slug 반복 play의 기존 plays/self/relationship/detail/count 보존
- 선택 뒤 updated_at 변경, share 생성·재공유, visitor 제출을 발생시켜도 source play 불변
- profile/share selection query tamper 거부
- account `/me`가 synthetic `profile_viewed`를 보내지 않고
  `concept_profile_viewed` exact body를 enabled+hooks 렌더 mount당 1회만 보냄
- 기존 profile event route 네 exact body와 strict extra field 400, unauthenticated 401,
  cross-owner/unknown/not-selected/source mismatch 404 collapse, disabled concept variants 404,
  rate 429, unexpected 500, 성공 204와 신규 stored properties exact `{packVersion}`
- detail concept allowlist/current final selected hook/source 재검증, conceptId 저장·로그 폐기,
  client exposure/detail 성공·오류 dedupe와 disabled/prestate/unavailable no-event
- share selection의 server-side concept/source ownership·eligibility 재검증과 forged pair 404
- detail request `playId`의 selected profile source 검증과 기존 reshare의 share source 검증,
  두 event의 internal owner_play_id 기록
- 기존 profile/share/copy가 entrySource/linkKind를 잃지 않음
- feature disabled `/me` legacy UI·concept API 404, enabled UI·200, invalid env startup 실패
- API/로그/analytics에 visitor/external id·답·관계·concept 결과와 analytics owner play property가 없음

### Playwright

- 새 팩 owner 10문항이 ordinal 1~10으로 좌우가 섞이고 저장 의미가 유지됨
- visitor required→optional ordinal 1~5의 exact 순서
  `a,b / b,a / a,b / b,a / a,b`와 저장·비교 의미 유지
- 한 팩 `흔적`, 여러 팩 `윤곽`, 6카드·3팩·3맥락 `선명`
- repeated/difference/contextual 세 훅
- initial top 3~5 밖의 shareable candidate 교체 후 share CTA 최소 하나
- basis=both의 `내 답변 n팩 · n맥락`/`주변 시선 n팩 · n맥락` 두 줄과 비합산 stage
- collecting `n/3`과 threshold 통과 뒤 others 방향
- native `왜 이렇게 보일까?` keyboard toggle과 aggregate provenance
- share concept 선택, 9:16 preview, OS share, download, copy, 수동 fallback
- 같은 팩 CTA와 새 owner 시작
- 실제 과거 v1/v2 owner profile·invite·visitor result read와 현재 v2/v3 same-pack 새 owner 시작
- account `/me`의 v1/v2·반복 completed play와 기존 relationship/detail/count 보존
- concept section strict rerender 노출 1회, browser reload 뒤 누적 2회,
  disabled/prestate/0 hooks/unavailable 노출 0회
- selected detail을 같은 tab session에서 반복 열어도 event 1회, 다른 selected concept은 각각 1회,
  disabled/prestate/not-selected/unavailable detail은 0회
- 2개 이상 shareOptions에서 non-default eligible concept 선택, exact safe copy와 9:16 card,
  그 source pack의 same-pack CTA
- romantic-only candidate selector 미노출, forged concept/source URL 404
- feature false legacy UI/API 404와 true concept UI/API 200
- 320/390/430px, focus, screen reader name, reduced motion

### Documentation

- `docs/engineering/p0-development-plan.md`의 `/me`가 관계 카드 중심 설명이 아니라
  concept hooks 3~5와 owner 선택형 safe share picker를 설명함
- 같은 문서의 catalog/history가 활성 최신 24개 v2/v3, 총 69 version·690 card와 일치함
- `python3 scripts/verify_project.py`가 위 문서 존재와 핵심 anchor drift를 검사함

### 전체 게이트

- `pnpm test`가 새 unit 세 파일을 포함
- `scripts/ai-verify` static/full/CI static의 실제 `bash tests/integration/render-deploy.test.sh`
- `scripts/ai-verify` data-core/full/CI data-core의 실제 `bash tests/integration/concept-graph-upgrade.test.sh`
- local reset 뒤 `node scripts/verify-supabase-types.mjs`
- focused unit/integration/e2e
- `git diff --check`
- 구현 완료 후 root의 `scripts/task-harness pr 157`가 exact clean HEAD에서 소유하는 full verify
- 동일 HEAD의 named `verify` CI

## 분석과 관측성

- 기존 내부 event allowlist에 `concept_profile_viewed`와 `concept_detail_opened`를 추가한다.
- concrete play profile 진입, share 선택/실행, same-pack 전환은 기존 이벤트를 재사용한다.
  account-level `/me` concept 노출은 별도 `concept_profile_viewed`이며 `profile_viewed`를 만들지 않는다.
- 새 dashboard나 외부 분석 dependency는 만들지 않는다.
- 운영 확인 항목:
  - concept profile 200/401/429 비율
  - concept_profile_viewed → profile_reshare_clicked
  - concrete profile_viewed → profile_reshare_clicked 기존 지표
  - profile_reshare_clicked → share success/copy
  - downstream visitor submitted → same_pack_start_clicked → new_owner_pack_opened
- concept id·방향·관계·raw count를 로그/analytics dimension으로 만들지 않는다.

## 개인정보와 악용 방지

- owner-only `/me`와 인증 계정 gate를 유지한다.
- public profile URL, visitor-facing concept API를 만들지 않는다.
- 기존 관계별 3명과 관계·카드 3표본을 모두 통과한 값만 private/share-safe others 입력으로 사용한다.
- `privateOthers`는 owner-only 화면에서만 threshold-safe romantic을 포함할 수 있다.
  외부 카드·share text·clipboard·public URL로 나가는 투영은
  `isProfileShareRelationship()`의 7개 allowlist에서 새로 계산한 `shareSafeOthers`만 사용한다.
- subthreshold 값을 pack/관계/play 사이에서 합치지 않는다.
- 1:1은 즉시 비교 외 concept 누적에서 제외한다.
- withdrawn는 기존 status filter로 즉시 빠지고 재계산 시 concept에도 남지 않는다.
- card count를 합쳐 개인 응답을 역산할 수 없도록 UI/API에서 raw A/B count와 퍼센트를 제거한다.
- provenance는 pack 제목과 context set만 반환한다.
- 공유는 owner가 직접 고른 hook 중 비-romantic `shareEvidence`가 윤곽 이상인 하나와
  그 evidence의 public invite만 허용한다. self-only 및 romantic-only 공유는 허용하지 않는다.
- 고정 진단, 점수, 우열 문구를 금지한다.
- query/string 조작으로 observation이나 concept id를 주입할 수 없도록 서버/strict catalog에서 다시 선택한다.
- analytics normalizer의 금지 property 경계를 유지한다.

## 롤아웃과 복구

### 배포 순서

1. additive schema/함수 migration을 적용한다.
2. 기존 45개와 신규 24개, 총 69개 version을 모두 strict-decode하는 호환 app을
   `GYEOP_CONCEPT_PROFILE_ENABLED=false`로 먼저 배포한다.
   DB current pointer가 원본이어도 owner/visitor 흐름이 동작하고 concept UI는 숨겨지며
   concept profile API와 기존 profile event route의 concept variants는
   일반 `404 not_found`로 실패 닫힘 처리한다.
3. 새 24버전 content migration을 적용하고 current pointer를 이동한다.
4. v1/v2 draft/completed exact owner flow, v1/v2/v3 owner profile·invite·visitor result,
   최신 24팩 owner flow와 public current-only pack smoke 뒤
   운영자가 Render server-only env를 exact `true`로 바꾸고 새 deploy를 성공시켜 활성화한다.
5. `/`, `/me`, concept API, 9:16 render, public invite, same-pack CTA를 확인한다.

DB 공개 pack API shape와 기존 `get_owner_profile` shape를 바꾸지 않는다. 새 app은 `packManifestHistory`로 원본/새 버전을 모두 허용하므로 app 배포와 pointer 이동 사이에도 strict decoder가 깨지지 않는다.

`GYEOP_CONCEPT_PROFILE_ENABLED`는 server-only emergency/config gate다. false일 때도
69개 history registry, concept column decoder, v1/v2/v3 exact owner pack/visitor 읽기,
기존 public invite와 same-pack CTA는 계속 동작하며 concept UI, `GET /api/me/concept-profile`,
기존 `POST /api/me/profile/events`의 concept variants만 비활성화한다.
`false` 전환 자체는 current pointer를 되돌리지 않는다.

전환과 rollback의 실행 owner는 운영자이며
`docs/engineering/private-mvp-zero-cost-runbook.md`에 다음 순서를 고정한다.

1. Render 기본 `false` deploy와 startup env validation 성공 확인
2. DB schema/content migration 성공 및 69/690 history·24 current pointer readback
3. v1/v2/v3 owner/invite/same-pack smoke
4. 운영자가 exact `true` 설정 후 deploy, concept UI/API/exposure/share smoke
5. 문제 시 운영자가 exact `false`로 재설정 후 deploy해 concept UI/API만 중단
6. 별도 content 문제가 있을 때만 승인된 forward pointer corrective migration 수행

### 복구

- 발행된 새 pack version/card를 update/delete하지 않는다.
- pack content 문제:
  1. forward corrective migration에서 24 template의 `published_version_id`를 이 스펙 표의 원본 version id로 되돌린다.
  2. guard가 요구하는 `gyeop.pack_publish_version_id` 설정과 exact expected id를 사용한다.
  3. 새 version은 published history로 보존한다.
- app 문제:
  1. `GYEOP_CONCEPT_PROFILE_ENABLED=false`로 concept UI/API만 끈다.
  2. 필요하면 current pointer를 원본 version으로 되돌리되 신규 v3 row와 기존 v3 play는 보존한다.
  3. 69개 history와 v1/v2/v3 decoder를 가진 호환 app에서 원본/신규 owner·visitor smoke를 확인한다.
  4. 수정은 그 호환 app의 forward corrective build로 배포한다.
  5. v3를 모르는 pre-v3 app commit은 어떤 복구 단계에서도 재배포하지 않는다.
- concept profile만 문제:
  - 운영자가 server-only gate를 exact `false`로 바꾸고 재배포하며 기존 owner profile/share manager, concept columns,
    69개 pack history, 모든 v3 play/answer/share 기록을 보존한다.
  - 이 flag rollback은 current pointer를 변경하지 않는다.
  - threshold나 strict decoder를 낮추는 임시 우회는 허용하지 않는다.
- migration은 drop/down migration으로 되돌리지 않는다. nullable additive column과 published history를 남기고 forward fix한다.

## 스펙 검토

Reviewer Agent: /root/issue_157_spec_critic_v7
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 제품 동작을 바꾸는 미결정 사항은 없다. 이 스펙의 계산 임계값과 공유 자격을 독립 비평에서 검증한 뒤 Reviewed 상태로 고정한다.
- 24개 신규 매니페스트와 rewrite TSV의 48개 `visitor_prompt`는 이 스펙에서 확정됐다.
  구현은 TSV exact value를 적용하고 catalog test와 독립 QA에서 48개를 전수 검수한다.
- v1 context 215개는 exact display tag라 반복성이 낮다. prefix를 합치거나 자유 입력을 허용하지 않고,
  contextual의 양쪽 방향별 2팩·2 exact context fixture로만 검증한다.
  taxonomy 통합·신규 context는 이 issue에서 remap하지 않고 별도 issue로 다룬다.
- private MVP 표본이 적어 처음에는 `흔적`과 collecting 상태가 많을 수 있다. 이를 임계값 하향으로 해결하지 않고 팩 완료·공개 링크 루프의 실제 데이터로 검증한다.
