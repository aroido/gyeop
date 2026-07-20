import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertIssueStatus,
  blockedFromLabels,
  branchForIssue,
  checkStateFailures,
  checkoutFailures,
  defaultWorktreeRoot,
  dependencyNumbers,
  issueSlug,
  parseWorktrees,
  prRelationFailures,
  projectSourceSnapshot,
  qaPathForIssue,
  qaFailures,
  repoFromUrl,
  slugify,
  specFailures,
  specPathForIssue,
  statusLabels,
  transitionPlan,
  workflowState,
} from "./task-harness.mjs";

const harnessPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "task-harness.mjs",
);
const realGit = process.env.PATH.split(path.delimiter)
  .map((directory) => path.join(directory, "git"))
  .find((candidate) => fs.existsSync(candidate));

const issue = {
  number: 123,
  title: "[Frontend] 방문자 3장 응답 화면 구현",
};

function completeSpecText() {
  return `# 스펙

Status: Reviewed

## 목표
방문자 응답을 구현한다.
## 범위
모바일 웹 응답 화면.
## 제외 범위
공개 팩 탐색.
## SSOT
docs/product/core-feature-priority.md
docs/product/question-pack-spec.md
AGENTS.md
## 사용자 흐름 영향
방문자가 3장에 답한다.
## 디자인 영향
응답 화면.
## API와 데이터 영향
응답 저장 API.
## 구현 계획
화면과 API를 연결한다.
## 완료 기준
게스트가 3장을 제출한다.
## 테스트 계획
./scripts/run-ai-verify --mode full
## 분석과 관측성
완료 이벤트를 기록한다.
## 개인정보와 악용 방지
응답 값은 분석 이벤트에서 제외한다.
## 롤아웃과 복구
feature flag를 사용한다.
## 스펙 검토
Reviewer Agent: critic
Review Status: PASS
P0/P1 Findings: 0
## 리스크와 미결정 사항
없음.
`;
}

function completeQaText() {
  return `# QA

## QA 판정

Reviewer Agent: issue40_qa
Status: PASS
P0/P1 Findings: 0

## 발견 사항

No P0/P1 findings.

## 검증

- Command: ./scripts/run-ai-verify --mode full
- Result: PASS

## 필수 수정

None.
`;
}

test("slugify creates stable branch-safe slugs", () => {
  assert.equal(
    slugify("[Frontend] Build visitor response flow!"),
    "frontend-build-visitor-response-flow",
  );
  assert.equal(slugify("..."), "task");
});

test("issue paths and branch names are deterministic", () => {
  assert.equal(issueSlug(issue), "issue-123");
  assert.equal(branchForIssue(issue), "codex/issue-123");
  assert.equal(specPathForIssue(issue), "docs/specs/issue-123.md");
  assert.equal(qaPathForIssue(issue), "docs/temp/qa/issue-123.md");
});

test("worktree root stays anchored to the main checkout", () => {
  assert.equal(
    defaultWorktreeRoot(
      "/workspace/gyeop/.git",
      "/workspace/gyeop-worktrees/issue-123",
    ),
    "/workspace/gyeop-worktrees",
  );
});

test("GitHub repository parsing accepts only host-anchored origin formats", () => {
  for (const url of [
    "https://github.com/aroido/gyeop",
    "https://github.com/aroido/gyeop.git",
    "git@github.com:aroido/gyeop.git",
    "ssh://git@github.com/aroido/gyeop",
    "git://github.com/aroido/gyeop.git",
  ]) {
    assert.equal(repoFromUrl(url), "aroido/gyeop", url);
  }
  for (const url of [
    "https://notgithub.com/aroido/gyeop.git",
    "https://evil.example/x/github.com/aroido/gyeop.git",
    "http://github.com/aroido/gyeop.git",
    "https://github.com/aroido/gyeop/extra",
    "https://github.com/aroido/gyeop.git/",
  ]) {
    assert.equal(repoFromUrl(url), "", url);
  }
});

test("PR creation requires the QA workflow state", () => {
  assert.doesNotThrow(() =>
    assertIssueStatus(
      { number: 123, state: "open", labels: ["status:qa"] },
      "status:qa",
    ),
  );
  assert.throws(
    () =>
      assertIssueStatus(
        { number: 123, state: "open", labels: ["status:implementing"] },
        "status:qa",
      ),
    /must be status:qa/,
  );
});

test("task start requires the ready workflow state", () => {
  assert.doesNotThrow(() =>
    assertIssueStatus(
      { number: 123, state: "open", labels: ["status:ready"] },
      "status:ready",
    ),
  );
  assert.throws(
    () =>
      assertIssueStatus(
        { number: 123, state: "open", labels: ["status:backlog"] },
        "status:ready",
      ),
    /must be status:ready/,
  );
  assert.throws(
    () =>
      assertIssueStatus(
        {
          number: 123,
          state: "open",
          labels: ["status:blocked", "blocked-from:ready"],
        },
        "status:ready",
      ),
    /must be status:ready/,
  );
});

test("status labels cover the task gate states", () => {
  assert.deepEqual(statusLabels, [
    "status:backlog",
    "status:ready",
    "status:spec",
    "status:implementing",
    "status:qa",
    "status:blocked",
  ]);
  assert.deepEqual(blockedFromLabels, [
    "blocked-from:backlog",
    "blocked-from:ready",
    "blocked-from:spec",
    "blocked-from:implementing",
    "blocked-from:qa",
  ]);
});

test("Project selections follow workflow, priority, type, and completion labels", () => {
  const mappings = new Map([
    ["status:backlog", ["Todo", "선행 작업 대기"]],
    ["status:ready", ["Todo", "준비"]],
    ["status:spec", ["In Progress", "스펙 작성"]],
    ["status:implementing", ["In Progress", "구현 중"]],
    ["status:qa", ["In Progress", "품질 검증"]],
    ["status:blocked", ["In Progress", "차단"]],
  ]);
  for (const [status, [builtIn, workflow]] of mappings) {
    const labels = [status, "priority:p0", "type:ops"];
    if (status === "status:blocked") labels.push("blocked-from:ready");
    const snapshot = projectSourceSnapshot({
      number: 44,
      node_id: "I_44",
      html_url: "https://github.com/aroido/gyeop/issues/44",
      state: "open",
      labels,
    });
    assert.deepEqual(snapshot.desired, {
      Status: builtIn,
      "작업 상태": workflow,
      우선순위: "P0",
      "작업 유형": "운영",
    });
  }

  const closed = {
    number: 44,
    node_id: "I_44",
    html_url: "https://github.com/aroido/gyeop/issues/44",
    state: "closed",
    labels: ["status:qa", "priority:p1", "type:design"],
  };
  assert.deepEqual(projectSourceSnapshot(closed, { completed: true }).desired, {
    Status: "Done",
    "작업 상태": "완료",
    우선순위: "P1",
    "작업 유형": "디자인",
  });
  assert.equal(
    projectSourceSnapshot(closed, { membershipOnly: true }).desired,
    null,
  );
  assert.throws(
    () =>
      projectSourceSnapshot({
        ...closed,
        state: "open",
        labels: ["status:qa", "priority:p0", "priority:p1"],
      }),
    /at most one priority/,
  );
  assert.throws(
    () =>
      projectSourceSnapshot({
        ...closed,
        state: "open",
        labels: ["status:qa", "type:unknown"],
      }),
    /unknown type/,
  );
});

test("workflow state requires one exact status and valid blocked provenance", () => {
  assert.deepEqual(
    workflowState({ number: 1, state: "open", labels: ["status:qa"] }),
    {
      status: "status:qa",
      provenance: null,
      sourceStatus: "status:qa",
    },
  );
  assert.deepEqual(
    workflowState({
      number: 1,
      state: "open",
      labels: ["status:blocked", "blocked-from:implementing"],
    }),
    {
      status: "status:blocked",
      provenance: "blocked-from:implementing",
      sourceStatus: "status:implementing",
    },
  );
  for (const labels of [
    [],
    ["status:qa", "status:ready"],
    ["status:blocked"],
    ["status:blocked", "blocked-from:qa", "blocked-from:ready"],
    ["status:qa", "blocked-from:qa"],
    ["status:qa", "status:unknown"],
    ["status:blocked", "blocked-from:unknown"],
  ]) {
    assert.throws(() => workflowState({ number: 1, state: "open", labels }));
  }
  assert.throws(
    () => workflowState({ number: 1, state: "closed", labels: ["status:qa"] }),
    /must be open/,
  );
});

test("transition plan permits only forward steps and exact blocked recovery", () => {
  const ready = workflowState({
    number: 1,
    state: "open",
    labels: ["status:ready"],
  });
  assert.deepEqual(transitionPlan(ready, "status:spec"), {
    changed: true,
    status: "status:spec",
    provenance: null,
  });
  assert.deepEqual(transitionPlan(ready, "status:blocked"), {
    changed: true,
    status: "status:blocked",
    provenance: "blocked-from:ready",
  });
  const blocked = workflowState({
    number: 1,
    state: "open",
    labels: ["status:blocked", "blocked-from:ready"],
  });
  assert.deepEqual(transitionPlan(blocked, "status:ready"), {
    changed: true,
    status: "status:ready",
    provenance: null,
  });
  assert.deepEqual(transitionPlan(blocked, "status:blocked"), {
    changed: false,
    status: "status:blocked",
    provenance: "blocked-from:ready",
  });
  for (const target of ["status:backlog", "status:spec", "status:qa"]) {
    assert.throws(() => transitionPlan(blocked, target), /only return/);
  }
  assert.throws(() => transitionPlan(ready, "status:qa"), /not allowed/);
  assert.throws(
    () => transitionPlan(ready, "status:spec", ["status:backlog"]),
    /expected workflow source/,
  );
});

test("dependency numbers come only from the predecessor section", () => {
  assert.deepEqual(
    dependencyNumbers(
      `## 목표\n이슈 #99를 설명한다.\n\n## 의존성/블로커\n### 선행 이슈\n- #3\n- #7\n- #3\n\n### 블로커\n- #55 확인 필요\n`,
    ),
    [3, 7],
  );
  assert.deepEqual(dependencyNumbers("### 선행 이슈\n- 없음\n"), []);
});

test("spec gate accepts a complete reviewed GYEOP spec", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gyeop-spec-"));
  const file = path.join(dir, "spec.md");
  fs.writeFileSync(file, completeSpecText());

  assert.deepEqual(specFailures(file), []);
});

test("spec gate requires unique exact review fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gyeop-spec-exact-"));
  const valid = completeSpecText();
  const cases = [
    [
      "descriptive fields do not interfere",
      `${valid}\nPrevious Status: Draft\nExpected Review Status: PASS\n`,
      false,
    ],
    [
      "descriptive status cannot replace exact field",
      valid.replace("Status: Reviewed", "Previous Status: Reviewed"),
      true,
    ],
    [
      "descriptive review cannot replace exact field",
      valid.replace("Review Status: PASS", "Expected Review Status: PASS"),
      true,
    ],
    ["duplicate status is rejected", `${valid}\nStatus: Draft\n`, true],
    [
      "duplicate review status is rejected",
      `${valid}\nReview Status: FAIL\n`,
      true,
    ],
    ["duplicate findings are rejected", `${valid}\nP0/P1 Findings: 1\n`, true],
    [
      "duplicate reviewer is rejected",
      `${valid}\nReviewer Agent: another_agent\n`,
      true,
    ],
  ];

  for (const [index, [name, contents, shouldFail]] of cases.entries()) {
    const file = path.join(dir, `${index}.md`);
    fs.writeFileSync(file, contents);
    assert.equal(specFailures(file).length > 0, shouldFail, name);
  }
});

test("qa gate blocks non-pass verdicts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gyeop-qa-"));
  const file = path.join(dir, "qa.md");
  fs.writeFileSync(
    file,
    `# QA

## QA 판정
Status: FAIL

## 발견 사항
- [P1] 방문자 제출 실패.

## 검증
- Command: ./scripts/run-ai-verify --mode full
- Result: Failed

## 필수 수정
- 제출 오류를 수정한다.
`,
  );

  assert.ok(qaFailures(file).length >= 2);
});

test("checkout gate rejects branch, dirty tree, and HEAD drift", () => {
  const sha = "a".repeat(40);
  const valid = { branch: "codex/issue-40", clean: true, sha };
  const cases = [
    ["valid", valid, { branch: valid.branch, sha }, false, null],
    ["optional SHA", valid, { branch: valid.branch }, false, null],
    [
      "wrong branch",
      { ...valid, branch: "main" },
      { branch: valid.branch, sha },
      true,
      /branch/,
    ],
    [
      "dirty",
      { ...valid, clean: false },
      { branch: valid.branch, sha },
      true,
      /clean/,
    ],
    [
      "HEAD drift",
      { ...valid, sha: "b".repeat(40) },
      { branch: valid.branch, sha },
      true,
      /HEAD/,
    ],
  ];

  for (const [name, actual, expected, shouldFail, pattern] of cases) {
    const failures = checkoutFailures(actual, expected);
    assert.equal(failures.length > 0, shouldFail, name);
    if (pattern) assert.match(failures.join("\n"), pattern, name);
  }
});

test("CI gate requires at least one completed successful result", () => {
  const success = {
    name: "verify",
    status: "completed",
    conclusion: "success",
  };
  const cases = [
    ["no results", [], [], true],
    [
      "queued check",
      [{ ...success, status: "queued", conclusion: null }],
      [],
      true,
    ],
    ["failed check", [{ ...success, conclusion: "failure" }], [], true],
    [
      "unrelated success does not replace verify",
      [{ ...success, name: "lint" }],
      [],
      true,
    ],
    [
      "allowed check conclusions",
      [
        success,
        { ...success, name: "lint", conclusion: "neutral" },
        { ...success, name: "docs", conclusion: "skipped" },
      ],
      [{ context: "legacy", state: "success" }],
      false,
    ],
    [
      "pending status",
      [success],
      [{ context: "deploy", state: "pending" }],
      true,
    ],
    [
      "failed status",
      [success],
      [{ context: "deploy", state: "failure" }],
      true,
    ],
  ];

  for (const [name, checks, statuses, shouldFail] of cases) {
    assert.equal(
      checkStateFailures(checks, statuses).length > 0,
      shouldFail,
      name,
    );
  }
});

