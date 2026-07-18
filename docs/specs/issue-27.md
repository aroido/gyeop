# Issue 27 구현 스펙: [데이터] 주인용 최소 시선 프로필 구현

Status: Draft
Issue: https://github.com/aroido/gyeop/issues/27

## 목표

`old-friend` 팩을 완료하고 공개 링크를 공유한 주인이 `/me`에서 자신의 셀프 답변 10장, 공개 링크로 완료된 친구 수, 질문별 익명 A/B 누적을 확인하고 다시 공유하게 한다.

이 PR은 세 번째 핵심 가설인 `프로필에 실제 시선이 쌓이면 다시 공유하고 싶은가`만 검증한다. 공개 프로필, 관계별 레이어, 1:1 집계, AI 해석 없이 `공개 링크 제출 → 익명 누적 → 재공유`를 owner capability 하나로 닫는다.

## 범위

- additive migration `20260718000900_owner_profile.sql`에 owner 전용 `get_owner_profile`, `record_owner_profile_event` RPC와 `profile_viewed` analytics insert policy를 추가한다.
- `get_owner_profile`은 현재 owner cookie의 play id와 management secret hash를 받고, 같은 transaction의 첫 domain 단계에서 `private.authorize_owner_play_capability(..., true)`를 정확히 한 번 호출한다. 별도 event RPC도 같은 helper를 `touch=false`로 정확히 한 번 호출한다.
- 집계 대상은 해당 play의 `kind='public'` share link에 귀속된 `visitor_responses.status='submitted'`와 그 response의 실제 `visitor_answers`뿐이다.
- 별도 aggregate table, snapshot, counter column을 만들지 않고 현재 원본 row를 live query한다.
- owner 전용 `GET /api/me/profile`을 추가한다. client가 owner id, play id, response id를 body/query/header로 전달하지 않는다.
- `/me` 모바일 화면에 공개 링크 완료 시선 수, 익명 최근 상태, 셀프 10장, 카드별 표본 부족 또는 A/B 수, 재공유 CTA를 구현한다.
- 카드별 실제 sample이 0~2이면 A/B count를 RPC wire부터 반환하지 않고 `sampleCount`만 반환한다. 3 이상이면 A/B count를 반환한다.
- `/me`가 strict profile을 실제 렌더한 뒤 `POST /api/me/profile/events`로 `profile_viewed`를 best-effort 기록한다. properties는 `{ packVersion }` exact set만 허용한다.
- 기존 completed owner 화면과 공유 링크 관리 화면에 `/me` 진입점을 추가한다.
- strict decoder, generated DB types, source verifier, unit·pgTAP·integration·Playwright를 함께 갱신한다.
- active product/engineering SSOT와 decision log에 private MVP profile의 public-link-only 범위를 명시해 현재 문서 충돌을 해소한다.

## 제외 범위

- 외부 방문자가 보는 공개 프로필과 공개 profile URL.
- 이름, 표시 이름, 사진, bio, 팔로워/팔로잉, 게시물, 피드, 탭형 SNS 프로필.
- 관계별 count·레이어·민감 관계 분류와 관계 threshold. production beta 재승인 후보로 유지한다.
- 1:1 응답의 전체 시선 수·카드 집계 포함 및 개별 owner 비교. #28 또는 후속 재승인 이슈가 소유한다.
- 방문자 선택 2장과 철회. 각각 #25, #26이 소유하며 현재 Project #5 core 범위에는 포함하지 않는다.
- materialized aggregate, cache table, queue, 이메일·웹 푸시 알림.
- `마지막으로 본 시각` watermark와 읽음 처리. 최근 상태는 방문자 row나 시각을 노출하지 않는 익명 파생 상태만 반환한다.
- AI 요약, 성격 문장, 고정 유형, 친밀도 점수, 순위, 추천.
- Auth UID, 이메일 계정, cross-device 복구, 복수 owner play 선택기.

## SSOT

