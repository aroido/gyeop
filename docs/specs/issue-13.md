# Issue 13 구현 스펙: [안전] 서버 전용 RPC 접근과 공개 Supabase key 우회 차단

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/13

## 목표

브라우저의 publishable/anon key와 사용자 JWT가 application table 또는 mutation RPC를 직접 호출하지 못하게 하고, 이후 P0 Route Handler가 재사용할 수 있는 서버 전용 RPC allowlist·원자적 rate limit·owner actor·자동 보안 회귀 gate를 만든다.

## 범위

- `supabase/migrations/`에 `analytics_events`, `rate_limit_buckets`와 원자적 `consume_rate_limit` RPC를 추가한다.
- 두 application table에 RLS를 활성화하되 public policy는 만들지 않고, `PUBLIC`·`anon`·`authenticated`·`service_role`의 table/sequence 직접 권한을 회수한다.
- `public` schema에서 기존 함수의 `PUBLIC`·`anon`·`authenticated` EXECUTE를 회수하고, `postgres`가 이후 만드는 table/sequence/function의 같은 default privilege를 회수한다. 함수의 security mode와 무관하게 현재 application RPC 전체를 검사하며, 이번 migration의 `service_role` EXECUTE allowlist는 `consume_rate_limit(bytea,text,integer,integer)` 하나로 고정한다.
- `consume_rate_limit(p_key_hash bytea, p_action text, p_window_seconds integer, p_limit integer)`는 32-byte hash, 제한된 action, 1초~24시간 window, 양수 limit만 허용하고 한 transaction의 upsert로 count를 증가시킨다. 결과는 `allowed`, `current_count`, `limit_count`, `retry_after_seconds`, `window_start`, `expires_at`만 반환한다.
- 모든 `public` application table의 RLS·직접 grant, default ACL, `SECURITY DEFINER` 함수의 empty search path·owner·실행 권한을 전수 검사하는 pgTAP을 추가한다.
- `@supabase/supabase-js@2.110.7`, `@supabase/ssr@0.12.3`, `server-only@0.0.1`을 exact dependency로 고정하고 `lib/db/internal-rpc.ts` 한 파일에서만 `SUPABASE_SECRET_KEY` client를 만든다. raw client와 `.from()`은 노출하지 않고 이름이 고정된 RPC wrapper만 export한다.
- `lib/auth/server-auth.ts`만 Next.js `cookies()`와 public URL/key로 Supabase SSR server client를 만들고, `lib/security/account-delete-keyring.mjs`는 startup validator와 runtime이 함께 쓰는 단일 keyring parser/decoder가 된다.
- `lib/db/owner-mutation-actor.ts`에 `OwnerMutationActor`와 `withOwnerMutationActor(callback)` 계약을 둔다. public 입력에는 UID, Auth client, keyring, clock을 받지 않는다. wrapper는 시작 시각을 monotonic clock으로 먼저 고정하고 직접 `server-auth.ts`의 client를 만들어 `auth.getUser()`를 정확히 한 번 실행하며, 공용 parser가 검증·decode한 retained reader 전부로 domain-separated HMAC 후보를 계산한다. 인증·keyring·필수 referenced version·30초 total deadline 실패 시 callback을 호출하지 않는다.
- `owner-mutation-actor.ts`는 actor를 반환하거나 log하지 않고 callback에 actor와 남은 deadline의 `AbortSignal`을 한 번만 전달한다. 이 module은 `internal-rpc.ts`와 단위 테스트에서만 import할 수 있고, Route Handler는 named internal RPC wrapper만 호출한다. 따라서 transport/background retry는 actor를 재사용할 entrypoint가 없고 named wrapper를 다시 호출해 fresh auth부터 시작한다.
- 정적 verifier가 server secret client 위치, raw client/`.from()` 금지, RPC export allowlist, Auth Admin named wrapper 경계, owner mutation wrapper·lifecycle fence 계약을 검사한다.
- 아직 schema가 없는 `deleteAuthUser`, `resolveNotificationRecipient`와 owner domain RPC는 구현하지 않는다. 대신 verifier fixture가 해당 symbol 또는 migration이 추가되는 즉시 아래 계약을 강제한다.
  - 두 Auth Admin wrapper의 public input은 `{ jobId, proof }`만 허용하고 raw UID·email·배열·bulk 입력을 거부한다.
  - `deleteUser`는 `deleteAuthUser` 안에서 literal `false` 두 번째 인자로만 호출하며, `prepare_auth_deletion_call` success와 `call_before` 확인이 지배하지 않으면 실패한다.
  - `getUserById`는 `resolveNotificationRecipient` 안에서 job-bound resolver 성공 후 한 건만 호출한다. resolver missing/error/empty에서는 Admin 호출 경로가 없어야 한다.
  - 다른 `auth.admin.*`, dynamic Admin method와 named wrapper 밖의 Admin 호출은 실패한다.
  - 계정 삭제 schema를 도입하는 migration은 `private.assert_owner_mutation_actor` 공통 guard를 함께 정의해야 한다. owner create/resume/save/complete/claim 및 link create/rotate/disable 함수는 exact actor input을 받고, 주석·선언부를 제외한 첫 executable statement에서만 이 guard를 호출해야 한다. guard 하나가 lifecycle fence → retained owner-request tombstone → registration state → target/current adopted-owner anchor 순서를 소유한다. 현재 static fixture는 각 RPC의 guard 누락·두 번째 이후 호출·dead branch 호출을 실패시키고, account-delete 이슈는 guard 자체의 경쟁/runtime pgTAP을 추가한다.
