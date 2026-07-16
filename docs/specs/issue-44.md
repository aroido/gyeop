# Issue 44 구현 스펙: GitHub Project 한국어 필드 자동 동기화 보강

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/44

## 목표

GitHub Issue의 `status:*`, `priority:*`, `type:*` label을 workflow source of truth로 유지하면서, 설정된 GitHub Project의 기본 `Status`와 한국어 `작업 상태`, `우선순위`, `작업 유형`을 task harness 실행 경계에서 멱등적으로 동기화한다.

## 범위

- `scripts/task-harness.mjs`
  - Project 설정, schema, item, source label을 검증하는 Project sync 경계를 추가한다.
  - `project-sync <issue-number>` 명령을 추가하고 `project-add`를 item 보장과 field sync까지 수행하도록 확장한다.
  - `status`, `start`, `resume`, `reconcile`, `close` 성공 경로에서 Project sync를 수행한다.
  - `doctor`가 설정된 Project의 read 권한과 schema를 mutation 없이 점검하게 한다.
  - 동기화 실패에 authoritative issue 상태, 이미 완료된 mutation, 복구 명령을 포함한다.
- `scripts/task-harness.test.mjs`
  - pure mapping·schema validation과 fake `gh project`·GraphQL readback 통합 테스트를 추가한다.
- `docs/engineering/github-task-workflow.md`, `README.md`, `.env.example`
  - Project #5 설정, 자동 동기화 시점, 실패·재실행 계약을 기록한다.
- `.codex/skills/gyeop-task/SKILL.md`, `.codex/skills/gyeop-task/references/review-gates.md`
  - Project가 선택적 synchronized view라는 규칙과 복구 명령을 반영한다.
- `.codex/skills/gyeop-issue-writer/SKILL.md`
  - `project-add`가 membership과 field sync를 함께 수행하는 등록·복구 계약을 반영한다.

## 제외 범위

- scheduler, daemon, webhook, cron, GitHub Actions 기반 주기 동기화
- GitHub Project automation rule 생성
- Project field나 option의 자동 생성·이름 변경
- 별도 상태 database, lock service, sync worker
- Project에서 issue label로의 역동기화 또는 Project를 workflow SSOT로 승격
- 기존 malformed `status:blocked` 이슈의 provenance 자동 추정·수정
- git이 추적하지 않는 과거 `docs/temp` 일괄 등록 script와 일회성 등록 artifact 수정
- 제품 UI, application API, Supabase schema, production 배포 변경

## SSOT

- `AGENTS.md`
- `.codex/AGENTS.md`
- `docs/product/core-feature-priority.md`
- `docs/engineering/github-task-workflow.md`
- `.codex/skills/gyeop-task/SKILL.md`
- `.codex/skills/gyeop-task/references/review-gates.md`
- `.codex/skills/gyeop-issue-writer/SKILL.md`
- `docs/specs/issue-40.md`
- `docs/specs/issue-42.md`
- `scripts/task-harness.mjs`
- `scripts/task-harness.test.mjs`
- GitHub Issue #44

## 사용자 흐름 영향

- 주인·방문자·새 주인의 제품 흐름은 바뀌지 않는다.
- Codex 운영자는 issue label을 한 번만 변경하고 Project의 한국어 보드 상태를 별도로 수동 편집하지 않아도 된다.
- Project sync가 실패해도 issue label과 안전하게 생성·복원된 Git worktree가 authoritative partial state로 남아 같은 명령 또는 `project-sync`로 복구할 수 있다.

## 디자인 영향

- 제품 화면과 design token 변경 없음.
- GitHub Project #5의 기존 field와 option 이름을 그대로 사용하며 새 field나 option을 만들지 않는다.

## API와 데이터 영향

- application API, database, auth, storage 변경 없음.
- GitHub REST issue API, 기존 `gh project` CLI, read-only GraphQL item field 조회를 사용한다.
- GitHub token이나 Project node ID를 저장소에 기록하지 않는다. 공개 설정값인 owner와 project number만 환경 변수와 문서에 둔다.
- Project field ID와 option ID는 실행할 때 exact name으로 조회하며 코드에 하드코딩하지 않는다.

## 구현 계획

