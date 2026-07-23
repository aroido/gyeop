# Issue 144 QA

Reviewer Agent: /root/issue144_verifier
Status: PASS
P0/P1 Findings: 0
Verified HEAD: `5e14e0ab789d8cfed029e4d80791282e24281fb2`

## 검증 증거

- `node --test tests/unit/google-analytics.test.mjs tests/unit/http-boundary-policy.test.mjs tests/unit/zero-cost-mvp.test.mjs`: 36 passed.
- `pnpm test`: 202 passed. 새 `tests/unit/google-analytics.test.mjs`가 기본 unit gate에 포함됨을 확인했다.
- `pnpm test:e2e:analytics`: 7 passed. 일반 mock E2E는 analytics fixture 없이 유지하고 `scripts/ai-verify`의 mock lane이 별도 port/build로 이 명령을 이어서 실행한다.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `git diff --check`: 통과.
- GA fixture E2E는 모든 Google endpoint를 intercept해 실제 property로 test event를 보내지 않았다.
- DB, migration, API, 내부 funnel registry 변경이 없고 `public.analytics_events`와 `private.core_funnel_stage_counts` 계약이 유지됨을 diff로 확인했다.

## QA 판정

- measurement ID가 누락되거나 invalid이면 동의 UI, Google script, collect request와 Google CSP source가 모두 비활성화된다.
- pending·denied·storage read/write 예외·다른 탭의 invalid 변경에서 active analytics가 fail-closed된다.
- grant 뒤 consent → sanitized global set → config(`send_page_view:false`) → manual page view 순서를 지키며 SPA 이동은 `update:true` config 뒤 route-class page view만 보낸다.
- 모든 fixture collect hit에서 query, fragment, raw public/play ID와 금지 sentinel이 제거되며 같은 route class의 다른 동적 pathname은 각각 1회 측정된다.
- revoke는 GA disable flag를 적용하고 Google script, dataLayer와 `_ga*` cookie를 제거하되 제품 capability cookie는 유지한다.
- GA cookie는 host-only, 최초 생성부터 60일, non-renewing으로 설정된다.

## 발견 사항

- P0/P1/P2 없음.
- 실제 GA4 Admin, Render exact-HEAD 배포, production network와 Realtime 검증은 PR/CI 이후 운영 gate에서 별도 수행한다.

## 필수 수정

- 없음.
