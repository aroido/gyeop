# Issue 58 구현 스펙: [프론트엔드] 누적 프로필에서 기존 팩 재공유 흐름 구현

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/58

## 목표

공개 링크 응답이 한 건 이상 쌓인 주인이 비공개 `/me` 프로필에서 `시선 더 모으기`를 눌러 같은 owner play의 기존 공유 관리 화면으로 돌아가고, 안전하게 재발급한 링크의 native share 또는 copy 성공까지 `profile_reshare` 출처로 측정할 수 있게 한다.

이 PR은 세 번째 핵심 가설인 `프로필에 시선이 쌓이면 주인이 다시 공유하는가`만 검증한다. 공개 프로필 URL, 새 링크 종류, SNS 공유 카드, 새 메시지 전송 시스템을 만들지 않고 #21의 owner share manager와 #27의 private profile을 연결한다.

## 범위

- `/me`의 공개 링크 `sightCount >= 1` 상태에 primary CTA `시선 더 모으기`를 한 곳만 노출한다.
- CTA는 authorized profile이 반환한 같은 `playId`의 `/me/plays/[playId]?entry_source=profile_reshare`로 이동한다. 새 owner play, 새 self answer, 공개 profile URL을 만들지 않는다.
- CTA activation을 owner-only `profile_reshare_clicked` event로 best-effort 기록한다. DB가 pack version과 고정된 `entrySource=profile_reshare`를 만든다.
- share manager server boundary가 exact query allowlist `entry_source=profile_reshare`만 `entrySource='profile_reshare'`로 client에 전달한다. 누락·배열·다른 값은 `null`로 정규화하고 analytics로 전달하지 않는다.
- 재공유 진입에서 #21의 기존 active link list, create, atomic rotate, disable, Web Share, clipboard, manual fallback을 그대로 사용한다.
- share manager는 raw invite URL을 query, cookie, storage 또는 server response에서 복원하지 않는다. profile navigation 뒤 active link row만 있고 current mounted ready URL이 없으면 기존 `새로 발급` 안내를 유지한다.
- profile source에서 안전한 create/rotate 뒤 실제 Web Share resolve 또는 clipboard resolve가 발생했을 때만 기존 `share_handoff_succeeded` 또는 `share_link_copied` analytics properties에 `entrySource=profile_reshare`를 추가한다.
- 일반 owner 완료 화면에서 직접 들어온 공유 행동은 기존 properties `{packVersion, linkKind}`를 유지한다.
- additive migration, strict schema/RPC decoder, DB types, source verifier, unit·pgTAP·integration·Playwright, active product/engineering 문서를 함께 갱신한다.

## 제외 범위

- 외부 방문자가 보는 공개 프로필, profile permalink, 대표 팩 선택, 사용자 검색.
- 프로필 자체 공유, 결과 이미지·OG/SNS 카드, custom Kakao/Instagram/SMS 버튼.
- 새 링크 종류, secret 복구·추측·storage 보관, 기존 raw URL 재구성.
- 자동 공유, 자동 복사, 자동 rotate, background retry, 메시지·이메일·웹 푸시 발송.
- 새 analytics SaaS, dashboard, attribution cookie, session replay, A/B 실험 엔진.
- 공개 링크 응답 0건인 프로필의 재공유 CTA. 최초 공유는 완료 owner 화면과 기존 share manager가 계속 소유한다.
- 방문자 답변, 관계, 알게 된 시점, A/B 선택, 개별 응답 시각을 재공유 funnel에 결합하는 작업.

## SSOT

- `docs/product/core-feature-priority.md` §5.7, §10, §12
- `docs/product/question-pack-spec.md` §8
- `docs/product/decision-log.md`의 same-browser private owner, 특정 팩 링크 공유, public-link-only profile 결정
- `docs/engineering/p0-development-plan.md`의 owner profile, share action, analytics 경계
- `docs/specs/issue-17.md`의 owner capability와 generic owner 404 계약
- `docs/specs/issue-21.md`의 one-time raw URL, native share/copy, reload·rotate 계약
- `docs/specs/issue-27.md`의 private profile, `sightCount`, 단일 primary 재공유 CTA 계약
- `AGENTS.md`
- `.codex/AGENTS.md`

