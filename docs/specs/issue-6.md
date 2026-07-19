# Issue 6 구현 스펙: [기획] 최소 이용 연령과 미성년자 데이터 정책 확정

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/6

## 목표

대한민국 우선 베타에서 GYEOP의 주인과 방문자를 모두 만 19세 이상으로 제한하고, 생년월일·신분증·보호자 정보를 새로 수집하지 않는 최소 연령 정책을 제품 SSOT로 확정한다. 미성년자에게 서비스를 제공하거나 법정대리인 동의를 받는 흐름은 열지 않으며, 실수로 들어온 미성년자 데이터의 차단·철회·삭제·문의 기준과 production beta 법률 검토 gate를 고정한다.

## 범위

- 적용 지역을 대한민국으로 한정하고 주인·방문자 공통 최소 이용 연령을 만 19세로 정한다.
- 서비스 시작 전 자기확인 방식의 연령·지역 gate와 차단 문구를 정한다.
- owner play 생성, visitor response 시작, 동일 팩 새 주인 전환에서 필요한 서버 집행 위치와 fail-closed 계약을 정한다.
- 생년월일, 주민등록번호, 신분증, 보호자 성명·연락처, IP 기반 위치 추론을 수집하지 않는다는 최소수집 원칙을 정한다.
- 미성년 이용이 신고되거나 발견됐을 때 capability 중심의 철회·삭제·문의 흐름과 최대 처리 시한을 정한다.
- 외부 법률 검토가 필요한 잔여 판단, 책임 역할, 해소 증거를 production beta 승인 gate로 명시한다.
- `docs/product/age-and-minor-policy.md`, `docs/product/core-feature-priority.md`, `docs/product/question-pack-spec.md`, `docs/product/decision-log.md`, `docs/engineering/p0-development-plan.md`를 갱신한다.

## 제외 범위

- 연령 확인 화면·Route Handler·DB migration 구현. 이는 후속 #16이 담당한다.
- 만 19세 미만 이용자용 법정대리인 동의, 가족관계·본인 인증, 보호자 계정.
- 생년월일·연령대·신분증·휴대전화 본인인증 수집.
- 해외 출시, 해외 법률 비교, 위치 기반 국가 판정.
- 개인정보 처리방침 전문, 이용약관 전문, 법률 자문 자체.
- 일반 데이터 보관 기간 전체 확정. #7은 이 정책의 미성년자 삭제 상한을 완화할 수 없다.

## SSOT와 공식 근거

- `docs/product/core-feature-priority.md` §5.1, §5.5, §5.9
- `docs/product/question-pack-spec.md`의 owner·visitor 진입과 응답 규칙
- `docs/product/decision-log.md`
- `docs/engineering/p0-development-plan.md` §2, §14, §17~18
- `docs/specs/issue-26.md`의 visitor capability 철회 계약
- `AGENTS.md`, `.codex/AGENTS.md`
- 대한민국 `개인정보 보호법` 제22조의2: 만 14세 미만 아동의 개인정보 처리에 동의가 필요한 경우 법정대리인 동의와 그 확인을 요구하고, 아동 고지는 이해하기 쉬운 언어를 요구한다.
  - https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0022&lsiSeq=270351&urlMode=lsScJoRltInfoR
- 대한민국 `개인정보 보호법 시행령` 제17조의2: 법정대리인 동의를 확인하는 구체적 방법을 둔다. 2026-07-19에 `[시행 2026. 5. 19.] [대통령령 제36340호]` 현재 통합 조문을 확인했다.
  - https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0017&lsiSeq=286175&urlMode=lsScJoRltInfoR
- 대한민국 `민법` 제4조: 사람은 19세로 성년에 이른다.
  - https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1026056227

공식 근거는 법정 최저선을 확인하는 자료다. GYEOP의 만 19세 제한은 관계 맥락·타인에 대한 판단·공유 링크를 다루는 초기 서비스에서 모든 법적 미성년자를 의도적으로 제외하기 위한 더 보수적인 제품 결정이며, 법률 해석을 대신하지 않는다.

## 제품 결정

### 대상과 지역

