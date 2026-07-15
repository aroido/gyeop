# Issue 12 구현 스펙: [개발] Next.js·Supabase 로컬 기반과 GitHub Actions 구축

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/12

## 목표

새 checkout에서도 동일한 Node.js·pnpm·Next.js·Supabase 환경으로 모바일 앱 셸을 실행하고, 로컬과 GitHub Actions에서 같은 전체 검증을 통과하는 P0 개발 기반을 만든다.

## 범위

- Node.js `24.16.0`, pnpm `11.13.0`, Next.js 16 App Router, React, TypeScript strict와 Supabase CLI의 정확한 patch 버전 및 `pnpm-lock.yaml`을 고정한다.
- `app/(public)/`에 CSS Modules와 CSS custom properties만 사용하는 최소 모바일 앱 셸을 만들고 `/`에서 `오래된 친구팩` 시작 카드를 렌더링한다.
- Supabase CLI 설정, 빈 schema에서도 재현 가능한 local reset, 최소 pgTAP smoke test를 `supabase/`에 둔다.
- `.env.example`에 local 앱 실행에 필요한 변수 이름과 설명을 추가하고 실제 secret 값은 두지 않는다.
- `ACCOUNT_DELETE_REAUTH_KEYRING`과 `ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION`의 누락, 잘못된 JSON/key, 존재하지 않는 active version을 앱 시작 전에 거부하는 서버용 검증 스크립트와 `node:test`를 만든다.
- format, lint, typecheck, `node:test`, repository secret scan, Supabase reset·pgTAP, build, Playwright mobile Chromium smoke 명령을 `package.json`과 `scripts/ai-verify`에 연결한다.
- pull request와 `main` push에서 `./scripts/run-ai-verify --mode full`을 실행하는 단일 GitHub Actions workflow를 만든다.
- README에 fresh checkout 설치, local Supabase, 임시 local key 생성, 앱 실행, 전체 검증 순서를 기록한다.

## 제외 범위

- 제품 데이터 table, migration, RLS, Auth 연동, Route Handler와 실제 카드 응답 흐름
- 오래된 친구팩 10장 seed, 최종 디자인 시스템·목업 구현, 퍼널 event
- staging·production 개인 서버 배포, systemd, reverse proxy, SMTP와 운영 secret
- GitHub Project 상태 동기화와 task harness 안전성 보강

## SSOT

- `docs/product/core-feature-priority.md`
- `docs/product/question-pack-spec.md`
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md`
- `docs/engineering/github-task-workflow.md`
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 주인은 `/`에서 P0 첫 공식 팩인 `오래된 친구팩`, 질문 10장과 `팩 열어보기` CTA를 볼 수 있다.
- CTA 이후의 주인 응답, 방문자 응답, 비교, 새 주인 전환은 아직 연결하지 않는다.
- 방문자와 전환된 새 주인의 기존 제품 흐름 결정에는 변화가 없다.

## 디자인 영향

- `app/(public)/page.tsx`와 `app/(public)/page.module.css`에 360px 안팎 모바일 viewport를 우선하는 한 화면 앱 셸을 만든다.
- 앱 이름, 짧은 설명, SSOT가 확정한 `질문 10장` 정보와 `팩 열어보기` CTA만 포함한다. 관계 문구와 예상 시간은 후속 이슈 전까지 단정하지 않는다.
- 색·간격은 `app/globals.css`의 CSS custom properties로만 정의하며, 최종 디자인 명세나 공용 component 추상화로 취급하지 않는다.
- CTA는 `#start-status`로 이동하는 링크로 구현하고 대상에는 `답변 흐름을 준비 중이에요`라고 안내한다. 320px에서 가로 스크롤이 없고, CTA는 키보드 focus가 보이며 최소 44px 높이를 가진다.

## API와 데이터 영향

