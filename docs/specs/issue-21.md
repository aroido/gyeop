# Issue 21 구현 스펙: [프론트엔드] 공개 링크 외부 공유·복사 흐름 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/21

## 목표

`old-friend` 10장을 완료하고 공개 또는 1:1 링크를 만든 owner가 현재 화면 memory에만 있는 전체 invite URL을 OS 공유 메뉴 또는 링크 복사로 실제 친구에게 전달하게 한다. 브라우저가 보고한 handoff·copy 성공 신호와 취소·실패를 구분하고, reload로 raw secret을 잃은 상태에서는 공유 성공을 가장하지 않고 명시적인 재발급 경로만 제공한다.

이 PR은 첫 핵심 가설의 `셀프 10장 완료 → 공개·1:1 링크 생성 → 실제 외부 전달` 구간을 닫는다. 방문자 관계·응답 session은 #22, 3장 제출·1:1 소비·비교·동일 팩 전환은 #24, 누적 프로필 재공유 진입은 #58이 소유한다.

## 범위

- `/me/plays/[playId]`의 공개·1:1 링크 생성·회전 직후 ready state에 native Web Share와 Clipboard API 동작을 추가한다.
- ready state를 `{ linkId, kind, inviteUrl }`로 묶어 현재 raw URL과 해당 sanitized link row의 결합을 명시한다.
- Web Share 지원 환경에는 `친구에게 공유하기`를 primary, `링크 복사`를 secondary로 제공한다. 미지원 환경에는 disabled/fake share control 없이 `링크 복사`를 단일 primary로 제공한다.
- Clipboard API 미지원·거부·실패 시 전체 URL이 든 readonly 수동 복사 field를 focus/select하고 접근 가능한 실패 안내를 제공한다.
- share resolve, share cancel, share failure, copy success, copy failure를 구분하고 browser API가 보고한 성공에서만 분석 event를 보낸다.
- reload·새 mount 뒤에는 list의 sanitized active link만 복구하고 share/copy controls를 표시하지 않는다. active 공개·1:1 링크 row에 `전체 링크가 사라져 새로 발급해야 공유할 수 있음`을 설명하고 기존 atomic rotate를 재발급 경로로 사용한다.
- `POST /api/me/plays/[playId]/share-events`와 owner-capability 기반 `record_owner_share_action` RPC를 추가해 성공 event만 server-side allowlist로 기록한다.
- `share_handoff_succeeded`, `share_link_copied` event에는 DB에서 확인한 exact `packVersion`, 실제 `linkKind=public|one_to_one`만 기록하고 URL·secret·channel·recipient를 받거나 저장하지 않는다.
- 새 route/RPC/RLS policy와 share UI를 source verifier, unit, pgTAP, integration, mobile Playwright, live Supabase E2E로 고정한다.
- `docs/engineering/p0-development-plan.md`의 실제 route/RPC/event/UI 계약을 갱신한다.

## 제외 범위

- 1:1 링크의 첫 제출 소비·동시 제출 차단·비공개 비교. 실제 소비 transaction은 #24가 소유한다.
- 카카오 SDK, Instagram Graph API, 채널별 deep link, 채널 아이콘 목록, 주소록·contact picker, QR code, 자동 메시지 발송.
- share 대상 채널·수신자·연락처·share sheet 결과 수집.
- full URL이나 fragment secret 복구, list API 추가 field, cookie/localStorage/sessionStorage/IndexedDB 보관.
- 방문자 관계 선택·24시간 response session·카드 배정·응답 제출·비교 결과.
- 공개 프로필, 프로필 공유, profile reshare entry source. #58이 기존 action surface를 재사용한다.
- 외부 analytics SaaS, dashboard, conversion 목표 자동 판정, A/B 실험 framework.
- legacy `document.execCommand('copy')`와 브라우저 permission 선요청.

## SSOT

