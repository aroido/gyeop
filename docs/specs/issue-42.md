# Issue 42 구현 스펙: task harness 작업 재개·상태 전이·선행 이슈 승격 보강

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/42

## 목표

중단된 이슈를 기존 branch와 worktree에서 덮어쓰기 없이 이어받고, status gate 우회와 선행 이슈 종료 뒤 backlog 정체를 막는 재실행 가능한 task harness 경계를 제공한다.

## 범위

- `scripts/task-harness.mjs`
  - `resume <issue-number>` 명령과 branch/worktree 복원 판정을 추가한다.
  - 정확히 하나의 현재 `status:*` label, blocked 출처 label, 허용 transition table을 중앙에서 검증한다.
  - transition 목표 단계에 필요한 predecessor, checkout, reviewed spec gate를 적용한다.
  - `reconcile` 명령으로 선행 이슈가 모두 끝난 `status:backlog` 이슈만 `status:ready`로 승격한다.
  - `label-sync`가 `blocked-from:*` 관리 label도 생성·갱신하게 한다.
- `scripts/task-harness.test.mjs`
  - 실제 임시 Git repository와 fake GitHub runner로 resume, transition, reconcile의 성공·실패·재실행을 검증한다.
- `docs/engineering/github-task-workflow.md`
  - 중단 작업 복구, 허용 상태 전이, blocked 복귀, manual reconcile 운영 절차를 기록한다.
- `.codex/skills/gyeop-task/SKILL.md`
  - 기존 required flow에 `resume`과 `reconcile` 선택 지점을 반영한다.
- `.codex/skills/gyeop-task/references/review-gates.md`
  - 상태 전이와 복구가 기존 spec·QA·완료 gate를 우회하지 못하는 조건을 기록한다.

## 제외 범위

- GitHub Project V2 한국어 field 자동 동기화
- scheduler, daemon, webhook, cron 기반 자동 승격
- 여러 agent를 조정하는 전역 lock service 또는 별도 상태 database
- 삭제된 commit 복구, force push, branch 강제 이동
- dirty worktree 자동 stash·commit·폐기
- 완료된 이슈 재개와 병합된 branch 복원
- 제품 UI, application API, Supabase schema, production 배포 변경

## SSOT

- `AGENTS.md`
- `.codex/AGENTS.md`
- `docs/product/core-feature-priority.md`
- `docs/engineering/github-task-workflow.md`
- `.codex/skills/gyeop-task/SKILL.md`
- `.codex/skills/gyeop-task/references/review-gates.md`
- `scripts/task-harness.mjs`
- `scripts/task-harness.test.mjs`
- `docs/specs/issue-40.md`

## 사용자 흐름 영향

- 주인·방문자·새 주인의 제품 흐름은 바뀌지 않는다.
- Codex 운영자는 중단된 작업을 새로 시작하거나 branch를 덮어쓰지 않고 같은 이슈 맥락에서 이어갈 수 있다.
- backlog 승격은 사람이 `reconcile` 결과를 확인할 수 있는 명시적 실행으로만 일어난다.

## 디자인 영향

- 제품 화면과 디자인 token 변경 없음.
- CLI는 기존 JSON 성공·실패 형식을 유지하고 resume/reconcile 결과에 판정 근거와 다음 경로를 추가한다.

## API와 데이터 영향

- application API, database, auth, storage 변경 없음.
- GitHub REST issue·label read/write와 기존 사용자 `gh` 인증만 사용한다.
- 추가 영속 저장소를 만들지 않으며 current status는 GitHub issue label, branch/worktree 상태는 Git이 SSOT다.
- GitHub Project field는 읽거나 쓰지 않는다.

## 구현 계획

1. workflow state 판정을 중앙화한다.
   - managed status는 `status:backlog`, `status:ready`, `status:spec`, `status:implementing`, `status:qa`, `status:blocked`다.
   - blocked 출처는 `blocked-from:backlog`, `blocked-from:ready`, `blocked-from:spec`, `blocked-from:implementing`, `blocked-from:qa`다. `label-sync`가 이 label들을 관리한다.
   - open issue는 managed status가 정확히 하나여야 한다. `status:blocked`면 blocked 출처도 정확히 하나여야 하고, 그 외 status면 blocked 출처가 없어야 한다.
   - 누락·중복 status, 잘못된 blocked 출처 구조, closed issue, 알 수 없는 목표 label은 active workflow mutation 전에 실패한다. 단, 이미 병합된 PR의 `merge` 재실행은 기존 관계·SHA·병합 증거만 읽어 검증한 뒤 write 없이 성공하는 #40 recovery 예외를 유지한다.
   - `assertIssueStatus`, `start`, `status`, `resume`, `reconcile`, `pr`, `merge`는 이 중앙 판정을 재사용한다.