test("PR relation gate binds repository, branch, issue, SHA, and lifecycle", () => {
  const sha = "a".repeat(40);
  const baseSha = "0".repeat(40);
  const valid = {
    number: 940,
    state: "open",
    draft: false,
    mergeable: true,
    body: "Closes #40",
    base: { ref: "main", sha: baseSha, repo: { full_name: "aroido/gyeop" } },
    head: { ref: "codex/issue-40", sha, repo: { full_name: "aroido/gyeop" } },
  };
  const expected = {
    repo: "aroido/gyeop",
    mainBranch: "main",
    baseSha,
    issueNumber: 40,
    branch: "codex/issue-40",
    sha,
    requireOpen: true,
    requireMergeable: true,
  };
  const cases = [
    ["valid", () => {}, false],
    ["base branch", (pr) => (pr.base.ref = "develop"), true],
    ["base SHA", (pr) => (pr.base.sha = "1".repeat(40)), true],
    ["base repository", (pr) => (pr.base.repo.full_name = "other/gyeop"), true],
    ["head repository", (pr) => (pr.head.repo.full_name = "fork/gyeop"), true],
    ["head branch", (pr) => (pr.head.ref = "codex/issue-41"), true],
    ["head SHA", (pr) => (pr.head.sha = "b".repeat(40)), true],
    ["wrong close clause", (pr) => (pr.body = "Closes #400"), true],
    ["trailing punctuation", (pr) => (pr.body = "Closes #40."), true],
    [
      "negated inline phrase",
      (pr) => (pr.body = "This does not close #40."),
      true,
    ],
    [
      "inline code example",
      (pr) => (pr.body = "Example only: `Closes #40`"),
      true,
    ],
    ["alternate keyword", (pr) => (pr.body = "Fixes #40"), true],
    ["hyphenated negation", (pr) => (pr.body = "do-not-close #40"), true],
    [
      "additional close clause",
      (pr) => (pr.body = "Closes #40\nCloses #999"),
      true,
    ],
    [
      "alternate additional close clause",
      (pr) => (pr.body = "Closes #40\nFixes #999"),
      true,
    ],
    [
      "colon additional close clause",
      (pr) => (pr.body = "Closes #40\nFixes: #999"),
      true,
    ],
    [
      "cross-repository close clause",
      (pr) => (pr.body = "Closes #40\nResolves other/repo#999"),
      true,
    ],
    [
      "colon cross-repository close clause",
      (pr) => (pr.body = "Closes #40\nRESOLVES: other/repo#999"),
      true,
    ],
    ["fenced example", (pr) => (pr.body = "```text\nCloses #40\n```"), true],
    [
      "tilde fenced example",
      (pr) => (pr.body = "~~~markdown\nCloses #40\n~~~"),
      true,
    ],
    ["state", (pr) => (pr.state = "closed"), true],
    ["draft", (pr) => (pr.draft = true), true],
    ["mergeable", (pr) => (pr.mergeable = false), true],
  ];

  for (const [name, mutate, shouldFail] of cases) {
    const pr = structuredClone(valid);
    mutate(pr);
    assert.equal(prRelationFailures(pr, expected).length > 0, shouldFail, name);
  }

  const merged = {
    ...structuredClone(valid),
    state: "closed",
    merged_at: "2026-07-16T00:00:00Z",
    merge_commit_sha: "c".repeat(40),
  };
  const mergedExpected = {
    ...expected,
    requireOpen: false,
    requireMergeable: false,
    requireMerged: true,
  };
  assert.deepEqual(prRelationFailures(merged, mergedExpected), []);
  for (const field of ["merged_at", "merge_commit_sha"]) {
    const incomplete = structuredClone(merged);
    incomplete[field] = null;
    assert.ok(prRelationFailures(incomplete, mergedExpected).length > 0, field);
  }
  const missingHeadSha = structuredClone(merged);
  delete missingHeadSha.head.sha;
  assert.match(
    prRelationFailures(missingHeadSha, mergedExpected).join("\n"),
    /head SHA evidence/,
  );
});

test("worktree porcelain parser preserves linked and detached entries", () => {
  const entries = parseWorktrees(`worktree /tmp/gyeop
HEAD ${"a".repeat(40)}
branch refs/heads/main

worktree /tmp/gyeop-worktrees/issue-40
HEAD ${"b".repeat(40)}
branch refs/heads/codex/issue-40

worktree /tmp/detached
HEAD ${"c".repeat(40)}
detached
`);

  assert.deepEqual(entries, [
    { worktree: "/tmp/gyeop", head: "a".repeat(40), branch: "refs/heads/main" },
    {
      worktree: "/tmp/gyeop-worktrees/issue-40",
      head: "b".repeat(40),
      branch: "refs/heads/codex/issue-40",
    },
    { worktree: "/tmp/detached", head: "c".repeat(40), detached: true },
  ]);
});

test("QA gate requires reviewer and zero P0/P1 findings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gyeop-qa-fields-"));
  const valid = completeQaText();
  const cases = [
    ["valid", valid, false, null],
    [
      "blank reviewer",
      valid.replace("Reviewer Agent: issue40_qa", "Reviewer Agent:   "),
      true,
      /reviewer/,
    ],
    ["TODO reviewer", valid.replace("issue40_qa", "TODO"), true, /reviewer/],
    ["TBD reviewer", valid.replace("issue40_qa", "TBD"), true, /reviewer/],
    [
      "Not run reviewer",
      valid.replace("issue40_qa", "Not run"),
      true,
      /reviewer/,
    ],
    [
      "missing findings count",
      valid.replace("P0/P1 Findings: 0\n", ""),
      true,
      /P0\/P1/,
    ],
    [
      "nonzero findings",
      valid.replace("P0/P1 Findings: 0", "P0/P1 Findings: 1"),
      true,
      /P0\/P1/,
    ],
    [
      "failed verify",
      valid.replace("Result: PASS", "Result: FAIL"),
      false,
      null,
    ],
    [
      "verify not run",
      valid.replace("Result: PASS", "Result: Not run"),
      false,
      null,
    ],
    [
      "descriptive fields do not interfere",
      `${valid}\nPrevious Status: FAIL\nExpected Result: FAIL\n`,
      false,
      null,
    ],
    [
      "descriptive status cannot replace exact field",
      valid.replace("Status: PASS", "Previous Status: PASS"),
      true,
      /Status: PASS/,
    ],
    ["duplicate status", `${valid}\nStatus: FAIL\n`, true, /Status: PASS/],
    [
      "duplicate reviewer",
      `${valid}\nReviewer Agent: another_agent\n`,
      true,
      /reviewer/,
    ],
    ["duplicate findings", `${valid}\nP0/P1 Findings: 1\n`, true, /P0\/P1/],
    [
      "duplicate full verify block",
      `${valid}\n- Command: ./scripts/run-ai-verify --mode full\n- Result: FAIL\n`,
      false,
      null,
    ],
  ];

  for (const [
    index,
    [name, contents, shouldFail, pattern],
  ] of cases.entries()) {
    const file = path.join(dir, `${index}.md`);
    fs.writeFileSync(file, contents);
    const failures = qaFailures(file);
    assert.equal(failures.length > 0, shouldFail, name);
    if (pattern) assert.match(failures.join("\n"), pattern, name);
  }
});

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    input: options.input,
    encoding: "utf8",
  });
}

function gitResult(cwd, ...args) {
  return command(realGit, args, { cwd });
}