- `docs/product/core-feature-priority.md` §2, §5.4, §5.5
- `docs/product/question-pack-spec.md` §12 `default_share_kind`
- `docs/product/decision-log.md`의 `P0 공유 대상은 특정 팩 링크`, 표시 이름 없음, same-browser owner capability 결정
- `docs/engineering/p0-development-plan.md` §13.2 분석 event와 공유 성공 payload 금지 규칙
- `docs/specs/issue-19.md`의 one-time ready URL, secret fragment, owner capability, sanitized reload 계약
- `supabase/migrations/20260718000100_security_data_access.sql`의 `gyeop_internal_rpc` privileged role 계약
- `supabase/migrations/20260718000400_share_links.sql`의 기존 policy/owner/grant, completed play, link lifecycle 계약
- `app/me/plays/[playId]/share-link-manager.tsx`, `lib/share-links/share-link-client.ts`, `lib/http/share-links.ts`의 현재 ready state, request/no-store, generic owner boundary
- `AGENTS.md`
- `.codex/AGENTS.md`

제품 의미를 바꾸는 새 결정은 없다. `core-feature-priority.md`의 카카오톡·Instagram·문자 지원은 Web Share가 OS에 설치된 target을 노출하고 링크 복사가 각 앱 붙여넣기를 지원한다는 P0 수준으로 구현한다. 특정 앱을 설치 여부와 무관하게 직접 버튼으로 가장하지 않는다.

## 사용자 흐름 영향

### 지원 브라우저의 공개·1:1 링크 전달

1. owner가 `/me/plays/[playId]`에서 `여러 친구에게 공개` 또는 `한 친구에게 1:1`을 선택하고 링크를 생성하거나 active 링크를 회전한다.
2. 성공 response의 `{ link, inviteUrl }`을 한 mounted client의 ready state에만 보관한다.
3. ready panel은 `공유 링크가 준비됐어요`, 짧은 전달 문구, `친구에게 공유하기`, `링크 복사`, 전체 URL 수동 field를 한 묶음으로 보여준다.
4. owner가 `친구에게 공유하기`를 누르면 exact Web Share data를 전달한다.
   - `title`: `겹 · 오래된 친구팩`
   - `text`: `내가 먼저 답한 오래된 친구팩이야. 너는 나를 어떻게 보는지 3장만 골라줘.`
   - `url`: 현재 ready state의 canonical full invite URL
5. `navigator.share()`가 resolve하면 `공유 메뉴로 링크를 전달했어요.`를 polite status로 보여주고 `{ event: "share_handoff_succeeded", linkId }`만 분석 route에 best-effort POST한다.
6. `AbortError`이면 `공유를 취소했어요. 링크는 그대로 있어요.`를 보여주고 event를 보내지 않는다.
7. 다른 reject이면 `공유 메뉴를 열지 못했어요. 링크 복사를 사용해 주세요.`를 alert로 보여주고 event를 보내지 않으며 copy control로 이동할 수 있다.

### 링크 복사 fallback

1. `링크 복사`는 Web Share 지원 여부와 link kind에 관계없이 ready 링크에 항상 보인다.
2. click 시에만 `navigator.clipboard.writeText(inviteUrl)`을 호출한다. mount·hover·focus에서 clipboard permission을 읽거나 요청하지 않는다.
3. resolve하면 `링크를 복사했어요. 카카오톡이나 인스타그램 DM, 문자에 붙여넣어 보내세요.`를 polite status로 보여주고 `{ event: "share_link_copied", linkId }`만 best-effort POST한다.
4. API 부재·throw·reject이면 성공 event를 보내지 않고 `자동 복사가 안 됐어요. 아래 링크를 길게 눌러 직접 복사해 주세요.`를 alert로 보여준다. readonly field에 focus하고 전체 텍스트를 select한다.
5. 수동 복사는 브라우저가 자동 성공을 증명할 수 없으므로 별도 success event를 기록하지 않는다.

### reload와 link 상태 변화

