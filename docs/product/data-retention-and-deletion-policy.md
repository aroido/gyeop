# GYEOP 데이터 보관·파기 정책 v1

> 결정일: 2026-07-20
> 적용 범위: 대한민국 우선 비공개 MVP와 production beta 후보
> 제품 승인안: https://github.com/aroido/gyeop/issues/7#issuecomment-5016965438
> Product Owner 승인 기록: https://github.com/aroido/gyeop/issues/7#issuecomment-5017543427
> 구현 추적: #32, #33

## 1. 한 문장 정책

GYEOP은 제품 목적에 필요한 최소 기간만 데이터를 보관하고, 접근 종료 또는 보유 목적 종료 시점부터 운영 DB는 최대 24시간, backup은 hard-delete부터 최대 30일 안에 복구 불가능하게 제거한다.

개인정보보호법 제21조의 목적 종료 뒤 파기 원칙과 개인정보보호법 시행령 제16조의 복구·재생 불가능한 파기 방법을 기준으로 삼는다.

- 개인정보보호법 제21조: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1020398651
- 개인정보보호법 시행령 제16조: https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0016&lsiSeq=286175&urlMode=lsScJoRltInfoR
- 개인정보보호위원회 개인정보 처리방침 작성지침: https://m.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS217&etc1=%ED%98%84%EC%9E%AC+%EC%95%88%EB%82%B4%EC%84%9C&mCode=G010030020

이 문서는 제품·운영 정책이며 법률 자문을 대신하지 않는다. 현행 한국 개인정보 법률 서면 검토와 provider backup 증빙이 없으면 production beta를 열지 않는다.

## 2. 공통 시계와 우선순위

- 모든 시각은 DB UTC `timestamptz`와 서버 시각으로 판정한다. 브라우저 시각은 사용하지 않는다.
- `eligible_at`은 데이터가 hard-delete 대상이 되는 시각이다. cleanup은 `eligible_at`부터 24시간 안에 운영 DB 삭제를 완료해야 한다.
- 여러 종료 조건이 있으면 가장 먼저 도래한 시점을 적용한다. 상위 row 삭제는 종속 데이터의 더 긴 기간을 보장하지 않는다.
- logical expiry 뒤 API·UI 접근은 즉시 거부한다. 24시간은 추가 접근 기간이 아니라 물리 cleanup 상한이다.

## 3. 데이터별 보관·삭제 기준

| category | 접근·보유 종료와 `eligible_at` | 운영 DB hard-delete 상한 | backup 잔존 상한 |
|---|---|---:|---:|
| 비로그인 owner draft·completed play·self answer·profile | capability가 검증된 마지막 owner 활동 `last_active_at + 7일` | 24시간 | hard-delete + 30일 |
| 로그인 owner 계정·play·self answer·profile | `owner_last_active_at + 1년` 또는 계정 삭제 요청 중 먼저 온 시점 | 24시간 | hard-delete + 30일 |
| public link | `created_at + 30일`, owner disable/rotate, parent play 삭제 중 먼저 온 시점 | capability material 24시간; 최소 FK tombstone은 종속 응답 종료 뒤 24시간 | hard-delete + 30일 |
| 1:1 link | `created_at + 7일`, 유효 제출 완료, owner disable/rotate, parent play 삭제 중 먼저 온 시점 | capability material 24시간; consumed tombstone은 종속 응답 종료 뒤 24시간 | hard-delete + 30일 |
| 미제출 visitor draft·answer·assignment·session | `max(created_at, last_active_at) + 24시간` | 24시간 | hard-delete + 30일 |
| submitted visitor response·answer·assignment | `submitted_at + 1년`, owner play 삭제, visitor 철회 중 먼저 온 시점 | 24시간 | hard-delete + 30일 |
| withdrawn response tombstone | `withdrawn_at + 30일` | 24시간 | hard-delete + 30일 |
| raw analytics event | `occurred_at + 30일`; source 삭제·철회 시 subject와 연관 property는 즉시 제거 | 24시간 | hard-delete + 30일 |
| 비식별 집계 지표 | `aggregated_at + 1년` | 24시간 | hard-delete + 30일 |
| rate-limit bucket | `expires_at + 24시간` | 24시간 | hard-delete + 30일 |
| 미귀속 Auth registration | `auth user created_at + 7일` adoption grace 종료 | 앱 DB state·job UID와 Auth provider 계정 모두 `eligible_at + 24시간` | 각 hard-delete + 30일 |
| Auth deletion call permit | `max(acquired_at + 5분, lease_until)` | 24시간 | hard-delete + 30일 |
| completed owner-request receipt·recovery tombstone | 아래 6절의 completed expiry | 24시간 | hard-delete + 30일 |
| terminal notification 직접 ID·request fingerprint | terminal 전이 또는 철회·owner 삭제 예외 transaction | 같은 transaction에서 `NULL` | backup에서 마지막 식별 상태 + 30일 |
| terminal notification 최소 job tombstone | `terminal_at + 24시간` | 24시간 | hard-delete + 30일 |
| unreferenced notification payload version | 모든 참조 job tombstone 삭제 뒤 | 24시간 | hard-delete + 30일 |

