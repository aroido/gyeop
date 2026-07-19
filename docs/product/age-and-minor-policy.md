# GYEOP 최소 이용 연령·미성년자 데이터 정책 v1

> 결정일: 2026-07-19  
> 적용 범위: 대한민국 우선 private MVP 모집과 production beta  
> 구현 추적: #16  
> 보관·backup 추적: #7

## 1. 한 문장 정책

GYEOP은 **대한민국에서 이용하는 만 19세 이상**만 주인과 방문자로 참여할 수 있다.

만 19세 미만은 보호자 동의 여부와 관계없이 이용할 수 없다. 법정대리인 동의 흐름을 만들지 않으며 보호자 개인정보도 수집하지 않는다. 해외 출시나 만 19세 미만 허용은 별도 제품·법률 재승인 사항이다.

## 2. 공식 근거와 제품 판단

- 대한민국 `개인정보 보호법` 제22조의2는 만 14세 미만 아동의 개인정보 처리에 동의가 필요한 경우 법정대리인 동의와 확인을 요구한다.
  - https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0022&lsiSeq=270351&urlMode=lsScJoRltInfoR
- 대한민국 `개인정보 보호법 시행령` 제17조의2는 법정대리인 동의 확인 방법을 정한다. 2026-07-19에 `[시행 2026. 5. 19.] [대통령령 제36340호]` 현재 통합 조문을 확인했다.
  - https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=143411
- 대한민국 `민법` 제4조는 사람이 19세로 성년에 이른다고 정한다.
  - https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1026056227

만 19세 제한은 관계 맥락, 타인에 대한 판단, 외부 공유 링크를 다루는 초기 서비스에서 모든 법적 미성년자를 의도적으로 제외하기 위한 보수적인 제품 결정이다. 위 공식 근거와 이 문서는 법률 자문을 대신하지 않는다.

## 3. 최소수집 연령 확인

GYEOP은 정확한 생년월일을 받지 않고 domain data를 만들기 직전 다음 자기확인을 한 번 받는다.

- 제목: `겹은 만 19세 이상만 이용할 수 있어요`
- 설명: `지금은 대한민국에서 이용하는 성인만 참여할 수 있어요. 생년월일이나 신분증은 받지 않아요.`
- 확인 항목: `만 19세 이상이며 대한민국에서 이용 중이에요.`
- 진행 버튼: `확인하고 계속`
- 미해당 선택: `아직 만 19세가 아니에요`
- 차단 제목: `지금은 겹을 이용할 수 없어요`
- 차단 설명: `답변이나 프로필은 저장되지 않았어요.`

확인 항목은 기본 선택하지 않는다. 미해당 선택은 저장 없이 차단 설명과 홈 복귀만 제공한다. 생년월일, 주민등록번호, 신분증, 휴대전화 본인인증, 보호자 성명·연락처, IP 기반 국가 추론을 수집하지 않는다.

## 4. 주인·방문자 집행 경계

| 역할         | 화면 경계                    | 서버 생성 경계                                              | 확인 실패 시 만들지 않는 것                                              |
| ------------ | ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 새 주인      | 팩 선택 뒤 첫 질문 전        | `POST /api/plays` 새 play branch                            | play, cookie, answer, analytics, rate-limit domain row                   |
| 초대 방문자  | 초대 맥락 뒤 관계 선택 전    | `POST /api/invites/[publicId]/responses` 새 response branch | response, cookie, assignment, event, link consume, rate-limit domain row |
| 새 주인 전환 | `나도 이 팩으로 시작하기` 뒤 | 위 owner 생성 경계 재사용                                   | 별도 우회 play                                                           |

#16은 두 생성 요청에서 exact boolean `eligibilityConfirmed: true`를 요구한다. 누락, `false`, coercion, unknown field는 domain RPC·analytics·rate-limit domain row보다 먼저 거부한다. gate를 통과해 생성한 유효 capability는 매 카드마다 다시 확인하지 않는다.

정책 이전 private-test row는 production 자격으로 자동 승계하지 않는다. production beta 전에 초기화하거나 #16의 명시적 재확인 전이로만 승격한다. acknowledgement를 저장해야 한다면 통과 사실과 server timestamp만 허용하고 정확한 나이·생년월일은 저장하지 않는다.

## 5. 차단과 개인정보 노출 금지

