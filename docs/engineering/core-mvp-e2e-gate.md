# 핵심 MVP E2E 게이트

## 목적

`tests/e2e/core-mvp-live.spec.ts`는 겹 MVP의 세 핵심 가설을 빈 로컬 DB와 실제 브라우저·Supabase 경로에서 하나의 fixture로 검증한다.

1. owner가 10장에 답하고 공개 링크를 공유한다.
2. 방문자 3명이 3장에 답해 비교하고, 한 명이 같은 팩의 새 owner가 된다.
3. 원래 owner 프로필에 시선이 쌓이고, 프로필에서 재공유한 replacement 링크에 후속 방문자가 답한다.

## 필수 명령

```bash
pnpm test:e2e:mvp
```

이 명령은 로컬 DB를 reset한 뒤 전용 live fixture를 실행한다. `pnpm test:e2e:live`는 이 게이트를 먼저 실행하고 기존 owner 보안·세션 live fixture를 이어서 실행한다. 따라서 `./scripts/run-ai-verify --mode full`과 GitHub CI에서 핵심 MVP 게이트가 실패하면 검증도 실패한다.

## 자동 검증 계약

- actor와 viewport
  - 원래 owner: 390×844, 프로필 확인은 320×800과 430×932
  - 첫 방문자: 320×800
  - 두 번째 방문자: 390×844
  - 세 번째 방문자: 430×932
  - replacement 링크 후속 방문자: 390×844
- 모든 검사 화면은 `prefers-reduced-motion: reduce`를 사용한다.
- document 가로 overflow가 없고 확인 대상 primary control은 44×44px 이상이며 현재 viewport에서 잘리지 않아야 한다.
- 핵심 owner/share/visitor/comparison/profile 상태는 WCAG 2 A/AA axe `critical`·`serious` 위반이 0이어야 한다.
- native share 미지원과 clipboard 실패는 share-success를 만들지 않고 수동 URL을 선택한 채 보존해야 한다. 같은 화면의 clipboard 재시도는 성공해야 한다.
- 방문자 3명 뒤 공통 Signature 카드 1장만 `친구 시선 3개`를 공개하고, 나머지 9장은 실제 `n/3` 상태로 숨겨야 한다.
- 프로필 재공유는 이전 raw secret을 복원하지 않고 active 공개 링크를 UI에서 재발급해 replacement URL을 사용한다.

## 퍼널 기대값

fixture 시작 전후 `private.core_funnel_stage_counts` delta는 다음과 같아야 한다.

| funnel | stage delta |
| --- | --- |
| `owner_share` | `1 → 1 → 1` |
| `visitor_same_pack` | `4 → 4 → 1 → 1` |
| `profile_reshare` | `1 → 1 → 1 → 1` |

네 번째 방문자도 replacement 링크에서 필수 3장 제출과 비교까지 완료하므로 `visitor_same_pack`의 첫 두 단계는 4다.

## 모바일·접근성 확인 기록

- 확인일: 2026-07-19
- 명령: `pnpm test:e2e:mvp`
- 결과: PASS, 1 test, 18.3s

- 키보드: 첫 방문자의 `나도 이 팩으로 시작하기`와 owner의 `시선 더 모으기`를 focus 후 Enter로 활성화했다.
- focus: owner 첫 질문, 관계 선택, 방문자 질문·비교 결과, 공유 관리, owner 프로필의 각 heading이 화면 전환 뒤 focus를 받았다.
- reduced motion: 320/390/430px context와 owner page에서 media query 적용 및 owner question card·visitor progress의 `transition-duration: 0s`를 확인했다.
- target/overflow: 검사한 primary CTA가 모두 최소 44px이고 viewport에 잘리지 않았으며 가로 overflow가 없었다.
- axe: 핵심 상태의 `critical`·`serious` 위반 0건이었다.
- 실패 복구: clipboard 실패 시 URL 전체가 focus·선택되어 남았고, 재시도 후 복사 성공과 퍼널 share-success 1건을 확인했다.