- local Supabase Data API에 anon key로 table 네 동작과 `consume_rate_limit`을 직접 호출해 모두 거절되는지 확인하고, service-role RPC 경쟁 호출에서 count가 유실되지 않는지 integration test를 추가한다.
- `scripts/ai-verify`, package scripts와 CI가 pgTAP·정적 verifier·공개 key 우회·경쟁 rate limit을 매번 실행하게 한다.

## 제외 범위

- 팩·play·링크·방문자·알림·계정 삭제 domain table과 해당 RPC 구현
- 실제 `deleteAuthUser`, `resolveNotificationRecipient`, Auth Admin 호출과 계정 삭제 permit/lease schema
- Origin·Zod·body limit·network 식별·HTTP 429 Route Handler. 이것은 후속 HTTP boundary 이슈의 범위다.
- owner·visitor UI, Supabase Auth session/PKCE, pack seed, staging·production 배포
- 실제 퍼널 event 기록과 retention cleanup. `analytics_events`는 권한 경계만 만들고 event payload 계약은 분석 이슈에서 확정한다.

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 현재 로컬 팩 선택·주인 답변 UI에는 보이는 변화가 없다.
- 후속 Route Handler는 브라우저가 DB를 직접 호출하는 대신 이 이슈의 server-only wrapper를 통해서만 mutation하게 된다.
- 공개 key 우회가 거절되므로 방문자와 전환된 새 주인의 정상 흐름도 반드시 검증된 HTTP 경계를 거치게 된다.

## 디자인 영향

- 화면, 문구, 레이아웃 변경 없음.

## API와 데이터 영향

- `analytics_events`
  - `id uuid` PK, `event_name text`, object 형태로 제한한 `properties jsonb`, `occurred_at timestamptz`만 가진다. Auth UID·email·response/link/play ID를 포함한 subject column은 두지 않는다.
  - 이번 이슈에서는 insert API나 event 이름을 공개하지 않는다.
- `rate_limit_buckets`
  - PK는 `(key_hash, action, window_start)`이며 `key_hash`는 정확히 32 bytes, count는 양수, `expires_at <= window_start + 24 hours`를 constraint로 고정한다.
  - `consume_rate_limit`은 DB `clock_timestamp()`로 fixed window를 계산하고 `INSERT ... ON CONFLICT ... DO UPDATE count = count + 1 RETURNING`으로 경쟁 호출을 직렬화한다.
  - limit 초과 호출도 관측 count를 원자 증가시키고 `retry_after_seconds`는 현재 window 끝까지 남은 초를 최소 1로 올림한다.
- 두 table 모두 RLS enabled이며 public policy가 없다. 직접 table access는 `service_role`도 회수해 secret key의 허용 경로를 RPC로 한정한다.
- migration은 `gyeop_internal_rpc` 전용 role을 `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`로 만들고 role membership을 부여하지 않는다. role에는 `public` USAGE, `rate_limit_buckets`의 SELECT/INSERT/UPDATE, 그 role만 통과하는 table RLS policy와 function ownership만 준다. schema CREATE, table ownership, DELETE, 다른 application table 권한은 최종 상태에 남기지 않는다.
- `consume_rate_limit`은 `SECURITY DEFINER SET search_path = ''`, schema-qualified relation을 사용하고 `OWNER TO gyeop_internal_rpc`로 바꾼 뒤 `service_role`에만 EXECUTE를 grant한다. catalog gate는 owner role 속성·membership·exact relation privilege와 함수 owner를 함께 검사한다.
- `internal-rpc.ts`의 Supabase client는 `persistSession:false`, `autoRefreshToken:false`, `detectSessionInUrl:false`로 생성하며 module 밖으로 export하지 않는다.
- `consumeRateLimit` wrapper는 허용된 RPC 이름과 입력·출력만 노출하고 Supabase error 원문이나 secret을 log하지 않은 채 일반화된 server error로 실패한다.

