# Issue 103 구현 스펙: 카드팩 개봉을 맞춤 Lottie 실링·추출 시퀀스로 교체

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/103

## 목표

기존 DOM 조각 기반 개봉 연출을 저장소 로컬 Lottie 타임라인으로 교체해, 스크롤에 따라 고정 폭 실링이 뜯기고 5:7 질문 카드가 포장지 앞뒤 사이에서 자연스럽게 추출되도록 한다.

## 범위

- [x] `/play/new`의 owner 카드팩 개봉 시각 연출을 맞춤 Lottie로 교체한다.
- [x] 스크롤 진행률과 키보드 `팩 열기` 버튼을 Lottie 프레임에 직접 동기화한다.
- [x] 저장소 로컬 Lottie JSON, 자산 로드 실패 폴백, 개봉 회귀 E2E를 추가한다.
- [x] E2E 관측용으로 개봉 stage에 현재 `data-frame`과 `data-renderer="loading|lottie|fallback"` 상태를 노출한다.
- [x] 제품 의사결정 기록에 고정 폭 실링과 카드 가림 순서를 남긴다.

## 제외 범위

- [x] 질문 카드 본 화면, 질문팩 콘텐츠, owner API와 데이터 모델은 변경하지 않는다.
- [x] autoplay, 사운드, 햅틱, WebGL/Three.js, 외부 CDN·마켓 템플릿은 추가하지 않는다.
- [x] 방문자 응답과 결과 화면의 애니메이션은 변경하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- [x] 주인과 `나도 이 팩으로 시작하기`로 전환된 새 주인은 기존과 같은 `/play/new` 진입 후, 스크롤 또는 버튼으로 개봉을 완료하고 첫 질문으로 이동한다.
- [x] 85% snap, 역스크롤, 느린 owner 생성 대기, route handoff, 실패 복구 흐름은 유지한다.
- [x] 방문자 흐름에는 변화가 없다.

## 디자인 영향

- [x] `app/play/play-transition.tsx`의 DOM pack/card/mouth/tear 조각을 하나의 360×520, 120프레임 Lottie 캔버스로 교체한다.
- [x] 닫힘 → 왼쪽 일부 실링 들림과 제거(전체 진행 24% 이내) → 얇은 뒤쪽 입구 → 5:7 카드 상승 → 앞쪽 포장지 가림 → 포장지 퇴장 순서를 사용한다.
- [x] 320·390·430px에서 비율과 화면 경계를 유지하고, reduced-motion에서는 기존처럼 개봉 오버레이를 생략한다.

## API와 데이터 영향

- [x] API, route 계약, schema, migration, storage, auth 변경 없음.
- [x] 정적 Lottie JSON만 `public/animations/`에서 같은 origin으로 제공한다.

## 구현 계획

- [x] `public/animations/gyeop-pack-opening.json`에 검토한 맞춤 벡터 타임라인을 추가한다.
- [x] `package.json`과 `pnpm-lock.yaml`에 공식 `@lottiefiles/dotlottie-react` 런타임만 추가한다.
- [x] 공식 `@lottiefiles/dotlottie-react`의 imperative ref를 이용해 기존 `smoothProgress`를 0~119 프레임으로 매핑하고 autoplay를 끈다.
- [x] `app/play/play-transition.tsx`는 기존 상태 머신과 motion scroll/snap만 유지하고, 기존 DOM pack 관련 transform과 마크업을 제거한다.
- [x] `app/play/play-transition.module.css`는 Lottie 캔버스 크기와 로드 실패용 정적 pack/card 폴백만 남긴다. 폴백은 `opening` 동안 닫힌 팩을, snap 이후 `opened-waiting`·`route-loading`에서는 추출 완료 카드를 보여준다.
- [x] `tests/unit/pack-opening-lottie.test.mjs`가 JSON의 frame/layer/실링 폭·scale·제거 시점/카드 비율을 직접 검증하고 `package.json`의 기본 unit test 목록에 포함된다.
- [x] `tests/e2e/owner-play.spec.ts`는 `data-frame`으로 스크롤 역복원을, `data-renderer`로 로드 완료와 폴백을 관측하고 3개 viewport 경계, 키보드·대기·handoff·reduced-motion 회귀를 검증한다.

## 완료 기준

- [x] 320·390·430px에서 Lottie 캔버스가 잘리지 않고 내부 카드가 5:7이며 가로 overflow가 없다.
- [x] 실링의 모든 animated path 상태 폭이 236이고 scaleX 애니메이션이 없으며 29프레임 이전에 사라진다.
- [x] 같은 스크롤 위치는 같은 프레임을 만들고 역스크롤 시 이전 프레임으로 돌아간다.
- [x] 카드가 `back-lip` 뒤에서 시작해 `front-lip`에 가려진 채 상승하고 타원형 입구 layer가 없다.
- [x] stage의 `data-frame`은 Lottie에 전달한 정수 프레임과 같고, `data-renderer`는 로드 성공 시 `lottie`, 실패 시 `fallback`이다.
- [x] `/animations/gyeop-pack-opening.json` 요청을 차단해도 `opening`에는 닫힌 정적 팩, snap 이후에는 추출 완료 정적 카드와 `팩 열기` 버튼이 남아 owner 생성과 이동을 막지 않는다.
- [x] 기존 owner 생성·느린 대기·오류·handoff·reduced-motion 회귀와 전체 검증이 통과한다.

## 테스트 계획

- [x] `scripts/task-harness pr`가 exact clean HEAD에서 `./scripts/run-ai-verify --mode full`을 1회 실행한다.
- [x] `pnpm exec playwright test tests/e2e/owner-play.spec.ts --project=mobile-chromium --workers=1`
- [x] `node --test tests/unit/pack-opening-lottie.test.mjs`
- [x] `pnpm typecheck`
- [x] `tests/unit/pack-opening-lottie.test.mjs` 구조 검사: 프레임 수, layer 순서, 실링 폭·scaleX 금지·제거 프레임, 5:7 카드 크기.
- [x] 320·390·430px 핵심 프레임 스크린샷 수동 확인.

## 분석과 관측성

- [x] 기존 `pack_opened` 퍼널 의미와 발생 시점은 유지하며 새 이벤트·로그·대시보드는 추가하지 않는다.

## 개인정보와 악용 방지

- [x] 개인 데이터나 질문 답변을 Lottie 자산에 포함하지 않는다. pack title은 기존 DOM 카피에만 유지한다.
- [x] 외부 CDN 요청 없이 same-origin 정적 자산만 로드해 이용 정보가 제3자에게 전달되지 않는다.

## 롤아웃과 복구

- [x] migration과 feature flag는 없다. 회귀 시 Lottie 컴포넌트와 정적 자산을 되돌리면 기존 상태 머신·API 흐름은 그대로 복구된다.
- [x] 자산 로드 실패는 런타임에서 정적 폴백으로 자동 복구한다.

## 스펙 검토

Reviewer Agent: issue_103_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 미결정 사항 없음. 공식 Lottie 런타임 한 개 추가는 맞춤 JSON 렌더링과 프레임 제어에 필요한 최소 의존성이다.