function git(cwd, ...args) {
  const result = gitResult(cwd, ...args);
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed\n${result.stderr}${result.stdout}`,
  );
  return result.stdout.trim();
}

function writeExecutable(file, lines) {
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  fs.chmodSync(file, 0o755);
}

function fakeGitLines() {
  return [
    "#!/usr/bin/env node",
    'const { spawnSync } = require("node:child_process");',
    'const fs = require("node:fs");',
    "const args = process.argv.slice(2);",
    'fs.appendFileSync(process.env.FAKE_CALL_LOG, JSON.stringify({ tool: "git", cwd: process.cwd(), args }) + "\\n");',
    'if (process.env.FAKE_ORIGIN_REPO_URL && args[0] === "remote" && args[1] === "get-url" && args.at(-1) === "origin") {',
    '  const overrideFile = args.includes("--push") ? process.env.FAKE_ORIGIN_PUSH_URL_FILE : process.env.FAKE_ORIGIN_FETCH_URL_FILE;',
    '  const fileUrl = overrideFile && fs.existsSync(overrideFile) ? fs.readFileSync(overrideFile, "utf8").trim() : "";',
    '  const url = fileUrl || (args.includes("--push") && process.env.FAKE_ORIGIN_PUSH_URL ? process.env.FAKE_ORIGIN_PUSH_URL : process.env.FAKE_ORIGIN_REPO_URL);',
    '  if (args.includes("--push") && process.env.FAKE_GH_STATE && fs.existsSync(process.env.FAKE_GH_STATE)) {',
    '    const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8"));',
    '    if (state.driftIssueOnOriginCheck) { state.issue = { ...state.issue, labels: [{ name: "status:blocked" }, { name: "blocked-from:qa" }] }; delete state.driftIssueOnOriginCheck; fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state)); }',
    "  }",
    "  process.stdout.write(`${url}\\n`); process.exit(0);",
    "}",
    "let input = Buffer.alloc(0); try { input = fs.readFileSync(0); } catch {}",
    'if (process.env.FAKE_LINK_QUARANTINE_BEFORE_CAS && args[0] === "update-ref" && args[1] === "-d" && args[2]?.endsWith("-cleanup-quarantine")) {',
    '  const linked = spawnSync(process.env.REAL_GIT, ["worktree", "add", process.env.FAKE_LINK_QUARANTINE_BEFORE_CAS, args[2]], { cwd: process.cwd(), env: process.env, encoding: "utf8" });',
    "  if (linked.status !== 0) { process.stderr.write(linked.stderr); process.exit(1); }",
    "}",
    'if (process.env.FAKE_LOCAL_DRIFT_BEFORE_CAS === "1" && args[0] === "update-ref" && args[1] === "-d" && args[2]?.endsWith("-cleanup-quarantine")) {',
    "  const ref = args[2]; const expected = args[3];",
    '  const tree = spawnSync(process.env.REAL_GIT, ["rev-parse", `${expected}^{tree}`], { cwd: process.cwd(), env: process.env, encoding: "utf8" });',
    '  const commit = spawnSync(process.env.REAL_GIT, ["commit-tree", tree.stdout.trim(), "-p", expected, "-m", "local cleanup drift"], { cwd: process.cwd(), env: process.env, encoding: "utf8" });',
    "  const driftSha = commit.stdout.trim();",
    '  const drift = spawnSync(process.env.REAL_GIT, ["update-ref", ref, driftSha, expected], { cwd: process.cwd(), env: process.env, encoding: "utf8" });',
    "  if (tree.status !== 0 || commit.status !== 0 || drift.status !== 0) { process.stderr.write(tree.stderr || commit.stderr || drift.stderr); process.exit(1); }",
    "  if (process.env.FAKE_DRIFT_SHA_FILE) fs.writeFileSync(process.env.FAKE_DRIFT_SHA_FILE, driftSha);",
    "}",
    'if (process.env.FAKE_FAIL_RESUME_WORKTREE_ADD === "1" && args[0] === "worktree" && args[1] === "add") {',
    '  fs.mkdirSync(args[2], { recursive: true }); process.stderr.write("simulated worktree add interruption"); process.exit(1);',
    "}",
    "const forwardedArgs = args.map((arg) => arg === process.env.FAKE_ORIGIN_REPO_URL ? process.env.FAKE_REAL_ORIGIN : arg);",
    'const result = spawnSync(process.env.REAL_GIT, forwardedArgs, { cwd: process.cwd(), env: process.env, input, encoding: "utf8" });',
    'if (result.status === 0 && process.env.FAKE_RESUME_GITHUB_DRIFT_AFTER_STATUS && args[0] === "status" && args[1] === "--porcelain=v1") {',
    '  const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8")); state.resumeStatusChecks = (state.resumeStatusChecks || 0) + 1;',
    "  if (state.resumeStatusChecks === 2) {",
    '    if (process.env.FAKE_RESUME_GITHUB_DRIFT_AFTER_STATUS === "blocked") state.issue = { ...state.issue, labels: [{ name: "status:blocked" }, { name: "blocked-from:qa" }] };',
    '    if (process.env.FAKE_RESUME_GITHUB_DRIFT_AFTER_STATUS === "closed") state.issue = { ...state.issue, state: "closed" };',
    '    if (process.env.FAKE_RESUME_GITHUB_DRIFT_AFTER_STATUS === "merged") state.allPrPages = [[{ number: 1240, merged_at: "2026-07-16T00:00:00Z" }]];',
    "  }",
    "  fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state));",
    "}",
    'if (result.status === 0 && process.env.FAKE_DRIFT_ISSUE_ON_FETCH === "1" && args[0] === "fetch") {',
    '  const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8"));',
    '  state.issue = { ...state.issue, labels: [{ name: "status:blocked" }, { name: "blocked-from:ready" }] };',
    "  fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state));",
    "}",
    'if (result.status === 0 && process.env.FAKE_CHANGE_PUSH_URL_AFTER_LOCAL_DELETE === "1" && args[0] === "update-ref" && args[1] === "-d" && args[2]?.endsWith("-cleanup-quarantine")) {',
    '  fs.writeFileSync(process.env.FAKE_ORIGIN_PUSH_URL_FILE, "git@github.com:other/gyeop.git\\n");',
    "}",
    'if (result.status === 0 && process.env.FAKE_RESTORE_REMOTE_TRACKING === "1" && args[0] === "push") {',
    '  const deletion = args.find((arg) => arg.startsWith(":refs/heads/"));',
    '  const lease = args.find((arg) => arg.startsWith("--force-with-lease="));',
    "  if (deletion && lease) {",
    '    const branch = deletion.slice(":refs/heads/".length);',
    '    const sha = lease.slice(lease.lastIndexOf(":") + 1);',
    '    spawnSync(process.env.REAL_GIT, ["update-ref", `refs/remotes/origin/${branch}`, sha], { cwd: process.cwd(), env: process.env });',
    "  }",
    "}",
    "if (result.stdout) process.stdout.write(result.stdout);",
    "if (result.stderr) process.stderr.write(result.stderr);",
    "if (result.error) process.stderr.write(result.error.message);",
    "process.exit(result.status ?? 1);",
  ];
}

function fakeGhLines() {
  return [
    "#!/usr/bin/env node",
    'const { spawnSync } = require("node:child_process");',
    'const fs = require("node:fs");',
    "const args = process.argv.slice(2);",
    'const methodIndex = args.indexOf("-X");',
    'const method = methodIndex >= 0 ? args[methodIndex + 1] : "GET";',
    'const endpoint = args.find((arg) => arg.startsWith("repos/")) || "";',
    'let raw = ""; try { raw = fs.readFileSync(0, "utf8"); } catch {}',
    "let payload = null; if (raw.trim()) { try { payload = JSON.parse(raw); } catch { payload = raw; } }",
    'fs.appendFileSync(process.env.FAKE_CALL_LOG, JSON.stringify({ tool: "gh", method, endpoint, payload, args }) + "\\n");',
    'const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8"));',
    "const save = () => fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state));",
    "const issueNumber = Number(endpoint.match(/\\/issues\\/(\\d+)(?:\\/|$|\\?)/)?.[1] || 0);",
    "const readIssue = (number) => state.issues?.[number] || state.issue;",
    "let response;",
    'if (args[0] === "pr" && args[1] === "ready") {',
    '  state.pr = { ...(state.createdPr || state.pr), state: "open", draft: false };',
    "  state.openPrs = [state.pr];",
    "  if (state.failPrGetsAfterReady) state.prGetFailures = state.failPrGetsAfterReady;",
    "  save(); process.exit(0);",
    "}",
    'if (args[0] === "project" && args[1] === "view") {',
    "  response = { id: state.project.id, number: state.project.number, owner: { login: state.project.owner } };",
    "}",
    'else if (args[0] === "project" && args[1] === "field-list") {',
    "  response = { totalCount: state.project.fields.length, fields: state.project.fields };",
    "}",
    'else if (args[0] === "project" && args[1] === "item-add") {',
    '  const url = args[args.indexOf("--url") + 1]; state.project.itemExists = true;',
    '  response = { id: state.project.itemId, type: "Issue", url }; save();',
    "}",
    'else if (args[0] === "project" && args[1] === "item-edit") {',
    '  const fieldId = args[args.indexOf("--field-id") + 1];',
    "  if (state.project.failEditFieldId === fieldId) { state.project.failEditFieldId = null; save(); process.stderr.write(`project edit failed for ${fieldId}`); process.exit(1); }",
    '  const optionIndex = args.indexOf("--single-select-option-id");',
    '  if (args.includes("--clear")) delete state.project.values[fieldId];',
    "  else { const optionId = args[optionIndex + 1]; const field = state.project.fields.find((candidate) => candidate.id === fieldId); const option = field.options.find((candidate) => candidate.id === optionId); state.project.values[fieldId] = { name: option.name, optionId }; }",
    "  response = { id: state.project.itemId }; save();",
    "}",
    'else if (args[0] === "api" && args[1] === "graphql") {',
    "  const operationName = payload.operationName; const project = state.project; const projectIssue = Object.values(state.issues || {}).find((candidate) => candidate.node_id === payload.variables.id) || state.issue;",
    '  if (operationName === "ProjectAccess") response = { data: { node: { __typename: "ProjectV2", id: project.id, number: project.number, viewerCanUpdate: project.viewerCanUpdate !== false, owner: { login: project.owner } } } };',
    '  else if (operationName === "ProjectMemberships") response = { data: { node: { __typename: "Issue", id: projectIssue.node_id, url: projectIssue.html_url, projectItems: { nodes: project.itemExists === false ? [] : [{ id: project.itemId, isArchived: false, project: { id: project.id, number: project.number, owner: { login: project.owner } } }], pageInfo: { hasNextPage: false, endCursor: null } } } } };',
    '  else if (operationName === "ProjectItemState") response = { data: { node: { __typename: "ProjectV2Item", id: project.itemId, isArchived: false, project: { id: project.id, number: project.number, owner: { login: project.owner } }, content: { id: projectIssue.node_id, number: projectIssue.number, url: projectIssue.html_url, repository: { nameWithOwner: "aroido/gyeop" } }, fieldValues: { nodes: Object.entries(project.values).map(([fieldId, value]) => ({ ...value, field: { id: fieldId, name: project.fields.find((field) => field.id === fieldId).name } })), pageInfo: { hasNextPage: false, endCursor: null } } } } };',
    "  else { process.stderr.write(`unexpected GraphQL operation: ${operationName}`); process.exit(1); }",
    "}",
    'else if (method === "GET" && /\\/issues\\?/.test(endpoint)) {',
    '  const page = Number(new URLSearchParams(endpoint.split("?")[1]).get("page") || 1);',
    "  if (state.failBacklogPage === page) { process.stderr.write(`backlog page ${page} failed`); process.exit(1); }",
    "  response = state.backlogPages?.[page - 1] || [];",
    "}",
    'else if (method === "GET" && /\\/issues\\/\\d+$/.test(endpoint)) {',
    "  if (state.issueGetFailures?.[issueNumber] > 0) { state.issueGetFailures[issueNumber] -= 1; save(); process.stderr.write(`issue ${issueNumber} GET failed`); process.exit(1); }",
    "  state.issueReadCount = (state.issueReadCount || 0) + 1; save();",
    '  if (state.driftIssueOnGetNumber === state.issueReadCount) { const current = readIssue(issueNumber); const drifted = { ...current, labels: [{ name: "status:blocked" }, { name: "blocked-from:qa" }] }; if (state.issues) state.issues[issueNumber] = drifted; else state.issue = drifted; save(); }',
    "  if (issueNumber === 40 && (state.reopenPredecessorOnWorkflowRead || state.dirtyWorktreeOnWorkflowRead || state.invalidSpecOnWorkflowRead)) {",
    "    state.workflowIssueReads = (state.workflowIssueReads || 0) + 1;",
    '    if (state.workflowIssueReads === state.reopenPredecessorOnWorkflowRead) { state.issues[1] = { ...state.issues[1], state: "open" }; delete state.reopenPredecessorOnWorkflowRead; }',
    '    if (state.workflowIssueReads === state.dirtyWorktreeOnWorkflowRead) { fs.appendFileSync(`${process.env.FAKE_TASK_PATH}/task.txt`, "race dirty\\n"); delete state.dirtyWorktreeOnWorkflowRead; }',
    "    if (state.workflowIssueReads === state.invalidSpecOnWorkflowRead) {",
    "      const specFile = `${process.env.FAKE_TASK_PATH}/docs/specs/issue-40.md`;",
    '      fs.writeFileSync(specFile, fs.readFileSync(specFile, "utf8").replace("Status: Reviewed", "Status: Draft"));',
    '      const add = spawnSync(process.env.REAL_GIT, ["add", "docs/specs/issue-40.md"], { cwd: process.env.FAKE_TASK_PATH, env: process.env, encoding: "utf8" });',
    '      const commit = spawnSync(process.env.REAL_GIT, ["commit", "-m", "spec drift"], { cwd: process.env.FAKE_TASK_PATH, env: process.env, encoding: "utf8" });',
    "      if (add.status !== 0 || commit.status !== 0) { process.stderr.write(add.stderr || commit.stderr); process.exit(1); }",
    "      delete state.invalidSpecOnWorkflowRead;",
    "    }",
    "    save();",
    "  }",
    "  if (issueNumber === 40 && state.issueSequence?.length) {",
    "    const index = Math.min(state.issueGetIndex || 0, state.issueSequence.length - 1);",
    "    response = state.issueSequence[index]; state.issueGetIndex = (state.issueGetIndex || 0) + 1; save();",
    "  } else response = readIssue(issueNumber);",
    "}",
    'else if (method === "PUT" && /\\/issues\\/\\d+\\/labels$/.test(endpoint)) {',
    '  if (state.failLabelPutOnce) { state.failLabelPutOnce = false; save(); process.stderr.write("label write failed"); process.exit(1); }',
    "  if (state.failLabelPutIssues?.includes(issueNumber)) { process.stderr.write(`issue ${issueNumber} label write failed`); process.exit(1); }",
    "  const current = readIssue(issueNumber);",
    "  const updated = { ...current, labels: payload.labels.map((name) => ({ name })) };",
    "  if (state.issues) state.issues[issueNumber] = updated; else state.issue = updated;",
    "  response = state.labelPutResponseByIssue?.[issueNumber] || state.labelPutResponseLabels || updated.labels;",
    "  if (state.labelGetMismatchAfterPut) {",
    "    const drifted = { ...updated, labels: state.labelGetMismatchAfterPut.map((name) => ({ name })) };",
    "    if (state.issues) state.issues[issueNumber] = drifted; else state.issue = drifted;",
    "  }",
    "  if (state.labelGetMismatchAfterPutByIssue?.[issueNumber]) { const drifted = { ...updated, labels: state.labelGetMismatchAfterPutByIssue[issueNumber].map((name) => ({ name })) }; if (state.issues) state.issues[issueNumber] = drifted; else state.issue = drifted; }",
    "  if (state.failIssueGetAfterLabelPut?.includes(issueNumber)) state.issueGetFailures = { ...(state.issueGetFailures || {}), [issueNumber]: 1 };",
    "  if (issueNumber === 40 && state.issueSequence?.length) { state.issueSequence = []; state.issueGetIndex = 0; }",
    "  if (state.failLabelPutResponseIssues?.includes(issueNumber)) { save(); process.stderr.write(`issue ${issueNumber} label response lost`); process.exit(1); }",
    "  save();",
    "}",
    'else if (method === "GET" && /\\/issues\\/40\\/comments\\?/.test(endpoint)) response = state.comments || [];',
    'else if (method === "POST" && /\\/issues\\/40\\/comments$/.test(endpoint)) {',
    '  if (state.failCommentPostOnce) { state.failCommentPostOnce = false; save(); process.stderr.write("comment write failed"); process.exit(1); }',
    "  const comment = { id: (state.comments || []).length + 1, body: payload.body };",
    "  state.comments = [...(state.comments || []), comment];",
    "  state.issue.comments = state.comments.length;",
    "  response = comment; save();",
    "}",
    'else if (method === "PATCH" && /\\/issues\\/40$/.test(endpoint)) {',
    '  if (state.failIssuePatchOnce) { state.failIssuePatchOnce = false; save(); process.stderr.write("issue patch failed"); process.exit(1); }',
    "  state.issue = { ...state.issue, ...payload }; response = state.issue; save();",
    "}",
    'else if (method === "GET" && /\\/pulls\\?/.test(endpoint)) {',
    '  const query = new URLSearchParams(endpoint.split("?")[1]); const page = Number(query.get("page") || 1);',
    '  response = query.get("state") === "all" && state.allPrPages ? state.allPrPages[page - 1] || [] : state.openPrs || [];',
    '  if (query.get("state") === "all" && process.env.FAKE_CHANGE_FETCH_URL_AFTER_RESUME_PULLS === "1") fs.writeFileSync(process.env.FAKE_ORIGIN_FETCH_URL_FILE, "git@github.com:other/gyeop.git\\n");',
    '  if (query.get("state") === "all" && process.env.FAKE_RESUME_PULL_RACE && !state.resumePullRaceApplied) {',
    '    const branchRef = "refs/heads/codex/issue-40"; let race;',
    '    if (process.env.FAKE_RESUME_PULL_RACE === "remote-create") race = spawnSync(process.env.REAL_GIT, ["--git-dir", process.env.FAKE_REAL_ORIGIN, "update-ref", branchRef, process.env.FAKE_REMOTE_TASK_SHA], { encoding: "utf8" });',
    '    if (process.env.FAKE_RESUME_PULL_RACE === "remote-move") race = spawnSync(process.env.REAL_GIT, ["--git-dir", process.env.FAKE_REAL_ORIGIN, "update-ref", branchRef, process.env.FAKE_REMOTE_RACE_SHA, process.env.FAKE_REMOTE_TASK_SHA], { encoding: "utf8" });',
    '    if (process.env.FAKE_RESUME_PULL_RACE === "remote-delete") race = spawnSync(process.env.REAL_GIT, ["--git-dir", process.env.FAKE_REAL_ORIGIN, "update-ref", "-d", branchRef, process.env.FAKE_REMOTE_TASK_SHA], { encoding: "utf8" });',
    '    if (process.env.FAKE_RESUME_PULL_RACE === "local-ref") race = spawnSync(process.env.REAL_GIT, ["update-ref", branchRef, process.env.FAKE_REMOTE_RACE_SHA, process.env.FAKE_REMOTE_TASK_SHA], { cwd: process.cwd(), encoding: "utf8" });',
    '    if (process.env.FAKE_RESUME_PULL_RACE === "registry") race = spawnSync(process.env.REAL_GIT, ["worktree", "add", "--detach", process.env.FAKE_RESUME_REGISTRY_DRIFT_PATH, "main"], { cwd: process.cwd(), encoding: "utf8" });',
    '    if (!race || race.status !== 0) { process.stderr.write(race?.stderr || "resume race setup failed"); process.exit(1); }',
    "    state.resumePullRaceApplied = true; save();",
    "  }",
    "}",
    'else if (method === "GET" && /\\/pulls\\/940$/.test(endpoint)) {',
    '  if (process.env.FAKE_CHANGE_FETCH_URL_AFTER_PR_GET === "1") fs.writeFileSync(process.env.FAKE_ORIGIN_FETCH_URL_FILE, "git@github.com:other/gyeop.git\\n");',
    '  if (state.prGetFailures > 0) { state.prGetFailures -= 1; save(); process.stderr.write("PR GET unavailable"); process.exit(1); }',
    "  state.prReadCount = (state.prReadCount || 0) + 1;",
    "  if (state.armIssueDriftOnOriginAfterPrGet === state.prReadCount) state.driftIssueOnOriginCheck = true;",
    "  if (state.prSequence?.length) {",
    "    const index = Math.min(state.prGetIndex || 0, state.prSequence.length - 1);",
    "    response = state.prSequence[index]; state.prGetIndex = (state.prGetIndex || 0) + 1; save();",
    "  } else { response = state.pr; save(); }",
    "}",
    'else if (method === "POST" && /\\/pulls$/.test(endpoint)) {',
    "  state.pr = state.createdPr; state.openPrs = [state.createdPr]; response = state.createdPr;",
    "  if (state.driftIssueAfterPrCreate) state.issue = { ...state.issue, labels: state.driftIssueAfterPrCreate.map((name) => ({ name })) };",
    "  if (state.armIssueDriftAfterPrCreateOrigin) state.driftIssueOnOriginCheck = true;",
    "  save();",
    "}",
    'else if (method === "PATCH" && /\\/pulls\\/940$/.test(endpoint)) {',
    "  state.pr = { ...state.pr, ...payload }; state.createdPr = { ...state.createdPr, ...payload }; state.openPrs = [state.pr]; response = state.pr; save();",
    "}",
    'else if (method === "GET" && endpoint.includes("/check-runs")) {',
    "  response = state.checks;",
    '  if (state.driftQaAfterChecks) fs.appendFileSync(`${process.env.FAKE_TASK_PATH}/docs/temp/qa/issue-40.md`, "\\nQA drift\\n");',
    "  if (state.driftIssueAfterChecks) { state.issue = { ...state.issue, labels: state.driftIssueAfterChecks.map((name) => ({ name })) }; save(); }",
    "}",
    'else if (method === "GET" && /\\/status$/.test(endpoint)) response = state.commitStatus;',
    'else if (method === "PUT" && /\\/pulls\\/940\\/merge$/.test(endpoint)) response = state.merge;',
    "else { process.stderr.write(`unexpected gh call: ${method} ${endpoint}`); process.exit(1); }",
    "process.stdout.write(JSON.stringify(response));",
  ];
}

function fakeVerifyLines() {
  return [
    "#!/usr/bin/env node",
    'const { spawnSync } = require("node:child_process");',
    'const fs = require("node:fs");',
    'fs.appendFileSync(process.env.FAKE_CALL_LOG, JSON.stringify({ tool: "verify", cwd: process.cwd() }) + "\\n");',
    'if (process.env.FAKE_VERIFY_MUTATION === "sha") {',
    '  const result = spawnSync("git", ["commit", "--allow-empty", "-m", "verify mutation"], { stdio: "inherit", env: process.env });',
    "  process.exit(result.status ?? 1);",
    "}",
    'if (process.env.FAKE_VERIFY_MUTATION === "qa") {',
    '  fs.appendFileSync("docs/temp/qa/issue-40.md", "\\nverify changed QA\\n");',
    "}",
    'if (process.env.FAKE_VERIFY_MUTATION === "pr-candidate-add") {',
    '  const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8"));',
    "  state.openPrs = [state.pr]; fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state));",
    "}",
    'if (process.env.FAKE_VERIFY_MUTATION === "pr-candidate-replace") {',
    '  const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8"));',
    "  state.openPrs = [{ ...state.pr, number: 941 }]; fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state));",
    "}",
    'if (process.env.FAKE_VERIFY_MUTATION === "pr-body") {',
    '  const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8"));',
    '  state.openPrs = [{ ...state.pr, body: "Closes #40\\nFixes: #999" }]; fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state));',
    "}",
    'if (process.env.FAKE_VERIFY_MUTATION === "remote-head") {',
    '  const result = spawnSync(process.env.REAL_GIT, ["--git-dir", process.env.FAKE_REAL_ORIGIN, "update-ref", "refs/heads/codex/issue-40", process.env.FAKE_REMOTE_RACE_SHA], { encoding: "utf8" });',
    "  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }",
    "}",
    'if (process.env.FAKE_VERIFY_MUTATION === "origin-pushurl") {',
    '  fs.writeFileSync(process.env.FAKE_ORIGIN_PUSH_URL_FILE, "git@github.com:other/gyeop.git\\n");',
    "}",
    'if (process.env.FAKE_VERIFY_MUTATION === "issue-state") {',
    '  const state = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, "utf8"));',
    '  state.issue = { ...state.issue, labels: [{ name: "status:blocked" }, { name: "blocked-from:qa" }] };',
    "  fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state));",
    "}",
  ];
}

function openPr(taskSha, baseSha) {
  return {
    number: 940,
    title: "[운영] task harness 안전성 강화",
    html_url: "https://github.com/aroido/gyeop/pull/940",
    state: "open",
    draft: false,
    mergeable: true,
    body: `Closes #40\n\n- 검증 HEAD: \`${taskSha}\``,
    base: { ref: "main", sha: baseSha, repo: { full_name: "aroido/gyeop" } },
    head: {
      ref: "codex/issue-40",
      sha: taskSha,
      repo: { full_name: "aroido/gyeop" },
    },
  };
}

function issueState(state = "open") {
  return {
    number: 40,
    node_id: "I_40",
    html_url: "https://github.com/aroido/gyeop/issues/40",
    title: "[운영] task harness 안전성 강화",
    state,
    comments: 0,
    labels: [{ name: "status:qa" }],
  };
}