- reload, route remount, owner state reload는 ready state를 `null`로 시작한다. list에는 public id·kind·status만 있고 raw secret이 없으므로 URL을 재구성하지 않는다.
- active 공개·1:1 link row에는 `이 화면을 다시 열어 전체 링크가 사라졌어요. 공유하려면 새로 발급해 주세요.`와 기존 `새로 발급` action을 보여준다.
- 회전 성공은 old row를 disabled로 바꾸고 새 `{ linkId, kind, inviteUrl }` ready state를 만든다. 회전 cancel/failure에서는 기존 raw URL을 지우지 않는다. server가 link state drift를 반환한 경우에만 안전하게 clear하고 list를 reload한다.
- current ready link를 비활성화하면 ready state와 feedback을 즉시 clear한다.
- create로 다른 링크를 만들거나 다른 link를 회전하면 ready state는 방금 발급한 하나로 교체된다. 여러 raw URL을 browser state에 누적하지 않는다.
- React state와 별개인 synchronous `actionLatchRef`를 각 handler의 첫 browser/domain action 전에 획득하고 `finally`에서 해제한다. action in-flight 동안 create/rotate/disable/share/copy를 모두 잠가 same-tick double activation과 share sheet URL/link 상태 경쟁을 막는다. confirm이 필요한 handler는 confirm 승인 직후, mutation 전에 latch를 획득한다.

### 1:1 링크

- `one_to_one` 생성·회전도 #19의 one-time ready URL에 같은 native share/copy controls와 browser-reported event POST를 제공한다.
- share data의 일반 문구는 공개 링크와 같고 OS target에서 특정 상대에게 보내도록 한다. client가 recipient/channel을 지정하거나 기록하지 않는다.
- server event는 실제 DB row에서 `linkKind=one_to_one`을 기록한다.
- first submit consume와 동시 제출 차단은 #24까지 발생하지 않는다. 기존 active 1:1 lifecycle, owner override, reload sanitization을 회귀 테스트한다.

## 디자인 영향

- 대상 화면은 기존 `/me/plays/[playId]` share manager다. 새 route나 modal을 만들지 않고 생성 직후 ready panel 안에서 행동을 끝낸다.
- Lazyweb 실제 모바일 레퍼런스 probe는 native share sheet와 명시적 copy action을 같은 invite surface에서 제공하는 패턴을 보여줬다. 현재 화면 기반 build 보고서: `https://www.lazyweb.com/report/lazyweb/fb941355-5eca-4271-9fa4-a510d6d54e4b/`.
- ready panel hierarchy는 kind와 관계없이 `성공 heading → 한 줄 설명/추천 문구 → primary share → secondary copy → feedback → 수동 URL field` 순서다.
- Web Share 미지원이면 primary share를 숨기고 copy가 full-width primary가 된다. 지원 여부를 모르는 hydration 구간에는 disabled button이나 지원을 가장하는 문구를 렌더하지 않는다.
- custom Kakao/Instagram/SMS icon button을 만들지 않는다. native share sheet의 target 선택 또는 copy 후 붙여넣기 안내만 제공한다.
- URL은 `공유 링크 직접 복사` accessible label을 가진 readonly single-line field 하나로 보여주고 horizontal page overflow 없이 field 내부 scroll/select가 가능해야 한다. raw URL을 별도 code block, React key, `data-*`, `title`, hidden input에 복제하지 않는다.
- success/cancel은 `role=status`/`aria-live=polite`, actionable failure는 `role=alert`를 사용한다. 동일한 메시지를 두 live region에 중복 렌더하지 않는다.
- 320/390/430px에서 share/copy/action target은 44px 이상, visible focus, keyboard tab order, reduced-motion, 가로 overflow 없음 조건을 유지한다.
- share/copy success·cancel·share failure는 trigger focus를 유지하고 feedback은 live region으로만 announce한다. copy failure에서만 수동 field로 focus/select한다. create/rotate 성공은 ready panel heading에 focus해 새 action을 알린다.

## API와 데이터 영향

### migration

`supabase/migrations/20260718000500_share_handoff_events.sql`을 추가한다.

