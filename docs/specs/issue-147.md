# Issue 147 구현 스펙: 관계 인사이트 9:16 이미지와 기존 초대 링크 공유

Issue: https://github.com/aroido/gyeop/issues/147

## 목표

공개 기준을 충족한 `관계 1개 + 질문 1개`의 실제 집계를 9:16 이미지로 만들어 기존 공개 초대 링크와 함께 공유하고, 받은 사람이 결과를 소재로 대화를 시작한 뒤 같은 팩에 참여할 수 있게 한다.

## 범위

- [ ] account `/me`는 공개 가능한 비민감 관계·질문이 하나 이상일 때만 상단 Primary를 `내 겹 공유하기`로 표시하고, 첫 공유 가능 play와 정확한 non-romantic 관계·질문을 `/me/profile/[playId]?share_relationship=…&share_card=…#shareable-insight`로 전달한다.
- [ ] 완료 play는 있으나 공유 가능한 관계·질문이 없으면 상단 Primary를 `시선 더 모으기`로 표시해 기존 `/me/plays/[playId]`로 이동한다. 완료 play가 없으면 기존 `질문팩 시작하기`를 유지한다.
- [ ] `/me/profile/[playId]`의 현재 선택 관계에서 공개 가능한 첫 질문에만 `이 시선 카드 공유하기`를 표시한다. `romantic`, 수집 중 관계, 질문 표본 1~2개에는 표시하지 않는다.
- [ ] 카드 CTA는 `/me/plays/[playId]?entry_source=profile_reshare&share_relationship=…&share_card=…`로 이동한다. 기존 `profile_reshare` attribution과 owner가 선택한 관계·질문을 strict parser로 전달하고, 실제 집계를 다시 조회·검증한 뒤 미리보기를 먼저 보여 준다.
- [ ] 미리보기와 PNG는 팩 제목, 원본 질문, A/B 선택지, owner 선택, 관계 label, 관계·질문 A/B count만 사용한다.
- [ ] 브라우저 Canvas로 1080×1920 PNG `gyeop-insight.png`를 결정적으로 생성한다. 서버 업로드나 새 이미지 서비스는 사용하지 않는다.
- [ ] 공개 링크를 새로 준비한 뒤 file share가 가능한 브라우저에서는 PNG file과 기존 invite text/url을 함께 Web Share API로 넘긴다.
- [ ] file share가 불가능하면 `이미지 저장`과 기존 `링크 복사`를 각각 제공하고, 자동 복사 실패 시 기존 읽기 전용 URL 직접 선택 fallback을 유지한다.
- [ ] `docs/product/core-feature-priority.md`, `docs/product/decision-log.md`, `docs/design/p0-mobile-ui-spec.md`를 새 계정 CTA·관계 인사이트 공유 계약으로 갱신한다.
- [ ] 공유 자격·안전한 카드 모델·PNG 규격·account CTA·profile CTA·share/fallback·privacy 회귀를 unit과 Playwright로 고정한다.

## 제외 범위

- [ ] 공개 account 프로필 URL, 전체 프로필 이미지, 프로필 검색·팔로우·댓글·DM·인앱 채팅은 만들지 않는다.
- [ ] 사용자가 받은 결과를 서비스 안에서 대화하는 기능은 만들지 않는다. 9:16 결과 카드와 기존 초대 링크를 외부 대화의 소재와 참여 경로로 사용한다.
- [ ] `romantic`, 1:1 결과, `known_since_code` 교차 집계, 방문자 이름·사진·개별 답변은 공유하지 않는다.
- [ ] 관계·질문·색상·폰트·레이아웃 편집기, 복수 템플릿, 전체 프로필 자동 요약, 점수·순위·MBTI·AI 문구를 추가하지 않는다.
- [ ] 새 API route, DB schema/RPC, Supabase Storage, 외부 screenshot/ImageGen/SNS API, 새 link kind를 추가하지 않는다.
- [ ] Instagram Story 직접 게시, 자동 메시지, 수신·열람 확인은 지원하지 않는다.

