# Issue 144 구현 스펙: GYEOP GA4 안전 연동과 운영 수집 검증

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/144

## 목표

GYEOP 전용 GA4 property와 Render web stream을 만들고, 현재 브라우저에서 분석 수집을 명시적으로 허용한 사용자에게서만 식별자를 제거한 route class `page_view`를 전송하여 운영 Realtime 수집까지 검증한다.

## 범위

- [ ] Google Analytics 관리 화면에 다른 서비스와 공유하지 않는 `GYEOP` GA4 property와 `GYEOP Render Web` web stream을 만들고 stream URL을 `https://gyeop-private-mvp.onrender.com`으로 고정한다.
- [ ] property/stream은 대한민국·Asia/Seoul·KRW 기준으로 만들고 다음 privacy 설정을 운영 증거와 함께 고정한다.
  - Enhanced measurement 전체 OFF. 특히 browser history 기반 page view를 켜지 않는다.
  - Google signals 전체 지역 OFF, user-provided data collection OFF, property-level 광고 개인화 OFF, Google Ads 및 다른 광고 제품 link 없음.
  - 이 property에서 user-provided data, Google Ads 등 새 product link나 data-sharing opt-in을 만들지 않는다. 기존 Analytics account의 다른 property에 영향을 주는 account-wide 설정은 무단 변경하지 않는다.
  - user/event data retention은 `2 months`, 새 활동 시 사용자 데이터 만료 재설정은 OFF한다. 이 설정이 standard aggregated report 보관에는 적용되지 않는다는 Google 제약을 정책 문서에 그대로 밝힌다.
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID`를 `^G-[A-Z0-9]+$`에 맞는 유효한 build-time public 값으로만 인정한다. 누락, 빈 문자열, 공백, 소문자 또는 invalid 값이면 동의 UI, Google script, `dataLayer`, GA cookie, collect 요청 및 Google CSP source를 모두 비활성화한다.
- [ ] `Dockerfile`의 build `ARG`/`ENV`, `render.yaml`, `.env.example`, `README.md`, `scripts/verify-zero-cost-mvp.mjs`를 함께 갱신하여 Render build 시 실제 web stream measurement ID가 주입되는 계약을 만든다. ID는 public configuration이지만 repository에 실제 운영값을 하드코딩하지 않는다.
- [ ] root layout에 client analytics 경계를 한 번만 mount한다. 유효한 ID가 있고 현재 브라우저의 exact consent가 `granted`일 때만 hydration 뒤 `https://www.googletagmanager.com/gtag/js?id=<measurement-id>`를 요청한다. 서버 HTML, preload/preconnect와 동의 전 client render에는 Google resource를 넣지 않는다.
- [ ] first-party 분석 동의 UI와 설정 화면을 제공한다.
  - 유효한 ID가 있고 저장된 선택이 없을 때 모든 화면 하단에 non-modal 안내 영역을 표시한다. `분석 허용`과 `허용하지 않음`을 동일한 접근성·가시성의 명시적 버튼으로 제공하고, 사전 선택·닫기만으로 허용·dark pattern을 두지 않는다.
  - 안내문은 서비스 개선용 익명 route-class 방문 통계, Google Analytics 사용, GA가 생성하는 analytics cookie/client·session 식별자와 기기·브라우저·대략적 지역 정보를 밝히고 `/privacy` 상세 안내로 연결한다. 브라우저 GA cookie 60일 상한과 Google provider의 user/event data retention 2개월은 서로 다른 기간임을 구분해 설명한다.
  - exact localStorage key `gyeop:analytics-consent:v1`에는 `granted` 또는 `denied`만 저장한다. 누락·다른 값·read/write 예외는 `pending`으로 fail-closed하고 태그를 로드하지 않는다. 선택은 계정이나 다른 브라우저와 동기화하지 않는다.
  - `/privacy`에서 현재 선택을 확인하고 `분석 허용` 또는 `분석 중단`으로 언제든 변경할 수 있다. 중단 시 먼저 `denied`를 저장하고 전역 GA disable flag/consent를 적용하며 현재 origin의 `_ga`, `_ga_*` cookie를 제거한 뒤 reload한다. reload 후 Google script/collect가 0건임을 검증한다.
  - 키보드 focus, `:focus-visible`, 44px 이상 action target, safe-area, 360px viewport, screen reader용 제목/설명을 보장한다. 제품 이용은 pending·denied 상태에서도 막지 않는다.