- 첫 production beta는 대한민국에서 이용하는 만 19세 이상만 대상으로 한다.
- 주인과 무가입 방문자에 같은 기준을 적용한다. 답변만 하는 방문자도 예외가 아니다.
- 만 19세 미만은 보호자 동의 여부와 관계없이 이용할 수 없다.
- 만 19세 미만용 동의 절차를 만들지 않으므로 보호자 개인정보도 수집하지 않는다.
- 해외 출시나 만 19세 미만 허용은 이 결정의 단순 문구 변경이 아니라 별도 제품·법률 재승인이다.

### 확인 방식과 문구

GYEOP은 정확한 생년월일을 받지 않고, domain data를 만들기 직전 다음 한 번의 명시적 자기확인을 받는다.

- 제목: `겹은 만 19세 이상만 이용할 수 있어요`
- 설명: `지금은 대한민국에서 이용하는 성인만 참여할 수 있어요. 생년월일이나 신분증은 받지 않아요.`
- 확인 항목: `만 19세 이상이며 대한민국에서 이용 중이에요.`
- 진행 버튼: `확인하고 계속`
- 미해당 선택: `아직 만 19세가 아니에요`
- 차단 제목: `지금은 겹을 이용할 수 없어요`
- 차단 설명: `답변이나 프로필은 저장되지 않았어요.`

확인 항목은 기본 선택하지 않는다. 미해당 선택 뒤에는 팩·관계·응답 입력으로 진행시키지 않고 홈으로 돌아가는 보조 동작만 제공한다. owner에게 특정 방문자가 연령 gate에서 차단됐다는 사실을 알리거나 analytics event로 남기지 않는다.

### 집행 위치

후속 #16은 화면 표시만으로 끝내지 않고 다음 생성 경계에서 서버가 `eligibilityConfirmed: true`를 요구하게 한다.

| 역할         | 사용자 경계                  | 서버 쓰기 경계                                                     | 거부 시 금지되는 것                                                                   |
| ------------ | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 새 주인      | 홈·팩 선택 뒤 첫 질문 전     | `POST /api/plays`의 새 play 생성 branch                            | play, cookie, answer, analytics, rate-limit domain row 생성                           |
| 초대 방문자  | 초대 맥락 뒤 관계 선택 전    | `POST /api/invites/[publicId]/responses`의 새 response 시작 branch | response, session cookie, assignment, event, link consume, rate-limit domain row 생성 |
| 새 주인 전환 | `나도 이 팩으로 시작하기` 뒤 | 위 owner 생성 경계를 그대로 재사용                                 | 별도 우회 play 생성                                                                   |

- `eligibilityConfirmed` 누락, `false`, 문자열·숫자 coercion, unknown field는 통과시키지 않는다.
- 확인 실패는 domain RPC와 analytics보다 먼저 종료한다. blocked attempt 전용 event나 장기 식별 row를 만들지 않는다.
- 유효한 기존 owner/visitor capability는 해당 domain row가 연령 gate를 통과해 생성됐다는 증거로 사용하며 매 답변마다 다시 묻지 않는다.
- 정책 집행 이전 private-test row를 production 자격으로 간주하지 않는다. production beta 전 데이터를 초기화하거나 #16의 명시적 재확인 전이로만 승격한다.
- 클라이언트 저장소에 생년월일·연령 숫자·보호자 정보를 저장하지 않는다. 필요한 최소 증거는 서버 생성 시각의 eligibility acknowledgement뿐이다.

## 사용자 흐름 영향

### 새 주인

1. 홈에서 팩을 고른 뒤 첫 질문이나 play 생성보다 먼저 연령·지역 gate를 본다.
2. 확인 항목을 직접 선택한 경우에만 기존 팩 시작 흐름으로 진행한다.
3. 미해당을 선택하면 저장 없이 차단 설명과 홈 복귀만 본다.
4. 방문자 비교 뒤 `나도 이 팩으로 시작하기`도 같은 owner gate를 재사용한다.

### 초대 방문자

1. 초대의 표시 이름 없는 맥락은 볼 수 있지만 관계 선택과 response 생성 전에 연령·지역 gate를 통과해야 한다.
2. 확인한 방문자만 관계·알게 된 시점·카드 응답으로 진행한다.
3. 미해당 방문자는 response나 session cookie 없이 차단되며 링크 주인에게 그 사실이 전달되지 않는다.

### 기존 capability와 신고

- gate를 통과해 생성된 유효 owner/response capability는 매 카드마다 다시 확인하지 않는다.
- 정책 이전 private-test row는 production에서 자동 승계하지 않는다.
- 실수로 들어온 미성년자 데이터는 기존 visitor 관리 capability 또는 안전하게 식별된 owner capability를 우선 사용해 철회·삭제한다.