2. transition graph와 source·target gate를 고정한다.
   - 정상 전진은 `backlog -> ready -> spec -> implementing -> qa`만 허용한다.
   - backlog·active status에서 blocked로 갈 때 출처 label을 함께 남긴다. blocked에서는 기록된 출처 status로만 복귀할 수 있고 복귀 성공 시 출처 label을 제거한다. 따라서 `ready -> blocked -> qa` 같은 우회는 불가능하다.
   - `qa`에서 완료 또는 이전 status로의 label transition은 금지하고 완료는 기존 merge·close 증거만 사용한다.
   - ready gate는 본문에 선언된 predecessor가 모두 closed임을 요구한다. 독립 ready 이슈는 predecessor가 없어도 되지만, backlog 자동 승격을 담당하는 `reconcile`은 하나 이상의 predecessor를 별도로 요구한다. spec gate는 예상 task worktree의 exact branch·local ref·HEAD·clean을 요구한다. implementing·qa gate는 같은 checkout과 그 worktree 절대 경로의 reviewed spec PASS를 요구한다.
   - transition은 호출자가 지정한 `expectedSources` 또는 이미 target인 경우에만 진행한다. `start`는 `ready|spec`, reconcile item은 `backlog|ready`만 허용해 중간에 blocked 등으로 바뀐 상태를 덮어쓰지 않는다.
   - 같은 non-blocked status 재실행도 current structure와 해당 status의 source·target gate를 다시 검사한 뒤 PUT 없이 `changed: false`를 반환한다. predecessor가 다시 열린 ready, dirty worktree의 spec, invalid spec의 implementing·qa는 idempotent 성공이 아니다. 같은 `status:blocked` 재실행은 유효한 exact status·provenance 구조만 확인한다. 차단 유지가 원래 단계의 artifact 유효성을 주장하지 않기 때문이다.
3. label mutation을 검증 가능한 경계로 만든다.
   - source state와 gate를 preflight하고, label PUT 직전에 issue·predecessor·local artifact를 다시 읽어 동일한 expected source 또는 target인지 확인한다.
   - PUT은 비관리 label을 보존하면서 목표 status와 필요한 blocked 출처만 포함한다. API 응답과 즉시 GET을 모두 중앙 판정으로 검증해 기대한 exact state가 아니면 실패한다.
   - 응답 유실이나 최종 재조회 실패를 성공으로 보고하지 않는다. GitHub label API에는 CAS가 없으므로 PUT과 최종 GET 뒤의 동시 편집 가능성은 잔여 리스크로 기록한다.
4. 기존 command 경계에도 exact state를 연결한다.
   - `start`는 첫 Git mutation 전에 open issue의 exact `status:ready` 또는 재실행 가능한 exact `status:spec`, blocked 출처 부재, expected source gate를 확인한다. worktree add 뒤 status write가 실패하면 생성된 exact task worktree를 지우지 않고 다음 `start`/`resume`이 검증해 이어받게 한다.
   - `pr`은 full verify 전, verify 후, push 직전, PR 생성 직전과 신규·기존 draft의 ready-for-review write 직전에 open issue가 exact `status:qa`이고 blocked 출처가 없음을 확인한다. ready 직전 drift면 draft를 그대로 두고 실패한다. 최초 검사가 실패하면 verify·push·GitHub write는 0건이다.
   - 아직 병합되지 않은 PR의 `merge`는 CI 대기 전, CI 통과 후, `gh pr merge` 직전에 같은 exact QA state를 확인한다. 기존 base·head·merge SHA·CI gate와 함께 적용한다. 이미 병합된 PR은 기존 관계·head SHA·merge SHA 증거를 검증하고 issue가 closed여도 mutation 없이 `alreadyMerged: true`로 성공한다.
