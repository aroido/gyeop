# Issue 31 구현 스펙: [데이터] P0 생성·전환·재공유 핵심 퍼널 event 검증

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/31

## 목표

기존 owner→share→visitor→new owner 흐름에 DB에서 검증한 내부 subject만 연결해, 응답 선택·관계·URL·secret 없이 세 핵심 재미 가설의 단계별 전환을 하나의 SQL view로 계산한다.

## 범위

- `analytics_events`에 nullable `owner_play_id`와 `share_link_id` 내부 subject를 추가하고 기존 `visitor_response_id`와 함께 event별 허용 조합을 restrictive RLS policy로 고정한다.
- 새 owner 생성 transaction에서 `pack_opened`, 최초 완료 transaction에서 `self_pack_completed`를 exact-once로 기록한다.
- 홈 시작은 `entrySource=home`, 제출된 방문자의 같은 브라우저 CTA에서 실제 새 owner가 생성된 경우에만 `entrySource=same_pack_cta`와 검증된 `visitor_response_id`를 연결한다.
- `create_share_link`의 event insert를 같은 transaction에서 교체해 `share_link_created`에도 DB-derived `owner_play_id`와 `share_link_id`를 연결한다.
- `profile_viewed`, `profile_reshare_clicked`, `share_handoff_succeeded`, `share_link_copied`에 DB-derived `owner_play_id`를 연결하고 share action에는 DB-derived `share_link_id`도 연결한다.
- 기존 create/complete/share RPC도 새 core 경계로 위임해 active·stale·rollback server 경로 모두 exact-once subject 계약을 지킨다.
- 기존 `relationship_selected` properties의 `relationshipCode|knownSinceCode`를 migration에서 제거하고, insert normalization과 RLS가 이후에도 `packVersion|linkKind`만 허용한다.
- `private.core_funnel_stage_counts` view에 다음 단계와 distinct subject 수를 제공한다.
  - `owner_share`: `self_pack_completed` → `public_link_created` → `public_share_succeeded`
  - `visitor_same_pack`: `visitor_required_submitted` → `comparison_viewed` → `same_pack_start_clicked` → `new_owner_pack_opened`
  - `profile_reshare`: `profile_viewed` → `profile_reshare_clicked` → `profile_share_succeeded` → `downstream_visitor_submitted`
- event별 producer, subject, properties allowlist, dedupe, SQL 해석을 `docs/engineering/core-funnel-events.md`에 표로 고정한다.
- pgTAP에서 schema·RLS·properties·exact-once·세 funnel stage count·금지 payload를 검증하고, 기존 live owner flow가 실제 view count를 확인하도록 확장한다.

## 제외 범위

- 외부 analytics SaaS, dashboard, export pipeline, 사용자별 화면
- 1:1 링크, 선택 2장, 철회, 이메일 event의 새 funnel
- IP, user agent, 전체 URL, fragment, channel, recipient, relationship, known-since, A/B 선택 저장
- 기존 event row의 추정 backfill과 과거 `same_pack_cta` source 복원
- share 성공 횟수 자체를 사용자 수로 해석하는 기능; conversion은 distinct subject 존재 여부로 계산한다.

## SSOT

