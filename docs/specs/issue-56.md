# Issue 56 구현 스펙: [Frontend] 질문팩 즉시 진입과 메인 비주얼 통일

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/56

## 목표

메인에서 팩을 연 직후 첫 A/B 질문을 지연 없이 보여주고, 네 팩의 플레이·완료 화면을 메인의 검정·네온 디자인 언어로 통일한다.

## 범위

- [x] 공통 `PackPlay`에서 1.2초 타이머와 `질문 카드를 여는 중이에요` 중간 화면을 제거한다.
- [x] 플레이 루트에 팩 slug를 스타일 훅으로 노출해 오래된 친구·첫인상·직장동료·솔직한 나팩이 메인 카드의 라임·블루·레드·블랙 계열을 이어받게 한다.
- [x] 질문, A/B 선택지, 진행률, 이전 질문, 완료 요약, 재시작을 검정 배경·흰색/네온 대비·굵은 타이포그래피로 통일한다.
- [x] 기존 자동 저장·복구·10장 완료 로직과 네 팩의 질문 데이터는 유지한다.
- [x] `core-feature-priority.md`, `question-pack-spec.md`, `decision-log.md`에서 인위적 개봉 대기 요구를 즉시 질문 진입 결정으로 갱신한다.
- [x] 320px·390px 모바일 회귀와 첫 질문 즉시 노출을 Playwright로 검증한다.

## 제외 범위

- [x] 질문·선택지 문구, 카드 순서, Signature 지정 변경
- [x] 공유 링크, 방문자 3장 응답, 비교 결과, 프로필 구현
- [x] 새 UI 라이브러리·폰트·이미지·애니메이션 의존성 추가
- [x] production에서 개발용 `/play/<slug>` 잠금을 해제하는 변경

## SSOT

- `docs/product/core-feature-priority.md` 5.3 팩 개봉과 셀프 응답
- `docs/product/question-pack-spec.md` 5. 주인 응답
- `docs/product/decision-log.md`
- `app/(public)/page.tsx` 5~40행의 팩별 스타일 매핑
- `app/(public)/page.module.css` 178-213행, 277-313행의 팩 카드·CTA 색상
- `app/play/packs.ts`의 네 개발용 팩 slug
- `app/play/[slug]/page.tsx`의 production 잠금
- `AGENTS.md`

기존 SSOT의 `1~2초 이내 개봉 연출`은 이번 사용자 피드백에서 실제 첫 질문 진입을 늦추는 것으로 확인됐다. 이 이슈에서 별도 대기 화면을 제거하고 첫 질문 즉시 노출을 새 결정으로 기록한다.

## 사용자 흐름 영향

- [x] 팩 주인: 메인 `팩 열어보기` 선택 후 중간 화면 없이 첫 질문과 선택지로 바로 이동한다.
- [x] 방문자·전환된 새 주인: 이번 개발용 주인 플레이 외 흐름은 변경하지 않는다.
- [x] 답변 중 이전 질문, 새로고침 복구, 완료, 재시작 흐름은 바뀌지 않는다.

## 디자인 영향

- [x] 대상: `/play/old-friend`, `/play/first-impression`, `/play/coworker`, `/play/honest-self`의 질문·완료 화면
- [x] 공통 배경은 메인과 동일한 `#050505`, 기본 글자는 흰색, 기본 선택 버튼은 흰색 표면·검정 글자, 선택 상태는 라임 `#dfff00` 표면·검정 글자를 사용한다.
- [x] 오래된 친구: 질문 카드 `#dfff00` 표면·`#050505` 글자, 진행률 `#dfff00`, CTA 검정·흰색, 포커스 `#315cff`.
- [x] 첫인상: 질문 카드 `#315cff` 표면·흰색 글자, 진행률 `#315cff`, CTA 검정·흰색, 포커스 `#dfff00`.
- [x] 직장동료: 질문 카드 `#ff4d42` 표면·`#050505` 글자, 진행률 `#ff4d42`, CTA 검정·흰색, 포커스 `#050505`에 흰색 offset 대비.
- [x] 솔직한 나: 질문 카드 `#0a0a0a` 표면·흰색 테두리·흰색 글자, 진행률·CTA `#dfff00`, CTA 글자 `#050505`, 포커스 `#315cff`.
- [x] 완료 영역은 공통 `#050505` 표면·흰색 글자이며 상단 테두리는 오래된 친구 `#dfff00`, 첫인상 `#315cff`, 직장동료 `#ff4d42`, 솔직한 나 `#fff`로 고정한다.
- [x] 이전 질문은 흰색 밑줄, 완료 요약 항목은 흰색 표면·검정 글자를 사용한다.
- [x] 선택 버튼은 최소 4rem 높이와 3px 포커스 아웃라인을 유지하고, 질문은 320px에서 줄바꿈되며 가로 넘침이 없어야 한다.
- [x] Lazyweb 진단: https://www.lazyweb.com/report/lazyweb/0c387416-15ba-4d32-9399-48f700fac33e/?source=create

## API와 데이터 영향

- [x] API, DB, schema, migration, auth 변경 없음
- [x] 팩별 기존 localStorage key와 draft version 1 형식 유지
- [x] production 라우트의 `notFound()` 조건 유지

## 구현 계획