질문·선택지·Signature, `old-friend-v1` pack 내용과 visitor flow는 바꾸지 않는다.

## 사용자 흐름 영향

### 시선이 한 건 이상 쌓인 주인

1. 주인은 same-browser owner cookie로 `/me`를 열고 공개 링크 제출 응답이 누적된 pack summary를 본다.
2. `sightCount >= 1`이면 summary 안에 `시선 더 모으기`가 보인다. 새 시선 배지와 CTA는 별개이며 storage가 거절되어도 현재 sight count를 근거로 CTA는 유지된다.
3. pointer click 또는 keyboard activation에서 client는 `{event:'profile_reshare_clicked'}`를 keepalive best-effort POST하고 즉시 같은 play의 `/me/plays/[playId]?entry_source=profile_reshare`로 이동한다. event failure는 navigation을 막지 않는다.
4. share manager는 같은 owner capability로 play와 link list를 읽는다. 다른 play를 생성하거나 self answer를 다시 제출하지 않는다.
5. profile을 떠나면 이전 share 화면의 raw invite URL은 메모리와 함께 사라진 상태다. active link row가 있어도 URL을 복원하지 않고 `공유하려면 새로 발급` 안내와 기존 atomic rotate만 제공한다.
6. 주인이 create 또는 rotate를 명시적으로 승인해 current mounted ready URL을 얻으면 #21의 native share·copy control이 열린다.
7. native share promise resolve 또는 clipboard write resolve에만 기존 success event를 POST하며 request에 `entrySource:'profile_reshare'`를 포함한다. cancel/failure/manual copy는 success event가 아니다.

### 시선 0건·권한 실패

- `sightCount=0`이면 `시선 더 모으기` CTA와 click event가 없다. 기존 empty notice와 owner 완료 화면의 최초 공유 진입은 유지한다.
- `/me` terminal state에는 CTA가 없고 analytics event도 없다.
- malformed/expired/tampered owner cookie, cross-play path, not-completed play, inactive link는 기존 generic owner boundary로 수렴한다.
- query가 `entry_source=anything-else`이거나 중복 배열이면 정상 share manager는 열 수 있어도 attribution은 `null`이다. URL parser가 decode한 단일 값이 exact `profile_reshare`일 때만 채택한다.

## 디자인 영향

- 대상은 기존 `/me` summary와 기존 `/me/plays/[playId]` share manager이며 새 route, modal, bottom tab을 만들지 않는다.
- Lazyweb mobile reference probe의 coverage는 weak였다. LinkedIn의 native share+copy handoff와 Substack profile의 content 가까운 share action만 방향성 참고로 사용하며 SNS profile chrome은 채택하지 않는다.
- 현재 `/me` 390×844 screenshot을 입력으로 한 Lazyweb improve report는 프로필 콘텐츠 위계를 유지하면서 재공유 행동을 연결하는 참고자료로만 사용한다. 전환 lift 증거로 해석하지 않는다: `https://www.lazyweb.com/report/lazyweb/1f74a1c7-1842-4895-89da-0ce92a93ad50/`.
- `시선 더 모으기`는 sight number와 `새 시선 도착|시선이 쌓여 있어요` notice가 있는 summary 내부에서 count 다음의 단일 full-width primary action으로 둔다. 긴 10-card 목록 아래의 기존 `친구에게 더 공유하기` section은 제거해 primary CTA를 중복하지 않는다.
- CTA 설명은 `같은 팩 링크로 친구 시선을 더 받아요.`처럼 same-pack 행동을 말하고 공개 profile 공유로 오해시키지 않는다.
- empty profile은 CTA 공간을 빈 disabled button으로 남기지 않는다.
- destination share manager는 `entrySource`에 따라 기능·문구·기본 link kind를 바꾸지 않는다. attribution은 UI를 속이지 않는 측정값일 뿐이다.
- 320/390/430px에서 horizontal overflow가 없고 CTA와 share/copy/rotate target은 44px 이상이다. visible focus, keyboard activation, heading focus, `prefers-reduced-motion`을 유지한다.

## API와 데이터 영향

### profile CTA event

`POST /api/me/profile/events`의 strict body union을 다음 두 exact shape로 확장한다.

```text
{ event: 'profile_viewed' }
{ event: 'profile_reshare_clicked' }
```