- `docs/product/core-feature-priority.md` §핵심 퍼널, §P0 승인 기준
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md` §8.1, §8.3, §13.2
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 홈에서 시작한 사용자의 화면과 이동은 그대로이며 새 owner row가 만들어질 때 `home` 시작 event만 추가된다.
- 방문자가 비교 화면의 `나도 이 팩으로 시작하기`를 누르면 기존 클릭 event를 유지하고, 유효한 response cookie와 같은 pack이 DB에서 확인된 실제 새 owner 생성만 전환 완료로 기록한다.
- response cookie가 없거나 malformed·expired·다른 pack이면 새 owner 시작 자체는 막지 않고 `home`으로 계측해 거짓 same-pack 전환을 만들지 않는다.
- 기존 owner cookie가 있어 새 owner가 생성되지 않고 resume되는 경우 `new_owner_pack_opened`로 세지 않는다.
- 프로필 재공유와 일반 공유 UI는 바뀌지 않으며 취소·실패는 기존처럼 성공 event를 만들지 않는다.

## 디자인 영향

- 화면, 문구, 레이아웃 변경 없음.
- `/play/new`의 기존 `source=same_pack_cta` query를 analytics 방향 신호로만 읽고 렌더링에는 사용하지 않는다.

## API와 데이터 영향

- migration `supabase/migrations/20260718001100_core_funnel_events.sql`
  - `analytics_events.owner_play_id → pack_plays(id) ON DELETE SET NULL`
  - `analytics_events.share_link_id → share_links(id) ON DELETE SET NULL`
  - owner/share subject partial indexes와 owner lifecycle exact-once partial unique index
  - 기존 analytics insert policy들을 하나의 exact permissive allowlist와 하나의 restrictive subject/forbidden-payload policy로 교체한다.
  - migration 시각을 한 행으로 고정하는 private marker를 만들고 view는 marker 이후 event만 읽는다.
  - 기존 `create_or_resume_play` 구현을 private core로 이동하고, 기존 public signature는 `home` default로 source-aware wrapper에 위임한다. 새 `create_or_resume_play_with_source(...)`는 created 결과에만 `pack_opened`를 기록한다.
  - 기존 `complete_owner_play` 구현을 private core로 이동하고 같은 public signature wrapper가 `self_pack_completed`를 exact-once 기록한다.
  - `create_share_link`, profile/share RPC는 기존 public signature를 유지한 채 DB-derived subject columns를 함께 insert하도록 교체한다. 4-argument share action은 source-aware 함수에 `null` source로 위임한다.
  - BEFORE INSERT analytics trigger는 `relationship_selected`의 legacy 관계·시점 keys를 제거하고 모든 event에서 금지 keys가 남으면 실패한다. migration은 기존 관계·시점 properties도 삭제한다.
  - response가 `withdrawn`으로 전이되거나 삭제되면 연결 event의 `visitor_response_id`를 null로 scrub하며 view는 null·non-submitted response를 제외한다.
  - `private.core_funnel_stage_counts`는 raw ID나 properties를 반환하지 않고 `funnel`, `stage`, `subjects`만 반환한다.
- `POST /api/plays` input은 exact `{packSlug, entrySource}`이며 `entrySource`는 `home|same_pack_cta`만 허용한다.
- `app/play/new`는 exact scalar `source=same_pack_cta`만 전달하고 그 밖의 값·array는 `home`으로 정규화한다.
- API는 같은 요청의 visitor cookie를 파싱해 valid일 때만 response ID/hash를 내부 RPC로 전달한다. client body와 query에는 response ID·secret을 추가하지 않는다.
- `lib/db/database.types.ts`와 `lib/db/internal-rpc.ts`는 새 wrapper RPC signature만 노출하며 raw table access를 추가하지 않는다.

### Event subject와 properties matrix

| event | owner_play_id | share_link_id | visitor_response_id | exact properties | 세 funnel 사용 |
|---|---|---|---|---|---|
| `pack_opened` home | required | null | null | `packVersion,entrySource=home` | owner start 참고 |
| `pack_opened` same pack | required | null | required, submitted·unexpired·same pack | `packVersion,entrySource=same_pack_cta` | `visitor_same_pack.new_owner_pack_opened` |
| `self_pack_completed` | required | null | null | `packVersion` | `owner_share.self_pack_completed` |
| `share_link_created` | required | required, same owner | null | `packVersion,linkKind` | public만 `owner_share.public_link_created` |
| `share_handoff_succeeded`, `share_link_copied` | required | required, same owner | null | `packVersion,linkKind` 또는 profile source일 때 fixed `entrySource` 추가 | owner/profile share success |
| `profile_viewed` | required | null | null | `packVersion` | profile cohort |
| `profile_reshare_clicked` | required | null | null | `packVersion,entrySource=profile_reshare` | profile click |
| `invite_opened` | null | null | null | `packVersion,linkKind` | 제외; legacy aggregate 방향 신호 |
| `relationship_selected` | null | null | required | `packVersion,linkKind` | 제외; 관계·시점 key 금지 |
| visitor started/answer/submitted/comparison/same-pack-click | null | null | required | `packVersion,linkKind` | visitor funnel |

`owner_play_id`, `share_link_id`, `visitor_response_id`는 properties에 복제하지 않는다. owner/link 삭제는 FK `ON DELETE SET NULL`, response 삭제 또는 `withdrawn` 전이는 `visitor_response_id=NULL`로 연결을 제거한다. scrub 뒤 matrix와 맞지 않는 과거 row가 남아도 insert policy 우회가 아니며 모든 funnel view CTE에서 제외한다.

### Funnel cohort와 순서

- 모든 CTE는 private marker의 `started_at` 이상인 event만 사용한다.
- `owner_share`는 marker 이후 `self_pack_completed` owner를 cohort로 고정한다. 같은 owner의 이후 public `share_link_created`만 2단계, 그 exact link의 이후 public share-success event만 3단계다.
- `visitor_same_pack`는 marker 이후 `visitor_required_submitted` response를 cohort로 고정한다. 같은 response의 이후 `comparison_viewed`, 같은 response의 `same_pack_start_clicked`, valid same-pack source로 같은 response에 연결된 `pack_opened`가 모두 존재할 때만 마지막 단계다. click fetch와 navigation의 경합 때문에 click과 pack-opened 상호 순서는 요구하지 않지만 둘 다 marker 이후여야 한다.
- `profile_reshare`는 marker 이후 `profile_viewed` owner를 cohort로 고정한다. 같은 owner의 이후 click, 그 이후 profile-source public share success를 순서대로 요구한다. downstream 단계는 그 exact `share_link_id`에 속하고 share-success `occurred_at` 이후 `submitted_at`인 public response가 현재도 `submitted`일 때만 센다. share 이전에 열린 draft라도 제출이 이후면 포함하며, 이미 제출됐던 response는 제외한다.
- 각 stage의 `subjects`는 위 선행 CTE의 교집합에 속한 distinct owner/response 수다. 독립 event 총량을 conversion으로 사용하지 않는다.

## 구현 계획

1. migration에서 subject columns, FKs, 최소 indexes, marker, analytics normalizer, exact policies와 ordered stage-count view를 추가한다.
2. create/complete core+wrapper, subject-aware `create_share_link`, 기존 profile/share RPC 교체를 구현하고 service-role exact allowlist를 갱신한다.
3. owner create client→route→HTTP wrapper→internal RPC에 allowlisted entry source와 server-parsed visitor capability를 연결한다.
4. complete adapter를 event-aware wrapper RPC로 교체한다.
5. generated DB type과 static data-access verifier 기대값을 갱신한다.
6. event 계약 문서와 product/engineering SSOT의 analytics table·event 설명을 subject-aware·relationship-free 규칙으로 맞춘다.
7. pgTAP fixture에서 세 funnel을 구성하고 view count, 취소/실패 무기록, duplicate 호출, forbidden payload/column 조합을 검증한다.
8. 기존 `owner-play-live.spec.ts`에서 owner→public share→visitor submit/compare→same-pack new owner와 profile reshare→후속 visitor submit을 실행한 뒤 view stage count delta를 확인한다.

## 완료 기준

- [ ] 한 owner play의 완료와 공개 공유 성공이 같은 `owner_play_id`로 연결되고 `owner_share` stage를 SQL로 계산한다.
- [ ] public `share_link_created`가 exact owner/link subject를 가지며 그 link의 이후 성공만 owner conversion으로 센다.
- [ ] submitted response의 비교·CTA와 실제 새 owner 생성이 valid response capability 및 같은 pack일 때만 같은 `visitor_response_id`로 연결된다.
- [ ] profile view/click, profile-source public share success, 그 `share_link_id`의 이후 submitted response가 `profile_reshare` stage로 계산된다.
- [ ] repeated complete, comparison, same-pack click과 같은 owner lifecycle event가 stage subject 수를 늘리지 않는다.
- [ ] native share 취소와 clipboard 실패는 share success event와 funnel conversion에 포함되지 않는다.
- [ ] 기존 row를 포함한 analytics properties와 view에는 이메일, IP, user agent 원문, URL, secret/hash, channel/recipient, relationship/known-since, A/B 선택이 없다.
- [ ] response withdrawn/delete와 owner/link delete 뒤 subject가 scrub되고 관련 stage count에서 빠진다.
- [ ] marker 이전 row와 선행 cohort가 없는 후행 event는 stage count에서 빠진다.
- [ ] anon/authenticated/service role은 raw analytics table/view를 직접 읽을 수 없고 app code는 raw table client를 추가하지 않는다.
- [ ] 기존 owner/share/profile/visitor flow와 rollback-compatible RPC가 유지된다.

## 테스트 계획

- [ ] `pnpm test -- tests/unit/owner-flow-policy.test.mjs tests/unit/owner-play-session.test.mjs`
- [ ] `pnpm test:db -- supabase/tests/core_funnel.test.sql` 또는 repository의 focused pgTAP 실행
- [ ] `node scripts/verify-data-access.mjs`
- [ ] `GYEOP_E2E_LIVE=1 pnpm exec playwright test tests/e2e/owner-play-live.spec.ts --project=mobile-chromium --workers=1`
- [ ] `./scripts/run-ai-verify --mode full`은 최종 clean commit에서 한 번만 실행한다.

## 분석과 관측성

- view의 `subjects`는 event row 수가 아니라 distinct owner play 또는 visitor response 수다.
- `public_share_succeeded`는 `linkKind=public`인 `share_handoff_succeeded|share_link_copied` 중 하나 이상이 있는 owner 수다.
- `new_owner_pack_opened`는 same-pack source와 검증된 source response가 함께 연결된 created owner만 센다.
- `downstream_visitor_submitted`는 profile-source share success의 exact `share_link_id`에 대해 성공 event 이후 제출된 response가 하나 이상인 owner 수다.
- 외부 공개 view나 dashboard는 만들지 않으며 운영자는 private SQL view만 읽는다.

## 개인정보와 악용 방지

- owner/response/link UUID는 권한이 아닌 내부 pseudonymous join key이며 properties나 client URL에 복제하지 않는다.
- same-pack attribution은 query 문자열만 신뢰하지 않고 HttpOnly response cookie hash, submitted 상태, session expiry, pack-version 일치를 DB에서 검증한다.
- restrictive policy가 event별 nullable subject 조합과 exact properties policy를 함께 강제한다.
- profile/share subjects는 client가 보낸 ID가 아니라 owner capability로 검증한 play/link row에서 derive한다.
- `private` view는 raw subject를 반환하지 않고 집계 수만 반환하며 public/anon/authenticated/service_role에 grant하지 않는다.
- `source=same_pack_cta`는 client-reported 방향 신호이며 CTA 자체의 암호학적 증명이 아니다. 같은 response의 click event와 실제 created owner event를 함께 요구하고, 위조해도 데이터 접근 권한은 늘어나지 않는다.

## 롤아웃과 복구

- additive nullable columns, indexes, marker, view와 wrapper RPC로 배포하며 기존 public RPC도 safe default로 같은 core를 사용한다.
- migration rollback은 view·새 RPC·policies/indexes/FKs/columns 역순 제거와 app의 기존 RPC 호출 복귀다.
- marker 이전 event는 source를 추정하지 않고 모든 funnel stage에서 제외한다. 관계·시점 properties 제거만 기존 row에 적용한다.
- 배포 후 event subject policy나 live funnel delta가 실패하면 외부 계측 없이 기능은 유지하되 issue를 완료하지 않는다.

## 스펙 검토

Reviewer Agent: issue31_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- visitor response cookie는 단일 same-browser response만 보존하므로, CTA 직전 valid cookie가 사라진 경우 기능은 계속되지만 same-pack 전환 attribution은 보수적으로 누락된다.
- `share_handoff_succeeded`와 `share_link_copied`는 browser-reported 방향 신호다. funnel은 distinct subject 존재 여부만 사용하고 성공 횟수나 수신자를 추정하지 않는다.