- `docs/product/core-feature-priority.md` §5.7
- `docs/product/question-pack-spec.md` §8
- `docs/product/decision-log.md`의 비공개 same-browser owner, 특정 팩 링크 공유, AI 없는 프로필 결정
- `docs/engineering/p0-development-plan.md` §11.3, §11.4, §12, §13.2
- `docs/specs/issue-17.md`의 owner capability·cookie·generic 404 계약
- `docs/specs/issue-23.md`의 공개 링크 카드 배정·표본 scope 계약
- `docs/specs/issue-24.md`의 submitted response·visitor answer·analytics 계약
- `supabase/migrations/20260718000300_owner_play_session.sql`
- `supabase/migrations/20260718000800_visitor_required_response.sql`
- `AGENTS.md`
- `.codex/AGENTS.md`

현재 `docs/engineering/p0-development-plan.md` §12는 private 전체 시선에 공개+1:1을 포함하지만 이슈 #27은 private 재미 검증을 submitted public-link only로 명시한다. active product SSOT의 `1:1 응답은 공개 프로필 집계에 자동 포함하지 않는다`는 경계와 최소 core loop를 우선해, 이번 PR에서 다음처럼 정렬한다.

- 비공개 재미 검증의 `/me` 전체 시선과 카드 집계는 submitted public-link only다.
- 1:1은 방문자 본인의 즉시 비교에만 남고 `/me` 누적에는 포함하지 않는다.
- production beta에서 private 전체 시선에 1:1을 포함할지는 owner private comparison 정책과 함께 다시 승인한다.

질문·선택지·Signature와 `old-friend-v1` 내용은 바꾸지 않는다.

## 사용자 흐름 영향

### 완료 owner

1. 주인은 완료된 `/play/[playId]`의 `내 시선 프로필` 또는 `/me/plays/[playId]` 공유 관리 화면의 같은 진입점으로 `/me`에 이동한다.
2. 브라우저는 HttpOnly owner cookie를 자동 전송하고 `GET /api/me/profile`을 호출한다. JS는 cookie의 play id나 management secret을 읽지 않으며, authorized profile 응답의 `playId`만 재공유 path에 사용한다.
3. 성공하면 상단에서 `공개 링크로 도착한 시선 N`을 본다. 이 브라우저가 마지막으로 본 `sightCount`보다 현재 값이 크면 개별 정보 없이 `새 시선 도착`을 보고, 값이 같거나 watermark를 사용할 수 없으면 `시선이 쌓여 있어요`라는 현재 상태만 본다.
4. 셀프 10장을 pack position 순서로 본다. 각 카드에는 owner 질문, A/B 선택지, 내 선택이 항상 보인다.
5. 해당 카드의 submitted public sample이 0~2이면 `시선을 모으는 중 · n/3`만 보이고 어느 선택에 몇 명이 답했는지는 알 수 없다.
6. sample이 3 이상이면 A/B count와 전체 sample을 본다. count 합은 sample과 같아야 한다.
7. 하단 `친구에게 더 공유하기`는 현재 play의 `/me/plays/[playId]`로 이동해 기존 공개 링크 생성·공유 흐름을 재사용한다.
8. strict profile을 화면에 commit한 뒤 client가 `profile_viewed` event를 best-effort 전송한다. event 실패는 화면이나 재공유 CTA를 막지 않는다.

### 응답 도착과 새로고침

- 새 public response가 submitted되면 다음 profile GET이 live query로 전체 시선과 해당 세 카드 sample/count에 즉시 반영한다.
- 0→1→2에서는 value가 계속 숨고 진행 문구만 바뀐다. 3번째 submitted answer가 도착한 카드만 A/B count가 열린다.
- draft response, 1:1 response, 다른 owner play의 response, assignment만 있고 submitted되지 않은 response는 어떤 수치도 바꾸지 않는다.
- 이미 submitted된 response의 source link가 나중에 disabled/expired되어도 response 자체가 유효한 동안 계속 센다. link kind는 생성 당시 `public`이어야 한다.
- aggregate snapshot이 없으므로 별도 refresh mutation은 없다. 브라우저 reload가 최신 원본 상태를 읽는다.

