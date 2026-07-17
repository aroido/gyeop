# Issue 10 구현 스펙: [기획] 검증용 오래된 친구팩 10장 확정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/10

## 목표

#46에서 사람 검수와 로컬 플레이 검증을 마친 오래된 친구팩 10장을 `old-friend-v1` 검증 계약으로 동결하고, 주인·방문자 문구와 #15가 사용할 metadata를 하나의 SSOT에 고정한다.

## 범위

- `docs/product/question-pack-spec.md`
  - `old-friend-v1`의 검증 상태, pack metadata, 카드 순서, Signature, 주인 문구, 방문자 문구, A/B 선택지를 표로 추가한다.
  - `active=false`는 비공개 재미 검증에만 사용할 수 있고 공개 베타 발행 승인이 아니라는 경계를 명시한다.
- `docs/product/decision-log.md`
  - #46 fixture를 새 질문 작성 없이 검증용 v1으로 재사용하고 공개 베타 승인은 별도로 유지한다는 결정을 기록한다.
- `app/play/packs.ts`
  - 오래된 친구팩 10장에 기존 `PackCard.visitorQuestion` 필드만 채운다.
  - 현재 네 pack 모두 방문자 문구를 가지므로 `visitorQuestion`을 required field로 바꾼다.
  - id, Signature, 주인 문구, A/B 선택지, 카드 순서와 다른 팩 데이터는 바꾸지 않는다.
- `tests/unit/packs.test.mjs`
  - 오래된 친구팩을 포함한 모든 현재 pack card가 비어 있지 않은 방문자 문구를 가지는지 검증한다.
  - 현재 runtime에 존재하는 `slug`, `title`, `storageKey`, `relationship`, `mood`, `sensitivity`, `shareRecommendation`과 ordered card contract 전체를 literal expected value로 고정한다.
- `docs/specs/issue-10.md`
  - 이 구현 경계, 검토 결과, 검증 명령을 기록한다.

## 제외 범위

- Supabase schema, migration, seed, RPC, API와 서버 발행 상태
- `active=true` 또는 production route 활성화
- 새 질문, 새 팩, 질문 순서 변경, A/B 선택지 수정
- 방문자 질문 UI, 응답 저장, 비교 결과, 프로필
- AI 질문 생성, 팩 메이커, 공개 베타용 추가 검수
- `Pack`/`PackCard` 추상화나 별도 콘텐츠 저장 계층

## SSOT

- `docs/product/core-feature-priority.md`: P0 첫 공식 팩은 오래된 친구팩 하나이며 질문팩 선택·10장 완료가 핵심 루프의 시작이다.
- `docs/product/question-pack-spec.md`: 팩은 정확히 10장, Signature 정확히 1장, 주인·방문자 문구와 A/B 선택지를 가져야 한다.
- `docs/product/decision-log.md`: P0 첫 공식 팩과 AI 없는 콘텐츠 구성 결정을 유지한다.
- `docs/specs/issue-46.md`: 검수와 로컬 플레이를 통과한 카드 id·순서·주인 문구·A/B 선택지·metadata의 기준이다.
- `docs/engineering/p0-development-plan.md`: #10이 #15 data seed보다 먼저 완료되어야 하는 실행 선행 관계의 기준이다.
- `app/play/packs.ts`: 현재 실행되는 로컬 prototype fixture이며 문서와 동일해야 한다.
- `AGENTS.md`
- `.codex/AGENTS.md`

## 사용자 흐름 영향

- 주인: 기존 오래된 친구팩 10장 흐름과 화면은 바뀌지 않는다.
- 방문자: 이번 PR에서 방문자 화면은 생기지 않지만, #24가 각 카드에서 사용할 자연스러운 제3자 문구가 확정된다.
- 전환된 새 주인: 동일 팩 시작 시 기존 주인 문구와 카드 순서를 그대로 사용한다.
- 운영: `old-friend-v1`과 `active=false` 조합은 비공개 검증에만 쓰며 production 발행으로 해석하지 않는다.

## 디자인 영향

- 화면, layout, CSS, motion, focus 동작 변경 없음.
- 방문자 문구는 기존 `visitorQuestion` 필드 패턴인 `...이 사람은?` 형식으로 작성하며 A/B 선택지는 주인과 동일하게 유지한다.
- 검증용 방문자 문구를 다음과 같이 정확히 고정한다. 이 문구는 독립 spec/content review를 통과해야 구현할 수 있고, 공개 베타의 사람 승인은 별도다.