1. Project source mapping을 pure function으로 만든다.
   - 열린 이슈는 기존 `workflowState`로 exact managed status와 blocked provenance를 검증한다.
   - `priority:*`와 `type:*`는 Project sync 경계에서만 판정해 Project 미설정 기존 workflow를 새로 차단하지 않는다.
   - 각 metadata group에 known label이 하나면 mapping하고, 없으면 해당 Project field를 clear한다. 둘 이상이거나 알 수 없는 prefixed label이면 Project mutation 전에 실패한다.
   - 명시적 `project-sync`는 open issue와 exact workflow state만 허용한다. closed issue는 PR 번호 없는 명령으로 완료를 추정하지 않고 Project mutation 전에 거부한다. 명시적 `project-add`는 closed issue에서 membership만 보장하고 field는 수정하지 않는다.
   - mapping은 다음과 같이 고정한다.

| issue label 또는 완료 증거 | 기본 `Status` | `작업 상태`      |
| -------------------------- | ------------- | ---------------- |
| `status:backlog`           | `Todo`        | `선행 작업 대기` |
| `status:ready`             | `Todo`        | `준비`           |
| `status:spec`              | `In Progress` | `스펙 작성`      |
| `status:implementing`      | `In Progress` | `구현 중`        |
| `status:qa`                | `In Progress` | `품질 검증`      |
| `status:blocked`           | `In Progress` | `차단`           |
| 검증된 `close` 완료        | `Done`        | `완료`           |

- `priority:p0|p1|p2`는 `P0|P1|P2`, `type:planning|design|frontend|backend|data|safety|qa|ops`는 `기획|디자인|프론트엔드|백엔드|데이터|안전|QA|운영`으로 mapping한다.

2. 설정과 schema를 field mutation 전에 고정한다.
   - `GYEOP_GITHUB_PROJECT_NUMBER`가 없으면 automatic hook은 `{ configured: false, status: "skipped" }`로 끝나고 `gh project`·GraphQL 호출을 만들지 않는다.
   - 명시적 `project-add`와 `project-sync`는 Project 설정이 없으면 기존처럼 non-zero로 실패한다.
   - project owner는 current `repo` owner와 같아야 하며 positive integer project number만 허용한다.
   - `gh project view` 결과의 owner와 number를 설정과 대조하고 반환 ID가 유효한 ProjectV2 node ID인지 확인한다. read-only GraphQL access query에서 `__typename=ProjectV2`, 같은 owner·number·ID, `viewerCanUpdate=true`를 확인하고 이 ID만 edit에 사용한다.
   - `gh project field-list --limit 100` 결과에서 `Status`, `작업 상태`, `우선순위`, `작업 유형`이 exact `ProjectV2SingleSelectField`로 각각 하나인지 확인한다.
   - field-list의 `totalCount`와 실제 수집 개수가 같아야 한다. 현재 값뿐 아니라 이 스펙의 모든 required option name이 각 field에 정확히 하나씩 있는지 확인한다. schema가 하나라도 다르거나 조회가 잘렸으면 item add·field edit를 시작하지 않는다.
   - `doctor`는 Project가 설정됐을 때 이 view·field schema·`viewerCanUpdate` 검사를 별도 check로 실행한다. 미설정이면 기존 `skipped`를 유지하며 update 권한이 없으면 doctor check가 fail한다.
3. Project membership을 전체 조회하고 명시적 명령에서만 item을 추가한다.
   - operation name을 고정한 read-only GraphQL query와 cursor로 source issue의 `projectItems(includeArchived: true)` 모든 page를 mutation 전에 수집한다.
   - exact Project item이 0개면 automatic hook과 `project-sync`는 field mutation 없이 실패하고 `scripts/task-harness project-add <issue>`를 복구 명령으로 남긴다. 완료 sync라면 그 뒤 `scripts/task-harness close <issue> <pr>`까지 이어서 재실행하게 한다. 정확히 1개면 재사용하며, 2개 이상이거나 archived item이면 실패한다.
   - `project-add`만 exact Project item이 0개일 때 `gh project item-add`를 실행한다. 이미 1개면 add를 생략한다. open issue는 이어서 field를 sync하고, closed issue는 membership 성공만 보고하며 field를 읽어 완료값으로 추정하거나 수정하지 않는다.
   - item-add JSON의 item ID, type, issue URL이 source issue와 맞는지 검증한다. command가 non-zero이거나 응답을 잃어도 같은 실행에서 membership 전체를 다시 조회해 exact active item 1개가 확인되면 계속하고, 확인되지 않으면 원래 오류와 조회 결과를 함께 보고한다.
   - item을 확정한 뒤 별도 GraphQL query로 item의 project, archived 여부, issue content와 최대 100개 single-select field value를 읽는다. pagination이 남으면 실패한다.
   - item이 다른 project·repository·issue를 가리키거나 archived됐거나 managed field value가 중복되면 edit 전에 실패한다.
