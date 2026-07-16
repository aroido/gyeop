#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function repoFromUrl(input) {
  const url = String(input || "").trim();
  const match = [
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/,
    /^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/,
    /^ssh:\/\/git@github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/,
    /^git:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/,
  ].map((pattern) => url.match(pattern)).find(Boolean);
  if (!match) return "";
  const value = match[1].endsWith(".git") ? match[1].slice(0, -4) : match[1];
  return value.split("/").every(Boolean) ? value : "";
}

function originUrls({ push = false } = {}) {
  const args = ["remote", "get-url", ...(push ? ["--push"] : []), "--all", "origin"];
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function repoFromOrigin() {
  return repoFromUrl(originUrls()[0]);
}

function assertOriginRepo() {
  const fetchUrls = originUrls();
  const pushUrls = originUrls({ push: true });
  const remoteRepos = [...fetchUrls, ...pushUrls].map(repoFromUrl);
  const matches = fetchUrls.length > 0 && pushUrls.length > 0 && remoteRepos.every((originRepo) => originRepo === repo);
  if (!repo || !matches) {
    const actual = remoteRepos.filter(Boolean).join(",") || "missing";
    throw new Error(`configured GitHub repository ${repo || "missing"} does not match git origin ${actual}`);
  }
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

function runResult(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    input: options.input,
    encoding: "utf8",
    stdio: options.stdio || ["pipe", "pipe", "pipe"],
  });
}

function run(command, args = [], options = {}) {
  const result = runResult(command, args, options);

  if (result.status !== 0) {
    const cause = result.error ? `\n${result.error.message}` : "";
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : "";
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${cause}${stderr}${stdout}`);
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

function exactFieldValues(text, name) {
  const prefix = `${name}:`;
  return String(text)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim());
}

function exactField(text, name) {
  const values = exactFieldValues(text, name);
  return values.length === 1 ? values[0] : null;
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
  if (exactField(text, "Status") !== "Reviewed") {
    failures.push("spec must contain one exact `Status: Reviewed` field before implementation");
  }
  const reviewer = exactField(text, "Reviewer Agent");
  if (!reviewer || /^(TODO|TBD|Not run)$/i.test(reviewer)) failures.push("missing spec reviewer agent");
  if (exactField(text, "Review Status") !== "PASS") {
    failures.push("spec review must contain one exact `Review Status: PASS` field");
  }
  if (exactField(text, "P0/P1 Findings") !== "0") {
    failures.push("spec review must contain one exact `P0/P1 Findings: 0` field");
  }
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
  if (exactField(text, "Status") !== "PASS") failures.push("QA must contain one exact `Status: PASS` field");
  const reviewer = exactField(text, "Reviewer Agent");
  if (!reviewer || /^(TODO|TBD|Not run)$/i.test(reviewer)) failures.push("missing independent QA reviewer agent");
  if (exactField(text, "P0/P1 Findings") !== "0") {
    failures.push("QA must contain one exact `P0/P1 Findings: 0` field");
  }
  if (/\[(P0|P1)\]/.test(text)) failures.push("P0/P1 findings block merge");
  const fullVerifyResults = [
    ...text.matchAll(
      /^- Command:[ \t]*\.\/scripts\/run-ai-verify --mode full[ \t]*\r?\n- Result:[ \t]*([^\r\n]*)$/gm,
    ),
  ].map((match) => match[1].trim());
  if (fullVerifyResults.length !== 1 || fullVerifyResults[0] !== "PASS") {
    failures.push("QA must contain one exact full verification command block with `Result: PASS`");
  }
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

function checkoutFailures(actual, expected) {
  const failures = [];
  if (actual.branch !== expected.branch) {
    failures.push(`expected branch ${expected.branch}, got ${actual.branch || "detached HEAD"}`);
  }
  if (!actual.clean) failures.push("working tree must be clean");
  if (expected.sha && actual.sha !== expected.sha) {
    failures.push(`expected HEAD ${expected.sha}, got ${actual.sha || "unknown"}`);
  }
  return failures;
}

function checkoutState(cwd = process.cwd()) {
  return {
    branch: run("git", ["branch", "--show-current"], { cwd }).trim(),
    clean: run("git", ["status", "--porcelain=v1"], { cwd }).trim() === "",
    sha: run("git", ["rev-parse", "HEAD"], { cwd }).trim(),
  };
}

function ignoredWorktreePaths(cwd = process.cwd()) {
  return run(
    "git",
    ["status", "--porcelain=v1", "-z", "--ignored=matching", "--untracked-files=normal"],
    { cwd },
  )
    .split("\0")
    .filter((entry) => entry.startsWith("!! "))
    .map((entry) => entry.slice(3));
}

function isDisposableIgnoredPath(file) {
  if (file === ".DS_Store" || file.endsWith(".tsbuildinfo")) return true;
  return [
    "node_modules/",
    ".next/",
    "dist/",
    "coverage/",
    "playwright-report/",
    "test-results/",
    "supabase/.temp/",
    "supabase/.branches/",
    "docs/temp/",
    ".omx/",
  ].some((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix));
}

function unsafeIgnoredPaths(cwd = process.cwd()) {
  return ignoredWorktreePaths(cwd).filter((file) => !isDisposableIgnoredPath(file));
}

function assertCheckout(actual, expected, label = "checkout") {
  const failures = checkoutFailures(actual, expected);
  if (failures.length) throw new Error(`${label} gate failed: ${failures.join("; ")}`);
}

function checkStateFailures(checkRuns = [], statuses = []) {
  const failures = [];
  if (checkRuns.length + statuses.length === 0) failures.push("no CI checks or commit statuses found");
  for (const check of checkRuns) {
    if (check.status !== "completed" || !["success", "neutral", "skipped"].includes(check.conclusion)) {
      failures.push(`check ${check.name || check.id || "unknown"} is ${check.status}/${check.conclusion || "none"}`);
    }
  }
  for (const status of statuses) {
    if (status.state !== "success") {
      failures.push(`commit status ${status.context || status.id || "unknown"} is ${status.state || "unknown"}`);
    }
  }
  return failures;
}

function closingIssueNumbers(body) {
  const text = String(body || "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const explicit = firstLine.match(/^Closes #([1-9]\d*)$/)?.[1];
  const allClosingReferences = [
    ...text.matchAll(
      /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#([1-9]\d*)\b/gi,
    ),
  ].map((match) => Number(match[1]));
  if (!explicit || allClosingReferences.length !== 1 || allClosingReferences[0] !== Number(explicit)) return [];
  return [Number(explicit)];
}

function prRelationFailures(pr, expected) {
  const failures = [];
  if (pr.base?.ref !== expected.mainBranch) failures.push(`PR base must be ${expected.mainBranch}`);
  if (pr.base?.repo?.full_name !== expected.repo) failures.push(`PR base repository must be ${expected.repo}`);
  if (expected.baseSha && pr.base?.sha !== expected.baseSha) {
    failures.push(`PR base SHA must be ${expected.baseSha}`);
  }
  if (pr.head?.repo?.full_name !== expected.repo) failures.push(`PR head repository must be ${expected.repo}`);
  if (pr.head?.ref !== expected.branch) failures.push(`PR head branch must be ${expected.branch}`);
  if (expected.sha && pr.head?.sha !== expected.sha) failures.push(`PR head SHA must be ${expected.sha}`);
  const closingNumbers = closingIssueNumbers(pr.body);
  if (closingNumbers.length !== 1 || closingNumbers[0] !== Number(expected.issueNumber)) {
    failures.push(`PR body must contain exactly one closing reference: \`Closes #${Number(expected.issueNumber)}\``);
  }
  if (expected.requireOpenState && pr.state !== "open") failures.push("PR must be open");
  if (expected.requireDraft && pr.draft !== true) failures.push("PR must be a draft");
  if (expected.requireOpen) {
    if (pr.state !== "open") failures.push("PR must be open");
    if (pr.draft !== false) failures.push("PR must not be a draft");
  }
  if (expected.requireMergeable && pr.mergeable !== true) failures.push("PR must be mergeable");
  if (expected.requireMerged) {
    if (pr.state !== "closed") failures.push("merged PR must be closed");
    if (!pr.merged_at) failures.push("PR must have merged_at evidence");
    if (!pr.merge_commit_sha) failures.push("PR must have merge_commit_sha evidence");
  }
  return failures;
}