비공개 owner의 활동은 capability를 검증한 성공한 owner read/save/complete/resume과 link create·rotate·disable만 갱신한다. visitor 접근, OS 공유·복사, cron과 실패 요청은 갱신하지 않는다.

visitor draft의 활동은 관계·시점 확정이나 draft answer save처럼 capability를 검증해 DB를 바꾼 성공 mutation만 갱신한다. read, 동일 값 retry, 실패 요청, owner·cron 접근은 갱신하지 않는다. 제출 뒤에는 비교·프로필 조회로 `submitted_at`을 연장하지 않는다.

submit은 `last_active_at = submitted_at`, `session_expires_at = submitted_at + 24시간`을 마지막으로 기록한다. submitted 응답 본문은 1년 상한까지 유지할 수 있지만 만료된 `session_token_hash`는 `session_expires_at`부터 24시간 안에 `NULL` 처리한다. 비교·선택 2장 read/write는 session expiry를 연장하지 않는다.

로그인 owner 활동은 인증된 owner의 account/play/profile 성공 read 또는 owner save/complete/link create·rotate·disable만 갱신한다. visitor·notification·cron은 갱신하지 않는다.

## 4. 공유 링크

- public link 기본 만료는 발급 후 30일이다. 여러 visitor가 사용할 수 있지만 만료를 연장하지 않는다.
- 1:1 link 기본 만료는 발급 후 7일이며 첫 유효 제출과 같은 transaction에서 소비·비활성화한다.
- 완료·철회된 1:1 응답의 link는 다시 열지 않는다.
- disable·rotate는 기존 링크를 즉시 닫는다. rotate와 재발급은 새 public ID와 secret을 가진 새 row를 만들며 기존 권한을 되살리지 않는다.
- 만료·비활성 링크의 public lookup material과 secret hash는 24시간 안에 제거한다. submitted 응답 FK와 1:1 소비 불변식에 필요한 최소 tombstone만 종속 응답 보유 종료까지 유지한다.

## 5. visitor 철회와 최소 tombstone

철회 transaction은 집계에서 즉시 제외하고 answer·assignment·relationship·known-since·session token hash·management token hash를 제거한다.

30일 동안 허용하는 response tombstone은 아래 네 필드뿐이다.

- `response_id`
- `share_link_id`
- `status = withdrawn`
- `withdrawn_at`

연결 analytics event는 event ID·event name·occurred_at만 원래 30일 상한까지 유지할 수 있다. response/link/owner ID와 관계·시점 property는 철회 transaction에서 제거한다.

## 6. Auth registration·계정 삭제·receipt