function fakeProjectState(overrides = {}) {
  const definitions = [
    ["Status", ["Todo", "In Progress", "Done"]],
    [
      "작업 상태",
      [
        "선행 작업 대기",
        "준비",
        "스펙 작성",
        "구현 중",
        "품질 검증",
        "차단",
        "완료",
      ],
    ],
    ["우선순위", ["P0", "P1", "P2"]],
    [
      "작업 유형",
      [
        "기획",
        "디자인",
        "프론트엔드",
        "백엔드",
        "데이터",
        "안전",
        "QA",
        "운영",
      ],
    ],
  ];
  return {
    id: "PVT_TEST",
    number: 5,
    owner: "aroido",
    viewerCanUpdate: true,
    itemId: "PVTI_TEST",
    itemExists: true,
    values: {},
    fields: definitions.map(([name, options], fieldIndex) => ({
      id: `PVTSSF_${fieldIndex}`,
      name,
      type: "ProjectV2SingleSelectField",
      options: options.map((option, optionIndex) => ({
        id: `OPTION_${fieldIndex}_${optionIndex}`,
        name: option,
      })),
    })),
    ...overrides,
  };
}

function writeGhState(fixture, overrides = {}) {
  const pr = openPr(fixture.taskSha, fixture.baseSha);
  const state = {
    issue: issueState(),
    pr,
    openPrs: [],
    createdPr: { ...structuredClone(pr), draft: true },
    comments: [],
    checks: {
      total_count: 1,
      check_runs: [
        { name: "verify", status: "completed", conclusion: "success" },
      ],
    },
    commitStatus: { total_count: 0, statuses: [] },
    merge: { merged: true, sha: "c".repeat(40) },
    project: fakeProjectState(),
    ...overrides,
  };
  fs.writeFileSync(fixture.ghState, JSON.stringify(state));
}

function makeRepoFixture(t) {
  assert.ok(realGit, "git executable is required");
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "gyeop-harness-")),
  );
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  const worktreeRoot = path.join(root, "worktrees");
  const task = path.join(worktreeRoot, "issue-40");
  const fakeBin = path.join(root, "fake-bin");
  const callLog = path.join(root, "calls.jsonl");
  const ghState = path.join(root, "gh-state.json");
  const driftShaFile = path.join(root, "drift-sha");
  const originPushUrlFile = path.join(root, "origin-push-url");
  const originFetchUrlFile = path.join(root, "origin-fetch-url");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  git(root, "init", "--bare", origin);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "GYEOP Test");
  git(repo, "config", "user.email", "test@gyeop.local");
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(repo, "docs/specs"), { recursive: true });
  fs.mkdirSync(path.join(repo, "docs/temp/qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".gitignore"), "docs/temp/\n*.unsafe\n");
  fs.writeFileSync(path.join(repo, "README.md"), "fixture\n");
  fs.writeFileSync(
    path.join(repo, "docs/specs/issue-40.md"),
    completeSpecText(),
  );
  fs.writeFileSync(
    path.join(repo, "docs/temp/qa/issue-40.md"),
    completeQaText(),
  );
  writeExecutable(path.join(repo, "scripts/run-ai-verify"), fakeVerifyLines());
  git(repo, "add", ".");
  git(repo, "commit", "-m", "seed");
  const baseSha = git(repo, "rev-parse", "HEAD");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-u", "origin", "main");
  fs.mkdirSync(worktreeRoot, { recursive: true });
  git(repo, "worktree", "add", "-b", "codex/issue-40", task, "main");
  fs.mkdirSync(path.join(task, "docs/temp/qa"), { recursive: true });
  fs.writeFileSync(
    path.join(task, "docs/temp/qa/issue-40.md"),
    completeQaText(),
  );
  fs.writeFileSync(path.join(task, "task.txt"), "issue 40\n");
  git(task, "add", "task.txt");
  git(task, "commit", "-m", "issue 40");
  const taskSha = git(task, "rev-parse", "HEAD");
  git(task, "push", "-u", "origin", "codex/issue-40");

  writeExecutable(path.join(fakeBin, "git"), fakeGitLines());
  writeExecutable(path.join(fakeBin, "gh"), fakeGhLines());
  const fixture = {
    root,
    origin,
    repo,
    worktreeRoot,
    task,
    fakeBin,
    callLog,
    ghState,
    driftShaFile,
    originPushUrlFile,
    originFetchUrlFile,
    baseSha,
    taskSha,
  };
  fixture.env = {
    ...process.env,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
    REAL_GIT: realGit,
    FAKE_CALL_LOG: callLog,
    FAKE_GH_STATE: ghState,
    FAKE_TASK_PATH: task,
    FAKE_ORIGIN_REPO_URL: "https://github.com/aroido/gyeop.git",
    FAKE_ORIGIN_PUSH_URL_FILE: originPushUrlFile,
    FAKE_ORIGIN_FETCH_URL_FILE: originFetchUrlFile,
    FAKE_REAL_ORIGIN: origin,
    FAKE_REMOTE_RACE_SHA: baseSha,
    FAKE_REMOTE_TASK_SHA: taskSha,
    FAKE_DRIFT_SHA_FILE: driftShaFile,
    GYEOP_GITHUB_REPO: "aroido/gyeop",
    GYEOP_MAIN_BRANCH: "main",
    GYEOP_WORKTREE_ROOT: worktreeRoot,
  };
  delete fixture.env.GYEOP_GITHUB_OWNER;
  delete fixture.env.GYEOP_GITHUB_PROJECT_NUMBER;
  writeGhState(fixture);
  return fixture;
}

function runHarness(fixture, cwd, args, env = {}) {
  return command(process.execPath, [harnessPath, ...args], {
    cwd,
    env: { ...fixture.env, ...env },
  });
}

function readCalls(fixture) {
  if (!fs.existsSync(fixture.callLog)) return [];
  return fs
    .readFileSync(fixture.callLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readGhState(fixture) {
  return JSON.parse(fs.readFileSync(fixture.ghState, "utf8"));
}

test("project-sync uses the three GraphQL boundaries and converges fields", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    issue: {
      ...issueState(),
      labels: [
        { name: "status:qa" },
        { name: "priority:p0" },
        { name: "type:ops" },
      ],
    },
  });

  const result = runHarness(fixture, fixture.task, ["project-sync", "40"], {
    GYEOP_GITHUB_OWNER: "aroido",
    GYEOP_GITHUB_PROJECT_NUMBER: "5",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.projectSynced, true);
  assert.deepEqual(output.changedFields, [
    "Status",
    "작업 상태",
    "우선순위",
    "작업 유형",
  ]);
  assert.deepEqual(
    Object.values(readGhState(fixture).project.values).map(({ name }) => name),
    ["In Progress", "품질 검증", "P0", "운영"],
  );

  const operations = readCalls(fixture)
    .map((call) => call.payload?.operationName)
    .filter(Boolean);
  assert.deepEqual(operations, [
    "ProjectAccess",
    "ProjectMemberships",
    "ProjectItemState",
    "ProjectItemState",
  ]);
});

test("explicit project-sync without configuration makes no Project call", (t) => {
  const fixture = makeRepoFixture(t);
  const labelsBefore = readGhState(fixture).issue.labels;
  const result = runHarness(fixture, fixture.task, ["project-sync", "40"], {
    GYEOP_GITHUB_OWNER: "",
    GYEOP_GITHUB_PROJECT_NUMBER: "",
  });

  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /Set GYEOP_GITHUB_PROJECT_NUMBER/);
  assert.deepEqual(readGhState(fixture).issue.labels, labelsBefore);
  assert.equal(
    readCalls(fixture).filter(
      (call) => call.args[0] === "project" || call.payload?.operationName,
    ).length,
    0,
  );
});

test("partial Project edit reports confirmed fields and preserves labels", (t) => {
  const fixture = makeRepoFixture(t);
  const issue = {
    ...issueState(),
    labels: [
      { name: "status:qa" },
      { name: "priority:p0" },
      { name: "type:ops" },
    ],
  };
  writeGhState(fixture, {
    issue,
    project: fakeProjectState({ failEditFieldId: "PVTSSF_1" }),
  });

  const result = runHarness(fixture, fixture.task, ["project-sync", "40"], {
    GYEOP_GITHUB_OWNER: "aroido",
    GYEOP_GITHUB_PROJECT_NUMBER: "5",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  const error = JSON.parse(result.stderr);
  assert.equal(error.authoritativeStatus, "status:qa");
  assert.equal(error.projectSynced, false);
  assert.deepEqual(error.confirmedChangedFields, ["Status"]);
  assert.deepEqual(error.recoveryCommands, [
    "scripts/task-harness project-sync 40",
  ]);
  const state = readGhState(fixture);
  assert.deepEqual(state.issue.labels, issue.labels);
  assert.deepEqual(Object.keys(state.project.values), ["PVTSSF_0"]);
  assert.equal(
    readCalls(fixture).filter(
      (call) => call.args[0] === "project" && call.args[1] === "item-edit",
    ).length,
    2,
  );
});

test("project-add creates missing membership and synchronizes fields", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    issue: {
      ...issueState(),
      labels: [
        { name: "status:qa" },
        { name: "priority:p0" },
        { name: "type:ops" },
      ],
    },
    project: fakeProjectState({ itemExists: false }),
  });
  const result = runHarness(fixture, fixture.task, ["project-add", "40"], {
    GYEOP_GITHUB_OWNER: "aroido",
    GYEOP_GITHUB_PROJECT_NUMBER: "5",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const state = readGhState(fixture);
  assert.equal(state.project.itemExists, true);
  assert.deepEqual(
    Object.values(state.project.values).map(({ name }) => name),
    ["In Progress", "품질 검증", "P0", "운영"],
  );
  assert.equal(
    readCalls(fixture).filter(
      (call) => call.args[0] === "project" && call.args[1] === "item-add",
    ).length,
    1,
  );
});

test("project-sync clears optional metadata that lost its source labels", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    project: fakeProjectState({
      values: {
        PVTSSF_0: { name: "In Progress", optionId: "OPTION_0_1" },
        PVTSSF_1: { name: "품질 검증", optionId: "OPTION_1_4" },
        PVTSSF_2: { name: "P1", optionId: "OPTION_2_1" },
        PVTSSF_3: { name: "디자인", optionId: "OPTION_3_1" },
      },
    }),
  });
  const result = runHarness(fixture, fixture.task, ["project-sync", "40"], {
    GYEOP_GITHUB_OWNER: "aroido",
    GYEOP_GITHUB_PROJECT_NUMBER: "5",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.deepEqual(Object.keys(readGhState(fixture).project.values), [
    "PVTSSF_0",
    "PVTSSF_1",
  ]);
  const clears = readCalls(fixture).filter(
    (call) =>
      call.args[0] === "project" &&
      call.args[1] === "item-edit" &&
      call.args.includes("--clear"),
  );
  assert.deepEqual(
    clears.map((call) => call.args[call.args.indexOf("--field-id") + 1]),
    ["PVTSSF_2", "PVTSSF_3"],
  );
});

test("configured status reports post-Project issue drift without rollback", (t) => {
  const baseline = makeRepoFixture(t);
  const env = {
    GYEOP_GITHUB_OWNER: "aroido",
    GYEOP_GITHUB_PROJECT_NUMBER: "5",
  };
  const baselineResult = runHarness(
    baseline,
    baseline.task,
    ["status", "40", "status:qa"],
    env,
  );
  assert.equal(
    baselineResult.status,
    0,
    `${baselineResult.stderr}\n${baselineResult.stdout}`,
  );
  const readCount = readCalls(baseline).filter(
    (call) => call.method === "GET" && /\/issues\/40$/.test(call.endpoint),
  ).length;

  const fixture = makeRepoFixture(t);
  writeGhState(fixture, { driftIssueOnGetNumber: readCount });
  const result = runHarness(
    fixture,
    fixture.task,
    ["status", "40", "status:qa"],
    env,
  );
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  const error = JSON.parse(result.stderr);
  assert.equal(error.projectSynced, true);
  assert.match(error.message, /post-Project label confirmation/);
  assert.deepEqual(
    Object.values(readGhState(fixture).project.values).map(({ name }) => name),
    ["In Progress", "품질 검증"],
  );
});

test("close writes completed Project state only after issue closure", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    pr: mergedPrState(fixture, "c".repeat(40)),
    project: fakeProjectState({
      values: {
        PVTSSF_0: { name: "In Progress", optionId: "OPTION_0_1" },
        PVTSSF_1: { name: "품질 검증", optionId: "OPTION_1_4" },
      },
    }),
  });
  const result = runHarness(fixture, fixture.repo, ["close", "40", "940"], {
    GYEOP_GITHUB_OWNER: "aroido",
    GYEOP_GITHUB_PROJECT_NUMBER: "5",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.project.projectSynced, true);
  const state = readGhState(fixture);
  assert.equal(state.issue.state, "closed");
  assert.deepEqual(
    Object.values(state.project.values).map(({ name }) => name),
    ["Done", "완료"],
  );
});

test("Project access without update permission performs zero field mutation", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    project: fakeProjectState({ viewerCanUpdate: false }),
  });
  const result = runHarness(fixture, fixture.task, ["project-sync", "40"], {
    GYEOP_GITHUB_OWNER: "aroido",
    GYEOP_GITHUB_PROJECT_NUMBER: "5",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /not updateable/);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.args[0] === "project" &&
        ["item-add", "item-edit"].includes(call.args[1]),
    ).length,
    0,
  );
});

function publishMergedMain(fixture, name) {
  const integrator = path.join(fixture.root, name);
  git(fixture.root, "clone", "-b", "main", fixture.origin, integrator);
  git(integrator, "config", "user.name", "GYEOP Test");
  git(integrator, "config", "user.email", "test@gyeop.local");
  fs.writeFileSync(path.join(integrator, "task.txt"), "issue 40\n");
  git(integrator, "add", "task.txt");
  git(integrator, "commit", "-m", "squash issue 40");
  const mergeSha = git(integrator, "rev-parse", "HEAD");
  git(integrator, "push", "origin", "main");
  return mergeSha;
}

function advanceRemoteTaskBranch(fixture) {
  const competitor = path.join(fixture.root, "competitor");
  git(
    fixture.root,
    "clone",
    "-b",
    "codex/issue-40",
    fixture.origin,
    competitor,
  );
  git(competitor, "config", "user.name", "GYEOP Test");
  git(competitor, "config", "user.email", "test@gyeop.local");
  git(competitor, "commit", "--allow-empty", "-m", "competing task commit");
  const sha = git(competitor, "rev-parse", "HEAD");
  git(competitor, "push", "origin", "codex/issue-40");
  return sha;
}

function remoteBranchShaForTest(fixture) {
  const output = git(
    fixture.repo,
    "ls-remote",
    "--heads",
    "origin",
    "refs/heads/codex/issue-40",
  );
  return output ? output.split(/\s+/)[0] : "";
}

function resumeMutationCalls(fixture) {
  return readCalls(fixture).filter(
    (call) =>
      call.tool === "git" &&
      (call.args[0] === "fetch" ||
        call.args[0] === "update-ref" ||
        (call.args[0] === "worktree" && call.args[1] === "add")),
  );
}

function mergedPrState(fixture, mergeSha) {
  return {
    ...openPr(fixture.taskSha, fixture.baseSha),
    state: "closed",
    merged_at: "2026-07-16T00:00:00Z",
    merge_commit_sha: mergeSha,
  };
}

function issueWithStatus(number, status, body = "### 선행 이슈\n- 없음\n") {
  return {
    number,
    title: `issue ${number}`,
    state: "open",
    body,
    labels: [{ name: status }],
  };
}

function prepareFreshStart(fixture) {
  git(fixture.repo, "worktree", "remove", fixture.task);
  git(
    fixture.repo,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    fixture.taskSha,
  );
  assert.equal(fs.existsSync(fixture.task), false);
}