## 구현 계획

1. `supabase/migrations/<timestamp>_security_data_access.sql`에 default privilege 회수, 최소 권한 `gyeop_internal_rpc` role, 두 table·constraint·index·RLS, internal-only rate-limit policy, 기존 grant 회수, `consume_rate_limit` 함수와 exact grant를 한 migration으로 추가한다.
2. `supabase/tests/data_access.test.sql`에서 extension-owned object를 제외한 public application table 전수 RLS, table/sequence grant, default ACL, 모든 application function의 public-role EXECUTE 부재와 `service_role` exact signature allowlist, definer owner/search path, internal owner role의 속성·membership·exact relation privilege를 pgTAP으로 검증한다.
3. `lib/db/internal-rpc.ts`에 유일한 secret client와 `consumeRateLimit` wrapper를 구현하고 `.env.example`에 값 없는 `SUPABASE_SECRET_KEY` placeholder를 추가한다.
4. 공용 keyring parser를 `scripts/validate-env.mjs`와 runtime에서 재사용하고, `lib/auth/server-auth.ts`가 caller 입력 없이 SSR Auth client를 만들게 한다. `lib/db/owner-mutation-actor.ts`에는 이 두 module만 사용하는 fresh auth, retained reader HMAC 후보, required reader 확인, monotonic 30초 total deadline·AbortSignal과 one-shot callback 계약을 구현한다.
5. TypeScript compiler AST를 사용하는 `scripts/verify-data-access.mjs`를 추가한다. 실제 `app/`·`lib/`와 migration을 검사하고, 순수 검증 함수를 export해 synthetic fixture에도 같은 규칙을 적용한다. future owner SQL은 공통 guard의 첫 top-level statement 호출을 고정하고, guard 내부의 runtime 순서는 account-delete migration의 pgTAP 책임으로 명시한다.
6. `tests/unit/data-access-policy.test.mjs`에 secret 위치/raw export/`.from()`/RPC allowlist/Auth Admin false-only/jobId-proof/resolver fail-closed/owner lifecycle 순서의 pass·fail fixture를 추가한다.
7. `tests/unit/owner-mutation-actor.test.mjs`에서 fresh `getUser()` 1회, retained reader 후보, unknown/missing reader, auth error, deadline, callback 미실행과 새 호출 시 fresh auth 재검증을 검증한다.
8. `tests/integration/data-access.test.mjs`가 local status에서 URL·anon·service key를 process memory로만 읽고 table GET/POST/PATCH/DELETE와 anon RPC가 non-2xx인지, 같은 bucket의 병렬 RPC count가 1..N을 빠짐없이 반환하는지 검증한다. key와 response body는 출력하지 않는다.
9. `package.json`, `pnpm-lock.yaml`, Prettier/ESLint 범위와 `scripts/ai-verify`에 새 정적·단위·integration gate를 연결한다.

## 완료 기준