4. 다른 값을 가진 managed field만 수정하고 최종 상태를 확인한다.
   - exact project, item, field, option ID로 `gh project item-edit`를 한 field씩 호출한다. metadata label이 없으면 `--clear`만 사용한다.
   - 담당자, milestone, linked PR 등 네 managed field 밖의 값은 읽거나 수정하지 않는다.
   - membership add와 각 field edit 직전에 `assertOriginRepo`와 fresh issue snapshot을 다시 확인한다. source나 origin이 바뀌면 다음 Project mutation을 실행하지 않는다.
   - 네 edit는 transaction이 아니므로 중간 실패나 응답 유실 때 rollback하지 않는다. edit command가 non-zero여도 best-effort final Project readback과 issue GET을 실행해 실제 확인된 field만 `confirmedChangedFields`에 넣는다.
   - final issue GET에 성공한 경우에만 그 값을 `authoritativeStatus`로 부른다. 재조회 실패면 `authoritativeStatus: null`, `lastConfirmedStatus`, `expectedStatus`를 분리한다.
   - 열린 existing item 실패는 `scripts/task-harness project-sync <issue>`, 열린 missing item은 `scripts/task-harness project-add <issue>`를 복구 명령으로 남긴다. completed existing item 실패는 검증된 PR number의 `scripts/task-harness close <issue> <pr>`, completed missing item은 `project-add` 뒤 같은 `close`를 수행하는 ordered recovery commands를 남긴다.
   - 마지막 GraphQL readback에서 네 field가 desired value와 정확히 같은지 확인한 뒤 issue를 다시 읽어 최초 workflow·metadata label snapshot과 같은지 확인한다. source drift, GraphQL `errors`, readback mismatch는 성공으로 보고하지 않는다.
5. 상태 전이 뒤에만 sync hook을 연결한다.
   - `transitionIssue`는 label PUT 응답과 즉시 GET이 target exact state임을 확인한 뒤 Project sync를 호출한다.
   - same-status 재실행도 label PUT 없이 source·target gate를 다시 통과한 뒤 Project sync를 수행한다.
   - Project sync 뒤 성공 반환 직전에 fresh issue로 `pinnedTransitionState`와 기존 source·target gate를 다시 실행한다. predecessor reopen, dirty checkout, reviewed spec drift가 생기면 label이나 Project를 rollback하지 않고 partial failure로 보고한다.
   - Project 실패 시 label을 rollback하지 않고 `workflowChanged`, `authoritativeStatus`, `projectSynced: false`, changed fields, recovery command를 포함해 non-zero로 끝낸다.
   - `status`, ready→spec `start`, backlog→ready `reconcile`은 중앙 transition 경계를 재사용한다.
   - `reconcile`의 개별 Project 실패는 해당 item을 `promoted`와 중복 기록하지 않고 `errors`에만 넣으며 다른 안전한 item을 계속 처리한다. 이미 ready가 된 item은 다음 backlog 검색에 없으므로 error에 `workflowChanged: true`, `authoritativeStatus: status:ready`, `projectSynced: false`와 함께 missing item이면 `project-add`, existing item field 실패면 `project-sync`를 포함한다.
6. transition을 거치지 않는 재실행 경계를 보강한다.
   - 이미 `status:spec`인 `start`는 canonical clean task checkout gate를 통과한 뒤 Project sync를 수행하고, sync 뒤 같은 status·checkout gate를 다시 확인한 다음에만 성공한다. ready에서 새로 시작한 경로도 sync 뒤 exact spec checkout을 재확인한다.
   - `resume`은 기존 immutable GitHub·origin·ref·registry·worktree 검증과 필요한 Git 복원이 끝난 phase에서 현재 exact issue state를 Project에 sync한다. sync 뒤 성공 JSON 직전에 같은 origin config, remote/local SHA, registry, target checkout, exact issue state, merged PR 부재를 다시 검사한다.
   - resume sync 실패나 sync 중 snapshot drift 시 생성·복원된 Git state를 삭제하지 않고 기존 resume diagnostics와 Project recovery를 함께 남긴다.
   - Project hook은 resume의 Git snapshot 판정이나 status를 변경하지 않는다.
