# GYEOP · 겹

질문팩에 먼저 답하고 링크를 공유하면, 친구와 온라인 팔로워가 일부 질문에 답해 관계별 시선이 계속 쌓이는 모바일 소셜 프로필.

## 현재 핵심 루프

`팩 선택 → 주인 10장 응답 → 공개·1:1 링크 → 방문자 관계 선택 → 3장 응답 → 주인의 실제 답과 비교 → 나도 같은 팩 시작 → 새 링크 공유`

## 프로젝트 상태

- 단계: 모바일 웹 MVP 기반 구현
- 코드: Next.js 앱 셸, Supabase local stack, 로컬·GitHub Actions 공통 검증 구성
- 기본 방향: 모바일 웹 우선, 방문자는 설치·로그인 없이 참여
- 브랜치: `main`

## 문서

- [제품 문서 인덱스](docs/product/README.md)
- [핵심 기능 우선순위](docs/product/core-feature-priority.md)
- [질문팩 제품 명세](docs/product/question-pack-spec.md)
- [전체 제품 기획](docs/product/full-product-plan.md)
- [의사결정 기록](docs/product/decision-log.md)
- [P0 개발 기준](docs/engineering/p0-development-plan.md)
- [GitHub 작업 워크플로우](docs/engineering/github-task-workflow.md)
- [초기 기획 아카이브](docs/archive/)
- [모바일 목업](docs/assets/mockups/)

## 프로젝트 스킬

- `$gyeop-product`: 제품 결정·기획 SSOT·바이럴 흐름 검토
- `$gyeop-question-pack-design`: A/B 질문팩 생성과 검수
- `$gyeop-issue-writer`: GitHub Issue·Project 일감 작성과 등록
- `$gyeop-task`: 구현 스펙부터 PR·병합·정리까지 작업 하네스 실행

프로젝트 스킬을 전역 Codex 스킬 경로에 설치하거나 갱신하려면:

```bash
./scripts/install-codex-skills
```

## GitHub 작업 하네스

```bash
scripts/task-harness doctor
scripts/task-harness label-sync
scripts/task-harness project-add <issue-number>
scripts/task-harness project-sync <issue-number>
scripts/task-harness queue
```

저장소는 `origin`에서 자동 감지하며 `.env.example`의 기본 연결 대상은 `aroido/gyeop`과 organization Project #5다. `status:*` 이슈 라벨이 작업 상태의 기준이고 Project는 설정된 경우에만 동기화되는 한국어 가시화 화면이다. `doctor`는 Project update 권한과 field schema를 점검하고, `project-add`만 누락 item을 추가한다. 열린 기존 item은 `project-sync`로 현재 label을 다시 반영한다. 닫힌 이슈의 누락 item은 `project-add`로 membership만 복구한 뒤 검증된 `close <issue-number> <pr-number>`를 재실행한다.

## 로컬 개발

Node.js `24.16.0`, pnpm `11.13.0`, 실행 중인 Docker가 필요하다.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm exec supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --override-name auth.secret_key=SUPABASE_SECRET_KEY > .env.local
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { appendFileSync } from "node:fs"; const key=randomBytes(32).toString("base64url"); appendFileSync(".env.local", `ACCOUNT_DELETE_REAUTH_KEYRING=${JSON.stringify({local:key})}\nACCOUNT_DELETE_REAUTH_ACTIVE_VERSION=local\n`)'
pnpm dev
```

`.env.local`은 local 전용 값도 포함하므로 출력·커밋·artifact 업로드를 하지 않는다. 작업을 마치면 `pnpm supabase:stop`으로 local stack을 내린다.

## 비공개 MVP 무료 배포

`render.yaml`은 도메인 없이 `https://<service>.onrender.com`에서 동작하는 Render Free Web Service용 설정이다. 앱과 HAProxy를 한 컨테이너에 두어 public Route가 기존 proxy 신뢰 경계를 계속 통과한다. Render가 전달하는 Cloudflare client IP를 우선 사용하고, 없을 때는 Render 연결 IP로 안전하게 축소한다.