- 기존 `analytics_share_invite_internal_insert` policy를 drop하고 `analytics_share_flow_internal_insert` policy를 만든다.
- 허용 event는 `share_link_created|invite_opened|share_handoff_succeeded|share_link_copied` exact 네 개다.
- 네 event 모두 properties exact key를 `packVersion|linkKind`로 고정한다. `packVersion`은 string, `linkKind`는 `public|one_to_one` enum이다.
- `share_handoff_succeeded|share_link_copied`는 새 RPC가 확인한 실제 row kind를 사용하므로 `linkKind`는 `public|one_to_one`이다.
- 기존 role의 analytics direct SELECT/UPDATE/DELETE 금지와 INSERT-only grant를 유지한다.

### `public.record_owner_share_action`

exact signature:

```sql
record_owner_share_action(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_link_id uuid,
  p_event_name text
) returns jsonb
```

- `SECURITY DEFINER`, owner `gyeop_internal_rpc`, `search_path=''`, service_role execute-only 기존 계약을 따른다. migration은 기존 temporary schema create·role membership grant → function owner 변경 → 모든 temporary grant revoke 순서를 그대로 재사용하며 새 privileged role을 만들지 않는다.
- null/UUID/hash length/event enum을 mutation 전에 검증하며 event enum은 `share_handoff_succeeded|share_link_copied` exact 두 개다.
- transaction 첫 domain 단계에서 `private.authorize_owner_play_capability(p_play_id, hash, false)`를 정확히 한 번 호출한다. Auth UID/owner anchor를 사용하지 않는다.
- capability helper가 잠근 play에서 `play.status`와 pack version을 조회하고 `status='completed'`를 먼저 확인한다. draft/not-completed는 link를 잠그거나 만지기 전에 `outcome=not_completed`로 반환하며 event, link mutation, owner TTL 갱신이 모두 0이다.
- completed 확인 뒤 `(pack_play_id, link_id)` row를 `FOR UPDATE`로 잠근다. effective expiry를 `expired`로 수렴시킨 뒤 exact `kind in ('public','one_to_one') and status='active'`일 때만 event를 insert한다.
- missing/cross-play/disabled/expired는 event 0건이고 public route에서 generic owner 404로 수렴한다.
- success event properties는 DB row와 pack version join으로 만든 `jsonb_build_object('packVersion', version.version, 'linkKind', link.kind)`뿐이다. client의 kind/packVersion/URL/channel을 입력으로 받지 않는다.
- success는 `outcome=recorded`, owner management TTL/expiresAt을 반환해 current owner cookie를 renew한다. event action 하나마다 row 하나를 기록하며 사용자 반복 성공을 임의 dedupe하지 않는다.
- event insert 실패는 transaction 전체를 rollback하고 success를 반환하지 않는다.

### HTTP route

`POST /api/me/plays/[playId]/share-events`

- strict JSON body: `{ "event": "share_handoff_succeeded" | "share_link_copied", "linkId": "<canonical UUID v4>" }`.
- path play id는 canonical UUID v4여야 한다. body에는 URL, public id, secret/hash, kind, pack version, channel, recipient field가 없다. unknown/extra/coerced key는 400이다.
- `withPublicRequest`의 proxy proof, same-origin, JSON/UTF-8/size, security headers와 `privateNoStore:true`를 사용한다.
- callback 첫 domain 단계에서 exact `owner_play_access`, network key, 600초, 120회 limiter를 호출한다.
- limiter 뒤 named owner cookie를 strict parse하고 cookie play id와 path play id가 exact match할 때만 RPC를 한 번 호출한다.
- success는 `204 No Content`, `Cache-Control: private, no-store`, renewed owner cookie를 반환한다.
- missing/malformed/expired/tampered/cross-play/not-completed/inactive link는 기존 owner generic 404 body/header와 cookie 보존·삭제 규칙을 따른다.
- 429/400/404/500 response와 server exception에 request body나 raw URL을 포함하지 않는다.

### browser client