- public OTP로 생성된 미귀속 Auth 상태는 UID와 `created_at`만 앱 DB에 저장한다. raw email 사본을 두지 않는다.
- adoption grace는 `auth user created_at + 7일`이다. grace 안 adoption과 cleanup enqueue는 같은 registration row lock으로 직렬화한다.
- grace 안 adoption이 먼저 commit되면 registration state를 제거한다. grace 경과·enqueue·deleting이 먼저 commit되면 claim과 복원을 영구 거부한다.
- grace 종료 cleanup은 registration state를 잠가 `auth_deletion_jobs(reason = unclaimed_auth)`를 idempotent하게 만들고 같은 transaction에서 registration state row를 삭제한다. 따라서 그 시점부터 앱 DB의 지정 UID는 active deletion job 한 곳에만 남는다.
- provider hard-delete 성공 finish는 deletion job의 `auth_user_id`와 proof를 `NULL` 처리한다. registration state enqueue와 provider finish를 합쳐 grace 종료 `eligible_at`부터 24시간 안에 앱 DB UID와 provider 계정을 모두 제거한다.
- `owner_request`와 `unclaimed_auth` 모두 deletion `eligible_at`부터 Auth provider hard-delete까지 최대 24시간이다. 실패는 capped retry로 계속 수렴시키며 권한·구성 오류 또는 3회 연속 실패는 즉시 escalation한다.
- owner 삭제 요청은 live application 접근을 즉시 차단하고 play·self answer·link·response와 application 식별자를 24시간 안에 제거한다.
- owner-request status receipt의 provisional expiry는 job `created_at + 48시간`보다 짧지 않다. 이는 Auth hard-delete 24시간 상한+24시간이다.
- nonterminal job에는 provisional expiry를 적용해 receipt를 거부하거나 cleanup하지 않는다. polling cookie는 DB expiry와 동기화한다.
- 완료 시 expiry를 `completed_at + 24시간` 이상으로 set/extend한다. 그 뒤 24시간 안에 recovery actor hash/version, receipt hash/version과 status tombstone을 같은 prune에서 삭제한다.
- status endpoint는 DB expiry에 맞춰 polling cookie를 연장하거나 삭제한다. 완료 안내에는 live/Auth 삭제 완료와 backup 잔존 최대 30일을 표시하고, receipt 만료 뒤에는 계정 존재 여부를 드러내지 않는 일반 완료 안내만 반환한다.
- active job의 지정 `auth_user_id` 외 recovery용 UID 사본과 raw receipt·proof·key는 DB·log에 저장하지 않는다.
- key reader는 해당 version을 참조하는 nonterminal 또는 유효 completed receipt가 0임을 drain query로 확인한 뒤 24시간 안에 config에서 retire하고 재배포한다.

permit은 job 완료·삭제와 무관하게 `max(acquired_at + 5분, lease_until)`까지 유지해 rolling 5분 call cap을 보존한다. 그 뒤 24시간 안에 bounded·idempotent prune한다.

## 7. notification cleanup 순서

1. delivered·failed·cancelled 전이는 `terminal_at`을 원자 기록하고 `owner_id`, `source_response_id`, keyed `request_fingerprint`를 같은 transaction에서 `NULL` 처리한다.
2. 정상 retention은 참조 notification job이 terminal이 되기 전에 source response를 삭제하거나 `source_response_id`를 비식별화하지 않는다.
3. visitor 철회·owner 삭제만 response 상태 전이, job cancel 요청, 직접 ID와 fingerprint 제거를 같은 transaction에서 수행하는 예외다.
4. 직접 ID를 지운 뒤에도 최소 job tombstone `id,status,terminal_at,payload_version_id,fingerprint_key_version`과 FK를 `terminal_at + 24시간`까지 유지한다.
5. 하한이 지난 job tombstone을 24시간 안에 삭제한다.
6. 모든 참조 job tombstone이 삭제된 payload version row만 unreferenced로 보고 24시간 안에 삭제한다.
7. 같은 drain query가 0임을 Operations Owner가 확인한 뒤 fingerprint key reader를 24시간 안에 keyring config에서 retire하고 호환 artifact를 재배포한다.

DB cleanup은 key material을 변경하지 않는다. key rotation은 add-reader→switch-writer→drain→retire 순서를 지키며 중간 rollback도 기존 job payload를 재생할 수 있어야 한다.

## 8. 승인 일일 peak와 cleanup 공정성

아래 수치는 초기 beta의 admission ceiling이다. production 사용량 예측으로 자동 상향하지 않는다.

| retention family와 포함 category | production 승인 일일 peak | 2배 staging fixture | 산정 근거 |
|---|---:|---:|---|
| owner/link: anonymous/authenticated play, public/1:1 link tombstone | 1,000 | 2,000 | 승인안의 owner play 상한을 family 전체에 적용 |
| visitor: draft, submitted, withdrawn tombstone | 5,000 | 10,000 | 승인안의 visitor response 상한을 family 전체에 적용 |
| analytics: raw event, 비식별 aggregate | 100,000 | 200,000 | 승인안의 analytics event 상한을 family 전체에 적용 |
| rate-limit bucket | 100,000 | 200,000 | visitor당 최대 20개 action/window bucket |
| Auth lifecycle: registration, `owner_request`, `unclaimed_auth`, permit, receipt | 100 | 200 | 승인안의 미귀속 Auth·owner 삭제 합산 상한 |
| notification lifecycle: job, payload version, key drain | 5,000 | 10,000 | 승인안의 terminal notification 상한을 family 전체에 적용 |