7. 완료 sync는 기존 완료 증거 뒤에만 실행한다.
   - `close`는 merged PR 관계를 검증하고 deterministic completion marker를 보장한 뒤 issue close PATCH를 수행한다.
   - PATCH 또는 이미 closed 상태 뒤 final GET으로 issue가 closed임을 확인한 다음에만 `Done`과 `완료`를 sync한다.
   - Project 실패 뒤 `close <issue> <pr>`를 재실행하면 marker나 close PATCH를 중복하지 않고 merged 관계·closed GET을 다시 검증한 뒤 completed mapping만 복구한다. 일반 `project-sync`는 closed issue를 거부한다. membership까지 없으면 `project-add <issue>`로 membership만 보장한 뒤 같은 `close`를 재실행한다.
8. CLI와 운영 문서를 갱신한다.
   - usage에 `project-sync <issue-number>`를 추가한다.
   - `.env.example`과 workflow 예시를 `aroido/gyeop`, owner `aroido`, Project `5`로 바로잡는다.
   - 문서와 repo-local task·issue writer skill은 label SSOT, configured-only hook, 명시적 membership 추가, partial failure와 재실행 절차를 같은 표현으로 기록한다.

## 완료 기준

- open issue의 `project-add` 한 번으로 exact Project item membership과 네 managed field가 현재 issue label에 맞는다. closed issue의 `project-add`는 membership만 보장한다.
- `project-sync`는 existing item, 이미 맞는 field, clear된 optional metadata에서 안전하게 재실행되며 다른 Project field를 변경하지 않는다.
- `project-sync`는 open exact workflow issue만 처리하며 closed issue와 missing membership은 field write 0건으로 거부한다. closed `project-add`는 membership만 보장하며 completed field 복구는 그 뒤 verified `close` 재실행으로 결정적이다.
- status 6종, completed, priority 3종, type 8종 mapping이 focused test로 고정된다.
- label PUT 응답과 즉시 GET 확인 전에 Project mutation이 발생하지 않는다.
- same-status `status`, existing spec `start`, existing worktree `resume`, completed `close` 재실행이 stale Project를 복구한다.
- reconcile 승격 뒤 `준비`와 `Todo`가 반영되고 개별 Project 실패 뒤 다른 안전한 candidate 처리를 계속한다.
- reconcile의 label 성공·Project 실패 candidate는 `errors` 한 곳에만 authoritative status와 원인별 `project-add|project-sync` repair command를 남긴다.
- Project가 미설정이면 기존 status·start·resume·reconcile·close 동작과 GitHub 호출이 회귀하지 않는다.
- wrong owner/project, invalid field type, field·option 누락/중복, schema·membership pagination truncation, item mismatch/archive/duplicate, duplicate/unknown metadata는 field edit 전에 실패한다.
- item-add 응답 유실은 same-run membership 재조회로만 확정하고, item-edit 중간 실패·응답 유실, final GraphQL mismatch, source label·origin drift를 성공으로 보고하지 않으며 label과 Git partial state를 rollback하지 않는다.
- 부분 field write 뒤 같은 명령 또는 `project-sync` 재실행으로 현재 label 기준 네 field가 수렴한다.
- issue closed GET 전에는 `Done`이나 `완료`를 쓰지 않는다.
- `resume`과 `start`는 Project 호출 뒤 기존 exact Git·issue gate를 다시 통과해야 성공한다.
- configured `doctor`는 Project update 권한과 exact schema 결과를 보고하고, 미설정 `doctor`는 Project 호출 없이 skipped를 보고한다.
- Project sync 뒤 모든 transition은 기존 source·target gate를 다시 통과해야 성공하며 predecessor reopen, dirty checkout, reviewed spec drift를 허위 성공으로 보고하지 않는다.
- 기존 75개 task harness 회귀 테스트와 spec·QA·PR·merge·cleanup gate가 그대로 통과한다.
- `node --test scripts/task-harness.test.mjs`와 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- pure mapping: status 6종, completed, priority 3종, type 8종, optional clear, duplicate·unknown metadata
- schema validation: wrong owner/number/node, `viewerCanUpdate=false`, duplicate/missing/wrong-type field, duplicate/missing option, field-list truncation, dynamically changed IDs, configured doctor
- item boundary: membership pagination, missing hook membership, open·closed add/reuse, closed add field-write 0건, add 응답 유실 뒤 same-run 재조회, malformed add response, wrong content, archived/duplicate item, GraphQL errors/pagination/duplicate field value
- transition ordering: label PUT·GET 뒤 Project call, same-status no label PUT + sync, blocked mapping, Project 미설정 call 0건
- transition postflight: Project 호출 중 predecessor reopen, dirty checkout, reviewed spec drift 뒤 gate 실패와 label·Project no rollback
- partial failure: first~fourth edit failure, response loss, best-effort readback, label drift와 final GET 실패의 authoritative/last-confirmed 분리, rerun convergence와 no rollback
- start: new ready→spec sync, Project 실패 뒤 existing spec worktree 재실행 복구, sync 중 checkout·status drift, worktree add 중간 실패 시 Project call 0건
- resume: reused/local-restored/remote-restored 성공 뒤 sync, Project 호출 중 origin/ref/registry/worktree/issue/merged-PR drift, Git preflight·postflight failure 시 Project call 0건, sync failure 뒤 Git state 보존
- reconcile: 승격 sync, 한 item Project error 뒤 계속 처리, result 배열 단일 분류, missing=`project-add`·existing=`project-sync` repair command
- close: marker→close→closed GET→completed sync 순서, closed project-sync 거부, missing membership의 closed project-add→close 2단계 복구, 이미 closed·부분 실패 close 재실행, close 실패 시 Project call 0건
- Project 미설정 status·start·resume·reconcile·close 각각에서 Project·GraphQL call 0건
- Project 미설정 `project-add`·`project-sync`는 non-zero이고 Project·GraphQL call 0건
- 실제 smoke: QA 단계에서 Project 설정과 `scripts/task-harness project-sync 44`를 실행한 뒤 Project #5가 `Status=In Progress`, `작업 상태=품질 검증`, `우선순위=P0`, `작업 유형=운영`인지 read-only GraphQL로 재확인하고 command와 결과를 QA artifact에 기록
- `node --test scripts/task-harness.test.mjs`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 제품 analytics와 funnel event 변경 없음.
- 성공 JSON은 `configured`, Project/item ID, desired/changed field name, `projectSynced`를 포함하되 token과 query payload는 포함하지 않는다.
- partial error JSON은 `workflowChanged`, `authoritativeStatus` 또는 `null`, `lastConfirmedStatus`, `expectedStatus`, `projectSynced: false`, readback으로 성공 확인한 field, ordered recovery command를 포함한다.