## 디자인 영향

- #6은 화면을 구현하지 않고 #16이 사용할 exact 문구·순서·기본 미선택 상태만 확정한다.
- age gate는 owner와 visitor에 같은 component와 문구를 쓰고, 팩·관계별 변형을 만들지 않는다.
- 진행 버튼과 미해당 선택은 44px 이상 동작 영역, keyboard focus, screen reader label을 가져야 한다.
- 차단 화면은 미성년 여부를 주변 사람에게 드러낼 수 있는 세부 상태나 공유 동작을 제공하지 않는다.
- stronger age assurance가 법률 검토에서 요구되면 #16 구현 전에 별도 디자인·개인정보 검토를 거치며 이 스펙만으로 신분증 UI를 추가하지 않는다.

## API와 데이터 영향

- #6은 Route·schema·table을 변경하지 않고 #16의 구현 입력만 고정한다.
- 새 owner play 생성과 새 visitor response 생성 요청은 exact boolean `eligibilityConfirmed: true`를 요구한다.
- missing, `false`, coercion, unknown field는 domain RPC·rate-limit domain row·analytics보다 먼저 거부한다.
- 기존 capability 재개 API는 gate를 통과해 생성된 row에만 허용하고, 정책 이전 row는 production 승격 전에 재확인 또는 초기화한다.
- acknowledgement는 정확한 생년월일이나 연령 숫자를 저장하지 않는다. #16이 증거 필드를 추가하면 boolean 통과 사실과 server timestamp만 허용한다.
- 삭제 ledger는 #7의 별도 운영 데이터다. raw 답변·관계·email을 포함하지 않고 application backup과 독립된 최소 HMAC 식별자만 보존한다.

## 미성년자 데이터 대응

### 차단된 시도

- 연령 gate에서 미해당을 선택하면 domain row, cookie, 관계, 답변, analytics event를 만들지 않는다.
- 일반적인 웹 요청 보안 로그 외에 `underage`, 추정 연령, 입력 문구를 로그에 남기지 않는다.
- owner나 링크 공유자에게 차단 사실을 노출하지 않는다.

### 실수로 제출됐거나 사후 신고된 경우

- visitor가 유효한 비밀 관리 링크를 가지고 있으면 기존 철회 흐름으로 답변·관계·집계·접근 capability를 즉시 제거한다.
- owner가 유효한 owner capability로 자신의 play 삭제를 요청할 수 있는 production 흐름이 열리기 전에는, 로그아웃이 접근만 폐기한다는 한계를 안내하고 privacy 문의 경로를 제공한다.
- 신고 접수 시 추가 신분증·생년월일·보호자 정보를 요구하지 않는다. 유효한 관리 capability, owner capability 또는 서비스가 발급한 안전한 요청 식별자로 대상 범위를 최소화한다.
- 대상이 안전하게 식별되면 `target_located_at`을 UTC instant로 기록하고 즉시 접근·공유를 차단한 뒤, 그 시각부터 72시간 안에 live application data를 hard-delete한다. 일반 #7 보관 정책이 더 짧으면 더 짧은 시한을 적용한다.
- 삭제된 미성년자 데이터는 복원하지 않는다. backup 잔존은 삭제 시점부터 최대 30일이며 #7과 provider 계약은 이 상한을 충족해야 한다.
- #7은 application backup 밖의 별도 최소 삭제 ledger를 정의해야 한다. ledger는 raw 답변·관계·이메일을 담지 않고 `subject_type`, domain-separated HMAC 대상 ID, key version, `hard_deleted_at`, `expires_at`만 보존하며 Privacy Owner와 승인된 restore operator만 읽을 수 있다. 수명은 마지막 관련 backup 만료 뒤 7일 이상이고 최소 45일이다.
- backup restore는 production traffic과 격리된 환경에서만 수행한다. restore 직후 ledger를 다시 적용해 일치 row를 hard-delete하고, 대상 HMAC 재스캔 결과 0건과 일반 migration·보안 검증 PASS를 확인한 뒤에만 traffic을 연다.
- production beta 전과 이후 분기마다 restore drill을 실행해 `격리 restore → ledger 재적용 → erased subject 0 → traffic-open 승인` 증거를 남긴다. ledger 누락·key reader 누락·대상 잔존·격리 실패 중 하나라도 있으면 restore와 beta release를 중단한다.
- capability를 잃어 대상을 안전하게 특정할 수 없으면 다른 사람의 데이터를 탐색·공개하지 않는다. privacy 담당자가 최소 로그로 범위를 조사하고, 확인 불가 사유와 후속 조치를 접수 기록에 남긴다.
- privacy 문의의 `received_at`은 지원 시스템이 기록한 UTC instant이며 SLA 표시는 `Asia/Seoul`과 대한민국 공휴일 달력 기준이다. 접수한 날의 다음 영업일부터 3영업일 안에 접수 응답하고, live deletion 완료 또는 식별 불가 상태를 요청자에게 알린다.