function assertPrRelation(pr, expected) {
  const failures = prRelationFailures(pr, expected);
  if (failures.length) throw new Error(`PR relation gate failed: ${failures.join("; ")}`);
}

function parseWorktrees(porcelain) {
  const entries = [];
  let entry = null;
  for (const line of String(porcelain || "").split("\n")) {
    if (line.startsWith("worktree ")) {
      if (entry) entries.push(entry);
      entry = { worktree: line.slice("worktree ".length) };
    } else if (entry && line.startsWith("HEAD ")) {
      entry.head = line.slice("HEAD ".length);
    } else if (entry && line.startsWith("branch ")) {
      entry.branch = line.slice("branch ".length);
    } else if (entry && line === "detached") {
      entry.detached = true;
    }
  }
  if (entry) entries.push(entry);
  return entries;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fileSnapshot(files) {
  return new Map(files.map((file) => [file, readText(file)]));
}

function assertFilesUnchanged(snapshot, label) {
  const changed = [...snapshot].filter(([file, contents]) => !fs.existsSync(file) || readText(file) !== contents);
  if (changed.length) {
    throw new Error(`${label} changed guarded files: ${changed.map(([file]) => file).join(", ")}`);
  }
}

function verifyCheckout(expected, label, guardedFiles = []) {
  const before = checkoutState();
  assertCheckout(before, expected, `${label} before verify`);
  const guardedSnapshot = fileSnapshot(guardedFiles);
  run("./scripts/run-ai-verify", ["--mode", "full"], { stdio: "inherit" });
  const after = checkoutState();
  assertCheckout(after, { ...expected, sha: before.sha }, `${label} after verify`);
  assertFilesUnchanged(guardedSnapshot, label);
  return before.sha;
}

function remoteBranchSha(branch) {
  const output = run("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]).trim();
  return output ? output.split(/\s+/)[0] : "";
}

function openPullRequests(branch) {
  const owner = repo.split("/")[0];
  const query = new URLSearchParams({
    state: "open",
    head: `${owner}:${branch}`,
    base: mainBranch,
    per_page: "100",
  });
  return ghApi("GET", `repos/${repo}/pulls?${query.toString()}`);
}

function reusablePrCandidate(branch, expected) {
  const candidates = openPullRequests(branch);
  if (candidates.length > 1) throw new Error(`multiple open PRs found for ${branch}`);
  if (candidates.length === 0) return null;
  const candidate = candidates[0];
  assertReusablePr(candidate, expected);
  const currentRemoteSha = remoteBranchSha(branch);
  if (!currentRemoteSha || currentRemoteSha !== candidate.head?.sha) {
    throw new Error(
      `existing PR #${candidate.number} head ${candidate.head?.sha || "missing"} does not match remote branch ${currentRemoteSha || "missing"}`,
    );
  }
  return candidate;
}

function markPrReady(prNumber) {
  assertOriginRepo();
  run("gh", ["pr", "ready", String(prNumber), "--repo", repo]);
}

function assertReusablePr(pr, expected) {
  assertPrRelation(pr, { ...expected, requireOpenState: true });
  if (typeof pr.draft !== "boolean") throw new Error(`PR #${pr.number} draft state is missing`);
}

function readyVerifiedPr(pr, expected) {
  assertReusablePr(pr, expected);
  if (!pr.draft) {
    assertPrRelation(pr, { ...expected, requireOpen: true });
    return pr;
  }

  let readyError = null;
  try {
    markPrReady(pr.number);
  } catch (error) {
    readyError = error;
  }

  let confirmationError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const readyPr = ghApi("GET", prEndpoint(pr.number));
      assertPrRelation(readyPr, { ...expected, requireOpen: true });
      return readyPr;
    } catch (error) {
      confirmationError = error;
      if (attempt < 2) sleep(200);
    }
  }

  const commandDetail = readyError ? `; ready command: ${readyError.message}` : "";
  throw new Error(
    `PR #${pr.number} readiness could not be confirmed; the PR was left open for a safe rerun: ${confirmationError?.message || "unknown error"}${commandDetail}`,
  );
}