| 순서 | id | 검증용 방문자 문구 |
|---:|---|---|
| 1 | `conflict` | 서운한 일이 생기면 이 사람은? |
| 2 | `reunion` | 오랜만에 친구를 만나면 이 사람은? |
| 3 | `plans` | 약속을 잡을 때 이 사람은? |
| 4 | `comfort` | 친구가 고민을 털어놓으면 이 사람은? |
| 5 | `gathering` | 여러 친구가 모인 자리에서 이 사람은? |
| 6 | `reconnect` | 연락이 뜸해졌을 때 이 사람은? |
| 7 | `memory` | 옛날 이야기가 나오면 이 사람은? |
| 8 | `travel` | 친구와 여행 일정을 정할 때 이 사람은? |
| 9 | `celebration` | 친구의 좋은 소식을 들은 직후 이 사람은? |
| 10 | `hard-day` | 힘든 날에 이 사람은? |

## API와 데이터 영향

- 네트워크 API, DB schema, migration, auth, storage 변경 없음.
- #15가 사용할 문서 계약:
  - `slug=old-friend`
  - `version=old-friend-v1`
  - `relationship_tag=old_friend`
  - `tone=warm_reminiscence`
  - `sensitivity=low`
  - `recommended_share=public`
  - `active=false`
- 새 상태 enum을 만들지 않는다. `old-friend-v1`과 `active=false`의 조합이 검증용 비공개 상태이며 #15가 기존 schema 계약으로 재현한다.
- localStorage key와 저장 shape는 변경하지 않는다.

## 구현 계획

1. `question-pack-spec.md`에 #46 fixture와 동일한 10장 표와 metadata·발행 경계를 추가한다.
2. `decision-log.md`에 검증용 v1 동결과 공개 베타 비승인 결정을 기록한다.
3. `packs.ts`의 오래된 친구팩 10장에 제3자 방문자 문구를 추가한다.
4. `visitorQuestion`을 required로 만들고 기존 pack unit test의 방문자 문구 검증을 모든 pack으로 넓힌다.
5. 같은 unit test에 오래된 친구팩의 현재 runtime 표시 metadata 7개와 10장 전체 ordered contract literal을 추가해 id·순서·문구·선택지 drift를 한 번에 실패시킨다.
6. focused unit test와 전체 검증으로 카드 수, Signature 수, 빈 필드, 기존 UI 회귀를 확인한다.

## 완료 기준

- `old-friend-v1` 문서 표와 `packs.ts`가 같은 10개 id, 순서, Signature, 주인 문구, 방문자 문구, A/B 선택지를 가진다.
- 카드는 정확히 10장이고 `conflict`만 Signature다.
- 모든 카드의 주인·방문자 문구와 A/B 선택지가 비어 있지 않고 A와 B가 다르다.
- pack metadata 7개 값이 `question-pack-spec.md`에 명시된다.
- `old-friend-v1`, `active=false`, 공개 베타 비승인 경계가 문서와 decision log에 모두 남는다.
- unit test 하나가 현재 runtime 표시 metadata 7개와 10장 전체 ordered contract의 drift를 자동으로 실패시킨다.
- 문서 전용 `version`, `relationship_tag`, `tone`, `recommended_share`, `active` 값은 `question-pack-spec.md`와 decision log 대조로 확인하며 이 이슈에서 runtime field를 추가하지 않는다.
- production route와 Supabase에는 변화가 없다.
- `node --test tests/unit/packs.test.mjs`와 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `node --test tests/unit/packs.test.mjs`
- `./scripts/run-ai-verify --mode full`
- expected literal과 runtime fixture의 deep equality로 `slug`, `title`, `storageKey`, `relationship`, `mood`, `sensitivity`, `shareRecommendation`과 기존 10개 id·Signature·주인 문구·A/B 선택지·순서·새 방문자 문구를 확인한다.
- 문서 표와 unit test expected literal의 방문자 문구를 10장 모두 대조한다.
- 문서 전용 machine metadata 7개 값은 `question-pack-spec.md`와 decision log에서 대조한다.

## 분석과 관측성

- 분석 event 추가·변경 없음.
- 응답 값, 관계, 방문자 문구를 event나 log에 넣지 않는다.

## 개인정보와 악용 방지

- 실제 응답이나 사용자 데이터가 없는 정적 콘텐츠 변경이다.
- 낮은 민감도와 공개 공유 추천은 #46에서 검수한 관찰 가능한 습관 질문에만 적용한다.
- 검증 pack을 production 공개 상태로 오인하지 않도록 기존 `active=false` 계약만 사용한다.

## 롤아웃과 복구

- feature flag와 migration 없음.
- production route는 계속 차단된다.
- 회귀 시 이 PR의 문서·visitorQuestion·unit test 변경만 되돌리면 기존 local prototype으로 복구된다.

## 스펙 검토

Reviewer Agent: issue10_spec_critic
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 공개 베타용 콘텐츠 승인과 `active=true` 전환은 의도적으로 미결정이며 #15 이후 별도 승인 없이는 진행하지 않는다.
- 공개 베타 사람 승인은 이 이슈의 검증용 content review와 구분하며 `active=true` 전환 전 별도로 필요하다.
- `visitorQuestion` required 전환은 현재 네 pack이 모두 문구를 갖게 된 뒤 적용하므로 기존 fixture에 빈 값을 만들지 않는다.