5. `resume <issue-number>`의 immutable preflight snapshot을 만든다.
   - issue는 open이고 exact `ready`, `spec`, `implementing`, `qa`, 유효한 `blocked` 중 하나여야 한다. exact workflow state 전체를 snapshot한다.
   - 같은 repository·base·head branch의 PR을 모든 page에서 조회하고 `merged_at`이 하나라도 있으면 재개를 거부한다.
   - 설정 repository와 origin의 모든 fetch·push URL이 같은 repository인지 확인하고, origin config 문자열 전체와 검증된 fetch URL을 snapshot한다. 이후 remote 조회·fetch는 `origin` 별칭이 아닌 이 URL을 사용한다.
   - 예상 branch는 `codex/issue-<number>`, 예상 target은 `canonicalPath(<worktreeRoot>/issue-<number>)`로만 계산한다. shared repository의 canonical top-level과 `--git-common-dir`도 snapshot한다.
   - local ref의 SHA 또는 absent, 검증 URL의 remote ref SHA 또는 absent, 전체 worktree registry, target `lstat` 상태를 snapshot한다. cleanup quarantine branch/config가 있거나 expected branch가 다른 worktree에 있으면 모호한 상태로 거부한다.
   - 등록 target은 canonical registry entry가 정확히 하나여야 하며 target의 `--show-toplevel`, `--git-common-dir`, branch, HEAD가 snapshot repository·target·local ref와 정확히 일치해야 한다. 미등록 target은 빈 directory, file, symlink, broken symlink를 포함해 filesystem node가 하나라도 있으면 거부한다.
6. resume을 pinned SHA로만 복원한다.
   - registered target은 clean checkout, local ref, 선택적 remote ref가 같은 expected SHA일 때 `reused`로 판정한다.
   - target이 없고 local ref만 있거나 remote가 같은 SHA면 local SHA를 expected SHA로 고정하고 `git worktree add`로 `restored-local` 복원한다.
   - local ref가 absent이고 remote ref만 있으면 remote SHA를 expected SHA로 고정한다. pinned SHA를 검증 URL에서 fetch하고 `git cat-file -e <sha>^{commit}`으로 확인한 뒤 `git update-ref <local-ref> <sha> ""` compare-and-create, `git worktree add` 순으로 `restored-remote` 복원한다.
   - local·remote가 서로 다른 SHA, 둘 다 absent, remote 이동·생성·삭제, origin 변경, local ref drift, registry drift, target 충돌에서는 force·delete·reset 없이 실패한다.
   - 첫 mutation 직전, 각 mutation 직후, 성공 반환 직전에 origin config, remote SHA-or-absent, local ref, expected registry/target 상태, issue exact state, merged PR 부재를 단계별 기대값과 비교한다. 마지막 issue state는 최초 snapshot과 같아야 한다.
   - worktree add나 사후 검증 실패 시 자동 rollback·delete·reset을 하지 않는다. error JSON에 `expectedSha`, `localRef`, `registeredWorktree`, `targetExists`를 포함해 부분 상태를 드러내고 다음 재실행이 안전하게 판정하게 한다.
   - 성공 JSON은 issue, unchanged status, `reused|restored-local|restored-remote`, branch, canonical worktree, expected SHA를 반환한다.
7. `reconcile`을 pagination-safe batch로 구현한다.
   - open `status:backlog` 검색 결과의 모든 page를 첫 mutation 전에 전부 가져온다. page 조회 하나라도 실패하면 mutation 0건으로 error JSON과 non-zero exit를 반환한다.
   - 전체 결과를 issue number로 deduplicate·오름차순 정렬하고 pull request 항목을 제외한 뒤 처리한다. 앞 page mutation으로 뒤 page가 건너뛰어지지 않아야 한다.
   - predecessor가 없으면 `skipped`, 하나라도 open이면 `waiting`, 모두 closed이고 transition 성공이면 `promoted`, malformed state/body·개별 read/write·응답 검증 실패면 `errors`로만 분류한다.
   - 각 item은 mutation 직전에 다시 읽고 `backlog` 또는 이미 target인 `ready`만 허용한다. blocked나 다른 status로 바뀌면 덮어쓰지 않고 error다. concurrent하게 이미 ready가 됐고 ready gate도 유효하면 `promoted`에 `changed: false`로 남긴다.
   - 개별 item error 뒤에도 나머지 안전한 item은 처리한다. 최종 JSON에는 항상 `promoted`, `waiting`, `skipped`, `errors` 배열이 있고 errors가 하나라도 있으면 결과를 출력한 뒤 non-zero로 종료한다.