### 권한 실패

- absent cookie는 domain RPC 없이 generic owner 404다.
- malformed cookie는 domain RPC 없이 같은 owner 404 body를 반환하고 잘못된 cookie만 삭제한다.
- parser를 통과한 expired credential은 RPC의 `expired` 뒤 같은 owner 404 body를 반환하고 cookie를 삭제한다.
- parser를 통과한 tampered/nonexistent/composed id+secret은 RPC `not_found` 뒤 같은 owner 404 body를 반환한다. 이 invalid credential은 정상 owner cookie가 아니며 삭제해 반복 실패를 끝낸다.
- `/api/me/profile`은 current-cookie-only endpoint라 target play id를 받지 않는다. 정상 play A cookie는 A profile, 정상 play B cookie는 B profile을 각각 성공시킨다. B cookie로 A를 지정하는 HTTP 요청 형태가 없으므로 이를 cross-play 404라고 부르지 않는다.
- SQL 경계에서는 `p_play_id=A + hash=B` 합성 credential을 tampered/cross-play 공격으로 테스트하고 0 profile row를 확인한다. path-scoped 기존 `/api/me/plays/[playId]/*`는 A path+B 정상 cookie mismatch를 RPC 전에 거절하며 B cookie를 보존하는 기존 계약을 유지한다.
- draft owner play는 capability는 유효하지만 profile prerequisites가 없으므로 `not_completed`로 수렴하고 같은 owner 404 body를 반환한다. RPC가 refreshed management expiry를 함께 반환하고 HTTP가 정상 cookie를 갱신해 DB/browser TTL을 맞춘다.
- byte-identical은 status, JSON body bytes, content type, cache policy를 뜻한다. malformed/expired/tampered의 cookie 삭제와 valid draft의 cookie refresh는 의도된 header 차이다.

## 디자인 영향

- 기존 검정 배경, 라임 accent, blue focus/offset, 좁은 mobile column을 유지한다. 새 디자인 시스템이나 illustration을 추가하지 않는다.
- Lazyweb create research는 8개 query 중 7개 성공, 102개 deduped mobile reference를 반환했지만 profile 외곽의 계정·팔로워·피드 패턴은 GYEOP 핵심 가설과 맞지 않아 채택하지 않는다. 근거는 전환 lift가 아닌 방향성 참고다.
- 채택하는 공통 패턴은 `상단 핵심 숫자 → 의미별 card section → 다음 행동`의 짧은 hierarchy와, 미완성 상태를 숨기지 않고 progress로 표현하는 방식뿐이다.
- `/me`의 첫 viewport는 brand, h1 `내 시선 프로필`, 설명, 전체 공개 시선 metric, 익명 최근 상태를 보여준다. avatar·닉네임·설정·bottom tab을 추가하지 않는다.
- 카드 10장은 세로 목록이다. 각 card는 `01` position, owner prompt, 두 option, `내 선택` marker, aggregate section 순으로 읽힌다.
- 내 선택과 친구 집계는 색만으로 구분하지 않는다. text label, border/shape, `aria-label` 또는 visible count를 함께 쓴다.
- threshold 미달은 A/B bar나 0 count를 렌더하지 않는다. exact 문구 `시선을 모으는 중 · n/3`과 `친구가 이 질문을 만날 때마다 한 표본이 쌓여요.`만 제공한다.
- threshold 충족은 A/B 두 행에 선택지와 count를 표시한다. 비율 bar를 쓰더라도 screen reader용 `A n명, B m명` text가 있고 count가 primary truth다.
- primary action은 `친구에게 더 공유하기` 하나다. 홈, 공개 프로필 만들기, 분석 자세히 보기 같은 경쟁 CTA를 두지 않는다.
- loading은 `내 시선을 불러오는 중…`, terminal은 기존 owner generic 문구 `이 프로필을 열 수 없어요`와 홈 CTA를 사용한다. terminal 화면은 capability 실패 종류를 설명하지 않는다.
- 320/390/430px에서 horizontal overflow가 없어야 하고 모든 interactive target은 44px 이상이다. h1/terminal heading focus, keyboard navigation, `prefers-reduced-motion`을 검증한다.