- 기존 same-origin, JSON/UTF-8, 64-byte, private no-store, named owner cookie, `owner_play_access` limiter를 유지한다.
- absent/malformed cookie는 domain RPC 0회이고 malformed만 cookie를 삭제한다.
- `record_owner_profile_event`는 두 event만 허용하고 capability helper를 transaction의 첫 domain 단계에서 `touch=false`로 정확히 한 번 호출한다.
- `profile_viewed`는 기존 exact properties `{packVersion}`를 유지한다.
- `profile_reshare_clicked`는 completed play이고 submitted public response가 한 건 이상일 때만 exact properties `{packVersion, entrySource:'profile_reshare'}`를 insert한다. 0건이면 `not_eligible`이며 event 0건이다.
- client는 click 기록을 기다리지 않고 keepalive best-effort로 보낸다. POST failure를 UI, console, URL, app log에 반영하지 않는다.

### share action attribution

`POST /api/me/plays/[playId]/share-events` body는 배포 중 stale browser를 위해 다음 두 exact shape의 union이다.

```text
{
  event: 'share_handoff_succeeded' | 'share_link_copied',
  linkId: canonical UUID v4
}

{
  event: 'share_handoff_succeeded' | 'share_link_copied',
  linkId: canonical UUID v4,
  entrySource: null | 'profile_reshare'
}
```

- 새 client는 세 key를 항상 보내되, 새 server는 이전 browser bundle의 기존 2-key body도 strict success로 받아 `entrySource=null`로 정규화한다. unknown key와 다른 source 값은 계속 400이다.
- `entrySource`는 share manager server component가 allowlist한 prop에서만 오며 browser URL 전체나 invite URL을 받지 않는다.
- endpoint는 기존 path/cookie exact match, rate limit, private no-store, completed play, active same-play link 검증을 유지한다.
- 새 5-argument `record_owner_share_action_with_source(..., p_entry_source text)` RPC는 `null|'profile_reshare'`만 허용한다. 기존 4-argument `record_owner_share_action`은 그대로 유지해 이전 app rollback을 허용하고 PostgREST·generated types의 overload ambiguity를 만들지 않는다.
- `p_entry_source is null`이면 analytics properties는 기존 exact `{packVersion, linkKind}`다.
- `p_entry_source='profile_reshare'`이면 exact `{packVersion, linkKind, entrySource:'profile_reshare'}`다.
- DB는 actual link row에서 `packVersion`과 `linkKind`를 만들고 input source는 exact enum만 채택한다. event에는 link id, play id, public id, URL, secret, channel, recipient, visitor field를 저장하지 않는다.

### analytics policy와 types

- 새 additive migration `20260718001000_profile_reshare.sql`에서 owner profile policy와 core visitor/share policy를 exact superset으로 교체한다.
- `profile_reshare_clicked`는 null `visitor_response_id`, string `packVersion`, exact `entrySource=profile_reshare`만 허용한다.
- share success events는 기존 2-key properties 또는 profile source가 있는 3-key properties만 허용한다. unrelated event의 property set은 바뀌지 않는다.
- `database.types.ts`, `internal-rpc.ts`, event outcome decoder와 source verifier를 새 RPC signature·enum에 맞춘다.
- 새 table, column, index, cookie, local/session storage는 없다.

## 구현 계획

1. Lazyweb current-screen report와 기존 #21/#27 계약을 대조해 CTA 위치, 단일 primary action, reload 후 rotate 경계를 확정한다.
2. `20260718001000_profile_reshare.sql`에 exact analytics policies, profile click eligibility, 별도 5-argument share action RPC를 추가하고 pgTAP으로 capability·eligibility·payload·grant를 고정한다.
3. generated DB types와 `lib/db/internal-rpc.ts`의 exact event/source union을 갱신한다.
4. `owner-play-schemas.ts`, owner profile/share HTTP adapters와 routes를 strict body·generic failure 계약에 맞춘다.
5. `owner-profile-client.ts`에 keepalive click recorder를 추가하고 `OwnerProfileView`의 `sightCount>=1` summary CTA 한 곳에서 호출한다. 기존 하단 duplicate CTA section을 제거한다.
6. share page server component에서 query allowlist를 정규화하고 `ShareLinkManager`/`recordShareAction`에 `null|'profile_reshare'`만 전달한다.
7. source verifiers, unit, pgTAP, integration, mocked Playwright, live owner E2E를 보강한다.
8. active product·engineering SSOT에 core loop의 profile→same-play reshare와 attribution/secret 경계를 반영한다.
9. deterministic mocked profile/share state로 320/390/430px, keyboard, focus, Web Share 미지원, clipboard 실패, reload 후 raw URL 부재를 browser QA한다.
10. `./scripts/run-ai-verify --mode full`을 통과한다.