- 차단된 시도는 domain row, cookie, 관계, 답변, product analytics event를 만들지 않는다.
- application log에 `underage`, 추정 연령, 입력 문구를 남기지 않는다.
- owner나 링크 공유자에게 특정 방문자의 차단 사실을 알리지 않는다.
- 만 19세 미만을 향한 팩·마케팅·학교 배포를 하지 않는다.

## 6. 실수로 들어온 미성년자 데이터

- visitor는 유효한 비밀 관리 링크로 기존 철회 흐름을 사용한다.
- 신고 접수 시 신분증·생년월일·보호자 정보를 추가로 요구하지 않는다. 유효한 관리 capability, owner capability 또는 서비스가 발급한 안전한 요청 식별자로 대상 범위를 최소화한다.
- 대상이 안전하게 식별되면 UTC `target_located_at`을 기록하고 즉시 접근·공유를 차단한다. 그 시각부터 72시간 안에 live application data를 hard-delete한다.
- 일반 보관 정책이 더 짧으면 더 짧은 시한을 적용한다. 삭제된 데이터는 복원하지 않는다.
- backup 잔존은 `hard_deleted_at`부터 최대 30일이다.
- capability를 잃어 대상을 안전하게 특정할 수 없으면 다른 사람의 데이터를 탐색·공개하지 않는다. 확인 불가 사유와 최소 후속 조치만 접수 기록에 남긴다.
- `received_at`은 지원 시스템의 UTC instant다. 접수한 날의 다음 영업일부터 `Asia/Seoul`과 대한민국 공휴일 달력 기준 3영업일 안에 접수 응답한다.

## 7. backup 재등장 방지

#7은 application backup 밖에 최소 삭제 ledger를 둔다.

- 허용 필드: `subject_type`, domain-separated HMAC 대상 ID, key version, `hard_deleted_at`, `expires_at`.
- 금지 필드: raw 답변, 관계, 이메일, 생년월일, 신분증, 보호자 정보.
- 접근: GYEOP Privacy Owner와 승인된 restore operator만.
- 수명: 마지막 관련 backup 만료 뒤 7일 이상이며 최소 45일.

backup restore는 production traffic과 격리된 환경에서만 수행한다. restore 직후 ledger를 재적용해 일치 row를 hard-delete하고 대상 HMAC 재스캔 0건과 migration·보안 검증 PASS를 확인한 뒤에만 traffic을 연다.

production beta 전과 이후 분기마다 `격리 restore → ledger 재적용 → erased subject 0 → traffic-open 승인` drill 증거를 남긴다. ledger·key reader 누락, 대상 잔존, 격리 실패 중 하나라도 있으면 restore와 beta release를 중단한다.

## 8. 책임과 production beta gate

| 책임        | 역할                                             | 필수 증거                                                            |
| ----------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| 정책 승인   | GYEOP Product Owner                              | 만 19세·대한민국·무보호자 동의 결정                                  |
| 법률 검토   | 한국 개인정보 분야 변호사 또는 지정 Privacy Lead | 현행 법령 버전, 자기확인, 고지, accidental-minor 삭제 절차 서면 PASS |
| UI·API      | #16 구현 담당자                                  | direct API 우회, 기존 row, 접근성, no-domain-write 테스트 PASS       |
| 보관·backup | #7 정책 담당자                                   | live 72시간, backup 30일, ledger 45일, 분기 restore drill            |
| 문의 운영   | GYEOP Privacy Owner                              | 공개 연락 채널, 3영업일 접수·72시간 live 처리 runbook                |

다음 중 하나라도 없으면 production beta를 열지 않는다.

1. 2026-05-19 시행 현행 시행령 제17조의2를 포함한 한국 개인정보 법률 서면 검토 PASS.
2. #7의 live·backup·ledger·격리 restore 기준 승인.
3. #16의 owner·visitor UI/API 집행 PASS.
4. 공개 privacy 연락 채널과 incident owner 지정.
5. 개인정보 처리방침·이용 안내의 만 19세/대한민국, 무보호자 동의, 철회·삭제 문구 정합성.

## 9. 변경 통제

age gate 장애는 fail-open하지 않는다. 새 play/response 생성만 닫고 기존 유효 capability의 철회·삭제 경로는 유지한다.

만 19세 미만 허용, 보호자 동의 도입, 해외 출시, 신분증·본인인증 기반 stronger age assurance 도입은 별도 decision log와 법률 재검토 없이는 진행하지 않는다.