- `lib/share-links/share-handoff-core.mjs`: browser-safe exact message/data builder, Web Share result 분류 helper, AbortError 분류. `node:*`, storage, logging을 사용하지 않는다.
- `lib/share-links/share-link-client.ts`: `recordShareAction(playId, linkId, event)`를 추가한다. exact path/body만 만들고 204 + private no-store를 검증한다. invite URL을 argument/body에 받지 않는다.
- analytics POST는 browser가 보고한 action success를 바꾸지 않는 best-effort side effect다. action feedback을 먼저 확정하고 rejection은 swallow하되 console/error telemetry에 request 값을 기록하지 않는다. endpoint는 browser success를 cryptographically 증명하지 못하는 client-reported signal이며 rate limit 밖의 신뢰 근거로 사용하지 않는다.

## 구현 계획

1. `20260718000500_share_handoff_events.sql`에 policy 교체와 `record_owner_share_action`을 추가하고 pgTAP으로 public·1:1 active success, draft/cross-play/inactive failure, exact payload, grant/RLS를 고정한다.
2. local DB reset 뒤 `lib/db/database.types.ts`를 재생성하고 `lib/db/internal-rpc.ts`에 exact wrapper/outcome decoder를 추가한다.
3. `owner-play-schemas.ts`, `lib/http/share-links.ts`, exact POST route에 strict schema, owner cookie/path, limiter, private 204 response를 구현한다.
4. browser-safe handoff core와 client event helper를 만들고 native share/copy 성공·취소·실패를 unit test한다.
5. `ShareLinkManager`의 raw ready state를 link-bound object로 바꾸고 양 kind share/copy UI, reload guide, focus/live feedback, synchronous action latch를 구현한다.
6. data-access/HTTP/share source verifier를 새 RPC/route와 forbidden URL/event payload 규칙으로 확장한다.
7. focused unit, pgTAP, HTTP integration, mocked mobile Playwright, real Supabase E2E를 추가한다.
8. mocked deterministic invite URL만 사용하는 320/390/430px, Web Share 지원/미지원, clipboard 실패 screenshot/browser QA를 수행하고 report 권고와 실제 화면 hierarchy를 대조한다. live E2E는 trace/screenshot/video를 명시적으로 끈다.
9. `docs/engineering/p0-development-plan.md` route/RPC/event/UI 계약을 실제 구현과 맞춘다.
10. `./scripts/run-ai-verify --mode full`을 통과한다.

## 완료 기준

- [ ] public·1:1 create/rotate success 직후 current mounted screen에만 share/copy controls가 보이고 exact invite URL을 사용한다.
- [ ] native share resolve만 `share_handoff_succeeded` POST와 success feedback을 만들며 AbortError/other reject는 event 0건이다.
- [ ] Web Share 미지원에는 disabled/fake share action이 없고 link copy가 primary로 동작한다.
- [ ] clipboard resolve만 `share_link_copied` POST와 success feedback을 만들며 API 부재/reject/throw는 event 0건과 focused/selected manual fallback을 제공한다.
- [ ] share data는 exact title/text/url이며 custom channel·recipient data를 추가하지 않는다.
- [ ] analytics request body는 exact event/linkId이고 full URL, fragment secret, public id, channel, recipient, pack/card/answer 값을 포함하지 않는다.
- [ ] DB RPC는 completed same-play owner capability와 active public·1:1 link에서만 event를 기록하고 draft/cross-play/disabled/expired/tampered 요청은 event·TTL·unexpected link mutation 0이다.
- [ ] event row properties는 DB-derived exact packVersion/linkKind만 포함하며 link kind는 실제 public 또는 one_to_one이다.
- [ ] reload 뒤 active link가 있어도 raw URL/share/copy control이 없고 재발급 안내와 atomic rotate만 제공한다.
- [ ] ready link disable은 raw URL을 clear하고 rotate success는 old URL을 폐기해 새 URL 하나만 유지한다.
- [ ] 1:1 share/copy success는 one_to_one event를 기록하되 link를 consume하지 않고 #19 lifecycle을 유지한다.
- [ ] synchronous latch가 same-tick double activation과 share/copy/action 경쟁 click의 중복 browser API 호출·stale link event를 막는다.
- [ ] 320/390/430px에서 가로 overflow가 없고 44px target, keyboard tab, visible focus, heading focus, trigger-focus 유지, live-region feedback, reduced motion이 동작한다.
- [ ] raw full URL/secret이 DB, app log, analytics, cookie, browser storage, request path/query, error body, React key/data attribute에 남지 않는다.
- [ ] full verify가 통과한다.

