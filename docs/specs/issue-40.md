# Issue 40 구현 스펙: task harness PR·병합·완료 게이트 안전성 강화

Status: Reviewed
Issue: https://github.com/aroido/gyeop/issues/40

## 목표

이슈별 예상 브랜치와 검증한 commit만 PR 생성·병합·종료·정리 단계로 진행되도록 task harness의 완료 경계를 fail-closed로 강화한다.

## 범위

- `scripts/task-harness.mjs`
  - PR 생성 전 이슈별 예상 브랜치, clean working tree, spec·QA gate, 전체 검증 통과를 요구한다.
  - PR을 검증 가능한 draft로 생성하거나 기존 open PR을 복구한 뒤에만 ready로 전환한다.
  - 병합 전 PR base/head repository·branch·SHA와 현재 checkout을 대조하고 CI 결과가 한 건 이상 존재하는지 검증한다.
  - `close <issue-number> <pr-number>`와 `cleanup <issue-number> <pr-number>`가 같은 이슈의 병합된 PR 증거를 요구하도록 한다.
  - cleanup이 main checkout과 대상 worktree를 각각 검증한 뒤 worktree와 동일 SHA의 local·remote 작업 브랜치와 관련 추적 상태만 정리하도록 한다.
- `scripts/task-harness.test.mjs`
  - checkout, CI 상태, QA 문서, PR-이슈 연결과 병합 증거에 대한 순수 판정 함수의 회귀 테스트를 추가한다.
- `docs/templates/qa-verdict.md`
  - 독립 reviewer, P0/P1 집계, 전체 검증 결과를 구조화한다.
- `docs/engineering/github-task-workflow.md`
  - 변경된 명령 인자와 fail-closed 완료 순서를 반영한다.
- `.codex/skills/gyeop-task/SKILL.md`, `.codex/skills/gyeop-task/references/review-gates.md`
  - 실제 task 실행자가 새 명령 형식, PR 선검증, 재실행, cleanup 안전 경계를 같은 기준으로 따르도록 한다.

## 제외 범위

- `resume` 명령 또는 삭제된 worktree 복구
- 전체 상태 전이 그래프와 `status:blocked` 복귀 정책
- 선행 이슈 종료 뒤 `status:backlog` 자동·수동 승격
- GitHub Project V2 한국어 필드 동기화
- scheduler, daemon, webhook, 별도 상태 저장소 또는 lock
- 제품 UI, application API, Supabase schema, production 배포 변경

## SSOT

- `AGENTS.md`
- `.codex/AGENTS.md`
- `docs/product/core-feature-priority.md`
- `docs/engineering/github-task-workflow.md`
- `docs/templates/qa-verdict.md`
- `.codex/skills/gyeop-task/SKILL.md`
- `.codex/skills/gyeop-task/references/review-gates.md`
- `scripts/task-harness.mjs`
- `scripts/task-harness.test.mjs`
- `scripts/ai-verify`
- `.github/workflows/ci.yml`

## 사용자 흐름 영향

- 주인·방문자·새 주인의 제품 흐름은 바뀌지 않는다.
- 이후 제품 이슈의 코드가 잘못된 checkout이나 검증되지 않은 commit에서 병합되는 운영 위험을 줄인다.

## 디자인 영향

- 제품 화면과 디자인 토큰 변경 없음.
- CLI 성공·실패 출력은 기존 JSON 형식을 유지한다.

## API와 데이터 영향

- application API, database, auth, storage 변경 없음.
- GitHub REST 범위에서 PR의 `base.ref`, `base.sha`, `head`, `draft`, `merged_at`, `merge_commit_sha`, body의 정확히 한 개뿐인 `Closes #<issue>`를 검증하고 draft PR의 ready 전환과 완료 marker comment를 기록한다.
- `close`와 `cleanup` CLI는 병합 증거를 명시적으로 받기 위해 `<pr-number>` 인자를 추가한다.

## 구현 계획

1. `scripts/task-harness.mjs`에 다음 순수 판정 함수를 추가해 shell·GitHub 변경 전에 재사용한다.
   - 설정된 GitHub repository와 local `origin`의 모든 fetch·push URL에서 파싱한 repository가 정확히 같은지 판정한다.
   - checkout 상태에서 예상 branch, clean 여부, 선택적 expected SHA를 판정한다.
   - check run과 commit status 합계가 0인지, pending·failure가 있는지 판정한다.
   - PR이 같은 repository의 `main <- codex/issue-<number>`이고 body 첫 line 전체가 정확히 `Closes #<issue>`이며 다른 GitHub closing keyword reference가 없고 실제 병합됐는지 판정한다.
   - spec·QA gate의 구조화 필드가 열 시작 위치에 정확히 한 번만 존재하고 허용 값과 일치하는지 판정한다.