- [ ] anon/authenticated role은 모든 public application table의 SELECT/INSERT/UPDATE/DELETE와 `consume_rate_limit` EXECUTE 권한이 없다.
- [ ] service_role도 table 직접 권한은 없고 `consume_rate_limit` EXECUTE만 가진다.
- [ ] 새 public application table의 RLS가 꺼져 있거나 table/sequence/function default grant가 열리면 pgTAP이 실패한다.
- [ ] security mode와 무관하게 모든 application function은 `PUBLIC`·`anon`·`authenticated` EXECUTE가 없고, `service_role` EXECUTE는 코드와 테스트에 명시한 exact signature allowlist와 일치한다.
- [ ] `SECURITY DEFINER` 함수가 최소 권한 `gyeop_internal_rpc` owner, empty search path, schema-qualified relation 중 하나라도 어기거나 owner role에 login/superuser/bypassrls/role membership/과도한 relation 권한이 생기면 pgTAP 또는 정적 gate가 실패한다.
- [ ] `SUPABASE_SECRET_KEY`와 secret `createClient`는 `lib/db/internal-rpc.ts`에만 있고 raw client와 `.from()`은 export·호출되지 않는다.
- [ ] 허용되지 않은 RPC export, 다른 Auth Admin method, named wrapper 밖 Admin 호출, soft/dynamic delete, raw UID/email/array wrapper 인자 fixture는 정적 gate에서 실패한다.
- [ ] named Auth wrapper가 resolver/prepare error·empty·denied·expired 뒤 Admin method에 도달하는 fixture는 실패하고, wrapper가 아직 없는 현재 runtime에는 가짜 Admin 동작을 추가하지 않는다.
- [ ] `withOwnerMutationActor`는 UID/Auth/keyring을 caller에게 받지 않고 매 실행마다 server Auth client의 fresh UID와 공용 parser의 모든 retained key-version HMAC 후보를 만든다. auth/key/referenced-reader/deadline 실패 때 callback은 0회이며 callback은 total deadline AbortSignal을 받는다.
- [ ] owner actor module을 Route에서 직접 import하거나 callback 결과로 actor를 노출하는 fixture, owner RPC에서 deadline signal을 연결하지 않는 fixture는 정적 gate가 실패한다.
- [ ] 후속 owner mutation SQL fixture가 exact actor input을 생략하거나 첫 top-level statement에서 `private.assert_owner_mutation_actor`를 호출하지 않으면 정적 gate가 실패한다. guard 내부의 fence·tombstone·registration·anchor 경쟁 의미는 guard가 도입되는 account-delete 이슈의 pgTAP으로 검증한다.
- [ ] anon key의 Data API table 네 동작과 RPC 직접 호출이 모두 거절된다.
- [ ] 같은 bucket을 동시에 호출해도 반환 count가 1..N으로 유실 없이 증가하고 정확히 limit 이하 호출만 `allowed=true`이며 모든 거절 결과가 양수 `retry_after_seconds`를 가진다.
- [ ] focused 검증과 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `pnpm exec supabase db lint --local --level warning`
- `pnpm supabase:reset && pnpm test:db`
- `node --test tests/unit/data-access-policy.test.mjs tests/unit/owner-mutation-actor.test.mjs`
- `node --test tests/integration/data-access.test.mjs`
- `node scripts/verify-data-access.mjs`
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 제품 event는 기록하지 않는다.
- integration test와 wrapper 오류에는 action, key hash, secret, UID, email, raw proof, Supabase response body를 log하지 않는다.
- rate-limit 결과는 후속 HTTP boundary가 `allowed`, `currentCount`, `retryAfterSeconds`만 사용하게 하고 bucket key 원문은 반환하지 않는다.

## 개인정보와 악용 방지

- rate-limit key는 Route가 나중에 만든 32-byte hash만 받으며 IP·link token·UID·email 원문을 저장하지 않는다.
- analytics properties는 JSON object만 허용하지만 허용 event/property 목록은 후속 분석 이슈 전까지 write surface가 없다.
- account-delete HMAC signing key는 process memory 안에서만 사용하고 actor 후보에는 key version과 digest만 포함한다.
- public Data API 우회, secret client 직접 table 접근, Auth Admin 임의 UID/bulk 접근을 서로 독립된 gate로 막는다.

## 롤아웃과 복구

- migration은 새 table/function을 추가하고 public/default grant를 회수하는 forward-only change다. local reset·CI 뒤 staging에 먼저 적용한다.
- 후속 P0 migration은 이 권한 상태를 전제로 하므로 production 적용 뒤 단순 down migration으로 grant를 다시 열지 않는다. 문제 발생 시 새 forward-fix migration으로 함수 또는 exact service-role EXECUTE만 교정한다.
- app wrapper는 아직 호출하는 Route가 없으므로 제품 트래픽 전환은 없다. wrapper 회귀 시 app commit을 되돌릴 수 있지만 DB 권한 회수는 유지한다.

## 스펙 검토

Reviewer Agent: issue13_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- Supabase project별 built-in default ACL owner가 다를 수 있다. migration은 application object creator인 `postgres`의 기본 권한을 회수하고 pgTAP은 실제 application object에 남은 public grant를 최종 판정한다. 다른 owner가 future migration을 만들면 CI catalog gate가 차단한다.
- `service_role` table 직접 grant도 회수하므로 이후 모든 server data access는 definer RPC로만 추가해야 한다. `gyeop_internal_rpc`는 로그인·role membership·BYPASSRLS 없이 exact table policy와 privilege만 받아 이 경계를 넓히지 않는다.
- Auth Admin과 owner lifecycle의 전체 runtime 검증은 해당 schema가 생기는 후속 이슈에서 완성된다. 이번 이슈는 그 코드가 들어오는 순간 실패하는 정적 fixture gate까지만 제공하며 보안 동작을 흉내 내는 placeholder는 만들지 않는다.
- 구현 전 해결해야 할 외부 블로커는 없다.