## 책임과 production beta 승인 gate

| 항목                    | 책임 역할                                        | 해소 증거                                                                                       |
| ----------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 제품 연령·지역 결정     | GYEOP Product Owner                              | 이 SSOT와 decision log 승인, 만 19세/대한민국 문구 고정                                         |
| 한국 개인정보 법률 검토 | 한국 개인정보 분야 변호사 또는 지정 Privacy Lead | 서면 검토 기록: 자기확인 방식, 미성년자 비대상 정책, 고지 문구, accidental-minor 삭제 절차 승인 |
| UI·API 집행             | #16 구현 담당자                                  | owner/visitor direct API 우회, 기존 row, 접근성, no-domain-write 테스트 PASS                    |
| 보관·backup 정합성      | #7 정책 담당자                                   | live 72시간·backup 30일 상한, backup 밖 45일 삭제 ledger, 분기 restore drill과 provider 증거    |
| 문의 운영               | GYEOP Privacy Owner                              | production 공개 연락 채널, 3영업일 접수·72시간 live 처리 runbook과 담당자 지정                  |

다음 중 하나라도 없으면 production beta를 열지 않는다.

1. 위 한국 개인정보 법률 검토의 서면 PASS 또는 수정사항 반영 완료.
2. #7이 미성년자 신고 데이터의 live 72시간·backup 30일 상한과 backup 밖 최소 45일 삭제 ledger, 격리 restore·재삭제·0건 검증을 충족.
3. #16의 UI·API 집행과 direct-request 우회 테스트 PASS.
4. 공개 privacy 연락 채널과 incident owner 지정.
5. 개인정보 처리방침·이용 안내가 만 19세/대한민국 제한, 무보호자 동의, 철회·삭제 경로와 일치.

## 구현 계획

1. `docs/product/age-and-minor-policy.md`를 정책 SSOT로 추가한다.
2. `docs/product/core-feature-priority.md`의 진입·방문자·삭제 구간에 만 19세/대한민국 제한과 #16 집행 경계를 연결한다.
3. `docs/product/question-pack-spec.md`의 owner·visitor 진입 규칙에 canonical age policy 역링크와 #16 생성 경계를 추가한다.
4. `docs/product/decision-log.md`에 공식 근거와 보수적 제품 결정을 기록한다.
5. `docs/engineering/p0-development-plan.md`에서 `POLICY-AGE`를 확정 상태로 바꾸고 production beta gate·#16 입력을 고정한다.
6. 문서 간 연령, 지역, 법정대리인 동의 비지원, 삭제·backup restore SLA 표현을 대조한다.

## 완료 기준

- [ ] 적용 지역과 최소 연령이 `대한민국에서 이용하는 만 19세 이상` 한 문장으로 명시된다.
- [ ] owner와 visitor 모두 보호자 동의 없이 동일하게 차단되며 예외 역할이 없다.
- [ ] exact 자기확인·차단 문구와 기본 미선택 동작이 정의된다.
- [ ] owner play 생성, visitor response 시작, same-pack 전환의 UI·API 집행 위치와 no-domain-write 계약이 정의된다.
- [ ] 생년월일·신분증·보호자 정보·IP geolocation을 수집하지 않는다.
- [ ] 차단 시 owner 노출·analytics·domain row가 없고, 기존 private-test row는 production 자격으로 자동 승격되지 않는다.
- [ ] accidental-minor 신고의 capability 중심 식별, Asia/Seoul 3영업일 접수, `target_located_at`부터 live 72시간, hard delete부터 backup 30일 기준이 명시된다.
- [ ] backup 밖 최소 45일 삭제 ledger와 격리 restore·ledger 재적용·erased subject 0·분기 drill·실패 시 beta 중단 기준이 명시된다.
- [ ] #7은 미성년자 삭제 상한을 완화할 수 없고 #16은 direct API 우회를 차단해야 한다.
- [ ] 법률 검토가 2026-05-19 시행 현행 시행령 제17조의2를 포함한 현재 법령 버전을 확인하고, 서면 PASS·privacy 연락 채널·retention/implementation evidence가 production beta 차단점으로 남는다.
- [ ] 활성 SSOT의 production beta 문구가 이 결정과 일치한다.