## API와 데이터 영향

### DB migration

새 additive migration `20260718000900_owner_profile.sql`은 다음을 한 transaction에 적용한다.

- `public.get_owner_profile(p_play_id uuid, p_management_secret_hash bytea) returns jsonb`를 추가한다.
- 입력 null 또는 hash length가 32 bytes가 아니면 `22023`이다. Route는 canonical parsed cookie만 전달한다.
- transaction 첫 domain 단계에서 `private.authorize_owner_play_capability(p_play_id, hash, true)`를 정확히 한 번 호출한다. 별도 precheck나 Auth actor query를 두지 않는다.
- helper 결과가 `authorized`가 아니면 그대로 `expired|not_found`를 반환하고 profile query/event insert를 하지 않는다.
- play가 `completed`가 아니거나 셀프 답변이 pack의 exact 10장이 아니면 `not_completed`와 refreshed `managementExpiresAt`, `managementTtlSeconds`를 반환한다. HTTP는 generic 404 body와 함께 같은 raw owner cookie의 TTL을 갱신한다.
- authorized+completed이면 다음 live query를 실행한다.
  - total sight: `share_links.pack_play_id=p_play_id AND kind='public'`에 귀속된 `visitor_responses.status='submitted'` row count.
  - card sample: 위 response 중 `visitor_assignments.card_id=pack_card.id`에 연결된 `visitor_answers` count.
  - A/B count: 같은 answer set의 `choice='a'|'b'` filtered count.
  - 다른 play/version, draft, one_to_one은 join 조건에서 제외한다.
- card는 pack position 1~10으로 exact 10개를 반환한다. 셀프 답변이 없는 card를 숨겨 partial profile로 만들지 않는다.
- sample `< 3`이면 `counts` key value는 JSON null이고 sample count만 0|1|2다. SQL이 hidden count를 별도 key, percentage, order, label에 우회 노출하지 않는다.
- sample `>= 3`이면 `counts={a,b}`이고 `a+b=sampleCount`다.
- `sightStatus`는 submitted public response가 없으면 `empty`, 하나 이상이면 `has_sight`다. 이는 현재 상태이고 `새로 도착함`을 주장하지 않는다. latest response id, relationship, submitted_at은 반환하지 않는다.
- `public.record_owner_profile_event(p_play_id, p_management_secret_hash, p_event_name)`는 `p_event_name='profile_viewed'`만 받고, 같은 transaction에서 capability helper를 정확히 한 번 `touch=false`로 호출한 뒤 completed play인지 확인한다. authorized+completed에서만 `analytics_events(event_name='profile_viewed', visitor_response_id=null, properties={'packVersion': version})`를 insert하고 `recorded`를 반환한다.
- `record_owner_profile_event` failure는 `expired|not_found|not_completed`다. profile data나 response/visitor row를 반환하지 않는다.
- exact permissive policy `analytics_profile_viewed_internal_insert`는 `event_name='profile_viewed'`, null visitor_response_id, string packVersion, 추가 property 없음만 허용한다.
- 새 table, counter, trigger, background refresh는 없다. 현재 index인 `share_links(pack_play_id, status, created_at)`과 `visitor_responses(share_link_id, status, submitted_at)`, assignment/answer PK로 먼저 검증한다. p95 300ms 또는 play당 10,000 submitted response 전에는 materialization을 추가하지 않는다.
- 함수는 `SECURITY DEFINER`, `search_path=''`, 모든 object schema-qualified, PUBLIC/anon/authenticated/service_role execute revoke, `gyeop_internal_rpc`만 execute를 지킨다.

