#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function repoFromOrigin() {
  const result = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" });
  if (result.status !== 0) return "";
  const match = result.stdout.trim().match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match ? match[1] : "";
}

function defaultWorktreeRoot(commonDir, cwd = process.cwd()) {
  const repoRoot = commonDir ? path.dirname(path.resolve(cwd, commonDir)) : cwd;
  return path.resolve(repoRoot, "..", "gyeop-worktrees");
}

const repo = process.env.GYEOP_GITHUB_REPO || repoFromOrigin();
const mainBranch = process.env.GYEOP_MAIN_BRANCH || "main";
const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" });
const worktreeRoot =
  process.env.GYEOP_WORKTREE_ROOT ||
  defaultWorktreeRoot(commonDir.status === 0 ? commonDir.stdout.trim() : "");
const projectOwner = process.env.GYEOP_GITHUB_OWNER || (repo ? repo.split("/")[0] : "");
const projectNumber = process.env.GYEOP_GITHUB_PROJECT_NUMBER || "";

const statusLabels = [
  "status:backlog",
  "status:ready",
  "status:spec",
  "status:implementing",
  "status:qa",
  "status:blocked",
];

const managedLabels = [
  ["status:backlog", "d4c5f9", "Planned and waiting for predecessor issues"],
  ["status:ready", "0e8a16", "Ready for Codex task harness intake"],
  ["status:spec", "1d76db", "Spec is being drafted or reviewed"],
  ["status:implementing", "fbca04", "Implementation is in progress"],
  ["status:qa", "5319e7", "QA verification is in progress"],
  ["status:blocked", "d73a4a", "Blocked by missing input or external state"],
  ["priority:p0", "b60205", "Launch-blocking priority"],
  ["priority:p1", "d93f0b", "Important post-core priority"],
  ["priority:p2", "fbca04", "Later growth or optimization priority"],
  ["type:planning", "7057ff", "Product planning and specifications"],
  ["type:design", "c5def5", "Product and visual design"],
  ["type:frontend", "1d76db", "Mobile web frontend"],
  ["type:backend", "0052cc", "API and service implementation"],
  ["type:data", "006b75", "Schema, storage, analytics, and migration"],
  ["type:safety", "e11d21", "Privacy, abuse, and content safety"],
  ["type:qa", "bfd4f2", "Testing and verification"],
  ["type:ops", "0e8a16", "Developer workflow and operations"],
];

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    input: options.input,
    encoding: "utf8",
    stdio: options.stdio || ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : "";
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${stderr}${stdout}`);
  }

  return result.stdout || "";
}

function ghApi(method, endpoint, payload) {
  if (!repo) {
    throw new Error("GitHub repository is not configured. Add origin or set GYEOP_GITHUB_REPO=owner/repo.");
  }
  const args = ["api", "-X", method, endpoint, "-H", "Accept: application/vnd.github+json"];
  const input = payload === undefined ? undefined : JSON.stringify(payload);

  if (payload !== undefined) {
    args.push("--input", "-");
  }

  const stdout = run("gh", args, { input });
  return stdout.trim() ? JSON.parse(stdout) : {};
}

function issueEndpoint(number) {
  return `repos/${repo}/issues/${number}`;
}

function prEndpoint(number) {
  return `repos/${repo}/pulls/${number}`;
}

function getIssue(number) {
  return ghApi("GET", issueEndpoint(number));
}

function issueLabels(issue) {
  return (issue.labels || []).map((label) => (typeof label === "string" ? label : label.name));
}

function assertIssueStatus(issue, expected) {
  if (!issueLabels(issue).includes(expected)) {
    throw new Error(`issue #${issue.number} must be ${expected} before PR creation`);
  }
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "") || "task";
}

function issueSlug(issue) {
  return `issue-${issue.number}`;
}

function branchForIssue(issue) {
  return `codex/${issueSlug(issue)}`;
}

function specPathForIssue(issue) {
  return `docs/specs/${issueSlug(issue)}.md`;
}

function qaPathForIssue(issue) {
  return `docs/temp/qa/${issueSlug(issue)}.md`;
}

