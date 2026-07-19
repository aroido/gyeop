# Issue 20 구현 스펙: 1:1 링크 수명 주기 계약 고정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/20

## 목표

이미 동작하는 단일 사용 1:1 링크의 생성·목록 복구·원자 재발급·비활성화 계약을 현재 비공개 MVP의 play-bound owner capability 기준으로 고정하고, 공개 링크·공개 프로필과 섞이지 않는다는 회귀 증거를 완성한다.

## 범위

- `share_links.kind = one_to_one` 생성과 owner가 추천값을 덮어쓴 선택이 exact `POST /api/plays/[playId]/links` body로 전달되는 현재 계약을 검수한다.
- 1:1 링크 재발급이 기존 행을 `disabled`로 닫고 같은 `one_to_one` 종류의 새 public ID·secret hash 행을 한 transaction에서 만드는지를 pgTAP으로 직접 고정한다.
- 재발급된 1:1 링크가 owner 목록 reload 뒤에도 `one_to_one`·`active`로 복구되고, 비활성화 뒤 invite metadata가 공개 링크와 같은 일반 닫힘 상태를 반환하는지를 검증한다.
- DB에는 raw secret 대신 32-byte hash만 저장되고 analytics에는 `packVersion`·`linkKind` allowlist만 남는 기존 유출 방지 계약을 회귀 검증한다.
- 1:1 응답이 공개 `/me` 프로필 집계에서 제외되는 기존 owner profile pgTAP 계약을 완료 증거에 연결한다.
- 이슈 본문의 production-beta Auth 삭제 tombstone 문구를 비공개 MVP의 현재 owner capability·same-transaction authorization 경계로 정정한다.

## 제외 범위

- 방문자 응답 생성, 필수 3장 배정, 첫 제출 원자 소비와 동시 제출 차단은 이미 후속 visitor-response migration이 소유하므로 변경하지 않는다.
- 1:1 개별 비교, 응답 철회 UI, 알림, 공개 프로필 노출 선택은 변경하지 않는다.
- Supabase Auth, 이메일 로그인, 계정 삭제, retained deletion tombstone, current/old recovery reader는 production beta 재승인 전까지 비활성 범위이므로 구현하지 않는다.
- 링크 schema, 새 status, 새 API route, 새 analytics event를 추가하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `supabase/migrations/20260718000400_share_links.sql`
- `supabase/migrations/20260718001100_core_funnel_events.sql`
- `lib/share-links/share-links.ts`
- `lib/share-links/share-link-client.ts`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 주인은 팩 추천이 공개 공유여도 1:1을 직접 고르고 링크를 만든 뒤, 새로고침 후 목록에서 `1:1 친구`와 `사용 중` 상태를 다시 확인할 수 있다.
- 주인이 재발급하면 기존 초대는 즉시 닫히고 새 1:1 링크만 사용할 수 있다. 새 링크를 비활성화하면 방문자는 링크 존재 여부를 구분할 수 없는 일반 닫힘 화면만 본다.
- 방문자가 1:1 응답을 완료해도 그 결과는 즉시 비교에만 쓰이고 주인의 공개 누적 프로필에는 들어가지 않는다.
- 전환된 새 주인의 same-pack 시작 흐름에는 변화가 없다.

## 디자인 영향

- 새 화면과 스타일 변경은 없다.
- 기존 공유 관리 화면의 `여러 친구`/`1:1 친구`, `사용 중`/`비활성`, `새로 발급`/`비활성화` 문구와 포커스 흐름을 그대로 검증한다.

## API와 데이터 영향

- route와 request schema는 기존 exact 경계를 유지한다: `POST /api/plays/[playId]/links`, `PATCH /api/links/[linkId]`, `POST /api/links/[linkId]/rotate`, `GET /api/me/plays/[playId]/links`.
- DB migration은 추가하지 않는다. 기존 `create_share_link`, `rotate_share_link`, `disable_share_link`, `list_owner_share_links`, `get_invite_metadata` RPC 계약을 테스트로 고정한다.
- 비공개 MVP의 owner mutation 권한은 Auth UID가 아니라 `__Host-gyeop-owner`의 play id와 management secret hash다. 각 RPC는 `private.authorize_owner_play_capability`를 transaction 안에서 호출하고 completed play·link 귀속을 함께 검사한다.
- `rotate_share_link`는 원본 row lock 아래 원본 kind·expiry를 읽고 새 행을 insert한 뒤 원본을 disable한다. unique collision이면 exception block 전체가 rollback되어 원본을 다시 열거나 반쯤 교체하지 않는다.
- owner 목록·analytics·invite metadata에는 raw secret 또는 전체 invite URL을 저장·반환하지 않는다. 생성·재발급 서버 wrapper는 새 secret과 전체 URL을 일시 생성해 한 번 응답하고, 이후에는 브라우저 메모리에만 남긴다. 방문자 metadata·start 요청은 fragment에서 읽은 secret을 필요한 same-origin POST body로 일시 전송하지만 request body를 log하거나 저장하지 않는다.

## 구현 계획