### RPC wire와 strict decoder

DB RPC 결과는 다음 strict union이다.

- invalid capability failure: `{ outcome:'expired'|'not_found' }`
- valid draft/incomplete: `{ outcome:'not_completed', managementExpiresAt, managementTtlSeconds:604800 }`
- success: `{ outcome:'authorized', managementExpiresAt, managementTtlSeconds:604800, profile }`

`profile` exact shape:

```text
{
  playId: canonical UUID,
  packSlug: 'old-friend',
  packVersion: non-empty version,
  packTitle: non-empty reviewed title,
  sightCount: non-negative safe integer,
  sightStatus: 'empty' | 'has_sight',
  cards: [exactly 10 OwnerProfileCard]
}
```

`OwnerProfileCard` exact shape:

```text
{
  cardId: reviewed lower-kebab id,
  position: 1..10,
  ownerPrompt: non-empty string,
  optionA: non-empty string,
  optionB: non-empty string,
  selfChoice: 'a' | 'b',
  sampleCount: non-negative safe integer,
  counts: null | { a: non-negative safe integer, b: non-negative safe integer }
}
```

Decoder 불변식:

- cards length 10, unique card id, positions exact 1..10 ascending.
- `optionA !== optionB`.
- sample 0~2이면 counts는 반드시 null이다.
- sample 3 이상이면 counts가 반드시 있고 `a+b=sampleCount`다.
- `sightCount=0`이면 sightStatus `empty`, 1 이상이면 `has_sight`다.
- profile 및 card의 추가 key를 거절한다. response/share link/visitor id, relationship code, known-since code, submittedAt, raw choice row 같은 leakage key는 없다.

server-only DB adapter는 management expiry와 profile을 decode한다. HTTP는 management field를 body에 내보내지 않고 owner cookie refresh에만 사용한다. event result는 `recorded|expired|not_found|not_completed` exact union이다.

### exact HTTP contract

`GET /api/me/profile`:

- request body, query owner id, path play id가 없다.
- 처리 순서는 `public boundary/proxy 검증 → owner_play_access(120회/10분/network) → named cookie parse → get_owner_profile RPC → exact response mapping`이다.
- absent/malformed는 domain RPC 0회다. limiter 오류/429에서도 domain RPC는 0회다.
- success 200 body는 exact `profile` shape이고 `Cache-Control: private, no-store`다.
- success는 기존 raw owner cookie value에 DB가 반환한 refreshed `Max-Age=604800`, `Expires=managementExpiresAt`, `HttpOnly; Secure; SameSite=Lax; Path=/`를 다시 설정한다.
- expired/not_found/not_completed는 404 `OWNER_PLAY_NOT_FOUND` body다. expired/not_found는 invalid cookie를 삭제하고, valid not_completed는 RPC expiry로 같은 cookie를 refresh한다.
- 내부 RPC/decoder/event 오류는 generic private no-store 500이다. partial profile을 반환하지 않는다.
- API body와 log에는 management expiry/hash, analytics id, response id, raw answer row가 없다.

`POST /api/me/profile/events`:

- exact body는 `{ "event": "profile_viewed" }`이고 최대 64 bytes, same-origin mutation boundary, private no-store를 적용한다.
- 처리 순서는 `boundary/body → named owner cookie parse → owner_play_access limiter → record_owner_profile_event RPC`다. absent/malformed는 RPC·event 0회이며 malformed만 cookie를 삭제한다.
- `recorded`는 204다. expired/not_found/not_completed는 GET과 같은 generic owner 404 body다.
- event route는 profile/result/count를 반환하지 않고 owner cookie를 touch하지 않는다. 직전 successful GET이 관리 TTL을 갱신한다.
- 렌더 뒤 event 요청의 네트워크/404/500 실패는 client가 무시하며 profile 표시와 CTA를 유지한다.