- [ ] `send_page_view: false`로 config 기본 page view를 끄고, consent 이후 첫 화면과 App Router pathname 이동마다 수동 `page_view`를 정확히 1회 전송한다. query/hash/fragment만 바뀐 경우에는 새 page view를 만들지 않는다.
- [ ] raw pathname은 브라우저 메모리에서 중복 판정에만 쓰고 `dataLayer`, network, log, storage에는 넣지 않는다. 서로 다른 raw pathname이 같은 route class로 정규화되어도 실제 pathname 이동이면 각각 1회 전송한다.
- [ ] GYEOP가 명시하는 event parameter는 `page_location`, `page_title`, 빈 `page_referrer`의 exact allowlist만 사용한다. `page_location`은 현재 first-party origin과 아래 정규화 route class만 결합하고 `page_title`도 해당 class의 고정 한글 label만 사용한다. `ignore_referrer: true`를 적용한다.

  | 실제 pathname | 전송 route class | 고정 page title |
  |---|---|---|
  | `/` | `/` | `겹 · 홈` |
  | `/play/new`, `/play/old-friend` | `/play/start` | `겹 · 질문팩 시작` |
  | `/play/<playId>` | `/play/:playId` | `겹 · 내 답변` |
  | `/i/<publicId>` | `/i/:publicId` | `겹 · 친구 초대` |
  | `/auth/sign-in` | `/auth/sign-in` | `겹 · 로그인` |
  | `/auth/complete-profile` | `/auth/complete-profile` | `겹 · 가입 완료` |
  | `/me` | `/me` | `겹 · 내 프로필` |
  | `/me/plays/<playId>` | `/me/plays/:playId` | `겹 · 질문팩 관리` |
  | `/me/profile/<playId>` | `/me/profile/:playId` | `겹 · 프로필 보기` |
  | `/responses/manage` | `/responses/manage` | `겹 · 답변 관리` |
  | `/privacy` | `/privacy` | `겹 · 개인정보와 문의` |
  | 그 외 page pathname | `/other` | `겹 · 기타 화면` |