## 테스트 계획

### unit/source policy

- exact Korean share title/text와 current URL의 Web Share data
- resolved, AbortError, other rejection 분류와 성공 event gate
- clipboard success/failure 분류와 event gate
- malformed play/link UUID와 unknown event를 client/schema/RPC에서 거절
- source verifier가 storage, console, URL-in-event-body, direct table client, raw internal client export를 거절
- data-access gate가 capability helper 누락·중복·late call, Auth actor/owner anchor, link lock 전 analytics mutation을 거절
- HTTP gate가 owner limiter/cookie/path 검증 전 RPC, arbitrary event, non-private response를 거절

### pgTAP

- policy/grant/function owner/signature exact inventory
- active public·one-to-one same-play 두 event success와 exact kind별 properties
- draft/not-completed, disabled, expired, cross-play, malformed event, tampered capability event 0과 draft의 owner TTL/link 불변
- expiry 수렴과 management TTL/cookie renewal result
- direct service/anon analytics table 접근과 anon RPC execute 거절
- 기존 `share_link_created`, `invite_opened` policy/event 회귀
- analytics fixture baseline을 transaction 안에서 정리해 반복 실행 안전

### integration/API

- real proxy/origin boundary를 거친 204/private no-store/cookie renewal
- strict input extra/coercion/URL field 400와 domain RPC 0
- missing/malformed/tampered/cross-play/not-completed/inactive generic owner boundary와 event 0
- owner limiter over-limit에서 event RPC 0, exact Retry-After
- analytics DB scan에 full URL, raw secret, public id, channel, recipient, A/B 값 없음
- event endpoint는 inviteUrl을 받지 않고 DB row에서 packVersion/linkKind를 계산

### Playwright

- Web Share supported: exact data, resolve success feedback, exact event body 1회
- Web Share AbortError/other reject: cancel/error feedback, event 0, copy fallback 유지
- Web Share unsupported: share button 없음, copy primary
- clipboard success: exact full URL 1회 write, success feedback, exact event body 1회
- clipboard missing/reject/throw: event 0, alert, manual field focus/select, keyboard copy 가능
- same-tick double activation과 share in-flight 중 create/rotate/disable/copy synchronous 잠금
- reload 뒤 full URL/share/copy 없음, active 양 kind 재발급 안내, rotate 뒤 새 controls 복구
- current ready disable clear, another create/rotate ready replacement
- one-to-one share/copy exact data, one_to_one event, no consume, ready/list 회귀
- 320/390/430 mobile overflow, 44px, keyboard, focus, live region, reduced motion

### live Supabase E2E

- completed owner → public create → stubbed native share resolve → 실제 public event row exact 1건
- one-to-one create → copy resolve → 실제 one_to_one event row exact 1건과 active 유지
- cancel/failure에 event 0
- reload → rotate → old URL unavailable/new URL share 가능, raw secret DB/event scan 0
- live 실행은 Playwright trace/screenshot/video를 off로 강제해 무작위 raw secret을 artifact에 남기지 않는다.

### final

- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- `share_handoff_succeeded`: Web Share promise resolve 직후에만 client가 요청한다.
- `share_link_copied`: Clipboard `writeText` resolve 직후에만 client가 요청한다.
- 둘 다 exact `packVersion`, 실제 DB의 `linkKind=public|one_to_one`만 기록한다.
- `linkId`는 owner authorization/DB lookup input일 뿐 analytics properties에 저장하지 않는다. full URL, fragment secret/hash, public id, play id, channel, recipient/contact, IP/network 원문, user agent, owner/visitor 선택은 저장하지 않는다.
- 브라우저 성공 뒤 analytics POST가 실패해도 browser-reported 사용자 성공 feedback은 유지한다. event 수집 실패를 공유 실패로 거짓 표시하거나 자동 재시도로 중복 집계하지 않는다.
- 이 endpoint는 owner client가 직접 반복 호출할 수 있으므로 browser API 성공의 attestation이 아니라 rate-limited client-reported signal이다. 단독 KPI로 신뢰하지 않고 `invite_opened`와 후속 funnel을 대조한다.
- share cancel, share failure, clipboard failure, 수동 복사는 성공 event가 아니다.
- #31이 owner→share→visitor→same-pack 전체 funnel schema와 금지 payload를 통합 검증한다. #21은 두 success event의 생성 경계만 소유한다.

## 개인정보와 악용 방지

- raw secret/full URL은 create/rotate response와 current browser memory/DOM, 명시적 Web Share/clipboard 호출에만 존재한다.
- full URL을 analytics route body/path/query, server log, exception, DB function argument, DB row, cookie, storage, React key/data attribute로 보내지 않는다.
- Web Share와 clipboard는 사용자의 click handler 안에서만 호출한다. 자동 share/copy, permission prompt 선요청, background retry를 하지 않는다.
- browser는 link kind/packVersion을 analytics truth로 보내지 않는다. server가 owner capability, completed play, active public·1:1 link를 확인해 DB row에서 계산한다.
- event endpoint는 valid owner capability라도 다른 play/link, draft/not-completed play, inactive/expired link에 사용할 수 없다.
- same-origin/proxy/rate-limit/body-size/strict schema/private-no-store 기존 HTTP 경계를 유지한다.
- manual field는 사용자가 현재 화면에서 이미 가진 raw URL만 보여주며 재구성하거나 숨은 복제본을 만들지 않는다.
- visual regression과 screenshot QA는 고정 test credential만 사용한다. random live secret을 다루는 E2E는 trace/screenshot/video를 off로 실행하고 failure message에도 URL을 출력하지 않는다.
- CSP, HSTS, `Referrer-Policy: no-referrer`, `nosniff` 기존 header gate를 유지한다.

## 롤아웃과 복구

- migration은 기존 analytics policy를 호환 가능한 superset으로 교체하고 RPC 하나만 additive하게 추가한다. 기존 #19 create/open event는 그대로 허용된다.
- 새 UI가 없는 이전 release는 새 RPC를 호출하지 않으며 기존 링크 lifecycle에 영향이 없다.
- app rollback 시 route/client를 이전 release로 되돌리고 새 RPC/policy는 남겨도 안전하다. DB migration을 down/drop하지 않는다.
- 새 route가 실패해도 share/copy browser action 자체는 계속 성공 feedback을 제공하고 owner link 상태는 변하지 않는다.
- Web Share가 브라우저별로 불안정하면 지원 detection으로 숨기고 copy-only 경로로 기능을 유지한다. feature flag나 UA sniffing을 추가하지 않는다.
- native share data/copy 문구 변경은 secret/analytics 계약과 독립적인 client copy 변경으로 rollback 가능하다.

## 스펙 검토

Reviewer Agent: issue21_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- Web Share promise resolve는 브라우저가 제공하는 handoff 성공 신호이며 수신자가 실제로 읽거나 방문했다는 증거는 아니다. funnel에서는 후속 `invite_opened`와 대조한다.
- iOS/Android가 native share sheet에 노출하는 앱 목록과 text/url 조합 방식은 OS·target app이 소유한다. GYEOP은 target별 deep link 성공을 보장하거나 channel을 기록하지 않는다.
- manual copy는 브라우저 API 성공 신호가 없어 `share_link_copied`로 세지 않는다.
- share/copy endpoint 호출은 owner browser가 보고한 성공 신호이며 악의적 owner의 직접 호출을 증명 불가능하게 막는 attestation은 P0 범위가 아니다. 실제 전달 가설은 `invite_opened`와 대조한다.