1. `supabase/tests/share_links.test.sql`에 1:1 전용 재발급 fixture와 검증을 추가한다. 먼저 active 1:1 원본에 기존 ID·public ID·secret hash와 충돌하는 replacement를 넣어 `collision`을 받고 원본 active·새 행 0건·analytics 증가 0건을 확인한다. 이어 non-colliding 재발급에서 새 행 kind가 `one_to_one`, 원본이 `disabled`인지 확인하고, 원본 재발급 재시도가 새 행을 만들지 않으며 replacement 비활성화 뒤 invite가 `unavailable`인지 검증한다.
2. `tests/e2e/share-links.spec.ts`의 1:1 lifecycle 시나리오에 재발급 뒤 reload를 넣고 목록의 종류·상태가 유지되는지 확인한 뒤 replacement를 비활성화한다.
3. 기존 live owner E2E의 실제 1:1 생성, exact analytics payload, raw credential DB leak 0건과 owner profile pgTAP의 공개 집계 제외를 focused 검증으로 재실행한다.
4. GitHub 이슈 #20 설명을 현재 비공개 MVP owner capability 경계와 실제 남은 완료 기준으로 정정한다.
5. focused 검증을 묶어 통과시킨 뒤 최종 커밋에서 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 완료 기준

- active completed owner play만 `one_to_one` 링크를 만들고, 추천값과 무관하게 owner가 고른 kind가 생성·목록 reload에 유지된다.
- 1:1 재발급의 unique collision은 원본을 active로 유지하고 새 행·analytics를 만들지 않는다. non-colliding 재발급만 기존 링크를 `disabled`로 닫으면서 새 ID·secret hash와 동일 kind의 active replacement를 원자 생성한다.
- disabled 원본 또는 replacement는 invite metadata에서 `unavailable`로 수렴하고 재발급·공유 이벤트를 다시 만들지 않는다.
- owner 관리 화면은 reload 뒤에도 공개/1:1 종류와 active/disabled 상태를 구분하고 replacement 비활성화를 완료한다.
- DB·analytics에서 raw secret·`#k=`·전체 URL이 0건이고, 저장 링크 credential은 32-byte hash다. 공유 관련 app/lib source에는 request body나 전체 URL을 남기는 `console.*` logging이 없다.
- 1:1 응답은 공개 owner profile의 sight count와 질문별 표본에 포함되지 않는다.
- Auth 계정 삭제 race를 구현한 것으로 오해할 문구가 이슈 계약에 남지 않고, active SSOT의 play-bound capability 범위와 일치한다.

## 테스트 계획

- `pnpm supabase:reset && pnpm exec supabase test db supabase/tests/share_links.test.sql --local && pnpm exec supabase test db supabase/tests/owner_profile.test.sql --local`
- `node scripts/verify-share-links.mjs`
- `GYEOP_NEXT_DIST_DIR=.next/e2e-3120 GYEOP_E2E_PORT=3120 pnpm exec playwright test tests/e2e/share-links.spec.ts --project=mobile-chromium --workers=1`
- `GYEOP_NEXT_DIST_DIR=.next/e2e-3121 GYEOP_E2E_PORT=3121 GYEOP_E2E_LIVE=1 pnpm exec playwright test tests/e2e/owner-play-live.spec.ts --project=mobile-chromium --workers=1`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 새 이벤트는 없다. `share_link_created`, `share_handoff_succeeded`, `share_link_copied`의 기존 `packVersion`·`linkKind`와 선택적 fixed `entrySource` allowlist만 유지한다.
- native share 취소·실패는 성공 이벤트를 만들지 않고, 1:1 링크 생성·복사 성공만 기존 퍼널에 기록한다.

## 개인정보와 악용 방지

- raw 256-bit secret은 생성·재발급 응답과 필요한 same-origin metadata·visitor start POST body에서만 일시 처리한다. DB, analytics, owner 목록에 저장하지 않고 request body·전체 URL을 log하지 않으며, 브라우저에서는 URL fragment와 생성 직후 메모리에만 둔다.
- 공개 ID·secret hash·상태가 모두 맞는 active 링크만 invite metadata를 제공하며, unknown·wrong secret·disabled·expired는 같은 일반 실패로 수렴한다.
- 1:1 링크는 첫 제출 뒤 닫히며 공개 집계에서 제외된다. 이번 PR은 그 후속 소비 transaction을 변경하지 않는다.
- owner link mutation은 현재 play-bound capability, completed play, same-play link 귀속을 모두 확인해 cross-play·tampered capability를 fail-closed 처리한다.

## 롤아웃과 복구

- migration과 runtime 동작 변경이 없는 회귀 테스트 보강이므로 feature flag나 데이터 backfill은 없다.
- 테스트가 기존 계약과 충돌하면 제품 코드를 우회하지 않고 active SSOT와 실제 사용자 흐름을 다시 확인한다.
- 문제 발생 시 이 PR의 테스트·문서 변경만 되돌리면 되며 기존 링크 데이터와 API에는 영향이 없다.

## 스펙 검토

Reviewer Agent: issue20_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 기능은 이미 여러 후속 이슈에서 구현됐으므로 중복 migration이나 두 번째 route를 만들지 않는 것이 핵심이다.
- 1:1 재발급 DB 테스트 fixture가 기존 public 재발급 fixture와 ID·analytics 기대값을 공유하므로, 결과 순서가 아니라 exact row identity와 kind로 검증한다.
- 미결정 사항과 구현 블로커는 없다.