2. 기존의 중앙화된 `run`·`ghApi` 경계를 유지하고 테스트에서는 fake `git`·`gh`·verify executable을 `PATH`와 임시 Git 저장소에 주입한다. 잘못된 preflight에서 push, GitHub write, worktree/ref mutation 호출이 0건인지 실제 CLI call log로 검증한다.
3. `pr`은 이슈가 `status:qa`인지 확인한 뒤 예상 checkout과 spec·QA gate를 검증한다. verify 직전 branch·clean·HEAD와 QA artifact의 원문을 고정하고 `./scripts/run-ai-verify --mode full` 뒤 네 값이 그대로인지와 QA gate가 여전히 통과하는지 재검증한다. 예상 head/base의 open PR 후보가 0건 또는 정확히 한 건인지 verify 전과 직후 push 전에 반복 검사하고, 후보가 있으면 동일 PR인지와 repository·base/head·lifecycle·first-line exact closing reference·colon을 포함한 추가 closing keyword 부재·현재 remote/head SHA 정합성을 확인한다. candidate 추가·교체·ambiguous/mismatch는 local upstream·remote·GitHub mutation 전에 실패한다. origin fetch·push repository도 push 직전에 다시 확인한다. 통과한 SHA만 push하고 remote head를 대조한 뒤 후보를 다시 조회해 exact SHA까지 검증하거나 후보가 없으면 `draft: true`로 만든다. 검증된 draft만 ready-for-review로 전환하고 동일 PR이 non-draft인지 재조회한다. ready 성공 여부가 불확실하면 자동 close하지 않고 실패해 다음 재실행에서 복구하며, 이미 non-draft인 유효한 기존 PR은 재실행 성공으로 반환한다.
4. `merge`는 PR이 open·non-draft·mergeable인지, `base.sha`와 `head.sha`, 현재 checkout의 branch·clean·HEAD가 일치하는지 먼저 확인하고 QA artifact 원문을 고정한다. 전체 검증 뒤 checkout과 QA artifact·gate를 다시 검사하고 PR을 재조회해 `base.sha`, head SHA, repository·branch, open·draft·mergeable 조건이 모두 동일한지 확인한다. Check Run과 commit status가 한 건 이상이며 모두 허용된 성공 상태일 때 병합 직전에 PR을 한 번 더 조회해 같은 snapshot을 검증하고, 검증한 head SHA를 merge API의 `sha` 필드로 전달한다.
5. `close`는 `<issue-number> <pr-number>`의 단일 closing reference·연결·병합을 검증한다. 이슈·PR·merge SHA를 포함한 고정 completion marker가 없으면 marker를 포함한 완료 comment를 먼저 한 번만 작성하고, 이슈가 열려 있을 때만 close한다. comment 또는 close 중간 실패 뒤 재실행해도 marker를 기준으로 중복 comment 없이 남은 단계만 수행한다.
6. `cleanup`은 기본 checkout의 branch·clean 상태를 확인하고 `git fetch origin main` 뒤 `origin/main`에 PR `merge_commit_sha`가 포함됐는지 검사한다. 대상 worktree, local branch, remote branch, remote-tracking ref, branch config snapshot을 모두 첫 변경 전에 검사하며 존재하는 ref는 `pr.head.sha`와 같아야 한다. 대상 worktree의 tracked/untracked 변경은 실패하고 ignored 경로는 Git의 NUL 구분 literal path로 판정해 `.DS_Store`, `*.tsbuildinfo`, `node_modules/`, `.next/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `supabase/.temp/`, `supabase/.branches/`, `docs/temp/`, `.omx/`만 disposable generated allowlist로 허용한다.
7. cleanup은 GitHub 증거 read 뒤 fetch 직전에 origin fetch·push repository를 재검사한다. preflight가 통과하면 local `main`을 fast-forward하고 대상 worktree의 branch·clean·HEAD와 unsafe ignored 경로를 다시 확인한 뒤 worktree를 제거한다. local branch는 expected SHA와 config snapshot을 재확인한 뒤 task별 deterministic quarantine ref로 worktree-aware rename한다. original/quarantine worktree·ref·SHA·config를 다시 검사해 경쟁이 없을 때만 quarantine ref를 expected-SHA compare-and-swap으로 삭제하고 삭제 직후 worktree를 다시 검사한다. 경쟁이 보이면 ref와 original branch를 복구하거나 보존한 채 실패하며, 중단 뒤 재실행은 deterministic quarantine을 인식해 이어서 정리한다. remote branch 직전에 origin fetch·push repository를 다시 확인하고 expected SHA의 `--force-with-lease`로 삭제하며 remote-tracking ref도 대상 branch에 한해 정리한다. 각 단계 직후 부재를 확인하며 remote branch가 이미 없는 재실행은 정상으로 보고 남은 local 자원 정리를 계속한다.
8. spec gate는 열 시작 위치의 `Status`, `Reviewer Agent`, `Review Status`, `P0/P1 Findings`가 각각 정확히 한 번이고 `Reviewed`, 유효 reviewer, `PASS`, `0`인지 요구한다. QA gate도 `Reviewer Agent`, `Status`, `P0/P1 Findings`, full verify command/result block이 각각 정확히 한 번이고 허용 값인지 요구한다. reviewer의 실제 독립성은 별도 agent 실행과 artifact 기록으로 보장한다.
9. workflow 문서를 새 gate와 명령 형식에 맞추고 순수 판정 및 fake runner 기반 부작용 회귀 테스트를 추가한다.

## 완료 기준

- `pr 40`과 같은 PR 생성 명령은 현재 branch가 `codex/issue-40`이 아니거나 working tree가 clean하지 않으면 push·GitHub 쓰기 전에 실패한다.
- `pr`·`merge`·`close`·`cleanup`은 설정된 GitHub repository와 local `origin`의 fetch 또는 push repository가 다르면 git·GitHub mutation 전에 실패한다.
- spec·QA gate 또는 PR 직전 전체 검증이 실패하면 branch push와 PR 생성이 발생하지 않는다.
- spec은 구조화 필드 네 개가, QA는 구조화 필드 세 개와 full verify block이 열 시작 위치에 각각 정확히 한 번 존재해야 하며 중복·누락·허용하지 않은 값이면 gate가 실패한다.
- verify 전후 branch·working tree·HEAD 또는 QA artifact 원문 중 하나라도 달라지면 push·PR 생성·병합 API 호출이 발생하지 않는다.
- PR 후보 수·관계·현재 remote/head SHA mismatch는 push와 upstream 변경 전에 실패하고, PR 생성 직후 remote branch SHA와 생성된 PR head가 verify 전후 고정한 local HEAD와 일치한다.
- `pr`은 새 PR을 draft로 생성해 relation 검증 뒤 ready로 전환한다. verify 전후 같은 base/head의 기존 open PR 조회가 0건이면 신규 생성하고, 정확히 1건이면 동일한 유효 draft를 이어서 ready로 전환하거나 동일한 유효 non-draft를 재사용하며, 후보 추가·교체·2건 이상 또는 relation·SHA·first-line closing reference·추가 closing keyword mismatch면 mutation 전에 실패한다. ready 전환 응답 유실 시 PR을 자동 close하지 않는다.
- `merge`는 PR이 open·non-draft·mergeable이고, base가 `main`, head repository가 현재 repository, head branch가 해당 이슈의 예상 branch, local HEAD가 `pr.head.sha`인 경우에만 전체 검증 단계로 진행한다.
- 전체 검증 전후와 merge API 직전 재조회에서 `base.sha`, head SHA 또는 open·draft·mergeable·base/head 조건이 달라지면 병합을 거부한다.
- Check Run과 commit status 합계가 0이면 병합을 거부한다.
- pending 또는 실패 check/status가 하나라도 있으면 병합을 거부하고, 한 건 이상이 존재하며 모두 허용된 성공 상태일 때만 다음 단계로 진행한다.
- merge API에는 검증한 PR head SHA를 expected `sha`로 전달해 직전 head 변경도 GitHub가 거부한다.
- QA 문서에 독립 `Reviewer Agent`, `Status: PASS`, `P0/P1 Findings: 0`, full verify command와 `Result: PASS`가 각각 정확히 한 번 없으면 QA gate가 실패한다.
- 미병합 PR, 다른 base/head, closing reference 0개·2개 이상·다른 이슈 중 하나라도 발견되면 `close`와 `cleanup`은 원격 이슈·worktree·branch를 변경하지 않는다.
- `close`는 고정 completion marker comment를 close보다 먼저 한 번만 기록하고, 동일한 병합 완료 이슈에 재실행하면 marker와 issue state를 확인해 중복 comment 없이 성공한다.
- 동일한 병합 완료 이슈에 `cleanup`을 다시 실행해도 이미 없는 remote branch를 오류로 보지 않고 남은 대상 자원만 정리하며 무관한 branch는 삭제하지 않는다.
- cleanup은 `git fetch origin main` 뒤 `origin/main`에 PR merge commit이 포함됐음을 확인하고 local `main`을 fast-forward한 경우에만 정리를 시작한다.
- cleanup은 대상 worktree와 local·remote·remote-tracking ref 및 branch config를 첫 변경 전에 모두 preflight하고, 존재하는 각 ref가 `pr.head.sha`와 일치할 때만 정리를 시작한다. 초기 mismatch에서는 worktree·local·remote가 모두 그대로 남는다.
- 대상 worktree에 tracked/untracked 변경 또는 allowlist 밖 ignored 경로가 있으면 cleanup이 실패하며 `--force`로 제거하지 않는다.
- linked worktree가 존재하면 branch ref를 유지한 채 branch·clean·HEAD·ignored 경로를 재검증하고 `git worktree remove`한 뒤 local branch와 remote branch 순서로 삭제한다.
- local branch는 expected SHA와 config snapshot을 재검사한 뒤 task별 deterministic quarantine ref로 worktree-aware rename한다. rename 뒤와 CAS 삭제 직후 original/quarantine worktree·ref·SHA·config를 재검사하고, 경쟁 시 ref를 복구·보존해 새 SHA를 강제 삭제하지 않는다. 중단 뒤 재실행은 deterministic quarantine을 인식하며, remote branch는 expected SHA의 force-with-lease를 사용하고 이후 remote-tracking ref와 branch config를 정리해 worktree·모든 대상 ref·config의 부재를 즉시 확인한다.
- invalid gate별 fake runner 검증에서 `git push`, PR/merge/issue GitHub write, worktree remove, local·remote ref delete 호출이 0건이다.
- `node --test scripts/task-harness.test.mjs`와 `./scripts/run-ai-verify --mode full`이 통과한다.

## 테스트 계획

- `node --test scripts/task-harness.test.mjs`
- 예상 branch/다른 branch, clean/dirty, HEAD 일치/불일치 판정
- verify 도중 branch·working tree·HEAD 변경 시 후속 mutation 0건 판정
- CI 결과 0건, pending, failure, success·neutral·skipped 조합 판정
- QA reviewer, P0/P1 0건, full verify PASS 필드별 누락 판정
- PR open/draft/mergeable, base/head/repository/close clause/merged_at 조건별 판정
- first-line closing reference 0개·1개·중복·다른 이슈·추가 closing keyword·fenced 예시와 exact unique spec·QA 필드 판정
- full verify 도중 open PR 후보 추가·교체·본문 또는 remote head 변경 시 push mutation 0건 판정
- GitHub repository와 `origin` fetch·push repository mismatch, GitHub evidence read 뒤 fetch URL 변경, verify/local cleanup 도중 push URL 변경에서 해당 remote mutation 0건 판정
- fake `git`·`gh`·verify executable과 임시 저장소를 이용해 invalid preflight 뒤 mutation call log가 비어 있는지 검증
- `pr` 기존 후보 0건에서 신규 draft 생성·relation 검증·ready 전환, 기존 draft/non-draft PR 1건 복구, 후보 2건 이상 mutation 0, ready 응답 유실 시 PR 보존을 검증
- verify 도중 QA artifact 변경 시 push·PR·merge mutation 0건을 검증
- merge request가 verify SHA를 payload로 전달하고 verify 전후 및 API 직전 `base.sha`·head SHA 변경을 거부하는지 검증
- `close` comment/patch 중간 실패 뒤 재실행에서 completion marker comment가 하나뿐인지 검증
- cleanup이 모든 자원을 먼저 검사하고 remote·remote-tracking mismatch, backslash를 포함한 literal ignored filename, unsafe ignored 경로에서 mutation 0건인지 검증
- fake runner call log에서 linked worktree remove가 local quarantine rename·재검증보다 먼저인지, local ref drift에서 새 SHA를 보존하는지, remote 부재 재실행이 남은 local ref·tracking ref·config를 정리하는지, 실제 임시 linked-worktree 정상 cleanup을 검증
- 실제 issue #40 worktree에서 `./scripts/run-ai-verify --mode full`
- PR 생성 뒤 `gh pr view <number> --json headRefName,headRefOid,baseRefName,state,statusCheckRollup` 대조
- 병합 뒤 `main` merge commit, closed issue, 제거된 worktree·local/remote branch 대조

## 분석과 관측성

- 제품 analytics와 funnel event 변경 없음.
- 실패 출력은 기존 최상위 `{ "status": "error", "message": "..." }` JSON 형식을 유지하고 어떤 gate가 거부했는지 포함한다.
- 성공 출력은 PR, merge, close, cleanup 결과와 검증한 식별자를 포함한다.

## 개인정보와 악용 방지

- 제품 개인정보 처리 변경 없음.
- GitHub auth는 기존 사용자 `gh` 세션만 사용하고 token·secret을 출력하거나 파일에 기록하지 않는다.
- branch와 SHA를 API 호출 전 검증해 다른 이슈 또는 다른 repository 자원을 수정하는 위험을 줄인다.

## 롤아웃과 복구

- migration과 feature flag는 필요 없다.
- 변경은 issue #40 자체 흐름에서 새 `pr`·`merge` gate를 통과시켜 실제로 검증한다.
- `close`·`cleanup`의 새 필수 PR 인자는 병합 뒤 사용한다.
- 문제가 생기면 PR을 revert해 기존 명령으로 복구할 수 있으며 저장 데이터 migration은 없다.

## 스펙 검토

Reviewer Agent: issue40_spec_amend_review
Review Status: PASS
P0/P1 Findings: 0
Post-review amendment: 구현 검토에서 확인된 재실행·TOCTOU·정리 안전성 누락을 반영해 push 전 PR 후보 검증, 불확실한 ready 전환 보존, exact closing line, QA artifact와 base SHA 고정, completion marker, literal ignored path 검사, local branch quarantine/CAS 정리 기준을 보강했다.

## 리스크와 미결정 사항

- GitHub Actions가 실행 중인 동안에는 pending check로 병합이 거부되며 완료 뒤 다시 실행한다.
- squash merge 뒤 작업 branch commit은 `main`의 ancestor가 아니므로 cleanup은 ancestry 기반 삭제를 사용하지 않는다. 대신 task별 deterministic quarantine으로 worktree-aware rename하고 expected-SHA compare-and-swap으로 quarantine ref만 삭제한다.
- repository 설정이 merge 시 원격 branch를 먼저 지울 수 있으므로 remote branch 부재는 오류로 보지 않는다.
- local과 GitHub를 가로지르는 단일 transaction은 없으므로 cleanup preflight 뒤 경쟁으로 부분 정리가 발생할 수 있다. local branch는 삭제 직전 SHA 재확인, remote branch는 expected SHA lease로 위험을 줄이고, 실패를 성공으로 숨기지 않으며 재실행으로 남은 자원만 정리한다.
- local branch 삭제는 일반 branch 이름을 바로 강제 삭제하지 않는다. task별 deterministic quarantine 이름으로 worktree-aware rename한 뒤 original/quarantine ref와 worktree를 재검사하고 expected-SHA compare-and-swap으로 quarantine ref만 삭제한다. CAS 직후에도 worktree를 재검사하고 경쟁 시 ref를 복구·보존하며, 중단 뒤 재실행은 남은 quarantine ref를 인식한다.
- Git은 worktree registry, ref, branch config, working tree 파일, remote 설정을 하나의 원자 transaction으로 묶지 않으므로 `pr`·cleanup 중 같은 task branch의 외부 checkout·commit·ref/config 변경, tracked·untracked·ignored 파일 생성·변경, `origin` URL 변경은 운영상 금지한다. 하네스는 각 mutation 전후 재검사와 복구를 수행하고 예상 밖 경쟁은 남은 상태를 포함한 실패로 보고한다. 최종 origin/PR 후보/ignored-path 검사와 바로 다음 git command 사이의 짧은 경쟁은 운영 경계와 Git의 non-fast-forward/lease 보호에 의존하는 잔여 위험이다.
- merge API는 expected head SHA만 조건으로 받으므로 final PR GET과 PUT 사이의 base/body/lifecycle 변경은 원자적으로 고정할 수 없다. `merge` 실행 중 PR metadata 수동 편집을 금지하고, 직전 재검증과 GitHub mergeability·branch protection 판정에 의존한다.
- GitHub merge REST API는 expected head `sha`만 조건으로 받고 expected `base.sha`나 base branch ref tip은 받지 않는다. 따라서 PR snapshot 재조회만으로 base ref 전진 전반을 원자적으로 막을 수 없으며, 직전 재검증과 GitHub의 mergeability·branch protection 판정에 의존하는 잔여 위험으로 남긴다.
- 구현 전 미결정 사항과 외부 블로커는 없다.