### browser client

- `lib/owner-profile/owner-profile-core.mjs`가 strict profile decoder, seen-count watermark decoder, pure display derivation을 소유한다.
- `lib/owner-profile/owner-profile-client.ts`는 same-origin GET, `cache:'no-store'`, exact success decode만 수행한다. API 요청에 cookie나 target play id를 JS에서 조립하지 않는다.
- 404/500 body의 세부 정보는 terminal UI에서 구분하지 않는다.
- profile result의 `playId`는 owner-only 재공유 path와 versioned seen-count watermark key에만 사용한다. analytics, URL query, server request body에는 복제하지 않는다.
- watermark exact record는 `{ version:1, playId, sightCount }`다. profile render 시 기존 같은-play count와 비교한 뒤 현재 count를 저장한다. count가 증가했을 때만 `새 시선 도착`, 같으면 `시선이 쌓여 있어요`, 0이면 recent banner 없음이다.
- storage absent인 첫 성공 view는 `sightCount>0`을 새 시선으로 표시한 뒤 watermark를 쓴다. storage read/write가 거절되거나 malformed면 `시선이 쌓여 있어요`만 표시해 거짓 new state를 만들지 않는다.
- 렌더 commit 뒤 exact event POST를 한 번 best-effort 호출한다. React 개발 모드 effect 재실행은 local component latch로 한 mount의 중복 전송을 막지만 reload별 event는 허용한다.

## 구현 계획

1. `core-feature-priority.md`, `question-pack-spec.md`, `decision-log.md`, `p0-development-plan.md`를 public-link-only private MVP profile 계약으로 함께 정렬한다.
2. `20260718000900_owner_profile.sql`에 same-transaction capability, live aggregate, threshold redaction, 별도 render event RPC/policy를 구현한다.
3. `supabase/tests/owner_profile.test.sql`에 schema/privilege/auth/cross-play/0→3/redaction/leakage/event test를 추가하고 generated DB types를 갱신한다.
4. owner profile strict decoder/type과 DB adapter를 추가한다.
5. owner cookie refresh를 play state에 종속되지 않는 management session helper로 좁게 재사용하고 HTTP response mapper를 추가한다.
6. `GET /api/me/profile`, `POST /api/me/profile/events` Route Handler를 owner access limiter와 cookie parsing 계약에 연결한다.
7. owner profile browser client, seen-count watermark, `/me` page/client component, CSS를 구현하고 기존 share manager로 재공유 CTA를 연결한다.
8. completed owner 화면과 share manager에 `내 시선 프로필` 진입점을 추가한다.
9. source verifier, unit, real Route integration, mobile Playwright를 추가한다.
10. focused verify, build, `./scripts/run-ai-verify --mode full`을 통과한다.

## 완료 기준