test("status transitions persist blocked provenance and recover only to its source", (t) => {
  const fixture = makeRepoFixture(t);
  const blocked = runHarness(fixture, fixture.task, [
    "status",
    "40",
    "status:blocked",
  ]);
  assert.equal(blocked.status, 0, `${blocked.stderr}\n${blocked.stdout}`);
  assert.deepEqual(
    readGhState(fixture).issue.labels.map(({ name }) => name),
    ["status:blocked", "blocked-from:qa"],
  );

  const beforeSame = readCalls(fixture).length;
  const same = runHarness(fixture, fixture.repo, [
    "status",
    "40",
    "status:blocked",
  ]);
  assert.equal(same.status, 0, `${same.stderr}\n${same.stdout}`);
  assert.match(same.stdout, /"changed": false/);
  assert.equal(
    readCalls(fixture)
      .slice(beforeSame)
      .filter((call) => call.tool === "gh" && call.method === "PUT").length,
    0,
  );

  const invalid = runHarness(fixture, fixture.task, [
    "status",
    "40",
    "status:spec",
  ]);
  assert.equal(invalid.status, 1, `${invalid.stderr}\n${invalid.stdout}`);
  assert.match(invalid.stderr, /only return to status:qa/);
  const recovered = runHarness(fixture, fixture.task, [
    "status",
    "40",
    "status:qa",
  ]);
  assert.equal(recovered.status, 0, `${recovered.stderr}\n${recovered.stdout}`);
  assert.deepEqual(
    readGhState(fixture).issue.labels.map(({ name }) => name),
    ["status:qa"],
  );
});