- [x] `app/play/[slug]/play.tsx`: opening state·timer·중간 마크업을 삭제하고 첫 렌더부터 현재 질문을 노출한다. 포커스 이동 effect는 질문/완료 상태만 관찰한다.
- [x] `app/play/[slug]/play.tsx`: 최상위 요소에 `data-pack`을 추가해 별도 테마 매핑 코드 없이 CSS가 slug별 메인 색을 적용하게 한다.
- [x] `app/play/[slug]/page.module.css`: 기존 베이지·보라 스타일과 opening 전용 규칙을 제거하고 공통 검정·네온 레이아웃 및 팩별 CSS custom property만 둔다.
- [x] `tests/e2e/old-friend-play.spec.ts`: 1초 이상 대기를 요구하던 테스트를 `prefers-reduced-motion` 설정 없이 첫 질문 즉시 노출·중간 문구 부재 검증으로 교체한다.
- [x] `tests/e2e/old-friend-play.spec.ts`: 320x800·390x844 반복에서 가로 넘침, 선택 버튼 높이, 진행률 이름, Tab 포커스와 3px 아웃라인을 자동 검증한다.
- [x] `tests/e2e/pack-play.spec.ts`: 나머지 세 팩의 질문 카드 배경·글자색, 완료 영역 테두리, 재시작 CTA와 기존 저장·완료 회귀를 검증한다.
- [x] 제품 SSOT 세 문서에 즉시 진입 결정을 반영한다.

## 완료 기준

- [x] `/play/<valid-slug>` 로드 직후 별도 `setTimeout` 없이 첫 질문 heading과 두 선택지가 렌더링된다.
- [x] `질문 카드를 여는 중이에요` 문구와 opening 전용 DOM/CSS가 남지 않는다.
- [x] 네 팩 플레이 루트의 최상위 요소가 올바른 `data-pack`을 갖고 팩별 검정·네온 색상 토큰을 적용한다.
- [x] 네 팩의 질문 카드 `background-color`·`color`를 각각 `#dfff00/#050505`, `#315cff/#fff`, `#ff4d42/#050505`, `#0a0a0a/#fff`로 검증한다. 완료 영역 `border-top-color`는 각각 `#dfff00`, `#315cff`, `#ff4d42`, `#fff`, 재시작 CTA `background-color`는 앞의 디자인 매핑과 일치해야 한다.
- [x] 320px와 390px에서 가로 넘침이 없고 두 선택 버튼 높이가 44px 이상이다.
- [x] 실제 Tab 이동 후 선택 버튼이 포커스되고 3px `focus-visible` 아웃라인이 보이며, 진행률 접근성 이름, 답변 후 heading 포커스, 이전 질문, 자동 저장, 완료, 재시작이 유지된다.
- [x] `core-feature-priority.md`와 `question-pack-spec.md`의 개봉 연출 문구가 `중간 대기 없이 첫 질문 즉시 표시`로 교체되고, `decision-log.md`에 2026-07-17 결정·이유·결과가 기록된다.
- [x] production build 후 smoke에서 모든 `/play/<slug>`가 계속 404다.

## 테스트 계획

- [x] `pnpm exec playwright test tests/e2e/old-friend-play.spec.ts tests/e2e/pack-play.spec.ts tests/e2e/home.spec.ts`
- [x] 브라우저 320x800·390x844에서 첫 질문과 완료 화면 시각 확인
- [x] 아래 fail-fast smoke로 테스트용 필수 env를 주입하고 production 서버를 3101에 띄워 다섯 경로의 HTTP 404를 검증한 뒤 `trap`으로 종료한다.

```bash
set -e
pnpm build
KEY="$(node -e 'process.stdout.write(Buffer.alloc(32, 7).toString("base64url"))')"
ACCOUNT_DELETE_REAUTH_KEYRING="{\"v1\":\"$KEY\"}" \
  ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION=v1 \
  pnpm start --hostname 127.0.0.1 --port 3101 >/tmp/gyeop-issue-56-production.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for attempt in {1..50}; do
  curl -fsS http://127.0.0.1:3101/ >/dev/null && break
  sleep 0.2
done
for slug in old-friend first-impression coworker honest-self not-a-pack; do
  test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3101/play/$slug")" = 404
done
```

- [x] `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- [x] 신규 이벤트·로그 없음. 현재 로컬 프로토타입은 분석 SDK를 사용하지 않는다.
- [x] 첫 질문 즉시 노출은 E2E에서 중간 문구 부재와 질문 heading 가시성으로 회귀 검증한다.

## 개인정보와 악용 방지

- [x] 질문, 응답, localStorage 구조, 네트워크 요청 범위를 바꾸지 않아 신규 개인정보·악용 위험 없음
- [x] production 잠금과 팩별 저장소 격리를 유지한다.

## 롤아웃과 복구

- [x] feature flag 없이 공통 플레이 컴포넌트에 적용한다. 개발 전용 루트라 별도 단계적 배포가 필요 없다.
- [x] 회귀 시 이 PR의 `play.tsx`, `page.module.css`, E2E·SSOT 변경을 함께 되돌린다. 데이터 migration은 없다.

## 스펙 검토

Reviewer Agent: issue56_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] SSOT의 기존 개봉 연출 요구와 충돌은 사용자 피드백으로 해소했으며 이번 변경에서 문서를 함께 갱신한다.
- [x] 디자인 구현은 기존 메인 색과 CSS만 재사용하며 새 자산·의존성을 도입하지 않는다.