- HTTP API, application schema, migration, Auth 저장소 변경은 없다.
- `supabase/config.toml`, `supabase/seed.sql`, `supabase/tests/foundation.test.sql`만 추가해 local stack과 pgTAP 실행 경계를 고정한다.
- `.env.example`에는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`의 이름·설명과 두 account-delete 변수의 빈 placeholder만 둔다.
- keyring 검증은 JSON object의 각 version이 32-byte 이상 base64url key인지 확인하고 active version이 실제 key로 존재할 때만 성공한다. 검증 실패 메시지는 변수명과 원인만 출력하고 입력값은 출력하지 않는다.

## 구현 계획

1. `package.json`, `pnpm-lock.yaml`, `.node-version`, `tsconfig.json`, Next.js·ESLint·Prettier 설정으로 Node.js·pnpm·Supabase CLI를 포함한 정확한 patch 버전과 공통 명령을 고정한다.
2. `app/layout.tsx`, `app/globals.css`, `app/(public)/page.tsx`, `app/(public)/page.module.css`에 서버 컴포넌트 기반 모바일 앱 셸을 만든다.
3. `scripts/validate-env.mjs`와 `tests/unit/validate-env.test.mjs`를 추가하고 `dev`·`start` 전에 fail-closed 검증을 실행한다.
4. `supabase/config.toml`, `supabase/seed.sql`, `supabase/tests/foundation.test.sql`과 `supabase:start`, `supabase:reset`, `test:db` 명령을 연결한다.
5. `playwright.config.ts`와 `tests/e2e/home.spec.ts`에 mobile Chromium smoke를 추가한다. 계정 삭제 key는 config가 런타임에 만든 test fixture로만 web server 환경에 주입한다.
6. `tests/unit/repository-secrets.test.mjs`가 `.env.example`의 keyring placeholder가 비어 있고 workflow에 key 값이 없는지 검증하게 한다.
7. `scripts/ai-verify`가 Docker 존재를 먼저 확인하고 기존 문서·skill·task harness 검증 뒤 package 검증, `pnpm exec supabase` start/reset/pgTAP, build, E2E를 순서대로 실행하도록 확장한다. 검증 시작 전에 stack이 없었던 경우에만 종료 trap에서 `supabase stop --no-backup`으로 정리하고, 기존 local stack은 유지한다.
8. `.github/workflows/ci.yml`에서 Node.js `24.16.0`과 pnpm `11.13.0`을 설치하고 Chromium을 준비한 뒤 Docker가 있는 runner에서 full verify 한 번을 실행한다. Supabase lifecycle은 full verify에만 맡긴다.
9. `.env.example`, `.gitignore`, `README.md`를 fresh checkout 절차, Docker 선행조건, local stack 정리와 secret 비커밋 기준에 맞춘다.

## 완료 기준

- [ ] `node --version`은 `v24.16.0`이고 `corepack pnpm --version`은 `11.13.0`이며 package와 Supabase CLI dependency는 exact version으로 잠긴다.
- [ ] `pnpm install --frozen-lockfile`이 새 checkout에서 성공한다.
- [ ] 문서화된 순서로 local Supabase를 시작·reset하고 `pnpm test:db`를 통과한다.
- [ ] 유효한 local 환경에서 `pnpm dev`와 `pnpm start`가 실행되고 `/`가 HTTP 200을 반환한다.
- [ ] 360x800 mobile Chromium에서 `/`에 `겹`, `오래된 친구팩`, `질문 10장`, `팩 열어보기`가 보이고 클릭하면 `#start-status`와 준비 안내를 확인한다.
- [ ] 320px viewport에서 document 가로 overflow가 없고 CTA bounding box 높이는 44px 이상이며 키보드 Tab focus의 outline이 `none`이 아니다.
- [ ] account-delete 두 환경 변수 누락, malformed JSON/base64url, unknown active version은 시작 검증과 단위 테스트에서 실패한다.
- [ ] `pnpm test:secrets`가 `.env.example`의 keyring·active-version placeholder가 비어 있고 Actions workflow에 key 값이 없음을 확인한다.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm supabase:reset`, `pnpm test:db`, `pnpm build`, `pnpm test:e2e --project=mobile-chromium`이 각각 성공한다.
- [ ] `./scripts/run-ai-verify --mode full`이 Docker 누락을 명시적으로 실패시키고, Docker가 있으면 Supabase를 시작해 전체 검증을 성공한 뒤 자신이 시작한 stack만 정리한다.
- [ ] `.github/workflows/ci.yml`은 `pull_request`와 `main` push에서 실행되며 PR에 1개 이상의 성공한 CI check를 남긴다.
- [ ] 성공한 PR run의 전체 log를 `gh run view <run-id> --log`로 받아 test process와 동일하게 재생성한 account-delete fixture 원문을 `rg -F`로 검색했을 때 0건이다.

## 테스트 계획

- `node --test tests/unit/*.test.mjs`로 환경 변수 정상·실패 경계와 secret 비출력을 검증한다.
- `pnpm test:secrets`로 account-delete placeholder와 Actions의 비밀값 비커밋 조건을 검증한다.
- `pnpm supabase:start && pnpm supabase:reset && pnpm test:db`로 local stack 재현과 pgTAP smoke를 검증한다.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`로 정적·단위·production build를 검증한다.
- `pnpm test:e2e --project=mobile-chromium`으로 홈 앱 셸의 핵심 문구, CTA 클릭 결과, 320px 가로 overflow, 44px hit target과 keyboard focus를 검증한다.
- `./scripts/run-ai-verify --mode full`로 기존 프로젝트 검증과 위 검증의 단일 진입점을 확인한다.
- PR 생성 뒤 GitHub Actions check가 실제로 생성되고 성공하는지 `gh pr checks`로 확인한다.
- PR check 성공 뒤 `fixture="$(node -e "process.stdout.write(Buffer.alloc(32, 7).toString('base64url'))")"; ! gh run view <run-id> --log | rg -F "$fixture"`로 runtime fixture 원문이 Actions log에 없음을 확인한다. 명령과 판정만 QA에 기록하고 fixture 값은 기록하지 않는다.

## 분석과 관측성

- 제품 퍼널 event와 대시보드는 추가하지 않는다.
- CI 로그에는 실행한 검증 단계와 성공·실패만 남기고 환경 변수 값은 출력하지 않는다.

## 개인정보와 악용 방지

- 사용자 데이터나 익명 응답을 만들지 않는다.
- 실제 secret은 commit, `.env.example`, test source, GitHub Actions YAML과 로그에 넣지 않는다.
- 단위·E2E key는 test process 안에서 deterministic byte fixture로 생성하며 production 자격으로 사용할 수 없음을 주석으로 명시한다.
- startup validator는 secret 원문을 오류와 로그에 포함하지 않는다.

## 롤아웃과 복구

- migration과 production 배포가 없으므로 단계적 rollout이나 data rollback은 없다.
- 문제 발생 시 이 기반 PR을 되돌리면 기존 문서·task harness 저장소 상태로 복구된다.
- GitHub Actions는 repository 코드만 검증하며 staging·production secret을 사용하지 않는다.

## 스펙 검토

Reviewer Agent: issue12_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- GitHub-hosted runner에서 local Supabase와 Chromium 설치 시간이 길 수 있으나, P0 기반 검증의 실제 DB·브라우저 경계이므로 이번 이슈에서는 생략하지 않는다.
- 최종 홈 디자인과 CTA 연결 대상은 후속 디자인·owner flow 이슈에서 확정한다. 이번 CTA는 `#start-status`의 접근 가능한 준비 상태 안내까지만 제공한다.
- 구현 전 해결해야 할 외부 블로커는 없다.