## 완료 기준

- [ ] authorized completed owner의 submitted public `sightCount>=1` profile에 `시선 더 모으기` CTA가 정확히 한 곳 보이고 0건·loading·terminal에는 없다.
- [ ] CTA는 authorized profile의 같은 play id와 exact `entry_source=profile_reshare`만 사용하며 owner play/self answer/public profile URL을 만들지 않는다.
- [ ] activation은 pointer와 keyboard에서 navigation을 막지 않고 `profile_reshare_clicked`를 best-effort 기록한다.
- [ ] click event는 completed+public sight eligible owner에서만 exact `{packVersion, entrySource:'profile_reshare'}`이며 0-sight/tampered/not-completed에는 0건이다.
- [ ] destination query의 누락·unknown·array는 `entrySource=null`이고 exact scalar만 `profile_reshare`로 채택된다.
- [ ] profile navigation/reload 뒤 active link row에서 raw URL, share/copy control을 복원하지 않고 안전한 create/rotate 뒤에만 current ready URL을 사용한다.
- [ ] profile source의 Web Share resolve와 clipboard resolve만 각각 기존 success event에 exact `entrySource=profile_reshare`를 남긴다.
- [ ] direct share-manager source는 기존 exact `{packVersion,linkKind}`를 유지하고 source property를 만들지 않는다.
- [ ] native share cancel/failure, clipboard failure, manual copy, inactive/cross-play link에는 success event가 없다.
- [ ] analytics·app log·HTTP path/query/body에 전체 invite URL, fragment secret, public id, visitor id, 관계, 알게 된 시점, A/B 선택이 없다. 허용 query는 fixed attribution code뿐이다.
- [ ] profile과 share manager는 owner-only이고 외부 방문자용 profile URL이 생기지 않는다.
- [ ] 320/390/430px, 44px target, keyboard activation, visible focus, heading focus, native share 미지원, clipboard failure, reduced motion 검증을 통과한다.
- [ ] full verify와 CI가 통과한다.

## 테스트 계획

### unit/source policy

- profile event/share event strict body의 exact key, enum, null/source coercion 거절.
- query allowlist는 URL parser가 decode한 single scalar가 exact `profile_reshare`일 때만 success이며 absent/unknown/array는 null로 정규화한다.
- share event schema가 legacy exact 2-key body와 current exact 3-key body만 허용하고 legacy를 `entrySource=null`로 정규화한다.
- client click keepalive request와 share success request가 invite URL을 argument/body에 받지 않음.
- source verifier가 full URL/secret/source free text, direct analytics table client, capability helper 누락·중복·late call을 거절.
- legacy direct share source의 analytics exact 2-key payload 회귀.

### pgTAP/integration

- profile click eligible success, zero-sight `not_eligible`, draft/tampered/expired event 0.
- 5-argument share action의 public·1:1 profile source success와 exact 3-key properties.
- null source public·1:1의 기존 exact 2-key properties.
- invalid source, inactive/expired/cross-play link, not-completed play event 0과 TTL/link 불변.
- policy/grant/function signature inventory, anonymous/authenticated direct access 금지.
- HTTP 204/private no-store, strict 400, generic 404, limiter over-limit RPC 0, cookie 보존·삭제 회귀.

### Playwright/browser QA

- 0 sight CTA/click request 0; 1+ sight single CTA, pointer와 Enter activation, exact destination query와 click request.
- destination unknown/array query는 share success body `entrySource:null`.
- stale direct-share browser의 exact 2-key success body도 204이고 analytics는 기존 2-key properties를 유지한다.
- profile source create/rotate → Web Share resolve/copy resolve exact event body `entrySource:'profile_reshare'`.
- cancel/failure event 0, Web Share unsupported copy-only, clipboard failure manual focus/select.
- reload 뒤 active link list는 raw URL/share/copy가 없고 rotate 뒤에만 복구.
- same-play 유지, create/resume/self-answer mutation 0.
- 320/390/430px overflow, 44px target, tab/focus/live region, reduced motion.

