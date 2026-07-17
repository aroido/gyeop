# Issue 14 구현 스펙: [안전] 공통 HTTP 입력·Origin·rate limit·보안 header 경계 구축

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/14

## 목표

이후 추가되는 모든 public Route Handler가 하나의 fail-closed 경계를 통해서만 요청을 받게 한다. TLS reverse proxy가 만든 신뢰 가능한 네트워크 신원, mutation 입력·Origin 검증, 원자적 DB rate limit, 표준 오류와 보안 응답 header를 한 계약으로 고정하고, 같은 서버의 다른 Unix user가 app port를 직접 두드려 이 경계를 우회하지 못하게 한다.

## 범위

- public Route Handler가 공통으로 호출하는 request boundary를 만든다. 경계는 proxy 신뢰 검증을 가장 먼저 수행하고, mutation에서는 exact same-origin, JSON UTF-8 content type, byte 단위 body 상한, fatal UTF-8 decode, JSON parse, strict Zod object 검증을 순서대로 수행한 뒤에만 domain callback을 호출한다.
- strict schema는 `strictJsonObject(shape)` factory만 만들 수 있게 module-private `WeakSet`에 exact wrapper identity를 등록하고 `safeParse`만 own property로 가진 null-prototype frozen wrapper를 반환한다. request boundary는 같은 module의 parser를 통해 WeakSet identity, exact own keys, frozen/null-prototype 상태를 모두 확인한다. symbol/property 복사, `Object.create`, Proxy, cast로 만든 객체는 등록 identity가 아니므로 실패한다. AST gate는 `app/`과 `lib/` 전체의 transitive import graph를 따라 Route 또는 imported helper가 `z.object`·cast·가짜 schema를 직접 넘기거나 factory 결과에 passthrough/catchall/transform을 적용하는 것을 거절하고, Route에서 HTTP boundary public entrypoint로 향하는 allowlisted import edge만 허용한다. unknown key가 있는 입력은 strip하지 않고 `INVALID_INPUT`으로 실패한다.
- 외부 오류 body는 아래 표의 한글 `{ code, message }`만 반환한다. public Route boundary는 request마다 UUID를 만들되 body에는 넣지 않고 그 boundary가 만든 API 응답의 `X-Request-ID` header와 구조화된 내부 오류 event 상관관계에만 사용한다. HTML·Next 기본 404에는 request ID를 새로 요구하지 않는다. stack, SQL/Supabase 오류, token, secret, raw IP, user agent, request/response body는 반환하거나 기록하지 않는다.
- `ORIGIN_PROXY_SECRET`은 padding 없는 base64url 43자 credential 하나 또는 회전 중인 두 개를 `active.secondary` 형식으로 받는다. 각 항목은 decode 후 정확히 32 bytes여야 하고 중복 값·빈 secondary·세 번째 값은 거절한다. 첫 값은 proxy writer/current, 둘째 값은 app의 추가 reader다. app은 모든 reader를 decode한 뒤 각 후보를 같은 길이 buffer로 constant-time 비교하며 첫 성공 전후에도 전체 후보 비교를 끝낸다.
- staging/production `APP_URL`은 startup에서 HTTPS, 명시/기본 port 443, hostname trailing dot 없음, userinfo/path/query/fragment 없음인 origin URL로 검증한다. local/test만 loopback HTTP와 명시 port를 허용한다.
- app은 public 요청에서 `Forwarded`, `X-Real-IP`, 정의되지 않은 모든 `X-Forwarded-*`가 없어야 하고, 정확히 다섯 canonical header `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-Port`, `X-Gyeop-Origin-Verify`가 각각 한 값이어야 한다. Fetch/Node가 duplicate를 comma-join하는 경우를 포함해 comma, CR/LF, 공백, 빈 값은 거절한다. host는 `APP_URL` hostname, proto는 `https`, port는 `443`, proof는 current/secondary credential 중 하나와 일치해야 한다. 이 검증이 끝나기 전에는 forwarded IP를 읽거나 request body를 소비하지 않는다.
- `Forwarded`와 외부 `X-Forwarded-*`·`X-Real-IP`·`X-Gyeop-Origin-Verify`를 먼저 모두 제거하고, 확인한 source IP와 환경 설정으로 위 다섯 값을 한 번씩만 쓰는 HAProxy 기준 설정과 의미 검증기를 `ops/http-boundary/`에 둔다. proxy access log는 origin proof와 request/response body를 기록하지 않으며 app upstream은 loopback 고정 port만 사용한다.
- Next production start는 `127.0.0.1`에만 bind한다. nftables의 `inet` output hook은 환경별 app port의 IPv4 `127.0.0.1`과 IPv6 `::1` 목적 연결에서 reverse proxy UID와 해당 환경 app UID만 허용하고 나머지 UID를 TCP reject한다. root 운영 경로를 허용하는 별도 예외는 만들지 않는다.
- 방화벽 restore unit은 app unit보다 `Before=`이고 app unit은 restore 성공을 `Requires=`·`After=`로 요구한다. app 기동 뒤 denial probe unit은 전용 비허용 UID로 direct, slow-open, malformed IPv4·IPv6 연결을 시도하고 각 reject rule의 packet counter 증가를 확인해야 성공한다. 설정 renderer는 root UID, 비숫자/범위 밖 값, app UID끼리 또는 app/proxy UID 충돌, staging/production app port 공유를 거절한다. SSOT의 단일 TLS reverse proxy 구조에 맞춰 두 환경이 같은 proxy UID를 쓰는 것은 허용하고 각 환경 rule의 allowlist에 그 UID를 명시한다.
- full verify와 CI는 pinned digest의 disposable Linux systemd container를 privileged·격리 network namespace로 두 차례 boot한다. 첫 boot에서 실제 HAProxy 요청을 capture backend로 보내 외부 spoof header 제거와 canonical 다섯 header를 검증하고, nftables에서 허용 UID 연결과 비허용 UID의 direct·slow·malformed IPv4·IPv6 reject 및 counter 증가를 검증한다. container를 stop/start해 network namespace와 systemd lifecycle을 다시 만든 두 번째 boot에서도 restore unit이 app보다 먼저 성공하고 app 뒤 denial probe가 다시 통과해야 한다. macOS도 Docker Desktop의 같은 Linux test를 실행하며 실행 불가를 skip으로 처리하지 않는다.
- `node:net.isIP`로 IP를 먼저 검증하고 IPv4-mapped IPv6는 IPv4로 수렴시킨다. IPv4는 network byte order 4 bytes 전체, IPv6는 network byte order 16 bytes 중 앞 8 bytes만 사용하는 `/64`로 정규화한다. `RATE_LIMIT_SECRET`은 padding 없는 base64url 43자로 decode한 정확히 32 bytes의 환경별 secret이다. HMAC payload는 각 field를 `uint16 big-endian byte length || bytes`로 framing한 `gyeop:rate-limit-network-key:v1` UTF-8 domain, UTC `YYYY-MM-DD` ASCII, family 한 byte `0x04|0x06`, canonical network bytes를 이 순서로 이어 붙인다. `HMAC-SHA-256` 결과 32 bytes가 단기 network key다.
- 일반 mutation adapter는 request boundary 성공 후 `consumeRateLimit`을 정확히 한 번 await하고, `allowed=true`일 때만 domain callback을 한 번 호출한다. 초과 시 callback은 0회이며 status 429, 정수 `Retry-After` header와 표준 오류만 반환한다. #13 wrapper의 `Boolean`/`Number` coercion은 제거하고 exact 여섯 DB field, 실제 boolean, 양의 finite integer, `allowed === (current_count <= limit_count)`, 유효하고 순서가 맞는 timestamp를 strict decode한다. 따라서 over-limit의 `allowed=false`, `current_count > limit_count`는 정상 429 결과이고 그 반대 모순만 거절한다. RPC error나 malformed 결과는 500으로 fail closed하며 원문을 숨긴다.
- 생성·재개 예외 adapter는 `create_or_resume_play`와 `start_response`에 대해 별도 `consumeRateLimit` 호출을 금지하고 named atomic RPC 한 번의 `resumed | created | rate_limited` 결과만 해석한다. `resumed`는 기존 동일 context row만 반환하고 quota count를 바꾸지 않으며, `created`는 같은 DB transaction 안의 bucket 증가와 domain insert/assignment가 함께 commit된 결과다. `rate_limited` 또는 어느 변경의 실패도 bucket과 domain row가 모두 rollback된 결과여야 한다. 아직 해당 domain schema가 없으므로 실제 production RPC placeholder는 만들지 않는다. 대신 pgTAP transaction 안에 임시 domain/assignment table과 production `public.consume_rate_limit`을 호출하는 계약 함수를 만들고 PL/pgSQL exception block의 subtransaction으로 아래 세 경로를 실제 PostgreSQL에서 검증한다: resume은 consume 전 반환해 count 불변, limit+1은 `rate_limited`를 정상 반환하면서 해당 호출의 bucket 증가와 domain row를 rollback, insert/assignment 오류는 bucket·domain·assignment를 함께 rollback. future SQL/static gate는 실제 named 함수가 같은 runtime pgTAP을 추가하지 않으면 실패시킨다.
- `next.config.ts`의 전체 경로 header 규칙으로 CSP, HSTS, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`를 HTML·API·오류 응답에 적용한다. production HSTS는 정확히 `max-age=31536000`이고, 별도 domain inventory·rollback 결정 전에는 `includeSubDomains`와 `preload`를 넣지 않는다. CSP는 최소 `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`를 포함하고 wildcard와 `unsafe-eval`을 금지한다. `connect-src`는 `self`와 설정된 Supabase HTTPS/WSS origin만, `data:`는 `img-src`만 허용한다. Next bootstrap에 필요한 `unsafe-inline` script/style은 production build·E2E로 필요한 directive에만 한정하고 verifier가 다른 directive로 확장되는 것을 막는다.
- AST/semantic verifier는 `app/**/route.ts`가 `/api/internal/cron` 예외를 제외하고 공통 boundary 밖에서 body parse, Origin/forwarded header 해석, `consumeRateLimit`, `internal-rpc` 또는 domain mutation을 직접 수행하면 실패시킨다. Cron은 이 이슈의 proxy proof가 아닌 별도 `CRON_SECRET` 계약 대상이므로 public adapter를 호출하지 못한다.

## 제외 범위

- owner session, draft cookie, invite/response 관리 token의 도메인 권한 검증
- 실제 `create_or_resume_play`, `start_response` domain table·RPC·UI 구현
- 외부 WAF, CAPTCHA, CDN/edge 또는 분산 rate limiter
- staging/production 서버를 새로 만들거나 이 PR에서 root 설정을 원격 설치하는 작업
- `rate_limit_buckets` retention cleanup job과 action별 최종 context hash. 각 domain 이슈가 link/response context와 한도를 연결한다.
- `/api/internal/cron` 인증·dispatcher 구현

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 현재 팩 선택·로컬 답변 화면의 문구나 동작은 바뀌지 않는다.
- 이후 주인·방문자 mutation은 잘못된 출처, 변조된 proxy 신원, 과대/비정상 body, 초과 요청을 domain RPC 전에 동일한 방식으로 거절한다.
- rate limit 초과는 사용자가 다시 시도할 수 있는 정확한 대기 초를 `Retry-After`로 제공하되 내부 네트워크 식별자나 제한 bucket 정보는 노출하지 않는다.

## 디자인 영향

- 화면, 레이아웃, 질문 문구 변경 없음.
- API 오류 문구는 짧은 한글 허용 목록으로 고정한다. domain 화면에서 오류를 표시하는 UX는 각 수직 이슈가 이 code를 소비하면서 구현한다.

## API와 데이터 영향

- 공통 boundary 오류 body는 정확히 `{ code: string, message: string }` 두 field만 가지며 다음 mapping을 한 registry에 고정한다.

| HTTP | code | message |
|---:|---|---|
| 400 | `INVALID_REQUEST` | `요청을 확인해 주세요.` |
| 403 | `INVALID_ORIGIN` | `허용되지 않은 요청입니다.` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `JSON 형식으로 보내 주세요.` |
| 413 | `PAYLOAD_TOO_LARGE` | `요청 내용이 너무 큽니다.` |
| 400 | `INVALID_JSON` | `요청 내용을 읽을 수 없습니다.` |
| 400 | `INVALID_INPUT` | `입력 내용을 확인해 주세요.` |
| 429 | `RATE_LIMITED` | `잠시 후 다시 시도해 주세요.` |
| 500 | `INTERNAL_ERROR` | `문제가 발생했습니다. 잠시 후 다시 시도해 주세요.` |

- public Route boundary가 만든 모든 API 응답에 `X-Request-ID`와 네 보안 header를 둔다. 이 여섯 header와 `Retry-After`는 boundary의 reserved response header라서 domain callback이 넣은 값을 먼저 제거한 뒤 boundary가 다시 설정한다. `Retry-After`는 strict-decoded 429에만 다시 추가한다. Next의 HTML·API·오류/404 응답에는 네 보안 header를 두되 Next 기본 응답에 request ID나 `{code,message}` body를 억지로 추가하지 않는다. stack, cause, field echo, schema 상세, request ID를 JSON body에 추가하지 않는다.
- body 상한은 adapter 호출부가 선언하되 1 byte 이상 64 KiB 이하만 허용한다. `Content-Length`가 없거나 조작된 경우에도 stream 누적 byte를 세어 상한+1에서 즉시 cancel한다. body read 성공 전 domain/RPC callback은 0회다.
- same-origin은 mutation method `POST`, `PUT`, `PATCH`, `DELETE`에서 `Origin`이 정확히 한 값이고 `new URL(APP_URL).origin`과 일치할 때만 통과한다. `null`, userinfo, default-port 표기 차이, trailing dot, comma/duplicate와 path/query가 있는 값은 거절한다.
- `Content-Type`은 대소문자를 무시한 `application/json` 또는 정확히 하나의 `charset=utf-8` parameter만 허용한다. charset 생략은 UTF-8로 해석하고 quoted/다른 charset, 추가 parameter, `application/*+json`, comma-joined duplicate, 누락은 `UNSUPPORTED_MEDIA_TYPE`으로 거절한다. `Content-Length`도 comma/duplicate, 비정수, 음수, 실측 불일치를 거절하되 stream 상한 검사를 대체하지 않는다.
- proxy header 성공 결과만 canonical IP bytes를 노출하고 raw header string을 이후 adapter에 넘기지 않는다. network key 결과만 `consumeRateLimit.keyHash`로 전달하며 raw IP와 HMAC secret은 DB·오류·log에 전달하지 않는다.
- 기존 `consume_rate_limit` schema와 RPC 이름은 유지하되 `consumeRateLimit` wrapper는 exact-key strict row decoder를 추가한다. 문자열/숫자 coercion, extra/missing field, NaN/소수/0 이하 count·limit·retry, allowed/count 모순, invalid/reversed timestamp는 모두 generic internal error로 거절한다. 이번 이슈는 새 production table이나 broad RPC를 추가하지 않는다.
- 생성·재개 adapter result는 entity payload를 log하지 않고 `resumed`, `created`, `rate_limited` discriminant와 `retryAfterSeconds`만 공통 계층에서 해석한다. future named internal RPC의 row shape가 이 계약과 다르면 verifier가 실패한다.

## 경계 처리 순서

1. 내부 request ID를 생성한다.
2. public proxy header 집합과 origin credential을 fail-closed 검증한다. 실패 시 raw header를 보존하거나 log하지 않는다.
3. mutation의 exact Origin을 검사한다.
4. JSON UTF-8 content type과 선언/실측 body byte 상한을 검사한다.
5. fatal UTF-8 decode, JSON parse, runtime brand가 확인된 `strictJsonObject` parse를 수행한다.
6. canonical IP로 그날의 network key를 만든다.
7. 일반 adapter는 DB rate limit을 먼저 수행하고 허용 시에만 domain callback을 호출한다. 생성·재개 adapter는 named atomic RPC 한 번만 호출한다.
8. 성공/표준 오류 모두 공통 security header와 request ID를 붙여 반환한다.

이 순서는 테스트와 verifier의 호출 지배 관계로 고정한다. domain callback, Auth/Supabase wrapper 또는 analytics는 2~5 중 하나라도 실패하면 호출될 수 없다.

## 구현 계획

1. `lib/security/proxy-origin-secret.mjs`와 `lib/security/network-key.mjs`에 credential parser·전체 후보 constant-time matcher, canonical network-order IP bytes·IPv6 `/64`, 위 fixed framing의 UTC day HMAC 파생을 구현하고 `scripts/validate-env.mjs`에서 같은 parser를 재사용한다.
2. `lib/http/http-boundary-core.mjs`, `lib/http/request-boundary.ts`, `lib/http/errors.ts`, `lib/http/strict-json-schema.ts`에 proxy header, Origin, body stream, fatal UTF-8, JSON, module-private WeakSet identity·frozen/null-prototype wrapper를 쓰는 strict Zod factory/runtime check, request ID, exact error registry와 redacted response 계약을 구현한다. Zod는 exact dependency로 고정한다.
3. `lib/db/internal-rpc.ts`의 rate-limit row를 strict decode하고 `lib/http/rate-limit.ts`에 일반 pre-domain adapter와 atomic resume/create result adapter를 구현한다. dependency injection은 테스트 seam으로만 두고 production export는 기존 `consumeRateLimit`과 named future internal wrapper를 사용하는 좁은 entrypoint만 허용한다.
4. `scripts/verify-http-boundary.mjs`가 `app/`·`lib/` transitive import graph와 Route Handler 호출 지배 관계, strict factory-only/allowed import edge, Cron 분리, forbidden direct header/body/RPC access, error allowlist, security headers, HAProxy strip-before-set, exact canonical header write, firewall rule·systemd dependency, future atomic SQL 계약을 검사하게 한다.
5. `ops/http-boundary/`에 HAProxy include/template, active credential을 안전하게 읽는 wrapper, nftables renderer 입력 예시, restore/app/probe systemd unit/drop-in, cross-UID probe와 회전·rollback runbook을 추가한다. 생성 파일은 stdout/임시 경로에만 쓰며 secret을 command line·검증 출력·git 파일에 넣지 않는다.
6. `tests/unit/http-boundary.test.mjs`에 header spoof/duplicate/comma/missing/unexpected, credential 길이·encoding·current-next 전수 비교, Origin/content-type/UTF-8/body/Zod/order, IP canonicalization/HMAC 날짜·IPv6 `/64`, error redaction을 추가한다.
7. `tests/unit/rate-limit-http.test.mjs`에 strict DB row decode, 일반 허용/429/Retry-After/RPC 오류/callback 순서와 생성·재개 single-RPC/no-separate-consume result 계약을 추가한다. `tests/unit/http-boundary-policy.test.mjs`에는 strict factory-only Route와 future SQL pass·fail fixture를 둔다.
8. `supabase/tests/http_boundary_atomic_contract.test.sql`은 pgTAP transaction 안의 임시 schema/table/function으로 production `consume_rate_limit`을 호출해 resume count 불변, limit+1 normal `rate_limited` subtransaction rollback, insert·assignment error rollback을 검사한다. fixture object는 test transaction rollback으로 남기지 않는다.
9. `tests/integration/http-boundary.test.mjs`는 Web `Request`와 실제 stream으로 request guard의 proxy 통과/우회, body 상한과 callback 0회를 검증한다. 실제 Next E2E는 homepage와 HTML/API 404의 네 security header만 검증하며 production probe Route는 만들지 않는다.
10. `tests/fixtures/http-boundary-host/`의 digest-pinned Linux image와 `tests/integration/http-boundary-host.test.sh`는 실제 HAProxy capture backend, nftables, systemd를 두 번 boot/restart해 header rewrite, cross-UID IPv4/IPv6 direct·slow·malformed denial, counters, restore-before-app와 probe-after-app를 검증한다. 두 번째 boot는 첫 boot와 다른 network namespace inode, 0에서 다시 시작한 reject counter, 새 restore unit invocation ID를 확인해 단순 기존 상태 재사용을 배제한다.
11. `next.config.ts`, `.env.example`, `package.json`, lockfile, `scripts/ai-verify`, CI에 새 gate를 연결한다. Docker host test는 local full verify와 CI 모두 필수이며 로그에는 fixture secret이나 raw request data도 출력하지 않는다.

## 완료 기준

- [ ] spoofed `Forwarded`, 임의 `X-Forwarded-*`, `X-Real-IP`, origin proof는 proxy에서 제거된 뒤 canonical 다섯 header만 한 번씩 기록되며 app은 누락·duplicate/comma-list·unexpected header와 host/proto/port/proof 불일치를 body read 전에 거절한다.
- [ ] `ORIGIN_PROXY_SECRET` 각 값은 padding 없는 base64url 43자·decode 32 bytes이고 current/secondary 전체 후보 constant-time 비교, 중복/과다 reader 거절, secret/header/log redaction test가 통과한다.
- [ ] cross-origin mutation, null/duplicate Origin, 잘못된/duplicate content type·charset, malformed/fatal UTF-8/JSON, non-branded schema, unknown Zod key와 64 KiB 초과 body가 domain/RPC 호출 0회로 표의 exact status/code/message 오류를 반환한다.
- [ ] IPv4와 동치 IPv4-mapped IPv6는 같은 network key, 같은 IPv6 `/64`와 UTC 날짜는 같은 key, 다른 `/64`·날짜·환경 secret은 다른 32-byte key를 만들며 raw IP를 저장/기록하지 않는다.
- [ ] 일반 요청은 strict-decoded `consumeRateLimit` 성공 뒤에만 domain callback을 실행한다. 문자열/extra/malformed/모순 row는 fail closed하고, limit 초과는 callback 0회, 429, 정확한 양의 정수 `Retry-After`; 내부 RPC 오류는 원문 없는 500을 반환한다.
- [ ] 생성·재개 adapter는 valid resume에서 별도 quota 소비 없이 기존 row를 반환하고, new row에서는 atomic RPC 한 번만 사용한다. PostgreSQL pgTAP이 resume count 불변, limit+1의 normal `rate_limited` subtransaction과 insert/assignment 오류에서 bucket·domain·assignment가 함께 rollback됨을 증명하고 future 실제 RPC가 생기면 같은 runtime gate가 자동 필수가 된다.
- [ ] Next production command는 IPv4 loopback에만 bind하고, disposable Linux systemd container의 첫 boot와 stop/start 뒤 둘째 boot 모두에서 proxy/app UID만 환경별 port에 연결되며 다른 UID의 direct·slow·malformed IPv4·IPv6 연결은 app accept 전에 reject rule counter를 증가시킨다.
- [ ] 같은 두 boot에서 실제 HAProxy 요청의 spoof header가 제거되고 canonical 다섯 header만 capture backend에 도달하며, persistent firewall restore가 app보다 먼저 필수 실행되고 app 뒤 denial probe가 성공해야 test target이 정상으로 간주된다.
- [ ] HTML, API 및 오류/404 응답에 exact/minimum CSP, HSTS, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`가 있다. 공통 public Route boundary의 성공/오류 API 응답에만 `X-Request-ID`가 있고 boundary 오류 body는 표의 exact `{code,message}`만 가진다.
- [ ] 새 public Route Handler가 공통 경계를 우회하거나 raw body/header, direct internal RPC/rate limit을 제각각 구현하면 정적 gate가 실패한다.
- [ ] focused unit·integration·Linux privileged gate와 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `node --test tests/unit/http-boundary.test.mjs tests/unit/rate-limit-http.test.mjs tests/unit/http-boundary-policy.test.mjs`
- `node scripts/verify-http-boundary.mjs`
- `pnpm test:db` — `http_boundary_atomic_contract.test.sql` 포함
- `node --test tests/integration/http-boundary.test.mjs`
- `tests/integration/http-boundary-host.test.sh` — digest-pinned disposable Linux systemd container 두 번 boot, 실제 HAProxy+nftables probe
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- app log의 허용 field는 request ID, 고정 error code, route template, HTTP status뿐이다. raw URL query, Origin, forwarded header, IP, user agent, body, token, secret, Zod value/error detail, Supabase error/response는 금지한다.
- proxy access log는 request method, normalized path template 대신 실제 path가 필요한 운영 정책을 이 이슈에서 추가하지 않는다. 기본 산출물은 proof/header/body를 log하지 않는 최소 형식만 제공한다.
- rate-limit 결과에서 log 가능한 값은 고정 action code와 `allowed` 여부뿐이며 key hash, count, window timestamp, Retry-After는 제품 analytics로 보내지 않는다.
- request ID는 디버깅 상관관계용이며 사용자/네트워크의 안정 식별자로 재사용하지 않는다.

## 개인정보와 악용 방지

- raw IP는 request scope의 canonical byte buffer에만 머물고 HMAC 직후 해제 가능한 지역 변수로 제한한다. DB에는 32-byte daily network key와 action/window만 남는다.
- proxy-origin과 rate-limit secret은 exact parser를 통과한 process memory와 root-owned 환경 파일에만 있고 repo, command line, stdout/stderr, access/app log에 남지 않는다.
- same-origin은 인증을 대체하지 않는다. 후속 Route는 이 경계 뒤에서 owner session 또는 secret token을 별도로 검증한다.
- 다른 local UID의 direct access를 app 검증만으로 막지 않고 OUTPUT owner-match에서 먼저 거절해 slow/malformed connection이 Node connection slot을 소비하지 못하게 한다.

## 롤아웃과 복구

- 앱 코드는 아직 public domain Route가 없으므로 먼저 merge할 수 있다. 이후 Route 추가는 verifier 때문에 공통 경계 없이 merge할 수 없다.
- staging 적용 순서는 credential 파일 권한 확인 → app에 secondary reader 추가·재시작 → proxy writer를 새 first value로 전환·reload → health/origin smoke → old reader 제거·app 재시작 → old 거절/new 정상 smoke다. 마지막 app 재시작 전 실패는 old writer로 되돌리고, 이후 실패는 old/new reader를 함께 복구해 app을 다시 시작한다.
- 방화벽은 rendered config syntax·UID/port inventory를 먼저 검사하고 restore unit을 enable한 뒤 app dependency와 denial probe를 enable한다. probe 실패 시 app의 외부 공개를 중단하고 이전 root-owned ruleset과 unit drop-in을 복구한다. app port를 전체 local UID에 임시 개방하는 rollback은 허용하지 않는다.
- 이 PR의 full verify가 disposable Linux environment의 두 boot를 실제 검증한다. 실제 운영 설치는 별도 production runbook 승인 때 같은 artifact와 probe를 staging에 적용하지만, 그것은 이 이슈 acceptance를 대신하는 증거가 아니다. 이 PR은 원격 root 변경을 하지 않는다.

## 스펙 검토

Reviewer Agent: issue14_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- Next의 Fetch `Headers`는 duplicate를 comma-join할 수 있으므로 app은 canonical 값에 comma가 있으면 모두 거절한다. 실제 HAProxy capture test가 upstream에 각 canonical header를 정확히 한 번 쓰는지를 별도로 보장한다.
- macOS host는 nftables/systemd를 직접 실행하지 않지만 full verify가 Docker 안의 disposable Linux systemd environment를 실행한다. Docker가 privileged container, IPv6 또는 두 번째 boot를 지원하지 않으면 skip하지 않고 검증 실패로 처리한다.
- CSP에서 Next가 요구하는 inline bootstrap과 local development 연결은 production 보안 값을 약화시키지 않도록 환경별로 분리한다. 허용 origin은 `APP_URL`과 설정된 Supabase endpoint 외 wildcard를 두지 않는다.
- 실제 생성·재개 DB 함수가 아직 없으므로 이번 이슈는 fake production RPC를 만들지 않는다. 대신 test transaction 안의 실제 PostgreSQL contract function이 production limiter와 subtransaction 의미를 검증하고, public adapter를 single-call discriminated result로 제한하며 future migration verifier를 즉시 활성화한다. domain 이슈가 실제 함수용 runtime pgTAP 없이 함수를 추가하면 full verify가 실패해야 한다.
- 구현 전 해결해야 할 제품 결정 블로커는 없다.