## SSOT

- `docs/product/core-feature-priority.md` §2, §5.4, §5.7
- `docs/product/question-pack-spec.md`의 발행 질문·선택지·관계 code
- `docs/product/decision-log.md`의 계정 통합 프로필, owner 관계 이중 threshold, 특정 팩 링크 공유 결정
- `docs/design/p0-mobile-ui-spec.md` §3, §7.3, §7.7, §11
- `.codex/AGENTS.md`
- GitHub issue #147
- `docs/assets/mockups/05-share-card-system.png`

## 사용자 흐름 영향

- [ ] 공유 가능 owner: `/me`의 `내 겹 공유하기` → query로 지정한 non-romantic 관계·질문이 선택된 팩 프로필 → `이 시선 카드 공유하기` → 9:16 미리보기 → 공개 링크 준비 → OS 공유 또는 이미지 저장+링크 복사 순서로 이동한다.
- [ ] 공유 불가 owner: `/me`에서 거짓 `내 겹 공유하기`를 보지 않는다. 완료 play가 있으면 `시선 더 모으기`, 없으면 `질문팩 시작하기`만 본다.
- [ ] owner가 팩 프로필에서 다른 공개 가능 관계를 선택하면 그 관계의 첫 공개 가능 질문이 공유 대상이 된다. 첫 버전에는 추가 질문 선택기나 편집기를 두지 않는다.
- [ ] 공유 관리 화면은 query의 관계·질문을 현재 private profile 응답과 다시 대조한다. 삭제·철회·집계 변화로 자격을 잃었으면 count·미리보기·공유 행동을 보여 주지 않고 `이 시선은 지금 공유할 수 없어요`와 프로필 복귀만 제공한다.
- [ ] 외부 수신자는 PNG에서 실제 관계 인사이트를 보고 대화를 시작할 수 있고, 함께 전달된 기존 invite URL로 로그인 없이 같은 팩의 3장 응답에 진입한다.
- [ ] 방문자의 제출·즉시 비교·`나도 이 팩으로 시작하기`와 새 owner 전환 순서는 바꾸지 않는다.

## 디자인 영향