### final

- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- funnel은 `profile_viewed → profile_reshare_clicked → share_handoff_succeeded|share_link_copied → invite_opened`이다.
- `profile_reshare_clicked`와 profile-source share success만 exact `entrySource=profile_reshare`를 가진다.
- Web Share/copy event는 browser-reported success이며 실제 수신·방문 증명이 아니다. 실제 전달은 후속 `invite_opened`와 대조한다.
- `entrySource=profile_reshare`도 client가 query/body를 직접 만들어 위조할 수 있는 attribution hint이며 profile CTA 유입의 증명이나 보안 권한이 아니다. 단독 KPI로 쓰지 않고 owner-only `profile_reshare_clicked`와 후속 `invite_opened`를 함께 대조한다.
- click/share analytics POST 실패는 사용자 행동 성공을 실패로 바꾸지 않고 자동 재시도하지 않는다.
- app log, exception, analytics에는 invite URL, fragment secret/hash, link/public/play id, owner/visitor answer, relationship, channel, recipient/contact를 남기지 않는다.
- #31이 전체 owner→visitor→new-owner funnel schema와 forbidden payload를 통합 검증하며 #58은 profile entry attribution의 생성 경계만 소유한다.

## 개인정보와 악용 방지

- raw invite URL은 기존 #21과 같이 create/rotate response, current browser memory/DOM, 명시적 Web Share/clipboard 호출에만 존재한다.
- profile CTA href에는 fixed `entry_source=profile_reshare`와 owner-only play path만 있고 invite secret/public id가 없다.
- query는 server component에서 exact scalar allowlist 후 client prop으로 축소한다. arbitrary source string을 request/analytics/log에 반사하지 않는다.
- analytics function은 owner capability, completed play, eligible profile 또는 active same-play link를 DB에서 다시 검증한다.
- visitor identity, relationship, known-since, A/B choice, response timestamps를 profile reshare event에 결합하지 않는다.
- same-origin, proxy proof, body-size, rate-limit, strict schema, private no-store, cookie path/security 기존 경계를 유지한다.
- deterministic fixture URL만 screenshot/trace에 사용하고 live random secret E2E는 trace/screenshot/video를 끈다.

## 롤아웃과 복구

- migration은 analytics policy와 별도 exact signature `record_owner_share_action_with_source(uuid, bytea, uuid, text, text)` RPC만 additive하게 확장하며 table/column backfill이 없다. DB migration을 app보다 먼저 배포한다.
- 기존 4-argument share action RPC와 source-null properties를 유지하고 새 RPC 이름을 분리해 migration 이후 이전 app도 동작한다.
- app rollback은 profile CTA/query/source body를 제거한 이전 release로 되돌린다. 새 event 허용 policy와 별도 이름의 source-aware RPC는 호출되지 않으면 무해하고 기존 4-argument RPC가 계속 동작하므로 migration을 down/drop하지 않는다.
- profile click endpoint가 실패해도 same-play navigation은 계속되고, share analytics가 실패해도 native share/copy feedback은 유지된다.
- UI 회귀 시 CTA만 제거해도 기존 owner 완료 화면→share manager와 visitor flow가 그대로 남는다.

## 스펙 검토

Reviewer Agent: issue58_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- `profile_reshare_clicked`는 navigation 직전 keepalive best-effort이므로 브라우저 종료·네트워크 실패에서 누락될 수 있다. KPI는 절대 click count보다 후속 share/invite funnel과 함께 본다.
- `entry_source` query는 attribution code이지 보안 권한이 아니다. owner capability와 link authorization은 기존 cookie/RPC가 계속 소유한다.
- 사용자는 exact query와 request body를 직접 구성해 profile source를 위조할 수 있다. 이 한계를 P0에서 fingerprinting이나 attribution cookie로 막지 않고 세 event funnel의 방향성 신호로만 사용한다.
- profile 진입 시 raw URL이 없는 것은 의도된 보안 계약이다. 클릭 한 번으로 즉시 OS share sheet를 열기 위해 secret을 storage에 보존하는 최적화는 P0에서 하지 않는다.
