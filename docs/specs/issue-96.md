# Issue 96 구현 스펙: 활성 질문팩 24종의 주인 시작 경로 회귀 수정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/96

## 목표

홈에 활성으로 노출한 공식 질문팩 24종이 모두 같은 브라우저의 owner 생성·재개와 첫 카드 진입까지 통과하게 한다.

## 범위

- [ ] `owner-flow-client`의 client-side slug 검증을 공식 24팩 registry와 일치시킨다.
- [ ] owner play와 owner profile 응답의 카드 순서 검증을 공식 24팩의 manifest card id·순서와 일치시킨다.
- [ ] 공식 pack registry와 manifest의 slug·version·10장 card id 계약을 검증한다.
- [ ] 확장 팩을 실제로 시작해 첫 카드까지 도달하는 회귀 테스트를 추가한다.

## 제외 범위

- [ ] 질문 문구·제목·관계·민감도와 24팩 활성 범위를 바꾸지 않는다.
- [ ] 팩 이름을 재선정하거나 카탈로그를 축소하는 제품 결정은 별도 콘텐츠 검수 작업으로 분리한다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- [ ] 주인이 홈에서 어떤 활성 팩을 골라도 개봉 화면 뒤 첫 A/B 카드로 이동한다.
- [ ] 방문자가 비교 뒤 `나도 이 팩으로 시작하기`를 눌렀을 때 확장 팩도 같은 owner 시작 흐름을 재사용할 수 있다.

## 디자인 영향

- [ ] 화면 레이아웃·제목·카드 문구는 바꾸지 않는다. 오류 경계로 빠지던 숨은 상태만 정상 owner flow로 연결한다.

## API와 데이터 영향

- [ ] API route·Supabase schema·Auth·migration 변경은 없다. client와 server가 같은 사람 검수 manifest registry를 해석하도록 수정한다.

## 구현 계획

- [ ] `lib/packs/official-pack-registry.mjs`에 24팩의 slug·version·정렬된 card id를 단일 runtime registry로 둔다.
- [ ] `lib/owner-flow/owner-flow-client.ts`가 registry의 slug만 허용하게 한다.
- [ ] `lib/owner-play/owner-play-state-core.mjs`와 `lib/owner-profile/owner-profile-core.mjs`가 registry의 card order로 응답을 엄격히 검증하게 한다.
- [ ] catalog verifier와 unit/E2E 회귀 범위에서 manifest ↔ registry 일치와 확장 팩 시작을 검증한다.

## 완료 기준

- [ ] `deadline-mode`, `group-chat-role`을 포함한 활성 확장 팩은 `/play/new?pack=<slug>`에서 owner create 후 첫 카드로 이동한다.
- [ ] 기존 4팩의 create·resume·same-pack CTA와 owner/profile 엄격 검증이 유지된다.
- [ ] registry의 각 entry는 content manifest의 slug, version, 10개 card id·순서와 정확히 일치한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] `pnpm test:owner-flow`
- [ ] `pnpm test:owner-profile`
- [ ] `pnpm test:pack-catalog`
- [ ] 확장 팩 시작 Playwright 회귀 테스트

## 분석과 관측성

- [ ] `pack_opened`의 기존 packVersion·entrySource 이벤트 계약을 바꾸지 않는다. 오류로 이탈하던 확장 팩 owner 진입이 정상적으로 기록된다.

## 개인정보와 악용 방지

- [ ] 허용 목록을 넓히되 사람 검수로 활성화된 공식 manifest에만 고정한다. 임의 slug, card id, 응답 순서는 계속 거부한다.

## 롤아웃과 복구

- [ ] 코드 병합 뒤 Render Blueprint 자동 배포를 기다리고, 공개 URL에서 확장 팩 owner 생성과 첫 카드 표시를 확인한다. 데이터 migration이 없으므로 복구는 이전 Git commit 재배포다.

## 스펙 검토

Reviewer Agent: Codex independent pass
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 팩 이름이 관계형 시리즈와 유행어형 제목으로 섞여 보인다는 사용자 피드백은 확인했다. 이번 회귀 수정은 현재 manifest 제목을 바꾸지 않으며, 실제 사용 지표와 사용자 승인 후 별도 콘텐츠 결정으로 다룬다.