test("status transition rejects invalid state and label confirmation mismatches", (t) => {
  const invalidFixture = makeRepoFixture(t);
  writeGhState(invalidFixture, {
    issue: {
      ...issueState(),
      labels: [{ name: "status:ready" }, { name: "status:qa" }],
    },
  });
  const invalid = runHarness(invalidFixture, invalidFixture.task, [
    "status",
    "40",
    "status:blocked",
  ]);
  assert.equal(invalid.status, 1, `${invalid.stderr}\n${invalid.stdout}`);
  assert.equal(
    readCalls(invalidFixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );

  const responseFixture = makeRepoFixture(t);
  writeGhState(responseFixture, {
    labelPutResponseLabels: [{ name: "status:qa" }],
  });
  const responseMismatch = runHarness(responseFixture, responseFixture.task, [
    "status",
    "40",
    "status:blocked",
  ]);
  assert.equal(
    responseMismatch.status,
    1,
    `${responseMismatch.stderr}\n${responseMismatch.stdout}`,
  );
  assert.match(responseMismatch.stderr, /label PUT response/);

  const getFixture = makeRepoFixture(t);
  writeGhState(getFixture, { labelGetMismatchAfterPut: ["status:qa"] });
  const getMismatch = runHarness(getFixture, getFixture.task, [
    "status",
    "40",
    "status:blocked",
  ]);
  assert.equal(
    getMismatch.status,
    1,
    `${getMismatch.stderr}\n${getMismatch.stdout}`,
  );
  assert.match(getMismatch.stderr, /label GET confirmation/);
});

test("status transition pins its source and preserves only the latest unrelated labels", (t) => {
  const driftFixture = makeRepoFixture(t);
  const qaIssue = issueState();
  const blockedIssue = {
    ...qaIssue,
    labels: [{ name: "status:blocked" }, { name: "blocked-from:qa" }],
  };
  writeGhState(driftFixture, {
    issue: qaIssue,
    issueSequence: [qaIssue, blockedIssue],
  });
  const drift = runHarness(driftFixture, driftFixture.task, [
    "status",
    "40",
    "status:qa",
  ]);
  assert.equal(drift.status, 1, `${drift.stderr}\n${drift.stdout}`);
  assert.match(drift.stderr, /workflow state changed from pinned/);
  assert.equal(
    readCalls(driftFixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );

  const labelsFixture = makeRepoFixture(t);
  const initial = {
    ...issueState(),
    labels: [{ name: "status:qa" }, { name: "priority:p0" }],
  };
  const gate = {
    ...initial,
    labels: [{ name: "status:qa" }, { name: "priority:p1" }],
  };
  const latest = {
    ...initial,
    labels: [
      { name: "status:qa" },
      { name: "priority:p1" },
      { name: "type:ops" },
    ],
  };
  writeGhState(labelsFixture, {
    issue: initial,
    issueSequence: [initial, gate, latest],
  });
  const changed = runHarness(labelsFixture, labelsFixture.task, [
    "status",
    "40",
    "status:blocked",
  ]);
  assert.equal(changed.status, 0, `${changed.stderr}\n${changed.stdout}`);
  const labelPut = readCalls(labelsFixture).find(
    (call) =>
      call.tool === "gh" &&
      call.method === "PUT" &&
      /\/labels$/.test(call.endpoint),
  );
  assert.deepEqual(labelPut.payload.labels, [
    "priority:p1",
    "type:ops",
    "status:blocked",
    "blocked-from:qa",
  ]);
});

test("status transition reruns predecessor gates immediately before the exact write pin", (t) => {
  const fixture = makeRepoFixture(t);
  const workflowIssue = {
    ...issueState(),
    body: "### 선행 이슈\n- #1\n",
    labels: [{ name: "status:backlog" }],
  };
  writeGhState(fixture, {
    issue: workflowIssue,
    issues: {
      1: { number: 1, state: "closed", labels: [] },
      40: workflowIssue,
    },
    reopenPredecessorOnWorkflowRead: 3,
  });

  const result = runHarness(fixture, fixture.repo, [
    "status",
    "40",
    "status:ready",
  ]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /predecessor issue #1 must be closed/);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("status transition reruns checkout gates immediately before the exact write pin", (t) => {
  const dirtyFixture = makeRepoFixture(t);
  writeGhState(dirtyFixture, {
    issue: { ...issueState(), labels: [{ name: "status:spec" }] },
    dirtyWorktreeOnWorkflowRead: 3,
  });
  const dirty = runHarness(dirtyFixture, dirtyFixture.task, [
    "status",
    "40",
    "status:implementing",
  ]);
  assert.equal(dirty.status, 1, `${dirty.stderr}\n${dirty.stdout}`);
  assert.match(dirty.stderr, /working tree must be clean/);
  assert.equal(
    readCalls(dirtyFixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );

  const specFixture = makeRepoFixture(t);
  writeGhState(specFixture, {
    issue: { ...issueState(), labels: [{ name: "status:spec" }] },
    invalidSpecOnWorkflowRead: 3,
  });
  const spec = runHarness(specFixture, specFixture.task, [
    "status",
    "40",
    "status:implementing",
  ]);
  assert.equal(spec.status, 1, `${spec.stderr}\n${spec.stdout}`);
  assert.match(spec.stderr, /spec gate failed/);
  assert.equal(
    readCalls(specFixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("start reuses a safe partial worktree and never duplicates worktree add", (t) => {
  const fixture = makeRepoFixture(t);
  prepareFreshStart(fixture);
  writeGhState(fixture, {
    issue: { ...issueState(), labels: [{ name: "status:ready" }] },
    failLabelPutOnce: true,
  });

  const first = runHarness(fixture, fixture.repo, ["start", "40"]);
  assert.equal(first.status, 1, `${first.stderr}\n${first.stdout}`);
  assert.ok(fs.existsSync(fixture.task));
  assert.deepEqual(
    readGhState(fixture).issue.labels.map(({ name }) => name),
    ["status:ready"],
  );

  const second = runHarness(fixture, fixture.repo, ["start", "40"]);
  assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
  assert.match(second.stdout, /"reused": true/);
  assert.deepEqual(
    readGhState(fixture).issue.labels.map(({ name }) => name),
    ["status:spec"],
  );
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "worktree" &&
        call.args[1] === "add",
    ).length,
    1,
  );
});

test("start rechecks exact ready state after fetch and before worktree add", (t) => {
  const fixture = makeRepoFixture(t);
  prepareFreshStart(fixture);
  writeGhState(fixture, {
    issue: { ...issueState(), labels: [{ name: "status:ready" }] },
  });

  const result = runHarness(fixture, fixture.repo, ["start", "40"], {
    FAKE_DRIFT_ISSUE_ON_FETCH: "1",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /must be status:ready/);
  assert.equal(fs.existsSync(fixture.task), false);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "worktree" &&
        call.args[1] === "add",
    ).length,
    0,
  );
});

test("start rejects a symlinked worktree parent before every Git mutation", (t) => {
  const fixture = makeRepoFixture(t);
  prepareFreshStart(fixture);
  const aliasRoot = path.join(fixture.root, "worktrees-alias");
  fs.symlinkSync(fixture.worktreeRoot, aliasRoot);
  writeGhState(fixture, {
    issue: { ...issueState(), labels: [{ name: "status:ready" }] },
  });

  const result = runHarness(fixture, fixture.repo, ["start", "40"], {
    GYEOP_WORKTREE_ROOT: aliasRoot,
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /must not be an alias/);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "git" &&
        (call.args[0] === "fetch" ||
          call.args[0] === "update-ref" ||
          (call.args[0] === "worktree" && call.args[1] === "add")),
    ).length,
    0,
  );
});

test("status and start reject a swapped standalone clone from its own cwd before mutation", (t) => {
  const fixture = makeRepoFixture(t);
  fs.renameSync(fixture.task, `${fixture.task}-original`);
  git(
    fixture.root,
    "clone",
    "-b",
    "codex/issue-40",
    fixture.origin,
    fixture.task,
  );

  const status = runHarness(fixture, fixture.task, [
    "status",
    "40",
    "status:blocked",
  ]);
  assert.equal(status.status, 1, `${status.stderr}\n${status.stdout}`);
  assert.match(status.stderr, /linked worktree common directory outside/);

  writeGhState(fixture, {
    issue: { ...issueState(), labels: [{ name: "status:ready" }] },
  });
  const start = runHarness(fixture, fixture.task, ["start", "40"]);
  assert.equal(start.status, 1, `${start.stderr}\n${start.stdout}`);
  assert.match(start.stderr, /linked worktree common directory outside/);

  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "git" &&
        (call.args[0] === "fetch" ||
          call.args[0] === "update-ref" ||
          (call.args[0] === "worktree" && call.args[1] === "add")),
    ).length,
    0,
  );
});

test("reconcile classifies every candidate and keeps item errors isolated", (t) => {
  const fixture = makeRepoFixture(t);
  const issues = {
    1: { number: 1, state: "closed" },
    2: { number: 2, state: "open" },
    41: issueWithStatus(41, "status:backlog", "### 선행 이슈\n- #1\n"),
    42: issueWithStatus(42, "status:backlog", "### 선행 이슈\n- #2\n"),
    43: issueWithStatus(43, "status:backlog"),
    44: {
      ...issueWithStatus(44, "status:backlog", "### 선행 이슈\n- #1\n"),
      labels: [
        { name: "status:backlog" },
        { name: "status:blocked" },
        { name: "blocked-from:backlog" },
      ],
    },
    45: issueWithStatus(45, "status:backlog", "### 선행 이슈\n- 나중에 결정\n"),
  };
  writeGhState(fixture, {
    issues,
    backlogPages: [
      [issues[45], issues[44], issues[42], issues[41], issues[43], issues[41]],
    ],
  });

  const result = runHarness(fixture, fixture.repo, ["reconcile"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.promoted, [{ issue: 41, changed: true }]);
  assert.deepEqual(output.waiting, [{ issue: 42, predecessors: [2] }]);
  assert.deepEqual(output.skipped, [{ issue: 43, reason: "no predecessors" }]);
  assert.deepEqual(
    output.errors.map(({ issue }) => issue),
    [44, 45],
  );
  assert.deepEqual(
    issues[41].labels.map(({ name }) => name),
    ["status:backlog"],
  );
  assert.deepEqual(
    readGhState(fixture).issues[41].labels.map(({ name }) => name),
    ["status:ready"],
  );
});

test("reconcile collects every page before the first mutation and page failure mutates nothing", (t) => {
  const candidate = issueWithStatus(
    1100,
    "status:backlog",
    "### 선행 이슈\n- #1\n",
  );
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    issueWithStatus(1000 + index, "status:backlog"),
  );
  const issues = Object.fromEntries(
    [{ number: 1, state: "closed" }, ...firstPage, candidate].map((issue) => [
      issue.number,
      issue,
    ]),
  );

  const successFixture = makeRepoFixture(t);
  writeGhState(successFixture, {
    issues,
    backlogPages: [firstPage, [candidate]],
  });
  const success = runHarness(successFixture, successFixture.repo, [
    "reconcile",
  ]);
  assert.equal(success.status, 0, `${success.stderr}\n${success.stdout}`);
  const successOutput = JSON.parse(success.stdout);
  assert.equal(successOutput.skipped.length, 100);
  assert.deepEqual(successOutput.promoted, [{ issue: 1100, changed: true }]);
  const successCalls = readCalls(successFixture);
  const page2 = successCalls.findIndex(
    (call) => call.tool === "gh" && call.endpoint.includes("page=2"),
  );
  const put = successCalls.findIndex(
    (call) =>
      call.tool === "gh" &&
      call.method === "PUT" &&
      /\/labels$/.test(call.endpoint),
  );
  assert.ok(page2 >= 0 && page2 < put);

  const failureFixture = makeRepoFixture(t);
  writeGhState(failureFixture, {
    issues,
    backlogPages: [firstPage, [candidate]],
    failBacklogPage: 2,
  });
  const failure = runHarness(failureFixture, failureFixture.repo, [
    "reconcile",
  ]);
  assert.equal(failure.status, 1, `${failure.stderr}\n${failure.stdout}`);
  assert.equal(
    readCalls(failureFixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("reconcile treats a concurrent ready promotion as an idempotent success", (t) => {
  const fixture = makeRepoFixture(t);
  const searched = issueWithStatus(
    50,
    "status:backlog",
    "### 선행 이슈\n- #1\n",
  );
  const current = issueWithStatus(50, "status:ready", "### 선행 이슈\n- #1\n");
  writeGhState(fixture, {
    issues: { 1: { number: 1, state: "closed" }, 50: current },
    backlogPages: [[searched]],
  });

  const result = runHarness(fixture, fixture.repo, ["reconcile"]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.deepEqual(JSON.parse(result.stdout).promoted, [
    { issue: 50, changed: false },
  ]);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/labels$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("reconcile isolates label write, response loss, and final GET loss", (t) => {
  const fixture = makeRepoFixture(t);
  const issues = { 1: { number: 1, state: "closed" } };
  for (const number of [51, 52, 53, 54]) {
    issues[number] = issueWithStatus(
      number,
      "status:backlog",
      "### 선행 이슈\n- #1\n",
    );
  }
  writeGhState(fixture, {
    issues,
    backlogPages: [[issues[51], issues[52], issues[53], issues[54]]],
    failLabelPutIssues: [51],
    failLabelPutResponseIssues: [52],
    failIssueGetAfterLabelPut: [53],
  });

  const result = runHarness(fixture, fixture.repo, ["reconcile"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    output.errors.map(({ issue }) => issue),
    [51, 52, 53],
  );
  assert.deepEqual(output.promoted, [{ issue: 54, changed: true }]);
});

test("resume reuses the exact clean task worktree without mutation", (t) => {
  const fixture = makeRepoFixture(t);
  const result = runHarness(fixture, fixture.repo, ["resume", "40"]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.deepEqual(JSON.parse(result.stdout), {
    issue: 40,
    status: "status:qa",
    mode: "reused",
    branch: "codex/issue-40",
    worktree: fs.realpathSync.native(fixture.task),
    sha: fixture.taskSha,
    project: {
      configured: false,
      projectSynced: false,
      status: "skipped",
    },
  });
  const calls = readCalls(fixture);
  assert.ok(
    calls.some(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "ls-remote" &&
        call.args.includes("https://github.com/aroido/gyeop.git"),
    ),
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "git" &&
        (call.args[0] === "fetch" ||
          call.args[0] === "update-ref" ||
          (call.args[0] === "worktree" && call.args[1] === "add")),
    ).length,
    0,
  );
});

test("resume restores local-only and remote-only branches, then reuses the result", (t) => {
  const localFixture = makeRepoFixture(t);
  git(localFixture.repo, "worktree", "remove", localFixture.task);
  git(
    localFixture.root,
    "--git-dir",
    localFixture.origin,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    localFixture.taskSha,
  );
  const local = runHarness(localFixture, localFixture.repo, ["resume", "40"]);
  assert.equal(local.status, 0, `${local.stderr}\n${local.stdout}`);
  assert.equal(JSON.parse(local.stdout).mode, "restored-local");
  assert.equal(
    git(localFixture.task, "rev-parse", "HEAD"),
    localFixture.taskSha,
  );

  const remoteFixture = makeRepoFixture(t);
  git(remoteFixture.repo, "worktree", "remove", remoteFixture.task);
  git(
    remoteFixture.repo,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    remoteFixture.taskSha,
  );
  const remote = runHarness(remoteFixture, remoteFixture.repo, [
    "resume",
    "40",
  ]);
  assert.equal(remote.status, 0, `${remote.stderr}\n${remote.stdout}`);
  assert.equal(JSON.parse(remote.stdout).mode, "restored-remote");
  assert.equal(
    git(remoteFixture.task, "rev-parse", "HEAD"),
    remoteFixture.taskSha,
  );
  const rerun = runHarness(remoteFixture, remoteFixture.repo, ["resume", "40"]);
  assert.equal(rerun.status, 0, `${rerun.stderr}\n${rerun.stdout}`);
  assert.equal(JSON.parse(rerun.stdout).mode, "reused");
  const calls = readCalls(remoteFixture);
  assert.ok(
    calls.some(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "fetch" &&
        call.args.includes("https://github.com/aroido/gyeop.git") &&
        call.args.includes(remoteFixture.taskSha),
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "update-ref" &&
        call.args[1] === "refs/heads/codex/issue-40" &&
        call.args[2] === remoteFixture.taskSha &&
        call.args[3] === "",
    ),
  );
});

test("resume rejects a merged PR found after the first page", (t) => {
  const fixture = makeRepoFixture(t);
  const unmerged = Array.from({ length: 100 }, (_, index) => ({
    ...openPr(fixture.taskSha, fixture.baseSha),
    number: 1000 + index,
  }));
  const merged = {
    ...openPr(fixture.taskSha, fixture.baseSha),
    number: 1200,
    merged_at: "2026-07-16T00:00:00Z",
  };
  writeGhState(fixture, { allPrPages: [unmerged, [merged]] });
  const result = runHarness(fixture, fixture.repo, ["resume", "40"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /already has merged PR #1200/);
  assert.ok(
    readCalls(fixture).some(
      (call) => call.tool === "gh" && call.endpoint.includes("page=2"),
    ),
  );
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "git" &&
        (call.args[0] === "fetch" ||
          call.args[0] === "update-ref" ||
          (call.args[0] === "worktree" && call.args[1] === "add")),
    ).length,
    0,
  );
});

test("resume rejects dirty, divergent, and cleanup-quarantine branches", (t) => {
  const dirtyFixture = makeRepoFixture(t);
  fs.appendFileSync(path.join(dirtyFixture.task, "task.txt"), "dirty\n");
  const dirty = runHarness(dirtyFixture, dirtyFixture.repo, ["resume", "40"]);
  assert.equal(dirty.status, 1, `${dirty.stderr}\n${dirty.stdout}`);
  assert.match(dirty.stderr, /working tree must be clean/);

  const divergentFixture = makeRepoFixture(t);
  advanceRemoteTaskBranch(divergentFixture);
  const divergent = runHarness(divergentFixture, divergentFixture.repo, [
    "resume",
    "40",
  ]);
  assert.equal(divergent.status, 1, `${divergent.stderr}\n${divergent.stdout}`);
  assert.match(divergent.stderr, /local and remote branches differ/);

  const quarantineFixture = makeRepoFixture(t);
  git(
    quarantineFixture.repo,
    "branch",
    "codex/issue-40-cleanup-quarantine",
    quarantineFixture.taskSha,
  );
  const quarantine = runHarness(quarantineFixture, quarantineFixture.repo, [
    "resume",
    "40",
  ]);
  assert.equal(
    quarantine.status,
    1,
    `${quarantine.stderr}\n${quarantine.stdout}`,
  );
  assert.match(quarantine.stderr, /cleanup quarantine exists/);
});

test("resume rejects every unregistered target node and a swapped repository", (t) => {
  for (const kind of ["directory", "file", "symlink", "broken-symlink"]) {
    const fixture = makeRepoFixture(t);
    git(fixture.repo, "worktree", "remove", fixture.task);
    if (kind === "directory") fs.mkdirSync(fixture.task);
    if (kind === "file") fs.writeFileSync(fixture.task, "collision\n");
    if (kind === "symlink") fs.symlinkSync(fixture.repo, fixture.task);
    if (kind === "broken-symlink")
      fs.symlinkSync(path.join(fixture.root, "missing"), fixture.task);
    const result = runHarness(fixture, fixture.repo, ["resume", "40"]);
    assert.equal(
      result.status,
      1,
      `${kind}\n${result.stderr}\n${result.stdout}`,
    );
    assert.match(
      result.stderr,
      /already exists|must not be an alias|cannot canonicalize broken symlink/,
    );
    assert.equal(
      readCalls(fixture).filter(
        (call) =>
          call.tool === "git" &&
          call.args[0] === "worktree" &&
          call.args[1] === "add",
      ).length,
      0,
      kind,
    );
  }

  const swappedFixture = makeRepoFixture(t);
  fs.renameSync(swappedFixture.task, `${swappedFixture.task}-original`);
  git(swappedFixture.root, "clone", swappedFixture.origin, swappedFixture.task);
  const swapped = runHarness(swappedFixture, swappedFixture.repo, [
    "resume",
    "40",
  ]);
  assert.equal(swapped.status, 1, `${swapped.stderr}\n${swapped.stdout}`);
  assert.match(swapped.stderr, /expected shared repository/);
});

test("resume rejects a standalone clone when invoked from that target", (t) => {
  const fixture = makeRepoFixture(t);
  git(fixture.repo, "worktree", "remove", fixture.task);
  git(
    fixture.root,
    "clone",
    "-b",
    "codex/issue-40",
    fixture.origin,
    fixture.task,
  );

  const result = runHarness(fixture, fixture.task, ["resume", "40"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(
    result.stderr,
    /linked worktree common directory outside the target/,
  );
  assert.deepEqual(resumeMutationCalls(fixture), []);
  assert.equal(git(fixture.task, "rev-parse", "HEAD"), fixture.taskSha);
  assert.equal(fs.existsSync(fixture.task), true);
});

test("resume detects origin and issue drift before later mutations", (t) => {
  const originFixture = makeRepoFixture(t);
  const origin = runHarness(
    originFixture,
    originFixture.repo,
    ["resume", "40"],
    {
      FAKE_CHANGE_FETCH_URL_AFTER_RESUME_PULLS: "1",
    },
  );
  assert.equal(origin.status, 1, `${origin.stderr}\n${origin.stdout}`);
  assert.match(
    origin.stderr,
    /origin fetch and push URLs|origin configuration changed/,
  );

  const issueFixture = makeRepoFixture(t);
  git(issueFixture.repo, "worktree", "remove", issueFixture.task);
  git(
    issueFixture.repo,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    issueFixture.taskSha,
  );
  const drift = runHarness(issueFixture, issueFixture.repo, ["resume", "40"], {
    FAKE_DRIFT_ISSUE_ON_FETCH: "1",
  });
  assert.equal(drift.status, 1, `${drift.stderr}\n${drift.stdout}`);
  assert.match(drift.stderr, /workflow state changed during resume/);
  assert.notEqual(
    gitResult(
      issueFixture.repo,
      "rev-parse",
      "--verify",
      "refs/heads/codex/issue-40",
    ).status,
    0,
  );
  assert.equal(fs.existsSync(issueFixture.task), false);
});

test("resume rejects remote absent-create, move, and delete races before mutation", (t) => {
  for (const race of ["remote-create", "remote-move", "remote-delete"]) {
    const fixture = makeRepoFixture(t);
    git(fixture.repo, "worktree", "remove", fixture.task);
    if (race === "remote-create") {
      git(
        fixture.root,
        "--git-dir",
        fixture.origin,
        "update-ref",
        "-d",
        "refs/heads/codex/issue-40",
        fixture.taskSha,
      );
    }

    const result = runHarness(fixture, fixture.repo, ["resume", "40"], {
      FAKE_RESUME_PULL_RACE: race,
    });
    assert.equal(
      result.status,
      1,
      `${race}\n${result.stderr}\n${result.stdout}`,
    );
    assert.match(
      result.stderr,
      /remote branch codex\/issue-40 changed during resume/,
    );
    assert.deepEqual(resumeMutationCalls(fixture), [], race);
    assert.match(
      result.stderr,
      new RegExp(`"expectedSha": "${fixture.taskSha}"`),
    );
    assert.match(result.stderr, new RegExp(`"localRef": "${fixture.taskSha}"`));
    assert.match(result.stderr, /"registeredWorktree": false/);
    assert.match(result.stderr, /"targetExists": false/);
  }
});

test("resume rejects local-ref and worktree-registry drift before target creation", (t) => {
  const localFixture = makeRepoFixture(t);
  git(localFixture.repo, "worktree", "remove", localFixture.task);
  git(
    localFixture.root,
    "--git-dir",
    localFixture.origin,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    localFixture.taskSha,
  );
  const local = runHarness(localFixture, localFixture.repo, ["resume", "40"], {
    FAKE_RESUME_PULL_RACE: "local-ref",
  });
  assert.equal(local.status, 1, `${local.stderr}\n${local.stdout}`);
  assert.match(
    local.stderr,
    /local branch codex\/issue-40 changed during resume/,
  );
  assert.deepEqual(resumeMutationCalls(localFixture), []);
  assert.match(
    local.stderr,
    new RegExp(`"expectedSha": "${localFixture.taskSha}"`),
  );
  assert.match(
    local.stderr,
    new RegExp(`"localRef": "${localFixture.baseSha}"`),
  );
  assert.match(local.stderr, /"registeredWorktree": false/);
  assert.match(local.stderr, /"targetExists": false/);

  const registryFixture = makeRepoFixture(t);
  git(registryFixture.repo, "worktree", "remove", registryFixture.task);
  git(
    registryFixture.root,
    "--git-dir",
    registryFixture.origin,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    registryFixture.taskSha,
  );
  const driftPath = path.join(registryFixture.root, "registry-race");
  const registry = runHarness(
    registryFixture,
    registryFixture.repo,
    ["resume", "40"],
    {
      FAKE_RESUME_PULL_RACE: "registry",
      FAKE_RESUME_REGISTRY_DRIFT_PATH: driftPath,
    },
  );
  assert.equal(registry.status, 1, `${registry.stderr}\n${registry.stdout}`);
  assert.match(registry.stderr, /worktree registry changed during resume/);
  assert.deepEqual(resumeMutationCalls(registryFixture), []);
  assert.equal(git(driftPath, "rev-parse", "HEAD"), registryFixture.baseSha);
  assert.match(registry.stderr, /"registeredWorktree": false/);
  assert.match(registry.stderr, /"targetExists": false/);
});

test("resume rechecks issue and merged PR after local checks before return", (t) => {
  for (const drift of ["blocked", "closed", "merged"]) {
    const fixture = makeRepoFixture(t);
    const result = runHarness(fixture, fixture.repo, ["resume", "40"], {
      FAKE_RESUME_GITHUB_DRIFT_AFTER_STATUS: drift,
    });
    assert.equal(
      result.status,
      1,
      `${drift}\n${result.stderr}\n${result.stdout}`,
    );
    if (drift === "merged")
      assert.match(result.stderr, /already has merged PR #1240/);
    else
      assert.match(
        result.stderr,
        /workflow state changed during resume|must be open/,
      );
    assert.deepEqual(resumeMutationCalls(fixture), [], drift);
    assert.match(result.stderr, /"registeredWorktree": true/);
    assert.match(result.stderr, /"targetExists": true/);

    const calls = readCalls(fixture);
    const statusChecks = calls
      .map((call, index) => ({ call, index }))
      .filter(
        ({ call }) =>
          call.tool === "git" &&
          call.args[0] === "status" &&
          call.args[1] === "--porcelain=v1",
      );
    assert.ok(statusChecks.length >= 2, drift);
    assert.ok(
      calls.some(
        (call, index) =>
          index > statusChecks[1].index &&
          call.tool === "gh" &&
          call.method === "GET" &&
          /\/issues\/40$/.test(call.endpoint),
      ),
      drift,
    );
  }
});

test("resume preserves a partial worktree-add failure and reports pinned diagnostics", (t) => {
  const fixture = makeRepoFixture(t);
  git(fixture.repo, "worktree", "remove", fixture.task);
  git(
    fixture.root,
    "--git-dir",
    fixture.origin,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    fixture.taskSha,
  );
  const result = runHarness(fixture, fixture.repo, ["resume", "40"], {
    FAKE_FAIL_RESUME_WORKTREE_ADD: "1",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(
    result.stderr,
    new RegExp(`"expectedSha": "${fixture.taskSha}"`),
  );
  assert.match(result.stderr, new RegExp(`"localRef": "${fixture.taskSha}"`));
  assert.match(result.stderr, /"registeredWorktree": false/);
  assert.match(result.stderr, /"targetExists": true/);
  assert.equal(fs.lstatSync(fixture.task).isDirectory(), true);
  assert.equal(
    git(fixture.repo, "rev-parse", "refs/heads/codex/issue-40"),
    fixture.taskSha,
  );
});

test("destructive commands reject a configured repository that differs from git origin", (t) => {
  const fixture = makeRepoFixture(t);
  for (const [cwd, args] of [
    [fixture.task, ["pr", "40"]],
    [fixture.task, ["merge", "940"]],
    [fixture.repo, ["close", "40", "940"]],
    [fixture.repo, ["cleanup", "40", "940"]],
  ]) {
    const result = runHarness(fixture, cwd, args, {
      GYEOP_GITHUB_REPO: "other/gyeop",
    });
    assert.equal(
      result.status,
      1,
      `${args[0]}\n${result.stderr}\n${result.stdout}`,
    );
    assert.match(result.stderr, /does not match git origin/);
  }

  const calls = readCalls(fixture);
  assert.equal(calls.filter((call) => call.tool === "gh").length, 0);
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "git" &&
        (["push", "update-ref"].includes(call.args[0]) ||
          (call.args[0] === "branch" && call.args[1] !== "--show-current") ||
          (call.args[0] === "worktree" && call.args[1] === "remove")),
    ).length,
    0,
  );
});

test("destructive commands reject an origin push URL for another repository", (t) => {
  const fixture = makeRepoFixture(t);
  const result = runHarness(fixture, fixture.task, ["pr", "40"], {
    FAKE_ORIGIN_PUSH_URL: "git@github.com:other/gyeop.git",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /does not match git origin/);

  const calls = readCalls(fixture);
  assert.equal(calls.filter((call) => call.tool === "gh").length, 0);
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "push")
      .length,
    0,
  );
});

test("PR gate rejects non-exact QA state before verify, push, or GitHub writes", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    issue: {
      ...issueState(),
      labels: [{ name: "status:qa" }, { name: "status:ready" }],
    },
  });
  const result = runHarness(fixture, fixture.task, ["pr", "40"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  const calls = readCalls(fixture);
  assert.equal(calls.filter((call) => call.tool === "verify").length, 0);
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "push")
      .length,
    0,
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" && ["POST", "PATCH", "PUT"].includes(call.method),
    ).length,
    0,
  );
});

test("PR gate rechecks exact QA after full verify", (t) => {
  const fixture = makeRepoFixture(t);
  const result = runHarness(fixture, fixture.task, ["pr", "40"], {
    FAKE_VERIFY_MUTATION: "issue-state",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /must be status:qa/);
  const calls = readCalls(fixture);
  assert.equal(calls.filter((call) => call.tool === "verify").length, 1);
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "push")
      .length,
    0,
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" && ["POST", "PATCH", "PUT"].includes(call.method),
    ).length,
    0,
  );
});

test("PR ready drift leaves the created pull request as a draft", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    driftIssueAfterPrCreate: ["status:blocked", "blocked-from:qa"],
  });
  const result = runHarness(fixture, fixture.task, ["pr", "40"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /must be status:qa/);
  assert.equal(readGhState(fixture).pr.draft, true);
  const calls = readCalls(fixture);
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" &&
        call.args?.[0] === "pr" &&
        call.args?.[1] === "ready",
    ).length,
    0,
  );
});

test("PR ready checks exact QA after the final origin validation", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, { armIssueDriftAfterPrCreateOrigin: true });
  const result = runHarness(fixture, fixture.task, ["pr", "40"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /must be status:qa/);
  assert.equal(readGhState(fixture).pr.draft, true);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.args?.[0] === "pr" &&
        call.args?.[1] === "ready",
    ).length,
    0,
  );
});