- [ ] Lazyweb report [Profile Insight Share Card](https://www.lazyweb.com/report/lazyweb/5cc6f1e4-c1fc-460d-bf16-d0aa04ce8a24/?source=create)에서 `선택된 실제 결과 카드 1장 + 지배적인 공유 행동 1개`만 채택한다. 별도 설명 block, 다중 추천, 공개 프로필 탐색은 채택하지 않는다.
- [ ] account `/me` 헤더의 제목 → 한 줄 → 단일 Primary → compact metrics → 기존 stack 순서를 유지한다. 설명을 늘리지 않고 상태별 한 줄과 버튼 문구만 정확하게 바꾼다.
- [ ] eligible 한 줄은 실제 인사이트 공유를 말하고 Primary는 `내 겹 공유하기`다. ineligible 한 줄은 시선이 더 필요함을 말하고 Primary는 `시선 더 모으기`다.
- [ ] 팩별 profile의 기존 blue/lime/coral stacked-card 언어를 유지하고, 공개 가능한 질문 카드 안에 높이 44px 이상의 `이 시선 카드 공유하기` 한 개만 추가한다.
- [ ] 공유 관리 화면의 card mode는 9:16 미리보기 한 장과 현재 단계의 단일 Primary만 보여 준다. 링크 준비 전에는 `카드 공유 준비하기`, 준비 후에는 `카드와 링크 공유하기` 하나가 Primary이며, file share가 없을 때만 `이미지 저장`과 `링크 복사` fallback을 병렬로 노출한다.
- [ ] card mode에서는 일반 share kind fieldset, generic lead/profile entry, 기존 link 목록·회전·비활성화 관리, `PrivateOneToOnePanel`을 렌더하지 않는다. selection이 없는 일반 공유 관리 진입에서만 기존 UI를 유지한다.
- [ ] 미리보기와 PNG는 warm paper, cobalt blue, acid lime, coral, black의 승인 팔레트와 굵은 한글 타이포그래피, 최대 4장의 절제된 stack offset을 사용한다. avatar·가짜 인원·성격 label은 복제하지 않는다.
- [ ] 320×568, 390×844, 430×932에서 가로 스크롤과 잘림이 없고 Primary와 미리보기 시작점이 과도한 설명 때문에 첫 카드 아래로 밀리지 않는다.
- [ ] 모든 버튼은 44px 이상, `:focus-visible`, 명확한 accessible name을 가진다. 상태 문구는 `role=status|alert`를 사용하고 reduced motion에서는 전환 animation 없이 같은 정보를 제공한다.

## API와 데이터 영향

- [ ] 새 API·DB·migration·storage는 없다. account `/me`의 strict-decoded `availableLayers`와 기존 `GET /api/me/profile?playId=…`를 재사용한다.
- [ ] account 공유 자격은 `availableLayers` 중 `relationshipCode !== "romantic"`인 첫 항목으로 계산한다. 이 배열은 이미 play별 관계 완료 3건 이상과 같은 관계·질문 표본 3건 이상을 통과한 값만 포함한다.
- [ ] 팩별 공유 자격은 `OwnerProfile.relationshipLayers`에서 비민감 `available` 관계를 찾고, 같은 관계의 `available` 카드와 `profile.cards`의 동일 `cardId`를 결합해 다시 판정한다.
- [ ] 공유 카드 모델은 strict allowlist로 `packTitle`, `relationshipLabel`, `prompt`, `optionA`, `optionB`, `selfChoice`, `counts`만 가진다. `playId`, `cardId`, relationship code, nickname, URL, secret은 모델과 파일명에 넣지 않는다.
- [ ] owner-only navigation query는 `share_relationship`과 `share_card`를 exact single string으로만 받고 shared registry/card ID 형식으로 검증한다. account profile의 첫 non-romantic `availableLayers` 항목이 두 값을 만들고, 팩별 profile은 검증된 값을 최초 선택으로 사용한다. registry 순서상 더 앞선 `romantic` 관계가 있어도 share anchor 진입에서 default가 될 수 없다.
- [ ] `/me/profile/[playId]`에 safe selection query가 없으면 private 열람용 기존 초기 관계 선택은 유지하되, `romantic` 관계에는 insight CTA를 만들지 않는다. safe selection query가 잘못됐거나 stale이면 임의의 다른 관계로 공유 대상을 대체하지 않고 일반 private profile만 보여 준다.
- [ ] 공유 대상 링크는 같은 play의 기존 `public` invite URL뿐이다. card mode에서는 1:1 선택을 숨기고 기존 link 생성·새 발급·disable 계약과 raw secret 비복원 원칙을 유지한다.
- [ ] PNG는 클라이언트 메모리에서만 생성하고 object URL은 다운로드 직후 revoke한다. 브라우저 reload 뒤 raw invite URL이 없으면 기존 관리 화면에서 새 공개 링크를 준비하기 전까지 handoff하지 않는다.

## 구현 계획

- [ ] `lib/owner-profile/profile-share-card-core.mjs`에 비민감 관계 판정, strict `share_relationship`/`share_card` query parse, 현재 profile에서의 공유 후보 선택, ID·URL 없는 exact 카드 모델, 고정 파일명과 결정적 줄바꿈/레이아웃 입력을 둔다.
- [ ] `tests/unit/profile-share-card.test.mjs`에서 관계 3명+질문 3표본 이중 threshold, `romantic` 제외, stale/duplicate query 실패, exact allowlist, 긴 한글·3자리 count layout bounds, safe filename을 검증한다.
- [ ] `app/me/account-profile-view.tsx`는 기존 `availableLayers`에서 첫 공유 가능 비민감 항목만 고르고 정확한 play·relationship·card query를 포함한 Primary href/label을 만든다. `lib/owner-profile/account-profile-core.mjs`의 서버 조합 계약은 바꾸지 않는다.
- [ ] `app/me/profile/[playId]/page.tsx`는 exact-parsed safe selection을 `OwnerProfileView`에 전달한다. `app/me/owner-profile-view.tsx`와 `app/me/owner-profile.module.css`는 이 selection을 최초 관계로 사용하고, 공개 가능한 현재 질문에만 anchor와 CTA를 추가하며 기존 `profile_reshare_clicked` latch/event를 재사용한다.
- [ ] profile insight CTA href에는 exact selection과 `entry_source=profile_reshare`를 함께 고정한다. `app/me/plays/[playId]/page.tsx`는 기존 `parseShareEntrySource`와 exact-parsed share selection을 `ShareLinkManager`에 전달한다.
- [ ] `app/me/plays/[playId]/profile-share-card.tsx`는 같은 safe model로 DOM 미리보기와 1080×1920 Canvas PNG를 만들고, 실제 생성 File로 `navigator.canShare({ files })`를 판정한다. 고정 좌표·팔레트·줄 수·overflow guard를 사용하고 `document.fonts.ready` 뒤 렌더한다.
- [ ] `app/me/plays/[playId]/share-link-manager.tsx`와 `share-links.module.css`는 card mode에서 profile을 함께 읽어 선택을 재검증하고, generic link management·1:1 panel 없이 공개 link 준비와 file+기존 text/url share 또는 이미지 저장+링크 복사 fallback만 제공한다.
- [ ] `lib/share-links/share-handoff-core.mjs`의 `buildShareData`·`isShareCancellation`, `lib/share-links/share-link-state-core.mjs`의 `parseShareEntrySource`, 기존 `recordShareAction`과 manual URL fallback을 재사용한다. 새 share framework나 dependency는 추가하지 않는다.
- [ ] `tests/e2e/owner-profile.spec.ts`, `tests/e2e/share-links.spec.ts`, account profile을 검증하는 기존 owner E2E를 최소 수정해 CTA 조건, preview, PNG dimension, file share, 취소·실패, fallback, focus, viewport, forbidden field를 검증한다.
- [ ] 제품 SSOT 세 문서에 전체 프로필 공개가 아니라 실제 관계·질문 한 장과 기존 invite URL을 공유한다는 결정을 기록하고 2026-07-23의 account `질문팩 공유하기` 결정을 부분 대체한다.

## 완료 기준

- [ ] account `/me`에 공개 가능한 비민감 관계·질문이 있으면 `내 겹 공유하기`가 첫 해당 play와 exact relationship/card query를 가진 팩별 profile로 이동하고 그 safe 관계를 최초 선택한다. `romantic`가 registry상 먼저 있어도 선택되지 않는다. 공유 가능 항목이 없으면 버튼 문구가 `시선 더 모으기` 또는 `질문팩 시작하기`다.
- [ ] `romantic`, 관계 완료 1~2건, 관계·질문 표본 1~2개 상태에서는 account/profile/share 관리 어디에도 인사이트 공유 CTA·미리보기·count가 노출되지 않는다.
- [ ] eligible profile은 현재 선택 관계의 첫 공개 가능 질문에 `이 시선 카드 공유하기`를 표시하고, 공유 관리 화면은 owner가 확인할 9:16 미리보기를 전송 전에 보여 준다.
- [ ] profile insight CTA의 URL과 card mode event는 `entry_source=profile_reshare`를 유지해 기존 ordered funnel attribution이 끊기지 않는다.
- [ ] card mode에는 9:16 미리보기와 단계별 단일 Primary 외에 share kind, generic link list/actions, `PrivateOneToOnePanel`이 없다.
- [ ] 미리보기와 PNG의 텍스트 모델은 원본 질문, A/B 선택지, owner 선택, 관계 label, 관계별 A/B count, 팩 title만 포함한다.
- [ ] PNG는 정확히 1080×1920이며 긴 한국어 질문·선택지와 3자리 count가 고정 영역 밖으로 잘리거나 겹치지 않는다. 같은 입력은 같은 텍스트·줄·좌표 모델을 만든다.
- [ ] PNG pixel, filename, File metadata와 native share payload에 방문자 이름·사진·개별 답변·알게 된 기간·nickname·playId·cardId·relationship code·secret·현재 owner URL이 없다.
- [ ] file share 가능 환경은 `navigator.canShare({ files: [pngFile] })`를 확인한 뒤 PNG file과 기존 public invite text/url을 `navigator.share`에 전달한다.
- [ ] native share promise가 resolve된 경우에만 기존 `share_handoff_succeeded`를 기록한다. `AbortError`, reject, render 실패는 성공으로 기록하지 않고 복구 문구와 fallback을 유지한다.
- [ ] file share 불가 환경은 PNG 다운로드와 invite link 복사를 제공한다. clipboard 실패 시 keyboard로 선택 가능한 기존 manual copy input이 남는다.
- [ ] reload로 raw invite URL이 사라지거나 선택한 집계가 stale이면 성공을 가장하지 않고 기존 안전한 공개 링크 준비 또는 profile 복귀 경로만 제공한다.
- [ ] 공유 관련 event/log에는 관계·질문·A/B·count·nickname·ID·URL·secret이 없다.
- [ ] 320/390/430px, 키보드, focus-visible, screen reader, reduced-motion focused 검증과 전체 검증이 통과한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] Unit: `node --test tests/unit/profile-share-card.test.mjs tests/unit/account-owner-profile.test.mjs tests/unit/owner-profile.test.mjs tests/unit/share-handoff.test.mjs`
- [ ] Type/build: `pnpm lint && pnpm build`
- [ ] Focused Playwright: account `/me`, `tests/e2e/owner-profile.spec.ts`, `tests/e2e/share-links.spec.ts`를 320/390/430과 reduced-motion에서 실행한다.
- [ ] Mixed relationship regression: registry상 먼저인 `romantic` available layer와 뒤의 non-romantic available layer를 함께 주고, account CTA query·팩별 profile 최초 선택·card mode safe model이 모두 non-romantic의 정확한 card를 유지하는지 검증한다.
- [ ] Attribution/UI regression: insight CTA URL·share action event의 `entrySource=profile_reshare`와 card mode에서 share kind/link list/`PrivateOneToOnePanel` 부재를 검증한다.
- [ ] PNG fixture: 브라우저에서 생성 File을 `Image`로 decode해 1080×1920, MIME `image/png`, safe filename, 장문 content layout을 검증한다.
- [ ] Native share: file+text+public invite URL payload, `canShare=false`, `AbortError`, 일반 reject, render 실패, success event 단 한 번을 mock으로 검증한다.
- [ ] Privacy: ineligible DOM/accessibility tree, safe card model, PNG 입력, share payload, analytics/log에서 금지 필드를 검색한다.
- [ ] Regression: 일반 질문팩 링크 생성·회전·비활성화·복사·OS share와 기존 `시선 더 모으기`, visitor 3장→비교→same-pack 전환을 검증한다.
- [ ] 시각 확인: `docs/assets/mockups/05-share-card-system.png`와 비교해 black/cobalt/lime/coral stack 언어, 실제 A/B 데이터, 한 장 중심 위계만 확인한다.