## 개인정보와 악용 방지

- 제품 개인정보 처리 변경 없음.
- `gh`의 기존 사용자 인증만 사용하고 token·secret을 stdout, error, file에 남기지 않는다.
- project owner·number·repository·issue URL·item content·field ID를 검증해 다른 organization, project, issue 또는 field를 수정하지 않는다.
- Project 값은 workflow gate에 사용하지 않아 stale 또는 수동 편집된 view가 issue label 전이를 승인하지 못한다.

## 롤아웃과 복구

- migration과 feature flag는 필요 없다.
- Project number가 설정된 실행에서만 hook을 활성화한다. 미설정 환경은 기존 behavior를 유지한다.
- 열린 이슈 동기화가 중간에 실패하면 issue label·Git state를 보존하고 existing item은 `project-sync`, missing membership은 `project-add`를 실행한다. completed missing membership은 closed `project-add`로 membership만 복구한 뒤 `close <issue> <pr>`를 재실행한다. 네 field는 current label 또는 검증된 완료 증거를 기준으로 수렴시키며 rollback하지 않는다.
- 코드 회귀가 있으면 PR을 revert해 기존 수동 Project view로 돌아갈 수 있다. issue label과 기존 task harness workflow는 계속 SSOT로 남는다.

## 스펙 검토

Reviewer Agent: project_sync_safety, project_sync_tests, project_sync_scope
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- GitHub Project field write는 원자적이지 않고 compare-and-swap을 지원하지 않는다. source와 final readback 재검증으로 drift를 감지하지만 마지막 read 뒤의 수동 edit는 다음 hook 또는 `project-sync`로 수렴시키는 잔여 위험이다.
- `gh project item-add`가 item 추가 뒤 응답을 잃으면 같은 실행의 membership 재조회로 exact active item 하나인지 확인한다. 확인할 수 없으면 자동 삭제하지 않고 실패하며 다음 `project-add` 재실행으로 수렴한다.
- Project item GraphQL read는 첫 100개 field value만 허용하고 다음 page가 있으면 누락된 값을 추정하지 않고 실패한다. 현재 Project field 수는 이 한도보다 작다.
- 기존 malformed blocked 이슈의 provenance는 제품·운영 판단 없이 추정할 수 없으므로 이번 이슈에서 자동 고치지 않는다.
- 구현 전 외부 블로커와 미결정 제품 결정은 없다.