- [ ] `get_owner_profile`은 같은 transaction에서 `private.authorize_owner_play_capability(..., true)`를 정확히 한 번 호출하고 Auth UID/owner id input 없이 cookie-bound play만 읽는다.
- [ ] absent·malformed·expired·tampered·composed id/hash credential은 같은 owner 404 body/status/cache로 거절되고 profile data와 `profile_viewed`가 0건 노출·기록된다.
- [ ] malformed/expired/not_found invalid cookie는 삭제하고 valid draft `not_completed`는 generic 404와 함께 DB가 갱신한 TTL로 cookie를 refresh한다.
- [ ] 정상 A cookie는 A profile, 정상 B cookie는 B profile을 반환하며 API에 client target play id가 없다. 합성 A+hash(B)는 404와 0 data다.
- [ ] 전체 시선은 해당 play의 submitted public-link response count와 정확히 같으며 draft, one_to_one, 다른 play는 세지 않는다.
- [ ] 카드별 sample은 submitted public answer만 세고 0~2에서는 counts가 SQL/API/UI 모두 숨는다.
- [ ] 3번째 sample에서 해당 카드의 A/B count가 열리고 `a+b=sampleCount`다.
- [ ] 셀프 10장은 pack position 순서와 실제 owner 선택을 유지한다.
- [ ] raw response/share link/visitor row, visitor·response id, 관계·시점, submitted timestamp, management hash/expiry는 HTTP profile에 없다.
- [ ] RPC는 honest current state `empty|has_sight`만 반환한다. UI는 same-play seen count가 증가했을 때만 `새 시선 도착`, 그 외에는 neutral current state를 표시하고 개별 피드를 만들지 않는다.
- [ ] AI 요약·성격 문장·점수·순위·공개 프로필·SNS profile chrome이 없다.
- [ ] strict profile 실제 render 뒤 별도 event route만 `profile_viewed`를 기록하고 properties에는 packVersion 외 값, response/visitor 식별자, A/B 값이 없다. GET decoder/HTTP/render 실패는 event를 만들지 않는다.
- [ ] 새 public submit 뒤 reload에서 sight count와 카드 sample/count가 live 갱신된다.
- [ ] `친구에게 더 공유하기`가 같은 play의 기존 share manager로 이동한다.
- [ ] completed owner 화면과 share manager에서 `/me`를 발견할 수 있고 Playwright가 두 진입점을 검증한다.
- [ ] `core-feature-priority.md`, `question-pack-spec.md`, `decision-log.md`, `p0-development-plan.md` 네 active 문서가 public-link-only private MVP scope로 동시에 정렬된다.
- [ ] 320/390/430px에서 overflow가 없고 threshold 표현, keyboard/focus, 44px target, reduced-motion을 통과한다.

## 테스트 계획

- `node --test tests/unit/owner-profile.test.mjs`
  - exact profile/result decoder와 추가 key 거절
  - 10장/position/card uniqueness, option, threshold/count sum 불변식
  - seen-count watermark와 `new|existing|empty|storage_unavailable` display derivation
- `supabase/tests/owner_profile.test.sql`
  - function signature, security definer/search_path, execute privilege, direct table 접근 차단
  - helper authorized/expired/not_found와 cross-play id/hash
  - incomplete owner 404 outcome
  - public draft·submitted, one_to_one submitted, other play fixture
  - card sample 0→1→2 counts null, 3에서 exact A/B open
  - exact top/card field allowlist와 raw identifiers/relationship/timestamp 부재
  - profile GET은 event 0, 별도 event RPC 성공 exact properties 1, auth/incomplete/invalid event 0
- `node --test tests/integration/owner-profile-session.test.mjs`
  - 실제 owner 10장 완료 → public link → visitor 3장 submit → profile GET
  - absent/malformed/expired/tampered/composed id+hash 404 body equality와 invalid cookie delete, draft cookie refresh matrix
  - 정상 A/B cookie current-profile 성공과 합성 A+hash(B) 404
  - owner_play_access 120+1과 domain/event 무변경
  - 다른 play와 1:1 exclusion, public submitted live refresh
  - success/draft cookie refresh, private no-store, body allowlist
  - GET/decoder 실패 event 0, render 뒤 event POST 204와 properties allowlist
- `pnpm exec playwright test tests/e2e/owner-profile.spec.ts --project=mobile-chromium`
  - loading → 0-sight profile → threshold 0/3
  - 2/3 hidden과 3 sample A/B reveal
  - 셀프 10장, 내 선택, first/increased/equal/storage-failure 상태, 재공유 CTA
  - completed owner와 share manager의 `/me` 진입점
  - generic terminal, 320/390/430 overflow, keyboard/focus, reduced motion