## 분석과 관측성

- [ ] 카드 CTA 진입은 기존 `profile_reshare_clicked`, native file+link handoff resolve는 기존 `share_handoff_succeeded`, 링크 복사 성공은 기존 `share_link_copied`를 재사용한다.
- [ ] 새 event, GA4 event, custom dimension을 추가하지 않는다. 기존 `entrySource=profile_reshare`, `packVersion`, `linkKind` allowlist 외의 속성을 보내지 않는다.
- [ ] 다운로드만으로 외부 전달 성공을 추정하거나 native share 취소를 성공으로 기록하지 않는다.
- [ ] 기존 `profile_share_succeeded`와 downstream visitor submitted ordered funnel은 public invite link의 canonical server event로 계속 계산한다.

## 개인정보와 악용 방지

- [ ] 관계 완료 3건 이상과 동일 관계·질문 표본 3건 이상을 각각 통과한 submitted 공개 링크 집계만 카드에 쓴다. 서로 다른 play·관계의 2+1을 합치지 않는다.
- [ ] `romantic`와 1:1 결과는 count가 충분해도 공유 후보·미리보기·이미지에서 제외한다.
- [ ] 방문자 이름·사진·response/session ID·개별 선택·알게 된 기간은 조회 모델에 없으며 새 endpoint나 로그로 옮기지 않는다.
- [ ] account의 기존 공개 닉네임은 private 제목에만 남고 카드·filename·native text에 넣지 않는다.
- [ ] Canvas 입력은 safe model allowlist만 받으며 PNG를 서버, Storage, analytics, error log에 업로드하지 않는다.
- [ ] query는 owner-only selection pointer일 뿐 공유 payload가 아니다. parser와 profile 재검증이 모두 통과하지 않으면 fail closed한다.
- [ ] invite URL은 기존 secret fragment 계약을 유지하고 PNG pixel/metadata에는 넣지 않는다. native share text/url과 manual input 외 DOM copy에 반복 노출하지 않는다.