8. 운영 문서와 repo-local skill을 새 명령·전이 표·fail-closed 조건에 맞춘다.

## 완료 기준

- 정확한 clean task worktree가 이미 있으면 `resume`은 branch·worktree·status mutation 없이 같은 경로와 SHA를 반환한다.
- worktree만 없고 exact local branch가 있으면 같은 task 경로로 한 번 복원하고 재실행은 기존 worktree를 재사용한다.
- local branch가 없고 검증된 remote branch만 있으면 compare-and-create로 local branch를 만들고 worktree를 복원한다.
- local·remote SHA 불일치, merged PR, target 경로 충돌, 다른 repository·path alias, dirty worktree, 예상 밖 worktree 점유, cleanup quarantine, origin·local·remote·registry drift에서는 force·delete·reset 없이 실패한다.
- resume은 branch를 자동 fast-forward·rewind하거나 issue status를 자동 변경하지 않는다.
- resume 성공 직전까지 issue open·최초 exact state, merged PR 부재, pinned origin·remote·local·registry·target 조건이 유지돼야 한다.
- open issue에 managed status가 0개 또는 2개 이상이거나 blocked provenance 구조가 잘못되면 status·start·resume·reconcile·pr와 미병합 merge 경로가 거부된다.
- 허용하지 않은 status 역행·건너뛰기에서는 GitHub label write가 0건이다.
- blocked는 출처 status로만 돌아가며 출처에 해당하는 gate를 다시 통과해야 한다.
- `backlog -> ready`와 `blocked-from:ready` 복귀는 선언된 predecessor가 모두 closed여야 한다. 단, reconcile 승격은 predecessor가 하나 이상이어야 한다.
- `ready -> spec`과 `blocked-from:spec` 복귀는 expected clean worktree가 없으면 실패한다.
- `spec -> implementing`, `implementing -> qa`, blocked-from implementing·qa 복귀는 expected worktree 절대 경로의 reviewed spec PASS가 없으면 실패한다.
- 같은 non-blocked status 재실행은 해당 상태 gate가 유효할 때만 label PUT 없이 성공한다. 같은 blocked status는 exact provenance 구조가 유효하면 원래 단계 artifact gate 없이 성공한다.
- `qa` status는 direct status command로 완료 또는 이전 active status로 바뀌지 않는다.
- invalid·closed·duplicate status에서 `pr` 최초 gate가 실패하면 full verify·push·GitHub write가 0건이고, 미병합 `merge`는 merge write가 0건이다. 이미 병합된 PR 재실행은 관계·SHA·병합 증거를 검증한 read-only 성공이어야 한다.
- `reconcile`은 predecessor가 하나 이상이고 모두 closed인 backlog issue만 ready로 승격한다.
- reconcile은 101개 이상 후보도 전체 page를 먼저 수집·deduplicate·stable sort한 뒤 mutation하며 page 수집 실패 시 mutation이 0건이다.
- open predecessor·predecessor 없음·malformed status·조회·write·응답 검증 오류는 정확한 결과 배열에 남고 errors가 있으면 non-zero로 끝난다.
- reconcile 재실행과 concurrent ready 승격은 유효한 gate에서 중복 label write를 하지 않는다.
- 기존 spec·QA·PR·merge·close·cleanup 흐름과 #40 안전 게이트가 회귀하지 않는다.
- `node --test scripts/task-harness.test.mjs`와 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- pure transition table: 정상 전진, blocked provenance 생성·원래 상태 복귀, 우회 거부, 같은 상태 gate, 역행, 건너뛰기, closed issue, status·provenance 누락·중복
- fake GitHub call log: invalid transition·failed target gate·PUT 응답/최종 GET mismatch에서 성공 보고 금지와 label PUT 횟수 검증
- `start`의 ready→blocked race, malformed status·path alias에서 Git mutation 0건, worktree add 뒤 status 실패의 안전한 재실행
- `pr`의 closed·duplicate status에서 verify·push·GitHub write 0건, verify 도중과 draft ready 직전 state drift 거부·draft 보존; 미병합 `merge`의 CI 전후 state drift 거부와 closed issue의 이미 병합된 PR read-only 재실행
- 기존 worktree resume 재사용과 dirty·wrong branch·wrong HEAD·다른 clone·canonical path/common-dir mismatch 거부
- local-only branch에서 worktree 복원, local ref drift, registry drift, 재실행 재사용
- remote-only branch에서 explicit verified URL fetch, pinned commit 검증, local compare-and-create, worktree 복원
- local/remote mismatch, remote absent→생성, matching remote 이동·삭제, 중간 origin 변경, merged PR, 다른 worktree 점유, cleanup quarantine 거부
- 빈 directory·file·symlink·broken symlink target 거부와 worktree add 부분 실패 JSON의 `expectedSha`, `localRef`, `registeredWorktree`, `targetExists` 검증
- resume preflight 뒤 issue close·status 변경, worktree add 뒤 registry/directory만 남는 실패에서 delete/reset 없이 실패하는지 검증
- reconcile 전체 closed·일부 open·없음·malformed·개별 read/write/응답 유실·재실행·backlog→blocked race 분류
- reconcile 101개 이상·page 2+·deduplicate·stable order, page fetch 실패 mutation 0건, partial errors 뒤 계속 처리와 non-zero exit
- 기존 43개 task harness 회귀 테스트
- `node --test scripts/task-harness.test.mjs`
- `./scripts/run-ai-verify --mode full`