- family의 각 포함 category와 합계가 모두 같은 상한을 넘지 않아야 한다. 한 category의 빈 처리 몫만 같은 family 안에서 빌릴 수 있다.
- cleanup의 첫 round는 모든 활성 category를 한 chunk씩 시도하고, 남은 처리량은 oldest-due-first fair round-robin으로 빌려 쓴다.
- category 하나의 timeout·오류가 다른 category의 첫 chunk를 막지 않는다. 실패 category는 다음 일일 실행과 signed catch-up에서 같은 idempotent cleanup을 재시도해 overdue 0건까지 수렴한다.
- Auth deletion은 둘 다 due이면 `owner_request` 한 건을 먼저 보호하고 같은 round에서 `unclaimed_auth`도 최소 한 건 진행한다. 한 reason의 due row가 없으면 빈 몫을 다른 reason이 빌린다.
- release 기준은 모든 category와 Auth reason의 overdue 0건이다. 평균이나 합계로 한 reason의 지연을 숨기지 않는다.
- 일일 만료량이 승인 peak의 50%에 닿으면 Operations Owner가 같은 영업일에 경보와 추세를 검토한다.
- 70%에 닿거나 트래픽 가정이 바뀌면 Product Owner와 Operations Owner가 영업일 2일 안에 capacity를 재검토하고 release 전 새 상한을 승인한다.
- 24시간 hard-delete SLA 위반이 예상되면 4시간 안에 signed catch-up을 실행한다. 그래도 수렴하지 않으면 신규 owner/visitor 생성과 production release를 제한하고 같은 날 Privacy Owner에게 escalation한다.
- worker batch·RPS·비용은 #8·#29가 이 표의 2배 staging fixture를 24시간 안에 drain하는 증거로 별도 승인한다.

cleanup 로그·metric은 category, 처리 건수, `remaining_count`, `oldest_due_at`, allowlisted 오류 code만 포함한다. UID, email, 답변 값, token/hash 원문을 포함하지 않는다.

## 9. backup·restore·삭제 문의

- 운영 DB hard-delete 뒤 snapshot, point-in-time recovery와 provider 내부 backup의 개인정보 잔존 상한은 30일이다.
- backup은 일반 조회에 사용하지 않고 승인된 restore operator만 격리 환경에서 복구한다.
- restore 직후 삭제 ledger를 재적용하고 erased subject 재스캔 0건, migration·보안 검증 PASS 전에는 traffic을 연결하지 않는다.
- provider가 30일 이내 파기와 격리 restore를 증명하지 못하면 production beta를 열지 않는다.
- 삭제·보관 문의는 영업일 2일 안에 접수 사실을 회신하고 영업일 7일 안에 완료 또는 지연 사유·예정일을 회신한다.

## 10. 책임과 release gate

| 책임 | 역할 | 필수 증거 |
|---|---|---|
| 제품 정책 | GYEOP Product Owner | 기간·peak·변경 승인과 decision log |
| 개인정보 | 지정 Privacy Owner | 법률 검토, 문의·삭제 SLA, overdue escalation |
| cleanup 운영 | 환경별 Operations Owner | 일일 metric, catch-up, provider 삭제·drain 증거 |
| backup 복구 | 승인된 Restore Operator | 격리 restore·ledger 재적용·0건 검증 |

실제 담당자 이름과 연락 채널은 production beta 전에 release runbook에 지정한다. 한 사람이 여러 역할을 맡을 수 있지만 승인·실행·검증 기록은 구분한다.

다음 중 하나라도 없으면 production beta를 열지 않는다.

1. 현행 한국 개인정보 법률 서면 검토 PASS.
2. #16 연령 UI/API 집행 PASS.
3. provider backup 30일 이내 파기 증빙.
4. 2배 peak cleanup·Auth deletion·notification drain 검증.
5. 격리 restore→ledger 재적용→erased subject 0건 drill.
6. 공개 privacy 연락 채널과 이름이 지정된 Privacy/Operations Owner.

비공개 MVP에는 same-browser capability와 현재 핵심 루프만 활성화한다. Auth·email·notification·계정 삭제 후보는 위 release gate와 별도 production 재승인 전까지 비활성이다. 자동 cleanup #32가 배포되기 전 수집 데이터는 Operations Owner가 이 정책 상한 안에서 수동 정리하거나 테스트 DB를 폐기해야 하며 production traffic을 받지 않는다.

## 11. 변경 통제

기간을 늘리거나 backup 상한을 완화하는 변경은 Product Owner·Privacy Owner 재승인과 decision log가 필요하다. 기간을 줄이는 변경도 활성 capability·응답·notification 참조를 조기 절단하지 않는 migration/cleanup 증거를 먼저 갖춘다.

cleanup 실패는 fail-open하지 않는다. 삭제·철회 경로는 유지하되 새 데이터 생성과 release를 제한하고 overdue 0건으로 수렴한 뒤 다시 연다.