## 롤아웃과 복구

- [ ] migration과 외부 서비스가 없어 feature flag는 추가하지 않는다. 기존 Next.js/Render 배포로 한 번에 반영한다.
- [ ] 실패 시 관계 인사이트 CTA·card mode·renderer와 세 문서 결정을 되돌리면 기존 질문팩 공유 관리와 `/me` profile 조회가 그대로 남는다.
- [ ] 일반 링크 공유 경로는 card selection이 없을 때 기존 UI·행동을 유지하므로 별도 데이터 복구가 필요 없다.
- [ ] 배포 뒤 merged SHA의 Render success와 production `/`, `/me`, `/me/profile/[playId]`, `/me/plays/[playId]` HTTP 상태를 확인한다. 인증 owner 화면은 live fixture 또는 로그인 세션으로 CTA/preview/share를 확인한다.

## 스펙 검토

Status: Reviewed
Reviewer Agent: issue147_critic
Review Status: PASS
P0/P1 Findings: 0

검토 이력: 최초 P1 3건(비민감 카드 진입, `profile_reshare` attribution, card mode 격리)과 P2 참조 보강이 모두 범위·구현·완료 기준·회귀 테스트에 반영됐다. 추가 미결정 사항은 없다.

## 리스크와 미결정 사항

- [x] 제품 범위 미결정 없음. 외부에서 “수다”가 시작되는 최소 단위를 실제 결과 카드+기존 invite URL로 고정하고 인앱 채팅은 제외한다.
- [x] card mode는 `public` invite만 사용한다. 민감도 기본값이 1:1인 팩도 관계 인사이트를 선택한 경우에는 기존 public link를 명시적으로 새로 준비하며, 1:1 결과를 카드 집계에 포함하지 않는다.
- [x] OS별 file+URL 보존 여부는 제품이 보장할 수 없다. 성공 정의는 Web Share promise resolve까지이고, 항상 이미지 저장+링크 복사 fallback을 유지한다.
- [x] 브라우저별 font raster 차이는 pixel hash로 동일하다고 주장하지 않는다. 같은 safe model의 텍스트·줄·좌표와 1080×1920 출력 규격을 결정적으로 유지한다.