function dependencyNumbers(body) {
  const section = String(body || "").match(/### 선행 이슈\s*\n([\s\S]*?)(?=\n### |\n## |$)/)?.[1] || "";
  return [...new Set([...section.matchAll(/#(\d+)\b/g)].map((match) => Number(match[1])))];
}

function assertPredecessorsClosed(issue) {
  for (const number of dependencyNumbers(issue.body)) {
    const predecessor = getIssue(number);
    assert(predecessor.state === "closed", `predecessor issue #${number} must be closed before status:ready`);
  }
}

function setStatus(number, nextStatus) {
  assert(statusLabels.includes(nextStatus), `unknown status label: ${nextStatus}`);
  const issue = getIssue(number);
  if (nextStatus === "status:ready") assertPredecessorsClosed(issue);
  const labels = issueLabels(issue).filter((label) => !statusLabels.includes(label));
  labels.push(nextStatus);
  ghApi("PUT", `${issueEndpoint(number)}/labels`, { labels });
  return labels;
}

function createOrUpdateLabel(name, color, description) {
  try {
    ghApi("POST", `repos/${repo}/labels`, { name, color, description });
  } catch (error) {
    if (String(error.message).includes("already_exists")) {
      ghApi("PATCH", `repos/${repo}/labels/${encodeURIComponent(name)}`, { color, description });
    } else {
      throw error;
    }
  }
}

function labelSync() {
  for (const [name, color, description] of managedLabels) {
    createOrUpdateLabel(name, color, description);
  }
  console.log(JSON.stringify({ synced: managedLabels.map(([name]) => name) }, null, 2));
}

function status(issueNumber, nextStatus) {
  const labels = setStatus(issueNumber, nextStatus);
  console.log(JSON.stringify({ issue: Number(issueNumber), status: nextStatus, labels }, null, 2));
}

function queue() {
  const issues = ghApi(
    "GET",
    `repos/${repo}/issues?state=open&per_page=100&labels=${encodeURIComponent("status:ready")}`,
  ).filter((issue) => !issue.pull_request);

  const priorityRank = (issue) => {
    const labels = issueLabels(issue);
    if (labels.includes("priority:p0")) return 0;
    if (labels.includes("priority:p1")) return 1;
    return 2;
  };

  issues.sort((a, b) => priorityRank(a) - priorityRank(b) || a.number - b.number);
  console.log(
    JSON.stringify(
      issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        labels: issueLabels(issue).filter((label) => label.startsWith("priority:") || label.startsWith("type:")),
      })),
      null,
      2,
    ),
  );
}

function doctor() {
  const checks = [];
  const add = (name, fn) => {
    try {
      fn();
      checks.push({ name, status: "ok" });
    } catch (error) {
      checks.push({ name, status: "fail", message: error.message.split("\n")[0] });
    }
  };

  add("gh auth", () => run("gh", ["auth", "status"]));
  add("GitHub repository", () => {
    if (!repo) throw new Error("add origin or set GYEOP_GITHUB_REPO=owner/repo");
    ghApi("GET", `repos/${repo}`);
  });
  add("git worktree", () => run("git", ["status", "--porcelain=v1", "--branch"]));
  add("verify script", () => {
    if (!fs.existsSync("scripts/ai-verify")) throw new Error("missing scripts/ai-verify");
  });
  add("task templates", () => {
    for (const file of ["docs/templates/implementation-spec.md", "docs/templates/qa-verdict.md"]) {
      if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    }
  });
  add("repo-owned skill", () => {
    if (!fs.existsSync(".codex/skills/gyeop-task/SKILL.md")) {
      throw new Error("missing gyeop-task skill");
    }
  });

  console.log(
    JSON.stringify(
      {
        repo: repo || null,
        worktreeRoot,
        project: projectNumber ? { owner: projectOwner, number: projectNumber } : null,
        projectStatus: projectNumber ? "configured" : "skipped; status labels remain authoritative",
        checks,
      },
      null,
      2,
    ),
  );
}

function projectAdd(issueNumber) {
  if (!projectNumber || !projectOwner) {
    throw new Error("Set GYEOP_GITHUB_PROJECT_NUMBER and GYEOP_GITHUB_OWNER before Project sync.");
  }
  const issue = getIssue(issueNumber);
  const output = run("gh", [
    "project",
    "item-add",
    projectNumber,
    "--owner",
    projectOwner,
    "--url",
    issue.html_url,
    "--format",
    "json",
  ]);
  console.log(output.trim());
}

function start(issueNumber) {
  const issue = getIssue(issueNumber);
  assertIssueStatus(issue, "status:ready");
  assertPredecessorsClosed(issue);
  const branch = branchForIssue(issue);
  const target = path.join(worktreeRoot, issueSlug(issue));

  fs.mkdirSync(worktreeRoot, { recursive: true });
  run("git", ["fetch", "origin", mainBranch], { stdio: "inherit" });
  run("git", ["worktree", "add", "-b", branch, target, `origin/${mainBranch}`], { stdio: "inherit" });
  setStatus(issueNumber, "status:spec");

  console.log(JSON.stringify({ issue: issue.number, branch, worktree: target, status: "status:spec" }, null, 2));
}

function renderSpec(issue) {
  return `# Issue ${issue.number} 구현 스펙: ${issue.title}

Status: Draft
Issue: ${issue.html_url}

## 목표

이슈 #${issue.number}에서 달성할 제품 또는 엔지니어링 결과를 한 문장으로 작성한다.

## 범위

- [ ] 이번 이슈에서 구현할 화면, API, 데이터, 문서, 테스트를 작성한다.

## 제외 범위

- [ ] 인접하지만 이번 PR에 포함하지 않을 작업을 작성한다.

## SSOT

- docs/product/core-feature-priority.md
- docs/product/question-pack-spec.md
- docs/product/decision-log.md
- AGENTS.md

## 사용자 흐름 영향

- [ ] 주인, 방문자, 전환된 새 주인의 흐름 변화를 작성한다.

## 디자인 영향

- [ ] 없음, 또는 변경할 화면과 목업을 작성한다.

## API와 데이터 영향

- [ ] 없음, 또는 route, schema, model, migration, storage, auth 변경을 작성한다.

## 구현 계획

- [ ] 파일과 모듈 경계를 포함한 구체적인 순서를 작성한다.

## 완료 기준

- [ ] 관찰 가능하고 테스트 가능한 pass/fail 조건을 작성한다.

## 테스트 계획

- [ ] ./scripts/run-ai-verify --mode full
- [ ] focused test, lint, e2e 또는 수동 확인을 작성한다.

## 분석과 관측성

- [ ] 없음, 또는 퍼널 이벤트, 로그, 대시보드 영향을 작성한다.

## 개인정보와 악용 방지

- [ ] 없음, 또는 익명 응답, 공개 링크, 민감 팩 관련 위험과 완화를 작성한다.

## 롤아웃과 복구

- [ ] 단계적 배포, feature flag, migration rollback 또는 복구 절차를 작성한다.

## 스펙 검토

Reviewer Agent:
Review Status: FAIL
P0/P1 Findings:

## 리스크와 미결정 사항

- [ ] 없음, 또는 구현 전 해결해야 할 블로커를 작성한다.
`;
}

function spec(issueNumber) {
  const issue = getIssue(issueNumber);
  const file = specPathForIssue(issue);
  if (fs.existsSync(file)) {
    throw new Error(`spec already exists: ${file}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderSpec(issue));
  console.log(JSON.stringify({ issue: issue.number, spec: file }, null, 2));
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function validateSections(file, sections) {
  const text = readText(file);
  const missing = sections.filter((section) => !text.includes(`## ${section}`));
  return { text, missing };
}

function specFailures(file) {
  if (!fs.existsSync(file)) return [`missing file: ${file}`];
  const sections = [
    "목표",
    "범위",
    "제외 범위",
    "SSOT",
    "사용자 흐름 영향",
    "디자인 영향",
    "API와 데이터 영향",
    "구현 계획",
    "완료 기준",
    "테스트 계획",
    "분석과 관측성",
    "개인정보와 악용 방지",
    "롤아웃과 복구",
    "스펙 검토",
    "리스크와 미결정 사항",
  ];
  const { text, missing } = validateSections(file, sections);
  const failures = [...missing.map((section) => `missing section: ${section}`)];
  if (!text.includes("Status: Reviewed")) failures.push("spec must be marked `Status: Reviewed` before implementation");
  if (!/Reviewer Agent:\s*\S+/m.test(text)) failures.push("missing spec reviewer agent");
  if (!/Review Status:\s*PASS\b/m.test(text)) failures.push("spec review must be `Review Status: PASS`");
  if (!/P0\/P1 Findings:\s*0\b/m.test(text)) failures.push("spec review must record `P0/P1 Findings: 0`");
  if (/\[(P0|P1)\]/.test(text)) failures.push("P0/P1 spec findings block implementation");
  for (const required of ["docs/product/core-feature-priority.md", "AGENTS.md"]) {
    if (!text.includes(required)) failures.push(`missing SSOT reference: ${required}`);
  }
  if (/\[ \].*(작성한다|교체|Replace with)/.test(text)) {
    failures.push("template placeholders remain");
  }
  return failures;
}

function printCheckResult(kind, file, failures) {
  if (failures.length) {
    console.error(JSON.stringify({ status: "fail", kind, file, failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "pass", kind, file }, null, 2));
}

function specCheck(file) {
  printCheckResult("spec", file, specFailures(file));
}

function qaFailures(file) {
  if (!fs.existsSync(file)) return [`missing file: ${file}`];
  const sections = ["QA 판정", "발견 사항", "검증", "필수 수정"];
  const { text, missing } = validateSections(file, sections);
  const failures = [...missing.map((section) => `missing section: ${section}`)];
  if (!/Status:\s*PASS\b/.test(text)) failures.push("QA verdict must be `Status: PASS`");
  if (/\[(P0|P1)\]/.test(text)) failures.push("P0/P1 findings block merge");
  if (!text.includes("./scripts/run-ai-verify --mode full")) failures.push("missing full verification command");
  return failures;
}

function qaCheck(file) {
  printCheckResult("qa", file, qaFailures(file));
}

function assertGate(kind, file, failures) {
  if (failures.length) {
    throw new Error(`${kind} gate failed for ${file}: ${failures.join("; ")}`);
  }
}

function currentBranch() {
  return run("git", ["branch", "--show-current"]).trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function createPr(issueNumber) {
  const issue = getIssue(issueNumber);
  assertIssueStatus(issue, "status:qa");
  const branch = currentBranch();
  const specFile = specPathForIssue(issue);
  const qaFile = qaPathForIssue(issue);
  assertGate("spec", specFile, specFailures(specFile));
  assertGate("qa", qaFile, qaFailures(qaFile));
  run("git", ["push", "-u", "origin", branch], { stdio: "inherit" });
  const body = [
    `Closes #${issue.number}.`,
    "",
    "## 요약",
    `- 이슈 #${issue.number} 작업을 스펙 -> 구현 -> QA -> 전체 검증 흐름으로 처리했습니다.`,
    "",
    "## 산출물",
    `- 스펙: ${specFile}`,
    `- QA: ${qaFile}`,
    "- 검증: `./scripts/run-ai-verify --mode full`",
    "",
    "## 메모",
    "- `scripts/task-harness pr`로 생성했습니다.",
  ].join("\n");

  const pr = ghApi("POST", `repos/${repo}/pulls`, {
    title: issue.title,
    head: branch,
    base: mainBranch,
    body,
    draft: false,
  });
  console.log(JSON.stringify({ pr: pr.number, url: pr.html_url, branch }, null, 2));
}

function listCheckState(sha) {
  const checks = ghApi("GET", `repos/${repo}/commits/${sha}/check-runs`);
  const status = ghApi("GET", `repos/${repo}/commits/${sha}/status`);
  const failingChecks = (checks.check_runs || []).filter(
    (runItem) => runItem.status !== "completed" || !["success", "neutral", "skipped"].includes(runItem.conclusion),
  );
  const failingStatuses = (status.statuses || []).filter((item) => item.state !== "success");
  return {
    checksTotal: checks.total_count || 0,
    statusesTotal: status.total_count || 0,
    failingChecks,
    failingStatuses,
  };
}

function mergePr(prNumber) {
  run("./scripts/run-ai-verify", ["--mode", "full"], { stdio: "inherit" });
  let pr = ghApi("GET", prEndpoint(prNumber));
  for (let attempt = 0; attempt < 5 && pr.mergeable === null; attempt += 1) {
    sleep(1000);
    pr = ghApi("GET", prEndpoint(prNumber));
  }
  if (pr.state !== "open" || pr.draft || !pr.mergeable) {
    throw new Error(`PR is not mergeable: state=${pr.state} draft=${pr.draft} mergeable=${pr.mergeable}`);
  }
  const issueMatch = String(pr.body || "").match(/Closes\s+#(\d+)/i);
  if (!issueMatch) throw new Error("PR body must include `Closes #<issue-number>`");
  const issue = getIssue(issueMatch[1]);
  const specFile = specPathForIssue(issue);
  const qaFile = qaPathForIssue(issue);
  assertGate("spec", specFile, specFailures(specFile));
  assertGate("qa", qaFile, qaFailures(qaFile));

  const state = listCheckState(pr.head.sha);
  if (state.failingChecks.length || state.failingStatuses.length) {
    console.error(JSON.stringify({ status: "blocked", ...state }, null, 2));
    process.exit(1);
  }

  const merged = ghApi("PUT", `${prEndpoint(prNumber)}/merge`, {
    merge_method: "squash",
    commit_title: pr.title,
    commit_message: `PR #${pr.number}에서 squash merge했습니다.`,
  });
  console.log(JSON.stringify({ pr: pr.number, merged: merged.merged, sha: merged.sha }, null, 2));
}

function closeIssue(issueNumber) {
  ghApi("POST", `${issueEndpoint(issueNumber)}/comments`, {
    body: "스펙, QA, 전체 검증 게이트를 통과해 GYEOP task harness로 완료 처리했습니다.",
  });
  ghApi("PATCH", issueEndpoint(issueNumber), { state: "closed" });
  console.log(JSON.stringify({ issue: Number(issueNumber), closed: true }, null, 2));
}

function cleanup(issueNumber) {
  const issue = getIssue(issueNumber);
  const target = path.join(worktreeRoot, issueSlug(issue));
  run("git", ["worktree", "remove", target], { stdio: "inherit" });
  console.log(JSON.stringify({ removed: target }, null, 2));
}

function usage() {
  console.error(`usage: scripts/task-harness <command> [args]

commands:
  doctor
  label-sync
  project-add <issue-number>
  queue
  status <issue-number> <status-label>
  start <issue-number>
  spec <issue-number>
  spec-check <spec-path>
  qa-check <qa-path>
  pr <issue-number>
  merge <pr-number>
  close <issue-number>
  cleanup <issue-number>`);
}

function main(argv = process.argv.slice(2)) {
  const [command, arg] = argv;
  try {
    if (command === "doctor") return doctor();
    if (command === "label-sync") return labelSync();
    if (command === "project-add" && arg) return projectAdd(arg);
    if (command === "queue") return queue();
    if (command === "status" && arg && argv[2]) return status(arg, argv[2]);
    if (command === "start" && arg) return start(arg);
    if (command === "spec" && arg) return spec(arg);
    if (command === "spec-check" && arg) return specCheck(arg);
    if (command === "qa-check" && arg) return qaCheck(arg);
    if (command === "pr" && arg) return createPr(arg);
    if (command === "merge" && arg) return mergePr(arg);
    if (command === "close" && arg) return closeIssue(arg);
    if (command === "cleanup" && arg) return cleanup(arg);
    usage();
    process.exit(2);
  } catch (error) {
    console.error(JSON.stringify({ status: "error", message: error.message }, null, 2));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  assertIssueStatus,
  branchForIssue,
  dependencyNumbers,
  defaultWorktreeRoot,
  issueSlug,
  listCheckState,
  qaPathForIssue,
  qaFailures,
  slugify,
  specFailures,
  specPathForIssue,
  statusLabels,
};