- [ ] route matcher는 segment 개수와 고정 prefix를 exact 비교한다. URL decode, query parsing, substring/startsWith 포괄 매칭으로 입력을 되살리지 않으며 API route는 client page allowlist에 넣지 않는다.
- [ ] 사용자가 이미 명시적으로 grant한 뒤 외부 tag script element를 삽입하기 전에 `dataLayer`/`gtag` queue를 만들고, 첫 command로 `gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })`를 넣는다. 그 뒤에만 `js`, sanitized global `set`, `config`, initial manual `page_view`를 순서대로 queue하고 마지막에 external script를 요청한다. consent field를 `config` option으로 넣지 않는다. 철회 때는 collect를 더 보내기 전에 `gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })`와 GA disable flag를 적용한다.
- [ ] consent default 다음, `config`보다 먼저 현재 pathname을 core helper로 정규화하고 `gtag('set', { page_location, page_title, page_referrer: '' })`로 global default event parameter를 설정한다. 이어지는 `gtag('config', measurementId, ...)`에는 같은 sanitized 세 값과 `send_page_view: false`, `allow_google_signals: false`, `allow_ad_personalization_signals: false`, `ignore_referrer: true`, `cookie_expires: 5184000`, `cookie_update: false`만 명시한다. GA cookie는 최초 생성부터 최대 60일이며 새 page view로 만료를 연장하지 않는다.
- [ ] App Router pathname 이동 시 manual `page_view`를 보내기 전에 global sanitized defaults를 새 route class/title로 갱신한다. Enhanced Measurement와 automatic page view는 stream에서 OFF하지만, GA가 자체 생성할 수 있는 `first_visit`, `session_start`, `user_engagement` 등 모든 collect hit도 `document.location`, `document.title`, `document.referrer` 기본값 대신 마지막 sanitized defaults만 갖도록 한다.
- [ ] `user_id`, user properties, custom dimensions, custom events와 campaign/query parameter는 설정하지 않는다. E2E와 운영 network QA는 `page_view`만 보지 않고 consent 이후 발생한 모든 `g/collect` request의 query/body를 검사해 raw 동적 URL과 금지 식별자가 0건임을 증명한다.
- [ ] CSP 코드 계약의 initial exact allowlist는 `script-src https://www.googletagmanager.com`, `connect-src https://www.google-analytics.com https://region1.google-analytics.com`이다. beacon/fetch 대신 image transport가 실제 필요한 경우에만 같은 두 collect origin을 `img-src`에 명시한다. valid ID에서만 이 고정 host set을 추가하고 wildcard, Google Ads, DoubleClick, GTM container endpoint 또는 다른 Google origin은 허용하지 않는다. 브라우저 localStorage는 static response header를 바꿀 수 없으므로 CSP source의 존재는 valid build configuration으로 제한하고, 실제 script/network 권한은 consent component가 통제한다.
- [ ] 운영 CSP violation이 위 exact host 밖에서 발생하면 analytics를 먼저 disabled 배포로 복구한다. 요청 host·path가 공식 gtag의 analytics collect이고 sanitized payload만 운반한다는 증거를 확인한 뒤에만 source constant, unit/CSP snapshot, CI를 새 PR에서 갱신하고 새 exact-HEAD 배포로 재검증한다. 현장 hot-edit나 wildcard 확장은 금지한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/decision-log.md`, `docs/product/data-retention-and-deletion-policy.md`, `/privacy`, `README.md`를 함께 갱신한다.
  - 제품 전환·세부 퍼널의 canonical SSOT는 계속 `public.analytics_events`와 `private.core_funnel_stage_counts`다.
  - GA4는 consented traffic의 coarse route-class page view와 운영 태그 건강 확인만 담당한다.
  - 내부 raw analytics 30일/비식별 집계 1년 정책은 유지하고, GA4 외부 user/event data 2개월과 standard aggregate report 제약을 별도 provider 범주로 기록한다.
  - `cookie_expires: 5184000`의 브라우저 cookie 60일 상한, localStorage consent 선택의 지속, GA provider user/event retention 2개월은 서로 다른 lifecycle임을 문서에서 혼용하지 않는다.
- [ ] 독립 verifier용 `docs/temp/qa/issue-144.md`에는 fake ID 기반 focused/local QA만 기록하고 `scripts/task-harness pr` 전 byte-stable하게 확정한다. merge 뒤 이 파일을 수정하지 않는다.
- [ ] 운영 외부 설정과 Realtime 증거는 별도 ignored artifact `docs/temp/qa/issue-144-production.md`에 남긴다. property/stream 이름, production URL, measurement ID suffix, exact PR head SHA, Render specific-commit deploy ID, 배포 전 safe main SHA와 Auto-Deploy readback, 설정 확인 시각, fresh-browser network 캡처 path, Realtime page view 확인 시각을 기록하되 Google account email, cookie/client ID, publicId/playId, Auth UID, nickname, 답변, 관계·시점, secret은 남기지 않는다.

## 제외 범위

- [ ] `public.analytics_events`, `private.core_funnel_stage_counts`, 기존 RPC/trigger/event registry/schema/migration/retention cleanup의 변경 또는 GA4로의 이관.
- [ ] 내부 제품 event(`owner_completed`, `visitor_required_submitted`, `profile_reshare_clicked` 등)의 GA4 복제와 custom event·custom dimension·user property 추가.
- [ ] Google Ads, remarketing, audience export, Google signals, demographic/interests report, User-ID, user-provided data, cross-device identity, advertising personalization.
- [ ] GTM, Measurement Protocol, server-side tagging, BigQuery export, 새 analytics provider, consent-management dependency 또는 유료 서비스.
- [ ] query/hash/fragment/referrer/campaign 원문, 동적 `publicId`·`playId`·response ID·link ID·Auth UID, nickname·email·답변·관계·알게 된 시점·secret의 전송.
- [ ] GA4 Realtime 수치를 제품 전환율이나 실험 판정의 canonical 지표로 사용하는 작업.
- [ ] 계정 간 consent 동기화, server-side consent table/cookie, 지역별 CMP·법률 자문 또는 공개 beta 승인.

## SSOT

- `AGENTS.md`: active 문서 우선순위와 private MVP 제품 경계.
- `.codex/AGENTS.md`: owner → visitor → new-owner → profile-reshare 핵심 루프, privacy invariant, 완료 gate.
- `docs/product/core-feature-priority.md`: 내부 analytics event와 core funnel의 제품 SSOT, 개인정보 금지 항목, private MVP 범위.
- `docs/engineering/core-funnel-events.md`: 내부 funnel/stage/event registry와 `private.core_funnel_stage_counts` 집계 계약.
- `docs/engineering/private-mvp-zero-cost-runbook.md`: 기존 Render Free service, build-time public variable, 실제 provider 검증 경계와 운영 복구 절차.
- `docs/product/decision-log.md`: GA4의 보조적 route-class 관측 역할과 명시 동의 결정을 추가할 canonical decision record.
- `docs/product/data-retention-and-deletion-policy.md`: 내부 raw/aggregate 보관 상한과 이번에 추가할 GA4 외부 provider 보관 고지.
- `docs/engineering/p0-development-plan.md` §8.2, §8.4, §9: `analytics_events` subject/property allowlist, 관계·시점 analytics 금지, transaction event 기록 계약.
- `app/layout.tsx`, `app/privacy/page.tsx`, `app/(public)/home-client.tsx`: root mount, 공개 privacy 안내와 접근 경로.
- `lib/http/security-headers.mjs`, `next.config.ts`: 모든 route의 CSP 생성 경계.
- `Dockerfile`, `render.yaml`, `.env.example`, `scripts/verify-zero-cost-mvp.mjs`: public build-time environment와 Render Free deployment 검증 계약.
- `package.json`, `scripts/ai-verify`, `.github/workflows/ci.yml`: 새 unit/E2E가 local full verify와 named `verify` CI에 실제 포함되는 실행 계약.
- [Google Analytics configuration reference](https://developers.google.com/analytics/devguides/collection/ga4/reference/config): `send_page_view`, `page_location`, `page_title`, `page_referrer`, Google signals/광고 개인화 tag option.
- [Google Analytics pageview guide](https://developers.google.com/analytics/devguides/collection/ga4/views): manual page view와 Enhanced measurement 중복 주의.
- [Google Analytics enhanced measurement guide](https://support.google.com/analytics/answer/9216061): stream-level 자동 event 비활성 설정.
- [Google Analytics data retention guide](https://support.google.com/analytics/answer/7667196): 2개월 user/event retention과 standard aggregated report 예외.
- [Google Analytics signals guide](https://support.google.com/analytics/answer/9445345): signals와 property-level 광고 개인화 설정.

## 사용자 흐름 영향

1. measurement ID가 없거나 invalid면 지금과 동일하게 어떤 동의 UI나 GA 동작도 보이지 않는다.
2. valid 운영 build의 새 브라우저는 기존 홈·질문·초대·답변 기능을 즉시 사용할 수 있고, 화면 하단에서 선택 가능한 분석 안내만 본다. 선택 전에는 Google tag/cookie/request가 없다.
3. `허용하지 않음`을 누르면 선택이 현재 브라우저에 보존되고 안내가 사라진다. 이후 어떤 page 이동에서도 Google request가 없다.
4. `분석 허용`을 누르면 그 시점의 화면 route class page view가 1회 전송된다. 이후 owner, visitor, new-owner 흐름의 pathname 이동은 동적 값이 제거된 route class로만 각각 1회 전송된다.
5. 사용자는 홈의 기존 `정책과 문의` 링크로 `/privacy`에 진입해 수집 범위·Google Analytics·보관기간을 확인하고 선택을 바꿀 수 있다.
6. 허용을 철회하면 현재 브라우저의 GA cookie를 지우고 page를 reload한다. 제품 데이터·로그인·owner/visitor capability cookie와 내부 analytics row에는 영향이 없다.

## 디자인 영향

- root에 360px 모바일 우선 하단 consent banner를 추가한다. 콘텐츠를 가리는 blocking modal은 쓰지 않고 safe-area 위에 배치하며 기존 핵심 CTA를 누를 수 있어야 한다.
- `분석 허용`, `허용하지 않음`은 같은 hierarchy와 hit area를 사용한다. `자세히 보기`는 `/privacy`로 연결한다. Lazyweb의 모바일 consent 사례에서 확인한 명시적 accept/refuse/settings 구조만 차용하며 광고·개인화용 다중 toggle은 만들지 않는다.
- `/privacy`에는 `분석 설정` section과 현재 상태를 추가한다. 이미 선택한 사용자가 banner를 다시 띄울 필요 없이 이 section에서 허용·중단할 수 있어야 한다.
- 기존 CSS Modules와 color token을 재사용하고 UI library/dependency는 추가하지 않는다.

## API와 데이터 영향

- Supabase schema, migration, RLS, DB function, application API route 변경 없음.
- consent는 current-browser `localStorage` 한 key에만 보관하며 server, Supabase, GA user property로 복제하지 않는다.
- Google 측에는 consent 후 GA가 생성하는 pseudonymous analytics cookie/client·session 식별자와 자동 device/browser/대략적 지역 정보가 생길 수 있다. GYEOP가 가진 account/owner/visitor identifier와 결합하지 않는다. 브라우저 GA cookie는 최초 생성부터 최대 60일이고 page view로 연장하지 않지만, 이는 Google property의 user/event data retention 2개월이나 localStorage consent 선택의 존속기간을 뜻하지 않는다.
- GA에 보내는 GYEOP 제공 payload schema는 아래 exact 형태다.

  ```ts
  type GyeopGaPageView = {
    page_location: `${string}${
      | "/"
      | "/play/start"
      | "/play/:playId"
      | "/i/:publicId"
      | "/auth/sign-in"
      | "/auth/complete-profile"
      | "/me"
      | "/me/plays/:playId"
      | "/me/profile/:playId"
      | "/responses/manage"
      | "/privacy"
      | "/other"}`;
    page_title: string;
    page_referrer: "";
  };
  ```

- `window.dataLayer`에는 ordered consent/js/set/config command와 sanitized manual `page_view`만 GYEOP code가 push한다. raw URL이나 product event를 push하지 않으며 provider가 생성한 automatic hit도 network에서 별도 검사한다.
- measurement ID는 public 값이지만 source·docs·artifact에는 실제 full ID를 기록하지 않고 Render environment에서만 관리한다. 테스트는 실제 property와 연결되지 않은 fixture `G-TEST123`을 사용한다.

## 구현 계획

1. `lib/analytics/google-analytics-core.mjs`를 추가해 measurement ID validation, exact pathname → route class/title normalization, page-view payload 생성을 한곳에 둔다. `lib/http/security-headers.mjs`와 client component가 같은 ID validator를 재사용한다.
2. `app/analytics-consent.tsx`와 `app/analytics-consent.module.css`를 추가한다. consent state read/write, first-choice banner, gtag script lifecycle, manual page-view dispatch, route-transition deduplication, revoke/cookie cleanup을 이 client boundary 한 곳에서 처리한다.
3. `app/layout.tsx`는 build-time ID를 component prop으로 전달하고 root에서 한 번 mount한다. server component에서 Google `Script`나 inline gtag를 직접 렌더하지 않는다.
4. `app/privacy/analytics-preference.tsx`를 추가하고 `app/privacy/page.tsx`, `page.module.css`를 갱신해 provider·자동 수집 범위·보관기간·설정 변경을 설명한다. root component와 동일 localStorage key/utility를 재사용한다.
5. `lib/http/security-headers.mjs`가 valid ID일 때만 exact script host `www.googletagmanager.com`과 collect hosts `www.google-analytics.com`, `region1.google-analytics.com`을 고정 source constant로 추가하도록 만들고 invalid/missing에서는 현재 CSP와 byte-equivalent Google-free source set을 유지한다.
6. `Dockerfile`, `render.yaml`, `.env.example`, `README.md`, `scripts/verify-zero-cost-mvp.mjs`, `playwright.config.ts`를 갱신해 build-time public variable과 test fixture 전달을 검증한다.
7. `docs/product/core-feature-priority.md`, `docs/product/decision-log.md`, `docs/product/data-retention-and-deletion-policy.md`에 secondary analytics 역할, explicit consent, 금지 payload, GA4 provider retention/aggregate limitation과 내부 SSOT 불변을 기록한다.
8. `tests/unit/google-analytics.test.mjs`에서 ID validation, 모든 정적·동적 route class, malformed/unknown fallback, exact payload key와 금지 sentinel 제거를 검증한다. `tests/unit/http-boundary-policy.test.mjs`, `tests/unit/zero-cost-mvp.test.mjs`에 CSP와 build contract를 추가한다. 새 unit file을 `package.json`의 기존 `test` script에 명시적으로 추가해 `pnpm test`와 full verify에서 누락되지 않게 한다.
9. `tests/e2e/google-analytics.spec.ts`에서 fake ID/tag response로 pending·deny·grant·SPA navigation·same-class different-ID navigation·query/hash ignore·reload persistence·revoke/cookie cleanup·accessibility를 검증한다. fake tag는 `page_view`, `first_visit`, `session_start`, `user_engagement` fixture hit를 만들고 모든 hit의 sanitized defaults를 검사한다. 이 파일은 기존 `pnpm test:e2e`의 `tests/e2e` 자동 discovery 대상이며, `scripts/ai-verify`/CI의 full E2E lane이 실제 실행하는지 검증한다. 누락되면 새 독립 CI lane을 만들지 않고 기존 full E2E command에 포함한다.
10. 독립 verifier가 fake/local evidence를 `docs/temp/qa/issue-144.md`에 확정하고 `qa-check`를 통과시킨다. 이후 `scripts/task-harness pr 144`가 exact clean HEAD full verify와 PR push를 소유하고, 같은 PR head의 named `verify` CI 통과를 확인한다. 아직 merge하지 않는다.
11. 현재 production safe main SHA/deploy ID와 Render Auto-Deploy `On Commit` 상태를 읽어 기록한다. GYEOP property/stream 설정과 actual Render ID를 준비한 뒤 단일 Free service의 `Manual Deploy → Deploy a specific commit`으로 exact PR head SHA Docker image를 build/deploy한다. Render PR Preview service는 만들지 않는다. specific-commit UI가 없거나 선택이 Auto-Deploy를 되돌릴 수 없게 끄면 운영 검증을 시작하지 않고 PR을 blocked 상태로 둔다.
12. specific-commit deploy의 displayed commit이 PR head와 같고 healthy인지 확인한 뒤 Auto-Deploy 상태를 다시 읽는다. 꺼졌다면 운영 검증 완료 후 merge 전에 `On Commit`으로 복구하고 readback한다. PR-head network/Realtime PASS와 Auto-Deploy readback이 모두 있을 때만 `scripts/task-harness merge <pr>`를 실행한다. merge가 같은 SHA의 main auto-deploy를 만든 것을 확인한 뒤 smoke, `close`, `cleanup` 순서로 끝낸다.

## 완료 기준

- [ ] valid ID가 없는 build는 consent UI, `googletagmanager.com` script, `dataLayer`, `_ga*` cookie, GA collect request와 Google CSP source가 모두 0이다.
- [ ] valid ID라도 pending/denied browser는 server HTML과 hydrated DOM/network에 Google script가 없고 `_ga*` cookie/collect request가 0이다. 제품 owner/visitor 흐름은 정상 동작한다.
- [ ] grant 직후 현재 pathname의 sanitized page view가 정확히 1회 발생하고, App Router pathname 이동마다 1회만 추가된다. React Strict Mode/remount, script load callback, config command가 duplicate page view를 만들지 않는다.
- [ ] query/hash/fragment만 변경하면 page view가 추가되지 않는다. 서로 다른 `/i/<publicId>` 또는 `/play/<playId>` pathname으로 이동하면 같은 route class payload로 각각 1회 발생한다.
- [ ] `page_view`, `first_visit`, `session_start`, `user_engagement`을 포함해 consent 뒤 관찰된 모든 collect request와 `dataLayer` command에 query, hash, fragment, raw dynamic segment, publicId, playId, link/response/Auth UID, nickname, email, 답변, 관계, 알게 된 시점, secret sentinel이 없다. 모든 hit의 `dl`/`page_location`은 first-party origin + 표의 route class이고 title/referrer도 allowlist와 일치한다.
- [ ] `gtag('consent', 'default', ...)`가 config보다 먼저 실행되고 analytics storage만 granted이며 ad storage/user data/personalization은 denied다. config에는 consent field 없이 `send_page_view:false`, Google signals/광고 개인화 OFF, sanitized defaults와 60일 non-renewing cookie 설정이 있고 Enhanced measurement OFF와 함께 자동 page view가 0이다.
- [ ] deny 선택은 reload 뒤 유지되고 Google network가 0이다. grant 철회는 `_ga*` cookie를 제거하고 reload 뒤 script/collect를 중단하며 owner/visitor/Auth cookie는 삭제하지 않는다.
- [ ] consent UI와 `/privacy` control은 360×800 mobile에서 겹침 없이 동작하고 keyboard/focus/screen-reader 이름과 44px action target을 갖는다. 허용과 거절의 시각 hierarchy가 동등하다.
- [ ] CSP는 valid ID에서 exact `www.googletagmanager.com`, `www.google-analytics.com`, `region1.google-analytics.com`만 용도별 directive에 포함하고 wildcard/Ads/DoubleClick/GTM container endpoint가 없다. invalid/missing에서는 Google host가 없다.
- [ ] `supabase/migrations`, DB function/trigger, `docs/engineering/core-funnel-events.md`의 internal event registry diff가 0이고 GA4용 product event가 추가되지 않는다. 기존 DB tests, owner/visitor core funnel unit tests와 `@pr-core` live funnel E2E가 그대로 통과한다.
- [ ] GA4 property/web stream이 GYEOP 전용이며 Enhanced measurement, Google signals, user-provided data, ads personalization과 product link가 OFF이고 retention 2개월/reset OFF임을 QA artifact로 확인한다.
- [ ] named `verify`가 통과한 exact PR head SHA의 Render specific-commit image에 actual measurement ID가 설정되고 fresh browser grant 뒤 `gtag.js` 200 및 sanitized `g/collect`가 관찰된다. 모든 collect hit가 privacy allowlist를 통과해야 한다. 성공한 collect 시각부터 Realtime을 60초 간격으로 최대 10분 확인하고 결과를 production artifact에 route class·PR head SHA·deploy ID·artifact path와 함께 기록한다.
- [ ] Render specific-commit 검증 전후 Auto-Deploy가 `On Commit`임을 readback한다. network/Realtime 또는 Auto-Deploy 복구가 실패하면 ID를 제거하고 기록한 safe main SHA를 specific-commit으로 재배포해 Google request/CSP 0건과 healthy를 확인하며 merge하지 않는다. PASS일 때만 merge하고 같은 SHA의 main auto-deploy를 확인한다.
- [ ] `package.json`의 `pnpm test`가 새 unit test를 실행하고 기존 full E2E discovery가 새 spec을 실행한다. focused tests, exact clean HEAD 전체 verify, 동일 HEAD `CI/verify`가 통과한다.

## 테스트 계획

- [ ] `node --test tests/unit/google-analytics.test.mjs tests/unit/http-boundary-policy.test.mjs tests/unit/zero-cost-mvp.test.mjs`
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-TEST123 pnpm exec playwright test tests/e2e/google-analytics.spec.ts tests/e2e/security-headers.spec.ts --project=mobile-chromium --workers=1`
- [ ] ID missing/invalid/valid 3개 build configuration에서 `pnpm test:zero-cost-mvp`와 CSP source snapshot을 검증한다.
- [ ] `pnpm test` 출력에 `tests/unit/google-analytics.test.mjs`가 포함되고 `pnpm test:e2e -- --list` 또는 full verify log에 `tests/e2e/google-analytics.spec.ts`가 포함되는지 확인한다.
- [ ] E2E는 Google tag request를 intercept하여 실제 Google property에 fixture data를 보내지 않고 script request timing, global/config sanitized defaults와 자동 event를 포함한 모든 fixture collect payload를 판정한다.
- [ ] 운영 fresh Chrome context에서 pending no-request → deny no-request → storage 초기화 → grant → 최초 1회 → 정적·동적 pathname 이동 → query/hash 변경 → automatic `user_engagement` 대기 → revoke 순서를 network recording으로 남긴다. 모든 request URL/body와 `window.dataLayer`를 forbidden sentinel로 검색한다.
- [ ] pre-PR fake/local 결과는 immutable `docs/temp/qa/issue-144.md`에, named verify 뒤 exact PR-head specific-commit의 GA4 Admin·all-hit network·Realtime 결과는 merge 전에 `docs/temp/qa/issue-144-production.md`에 분리해 기록한다.
- [ ] PR-head collect 성공 뒤 Realtime을 60초 간격으로 최대 10분 확인한다. 10분 안에 `page_view`가 없으면 운영 FAIL로 기록하고 merge하지 않는다. code/CSP 수정이면 새 commit·새 task-harness PR verification HEAD·새 named verify가 필요하다. GA Admin/Render 값만 바로잡는 경우에도 먼저 ID-empty safe main을 복구하고 변경 근거를 기록한 뒤 같은 PR head specific-commit을 다시 배포해 전체 network/Realtime gate를 처음부터 통과해야 한다.
- [ ] `./scripts/run-ai-verify --mode full`은 구현·독립 QA 수정이 끝난 exact clean HEAD에서 `scripts/task-harness pr`이 한 번 소유한다.