function createPr(issueNumber) {
  assertOriginRepo();
  const issue = getIssue(issueNumber);
  assertIssueStatus(issue, "status:qa");
  const branch = branchForIssue(issue);
  const specFile = specPathForIssue(issue);
  const qaFile = qaPathForIssue(issue);
  assertGate("spec", specFile, specFailures(specFile));
  assertGate("qa", qaFile, qaFailures(qaFile));
  const body = [
    `Closes #${issue.number}`,
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
  const expected = {
    repo,
    mainBranch,
    issueNumber: issue.number,
    branch,
  };
  const existing = reusablePrCandidate(branch, expected);

  const guardedFiles = [specFile, qaFile];
  const verifiedSha = verifyCheckout({ branch }, "PR checkout", guardedFiles);
  assertGate("spec", specFile, specFailures(specFile));
  assertGate("qa", qaFile, qaFailures(qaFile));
  const recheckedExisting = reusablePrCandidate(branch, expected);
  if (recheckedExisting?.number !== existing?.number) {
    throw new Error(`open PR candidate changed during verification for ${branch}`);
  }
  assertOriginRepo();
  run("git", ["push", "origin", `${verifiedSha}:refs/heads/${branch}`], { stdio: "inherit" });
  const pushedSha = remoteBranchSha(branch);
  if (pushedSha !== verifiedSha) {
    throw new Error(`remote branch ${branch} must be ${verifiedSha}, got ${pushedSha || "missing"}`);
  }
  run("git", ["branch", "--set-upstream-to", `origin/${branch}`, branch]);
  const verifiedExpected = { ...expected, sha: verifiedSha };

  let pr;
  let reused = false;
  if (recheckedExisting) {
    const refreshed = ghApi("GET", prEndpoint(recheckedExisting.number));
    pr = readyVerifiedPr(refreshed, verifiedExpected);
    reused = true;
  } else {
    assertOriginRepo();
    const draft = ghApi("POST", `repos/${repo}/pulls`, {
      title: issue.title,
      head: branch,
      base: mainBranch,
      body,
      draft: true,
    });
    pr = readyVerifiedPr(draft, verifiedExpected);
  }
  console.log(JSON.stringify({ pr: pr.number, url: pr.html_url, branch, verifiedSha, reused }, null, 2));
}

function listCheckState(sha) {
  const checks = ghApi("GET", `repos/${repo}/commits/${sha}/check-runs?per_page=100`);
  const status = ghApi("GET", `repos/${repo}/commits/${sha}/status`);
  const checkRuns = checks.check_runs || [];
  const statuses = status.statuses || [];
  const failingChecks = checkRuns.filter(
    (runItem) => runItem.status !== "completed" || !["success", "neutral", "skipped"].includes(runItem.conclusion),
  );
  const failingStatuses = statuses.filter((item) => item.state !== "success");
  const failures = checkStateFailures(checkRuns, statuses);
  const checksTotal = Number(checks.total_count ?? checkRuns.length);
  const statusesTotal = Number(status.total_count ?? statuses.length);
  if (checksTotal !== checkRuns.length || statusesTotal !== statuses.length) {
    failures.push("CI result set is incomplete; more than 100 results are not supported");
  }
  return {
    checksTotal,
    statusesTotal,
    failingChecks,
    failingStatuses,
    failures,
  };
}

function mergeablePr(prNumber) {
  let pr = ghApi("GET", prEndpoint(prNumber));
  for (let attempt = 0; attempt < 5 && pr.mergeable === null; attempt += 1) {
    sleep(1000);
    pr = ghApi("GET", prEndpoint(prNumber));
  }
  return pr;
}

function closingIssueNumber(body) {
  const numbers = closingIssueNumbers(body);
  return numbers.length === 1 ? numbers[0] : 0;
}

function mergePr(prNumber) {
  assertOriginRepo();
  let pr = mergeablePr(prNumber);
  const issueNumber = closingIssueNumber(pr.body);
  if (issueNumber <= 0) throw new Error("PR body must contain exactly one `Closes #<issue-number>` reference");
  const issue = getIssue(issueNumber);
  const branch = branchForIssue(issue);
  if (pr.merged_at) {
    assertPrRelation(pr, {
      repo,
      mainBranch,
      issueNumber: issue.number,
      branch,
      sha: pr.head?.sha,
      requireMerged: true,
    });
    console.log(
      JSON.stringify(
        { pr: pr.number, merged: true, sha: pr.merge_commit_sha, verifiedSha: pr.head.sha, alreadyMerged: true },
        null,
        2,
      ),
    );
    return;
  }
  const baseSha = pr.base?.sha;
  if (!baseSha) throw new Error("PR base SHA is missing");
  assertPrRelation(pr, {
    repo,
    mainBranch,
    baseSha,
    issueNumber: issue.number,
    branch,
    sha: pr.head?.sha,
    requireOpen: true,
    requireMergeable: true,
  });
  const specFile = specPathForIssue(issue);
  const qaFile = qaPathForIssue(issue);
  assertGate("spec", specFile, specFailures(specFile));
  assertGate("qa", qaFile, qaFailures(qaFile));
  const guardedFiles = [specFile, qaFile];
  const verifiedSha = verifyCheckout({ branch, sha: pr.head.sha }, "merge checkout", guardedFiles);
  assertGate("spec", specFile, specFailures(specFile));
  assertGate("qa", qaFile, qaFailures(qaFile));

  pr = mergeablePr(prNumber);
  assertPrRelation(pr, {
    repo,
    mainBranch,
    baseSha,
    issueNumber: issue.number,
    branch,
    sha: verifiedSha,
    requireOpen: true,
    requireMergeable: true,
  });

  const state = listCheckState(verifiedSha);
  if (state.failures.length) {
    console.error(JSON.stringify({ status: "blocked", ...state }, null, 2));
    process.exit(1);
  }

  pr = mergeablePr(prNumber);
  assertPrRelation(pr, {
    repo,
    mainBranch,
    baseSha,
    issueNumber: issue.number,
    branch,
    sha: verifiedSha,
    requireOpen: true,
    requireMergeable: true,
  });

  assertOriginRepo();
  const merged = ghApi("PUT", `${prEndpoint(prNumber)}/merge`, {
    merge_method: "squash",
    commit_title: pr.title,
    commit_message: `PR #${pr.number}에서 squash merge했습니다.`,
    sha: verifiedSha,
  });
  if (!merged.merged) throw new Error(`GitHub refused to merge PR #${pr.number}: ${merged.message || "unknown reason"}`);
  const mergedPr = ghApi("GET", prEndpoint(prNumber));
  assertPrRelation(mergedPr, {
    repo,
    mainBranch,
    baseSha,
    issueNumber: issue.number,
    branch,
    sha: verifiedSha,
    requireMerged: true,
  });
  if (mergedPr.merge_commit_sha !== merged.sha) {
    throw new Error(`merged PR SHA ${mergedPr.merge_commit_sha} does not match merge response ${merged.sha}`);
  }
  console.log(JSON.stringify({ pr: pr.number, merged: true, sha: merged.sha, verifiedSha, alreadyMerged: false }, null, 2));
}

function mergedPrForIssue(issue, prNumber) {
  const pr = ghApi("GET", prEndpoint(prNumber));
  assertPrRelation(pr, {
    repo,
    mainBranch,
    issueNumber: issue.number,
    branch: branchForIssue(issue),
    requireMerged: true,
  });
  return pr;
}

function completionCommentMarker(issue, pr) {
  return `<!-- gyeop-task-harness-complete issue=${issue.number} pr=${pr.number} merge=${pr.merge_commit_sha} -->`;
}

function closeIssue(issueNumber, prNumber) {
  assertOriginRepo();
  const issue = getIssue(issueNumber);
  const pr = mergedPrForIssue(issue, prNumber);
  const comments = ghApi("GET", `${issueEndpoint(issueNumber)}/comments?per_page=100`);
  if (Number(issue.comments || 0) > comments.length) {
    throw new Error(`issue #${issue.number} has more than 100 comments; completion marker cannot be verified safely`);
  }
  const marker = completionCommentMarker(issue, pr);
  const alreadyCommented = comments.some((comment) => String(comment.body || "").includes(marker));
  if (!alreadyCommented) {
    assertOriginRepo();
    ghApi("POST", `${issueEndpoint(issueNumber)}/comments`, {
      body: `${marker}\nPR #${pr.number} 병합과 스펙·QA·전체 검증 게이트를 확인해 GYEOP task harness로 완료 처리했습니다.`,
    });
  }
  const alreadyClosed = issue.state === "closed";
  if (!alreadyClosed) {
    assertOriginRepo();
    ghApi("PATCH", issueEndpoint(issueNumber), { state: "closed" });
  }
  console.log(
    JSON.stringify(
      { issue: issue.number, pr: pr.number, closed: true, alreadyClosed, alreadyCommented },
      null,
      2,
    ),
  );
}

function optionalLocalRefSha(ref) {
  const result = runResult("git", ["rev-parse", "--verify", "--quiet", ref]);
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 1) return "";
  const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  throw new Error(`git rev-parse --verify --quiet ${ref} failed\n${detail}`);
}