test("PR gate stops push and GitHub writes when verify changes HEAD", (t) => {
  const fixture = makeRepoFixture(t);
  const result = runHarness(fixture, fixture.task, ["pr", "40"], {
    FAKE_VERIFY_MUTATION: "sha",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /after verify.*HEAD/);

  const calls = readCalls(fixture);
  assert.ok(calls.some((call) => call.tool === "verify"));
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "push")
      .length,
    0,
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "POST" &&
        /\/pulls$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("PR gate rechecks open candidates after verify before push", (t) => {
  for (const [mutation, startsWithPr] of [
    ["pr-candidate-add", false],
    ["pr-candidate-replace", true],
    ["pr-body", true],
    ["remote-head", true],
  ]) {
    const fixture = makeRepoFixture(t);
    if (startsWithPr) {
      writeGhState(fixture, {
        openPrs: [openPr(fixture.taskSha, fixture.baseSha)],
      });
    }
    const result = runHarness(fixture, fixture.task, ["pr", "40"], {
      FAKE_VERIFY_MUTATION: mutation,
    });
    assert.equal(
      result.status,
      1,
      `${mutation}\n${result.stderr}\n${result.stdout}`,
    );

    const calls = readCalls(fixture);
    assert.equal(
      calls.filter((call) => call.tool === "git" && call.args[0] === "push")
        .length,
      0,
      mutation,
    );
    assert.equal(
      calls.filter(
        (call) =>
          call.tool === "gh" && ["POST", "PATCH", "PUT"].includes(call.method),
      ).length,
      0,
      mutation,
    );
  }
});

test("PR gate rechecks the origin push URL after verify before push", (t) => {
  const fixture = makeRepoFixture(t);
  const result = runHarness(fixture, fixture.task, ["pr", "40"], {
    FAKE_VERIFY_MUTATION: "origin-pushurl",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /does not match git origin/);

  const calls = readCalls(fixture);
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "push")
      .length,
    0,
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" && ["POST", "PATCH", "PUT"].includes(call.method),
    ).length,
    0,
  );
});

test("PR creation checks existing PRs, creates a draft, and marks it ready", (t) => {
  const fixture = makeRepoFixture(t);
  const result = runHarness(fixture, fixture.task, ["pr", "40"]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

  const calls = readCalls(fixture);
  const listIndex = calls.findIndex(
    (call) =>
      call.tool === "gh" &&
      call.method === "GET" &&
      /\/pulls\?/.test(call.endpoint),
  );
  const createIndex = calls.findIndex(
    (call) =>
      call.tool === "gh" &&
      call.method === "POST" &&
      /\/pulls$/.test(call.endpoint),
  );
  const readyIndex = calls.findIndex(
    (call) =>
      call.tool === "gh" &&
      call.args?.[0] === "pr" &&
      call.args?.[1] === "ready",
  );
  const readyGetIndex = calls.findIndex(
    (call, index) =>
      index > readyIndex &&
      call.tool === "gh" &&
      /\/pulls\/940$/.test(call.endpoint),
  );
  assert.equal(calls[createIndex].payload.draft, true);
  assert.equal(calls[createIndex].payload.body.split("\n")[0], "Closes #40");
  assert.ok(
    calls[createIndex].payload.body.includes(
      "- 검증 HEAD: `" + fixture.taskSha + "`",
    ),
  );
  assert.ok(
    listIndex >= 0 &&
      listIndex < createIndex &&
      createIndex < readyIndex &&
      readyIndex < readyGetIndex,
  );
  assert.match(result.stdout, /"reused": false/);
});

test("PR creation safely reuses valid draft and ready PRs", (t) => {
  for (const draft of [true, false]) {
    const fixture = makeRepoFixture(t);
    const candidate = { ...openPr(fixture.taskSha, fixture.baseSha), draft };
    writeGhState(fixture, {
      openPrs: [candidate],
      pr: candidate,
      createdPr: candidate,
    });

    const result = runHarness(fixture, fixture.task, ["pr", "40"]);
    assert.equal(
      result.status,
      0,
      `${draft}\n${result.stderr}\n${result.stdout}`,
    );
    assert.match(result.stdout, /"reused": true/);
    const calls = readCalls(fixture);
    assert.equal(
      calls.filter(
        (call) =>
          call.tool === "gh" &&
          call.method === "POST" &&
          /\/pulls$/.test(call.endpoint),
      ).length,
      0,
    );
    assert.equal(
      calls.filter(
        (call) =>
          call.tool === "gh" &&
          call.args?.[0] === "pr" &&
          call.args?.[1] === "ready",
      ).length,
      draft ? 1 : 0,
    );
    assert.equal(readGhState(fixture).pr.draft, false);
  }
});

test("PR reuse records the current verified SHA when the marker is missing", (t) => {
  const fixture = makeRepoFixture(t);
  const candidate = openPr(fixture.taskSha, fixture.baseSha);
  candidate.body = "Closes #40";
  writeGhState(fixture, {
    openPrs: [candidate],
    pr: candidate,
    createdPr: candidate,
  });

  const result = runHarness(fixture, fixture.task, ["pr", "40"]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const patch = readCalls(fixture).find(
    (call) =>
      call.tool === "gh" &&
      call.method === "PATCH" &&
      /\/pulls\/940$/.test(call.endpoint),
  );
  assert.ok(
    patch.payload.body.includes("- 검증 HEAD: `" + fixture.taskSha + "`"),
  );
  assert.ok(
    readGhState(fixture).pr.body.includes(
      "- 검증 HEAD: `" + fixture.taskSha + "`",
    ),
  );
});

test("multiple, invalid, or remote-mismatched existing PRs cause zero mutation", (t) => {
  for (const scenario of ["multiple", "invalid", "remote mismatch"]) {
    const fixture = makeRepoFixture(t);
    const candidate = openPr(fixture.taskSha, fixture.baseSha);
    let openPrs = [candidate];
    if (scenario === "multiple")
      openPrs = [candidate, { ...structuredClone(candidate), number: 941 }];
    if (scenario === "invalid") candidate.body = "This does not close #40.";
    if (scenario === "remote mismatch") advanceRemoteTaskBranch(fixture);
    const remoteBefore = remoteBranchShaForTest(fixture);
    const configBefore = git(
      fixture.repo,
      "config",
      "--get-regexp",
      "^branch\\.codex/issue-40\\.",
    );
    writeGhState(fixture, { openPrs, pr: candidate });

    const result = runHarness(fixture, fixture.task, ["pr", "40"]);
    assert.equal(
      result.status,
      1,
      `${scenario}\n${result.stderr}\n${result.stdout}`,
    );
    assert.equal(remoteBranchShaForTest(fixture), remoteBefore, scenario);
    assert.equal(
      git(
        fixture.repo,
        "config",
        "--get-regexp",
        "^branch\\.codex/issue-40\\.",
      ),
      configBefore,
      scenario,
    );
    const calls = readCalls(fixture);
    assert.equal(
      calls.filter((call) => call.tool === "verify").length,
      0,
      scenario,
    );
    assert.equal(
      calls.filter(
        (call) =>
          (call.tool === "git" &&
            (call.args[0] === "push" ||
              (call.args[0] === "branch" &&
                call.args.includes("--set-upstream-to")))) ||
          (call.tool === "gh" &&
            (call.method === "POST" ||
              call.method === "PATCH" ||
              call.method === "PUT" ||
              call.args?.[0] === "pr")),
      ).length,
      0,
      scenario,
    );
  }
});

test("ready confirmation loss preserves the PR and a rerun reuses it", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, { failPrGetsAfterReady: 3 });

  const first = runHarness(fixture, fixture.task, ["pr", "40"]);
  assert.equal(first.status, 1, `${first.stderr}\n${first.stdout}`);
  assert.match(first.stderr, /left open for a safe rerun/);
  assert.equal(readGhState(fixture).pr.draft, false);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PATCH" &&
        /\/pulls\/940$/.test(call.endpoint),
    ).length,
    0,
  );

  const second = runHarness(fixture, fixture.task, ["pr", "40"]);
  assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
  assert.match(second.stdout, /"reused": true/);
  const calls = readCalls(fixture);
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "POST" &&
        /\/pulls$/.test(call.endpoint),
    ).length,
    1,
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PATCH" &&
        /\/pulls\/940$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("PR and merge stop when the ignored QA artifact changes", (t) => {
  const prFixture = makeRepoFixture(t);
  const prResult = runHarness(prFixture, prFixture.task, ["pr", "40"], {
    FAKE_VERIFY_MUTATION: "qa",
  });
  assert.equal(prResult.status, 1, `${prResult.stderr}\n${prResult.stdout}`);
  assert.match(prResult.stderr, /changed guarded files/);
  const prCalls = readCalls(prFixture);
  assert.equal(
    prCalls.filter((call) => call.tool === "git" && call.args[0] === "push")
      .length,
    0,
  );
  assert.equal(
    prCalls.filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "POST" &&
        /\/pulls$/.test(call.endpoint),
    ).length,
    0,
  );

  const mergeFixture = makeRepoFixture(t);
  writeGhState(mergeFixture, { driftQaAfterChecks: true });
  const mergeResult = runHarness(
    mergeFixture,
    mergeFixture.task,
    ["merge", "940"],
  );
  assert.equal(
    mergeResult.status,
    1,
    `${mergeResult.stderr}\n${mergeResult.stdout}`,
  );
  assert.match(mergeResult.stderr, /changed guarded files/);
  assert.equal(
    readCalls(mergeFixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/pulls\/940\/merge$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("merge rejects base SHA drift before the merge mutation", (t) => {
  const fixture = makeRepoFixture(t);
  const initial = openPr(fixture.taskSha, fixture.baseSha);
  const drifted = structuredClone(initial);
  drifted.base.sha = "d".repeat(40);
  writeGhState(fixture, { prSequence: [initial, drifted] });

  const result = runHarness(fixture, fixture.task, ["merge", "940"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /base SHA/);
  const calls = readCalls(fixture);
  assert.equal(calls.filter((call) => call.tool === "verify").length, 0);
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/pulls\/940\/merge$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("merge rechecks base and head immediately before the API mutation", (t) => {
  for (const field of ["base", "head"]) {
    const fixture = makeRepoFixture(t);
    const initial = openPr(fixture.taskSha, fixture.baseSha);
    const drifted = structuredClone(initial);
    if (field === "base") drifted.base.sha = "d".repeat(40);
    else drifted.head.sha = "e".repeat(40);
    writeGhState(fixture, { prSequence: [initial, initial, drifted] });

    const result = runHarness(fixture, fixture.task, ["merge", "940"]);
    assert.equal(
      result.status,
      1,
      `${field}\n${result.stderr}\n${result.stdout}`,
    );
    assert.match(result.stderr, field === "base" ? /base SHA/ : /head SHA/);
    const calls = readCalls(fixture);
    assert.ok(
      calls.some(
        (call) => call.tool === "gh" && call.endpoint.includes("/check-runs"),
      ),
      field,
    );
    assert.equal(
      calls.filter(
        (call) =>
          call.tool === "gh" &&
          call.method === "PUT" &&
          /\/pulls\/940\/merge$/.test(call.endpoint),
      ).length,
      0,
      field,
    );
  }
});

test("merge rechecks exact QA after CI and before the merge mutation", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, {
    driftIssueAfterChecks: ["status:blocked", "blocked-from:qa"],
  });
  const result = runHarness(fixture, fixture.task, ["merge", "940"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /must be status:qa/);
  const calls = readCalls(fixture);
  assert.ok(
    calls.some(
      (call) => call.tool === "gh" && call.endpoint.includes("/check-runs"),
    ),
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/pulls\/940\/merge$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("merge checks exact QA after the final origin validation", (t) => {
  const fixture = makeRepoFixture(t);
  writeGhState(fixture, { armIssueDriftOnOriginAfterPrGet: 3 });
  const result = runHarness(fixture, fixture.task, ["merge", "940"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /must be status:qa/);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/pulls\/940\/merge$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("merge sends the verified PR head SHA after rechecking the PR", (t) => {
  const fixture = makeRepoFixture(t);
  const open = openPr(fixture.taskSha, fixture.baseSha);
  const mergeSha = "c".repeat(40);
  const merged = mergedPrState(fixture, mergeSha);
  writeGhState(fixture, {
    prSequence: [open, open, open, merged],
    merge: { merged: true, sha: mergeSha },
  });
  const result = runHarness(fixture, fixture.task, ["merge", "940"]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

  const calls = readCalls(fixture);
  const mergeIndex = calls.findIndex(
    (call) =>
      call.tool === "gh" &&
      call.method === "PUT" &&
      /\/pulls\/940\/merge$/.test(call.endpoint),
  );
  const mergeCall = calls[mergeIndex];
  assert.equal(mergeCall.payload.sha, fixture.taskSha);
  assert.equal(calls.filter((call) => call.tool === "verify").length, 0);
  const prGetIndexes = calls
    .map((call, index) => ({ call, index }))
    .filter(
      ({ call }) =>
        call.tool === "gh" &&
        call.method === "GET" &&
        /\/pulls\/940$/.test(call.endpoint),
    )
    .map(({ index }) => index);
  const checksIndex = calls.findIndex(
    (call) => call.tool === "gh" && call.endpoint.includes("/check-runs"),
  );
  assert.equal(prGetIndexes.length, 4);
  assert.ok(prGetIndexes[0] < prGetIndexes[1]);
  assert.ok(prGetIndexes[1] < checksIndex && checksIndex < prGetIndexes[2]);
  assert.ok(prGetIndexes[2] < mergeIndex && mergeIndex < prGetIndexes[3]);
  assert.match(result.stdout, /"alreadyMerged": false/);
});

test("merge requires the PR body to bind the verified SHA", (t) => {
  const fixture = makeRepoFixture(t);
  const pr = openPr(fixture.taskSha, fixture.baseSha);
  pr.body = "Closes #40";
  writeGhState(fixture, { pr });

  const result = runHarness(fixture, fixture.task, ["merge", "940"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /verified SHA/);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/pulls\/940\/merge$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("merge is idempotent when the PR is already merged", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = "c".repeat(40);
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.task, ["merge", "940"]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /"alreadyMerged": true/);
  const calls = readCalls(fixture);
  assert.equal(calls.filter((call) => call.tool === "verify").length, 0);
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "gh" &&
        call.method === "PUT" &&
        /\/pulls\/940\/merge$/.test(call.endpoint),
    ).length,
    0,
  );
});

test("close rejects unrelated or unmerged PRs without mutating the issue", (t) => {
  for (const relation of ["unmerged", "wrong branch"]) {
    const fixture = makeRepoFixture(t);
    const mergeSha = "c".repeat(40);
    const pr =
      relation === "unmerged"
        ? openPr(fixture.taskSha, fixture.baseSha)
        : mergedPrState(fixture, mergeSha);
    if (relation === "wrong branch") pr.head.ref = "codex/issue-999";
    writeGhState(fixture, { pr });

    const result = runHarness(fixture, fixture.repo, ["close", "40", "940"]);
    assert.equal(
      result.status,
      1,
      `${relation}\n${result.stderr}\n${result.stdout}`,
    );
    const calls = readCalls(fixture);
    assert.equal(
      calls.filter(
        (call) =>
          call.tool === "gh" &&
          ((call.method === "POST" && /\/comments$/.test(call.endpoint)) ||
            (call.method === "PATCH" && /\/issues\/40$/.test(call.endpoint))),
      ).length,
      0,
      relation,
    );
  }
});

test("close writes one completion marker and is idempotent on rerun", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = "c".repeat(40);
  writeGhState(fixture, {
    issue: issueState("open"),
    pr: mergedPrState(fixture, mergeSha),
    comments: [],
  });

  const first = runHarness(fixture, fixture.repo, ["close", "40", "940"]);
  assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);
  const second = runHarness(fixture, fixture.repo, ["close", "40", "940"]);
  assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
  assert.match(second.stdout, /"alreadyClosed": true/);
  assert.match(second.stdout, /"alreadyCommented": true/);

  const calls = readCalls(fixture);
  const commentGets = calls.filter(
    (call) =>
      call.tool === "gh" &&
      call.method === "GET" &&
      /\/issues\/40\/comments\?/.test(call.endpoint),
  );
  const commentPosts = calls.filter(
    (call) =>
      call.tool === "gh" &&
      call.method === "POST" &&
      /\/issues\/40\/comments$/.test(call.endpoint),
  );
  const issuePatches = calls.filter(
    (call) =>
      call.tool === "gh" &&
      call.method === "PATCH" &&
      /\/issues\/40$/.test(call.endpoint),
  );
  assert.equal(commentGets.length, 2);
  assert.equal(commentPosts.length, 1);
  assert.match(commentPosts[0].payload.body, /gyeop-task-harness-complete/);
  assert.equal(issuePatches.length, 1);
});

test("close recovers from comment or issue patch failure without duplicating its marker", (t) => {
  for (const failure of ["failCommentPostOnce", "failIssuePatchOnce"]) {
    const fixture = makeRepoFixture(t);
    const mergeSha = "c".repeat(40);
    writeGhState(fixture, {
      issue: issueState("open"),
      pr: mergedPrState(fixture, mergeSha),
      comments: [],
      [failure]: true,
    });

    const first = runHarness(fixture, fixture.repo, ["close", "40", "940"]);
    assert.equal(
      first.status,
      1,
      `${failure}\n${first.stderr}\n${first.stdout}`,
    );
    const second = runHarness(fixture, fixture.repo, ["close", "40", "940"]);
    assert.equal(
      second.status,
      0,
      `${failure}\n${second.stderr}\n${second.stdout}`,
    );

    const state = readGhState(fixture);
    assert.equal(state.issue.state, "closed", failure);
    assert.equal(state.comments.length, 1, failure);
    assert.equal(
      state.comments.filter((comment) =>
        comment.body.includes("gyeop-task-harness-complete"),
      ).length,
      1,
      failure,
    );
  }
});

test("cleanup treats a backslash root filename as unsafe instead of a node_modules path", (t) => {
  const fixture = makeRepoFixture(t);
  fs.writeFileSync(
    path.join(fixture.task, "node_modules\\valuable.unsafe"),
    "do not delete\n",
  );
  const mergeSha = publishMergedMain(fixture, "integrator-unsafe");
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /non-disposable ignored paths/);
  assert.equal(git(fixture.repo, "rev-parse", "main"), fixture.baseSha);
  assert.equal(
    git(
      fixture.repo,
      "show-ref",
      "--verify",
      "--hash",
      "refs/heads/codex/issue-40",
    ),
    fixture.taskSha,
  );
  assert.ok(fs.existsSync(fixture.task));

  const calls = readCalls(fixture);
  const mutations = calls.filter(
    (call) =>
      call.tool === "git" &&
      ((call.args[0] === "merge" && call.args[1] === "--ff-only") ||
        (call.args[0] === "worktree" && call.args[1] === "remove") ||
        (call.args[0] === "branch" && call.args[1] === "-D") ||
        call.args[0] === "push" ||
        call.args[0] === "update-ref" ||
        (call.args[0] === "config" && call.args[1] === "--remove-section")),
  );
  assert.deepEqual(mutations, []);
});

test("cleanup rechecks the origin fetch URL after GitHub evidence reads", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-fetchurl-race");
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"], {
    FAKE_CHANGE_FETCH_URL_AFTER_PR_GET: "1",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /does not match git origin/);
  assert.equal(git(fixture.repo, "rev-parse", "main"), fixture.baseSha);
  assert.ok(fs.existsSync(fixture.task));

  const calls = readCalls(fixture);
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "fetch")
      .length,
    0,
  );
});

test("cleanup remote mismatch leaves main, worktree, and refs unchanged", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-mismatch");
  const remoteSha = advanceRemoteTaskBranch(fixture);
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /remote branch.*must be/);
  assert.equal(git(fixture.repo, "rev-parse", "main"), fixture.baseSha);
  assert.equal(
    git(
      fixture.repo,
      "show-ref",
      "--verify",
      "--hash",
      "refs/heads/codex/issue-40",
    ),
    fixture.taskSha,
  );
  assert.equal(
    git(
      fixture.repo,
      "ls-remote",
      "--heads",
      "origin",
      "refs/heads/codex/issue-40",
    ).split(/\s+/)[0],
    remoteSha,
  );
  assert.ok(fs.existsSync(fixture.task));

  const calls = readCalls(fixture);
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "merge")
      .length,
    0,
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "worktree" &&
        call.args[1] === "remove",
    ).length,
    0,
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "branch" &&
        call.args[1] === "-m",
    ).length,
    0,
  );
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "update-ref")
      .length,
    0,
  );
  assert.equal(
    calls.filter((call) => call.tool === "git" && call.args[0] === "push")
      .length,
    0,
  );
});