## 분석과 관측성

- `public.analytics_events`와 `private.core_funnel_stage_counts`가 제품 퍼널과 전환율의 유일한 SSOT다. 기존 DB event를 줄이거나 GA4와 대조하여 보정하지 않는다.
- GA4는 coarse route-class traffic와 tag health만 보여준다. custom event, conversion/key event, audience, exploration을 제품 의사결정 근거로 추가하지 않는다.
- 정상 운영 증거는 browser network의 consent gate/sanitized payload와 GA4 Realtime `page_view`다. application log에 measurement ID, consent state, raw pathname, GA client ID 또는 collect payload를 남기지 않는다.
- 운영 수집이 예상과 다르면 `docs/temp/qa/issue-144-production.md`에 증상 시각, PR-head/deploy SHA, Realtime 0 여부, CSP/network 결과만 기록한다. 사용자별 값을 기록하지 않는다.

## 개인정보와 악용 방지

- pending은 deny와 동일하게 처리한다. 동의 전에는 Google code 자체를 실행하지 않아 consent-mode ping이나 cookieless ping도 보내지 않는다.
- GA4에는 내부 ID, PII, pseudonymous owner/visitor capability, question/answer context를 전송하지 않는다. route template의 `:publicId`/`:playId`는 literal text이며 실제 값이 아니다.
- GYEOP code는 `document.location`, `location.href`, `document.title`, `document.referrer`, `useSearchParams`, fragment, server request URL을 payload source로 사용하지 않는다. GA가 기본적으로 이 DOM 값을 읽지 못하도록 script load 직후 config 전과 각 pathname 이동 때 core helper의 sanitized `page_location`/`page_title`/빈 `page_referrer`를 global/config default로 먼저 설정한다.
- GA-generated client/session 식별자와 device/browser/대략적 지역 정보는 명시 동의 뒤에만 provider가 처리하며 GYEOP account와 결합하지 않는다. privacy page에 provider, 목적, 보관기간과 철회 방법을 공개한다.
- browser GA cookie는 60일 non-renewing 상한과 철회 시 즉시 삭제를 적용한다. provider의 2개월 user/event retention 및 standard aggregated report 예외는 별도 Google lifecycle이며 cookie 삭제만으로 provider data가 삭제된다고 설명하지 않는다.
- consent localStorage 값은 민감정보가 아니지만 server·log·GA로 보내지 않는다. storage 장애는 추적 허용으로 승격하지 않는다.
- GA Admin에서 signals, user-provided data, ads personalization, product link 설정을 다시 켜지 않는 것을 운영 invariant로 기록한다.
- CSP allowlist는 source 허용일 뿐 consent가 아니며, client gate와 E2E no-request 증거가 실제 전송 통제다.

