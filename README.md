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

## 검증

```bash
pnpm exec playwright install chromium
./scripts/run-ai-verify --mode full
```

full verify는 Docker를 확인하고 Supabase start·reset·lint·pgTAP, server-only 접근 정적 검사, anon key 우회·경쟁 rate-limit integration, format, lint, typecheck, unit test, production build, mobile Chromium E2E를 실행한다. 검증 전에 local stack이 없었을 때만 종료 시 stack을 정리한다.
