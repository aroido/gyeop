# Issue 128 구현 스펙: [Frontend] 재방문 주인의 내 질문팩 진입과 허브 복귀 동선 연결

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/128

## 목표

재방문한 주인이 홈·완료·공유 관리·프로필 화면에서 기존 `/me` 허브로 바로 이동해 저장한 질문팩을 이어보고 다시 공유할 수 있게 한다.

## 범위

- [ ] 홈 브랜드 헤더에 `내 질문팩` 링크를 추가하고 `/me`로 연결한다.
- [ ] 홈의 `{packs.length}개 골라보기 →`를 동적 개수는 유지한 비상호작용 문구 `{packs.length}개 골라보기`로 바꾼다.
- [ ] 10장 완료 화면에 기존 저장·공유 CTA를 유지한 채 `/me` 보조 링크를 추가한다.
- [ ] 공유 관리와 내 시선 프로필 화면에 `/me` 복귀 링크를 추가한다.
- [ ] 기존 CSS Module만 확장해 320px~430px에서 링크와 CTA가 겹치거나 넘치지 않게 한다.
- [ ] 네 화면의 링크 이름·목적지와 기존 주 CTA를 Playwright E2E로 검증한다.

## 제외 범위

- [ ] 전역 탭바, 고정 내비게이션, 별도 질문팩 카탈로그 라우트는 만들지 않는다.
- [ ] Google OAuth·로그아웃·계정 삭제·방문자 응답 중 이탈 동선은 변경하지 않는다.
- [ ] `/me`의 인증 분기와 데이터 로딩 계약은 변경하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- .codex/AGENTS.md

## 사용자 흐름 영향

- [ ] 재방문 주인은 홈에서 `/me`로 진입하고, 완료·공유·프로필 상세 화면에서 저장한 팩 목록으로 한 번에 복귀한다.
- [ ] 신규 주인의 팩 선택·10장 응답·저장 및 공유 주 CTA는 그대로 유지한다.
- [ ] 방문자 응답·비교·새 주인 전환 흐름에는 변화가 없다.

## 디자인 영향

- [ ] 기존 시각 체계와 링크 스타일을 재사용한다. 새 컴포넌트·토큰·내비게이션 패턴은 추가하지 않는다.
- [ ] 홈 헤더의 브랜드와 보조 링크는 좁은 폭에서도 줄바꿈 또는 겹침 없이 배치한다.
- [ ] 모든 새 링크는 최소 44px 높이 또는 동등한 터치 영역과 기존 `:focus-visible` 표현을 가진다.
- [ ] Lazyweb responsive-design 지침 중 모바일 우선, 44px 터치 영역, 수평 overflow 방지 원칙만 적용한다.

## API와 데이터 영향

- [ ] API, route handler, schema, migration, storage, 인증 판정 변경은 없다.
- [ ] 인증되지 않은 사용자의 `/me` 진입은 기존 서버 인증 분기와 Google 로그인 안내가 처리한다.

## 구현 계획

- [ ] `app/(public)/home-client.tsx`와 같은 경로의 CSS Module에서 헤더 링크와 중립적인 팩 개수 문구를 구현한다.
- [ ] `app/me/page.tsx`의 기존 비로그인 Google 로그인 분기를 변경하지 않고 홈 링크의 도착 동작으로 검증한다.
- [ ] `app/play/[playId]/owner-play.tsx`와 `page.module.css`의 완료 상태에 `/me` 보조 링크를 추가한다.
- [ ] `app/me/plays/[playId]/share-link-manager.tsx`·`share-links.module.css`에 `/me` 복귀 링크를 추가한다.
- [ ] `app/me/owner-profile-view.tsx`·`owner-profile.module.css`에 기존 `← 내 답변`과 공존하는 `/me` 복귀 링크를 추가한다.
- [ ] `tests/e2e/home.spec.ts`, `owner-play.spec.ts`, `share-links.spec.ts`, `owner-profile.spec.ts`에 최소 회귀 assertion을 추가한다.

## 완료 기준

- [ ] 홈에서 `내 질문팩`은 `/me`를 가리키고 각 팩의 `질문 시작하기` 개수는 활성 팩 개수와 같게 유지된다.
- [ ] 홈의 팩 개수 문구에는 화살표나 링크 역할이 없다.
- [ ] 완료 화면에서 `/me`로 이동할 수 있고 `내 질문팩 저장하고 공유하기` 동작은 그대로다.
- [ ] 공유 관리와 프로필 화면에서 각각 `/me`로 복귀할 수 있다.
- [ ] 비인증 `/me`는 기존 Google 로그인 안내를 표시한다.
- [ ] 320px, 390px, 430px에서 수평 overflow가 없고 새 링크가 키보드로 접근 가능하다.

## 테스트 계획

- [ ] `pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/owner-play.spec.ts tests/e2e/share-links.spec.ts tests/e2e/owner-profile.spec.ts`
- [ ] 홈의 `내 질문팩`을 비로그인 상태에서 활성화하면 `/me`의 `Google로 로그인` 안내가 보이는지 E2E로 검증한다.
- [ ] 네 이슈 구현 완료 뒤 320px·390px·430px 공통 모바일 흐름 QA를 한 번 수행한다.
- [ ] `scripts/task-harness pr`이 exact clean HEAD에서 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 분석과 관측성

- [ ] 새 이벤트·로그·대시보드 변경은 없다. 기존 프로필 조회·재공유 이벤트 발생 계약을 유지한다.

## 개인정보와 악용 방지

- [ ] 새 링크는 식별자·응답·공유 secret을 포함하지 않는 고정 `/me` 경로만 노출한다.
- [ ] 권한 확인을 클라이언트에서 복제하지 않고 기존 `/me` 인증 경계를 재사용한다.

## 롤아웃과 복구

- [ ] 데이터·API 변경이 없어 feature flag와 migration은 필요 없다.
- [ ] 회귀 시 이 PR의 링크·CSS·E2E 변경만 되돌리면 기존 흐름으로 복구된다.

## 스펙 검토

Reviewer Agent: critic issue128_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 미결정 사항과 외부 블로커가 없다. 문구·목적지는 이슈와 SSOT로 확정됐다.
