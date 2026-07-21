# Issue 108 구현 스펙: Render 런타임 이미지에 public 정적 자산 포함

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/108

## 목표

Render Docker 런타임 이미지에 `public/` 정적 자산을 포함해 운영에서 맞춤 Lottie JSON을 실제로 제공하고, 같은 누락을 배포 통합 테스트로 막는다.

## 범위

- [x] `Dockerfile` 런타임 단계에 빌드 산출물의 `/app/public` 복사를 추가한다.
- [x] `tests/integration/render-deploy.test.sh`에서 `/animations/gyeop-pack-opening.json`의 HTTP 200과 JSON content-type을 검증한다.

## 제외 범위

- [x] Lottie 애니메이션 내용, 프레임 매핑, 화면 CSS를 변경하지 않는다.
- [x] Render 서비스 설정, 환경 변수, 요금제, 리전은 변경하지 않는다.
- [x] 일반화된 정적 자산 검증 도구나 새 의존성을 만들지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- `Dockerfile`
- `tests/integration/render-deploy.test.sh`
- `public/animations/gyeop-pack-opening.json`
- `render.yaml`
- `AGENTS.md`

## 사용자 흐름 영향

- [x] 주인이 새 플레이를 시작할 때 정적 fallback이 아니라 승인된 Lottie 카드팩 개봉 연출이 로드된다.
- [x] 방문자·새 주인 흐름, 저장·인증·공유 동작에는 변화가 없다.

## 디자인 영향

- [x] 화면 디자인 변경 없음. PR #106에서 확정한 시각 자산을 운영 이미지에 포함하는 배포 수정이다.

## API와 데이터 영향

- [x] API, DB, 스키마, 인증 변경 없음.
- [x] 기존 공개 정적 경로 `/animations/gyeop-pack-opening.json`의 운영 응답만 404에서 200으로 복구한다.

## 구현 계획

- [x] `Dockerfile`: 런타임 단계에 `COPY --from=build /app/public ./public`을 추가한다.
- [x] `tests/integration/render-deploy.test.sh`: 기동 확인 뒤 Lottie 경로를 요청하고 상태 코드와 content-type을 각각 검증한다.
- [x] focused Docker 배포 테스트와 전체 검증을 실행한다.

## 완료 기준

- [x] 빌드한 Docker 컨테이너에서 `/animations/gyeop-pack-opening.json`이 HTTP 200을 반환한다.
- [x] 같은 응답의 content-type에 `application/json`이 포함된다.
- [x] `pnpm test:render-deploy`와 `./scripts/run-ai-verify --mode full`이 통과한다.
- [x] 병합·자동 배포 뒤 운영 URL의 같은 경로가 HTTP 200과 JSON content-type을 반환한다.

## 테스트 계획

- [x] `pnpm test:render-deploy`
- [x] `./scripts/run-ai-verify --mode full`
- [x] 운영 확인: `curl`로 Lottie 경로의 상태 코드·content-type·다운로드 크기를 확인한다.

## 분석과 관측성

- [x] 새 분석 이벤트 없음. Docker 통합 테스트와 운영 HTTP 상태가 회귀 관측 지점이다.

## 개인정보와 악용 방지

- [x] 영향 없음. 공개 저장소에 이미 포함된 비민감 Lottie JSON만 정적 제공한다.

## 롤아웃과 복구

- [x] main 병합 후 기존 Render Auto-Deploy로 배포한다.
- [x] 헬스체크 실패 또는 정적 자산 회귀 시 Render의 직전 정상 배포로 롤백한다. DB 롤백은 없다.

## 스펙 검토

Reviewer Agent: issue_103_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [x] 미결정 사항 없음. Next.js standalone 배포의 표준 `public/` 복사 누락으로 원인이 확정됐다.
