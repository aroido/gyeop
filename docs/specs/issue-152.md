# Issue 152 구현 스펙: /me 프로필 상단 공유 동기와 행동 강화

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/152

## 목표

인증 주인의 모바일 `/me` 첫 화면에서 닉네임, 친구 시선이 관계별로 쌓이는 가치, 실제 누적 지표, 다음 완료 팩을 공유하는 행동을 하나의 프로필 헤더로 즉시 이해하게 한다.

## 범위

- [ ] `app/me/account-profile-view.tsx` 상단을 사람 중심 프로필 헤더로 묶고 `{닉네임}의 겹`을 주 제목으로 유지한다.
- [ ] 완료한 팩이 있으면 헤더에 `관계마다 다른 나를 모아보세요.` 한 줄과 `질문팩 공유하기` 링크를 제공한다.
- [ ] `질문팩 공유하기`는 기존 `ctaPlayId`의 `/me/plays/[playId]` 공유·상세 관리 화면으로 이동하는 navigation CTA다. 실제 링크 복사·OS 공유는 다음 화면의 기존 control에서만 실행한다.
- [ ] 완료한 팩이 없으면 헤더 문장을 `질문팩에 답하고, 내가 보는 나부터 쌓아보세요.`로 바꾸고 같은 위치에 홈 `/`로 이동하는 `질문팩 시작하기`를 제공한다.
- [ ] 실제 `AccountOwnerProfile` 값으로 `시선 N`, `완료한 겹 N`, `관계 N`만 표시하고 `완료 응답 기준`, `완료 질문팩`, `도착한 관계 종류` 보조 설명은 제거한다. `계정 프로필 요약` aria-label은 유지한다.
- [ ] 별도 설명 박스·아이콘·다중 action을 추가하지 않고, 완료 layer가 없는 경우 기존 `아직 완성한 겹이 없어요` 설명 박스도 렌더링하지 않는다.
- [ ] black/blue/lime/coral 카드 언어를 재사용해 헤더의 시각적 구획과 계층을 강화하고, 아래 관계 카드 스택은 그대로 유지한다.
- [ ] 직접 관련된 source verifier와 모바일 Playwright 기대값을 변경된 문구·배치에 맞춘다.
- [ ] `/me` 계정 프로필의 초기 공유 진입 계약을 최상위 SSOT `docs/product/core-feature-priority.md` §5.7과 `docs/product/decision-log.md`, `docs/design/p0-mobile-ui-spec.md`에 반영한다.

## 제외 범위

- [ ] 공개 계정 프로필 URL, 프로필 자체 공유, 대표 팩 선택 기능을 추가하지 않는다.
- [ ] 새 공유 API·DB·migration·인증·링크 생성 로직이나 account 단위 analytics event를 추가하지 않는다.
- [ ] account `/me` CTA에 `entry_source=profile_reshare`, click recorder 또는 새 event를 추가하지 않는다.
- [ ] avatar, Google 계정 사진·이름, AI 소개문·성격 요약, 점수·순위·MBTI형 고정 라벨을 추가하지 않는다.
- [ ] 팩별 공유 관리 화면과 실제 공유 sheet·복사·회전·비활성화 동작을 변경하지 않는다.
- [ ] `/me/profile/[playId]`의 시선 0건 재공유 CTA 숨김, 시선 1건 이상 `시선 더 모으기`, 기존 `profile_reshare` analytics 계약을 변경하지 않는다.
- [ ] 관계·질문 집계, 공개 threshold, 카드 스택 데이터 선택 규칙을 변경하지 않는다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- docs/design/p0-mobile-ui-spec.md §7.7, §11
- AGENTS.md

## 검토 근거와 현행 계약