test("cleanup remote-tracking mismatch leaves every task resource unchanged", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-tracking-mismatch");
  git(
    fixture.repo,
    "update-ref",
    "refs/remotes/origin/codex/issue-40",
    fixture.baseSha,
    fixture.taskSha,
  );
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"]);
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /remote-tracking branch/);
  assert.equal(git(fixture.repo, "rev-parse", "main"), fixture.baseSha);
  assert.equal(
    git(fixture.repo, "rev-parse", "refs/heads/codex/issue-40"),
    fixture.taskSha,
  );
  assert.equal(
    git(fixture.repo, "rev-parse", "refs/remotes/origin/codex/issue-40"),
    fixture.baseSha,
  );
  assert.equal(remoteBranchShaForTest(fixture), fixture.taskSha);
  assert.ok(fs.existsSync(fixture.task));

  const calls = readCalls(fixture);
  const mutations = calls.filter(
    (call) =>
      call.tool === "git" &&
      ((call.args[0] === "merge" && call.args[1] === "--ff-only") ||
        (call.args[0] === "worktree" && call.args[1] === "remove") ||
        (call.args[0] === "branch" && call.args[1] === "-m") ||
        call.args[0] === "push" ||
        call.args[0] === "update-ref" ||
        (call.args[0] === "config" &&
          ["--remove-section", "--rename-section"].includes(call.args[1]))),
  );
  assert.deepEqual(mutations, []);
});

test("cleanup rechecks the origin push URL immediately before remote deletion", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-pushurl-race");
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"], {
    FAKE_CHANGE_PUSH_URL_AFTER_LOCAL_DELETE: "1",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /does not match git origin/);
  assert.equal(remoteBranchShaForTest(fixture), fixture.taskSha);

  const calls = readCalls(fixture);
  assert.equal(
    calls.filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "push" &&
        call.args.includes(":refs/heads/codex/issue-40"),
    ).length,
    0,
  );
});

test("cleanup removes worktree, local branch, remote branch, tracking ref, and branch config in order", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-success");
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"], {
    FAKE_RESTORE_REMOTE_TRACKING: "1",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(git(fixture.repo, "rev-parse", "main"), mergeSha);
  assert.notEqual(
    gitResult(fixture.repo, "show-ref", "--verify", "refs/heads/codex/issue-40")
      .status,
    0,
  );
  assert.equal(
    git(
      fixture.repo,
      "ls-remote",
      "--heads",
      "origin",
      "refs/heads/codex/issue-40",
    ),
    "",
  );
  assert.equal(fs.existsSync(fixture.task), false);

  const calls = readCalls(fixture);
  const indexOfGit = (predicate) =>
    calls.findIndex((call) => call.tool === "git" && predicate(call.args));
  const fetchIndex = indexOfGit(
    (args) => args[0] === "fetch" && args[2] === "main",
  );
  const fastForwardIndex = indexOfGit(
    (args) => args[0] === "merge" && args[1] === "--ff-only",
  );
  const removeIndex = indexOfGit(
    (args) => args[0] === "worktree" && args[1] === "remove",
  );
  const quarantineIndex = indexOfGit(
    (args) =>
      args[0] === "branch" &&
      args[1] === "-m" &&
      args[2] === "codex/issue-40" &&
      args[3] === "codex/issue-40-cleanup-quarantine",
  );
  const localDeleteIndex = indexOfGit(
    (args) =>
      args[0] === "update-ref" &&
      args[1] === "-d" &&
      args[2] === "refs/heads/codex/issue-40-cleanup-quarantine" &&
      args[3] === fixture.taskSha,
  );
  const remoteDeleteIndex = indexOfGit(
    (args) =>
      args[0] === "push" &&
      args.includes(
        `--force-with-lease=refs/heads/codex/issue-40:${fixture.taskSha}`,
      ) &&
      args.includes(":refs/heads/codex/issue-40"),
  );
  const trackingDeleteIndex = indexOfGit(
    (args) =>
      args[0] === "update-ref" &&
      args[1] === "-d" &&
      args[2] === "refs/remotes/origin/codex/issue-40" &&
      args[3] === fixture.taskSha,
  );
  const configDeleteIndex = indexOfGit(
    (args) =>
      args[0] === "config" &&
      args.includes("--local") &&
      args.includes("--remove-section") &&
      args.includes("branch.codex/issue-40-cleanup-quarantine"),
  );
  assert.ok(
    [
      fetchIndex,
      fastForwardIndex,
      removeIndex,
      quarantineIndex,
      localDeleteIndex,
      configDeleteIndex,
      remoteDeleteIndex,
      trackingDeleteIndex,
    ].every((index) => index >= 0),
    JSON.stringify({
      fetchIndex,
      fastForwardIndex,
      removeIndex,
      quarantineIndex,
      localDeleteIndex,
      configDeleteIndex,
      remoteDeleteIndex,
      trackingDeleteIndex,
    }),
  );
  assert.ok(fetchIndex < fastForwardIndex);
  assert.ok(fastForwardIndex < removeIndex);
  assert.ok(removeIndex < quarantineIndex);
  assert.ok(quarantineIndex < localDeleteIndex);
  assert.ok(localDeleteIndex < configDeleteIndex);
  assert.ok(localDeleteIndex < remoteDeleteIndex);
  assert.ok(remoteDeleteIndex < trackingDeleteIndex);
  assert.notEqual(
    gitResult(
      fixture.repo,
      "config",
      "--get-regexp",
      "^branch\\.codex/issue-40\\.",
    ).status,
    0,
  );
});

test("cleanup preserves a new local commit when the quarantine CAS detects drift", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-local-drift");
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"], {
    FAKE_LOCAL_DRIFT_BEFORE_CAS: "1",
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /compare-and-delete failed/);
  const driftSha = fs.readFileSync(fixture.driftShaFile, "utf8").trim();
  assert.notEqual(driftSha, fixture.taskSha);
  assert.equal(
    git(fixture.repo, "rev-parse", "refs/heads/codex/issue-40"),
    driftSha,
  );
  assert.equal(
    git(
      fixture.repo,
      "for-each-ref",
      "--format=%(refname)",
      "refs/heads/codex/issue-40-cleanup-quarantine",
    ),
    "",
  );
  assert.equal(remoteBranchShaForTest(fixture), fixture.taskSha);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "push" &&
        call.args.includes(":refs/heads/codex/issue-40"),
    ).length,
    0,
  );
});

test("cleanup restores a quarantine ref when a linked worktree races the CAS deletion", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-linked-race");
  const raceWorktree = path.join(fixture.root, "race-worktree");
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"], {
    FAKE_LINK_QUARANTINE_BEFORE_CAS: raceWorktree,
  });
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /checked out|compare-and-delete/);
  assert.equal(git(raceWorktree, "rev-parse", "HEAD"), fixture.taskSha);
  const original = gitResult(
    fixture.repo,
    "rev-parse",
    "--verify",
    "refs/heads/codex/issue-40",
  );
  const quarantine = gitResult(
    fixture.repo,
    "rev-parse",
    "--verify",
    "refs/heads/codex/issue-40-cleanup-quarantine",
  );
  assert.ok(original.status === 0 || quarantine.status === 0);
  assert.equal(
    (original.status === 0 ? original.stdout : quarantine.stdout).trim(),
    fixture.taskSha,
  );
  assert.equal(remoteBranchShaForTest(fixture), fixture.taskSha);
  assert.equal(
    readCalls(fixture).filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "push" &&
        call.args.includes(":refs/heads/codex/issue-40"),
    ).length,
    0,
  );
});

test("cleanup resumes a deterministic quarantine left by an interrupted run", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-quarantine-resume");
  git(fixture.repo, "worktree", "remove", fixture.task);
  git(
    fixture.repo,
    "branch",
    "-m",
    "codex/issue-40",
    "codex/issue-40-cleanup-quarantine",
  );
  git(
    fixture.repo,
    "config",
    "--rename-section",
    "branch.codex/issue-40-cleanup-quarantine",
    "branch.codex/issue-40",
  );
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const result = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(
    git(
      fixture.repo,
      "for-each-ref",
      "--format=%(refname)",
      "refs/heads/codex/issue-40",
    ),
    "",
  );
  assert.equal(
    git(
      fixture.repo,
      "for-each-ref",
      "--format=%(refname)",
      "refs/heads/codex/issue-40-cleanup-quarantine",
    ),
    "",
  );
  assert.notEqual(
    gitResult(
      fixture.repo,
      "config",
      "--get-regexp",
      "^branch\\.codex/issue-40-cleanup-quarantine\\.",
    ).status,
    0,
  );
});

test("cleanup handles an already absent remote branch and reruns without duplicate mutations", (t) => {
  const fixture = makeRepoFixture(t);
  const mergeSha = publishMergedMain(fixture, "integrator-remote-absent");
  git(
    fixture.root,
    "--git-dir",
    fixture.origin,
    "update-ref",
    "-d",
    "refs/heads/codex/issue-40",
    fixture.taskSha,
  );
  assert.equal(remoteBranchShaForTest(fixture), "");
  assert.equal(
    git(fixture.repo, "rev-parse", "refs/remotes/origin/codex/issue-40"),
    fixture.taskSha,
  );
  writeGhState(fixture, {
    issue: issueState("closed"),
    pr: mergedPrState(fixture, mergeSha),
  });

  const first = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"]);
  assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);
  const firstCalls = readCalls(fixture);
  assert.equal(
    firstCalls.filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "push" &&
        call.args.includes(":refs/heads/codex/issue-40"),
    ).length,
    0,
  );
  assert.equal(
    firstCalls.filter(
      (call) =>
        call.tool === "git" &&
        call.args[0] === "update-ref" &&
        call.args[2] === "refs/remotes/origin/codex/issue-40" &&
        call.args[3] === fixture.taskSha,
    ).length,
    1,
  );

  const beforeRerun = firstCalls.length;
  const second = runHarness(fixture, fixture.repo, ["cleanup", "40", "940"]);
  assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
  const rerunCalls = readCalls(fixture).slice(beforeRerun);
  const duplicateMutations = rerunCalls.filter(
    (call) =>
      call.tool === "git" &&
      ((call.args[0] === "worktree" && call.args[1] === "remove") ||
        (call.args[0] === "branch" && call.args[1] === "-m") ||
        call.args[0] === "push" ||
        call.args[0] === "update-ref" ||
        (call.args[0] === "config" &&
          ["--remove-section", "--rename-section"].includes(call.args[1]))),
  );
  assert.deepEqual(duplicateMutations, []);
});