- `node scripts/verify-owner-profile.mjs`
- `pnpm typecheck`
- `pnpm build`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- `profile_viewed`: `/me` client가 authorized strict profile을 실제 render commit한 뒤 별도 owner event RPC로 best-effort 기록한다.
- properties exact set은 `{ packVersion }`이고 `visitor_response_id`는 null이다.
- play id, response/visitor/share link id, 관계, 알게 된 시점, card id, A/B 값, count, secret, cookie, URL, IP, user agent는 event에 넣지 않는다.
- GET 성공만으로 event를 만들지 않고 decoder/HTTP/render 실패에서도 0건이다. render 뒤 event 요청 자체가 실패하면 화면은 유지되고 event만 유실될 수 있다.
- event 수는 successful rendered mount 수에 가깝고 unique user/view를 의미하지 않는다. 이번 MVP에서는 event dedupe table을 만들지 않는다.
- #31은 `profile_viewed → share_link_created/share_handoff_succeeded`를 전체 core funnel에서 해석한다. 이번 PR은 dashboard나 funnel SQL을 만들지 않는다.
- profile p95가 300ms를 넘거나 한 play에 submitted response 10,000건이 생기면 query plan과 aggregate 전략을 별도 이슈로 검토한다.

## 개인정보와 악용 방지

- owner capability는 client-supplied owner anchor가 아니라 DB row의 play id+secret hash exact match다.
- profile helper가 실패하면 aggregate query를 실행하지 않는다. event helper가 실패하면 analytics insert를 실행하지 않는다.
- public-link aggregate도 owner에게 개별 row, 관계, 시점, 제출 시각을 반환하지 않는다.
- 0~2 sample A/B 값은 UI masking이 아니라 SQL JSON projection에서 null로 만든다. browser/client code에 hidden count가 도착하지 않는다.
- `/me`는 외부 공유 대상이 아니며 response에는 `private, no-store`를 강제한다.
- raw owner secret은 HttpOnly cookie 밖으로 나오지 않고 DB에는 기존 domain-separated hash만 남는다.
- `profile_viewed` policy는 임의 property 추가를 DB에서 거부한다.
- malformed/expired/tampered 오류 문구로 play 존재, 만료 여부, secret 정답 여부를 구분할 수 없다.

## 롤아웃과 복구

- migration은 function/policy만 추가하고 기존 row를 update/backfill하지 않는다. 기존 owner/visitor/share flow와 직전 app은 영향을 받지 않는다.
- DB migration을 먼저 적용한 뒤 app Route/UI를 연다. 직전 app rollback은 새 function/event policy가 남아도 기존 flow를 깨지 않는다.
- 심각한 UI 회귀는 `/me` route/link만 직전 release로 rollback한다. 이미 기록된 profile_viewed나 submitted response를 되돌리지 않는다.
- 집계 SQL 오류는 새 forward-fix migration에서 `get_owner_profile`을 교체한다. 기존 migration 파일을 수정하거나 response row를 재작성하지 않는다.
- production smoke는 owner 10장 완료, public visitor 3장 submit, `/me` count/reveal, 다른 play 404, 1:1 exclusion을 포함한다.
- threshold나 public-link-only 정책을 넓히는 변경은 운영 중 즉석 수정하지 않고 product SSOT 재승인과 별도 이슈를 거친다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- seen-count watermark는 same browser의 단일 owner play만 지원하며 local storage를 지우면 이전 조회 여부를 복구하지 못한다. storage를 쓸 수 없을 때는 `새`를 주장하지 않고 neutral state로 내린다.
- 같은 browser에는 owner cookie 하나만 있으므로 새 owner play를 만들면 기존 play profile 선택 UI가 없다. 복수 play/account recovery는 재미 검증 뒤 별도 결정한다.
- public response 한 건은 배정된 3장에만 표본을 추가한다. 10장 전체가 3 sample에 도달하려면 여러 응답이 필요하며 이 불균형은 기존 최소 표본 배정이 완화한다.
- `profile_viewed`는 render mount/reload마다 늘 수 있고 event POST가 유실될 수 있다. 핵심 퍼널의 방향성 event로만 사용하고 unique 사람 수로 해석하지 않는다.
- 구현 전 해결해야 할 외부 블로커는 없다.
