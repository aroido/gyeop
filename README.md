# GYEOP · 겹

질문팩에 먼저 답하고 링크를 공유하면, 친구와 온라인 팔로워가 일부 질문에 답해 관계별 시선이 계속 쌓이는 모바일 소셜 프로필.

## 현재 핵심 루프

`팩 선택 → 주인 10장 응답 → 공개·1:1 링크 → 방문자 관계 선택 → 3장 응답 → 주인의 실제 답과 비교 → 나도 같은 팩 시작 → 새 링크 공유`

## 프로젝트 상태

- 단계: 제품 기획 및 모바일 웹 MVP 준비
- 코드: Next.js·Supabase 기반을 선정했으며 아직 애플리케이션 구현 전
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

- `$gyeop-product-doc-writer`: 아이디어·메모를 활성 기획 SSOT로 작성
- `$gyeop-product-guardrails`: 기능·우선순위·SSOT 변경
- `$gyeop-question-pack-design`: A/B 질문팩 생성과 검수
- `$gyeop-viral-flow-review`: 모바일 공유·응답·재공유 흐름 검증
- `$gyeop-spec-writer`: GitHub 이슈 구현 스펙 작성과 검토 준비
- `$gyeop-issue-writer`: GitHub Issue·Project 일감 작성과 등록
- `$gyeop-task`: ready 이슈부터 PR·병합·정리까지 작업 하네스 실행

프로젝트 스킬을 전역 Codex 스킬 경로에 설치하거나 갱신하려면:

```bash
./scripts/install-codex-skills
```

## GitHub 작업 하네스

```bash
scripts/task-harness doctor
scripts/task-harness label-sync
scripts/task-harness queue
```

저장소는 `origin`에서 자동 감지하거나 `GYEOP_GITHUB_REPO=owner/repo`로 설정한다. GitHub Project 연결은 `GYEOP_GITHUB_PROJECT_NUMBER`와 `GYEOP_GITHUB_OWNER`를 설정한 뒤 `scripts/task-harness project-add <issue-number>`로 사용한다. 작업 상태의 기준은 Project 보드가 아니라 `status:*` 이슈 라벨이다.

## 검증

```bash
./scripts/run-ai-verify --mode full
```