function isAncestor(ancestor, descendant) {
  const result = runResult("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  throw new Error(`git merge-base --is-ancestor ${ancestor} ${descendant} failed\n${detail}`);
}

function canonicalPath(input) {
  const resolved = path.resolve(input);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function branchConfigSnapshot(branch) {
  const prefix = `branch.${branch}.`;
  const result = runResult("git", [
    "config",
    "--local",
    "--get-regexp",
    `^branch\\.${branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`,
  ]);
  if (result.status === 0) {
    return result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
      .sort();
  }
  if (result.status === 1) return [];
  const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  throw new Error(`git config branch lookup failed\n${detail}`);
}

function branchConfigExists(branch) {
  return branchConfigSnapshot(branch).length > 0;
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function quarantineBranchFor(branch) {
  return `${branch}-cleanup-quarantine`;
}

function deleteLocalBranchCas(branch, expectedSha, expectedConfig) {
  const branchRef = `refs/heads/${branch}`;
  const quarantine = quarantineBranchFor(branch);
  const quarantineRef = `refs/heads/${quarantine}`;
  const branchWorktree = () =>
    parseWorktrees(run("git", ["worktree", "list", "--porcelain"])).find(
      (entry) => entry.branch === branchRef || entry.branch === quarantineRef,
    );

  if (branchWorktree()) throw new Error(`branch ${branch} is still checked out`);
  const originalSha = optionalLocalRefSha(branchRef);
  const quarantinedSha = optionalLocalRefSha(quarantineRef);
  const renameRequired = Boolean(originalSha);
  let repairQuarantineConfig = false;
  if (originalSha && quarantinedSha) throw new Error(`original and quarantine branches both exist for ${branch}`);
  if (originalSha) {
    if (originalSha !== expectedSha) throw new Error(`local branch ${branch} changed before quarantine`);
    if (!sameSnapshot(branchConfigSnapshot(branch), expectedConfig)) {
      throw new Error(`branch config for ${branch} changed before quarantine`);
    }
    if (branchConfigExists(quarantine)) throw new Error(`quarantine config collision: ${quarantine}`);
  } else if (quarantinedSha) {
    if (quarantinedSha !== expectedSha) throw new Error(`quarantine branch ${quarantine} has an unexpected SHA`);
    const originalConfig = branchConfigSnapshot(branch);
    const quarantineConfig = branchConfigSnapshot(quarantine);
    if (sameSnapshot(quarantineConfig, expectedConfig) && originalConfig.length === 0) {
      // A previous run completed the branch rename.
    } else if (quarantineConfig.length === 0 && sameSnapshot(originalConfig, expectedConfig)) {
      repairQuarantineConfig = originalConfig.length > 0;
    } else {
      throw new Error(`branch config changed for existing quarantine ${quarantine}`);
    }
  } else {
    throw new Error(`local branch ${branch} disappeared before quarantine`);
  }

  try {
    if (renameRequired) run("git", ["branch", "-m", branch, quarantine]);
    if (repairQuarantineConfig) {
      run("git", ["config", "--local", "--rename-section", `branch.${branch}`, `branch.${quarantine}`]);
    }
    const linked = branchWorktree();
    if (linked) throw new Error(`quarantine branch became checked out at ${linked.worktree}`);
    if (optionalLocalRefSha(branchRef)) throw new Error(`original branch ${branch} reappeared during quarantine`);
    if (optionalLocalRefSha(quarantineRef) !== expectedSha) {
      throw new Error(`quarantine branch ${quarantine} changed before compare-and-delete`);
    }
    if (branchConfigExists(branch) || !sameSnapshot(branchConfigSnapshot(quarantine), expectedConfig)) {
      throw new Error(`branch config changed while quarantining ${branch}`);
    }

    const worktreePathsBeforeDelete = new Set(
      parseWorktrees(run("git", ["worktree", "list", "--porcelain"])).map((entry) => canonicalPath(entry.worktree)),
    );
    run("git", ["update-ref", "-d", quarantineRef, expectedSha]);
    if (optionalLocalRefSha(quarantineRef)) throw new Error(`quarantine ref ${quarantineRef} survived deletion`);
    const linkedAfterDelete = parseWorktrees(run("git", ["worktree", "list", "--porcelain"])).find(
      (entry) =>
        [branchRef, quarantineRef].includes(entry.branch) || !worktreePathsBeforeDelete.has(canonicalPath(entry.worktree)),
    );
    if (linkedAfterDelete) {
      run("git", ["update-ref", quarantineRef, expectedSha, ""]);
      throw new Error(`quarantine branch was checked out at ${linkedAfterDelete.worktree} during deletion`);
    }
    if (!sameSnapshot(branchConfigSnapshot(quarantine), expectedConfig)) {
      throw new Error(`quarantine config changed before cleanup for ${quarantine}`);
    }
    if (branchConfigExists(quarantine)) {
      run("git", ["config", "--local", "--remove-section", `branch.${quarantine}`]);
    }
    if (optionalLocalRefSha(quarantineRef) || branchWorktree()) {
      throw new Error(`quarantine branch ${quarantine} reappeared during config cleanup`);
    }
    if (branchConfigExists(quarantine)) throw new Error(`quarantine config for ${quarantine} survived deletion`);
    return quarantine;
  } catch (error) {
    let recoveryError = null;
    try {
      let recoveryOriginalSha = optionalLocalRefSha(branchRef);
      let recoveryQuarantineSha = optionalLocalRefSha(quarantineRef);
      const linked = branchWorktree();
      if (!recoveryOriginalSha && !recoveryQuarantineSha && linked?.branch === quarantineRef) {
        run("git", ["update-ref", quarantineRef, expectedSha, ""]);
        recoveryQuarantineSha = expectedSha;
      }
      if (!recoveryOriginalSha && recoveryQuarantineSha) {
        run("git", ["branch", "-m", quarantine, branch]);
      } else if (!recoveryOriginalSha && !recoveryQuarantineSha) {
        run("git", ["update-ref", branchRef, expectedSha, ""]);
        if (branchConfigExists(quarantine) && !branchConfigExists(branch)) {
          run("git", ["config", "--local", "--rename-section", `branch.${quarantine}`, `branch.${branch}`]);
        }
      }
    } catch (recoveryFailure) {
      recoveryError = recoveryFailure;
    }
    const preservation = {
      original: optionalLocalRefSha(branchRef) || null,
      quarantine: optionalLocalRefSha(quarantineRef) || null,
    };
    throw new Error(
      `local branch compare-and-delete failed: ${error.message}; preserved=${JSON.stringify(preservation)}${
        recoveryError ? `; recovery=${recoveryError.message}` : ""
      }`,
    );
  }
}

function cleanupRemainingState(target, branch) {
  const expectedBranchRef = `refs/heads/${branch}`;
  const quarantine = quarantineBranchFor(branch);
  const quarantineBranchRef = `refs/heads/${quarantine}`;
  const remoteTrackingRef = `refs/remotes/origin/${branch}`;
  let registeredWorktree = null;
  let linkedTaskWorktrees = null;
  let remoteBranch = null;
  try {
    const worktrees = parseWorktrees(run("git", ["worktree", "list", "--porcelain"]));
    registeredWorktree = worktrees.some(
      (entry) => canonicalPath(entry.worktree) === canonicalPath(target),
    );
    const linked = worktrees
      .filter((entry) => [expectedBranchRef, quarantineBranchRef].includes(entry.branch))
      .map((entry) => entry.worktree);
    linkedTaskWorktrees = linked.length ? linked : null;
  } catch {
    registeredWorktree = "unknown";
    linkedTaskWorktrees = "unknown";
  }
  try {
    remoteBranch = remoteBranchSha(branch) || null;
  } catch {
    remoteBranch = "unknown";
  }
  return {
    worktree: registeredWorktree,
    linkedTaskWorktrees,
    localBranch: optionalLocalRefSha(expectedBranchRef) || null,
    quarantineBranch: optionalLocalRefSha(quarantineBranchRef) || null,
    remoteBranch,
    remoteTracking: optionalLocalRefSha(remoteTrackingRef) || null,
    branchConfig: branchConfigExists(branch),
    quarantineConfig: branchConfigExists(quarantine),
  };
}

function cleanup(issueNumber, prNumber) {
  assertOriginRepo();
  const issue = getIssue(issueNumber);
  if (issue.state !== "closed") throw new Error(`issue #${issue.number} must be closed before cleanup`);
  const pr = mergedPrForIssue(issue, prNumber);
  const branch = branchForIssue(issue);
  const target = path.join(worktreeRoot, issueSlug(issue));
  assertCheckout(checkoutState(), { branch: mainBranch }, "cleanup main checkout");
  assertOriginRepo();
  run("git", ["fetch", "origin", mainBranch], { stdio: "inherit" });
  assertCheckout(checkoutState(), { branch: mainBranch }, "cleanup main checkout after fetch");

  const originMainRef = `refs/remotes/origin/${mainBranch}`;
  const originMainSha = run("git", ["rev-parse", originMainRef]).trim();
  const localMainRef = `refs/heads/${mainBranch}`;
  const localMainSha = run("git", ["rev-parse", localMainRef]).trim();
  if (!isAncestor(pr.merge_commit_sha, originMainRef)) {
    throw new Error(`origin/${mainBranch} does not contain merge commit ${pr.merge_commit_sha}`);
  }
  if (!isAncestor(localMainSha, originMainSha)) {
    throw new Error(`local ${mainBranch} cannot fast-forward to origin/${mainBranch}`);
  }

  const worktrees = parseWorktrees(run("git", ["worktree", "list", "--porcelain"]));
  const targetPath = canonicalPath(target);
  const targetEntry = worktrees.find((entry) => canonicalPath(entry.worktree) === targetPath);
  const expectedBranchRef = `refs/heads/${branch}`;
  const quarantine = quarantineBranchFor(branch);
  const quarantineBranchRef = `refs/heads/${quarantine}`;
  const remoteTrackingRef = `refs/remotes/origin/${branch}`;
  const branchElsewhere = worktrees.find(
    (entry) =>
      [expectedBranchRef, quarantineBranchRef].includes(entry.branch) && canonicalPath(entry.worktree) !== targetPath,
  );
  const originalBranchSha = optionalLocalRefSha(expectedBranchRef);
  const quarantinedBranchSha = optionalLocalRefSha(quarantineBranchRef);
  const localBranchSha = originalBranchSha || quarantinedBranchSha;
  const localBranchName = originalBranchSha ? branch : quarantinedBranchSha ? quarantine : "";
  const remoteSha = remoteBranchSha(branch);
  const remoteTrackingSha = optionalLocalRefSha(remoteTrackingRef);
  const originalBranchConfig = branchConfigSnapshot(branch);
  const quarantineBranchConfig = branchConfigSnapshot(quarantine);
  const localBranchConfig = originalBranchSha
    ? originalBranchConfig
    : quarantinedBranchSha
      ? quarantineBranchConfig.length
        ? quarantineBranchConfig
        : originalBranchConfig
      : [];
  const failures = [];
  if (branchElsewhere) failures.push(`branch ${branch} is checked out at unexpected worktree ${branchElsewhere.worktree}`);
  if (originalBranchSha && quarantinedBranchSha) failures.push(`original and quarantine branches both exist for ${branch}`);
  if (originalBranchSha && quarantineBranchConfig.length) failures.push(`quarantine config already exists for ${branch}`);
  if (quarantinedBranchSha && originalBranchConfig.length && quarantineBranchConfig.length) {
    failures.push(`original and quarantine configs both exist for ${branch}`);
  }
  if (localBranchSha && localBranchSha !== pr.head.sha) {
    failures.push(`local or quarantine branch ${branch} must be ${pr.head.sha}, got ${localBranchSha}`);
  }
  if (remoteSha && remoteSha !== pr.head.sha) {
    failures.push(`remote branch ${branch} must be ${pr.head.sha}, got ${remoteSha}`);
  }
  if (remoteTrackingSha && remoteTrackingSha !== pr.head.sha) {
    failures.push(`remote-tracking branch origin/${branch} must be ${pr.head.sha}, got ${remoteTrackingSha}`);
  }
  if (targetEntry) {
    failures.push(
      ...checkoutFailures(checkoutState(target), { branch: localBranchName || branch, sha: pr.head.sha }).map(
        (failure) => `target worktree: ${failure}`,
      ),
    );
    const unsafeIgnored = unsafeIgnoredPaths(target);
    if (unsafeIgnored.length) {
      failures.push(`target worktree has non-disposable ignored paths: ${unsafeIgnored.join(", ")}`);
    }
    if (!localBranchSha) failures.push(`target worktree branch ref ${expectedBranchRef} is missing`);
  }
  if (failures.length) throw new Error(`cleanup preflight failed: ${failures.join("; ")}`);

  try {
    if (localMainSha !== originMainSha) {
      run("git", ["merge", "--ff-only", originMainRef], { stdio: "inherit" });
      assertCheckout(checkoutState(), { branch: mainBranch, sha: originMainSha }, "cleanup fast-forward");
    }
    if (targetEntry) {
      assertCheckout(checkoutState(target), { branch, sha: pr.head.sha }, "cleanup target worktree recheck");
      const latestUnsafeIgnored = unsafeIgnoredPaths(target);
      if (latestUnsafeIgnored.length) {
        throw new Error(`target worktree gained non-disposable ignored paths: ${latestUnsafeIgnored.join(", ")}`);
      }
      run("git", ["worktree", "remove", target], { stdio: "inherit" });
    }
    if (localBranchSha) {
      const latestWorktree = parseWorktrees(run("git", ["worktree", "list", "--porcelain"])).find(
        (entry) => [expectedBranchRef, quarantineBranchRef].includes(entry.branch),
      );
      if (latestWorktree) {
        throw new Error(`branch ${branch} became checked out at ${latestWorktree.worktree} during cleanup`);
      }
      const latestLocalSha = optionalLocalRefSha(expectedBranchRef);
      const latestQuarantinedSha = optionalLocalRefSha(quarantineBranchRef);
      if ((latestLocalSha || latestQuarantinedSha) !== pr.head.sha || (latestLocalSha && latestQuarantinedSha)) {
        throw new Error(
          `local branch ${branch} changed during cleanup: original=${latestLocalSha || "missing"} quarantine=${latestQuarantinedSha || "missing"}`,
        );
      }
      deleteLocalBranchCas(branch, pr.head.sha, localBranchConfig);
    }
    if (remoteSha) {
      assertOriginRepo();
      run("git", [
        "push",
        `--force-with-lease=${expectedBranchRef}:${pr.head.sha}`,
        "origin",
        `:${expectedBranchRef}`,
      ]);
    }
    const latestRemoteTrackingSha = optionalLocalRefSha(remoteTrackingRef);
    if (latestRemoteTrackingSha) {
      if (latestRemoteTrackingSha !== pr.head.sha) {
        throw new Error(`remote-tracking branch origin/${branch} changed during cleanup`);
      }
      run("git", ["update-ref", "-d", remoteTrackingRef, pr.head.sha]);
    }
    if (!localBranchSha && originalBranchConfig.length) {
      if (!sameSnapshot(branchConfigSnapshot(branch), originalBranchConfig)) {
        throw new Error(`branch config for ${branch} changed during cleanup`);
      }
      run("git", ["config", "--local", "--remove-section", `branch.${branch}`]);
    }
    if (!localBranchSha && quarantineBranchConfig.length) {
      if (!sameSnapshot(branchConfigSnapshot(quarantine), quarantineBranchConfig)) {
        throw new Error(`quarantine config for ${branch} changed during cleanup`);
      }
      run("git", ["config", "--local", "--remove-section", `branch.${quarantine}`]);
    }
    if (branchConfigExists(branch)) throw new Error(`branch config for ${branch} survived cleanup`);
    if (branchConfigExists(quarantine)) throw new Error(`quarantine config for ${branch} survived cleanup`);
  } catch (error) {
    throw new Error(
      `cleanup partially failed: ${error.message}; remaining=${JSON.stringify(cleanupRemainingState(target, branch))}`,
    );
  }
  const remaining = cleanupRemainingState(target, branch);
  const remainingEntries = Object.entries(remaining).filter(([, value]) => Boolean(value));
  if (remainingEntries.length) {
    throw new Error(`cleanup did not remove every target resource: ${JSON.stringify(remaining)}`);
  }
  console.log(
    JSON.stringify(
      {
        issue: issue.number,
        pr: pr.number,
        main: originMainSha,
        removed: {
          worktree: Boolean(targetEntry),
          localBranch: Boolean(localBranchSha),
          remoteBranch: Boolean(remoteSha),
          remoteTracking: Boolean(remoteTrackingSha),
        },
      },
      null,
      2,
    ),
  );
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
  close <issue-number> <pr-number>
  cleanup <issue-number> <pr-number>`);
}

function main(argv = process.argv.slice(2)) {
  const [command, arg, secondArg] = argv;
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
    if (command === "close" && arg && secondArg) return closeIssue(arg, secondArg);
    if (command === "cleanup" && arg && secondArg) return cleanup(arg, secondArg);
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
  checkStateFailures,
  checkoutFailures,
  dependencyNumbers,
  defaultWorktreeRoot,
  issueSlug,
  listCheckState,
  parseWorktrees,
  prRelationFailures,
  qaPathForIssue,
  qaFailures,
  repoFromUrl,
  slugify,
  specFailures,
  specPathForIssue,
  statusLabels,
};