## 롤아웃과 복구

1. actual Render ID를 비운 상태에서 focused unit/E2E와 독립 verifier QA를 수행하고 `docs/temp/qa/issue-144.md`를 확정한다. `qa-check` 뒤에는 이 pre-merge artifact를 바꾸지 않는다.
2. `task-harness pr 144`로 exact clean HEAD full verify와 PR push를 완료하고, PR에 기록된 verification HEAD와 remote head가 같으며 named `verify` CI가 성공했는지 확인한다. 아직 merge하지 않고 외부 Google에는 test event를 보내지 않는다.
3. Render Dashboard에서 현재 healthy production deploy의 safe main SHA/deploy ID와 Auto-Deploy `On Commit`을 캡처한다. PR Preview가 없는 Free service이므로 별도 service를 만들지 않는다. GYEOP property/stream을 privacy 설정대로 만든 뒤 actual ID를 Render environment에 저장한다. env 저장이 자동 배포를 일으키면 safe main build가 healthy일 때까지 기다린다.
4. 같은 단일 service의 `Manual Deploy → Deploy a specific commit`에서 exact PR head SHA를 선택해 PR-head Docker image를 build/deploy한다. displayed commit과 healthy 상태가 exact PR head와 다르거나 specific-commit 기능이 없으면 즉시 ID를 제거하고 safe main을 배포한 뒤 blocked로 남긴다.
5. PR-head image에서 pending·deny no-request, grant 뒤 모든 collect hit의 sanitized defaults를 확인하고 성공 collect 시각부터 Realtime을 60초 간격으로 최대 10분 확인한다. 결과와 Render deploy ID를 `docs/temp/qa/issue-144-production.md`에 기록한다.
6. network/privacy/Realtime 중 하나라도 실패하면 merge하지 않는다. Render에서 actual ID를 제거하고 기록한 safe main SHA를 `Deploy a specific commit`으로 재배포해 healthy, Google request/CSP 0건을 확인한다. Auto-Deploy가 꺼졌다면 `On Commit`으로 복구하고 readback한다. code/CSP 원인은 새 PR head와 task-harness/CI gate를 다시 거치고, GA Admin/Render-only 원인도 safe 복구 뒤 전체 PR-head gate를 다시 통과해야 한다.
7. PR-head 운영 검증이 PASS여도 Auto-Deploy 상태를 다시 확인한다. specific-commit 배포로 꺼졌다면 merge 전에 `On Commit`으로 복구하고 readback한다. 이 복구가 safe main 재배포를 일으켜도 허용하되, Auto-Deploy readback 실패 상태에서는 merge하지 않는다.
8. exact PR-head evidence와 Auto-Deploy `On Commit` readback이 모두 PASS일 때만 `task-harness merge <pr>`를 실행한다. merge가 같은 SHA의 main auto-deploy를 만들고 healthy인지 확인한 뒤 간단한 consent/network smoke, `task-harness close 144 <pr>`, `cleanup 144 <pr>` 순서로 완료한다.
9. measurement ID가 누락/invalid되거나 Google 장애가 있으면 analytics만 disabled 상태로 두고 제품 흐름을 계속 제공한다. GA 수집 실패는 내부 퍼널 DB event를 재전송하거나 duplicate하지 않는다.
10. 개인정보 payload 또는 동의 전 request 회귀가 발견되면 Render service를 먼저 suspend하여 전송을 즉시 차단한다. Render에서 measurement ID를 삭제하고 기록한 safe main을 재배포한 뒤 pending/grant 양쪽 network가 안전함을 확인하고 service를 resume한다. ID 삭제는 build-time change이므로 새 deploy 완료 전 old artifact가 자동으로 안전해진다고 간주하지 않는다.
11. Google 측 데이터 삭제가 필요하면 해당 property의 data deletion request/property deletion 절차를 별도 운영 증거와 함께 수행한다. code rollback이나 consent 철회만으로 이미 수집된 provider data가 즉시 삭제된다고 주장하지 않는다.

## 스펙 검토

Reviewer Agent: /root/issue144_critic
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] blocker 없음. GYEOP 전용 GA4 property와 Render web stream 생성, actual measurement ID 입력, Admin setting 캡처와 Realtime 확인은 Google Analytics/Render 권한이 있는 root 운영 context가 수행해야 하며 코드 구현만으로 완료 처리할 수 없다.
- [ ] GA4의 2개월 data retention은 user/event-level 설정이며 standard aggregated report에는 적용되지 않는다. 정책·privacy 문서에 이 provider 제약을 숨기지 않고, 삭제가 필요할 때 provider data deletion/property deletion을 별도 수행한다.
- [ ] localStorage 기반 consent 때문에 static CSP header는 개별 브라우저 동의를 알 수 없다. 유효한 운영 ID일 때 exact Google source를 허용하되, 동의 전 script/collect 0건을 client gate와 browser evidence로 보장한다. consent를 server cookie/table로 복제하여 CSP를 요청별 분기하는 확장은 이번 범위에서 제외한다.