## 테스트 계획

- `python3 scripts/verify_project.py`
- `rg -n "만 19세|대한민국|72시간|30일|45일|법정대리인|삭제 ledger" docs/product docs/engineering/p0-development-plan.md docs/specs/issue-6.md`
- 제품 가드레일 리뷰: 핵심 루프를 막는 위치가 생성 직전 한 번뿐인지, 방문자 답변 후 전환이 같은 owner gate를 재사용하는지 확인한다.
- 개인정보 경계 리뷰: blocked attempt·신고 처리에서 생년월일, 신분증, 보호자 정보, underage analytics를 만들지 않는지 문서 대조한다.
- 독립 스펙 리뷰에서 P0/P1 0을 확인한다.
- clean final SHA에서 `./scripts/run-ai-verify --mode full`을 한 번 실행한다.

## 분석과 관측성

- 연령 통과·차단 자체를 제품 analytics event로 기록하지 않는다.
- 운영에 필요한 집계가 생기더라도 개인·capability·링크와 연결하지 않은 단기 aggregate는 별도 재승인 후 추가한다.
- blocked attempt의 입력값과 추정 연령을 application log에 남기지 않는다.
- 미성년자 신고 접수 기록은 원본 답변을 복사하지 않고 처리 상태·기한·최소 요청 식별자만 가진다.

## 개인정보와 악용 방지

- 자기확인은 강한 신원확인이 아니므로 거짓 진술 가능성이 남는다. 대신 정확한 생년월일과 신분증을 새로 모으지 않고, 모든 생성 API에서 같은 gate를 강제하며, 의심·신고 데이터는 빠르게 제거한다.
- 직접 API 호출이 UI를 우회하지 못하게 서버가 exact boolean을 검증해야 한다.
- 차단 여부를 owner에게 알리지 않아 미성년자 여부 추정이나 관계 압박에 쓰이지 않게 한다.
- capability가 없는 문의에서 광범위한 데이터 탐색을 금지해 다른 응답자의 프라이버시를 보호한다.
- 만 19세 미만을 향한 팩·마케팅·학교 배포를 하지 않는다.

## 롤아웃과 복구

- #6은 정책만 확정하고 현재 런타임 동작을 바꾸지 않는다.
- #16 배포 전 production beta는 계속 닫혀 있다. 공개 테스트를 모집할 때는 만 19세 이상만 대상으로 명시한다.
- #16은 기존 private-test row를 초기화하거나 명시적 재확인 전이로만 승격하고, silent grandfathering을 하지 않는다.
- age gate 장애가 생기면 fail-open하지 않는다. 새 play/response 생성만 닫고 기존 유효 capability의 철회·삭제 경로는 유지한다.
- backup restore는 traffic 격리와 삭제 ledger 재적용, erased subject 0 확인이 없으면 production으로 승격하지 않는다.
- 만 19세 미만 허용, 보호자 동의 도입, 해외 출시, 강한 age assurance 도입은 별도 decision log와 법률 재검토가 필요하다.

## 스펙 검토

Reviewer Agent: issue6_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- 자기확인만으로 충분한 age assurance인지에 대한 법률 판단은 production beta 전 서면 검토가 필요하다. 책임자는 GYEOP Privacy Owner이며, 부족하다는 결론이면 #16 구현 전에 stronger assurance 또는 beta 중단을 선택한다.
- production privacy 연락 채널의 실제 주소와 담당자 이름은 #8 운영 환경 확정과 함께 채우되, 채널이 없으면 production beta를 열지 않는다.
- provider backup이 30일 상한과 backup 밖 45일 삭제 ledger·격리 restore drill을 보장하는지는 #7에서 확인하며, 보장하지 못하면 provider/backup 구성을 바꾸기 전까지 production beta를 열지 않는다.