현재 `$0` private MVP는 이미 연결된 Render Free service와 Supabase Free project만 재사용한다. 아래 1~3은 최초 bootstrap 참고이며 새 service/project 생성, plan 변경, secret 수정이나 재배포 권한을 뜻하지 않는다. 현재 운영 경계는 `docs/engineering/private-mvp-zero-cost-runbook.md`를 따른다.

1. Supabase에서 Free project를 만들고 아래 명령으로 migration과 공식 pack seed를 올린다.

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push --include-seed
   ```

2. Render Dashboard에서 GitHub repository를 연결해 Blueprint `render.yaml`을 적용한다. Free plan을 유지하고, 생성된 `https://<service>.onrender.com` 주소만 비공개 테스트 참가자에게 전달한다.

3. Render Environment에 `.env.example`의 다음 값을 설정한다. `NEXT_PUBLIC_SUPABASE_*`와 선택형 `NEXT_PUBLIC_GA_MEASUREMENT_ID`는 build 시에도 필요하며 나머지는 runtime secret이다. `APP_URL`은 비워두면 Render가 제공한 URL을 사용하고, 나중에 커스텀 도메인을 붙일 때만 HTTPS origin으로 명시한다.

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_GA_MEASUREMENT_ID
   SUPABASE_SECRET_KEY
   ORIGIN_PROXY_SECRET
   RATE_LIMIT_SECRET
   ACCOUNT_DELETE_REAUTH_KEYRING
   ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION
   ```

   GA4는 GYEOP 전용 web stream의 `G-...` measurement ID를 설정한 build에서만
   활성화된다. 실제 ID는 저장소에 기록하지 않는다. ID가 없거나 exact
   `G-[A-Z0-9]+` 형식이 아니면 동의 UI·Google script·수집 요청·Google CSP
   source가 모두 비활성화된다. 운영에서는 Enhanced measurement, Google
   signals, user-provided data, 광고 개인화와 제품 연결을 끄고 user/event 보관을
   2개월·새 활동 시 만료 재설정 OFF로 고정한다. 사용자가 화면 하단에서 분석을
   허용한 뒤에만 coarse route-class `page_view`를 보내며 `/privacy`에서 언제든
   중단할 수 있다.

   `ORIGIN_PROXY_SECRET`와 `RATE_LIMIT_SECRET`은 각각 `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'`로 만들고, account-delete 값은 로컬 개발 안내의 keyring 형식을 사용한다. `.env.local` 전체를 업로드하거나 commit하지 않는다.

4. 첫 배포 뒤 Supabase Auth URL Configuration의 Site URL과 Redirect URL에 `https://<service>.onrender.com` 및 `https://<service>.onrender.com/auth/callback`을 넣고, 홈·팩 시작·방문자 제출과 공유 직전 Google OAuth 계정 선택/동의 → `/auth/callback` → `/me` 복귀를 실제 URL에서 확인한다. Google provider나 callback이 준비되지 않았으면 이메일 claim으로 우회하지 말고 공유를 중단한다. Render Free service는 15분 유휴 뒤 잠들 수 있고, Supabase Free project는 7일 저활동 뒤 일시 정지될 수 있으므로 지금 단계의 소규모 재미 검증에만 쓴다.

배포 artifact 자체는 아래로 Docker build, HAProxy header injection, 홈과 cookie 없는 logout API까지 점검한다.

```bash
pnpm test:render-deploy
```

## 검증

```bash
pnpm exec playwright install chromium
./scripts/run-ai-verify --mode full
```

full verify는 Docker를 확인하고 Supabase start·reset·lint·pgTAP, server-only 접근 정적 검사, anon key 우회·경쟁 rate-limit integration, format, lint, typecheck, unit test, production build, mobile Chromium E2E를 실행한다. 검증 전에 local stack이 없었을 때만 종료 시 stack을 정리한다.