- [ ] 직접 시각 기준은 검정 canvas의 `docs/assets/mockups/01-product-overview.png`, `03-perspective-stack-profile.png`, `04-profile-evolution.png`다. 흰 canvas의 관계 layer 목업이나 avatar·가짜 사람 수·성격 단어는 복제하지 않는다.
- [ ] `lib/owner-profile/account-profile-core.mjs`가 `ctaPlayId`를 첫 완료 play로 정하고 empty·draft-only에서는 `null`로 유지하는 현행 계약을 재사용한다.
- [ ] `app/me/owner-profile-view.tsx`의 per-play 시선 0 CTA 숨김과 시선 1건 이상 `profile_reshare` 진입은 account `/me`의 초기 공유 진입과 분리해 그대로 둔다.
- [ ] `app/me/plays/[playId]/page.tsx`와 `app/me/plays/[playId]/share-link-manager.tsx`가 실제 링크 생성·복사·OS 공유와 기존 측정을 담당한다. account `/me`는 이 화면까지 query 없이 이동만 한다.
- [ ] Lazyweb improve report [GYEOP mobile profile header](https://www.lazyweb.com/report/lazyweb/f6ff73ea-52be-43d5-8cb6-7626fe6e8434/?source=create)는 전환 효과의 증거가 아니라 시각 위계의 방향성 참고다.

## 사용자 흐름 영향

- [ ] 주인: 로그인 후 `/me`에서 자신이 누구인지와 친구에게 팩을 공유하면 관계별 프로필이 쌓인다는 이유를 읽고, 완료 팩이 있으면 `질문팩 공유하기`로 기존 `/me/plays/[playId]`에 진입한다. 시선이 0이어도 완료 팩 공유를 처음 시작할 수 있다.
- [ ] 주인: 완료 팩이 없는 empty·draft-only 계정은 `질문팩 시작하기`로 홈에서 팩을 선택한다.
- [ ] 주인: 실제 링크 복사·OS 공유는 `/me/plays/[playId]`에서 수행하며, 계정 `/me` 이동 자체는 `profile_reshare` event로 기록하지 않는다.
- [ ] 주인: `/me/profile/[playId]`의 재공유는 기존대로 시선이 0이면 숨고 1건 이상일 때만 `시선 더 모으기`와 `profile_reshare` 측정을 사용한다.
- [ ] 방문자: 공개 프로필 진입점은 생기지 않으며 기존 특정 팩 초대 링크에서 무가입 3장 응답과 비교를 계속한다.
- [ ] 전환된 새 주인: 기존 same-pack 시작·로그인·`/me` 복구 흐름은 바뀌지 않고, 완료 후 같은 상단 공유 행동을 사용한다.

## 디자인 영향

- [ ] 사용자 추가 피드백 `너무 설명이 많은 건 디자인적으로 별로`를 우선해 상단 정보량을 한 줄 설명으로 제한한다.
- [ ] 대상은 모바일 `/me` 상단뿐이다. `{닉네임}의 겹` 제목 → 상태별 한 줄 → 단일 CTA → compact metrics → 기존 stack 순서만 사용한다.
- [ ] 헤더는 기존 black 배경과 blue/lime/coral 강조색, 둥근 카드 경계, 굵은 타이포그래피를 재사용한다. 새 설명 card·이미지·아이콘·폰트·dependency는 추가하지 않는다.
- [ ] `질문팩 공유하기` 또는 `질문팩 시작하기`는 높이 44px 이상이고 `:focus-visible` outline이 보여야 한다.
- [ ] 지표는 제목과 CTA보다 낮은 시각 우선순위로 축소하고 `시선 N`, `완료한 겹 N`, `관계 N`만 남기되 `계정 프로필 요약` 접근성 이름을 유지한다.
- [ ] `stackLayers.length > 0`일 때 320×568, 390×844, 430×932 viewport에서 가로 스크롤이 없고 첫 `.stackCard`의 viewport 교차 높이 `min(card.bottom, innerHeight) - max(card.top, 0)`가 24px 이상이어야 한다.
- [ ] 카드 스택 이후 관계 선택·상세·질문팩 관리의 순서와 상호작용은 유지한다.
- [ ] Lazyweb improve report [GYEOP mobile profile header](https://www.lazyweb.com/report/lazyweb/f6ff73ea-52be-43d5-8cb6-7626fe6e8434/?source=create)의 `한 줄 목적 → 즉시 행동 → 축소된 metrics` 위계만 채택한다. 긴 설명, home/settings 진입, share sheet 직접 실행, 다중 action 등 이 이슈의 P0 범위를 넓히는 제안은 채택하지 않는다.

## API와 데이터 영향

- [ ] 없음. `AccountOwnerProfile.ctaPlayId`가 가리키는 기존 첫 완료 play와 `/me/plays/[playId]` 경로를 그대로 재사용한다.
- [ ] `ctaPlayId === null`이면 기존 홈 `/` 경로를 사용하며 새 fallback 데이터나 가짜 지표를 만들지 않는다.
- [ ] account `/me` 링크에는 query parameter를 붙이지 않는다. `/me/profile/[playId]`에서 사용하는 `?entry_source=profile_reshare`는 기존 팩별 재공유 경로에만 남긴다.

## 구현 계획

- [ ] `app/me/account-profile-view.tsx`: 기존 제목·하단 primary CTA·지표를 하나의 상단 `<header>`로 재배치해 제목 → 상태별 한 줄 → CTA → 지표 순서로 만든다. CTA는 href만 제공하며 공유 API나 event를 호출하지 않는다. 지표 보조 설명과 layer 0 전용 empty 설명 박스는 삭제하고 카드·관계·관리 렌더링 로직은 변경하지 않는다.
- [ ] `app/me/owner-list.module.css`: 프로필 헤더, 한 줄 문장, CTA, compact metrics에 필요한 최소 스타일만 추가·조정하고 삭제된 보조 설명·empty 박스 스타일을 정리한다. 기존 색상 변수와 focus-visible 규칙을 재사용한다.
- [ ] `scripts/verify-owner-profile.mjs`: 완료·empty 가치 문장, `질문팩 공유하기`·`질문팩 시작하기`, query 없는 상태별 href 분기를 account 프로필 UI 계약으로 갱신한다.
- [ ] `tests/e2e/owner-play-live.spec.ts`: 현존하는 account `/me` 복구 시나리오에 완료 계정의 상단 `질문팩 공유하기` 목적지·query 부재를 추가하고, 320/390/430px 카드 노출·가로 overflow·접근성 계약을 집중 검증한다.
- [ ] `docs/product/core-feature-priority.md` §5.7: account `/me`의 `질문팩 공유하기`는 완료 play가 있으면 시선 0건에서도 보이는 초기 공유 navigation이고, query 없이 해당 play의 공유 관리 화면으로 이동한다고 명시한다. 같은 절의 per-play `시선 더 모으기`는 기존대로 submitted 공개 링크 시선 1건 이상에서만 보이고 0건에서 숨는 재공유 규칙임을 구분한다.
- [ ] `docs/product/decision-log.md`: account `/me`의 sight 0 포함 초기 공유 진입과 per-play `/me/profile/[playId]`의 sight>0 재공유 측정이 서로 다른 계약임을 최신 결정으로 기록한다.
- [ ] `docs/design/p0-mobile-ui-spec.md`: `/me` account stack 상태표에 완료 팩 유무별 helper·CTA·href와 카드 첫 viewport 기준을 추가한다.

## 완료 기준

- [ ] 완료 play가 있는 `/me` 상단에서 `{닉네임}의 겹`, `관계마다 다른 나를 모아보세요.`, `질문팩 공유하기`, `시선 N`·`완료한 겹 N`·`관계 N`, 카드 스택이 이 순서로 보인다.
- [ ] `질문팩 공유하기`는 시선 수와 무관하게 `/me/plays/${profile.ctaPlayId}`로 이동하며 query parameter와 event recorder를 사용하지 않는다. 실제 링크 복사·OS 공유는 다음 화면의 기존 control에서만 일어난다.
- [ ] 완료 play가 없는 계정에는 `질문팩 공유하기`와 별도 empty 설명 박스가 없고 `질문팩에 답하고, 내가 보는 나부터 쌓아보세요.` 한 줄과 `질문팩 시작하기`가 `/`를 가리킨다.
- [ ] `완료 응답 기준`, `완료 질문팩`, `도착한 관계 종류` 텍스트가 화면에 없고 지표의 `계정 프로필 요약` aria-label은 유지된다.
- [ ] 상단의 중복 주 CTA가 없고 CTA의 탭 높이는 44px 이상이며 keyboard focus가 보인다.
- [ ] `stackLayers.length > 0`인 320×568, 390×844, 430×932에서 첫 `.stackCard`의 viewport 교차 높이 `min(card.bottom, innerHeight) - max(card.top, 0)`가 24px 이상이고 `documentElement.scrollWidth <= innerWidth`다.
- [ ] `/me/profile/[playId]`는 기존대로 시선 0건에서 재공유 CTA가 없고, 시선 1건 이상에서만 `시선 더 모으기`와 `entry_source=profile_reshare`·analytics를 유지한다.
- [ ] `docs/product/core-feature-priority.md` §5.7에서 완료 play가 있는 account `/me`의 시선 0 포함 `질문팩 공유하기` 초기 navigation과 per-play 시선 1건 이상 `시선 더 모으기` 재공유를 별도 규칙으로 명시하며, 후자의 0건 숨김 계약은 바뀌지 않는다.
- [ ] 기존 관계별 3건 threshold, 1:1 제외, 실제 지표·질문·선택만 표시하는 개인정보 계약이 유지된다.
- [ ] 아래 관계 선택, 상세 카드, draft 이어답기, 완료 팩 공유·상세 관리, 로그아웃 동작에 회귀가 없다.

## 테스트 계획

- [ ] `node scripts/verify-owner-profile.mjs`
- [ ] `pnpm exec playwright test tests/e2e/owner-play-live.spec.ts --grep "keeps multiple packs under one anonymous owner and resumes each pack"`
- [ ] 위 Playwright 시나리오에서 320×568, 390×844, 430×932 viewport의 첫 `.stackCard` 교차 높이 24px 이상, 가로 overflow, CTA 목적지·query 부재·44px tap target·focus-visible을 확인한다.
- [ ] 기존 `tests/e2e/owner-profile.spec.ts`가 per-play 시선 0 CTA 숨김과 시선 1건 이상 `profile_reshare` 계약을 계속 검증한다.
- [ ] root orchestration의 `./scripts/task-harness pr 152`가 exact clean HEAD에서 `./scripts/run-ai-verify --mode full`을 한 번 실행·기록한다.

## 분석과 관측성

- [ ] 새 event를 추가하지 않는다. account `/me` 상단 CTA는 query 없이 기존 팩별 관리 화면으로만 이동하고 click을 기록하지 않는다.
- [ ] 실제 공유 성공과 downstream visitor 제출의 기존 `profile_reshare` 측정은 `/me/profile/[playId]`에서 시작한 팩별 재공유에만 그대로 적용한다.
- [ ] CTA 문구 변경으로 source verifier와 E2E locator만 명시적으로 갱신하고 raw link secret·닉네임·응답은 log에 추가하지 않는다.

## 개인정보와 악용 방지

- [ ] `/me`는 계속 fresh Auth UID와 play 소유권으로 보호되는 주인 전용 화면이며 외부 공유 가능한 account URL을 만들지 않는다.
- [ ] 외부 공유 대상은 완료한 특정 팩의 기존 안전한 공개·1:1 링크뿐이다. medium/high 팩의 중립 metadata와 1:1 consume 규칙을 그대로 유지한다.
- [ ] 관계는 play별 완료 응답 3건 이상, 질문 선택 수는 같은 관계·질문 3건 이상에서만 공개하고 1:1 응답은 계정 집계에서 제외한다.
- [ ] Google 계정 이메일·이름·사진, 방문자 신원, raw 응답, secret을 새 UI에 표시하지 않는다.

## 롤아웃과 복구

- [ ] migration·feature flag 없이 기존 Next.js 배포로 함께 롤아웃한다.
- [ ] 실패 시 이 PR의 `account-profile-view.tsx`, `owner-list.module.css`, 직접 관련 verifier·test 변경만 되돌리면 기존 `/me` 렌더링과 팩별 공유 경로로 복구된다. 데이터 rollback은 없다.

## 스펙 검토

Reviewer Agent: issue152_critic_gate
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- [ ] 없음. Lazyweb 보고서는 시각 위계만 방향성 근거로 사용하고, SSOT와 충돌하는 home/settings/share-sheet 제안은 제외하기로 결정했다.
- [ ] `ctaPlayId`는 기존 정렬상 첫 완료 play를 재사용한다. 대표 팩 선택은 P1이므로 이 이슈에서 선택 UI를 만들지 않는다.
