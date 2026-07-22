# Issue 35 구현 스펙: [QA] 무료 MVP local/CI·Render Free 성능 smoke gate

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/35

## 목표

월 `$0` private MVP에서 local/CI와 이미 존재하는 Render Free를 대상으로, 쓰기 없이 재실행할 수 있는 모바일 LCP·warm HTTP 성능 smoke gate를 제공한다.

## 범위

- [ ] 기존 Node·Playwright 의존성만 사용하는 `scripts/verify-private-mvp-performance.mjs` CLI를 추가한다.
- [ ] 대상은 전용 local production port의 정확한 `http://127.0.0.1:3120` 또는 정확한 `https://gyeop-private-mvp.onrender.com`만 허용하고 `localhost`, 다른 loopback port, IPv6, URL credential, 임의 host, query/hash/path 입력은 거부한다.
- [ ] 모든 측정 request를 `GET` 또는 `HEAD`로 고정한다. 로그인·쿠키 주입·쓰기 Route·DB mutation은 호출하지 않는다.
- [ ] 측정 순서는 고정한다: target 검증 → `/` cold HEAD 1회 → 각자 새 incognito context와 빈 browser HTTP cache를 쓰는 throttled 홈 LCP navigation 3회 → browser 종료 → `/` warm GET 3회 → `/api/packs/old-friend` warm GET 20회. 모든 HTTP 표본은 순차 실행하고 `cache-control: no-cache`를 보낸다.
- [ ] cold HEAD는 최대 35초의 별도 표본으로 기록하고 이후 LCP/HTTP warm 표본과 합치지 않는다. HEAD 성공 뒤 이미 깨어난 app service를 측정하되 LCP 세 navigation끼리는 browser cache/cookie/storage를 공유하지 않는다.
- [ ] 390×844 Chromium, reduced motion, Fast 4G, 4× CPU 조건의 홈 LCP 3회 중앙값을 2.5초 예산으로 판정한다. 세 LCP navigation은 뒤의 세 warm HTTP GET과 별도 표본이다.
- [ ] 홈 warm GET 3회 중앙값과 `/api/packs/old-friend` GET 20회 p95·오류율을 수집한다. pack 예산은 무료 원격 변동을 고려해 p95 1초, 오류율 0으로 둔다.
- [ ] percentile·median·gate 판정·URL allowlist·read-only request 계획·HTTP 표본 수를 deterministic `node:test`로 검증한다.
- [ ] package script와 full verify에 deterministic test를 연결하고 zero-cost runbook에 재실행 명령·JSON schema·한계를 기록한다.

## 제외 범위

- [ ] 유료 load environment, 새 hosted resource, 외부 성능 SaaS, production SLA와 RUM 수집은 포함하지 않는다.
- [ ] staging DB 1,000건 seed, 동시 사용자 부하, 로그인·쓰기 API 측정과 hosted DB mutation은 포함하지 않는다.
- [ ] 측정 전 최적화, cache, materialized view와 Render/Supabase 설정 변경은 포함하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/engineering/private-mvp-zero-cost-runbook.md
- docs/engineering/p0-development-plan.md
- AGENTS.md

## 사용자 흐름 영향

- [ ] 제품 UI와 owner→visitor→new-owner 흐름은 바꾸지 않는다. 이미 공개된 홈과 pack read endpoint만 측정한다.

## 디자인 영향

- [ ] 없음. 제품 UI 변경이 아니므로 Lazyweb/목업 작업도 없다.

## API와 데이터 영향

- [ ] Route, DB schema, migration, storage, auth 변경 없음.
- [ ] CLI 출력은 status·duration·LCP와 aggregate만 포함하며 response body, cookie, header value, URL query는 저장하지 않는다.

## 구현 계획

- [ ] `scripts/verify-private-mvp-performance.mjs`에 exact URL 파서, fixed read-only request plan, percentile/median, HTTP와 Chromium 측정, LCP missing classification, gate 판정, JSON 출력/exit code를 둔다.
- [ ] `tests/unit/private-mvp-performance.test.mjs`에서 pure contract와 `127.0.0.1:3120` fake HTTP server를 검증한다. test server가 port를 쓸 수 없으면 skip하지 않고 실패한다.
- [ ] `package.json`과 `scripts/ai-verify`에 deterministic test와 formatter 대상만 추가한다. 원격 Render 측정은 CI required check에 넣지 않는다.
- [ ] `docs/engineering/private-mvp-zero-cost-runbook.md`에 local production build와 Render Free read-only 실행법을 기록한다.

## 완료 기준

- [ ] 허용 URL에서 JSON result를 출력하고 LCP median≤2500ms, pack p95≤1000ms, 오류율=0, cold start≤35000ms를 독립 판정한다.
- [ ] JSON top-level은 정확히 `schemaVersion`, `target`, `profile`, `budgets`, `coldStart`, `homeLcp`, `warmHome`, `packRead`, `outcome`이며 각 metric은 `samplesMs`, 해당 `medianMs|p95Ms`, `errorRate`, `passed` 중 적용되는 고정 key만 가진다.
- [ ] 임의 host·credential·query/hash/path 입력은 network call 전에 실패한다.
- [ ] request plan에는 `/` HEAD 1회, `/` GET 3회, `/api/packs/old-friend` GET 20회만 있다.
- [ ] LCP collector가 세 navigation 중 하나라도 finite positive value를 반환하지 않으면 `homeLcp.passed=false`, `outcome=fail`, nonzero exit로 수렴하며 deterministic test가 이 분기를 고정한다.
- [ ] 예산 초과 또는 non-2xx 표본이 있으면 CLI exit code가 nonzero다.
- [ ] local/CI deterministic test와 exact-head full verify가 통과한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] `pnpm test:performance`
- [ ] 정확한 `http://127.0.0.1:3120` fake server로 HTTP sequence를 검증하고, 기존 Render Free 대상으로 read-only CLI 1회 실행한 결과를 QA artifact에 기록한다.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`

## 분석과 관측성

- [ ] 새 analytics event, RUM beacon, 대시보드 없음.
- [ ] stdout JSON은 `target`, budget, sample duration과 pass/fail만 포함하고 body·token·cookie·개별 pack content를 포함하지 않는다.

## 개인정보와 악용 방지

- [ ] 공개 홈과 공개 pack GET만 사용한다. owner/visitor capability, Auth, share secret, 관리 token을 받거나 전송하지 않는다.
- [ ] CLI host allowlist와 고정 path가 SSRF·임의 endpoint 접근을 막고 HTTP method 상수가 hosted mutation을 막는다.

## 롤아웃과 복구

- [ ] 앱 런타임·DB 변경이 없어 배포 순서나 data rollback이 없다.
- [ ] 회귀 시 CLI, test, package script, runbook 변경만 PR revert한다.
- [ ] Render Free cold start는 별도 항목이며 warm budget 실패와 섞지 않는다. 원격 변동만으로 CI required check를 실패시키지 않는다.

## 스펙 검토

Reviewer Agent: /root/critic_35
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] LCP PerformanceObserver가 값을 주지 않으면 측정 실패로 처리하며 다른 paint metric으로 성공을 추정하지 않는다.
- [ ] Render Free가 35초 안에 깨어나지 않으면 실패로 기록하되 유료 전환이나 provider 설정 변경을 자동 수행하지 않는다.
- [ ] 원격 결과는 해당 시점의 best-effort evidence일 뿐 public production SLA가 아니다.