## 분석과 관측성

- 제품 analytics와 funnel event 변경 없음.
- resume 성공 JSON은 issue, status, mode, branch, worktree, SHA를 포함한다.
- resume 부분 실패 JSON은 message와 pinned state diagnostics를 함께 포함한다.
- reconcile JSON은 `status`, `promoted`, `waiting`, `skipped`, `errors`를 issue number와 이유별로 포함한다. errors가 있으면 `status: error`와 non-zero exit를 사용한다.
- 다른 command error는 기존 최상위 `{ "status": "error", "message": "..." }` 형식을 유지한다.

## 개인정보와 악용 방지

- 제품 개인정보 처리 변경 없음.
- GitHub token·secret·remote credential을 출력하거나 파일에 저장하지 않는다.
- issue body에서는 `### 선행 이슈` section의 issue number만 dependency로 해석한다.
- repo·branch·SHA·worktree 경로를 mutation 전에 고정해 다른 repository나 issue 자원 변경을 막는다.

## 롤아웃과 복구

- migration과 feature flag는 필요 없다.
- issue #42 자체 worktree에서 새 transition을 적용하되 구현 중 status 변경은 기존 명령으로 진행하고, PR merge 뒤부터 새 규칙을 기본으로 사용한다.
- 문제가 생기면 PR을 revert해 기존 `start`·`status`·queue 흐름으로 복구할 수 있다.
- start·resume이 local ref 또는 worktree를 만든 뒤 후속 검증에 실패하면 생성물을 자동 삭제하지 않는다. 오류 diagnostics를 확인하고 원인을 고친 뒤 같은 명령을 재실행한다.

## 스펙 검토

Reviewer Agent: /root/issue42_resume_design_review, /root/issue42_state_design_review, /root/issue42_spec_review
Review Status: PASS
P0/P1 Findings: 0

## 리스크와 미결정 사항

- Git worktree registry, filesystem path, local ref, remote ref를 하나의 transaction으로 묶을 수 없다. 각 mutation 직전·직후 재검증하고 같은 task branch에 대한 동시 Git 작업을 운영상 금지한다.
- resume은 immutable snapshot과 단계별 expected state 비교로 drift를 감지하지만 Git·filesystem을 하나의 transaction으로 만들지는 않는다. 부분 상태는 삭제하지 않고 diagnostics로 보고한다.
- status label API에는 compare-and-swap이 없다. PUT 직전 재조회, 응답 검증, 즉시 GET으로 창을 줄이지만 마지막 GET 뒤의 동시 수동 편집은 막지 못한다.
- reconcile은 자기 mutation으로 인한 offset pagination 누락은 전체 선수집으로 막지만, page 조회 도중 외부 actor가 backlog label을 바꾸는 churn까지 snapshot 격리하지 못한다. item 재검증과 다음 `reconcile` 재실행으로 수렴시킨다.
- blocked 출처는 label로 영속화하므로 외부 저장소는 필요 없지만, 사람이 provenance label만 따로 편집하면 중앙 state 판정이 fail closed한다.
- 구현 전 외부 블로커와 미결정 제품 결정은 없다.
