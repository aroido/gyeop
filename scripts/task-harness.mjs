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
  ]
    .map((pattern) => url.match(pattern))
    .find(Boolean);
  if (!match) return "";
  const value = match[1].endsWith(".git") ? match[1].slice(0, -4) : match[1];
  return value.split("/").every(Boolean) ? value : "";
}

function originUrls({ push = false } = {}) {
  const args = [
    "remote",
    "get-url",
    ...(push ? ["--push"] : []),
    "--all",
    "origin",
  ];
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
  const matches =
    fetchUrls.length > 0 &&
    pushUrls.length > 0 &&
    remoteRepos.every((originRepo) => originRepo === repo);
  if (!repo || !matches) {
    const actual = remoteRepos.filter(Boolean).join(",") || "missing";
    throw new Error(
      `configured GitHub repository ${repo || "missing"} does not match git origin ${actual}`,
    );
  }
}

function defaultWorktreeRoot(commonDir, cwd = process.cwd()) {
  const repoRoot = commonDir ? path.dirname(path.resolve(cwd, commonDir)) : cwd;
  return path.resolve(repoRoot, "..", "gyeop-worktrees");
}

const repo = process.env.GYEOP_GITHUB_REPO || repoFromOrigin();
const mainBranch = process.env.GYEOP_MAIN_BRANCH || "main";
const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], {
  encoding: "utf8",
});
const worktreeRoot =
  process.env.GYEOP_WORKTREE_ROOT ||
  defaultWorktreeRoot(commonDir.status === 0 ? commonDir.stdout.trim() : "");
const projectOwner =
  process.env.GYEOP_GITHUB_OWNER || (repo ? repo.split("/")[0] : "");
const projectNumber = process.env.GYEOP_GITHUB_PROJECT_NUMBER || "";

const projectFieldNames = ["Status", "작업 상태", "우선순위", "작업 유형"];
const projectStatusValues = new Map([
  ["status:backlog", ["Todo", "선행 작업 대기"]],
  ["status:ready", ["Todo", "준비"]],
  ["status:spec", ["In Progress", "스펙 작성"]],
  ["status:implementing", ["In Progress", "구현 중"]],
  ["status:qa", ["In Progress", "품질 검증"]],
  ["status:blocked", ["In Progress", "차단"]],
]);
const projectPriorityValues = new Map([
  ["priority:p0", "P0"],
  ["priority:p1", "P1"],
  ["priority:p2", "P2"],
]);
const projectTypeValues = new Map([
  ["type:planning", "기획"],
  ["type:design", "디자인"],
  ["type:frontend", "프론트엔드"],
  ["type:backend", "백엔드"],
  ["type:data", "데이터"],
  ["type:safety", "안전"],
  ["type:qa", "QA"],
  ["type:ops", "운영"],
]);
const projectRequiredOptions = new Map([
  [
    "Status",
    [
      ...new Set([...projectStatusValues.values()].map(([value]) => value)),
      "Done",
    ],
  ],
  [
    "작업 상태",
    [...projectStatusValues.values()].map(([, value]) => value).concat("완료"),
  ],
  ["우선순위", [...projectPriorityValues.values()]],
  ["작업 유형", [...projectTypeValues.values()]],
]);

const projectAccessQuery = `
  query ProjectAccess($id: ID!) {
    node(id: $id) {
      __typename
      ... on ProjectV2 {
        id
        number
        viewerCanUpdate
        owner {
          ... on Organization { login }
          ... on User { login }
        }
      }
    }
  }
`;

const projectMembershipsQuery = `
  query ProjectMemberships($id: ID!, $cursor: String) {
    node(id: $id) {
      __typename
      ... on Issue {
        id
        url
        projectItems(first: 100, after: $cursor, includeArchived: true) {
          nodes {
            id
            isArchived
            project {
              id
              number
              owner {
                ... on Organization { login }
                ... on User { login }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const projectItemStateQuery = `
  query ProjectItemState($id: ID!) {
    node(id: $id) {
      __typename
      ... on ProjectV2Item {
        id
        isArchived
        project {
          id
          number
          owner {
            ... on Organization { login }
            ... on User { login }
          }
        }
        content {
          ... on Issue {
            id
            number
            url
            repository { nameWithOwner }
          }
        }
        fieldValues(first: 100) {
          nodes {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
              optionId
              field {
                ... on ProjectV2FieldCommon { id name }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const statusLabels = [
  "status:backlog",
  "status:ready",
  "status:spec",
  "status:implementing",
  "status:qa",
  "status:blocked",
];

const blockedFromLabels = [
  "blocked-from:backlog",
  "blocked-from:ready",
  "blocked-from:spec",
  "blocked-from:implementing",
  "blocked-from:qa",
];

const forwardTransitions = new Map([
  ["status:backlog", "status:ready"],
  ["status:ready", "status:spec"],
  ["status:spec", "status:implementing"],
  ["status:implementing", "status:qa"],
]);

const managedLabels = [
  ["status:backlog", "d4c5f9", "Planned and waiting for predecessor issues"],
  ["status:ready", "0e8a16", "Ready for Codex task harness intake"],
  ["status:spec", "1d76db", "Spec is being drafted or reviewed"],
  ["status:implementing", "fbca04", "Implementation is in progress"],
  ["status:qa", "5319e7", "QA verification is in progress"],
  ["status:blocked", "d73a4a", "Blocked by missing input or external state"],
  ["blocked-from:backlog", "fef2c0", "Blocked while waiting in backlog"],
  ["blocked-from:ready", "fef2c0", "Blocked after becoming ready"],
  ["blocked-from:spec", "fef2c0", "Blocked during specification"],
  ["blocked-from:implementing", "fef2c0", "Blocked during implementation"],
  ["blocked-from:qa", "fef2c0", "Blocked during QA"],
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
    throw new Error(
      `${command} ${args.join(" ")} failed${cause}${stderr}${stdout}`,
    );
  }

  return result.stdout || "";
}

function runJson(command, args, options, label) {
  try {
    return JSON.parse(String(run(command, args, options) || ""));
  } catch (error) {
    if (error.message.startsWith(`${command} `)) throw error;
    throw new Error(`${label} did not return valid JSON`);
  }
}

function ghGraphql(operationName, query, variables) {
  const result = runJson(
    "gh",
    ["api", "graphql", "--input", "-"],
    {
      input: JSON.stringify({ operationName, query, variables }),
    },
    `GitHub GraphQL ${operationName}`,
  );
  if (Array.isArray(result.errors) && result.errors.length) {
    const messages = result.errors
      .map((error) => error?.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `GitHub GraphQL ${operationName} returned errors${messages ? `: ${messages}` : ""}`,
    );
  }
  if (!result.data || typeof result.data !== "object") {
    throw new Error(`GitHub GraphQL ${operationName} returned no data`);
  }
  return result.data;
}

function ghApi(method, endpoint, payload) {
  if (!repo) {
    throw new Error(
      "GitHub repository is not configured. Add origin or set GYEOP_GITHUB_REPO=owner/repo.",
    );
  }
  const args = [
    "api",
    "-X",
    method,
    endpoint,
    "-H",
    "Accept: application/vnd.github+json",
  ];
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
  return (issue.labels || []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

function workflowState(issue) {
  if (issue?.state !== "open")
    throw new Error(`issue #${issue?.number || "unknown"} must be open`);
  const labels = issueLabels(issue);
  const statuses = labels.filter((label) => label.startsWith("status:"));
  const provenanceLabels = labels.filter((label) =>
    label.startsWith("blocked-from:"),
  );
  if (statuses.length !== 1) {
    throw new Error(
      `issue #${issue.number} must have exactly one status label, got ${statuses.length}`,
    );
  }
  const status = statuses[0];
  if (!statusLabels.includes(status))
    throw new Error(
      `issue #${issue.number} has unknown status label ${status}`,
    );
  if (provenanceLabels.some((label) => !blockedFromLabels.includes(label))) {
    throw new Error(`issue #${issue.number} has an unknown blocked-from label`);
  }
  if (status === "status:blocked" && provenanceLabels.length !== 1) {
    throw new Error(
      `issue #${issue.number} must have exactly one blocked-from label while blocked`,
    );
  }
  if (status !== "status:blocked" && provenanceLabels.length !== 0) {
    throw new Error(
      `issue #${issue.number} must not have a blocked-from label while ${status}`,
    );
  }
  const provenance = provenanceLabels[0] || null;
  return {
    status,
    provenance,
    sourceStatus: provenance
      ? `status:${provenance.slice("blocked-from:".length)}`
      : status,
  };
}

function assertIssueStatus(issue, expected) {
  const current = workflowState(issue);
  if (current.status !== expected)
    throw new Error(
      `issue #${issue.number} must be ${expected}, got ${current.status}`,
    );
  return current;
}

function slugify(input) {
  return (
    String(input)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 48)
      .replace(/-+$/g, "") || "task"
  );
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
  const section =
    String(body || "").match(
      /### 선행 이슈\s*\n([\s\S]*?)(?=\n### |\n## |$)/,
    )?.[1] || "";
  return [
    ...new Set(
      [...section.matchAll(/#(\d+)\b/g)].map((match) => Number(match[1])),
    ),
  ];
}

function assertPredecessorsClosed(issue) {
  for (const number of dependencyNumbers(issue.body)) {
    const predecessor = getIssue(number);
    assert(
      predecessor.state === "closed",
      `predecessor issue #${number} must be closed before status:ready`,
    );
  }
}

function transitionPlan(current, nextStatus, expectedSources) {
  assert(
    statusLabels.includes(nextStatus),
    `unknown status label: ${nextStatus}`,
  );
  if (
    expectedSources &&
    !expectedSources.includes(current.status) &&
    current.status !== nextStatus
  ) {
    throw new Error(
      `expected workflow source ${expectedSources.join(" or ")}, got ${current.status}`,
    );
  }
  if (current.status === nextStatus)
    return {
      changed: false,
      status: nextStatus,
      provenance: current.provenance,
    };
  if (current.status === "status:blocked") {
    if (nextStatus !== current.sourceStatus) {
      throw new Error(
        `blocked issue may only return to ${current.sourceStatus}, got ${nextStatus}`,
      );
    }
    return { changed: true, status: nextStatus, provenance: null };
  }
  if (nextStatus === "status:blocked") {
    if (
      current.status === "status:qa" ||
      forwardTransitions.has(current.status)
    ) {
      return {
        changed: true,
        status: nextStatus,
        provenance: `blocked-from:${current.status.slice("status:".length)}`,
      };
    }
  } else if (forwardTransitions.get(current.status) === nextStatus) {
    return { changed: true, status: nextStatus, provenance: null };
  }
  throw new Error(
    `workflow transition ${current.status} -> ${nextStatus} is not allowed`,
  );
}

function assertWorkflowResult(issue, expected, label) {
  const actual = workflowState(issue);
  if (
    actual.status !== expected.status ||
    actual.provenance !== expected.provenance
  ) {
    throw new Error(
      `${label} expected ${expected.status}/${expected.provenance || "none"}, got ${actual.status}/${actual.provenance || "none"}`,
    );
  }
  return actual;
}

function workflowIssueFromLabelResponse(issue, response) {
  const labels = Array.isArray(response) ? response : response?.labels;
  if (!Array.isArray(labels))
    throw new Error("label PUT response did not contain labels");
  return { ...issue, labels };
}

function sameWorkflowState(left, right) {
  return left.status === right.status && left.provenance === right.provenance;
}

function pinnedTransitionState(issue, source, target) {
  const current = workflowState(issue);
  if (sameWorkflowState(current, source)) return { current, atTarget: false };
  if (sameWorkflowState(current, target)) return { current, atTarget: true };
  throw new Error(
    `workflow state changed from pinned ${source.status}/${source.provenance || "none"} before ${target.status}`,
  );
}

function assertTransitionGates(issue, source, target, changed) {
  if (!changed && source.status === "status:blocked") return;
  assertStatusGate(issue, source.sourceStatus);
  assertStatusGate(issue, target.status);
}

function transitionIssue(number, nextStatus, { expectedSources } = {}) {
  assertOriginRepo();
  const initialIssue = getIssue(number);
  const initialState = workflowState(initialIssue);
  const initialPlan = transitionPlan(initialState, nextStatus, expectedSources);
  const target = {
    status: initialPlan.status,
    provenance: initialPlan.provenance,
  };
  const finish = (result) => {
    const project = syncProjectIfConfigured(number, {
      workflowChanged: result.changed,
      expectedStatus: target.status,
    });
    try {
      assertOriginRepo();
      const postIssue = getIssue(number);
      assertWorkflowResult(
        postIssue,
        target,
        "post-Project label confirmation",
      );
      assertTransitionGates(
        postIssue,
        initialState,
        target,
        initialPlan.changed,
      );
      return {
        ...result,
        labels: issueLabels(postIssue),
        project,
      };
    } catch (error) {
      attachPostProjectDiagnostics(error, {
        issueNumber: number,
        expectedStatus: target.status,
        workflowChanged: result.changed,
        project,
        recoveryCommands: [
          `scripts/task-harness status ${number} ${target.status}`,
        ],
      });
      throw error;
    }
  };
  assertTransitionGates(
    initialIssue,
    initialState,
    target,
    initialPlan.changed,
  );

  assertOriginRepo();
  const gateIssue = getIssue(number);
  pinnedTransitionState(gateIssue, initialState, target);
  assertTransitionGates(gateIssue, initialState, target, initialPlan.changed);

  const finalIssue = getIssue(number);
  pinnedTransitionState(finalIssue, initialState, target);
  assertTransitionGates(finalIssue, initialState, target, initialPlan.changed);

  const writeIssue = getIssue(number);
  const writeState = pinnedTransitionState(writeIssue, initialState, target);
  if (writeState.atTarget || !initialPlan.changed) {
    return finish({ ...initialPlan, changed: false });
  }

  const labels = issueLabels(writeIssue).filter(
    (label) =>
      !statusLabels.includes(label) && !blockedFromLabels.includes(label),
  );
  labels.push(target.status);
  if (target.provenance) labels.push(target.provenance);
  const response = ghApi("PUT", `${issueEndpoint(number)}/labels`, { labels });
  assertWorkflowResult(
    workflowIssueFromLabelResponse(writeIssue, response),
    target,
    "label PUT response",
  );
  const confirmedIssue = getIssue(number);
  assertWorkflowResult(confirmedIssue, target, "label GET confirmation");
  return finish(initialPlan);
}

function createOrUpdateLabel(name, color, description) {
  try {
    ghApi("POST", `repos/${repo}/labels`, { name, color, description });
  } catch (error) {
    if (String(error.message).includes("already_exists")) {
      ghApi("PATCH", `repos/${repo}/labels/${encodeURIComponent(name)}`, {
        color,
        description,
      });
    } else {
      throw error;
    }
  }
}

function labelSync() {
  assertOriginRepo();
  for (const [name, color, description] of managedLabels) {
    createOrUpdateLabel(name, color, description);
  }
  console.log(
    JSON.stringify({ synced: managedLabels.map(([name]) => name) }, null, 2),
  );
}

function status(issueNumber, nextStatus) {
  const result = transitionIssue(issueNumber, nextStatus);
  console.log(
    JSON.stringify({ issue: Number(issueNumber), ...result }, null, 2),
  );
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

  issues.sort(
    (a, b) => priorityRank(a) - priorityRank(b) || a.number - b.number,
  );
  console.log(
    JSON.stringify(
      issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        labels: issueLabels(issue).filter(
          (label) => label.startsWith("priority:") || label.startsWith("type:"),
        ),
      })),
      null,
      2,
    ),
  );
}

function reconcile() {
  const result = {
    status: "ok",
    promoted: [],
    waiting: [],
    skipped: [],
    errors: [],
  };
  const candidates = [];
  try {
    assertOriginRepo();
    for (let page = 1; ; page += 1) {
      if (page > 1000)
        throw new Error("backlog pagination exceeded 1000 pages");
      const batch = ghApi(
        "GET",
        `repos/${repo}/issues?state=open&per_page=100&page=${page}&labels=${encodeURIComponent("status:backlog")}`,
      );
      if (!Array.isArray(batch))
        throw new Error(`backlog page ${page} did not return an array`);
      candidates.push(...batch.filter((item) => !item.pull_request));
      if (batch.length < 100) break;
    }
  } catch (error) {
    result.status = "error";
    result.errors.push({ issue: null, reason: error.message });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return result;
  }

  const unique = [
    ...new Map(candidates.map((item) => [Number(item.number), item])).values(),
  ].sort((left, right) => Number(left.number) - Number(right.number));
  for (const candidate of unique) {
    const issueNumber = Number(candidate.number);
    try {
      const issue = getIssue(issueNumber);
      const current = workflowState(issue);
      if (!["status:backlog", "status:ready"].includes(current.status)) {
        throw new Error(
          `expected status:backlog or status:ready, got ${current.status}`,
        );
      }
      const predecessors = dependencyNumbers(issue.body);
      const predecessorSection = String(issue.body || "").match(
        /### 선행 이슈\s*\n([\s\S]*?)(?=\n### |\n## |$)/,
      )?.[1];
      if (
        predecessorSection !== undefined &&
        predecessors.length === 0 &&
        predecessorSection.trim() &&
        !/^\s*-?\s*없음\s*$/m.test(predecessorSection)
      ) {
        throw new Error("malformed predecessor section");
      }
      if (predecessors.length === 0) {
        result.skipped.push({ issue: issueNumber, reason: "no predecessors" });
        continue;
      }
      const open = predecessors.filter(
        (number) => getIssue(number).state !== "closed",
      );
      if (open.length) {
        result.waiting.push({ issue: issueNumber, predecessors: open });
        continue;
      }
      const transition = transitionIssue(issueNumber, "status:ready", {
        expectedSources: ["status:backlog", "status:ready"],
      });
      result.promoted.push({ issue: issueNumber, changed: transition.changed });
    } catch (error) {
      result.errors.push({
        issue: issueNumber,
        reason: error.message,
        ...(error.projectDiagnostics || {}),
      });
    }
  }
  if (result.errors.length) {
    result.status = "error";
    process.exitCode = 1;
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function doctor() {
  const checks = [];
  const add = (name, fn) => {
    try {
      fn();
      checks.push({ name, status: "ok" });
    } catch (error) {
      checks.push({
        name,
        status: "fail",
        message: error.message.split("\n")[0],
      });
    }
  };

  add("gh auth", () => run("gh", ["auth", "status"]));
  add("GitHub repository", () => {
    if (!repo)
      throw new Error("add origin or set GYEOP_GITHUB_REPO=owner/repo");
    ghApi("GET", `repos/${repo}`);
  });
  if (projectNumber) add("GitHub Project", () => loadProjectSchema());
  add("git worktree", () =>
    run("git", ["status", "--porcelain=v1", "--branch"]),
  );
  add("verify script", () => {
    if (!fs.existsSync("scripts/ai-verify"))
      throw new Error("missing scripts/ai-verify");
  });
  add("task templates", () => {
    for (const file of [
      "docs/templates/implementation-spec.md",
      "docs/templates/qa-verdict.md",
    ]) {
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
        project: projectNumber
          ? { owner: projectOwner, number: projectNumber }
          : null,
        projectStatus: projectNumber
          ? "configured"
          : "skipped; status labels remain authoritative",
        checks,
      },
      null,
      2,
    ),
  );
}

function projectMetadataValue(labels, prefix, values) {
  const matches = labels.filter((label) => label.startsWith(prefix));
  const unknown = matches.filter((label) => !values.has(label));
  if (unknown.length)
    throw new Error(`unknown ${prefix} label: ${unknown.join(", ")}`);
  if (matches.length > 1)
    throw new Error(
      `expected at most one ${prefix} label, got ${matches.length}`,
    );
  return matches.length ? values.get(matches[0]) : null;
}

function projectSourceSnapshot(
  issue,
  { completed = false, membershipOnly = false } = {},
) {
  const labels = issueLabels(issue).sort();
  if (membershipOnly) {
    if (issue.state !== "closed")
      throw new Error(`issue #${issue.number} must be closed`);
    return {
      issue: issue.number,
      nodeId: issue.node_id,
      url: issue.html_url,
      state: issue.state,
      labels,
      status: "closed",
      desired: null,
    };
  }

  let status;
  if (completed) {
    if (issue.state !== "closed")
      throw new Error(
        `issue #${issue.number} must be closed before Project completion`,
      );
    status = "closed";
  } else {
    status = workflowState(issue).status;
  }
  const [builtInStatus, workflowStatus] = completed
    ? ["Done", "완료"]
    : projectStatusValues.get(status) || [];
  if (!builtInStatus) throw new Error(`no Project mapping for ${status}`);
  return {
    issue: issue.number,
    nodeId: issue.node_id,
    url: issue.html_url,
    state: issue.state,
    labels,
    status,
    desired: {
      Status: builtInStatus,
      "작업 상태": workflowStatus,
      우선순위: projectMetadataValue(
        labels,
        "priority:",
        projectPriorityValues,
      ),
      "작업 유형": projectMetadataValue(labels, "type:", projectTypeValues),
    },
  };
}

function assertProjectSource(expected, options) {
  const current = projectSourceSnapshot(getIssue(expected.issue), options);
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error(`issue #${expected.issue} changed during Project sync`);
  return current;
}

function requireProjectConfiguration() {
  if (!projectNumber || !projectOwner)
    throw new Error(
      "Set GYEOP_GITHUB_PROJECT_NUMBER and GYEOP_GITHUB_OWNER before Project sync.",
    );
  if (!/^\d+$/.test(projectNumber) || Number(projectNumber) < 1)
    throw new Error("GYEOP_GITHUB_PROJECT_NUMBER must be a positive integer");
  const owner = repo?.split("/")[0];
  if (!owner || projectOwner !== owner)
    throw new Error(
      `Project owner ${projectOwner || "missing"} must match repository owner ${owner || "missing"}`,
    );
  assertOriginRepo();
}

function loadProjectSchema() {
  requireProjectConfiguration();
  const view = runJson(
    "gh",
    [
      "project",
      "view",
      projectNumber,
      "--owner",
      projectOwner,
      "--format",
      "json",
    ],
    {},
    "gh project view",
  );
  if (
    !String(view.id || "").startsWith("PVT_") ||
    Number(view.number) !== Number(projectNumber) ||
    view.owner?.login !== projectOwner
  ) {
    throw new Error("configured GitHub Project did not match project view");
  }
  const access = ghGraphql("ProjectAccess", projectAccessQuery, {
    id: view.id,
  }).node;
  if (
    access?.__typename !== "ProjectV2" ||
    access.id !== view.id ||
    Number(access.number) !== Number(projectNumber) ||
    access.owner?.login !== projectOwner ||
    access.viewerCanUpdate !== true
  ) {
    throw new Error(
      "configured GitHub Project is not updateable by the current viewer",
    );
  }
  const response = runJson(
    "gh",
    [
      "project",
      "field-list",
      projectNumber,
      "--owner",
      projectOwner,
      "--format",
      "json",
      "--limit",
      "100",
    ],
    {},
    "gh project field-list",
  );
  if (
    !Array.isArray(response.fields) ||
    response.fields.length !== response.totalCount
  )
    throw new Error("GitHub Project field list was truncated or malformed");

  const fields = {};
  for (const name of projectFieldNames) {
    const matches = response.fields.filter((field) => field.name === name);
    if (
      matches.length !== 1 ||
      matches[0].type !== "ProjectV2SingleSelectField"
    )
      throw new Error(
        `Project field ${name} must exist exactly once as single select`,
      );
    const field = matches[0];
    const options = new Map();
    for (const required of projectRequiredOptions.get(name)) {
      const matches = (field.options || []).filter(
        (option) => option.name === required,
      );
      if (matches.length !== 1 || !matches[0].id)
        throw new Error(
          `Project field ${name} option ${required} must exist exactly once`,
        );
      options.set(required, matches[0].id);
    }
    if (!field.id) throw new Error(`Project field ${name} returned no ID`);
    fields[name] = { id: field.id, options };
  }
  return {
    id: view.id,
    owner: projectOwner,
    number: Number(projectNumber),
    fields,
  };
}

function projectMemberships(source, schema) {
  if (!source.nodeId || !source.url)
    throw new Error(`issue #${source.issue} is missing GraphQL identity`);
  const items = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 1; ; page += 1) {
    if (page > 1000)
      throw new Error("Project membership pagination exceeded 1000 pages");
    const node = ghGraphql("ProjectMemberships", projectMembershipsQuery, {
      id: source.nodeId,
      cursor,
    }).node;
    if (
      node?.__typename !== "Issue" ||
      node.id !== source.nodeId ||
      node.url !== source.url
    )
      throw new Error("Project membership query returned a different issue");
    const connection = node.projectItems;
    if (!Array.isArray(connection?.nodes))
      throw new Error("Project membership query returned no items");
    for (const item of connection.nodes) {
      if (seen.has(item.id))
        throw new Error(`duplicate Project item ${item.id}`);
      seen.add(item.id);
      if (item.project?.id === schema.id) items.push(item);
    }
    if (!connection.pageInfo?.hasNextPage) break;
    if (!connection.pageInfo.endCursor)
      throw new Error("Project membership pagination returned no cursor");
    cursor = connection.pageInfo.endCursor;
  }
  if (items.length > 1)
    throw new Error(`issue #${source.issue} has duplicate Project membership`);
  if (items[0]?.isArchived)
    throw new Error(`issue #${source.issue} Project item is archived`);
  return items;
}

function readProjectItem(source, schema, itemId) {
  const node = ghGraphql("ProjectItemState", projectItemStateQuery, {
    id: itemId,
  }).node;
  if (
    node?.__typename !== "ProjectV2Item" ||
    node.id !== itemId ||
    node.isArchived ||
    node.project?.id !== schema.id ||
    Number(node.project?.number) !== schema.number ||
    node.project?.owner?.login !== schema.owner ||
    node.content?.id !== source.nodeId ||
    Number(node.content?.number) !== source.issue ||
    node.content?.url !== source.url ||
    node.content?.repository?.nameWithOwner !== repo
  ) {
    throw new Error(
      "Project item did not match the configured issue and Project",
    );
  }
  if (node.fieldValues?.pageInfo?.hasNextPage)
    throw new Error("Project item field values were truncated");
  const values = {};
  for (const name of projectFieldNames) {
    const matches = (node.fieldValues?.nodes || []).filter(
      (value) => value?.field?.id === schema.fields[name].id,
    );
    if (matches.length > 1)
      throw new Error(`Project item has duplicate value for ${name}`);
    values[name] = matches[0] || null;
  }
  return values;
}

function projectValueMatches(value, desired, field) {
  if (desired === null) return value === null;
  return (
    value?.name === desired && value.optionId === field.options.get(desired)
  );
}

function attachProjectDiagnostics(error, context) {
  let authoritativeStatus = null;
  let finalValues = null;
  try {
    const issue = getIssue(context.source?.issue || context.issueNumber);
    authoritativeStatus =
      issue.state === "closed" ? "closed" : workflowState(issue).status;
  } catch {}
  try {
    if (context.itemId && context.schema && context.source)
      finalValues = readProjectItem(
        context.source,
        context.schema,
        context.itemId,
      );
  } catch {}
  const recoveryCommands = context.completed
    ? [
        ...(context.missingMembership
          ? [`scripts/task-harness project-add ${context.issueNumber}`]
          : []),
        `scripts/task-harness close ${context.issueNumber} ${context.prNumber}`,
      ]
    : context.missingMembership ||
        (context.allowAdd && !context.membershipConfirmed)
      ? [`scripts/task-harness project-add ${context.issueNumber}`]
      : [`scripts/task-harness project-sync ${context.issueNumber}`];
  error.projectDiagnostics = {
    workflowChanged: Boolean(context.workflowChanged),
    authoritativeStatus,
    lastConfirmedStatus:
      context.source?.status || context.expectedStatus || null,
    expectedStatus: context.source?.status || context.expectedStatus || null,
    projectSynced: false,
    confirmedChangedFields:
      finalValues && context.initialValues && context.source?.desired
        ? projectFieldNames.filter(
            (name) =>
              !projectValueMatches(
                context.initialValues[name],
                context.source.desired[name],
                context.schema.fields[name],
              ) &&
              projectValueMatches(
                finalValues[name],
                context.source.desired[name],
                context.schema.fields[name],
              ),
          )
        : null,
    recoveryCommands,
  };
}

function attachPostProjectDiagnostics(
  error,
  { issueNumber, expectedStatus, workflowChanged, project, recoveryCommands },
) {
  if (error.projectDiagnostics) return;
  let authoritativeStatus = null;
  try {
    const issue = getIssue(issueNumber);
    authoritativeStatus =
      issue.state === "closed" ? "closed" : workflowState(issue).status;
  } catch {}
  error.projectDiagnostics = {
    workflowChanged: Boolean(workflowChanged),
    authoritativeStatus,
    lastConfirmedStatus: expectedStatus,
    expectedStatus,
    projectSynced: Boolean(project?.projectSynced),
    confirmedChangedFields: project?.changedFields || [],
    recoveryCommands,
  };
}

function syncProjectIssue(
  issueNumber,
  {
    allowAdd = false,
    completed = false,
    prNumber = null,
    workflowChanged = false,
    expectedStatus = null,
  } = {},
) {
  const context = {
    issueNumber: Number(issueNumber),
    completed,
    prNumber,
    workflowChanged,
    allowAdd,
    expectedStatus,
    missingMembership: false,
  };
  try {
    const issue = getIssue(issueNumber);
    const membershipOnly = allowAdd && issue.state === "closed" && !completed;
    const sourceOptions = { completed, membershipOnly };
    const source = projectSourceSnapshot(issue, sourceOptions);
    context.source = source;
    const schema = loadProjectSchema();
    context.schema = schema;
    assertProjectSource(source, sourceOptions);
    let memberships = projectMemberships(source, schema);
    context.membershipConfirmed = memberships.length === 1;
    if (!memberships.length) {
      context.missingMembership = true;
      if (!allowAdd)
        throw new Error(
          `issue #${source.issue} is not in the configured Project`,
        );
      assertOriginRepo();
      assertProjectSource(source, sourceOptions);
      let addError = null;
      let addValidationError = null;
      let addedItemId = null;
      try {
        const added = runJson(
          "gh",
          [
            "project",
            "item-add",
            projectNumber,
            "--owner",
            projectOwner,
            "--url",
            source.url,
            "--format",
            "json",
          ],
          {},
          "gh project item-add",
        );
        if (added.type !== "Issue" || added.url !== source.url || !added.id)
          addValidationError = new Error(
            "gh project item-add returned a different item",
          );
        else addedItemId = added.id;
      } catch (error) {
        addError = error;
      }
      assertProjectSource(source, sourceOptions);
      memberships = projectMemberships(source, schema);
      if (memberships.length !== 1)
        throw addError || new Error("Project item add was not confirmed");
      if (addValidationError) throw addValidationError;
      if (addedItemId && memberships[0].id !== addedItemId)
        throw new Error(
          "Project item-add response did not match membership readback",
        );
      context.missingMembership = false;
      context.membershipConfirmed = true;
    }
    const itemId = memberships[0].id;
    context.itemId = itemId;
    if (membershipOnly) {
      readProjectItem(source, schema, itemId);
      assertOriginRepo();
      assertProjectSource(source, sourceOptions);
      return {
        configured: true,
        projectSynced: false,
        status: "membership-only",
        project: { owner: schema.owner, number: schema.number, id: schema.id },
        item: itemId,
        changedFields: [],
      };
    }

    const initialValues = readProjectItem(source, schema, itemId);
    context.initialValues = initialValues;
    const changedFields = projectFieldNames.filter(
      (name) =>
        !projectValueMatches(
          initialValues[name],
          source.desired[name],
          schema.fields[name],
        ),
    );
    for (const name of changedFields) {
      assertOriginRepo();
      assertProjectSource(source, sourceOptions);
      const args = [
        "project",
        "item-edit",
        "--id",
        itemId,
        "--project-id",
        schema.id,
        "--field-id",
        schema.fields[name].id,
      ];
      const desired = source.desired[name];
      if (desired === null) args.push("--clear");
      else
        args.push(
          "--single-select-option-id",
          schema.fields[name].options.get(desired),
        );
      args.push("--format", "json");
      const edited = runJson("gh", args, {}, `gh project item-edit ${name}`);
      if (edited.id !== itemId)
        throw new Error(`Project edit for ${name} returned a different item`);
    }
    const finalValues = readProjectItem(source, schema, itemId);
    for (const name of projectFieldNames) {
      if (
        !projectValueMatches(
          finalValues[name],
          source.desired[name],
          schema.fields[name],
        )
      )
        throw new Error(
          `Project field ${name} did not reach ${source.desired[name] ?? "empty"}`,
        );
    }
    assertProjectSource(source, sourceOptions);
    return {
      configured: true,
      projectSynced: true,
      status: "synced",
      project: { owner: schema.owner, number: schema.number, id: schema.id },
      item: itemId,
      desired: source.desired,
      changedFields,
    };
  } catch (error) {
    attachProjectDiagnostics(error, context);
    throw error;
  }
}

function syncProjectIfConfigured(issueNumber, options = {}) {
  if (!projectNumber)
    return { configured: false, projectSynced: false, status: "skipped" };
  return syncProjectIssue(issueNumber, options);
}

function projectAdd(issueNumber) {
  const result = syncProjectIssue(issueNumber, { allowAdd: true });
  console.log(
    JSON.stringify({ issue: Number(issueNumber), ...result }, null, 2),
  );
  return result;
}

function projectSync(issueNumber) {
  const result = syncProjectIssue(issueNumber);
  console.log(
    JSON.stringify({ issue: Number(issueNumber), ...result }, null, 2),
  );
  return result;
}

function start(issueNumber) {
  assertOriginRepo();
  const issue = getIssue(issueNumber);
  const state = workflowState(issue);
  if (!["status:ready", "status:spec"].includes(state.status)) {
    throw new Error(
      `issue #${issue.number} must be status:ready or status:spec, got ${state.status}`,
    );
  }
  const branch = branchForIssue(issue);
  const target = expectedTaskPath(issue);
  if (state.status === "status:spec") {
    const checkout = assertStatusGate(issue, "status:spec");
    let project;
    try {
      project = syncProjectIfConfigured(issue.number, {
        expectedStatus: "status:spec",
      });
      const confirmedIssue = getIssue(issue.number);
      assertIssueStatus(confirmedIssue, "status:spec");
      assertStatusGate(confirmedIssue, "status:spec");
    } catch (error) {
      attachPostProjectDiagnostics(error, {
        issueNumber: issue.number,
        expectedStatus: "status:spec",
        workflowChanged: false,
        project,
        recoveryCommands: [`scripts/task-harness start ${issue.number}`],
      });
      throw error;
    }
    console.log(
      JSON.stringify(
        {
          issue: issue.number,
          branch,
          worktree: checkout.target,
          status: state.status,
          reused: true,
          project,
        },
        null,
        2,
      ),
    );
    return;
  }
  assertStatusGate(issue, "status:ready");

  const branchRef = `refs/heads/${branch}`;
  const worktrees = parseWorktrees(
    run("git", ["worktree", "list", "--porcelain"]),
  );
  const targetEntry = worktrees.find(
    (entry) => canonicalPath(entry.worktree) === canonicalPath(target),
  );
  const branchEntry = worktrees.find((entry) => entry.branch === branchRef);
  if (targetEntry || branchEntry) {
    if (!targetEntry || targetEntry !== branchEntry)
      throw new Error(`task branch or worktree is already in use; run resume`);
    const checkout = assertTaskCheckout(issue);
    const result = transitionIssue(issueNumber, "status:spec", {
      expectedSources: ["status:ready", "status:spec"],
    });
    console.log(
      JSON.stringify(
        {
          issue: issue.number,
          branch,
          worktree: checkout.target,
          status: result.status,
          reused: true,
          project: result.project,
        },
        null,
        2,
      ),
    );
    return;
  }
  try {
    fs.lstatSync(target);
    throw new Error(`task worktree target already exists: ${target}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (optionalLocalRefSha(branchRef))
    throw new Error(`task branch ${branch} already exists; run resume`);

  fs.mkdirSync(worktreeRoot, { recursive: true });
  assertIssueStatus(getIssue(issueNumber), "status:ready");
  assertPredecessorsClosed(getIssue(issueNumber));
  run("git", ["fetch", "origin", mainBranch], { stdio: "inherit" });
  assertIssueStatus(getIssue(issueNumber), "status:ready");
  assertPredecessorsClosed(getIssue(issueNumber));
  if (optionalLocalRefSha(branchRef))
    throw new Error(`task branch ${branch} appeared during start; run resume`);
  const latestWorktrees = parseWorktrees(
    run("git", ["worktree", "list", "--porcelain"]),
  );
  if (
    latestWorktrees.some(
      (entry) =>
        canonicalPath(entry.worktree) === canonicalPath(target) ||
        entry.branch === branchRef,
    )
  ) {
    throw new Error(
      `task branch or worktree appeared during start; run resume`,
    );
  }
  try {
    fs.lstatSync(target);
    throw new Error(`task worktree target appeared during start: ${target}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  run(
    "git",
    ["worktree", "add", "-b", branch, target, `origin/${mainBranch}`],
    { stdio: "inherit" },
  );
  const result = transitionIssue(issueNumber, "status:spec", {
    expectedSources: ["status:ready", "status:spec"],
  });

  console.log(
    JSON.stringify(
      {
        issue: issue.number,
        branch,
        worktree: target,
        status: result.status,
        reused: false,
        project: result.project,
      },
      null,
      2,
    ),
  );
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
    failures.push(
      "spec must contain one exact `Status: Reviewed` field before implementation",
    );
  }
  const reviewer = exactField(text, "Reviewer Agent");
  if (!reviewer || /^(TODO|TBD|Not run)$/i.test(reviewer))
    failures.push("missing spec reviewer agent");
  if (exactField(text, "Review Status") !== "PASS") {
    failures.push(
      "spec review must contain one exact `Review Status: PASS` field",
    );
  }
  if (exactField(text, "P0/P1 Findings") !== "0") {
    failures.push(
      "spec review must contain one exact `P0/P1 Findings: 0` field",
    );
  }
  if (/\[(P0|P1)\]/.test(text))
    failures.push("P0/P1 spec findings block implementation");
  for (const required of [
    "docs/product/core-feature-priority.md",
    "AGENTS.md",
  ]) {
    if (!text.includes(required))
      failures.push(`missing SSOT reference: ${required}`);
  }
  if (/\[ \].*(작성한다|교체|Replace with)/.test(text)) {
    failures.push("template placeholders remain");
  }
  return failures;
}

function printCheckResult(kind, file, failures) {
  if (failures.length) {
    console.error(
      JSON.stringify({ status: "fail", kind, file, failures }, null, 2),
    );
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
  if (exactField(text, "Status") !== "PASS")
    failures.push("QA must contain one exact `Status: PASS` field");
  const reviewer = exactField(text, "Reviewer Agent");
  if (!reviewer || /^(TODO|TBD|Not run)$/i.test(reviewer))
    failures.push("missing independent QA reviewer agent");
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
    failures.push(
      "QA must contain one exact full verification command block with `Result: PASS`",
    );
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
    failures.push(
      `expected branch ${expected.branch}, got ${actual.branch || "detached HEAD"}`,
    );
  }
  if (!actual.clean) failures.push("working tree must be clean");
  if (expected.sha && actual.sha !== expected.sha) {
    failures.push(
      `expected HEAD ${expected.sha}, got ${actual.sha || "unknown"}`,
    );
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
    [
      "status",
      "--porcelain=v1",
      "-z",
      "--ignored=matching",
      "--untracked-files=normal",
    ],
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
  return ignoredWorktreePaths(cwd).filter(
    (file) => !isDisposableIgnoredPath(file),
  );
}

function assertCheckout(actual, expected, label = "checkout") {
  const failures = checkoutFailures(actual, expected);
  if (failures.length)
    throw new Error(`${label} gate failed: ${failures.join("; ")}`);
}

function expectedTaskPath(issue) {
  const target = path.resolve(worktreeRoot, issueSlug(issue));
  const canonical = canonicalPath(target);
  if (canonical !== target)
    throw new Error(`task worktree path must not be an alias: ${target}`);
  return target;
}

function assertTaskCheckout(issue) {
  const target = expectedTaskPath(issue);
  const branch = branchForIssue(issue);
  const branchRef = `refs/heads/${branch}`;
  const entries = parseWorktrees(
    run("git", ["worktree", "list", "--porcelain"]),
  );
  const targetEntries = entries.filter(
    (entry) => canonicalPath(entry.worktree) === target,
  );
  const branchEntries = entries.filter((entry) => entry.branch === branchRef);
  if (
    targetEntries.length !== 1 ||
    branchEntries.length !== 1 ||
    targetEntries[0] !== branchEntries[0]
  ) {
    throw new Error(`expected exactly one ${branch} worktree at ${target}`);
  }
  const topLevel = canonicalPath(
    run("git", ["rev-parse", "--show-toplevel"], { cwd: target }).trim(),
  );
  if (topLevel !== target)
    throw new Error(
      `task checkout top-level must be ${target}, got ${topLevel}`,
    );
  const callerCommonDir = gitCommonDir();
  const targetCommonDir = gitCommonDir(target);
  const commonRelative = path.relative(target, targetCommonDir);
  const commonInsideTarget =
    commonRelative === "" ||
    (!path.isAbsolute(commonRelative) &&
      commonRelative !== ".." &&
      !commonRelative.startsWith(`..${path.sep}`));
  if (commonInsideTarget) {
    throw new Error(
      `task checkout must use a linked worktree common directory outside ${target}`,
    );
  }
  if (targetCommonDir !== callerCommonDir) {
    throw new Error(
      `task checkout common-dir must match the caller shared repository: ${targetCommonDir} != ${callerCommonDir}`,
    );
  }
  const actual = checkoutState(target);
  assertCheckout(actual, { branch }, "task checkout");
  const localSha = optionalLocalRefSha(branchRef);
  if (!localSha || localSha !== actual.sha) {
    throw new Error(
      `task branch ${branch} must point to checkout HEAD ${actual.sha}`,
    );
  }
  return { target, branch, sha: actual.sha };
}

function gitCommonDir(cwd = process.cwd()) {
  const value = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd },
  ).trim();
  return canonicalPath(
    path.isAbsolute(value) ? value : path.resolve(cwd, value),
  );
}

function assertStatusGate(issue, status) {
  if (status === "status:blocked" || status === "status:backlog") return null;
  if (status === "status:ready") {
    assertPredecessorsClosed(issue);
    return null;
  }
  const checkout = assertTaskCheckout(issue);
  if (["status:implementing", "status:qa"].includes(status)) {
    const specFile = path.join(checkout.target, specPathForIssue(issue));
    assertGate("spec", specFile, specFailures(specFile));
  }
  return checkout;
}

function checkStateFailures(checkRuns = [], statuses = []) {
  const failures = [];
  if (checkRuns.length + statuses.length === 0)
    failures.push("no CI checks or commit statuses found");
  for (const check of checkRuns) {
    if (
      check.status !== "completed" ||
      !["success", "neutral", "skipped"].includes(check.conclusion)
    ) {
      failures.push(
        `check ${check.name || check.id || "unknown"} is ${check.status}/${check.conclusion || "none"}`,
      );
    }
  }
  for (const status of statuses) {
    if (status.state !== "success") {
      failures.push(
        `commit status ${status.context || status.id || "unknown"} is ${status.state || "unknown"}`,
      );
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
  if (
    !explicit ||
    allClosingReferences.length !== 1 ||
    allClosingReferences[0] !== Number(explicit)
  )
    return [];
  return [Number(explicit)];
}

function prRelationFailures(pr, expected) {
  const failures = [];
  if (pr.base?.ref !== expected.mainBranch)
    failures.push(`PR base must be ${expected.mainBranch}`);
  if (pr.base?.repo?.full_name !== expected.repo)
    failures.push(`PR base repository must be ${expected.repo}`);
  if (expected.baseSha && pr.base?.sha !== expected.baseSha) {
    failures.push(`PR base SHA must be ${expected.baseSha}`);
  }
  if (pr.head?.repo?.full_name !== expected.repo)
    failures.push(`PR head repository must be ${expected.repo}`);
  if (pr.head?.ref !== expected.branch)
    failures.push(`PR head branch must be ${expected.branch}`);
  if (expected.sha && pr.head?.sha !== expected.sha)
    failures.push(`PR head SHA must be ${expected.sha}`);
  const closingNumbers = closingIssueNumbers(pr.body);
  if (
    closingNumbers.length !== 1 ||
    closingNumbers[0] !== Number(expected.issueNumber)
  ) {
    failures.push(
      `PR body must contain exactly one closing reference: \`Closes #${Number(expected.issueNumber)}\``,
    );
  }
  if (expected.requireOpenState && pr.state !== "open")
    failures.push("PR must be open");
  if (expected.requireDraft && pr.draft !== true)
    failures.push("PR must be a draft");
  if (expected.requireOpen) {
    if (pr.state !== "open") failures.push("PR must be open");
    if (pr.draft !== false) failures.push("PR must not be a draft");
  }
  if (expected.requireMergeable && pr.mergeable !== true)
    failures.push("PR must be mergeable");
  if (expected.requireMerged) {
    if (pr.state !== "closed") failures.push("merged PR must be closed");
    if (!pr.merged_at) failures.push("PR must have merged_at evidence");
    if (!pr.merge_commit_sha)
      failures.push("PR must have merge_commit_sha evidence");
    if (!/^[0-9a-f]{40,64}$/i.test(String(pr.head?.sha || "")))
      failures.push("merged PR must have head SHA evidence");
  }
  return failures;
}

function assertPrRelation(pr, expected) {
  const failures = prRelationFailures(pr, expected);
  if (failures.length)
    throw new Error(`PR relation gate failed: ${failures.join("; ")}`);
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
  const changed = [...snapshot].filter(
    ([file, contents]) => !fs.existsSync(file) || readText(file) !== contents,
  );
  if (changed.length) {
    throw new Error(
      `${label} changed guarded files: ${changed.map(([file]) => file).join(", ")}`,
    );
  }
}

function fullVerifyMarker(sha) {
  return path.join(gitCommonDir(), "gyeop-full-verify", sha);
}

function verifyCheckout(expected, label, guardedFiles = []) {
  const before = checkoutState();
  assertCheckout(before, expected, `${label} before verify`);
  const guardedSnapshot = fileSnapshot(guardedFiles);
  const marker = fullVerifyMarker(before.sha);
  if (fs.existsSync(marker)) {
    console.log(`Reusing full verification for ${before.sha}.`);
  } else {
    run("./scripts/run-ai-verify", ["--mode", "full"], { stdio: "inherit" });
  }
  const after = checkoutState();
  assertCheckout(
    after,
    { ...expected, sha: before.sha },
    `${label} after verify`,
  );
  assertFilesUnchanged(guardedSnapshot, label);
  if (!fs.existsSync(marker)) {
    throw new Error(
      `full verification passed without recording SHA ${before.sha}`,
    );
  }
  return before.sha;
}

function remoteBranchSha(branch) {
  const output = run("git", [
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]).trim();
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
  if (candidates.length > 1)
    throw new Error(`multiple open PRs found for ${branch}`);
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

function markPrReady(prNumber, issueNumber) {
  assertOriginRepo();
  assertIssueStatus(getIssue(issueNumber), "status:qa");
  run("gh", ["pr", "ready", String(prNumber), "--repo", repo]);
}

function assertReusablePr(pr, expected) {
  assertPrRelation(pr, { ...expected, requireOpenState: true });
  if (typeof pr.draft !== "boolean")
    throw new Error(`PR #${pr.number} draft state is missing`);
}

function readyVerifiedPr(pr, expected) {
  assertReusablePr(pr, expected);
  if (!pr.draft) {
    assertPrRelation(pr, { ...expected, requireOpen: true });
    return pr;
  }

  let readyError = null;
  try {
    markPrReady(pr.number, expected.issueNumber);
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

  const commandDetail = readyError
    ? `; ready command: ${readyError.message}`
    : "";
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
  assertIssueStatus(getIssue(issue.number), "status:qa");
  const verifiedSha = verifyCheckout({ branch }, "PR checkout", guardedFiles);
  assertIssueStatus(getIssue(issue.number), "status:qa");
  assertGate("spec", specFile, specFailures(specFile));
  assertGate("qa", qaFile, qaFailures(qaFile));
  const recheckedExisting = reusablePrCandidate(branch, expected);
  if (recheckedExisting?.number !== existing?.number) {
    throw new Error(
      `open PR candidate changed during verification for ${branch}`,
    );
  }
  assertOriginRepo();
  assertIssueStatus(getIssue(issue.number), "status:qa");
  run("git", ["push", "origin", `${verifiedSha}:refs/heads/${branch}`], {
    stdio: "inherit",
  });
  const pushedSha = remoteBranchSha(branch);
  if (pushedSha !== verifiedSha) {
    throw new Error(
      `remote branch ${branch} must be ${verifiedSha}, got ${pushedSha || "missing"}`,
    );
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
    assertIssueStatus(getIssue(issue.number), "status:qa");
    const draft = ghApi("POST", `repos/${repo}/pulls`, {
      title: issue.title,
      head: branch,
      base: mainBranch,
      body,
      draft: true,
    });
    pr = readyVerifiedPr(draft, verifiedExpected);
  }
  assertIssueStatus(getIssue(issue.number), "status:qa");
  console.log(
    JSON.stringify(
      { pr: pr.number, url: pr.html_url, branch, verifiedSha, reused },
      null,
      2,
    ),
  );
}

function listCheckState(sha) {
  const checks = ghApi(
    "GET",
    `repos/${repo}/commits/${sha}/check-runs?per_page=100`,
  );
  const status = ghApi("GET", `repos/${repo}/commits/${sha}/status`);
  const checkRuns = checks.check_runs || [];
  const statuses = status.statuses || [];
  const failingChecks = checkRuns.filter(
    (runItem) =>
      runItem.status !== "completed" ||
      !["success", "neutral", "skipped"].includes(runItem.conclusion),
  );
  const failingStatuses = statuses.filter((item) => item.state !== "success");
  const failures = checkStateFailures(checkRuns, statuses);
  const checksTotal = Number(checks.total_count ?? checkRuns.length);
  const statusesTotal = Number(status.total_count ?? statuses.length);
  if (checksTotal !== checkRuns.length || statusesTotal !== statuses.length) {
    failures.push(
      "CI result set is incomplete; more than 100 results are not supported",
    );
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
  if (issueNumber <= 0)
    throw new Error(
      "PR body must contain exactly one `Closes #<issue-number>` reference",
    );
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
        {
          pr: pr.number,
          merged: true,
          sha: pr.merge_commit_sha,
          verifiedSha: pr.head.sha,
          alreadyMerged: true,
        },
        null,
        2,
      ),
    );
    return;
  }
  assertIssueStatus(issue, "status:qa");
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
  const verifiedSha = verifyCheckout(
    { branch, sha: pr.head.sha },
    "merge checkout",
    guardedFiles,
  );
  assertIssueStatus(getIssue(issue.number), "status:qa");
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

  assertIssueStatus(getIssue(issue.number), "status:qa");
  const state = listCheckState(verifiedSha);
  if (state.failures.length) {
    console.error(JSON.stringify({ status: "blocked", ...state }, null, 2));
    process.exit(1);
  }
  assertIssueStatus(getIssue(issue.number), "status:qa");

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
  assertIssueStatus(getIssue(issue.number), "status:qa");
  const merged = ghApi("PUT", `${prEndpoint(prNumber)}/merge`, {
    merge_method: "squash",
    commit_title: pr.title,
    commit_message: `PR #${pr.number}에서 squash merge했습니다.`,
    sha: verifiedSha,
  });
  if (!merged.merged)
    throw new Error(
      `GitHub refused to merge PR #${pr.number}: ${merged.message || "unknown reason"}`,
    );
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
    throw new Error(
      `merged PR SHA ${mergedPr.merge_commit_sha} does not match merge response ${merged.sha}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        pr: pr.number,
        merged: true,
        sha: merged.sha,
        verifiedSha,
        alreadyMerged: false,
      },
      null,
      2,
    ),
  );
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
  const comments = ghApi(
    "GET",
    `${issueEndpoint(issueNumber)}/comments?per_page=100`,
  );
  if (Number(issue.comments || 0) > comments.length) {
    throw new Error(
      `issue #${issue.number} has more than 100 comments; completion marker cannot be verified safely`,
    );
  }
  const marker = completionCommentMarker(issue, pr);
  const alreadyCommented = comments.some((comment) =>
    String(comment.body || "").includes(marker),
  );
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
  const closedIssue = getIssue(issueNumber);
  if (closedIssue.state !== "closed")
    throw new Error(`issue #${issue.number} close was not confirmed`);
  const project = syncProjectIfConfigured(issueNumber, {
    completed: true,
    prNumber: pr.number,
    workflowChanged: !alreadyClosed,
    expectedStatus: "closed",
  });
  console.log(
    JSON.stringify(
      {
        issue: issue.number,
        pr: pr.number,
        closed: true,
        alreadyClosed,
        alreadyCommented,
        project,
      },
      null,
      2,
    ),
  );
}

function optionalLocalRefSha(ref) {
  const result = runResult("git", ["rev-parse", "--verify", "--quiet", ref]);
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 1) return "";
  const detail =
    result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  throw new Error(`git rev-parse --verify --quiet ${ref} failed\n${detail}`);
}

function isAncestor(ancestor, descendant) {
  const result = runResult("git", [
    "merge-base",
    "--is-ancestor",
    ancestor,
    descendant,
  ]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const detail =
    result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  throw new Error(
    `git merge-base --is-ancestor ${ancestor} ${descendant} failed\n${detail}`,
  );
}

function canonicalPath(input) {
  const resolved = path.resolve(input);
  const suffix = [];
  let current = resolved;
  while (true) {
    try {
      return path.resolve(fs.realpathSync.native(current), ...suffix);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
      try {
        if (fs.lstatSync(current).isSymbolicLink()) {
          throw new Error(`cannot canonicalize broken symlink: ${current}`);
        }
      } catch (lstatError) {
        if (lstatError.code !== "ENOENT" && lstatError.code !== "ENOTDIR")
          throw lstatError;
      }
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      suffix.unshift(path.basename(current));
      current = parent;
    }
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
      .map((line) =>
        line.startsWith(prefix) ? line.slice(prefix.length) : line,
      )
      .sort();
  }
  if (result.status === 1) return [];
  const detail =
    result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  throw new Error(`git config branch lookup failed\n${detail}`);
}

function branchConfigExists(branch) {
  return branchConfigSnapshot(branch).length > 0;
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resumeConfigValues(key) {
  const result = runResult("git", ["config", "--local", "--get-all", key]);
  if (result.status === 0) return result.stdout.split(/\r?\n/).filter(Boolean);
  if (result.status === 1) return [];
  const detail =
    result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  throw new Error(`git config ${key} lookup failed\n${detail}`);
}

function resumeOriginSnapshot() {
  const fetchUrls = originUrls();
  const pushUrls = originUrls({ push: true });
  const valid =
    repo &&
    fetchUrls.length > 0 &&
    pushUrls.length > 0 &&
    [...fetchUrls, ...pushUrls].every((url) => repoFromUrl(url) === repo);
  if (!valid)
    throw new Error(
      `git origin fetch and push URLs must all match ${repo || "the configured repository"}`,
    );
  return {
    fetchConfig: resumeConfigValues("remote.origin.url"),
    pushConfig: resumeConfigValues("remote.origin.pushurl"),
    fetchUrls,
    pushUrls,
    fetchUrl: fetchUrls[0],
  };
}

function resumeRemoteSha(fetchUrl, branch) {
  const ref = `refs/heads/${branch}`;
  const lines = run("git", ["ls-remote", "--heads", fetchUrl, ref])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length !== 1)
    throw new Error(`remote branch ${branch} returned ${lines.length} refs`);
  const [sha, actualRef, ...extra] = lines[0].split(/\s+/);
  if (extra.length || actualRef !== ref || !/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new Error(`remote branch ${branch} returned an invalid ref`);
  }
  return sha.toLowerCase();
}

function resumeRepositorySnapshot(cwd = process.cwd()) {
  const topLevel = canonicalPath(
    run("git", ["rev-parse", "--show-toplevel"], { cwd }).trim(),
  );
  const common = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd },
  ).trim();
  return {
    topLevel,
    commonDir: canonicalPath(
      path.isAbsolute(common) ? common : path.resolve(cwd, common),
    ),
  };
}

function resumeRegistrySnapshot() {
  return parseWorktrees(run("git", ["worktree", "list", "--porcelain"]))
    .map((entry) => ({
      worktree: canonicalPath(entry.worktree),
      head: entry.head || null,
      branch: entry.branch || null,
      detached: Boolean(entry.detached),
    }))
    .sort((left, right) => left.worktree.localeCompare(right.worktree));
}

function resumeLstat(target) {
  try {
    const stat = fs.lstatSync(target);
    return {
      exists: true,
      kind: stat.isSymbolicLink()
        ? "symlink"
        : stat.isDirectory()
          ? "directory"
          : stat.isFile()
            ? "file"
            : "other",
      dev: stat.dev,
      ino: stat.ino,
      mode: stat.mode,
    };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false };
    throw error;
  }
}

function resumeWorkflowSnapshot(issue) {
  const current = workflowState(issue);
  if (
    ![
      "status:ready",
      "status:spec",
      "status:implementing",
      "status:qa",
      "status:blocked",
    ].includes(current.status)
  ) {
    throw new Error(
      `issue #${issue.number} cannot resume from ${current.status}`,
    );
  }
  return { status: current.status, provenance: current.provenance };
}

function resumeMergedPullRequests(branch) {
  const owner = repo.split("/")[0];
  const merged = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      state: "all",
      head: `${owner}:${branch}`,
      base: mainBranch,
      per_page: "100",
      page: String(page),
    });
    const pulls = ghApi("GET", `repos/${repo}/pulls?${query.toString()}`);
    if (!Array.isArray(pulls))
      throw new Error(`pull request page ${page} is not an array`);
    merged.push(...pulls.filter((pull) => pull.merged_at));
    if (pulls.length < 100) return merged;
  }
}

function resumeAssertGithub(issueNumber, branch, expectedWorkflow) {
  const assertIssue = () => {
    const issue = getIssue(issueNumber);
    const current = resumeWorkflowSnapshot(issue);
    if (!sameSnapshot(current, expectedWorkflow)) {
      throw new Error(
        `issue #${issueNumber} workflow state changed during resume`,
      );
    }
  };
  assertIssue();
  const merged = resumeMergedPullRequests(branch);
  if (merged.length)
    throw new Error(
      `branch ${branch} already has merged PR #${merged[0].number}`,
    );
  assertIssue();
}

function resumeAssertOrigin(expected) {
  const current = resumeOriginSnapshot();
  if (!sameSnapshot(current, expected))
    throw new Error("git origin configuration changed during resume");
}

function resumeAssertNoQuarantine(branch, registry = resumeRegistrySnapshot()) {
  const quarantine = quarantineBranchFor(branch);
  const quarantineRef = `refs/heads/${quarantine}`;
  if (
    optionalLocalRefSha(quarantineRef) ||
    branchConfigExists(quarantine) ||
    registry.some((entry) => entry.branch === quarantineRef)
  ) {
    throw new Error(`cleanup quarantine exists for ${branch}`);
  }
}

function resumeValidateTarget({
  target,
  branch,
  expectedSha,
  expectedCommonDir,
  registry,
  targetLstat,
  present,
}) {
  const branchRef = `refs/heads/${branch}`;
  const targetEntries = registry.filter((entry) => entry.worktree === target);
  const branchEntries = registry.filter((entry) => entry.branch === branchRef);
  if (present) {
    if (!targetLstat.exists || targetLstat.kind !== "directory") {
      throw new Error(`registered target ${target} must be a real directory`);
    }
    if (targetEntries.length !== 1)
      throw new Error(
        `target ${target} must have exactly one worktree registry entry`,
      );
    if (branchEntries.length !== 1 || branchEntries[0].worktree !== target) {
      throw new Error(`branch ${branch} must be registered only at ${target}`);
    }
    const entry = targetEntries[0];
    if (
      entry.branch !== branchRef ||
      entry.detached ||
      entry.head !== expectedSha
    ) {
      throw new Error(
        `target ${target} registry branch or HEAD does not match ${branch}@${expectedSha}`,
      );
    }
    const location = resumeRepositorySnapshot(target);
    if (
      location.topLevel !== target ||
      location.commonDir !== expectedCommonDir
    ) {
      throw new Error(
        `target ${target} does not belong to the expected shared repository`,
      );
    }
    const commonRelative = path.relative(target, location.commonDir);
    const commonInsideTarget =
      commonRelative === "" ||
      (!path.isAbsolute(commonRelative) &&
        commonRelative !== ".." &&
        !commonRelative.startsWith(`..${path.sep}`));
    if (commonInsideTarget) {
      throw new Error(
        `target ${target} must use a linked worktree common directory outside the target`,
      );
    }
    const checkout = checkoutState(target);
    assertCheckout(
      checkout,
      { branch, sha: expectedSha },
      "resume target worktree",
    );
  } else {
    if (targetLstat.exists)
      throw new Error(`unregistered target path already exists: ${target}`);
    if (targetEntries.length)
      throw new Error(`target ${target} is unexpectedly registered`);
    if (branchEntries.length)
      throw new Error(
        `branch ${branch} is checked out at ${branchEntries[0].worktree}`,
      );
  }
}

function resumeAssertPhase(snapshot, phase) {
  resumeAssertGithub(snapshot.issueNumber, snapshot.branch, snapshot.workflow);
  resumeAssertOrigin(snapshot.origin);
  const repository = resumeRepositorySnapshot();
  if (!sameSnapshot(repository, snapshot.repository))
    throw new Error("calling repository changed during resume");
  const remoteSha = resumeRemoteSha(snapshot.origin.fetchUrl, snapshot.branch);
  if (remoteSha !== snapshot.remoteSha)
    throw new Error(`remote branch ${snapshot.branch} changed during resume`);
  const localSha = optionalLocalRefSha(snapshot.branchRef);
  if (localSha !== phase.localSha)
    throw new Error(`local branch ${snapshot.branch} changed during resume`);
  const registry = resumeRegistrySnapshot();
  resumeAssertNoQuarantine(snapshot.branch, registry);
  if (!sameSnapshot(registry, phase.registry))
    throw new Error("worktree registry changed during resume");
  const targetLstat = resumeLstat(snapshot.target);
  if (!sameSnapshot(targetLstat, phase.targetLstat))
    throw new Error(`target path ${snapshot.target} changed during resume`);
  resumeValidateTarget({
    target: snapshot.target,
    branch: snapshot.branch,
    expectedSha: snapshot.expectedSha,
    expectedCommonDir: snapshot.repository.commonDir,
    registry,
    targetLstat,
    present: phase.targetPresent,
  });
  resumeAssertGithub(snapshot.issueNumber, snapshot.branch, snapshot.workflow);
}

function resumePartialDiagnostics(snapshot) {
  let localRef = "unknown";
  let registeredWorktree = "unknown";
  let targetExists = "unknown";
  try {
    localRef = optionalLocalRefSha(snapshot.branchRef) || null;
  } catch {}
  try {
    registeredWorktree = resumeRegistrySnapshot().some(
      (entry) => entry.worktree === snapshot.target,
    );
  } catch {}
  try {
    targetExists = resumeLstat(snapshot.target).exists;
  } catch {}
  return {
    expectedSha: snapshot.expectedSha || null,
    localRef,
    registeredWorktree,
    targetExists,
  };
}

function resumeExpectedRegistryAfterAdd(registry, target, branch, sha) {
  return [
    ...registry,
    {
      worktree: target,
      head: sha,
      branch: `refs/heads/${branch}`,
      detached: false,
    },
  ].sort((left, right) => left.worktree.localeCompare(right.worktree));
}

function resumeIssue(issueNumber) {
  const issue = getIssue(issueNumber);
  const workflow = resumeWorkflowSnapshot(issue);
  const branch = branchForIssue(issue);
  const branchRef = `refs/heads/${branch}`;
  const targetPath = path.resolve(
    canonicalPath(worktreeRoot),
    issueSlug(issue),
  );
  const target = canonicalPath(targetPath);
  if (target !== targetPath)
    throw new Error(`task worktree path must not be an alias: ${targetPath}`);
  const origin = resumeOriginSnapshot();
  const repository = resumeRepositorySnapshot();
  const localSha = optionalLocalRefSha(branchRef);
  const remoteSha = resumeRemoteSha(origin.fetchUrl, branch);
  const registry = resumeRegistrySnapshot();
  const targetLstat = resumeLstat(target);
  const targetEntries = registry.filter((entry) => entry.worktree === target);
  const targetPresent = targetEntries.length > 0;
  const snapshot = {
    issueNumber: issue.number,
    workflow,
    branch,
    branchRef,
    target,
    origin,
    repository,
    remoteSha,
    expectedSha: "",
  };
  let project;
  let projectAttempted = false;

  try {
    resumeAssertGithub(issue.number, branch, workflow);
    resumeAssertNoQuarantine(branch, registry);
    if (targetEntries.length > 1)
      throw new Error(
        `target ${target} has duplicate worktree registry entries`,
      );
    if (localSha && remoteSha && localSha !== remoteSha) {
      throw new Error(`local and remote branches differ for ${branch}`);
    }
    if (!localSha && !remoteSha)
      throw new Error(`branch ${branch} is missing locally and remotely`);

    const expectedSha = localSha || remoteSha;
    snapshot.expectedSha = expectedSha;
    const initialPhase = { localSha, registry, targetLstat, targetPresent };
    resumeValidateTarget({
      target,
      branch,
      expectedSha,
      expectedCommonDir: repository.commonDir,
      registry,
      targetLstat,
      present: targetPresent,
    });
    if (localSha) run("git", ["cat-file", "-e", `${expectedSha}^{commit}`]);

    if (targetPresent) {
      resumeAssertPhase(snapshot, initialPhase);
      projectAttempted = Boolean(projectNumber);
      project = syncProjectIfConfigured(issue.number, {
        expectedStatus: workflow.status,
      });
      resumeAssertPhase(snapshot, initialPhase);
      return {
        issue: issue.number,
        status: workflow.status,
        mode: "reused",
        branch,
        worktree: target,
        sha: expectedSha,
        project,
      };
    }

    let mode = "restored-local";
    let currentPhase = initialPhase;
    if (!localSha) {
      mode = "restored-remote";
      resumeAssertPhase(snapshot, currentPhase);
      run("git", ["fetch", "--no-tags", origin.fetchUrl, expectedSha]);
      resumeAssertPhase(snapshot, currentPhase);
      run("git", ["cat-file", "-e", `${expectedSha}^{commit}`]);
      resumeAssertPhase(snapshot, currentPhase);
      run("git", ["update-ref", branchRef, expectedSha, ""]);
      currentPhase = { ...currentPhase, localSha: expectedSha };
      resumeAssertPhase(snapshot, currentPhase);
    }

    resumeAssertPhase(snapshot, currentPhase);
    run("git", ["worktree", "add", target, branch]);
    const finalPhase = {
      localSha: expectedSha,
      registry: resumeExpectedRegistryAfterAdd(
        registry,
        target,
        branch,
        expectedSha,
      ),
      targetLstat: resumeLstat(target),
      targetPresent: true,
    };
    resumeAssertPhase(snapshot, finalPhase);
    projectAttempted = Boolean(projectNumber);
    project = syncProjectIfConfigured(issue.number, {
      expectedStatus: workflow.status,
    });
    resumeAssertPhase(snapshot, finalPhase);
    return {
      issue: issue.number,
      status: workflow.status,
      mode,
      branch,
      worktree: target,
      sha: expectedSha,
      project,
    };
  } catch (error) {
    if (projectAttempted)
      attachPostProjectDiagnostics(error, {
        issueNumber: issue.number,
        expectedStatus: workflow.status,
        workflowChanged: false,
        project,
        recoveryCommands: [`scripts/task-harness resume ${issue.number}`],
      });
    error.resumeDiagnostics = resumePartialDiagnostics(snapshot);
    throw error;
  }
}

function resume(issueNumber) {
  const result = resumeIssue(issueNumber);
  console.log(JSON.stringify(result, null, 2));
  return result;
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

  if (branchWorktree())
    throw new Error(`branch ${branch} is still checked out`);
  const originalSha = optionalLocalRefSha(branchRef);
  const quarantinedSha = optionalLocalRefSha(quarantineRef);
  const renameRequired = Boolean(originalSha);
  let repairQuarantineConfig = false;
  if (originalSha && quarantinedSha)
    throw new Error(
      `original and quarantine branches both exist for ${branch}`,
    );
  if (originalSha) {
    if (originalSha !== expectedSha)
      throw new Error(`local branch ${branch} changed before quarantine`);
    if (!sameSnapshot(branchConfigSnapshot(branch), expectedConfig)) {
      throw new Error(`branch config for ${branch} changed before quarantine`);
    }
    if (branchConfigExists(quarantine))
      throw new Error(`quarantine config collision: ${quarantine}`);
  } else if (quarantinedSha) {
    if (quarantinedSha !== expectedSha)
      throw new Error(`quarantine branch ${quarantine} has an unexpected SHA`);
    const originalConfig = branchConfigSnapshot(branch);
    const quarantineConfig = branchConfigSnapshot(quarantine);
    if (
      sameSnapshot(quarantineConfig, expectedConfig) &&
      originalConfig.length === 0
    ) {
      // A previous run completed the branch rename.
    } else if (
      quarantineConfig.length === 0 &&
      sameSnapshot(originalConfig, expectedConfig)
    ) {
      repairQuarantineConfig = originalConfig.length > 0;
    } else {
      throw new Error(
        `branch config changed for existing quarantine ${quarantine}`,
      );
    }
  } else {
    throw new Error(`local branch ${branch} disappeared before quarantine`);
  }

  try {
    if (renameRequired) run("git", ["branch", "-m", branch, quarantine]);
    if (repairQuarantineConfig) {
      run("git", [
        "config",
        "--local",
        "--rename-section",
        `branch.${branch}`,
        `branch.${quarantine}`,
      ]);
    }
    const linked = branchWorktree();
    if (linked)
      throw new Error(
        `quarantine branch became checked out at ${linked.worktree}`,
      );
    if (optionalLocalRefSha(branchRef))
      throw new Error(`original branch ${branch} reappeared during quarantine`);
    if (optionalLocalRefSha(quarantineRef) !== expectedSha) {
      throw new Error(
        `quarantine branch ${quarantine} changed before compare-and-delete`,
      );
    }
    if (
      branchConfigExists(branch) ||
      !sameSnapshot(branchConfigSnapshot(quarantine), expectedConfig)
    ) {
      throw new Error(`branch config changed while quarantining ${branch}`);
    }

    const worktreePathsBeforeDelete = new Set(
      parseWorktrees(run("git", ["worktree", "list", "--porcelain"])).map(
        (entry) => canonicalPath(entry.worktree),
      ),
    );
    run("git", ["update-ref", "-d", quarantineRef, expectedSha]);
    if (optionalLocalRefSha(quarantineRef))
      throw new Error(`quarantine ref ${quarantineRef} survived deletion`);
    const linkedAfterDelete = parseWorktrees(
      run("git", ["worktree", "list", "--porcelain"]),
    ).find(
      (entry) =>
        [branchRef, quarantineRef].includes(entry.branch) ||
        !worktreePathsBeforeDelete.has(canonicalPath(entry.worktree)),
    );
    if (linkedAfterDelete) {
      run("git", ["update-ref", quarantineRef, expectedSha, ""]);
      throw new Error(
        `quarantine branch was checked out at ${linkedAfterDelete.worktree} during deletion`,
      );
    }
    if (!sameSnapshot(branchConfigSnapshot(quarantine), expectedConfig)) {
      throw new Error(
        `quarantine config changed before cleanup for ${quarantine}`,
      );
    }
    if (branchConfigExists(quarantine)) {
      run("git", [
        "config",
        "--local",
        "--remove-section",
        `branch.${quarantine}`,
      ]);
    }
    if (optionalLocalRefSha(quarantineRef) || branchWorktree()) {
      throw new Error(
        `quarantine branch ${quarantine} reappeared during config cleanup`,
      );
    }
    if (branchConfigExists(quarantine))
      throw new Error(`quarantine config for ${quarantine} survived deletion`);
    return quarantine;
  } catch (error) {
    let recoveryError = null;
    try {
      let recoveryOriginalSha = optionalLocalRefSha(branchRef);
      let recoveryQuarantineSha = optionalLocalRefSha(quarantineRef);
      const linked = branchWorktree();
      if (
        !recoveryOriginalSha &&
        !recoveryQuarantineSha &&
        linked?.branch === quarantineRef
      ) {
        run("git", ["update-ref", quarantineRef, expectedSha, ""]);
        recoveryQuarantineSha = expectedSha;
      }
      if (!recoveryOriginalSha && recoveryQuarantineSha) {
        run("git", ["branch", "-m", quarantine, branch]);
      } else if (!recoveryOriginalSha && !recoveryQuarantineSha) {
        run("git", ["update-ref", branchRef, expectedSha, ""]);
        if (branchConfigExists(quarantine) && !branchConfigExists(branch)) {
          run("git", [
            "config",
            "--local",
            "--rename-section",
            `branch.${quarantine}`,
            `branch.${branch}`,
          ]);
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
    const worktrees = parseWorktrees(
      run("git", ["worktree", "list", "--porcelain"]),
    );
    registeredWorktree = worktrees.some(
      (entry) => canonicalPath(entry.worktree) === canonicalPath(target),
    );
    const linked = worktrees
      .filter((entry) =>
        [expectedBranchRef, quarantineBranchRef].includes(entry.branch),
      )
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
  if (issue.state !== "closed")
    throw new Error(`issue #${issue.number} must be closed before cleanup`);
  const pr = mergedPrForIssue(issue, prNumber);
  const branch = branchForIssue(issue);
  const target = path.join(worktreeRoot, issueSlug(issue));
  assertCheckout(
    checkoutState(),
    { branch: mainBranch },
    "cleanup main checkout",
  );
  assertOriginRepo();
  run("git", ["fetch", "origin", mainBranch], { stdio: "inherit" });
  assertCheckout(
    checkoutState(),
    { branch: mainBranch },
    "cleanup main checkout after fetch",
  );

  const originMainRef = `refs/remotes/origin/${mainBranch}`;
  const originMainSha = run("git", ["rev-parse", originMainRef]).trim();
  const localMainRef = `refs/heads/${mainBranch}`;
  const localMainSha = run("git", ["rev-parse", localMainRef]).trim();
  if (!isAncestor(pr.merge_commit_sha, originMainRef)) {
    throw new Error(
      `origin/${mainBranch} does not contain merge commit ${pr.merge_commit_sha}`,
    );
  }
  if (!isAncestor(localMainSha, originMainSha)) {
    throw new Error(
      `local ${mainBranch} cannot fast-forward to origin/${mainBranch}`,
    );
  }

  const worktrees = parseWorktrees(
    run("git", ["worktree", "list", "--porcelain"]),
  );
  const targetPath = canonicalPath(target);
  const targetEntry = worktrees.find(
    (entry) => canonicalPath(entry.worktree) === targetPath,
  );
  const expectedBranchRef = `refs/heads/${branch}`;
  const quarantine = quarantineBranchFor(branch);
  const quarantineBranchRef = `refs/heads/${quarantine}`;
  const remoteTrackingRef = `refs/remotes/origin/${branch}`;
  const branchElsewhere = worktrees.find(
    (entry) =>
      [expectedBranchRef, quarantineBranchRef].includes(entry.branch) &&
      canonicalPath(entry.worktree) !== targetPath,
  );
  const originalBranchSha = optionalLocalRefSha(expectedBranchRef);
  const quarantinedBranchSha = optionalLocalRefSha(quarantineBranchRef);
  const localBranchSha = originalBranchSha || quarantinedBranchSha;
  const localBranchName = originalBranchSha
    ? branch
    : quarantinedBranchSha
      ? quarantine
      : "";
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
  if (branchElsewhere)
    failures.push(
      `branch ${branch} is checked out at unexpected worktree ${branchElsewhere.worktree}`,
    );
  if (originalBranchSha && quarantinedBranchSha)
    failures.push(`original and quarantine branches both exist for ${branch}`);
  if (originalBranchSha && quarantineBranchConfig.length)
    failures.push(`quarantine config already exists for ${branch}`);
  if (
    quarantinedBranchSha &&
    originalBranchConfig.length &&
    quarantineBranchConfig.length
  ) {
    failures.push(`original and quarantine configs both exist for ${branch}`);
  }
  if (localBranchSha && localBranchSha !== pr.head.sha) {
    failures.push(
      `local or quarantine branch ${branch} must be ${pr.head.sha}, got ${localBranchSha}`,
    );
  }
  if (remoteSha && remoteSha !== pr.head.sha) {
    failures.push(
      `remote branch ${branch} must be ${pr.head.sha}, got ${remoteSha}`,
    );
  }
  if (remoteTrackingSha && remoteTrackingSha !== pr.head.sha) {
    failures.push(
      `remote-tracking branch origin/${branch} must be ${pr.head.sha}, got ${remoteTrackingSha}`,
    );
  }
  if (targetEntry) {
    failures.push(
      ...checkoutFailures(checkoutState(target), {
        branch: localBranchName || branch,
        sha: pr.head.sha,
      }).map((failure) => `target worktree: ${failure}`),
    );
    const unsafeIgnored = unsafeIgnoredPaths(target);
    if (unsafeIgnored.length) {
      failures.push(
        `target worktree has non-disposable ignored paths: ${unsafeIgnored.join(", ")}`,
      );
    }
    if (!localBranchSha)
      failures.push(
        `target worktree branch ref ${expectedBranchRef} is missing`,
      );
  }
  if (failures.length)
    throw new Error(`cleanup preflight failed: ${failures.join("; ")}`);

  try {
    if (localMainSha !== originMainSha) {
      run("git", ["merge", "--ff-only", originMainRef], { stdio: "inherit" });
      assertCheckout(
        checkoutState(),
        { branch: mainBranch, sha: originMainSha },
        "cleanup fast-forward",
      );
    }
    if (targetEntry) {
      assertCheckout(
        checkoutState(target),
        { branch, sha: pr.head.sha },
        "cleanup target worktree recheck",
      );
      const latestUnsafeIgnored = unsafeIgnoredPaths(target);
      if (latestUnsafeIgnored.length) {
        throw new Error(
          `target worktree gained non-disposable ignored paths: ${latestUnsafeIgnored.join(", ")}`,
        );
      }
      run("git", ["worktree", "remove", target], { stdio: "inherit" });
    }
    if (localBranchSha) {
      const latestWorktree = parseWorktrees(
        run("git", ["worktree", "list", "--porcelain"]),
      ).find((entry) =>
        [expectedBranchRef, quarantineBranchRef].includes(entry.branch),
      );
      if (latestWorktree) {
        throw new Error(
          `branch ${branch} became checked out at ${latestWorktree.worktree} during cleanup`,
        );
      }
      const latestLocalSha = optionalLocalRefSha(expectedBranchRef);
      const latestQuarantinedSha = optionalLocalRefSha(quarantineBranchRef);
      if (
        (latestLocalSha || latestQuarantinedSha) !== pr.head.sha ||
        (latestLocalSha && latestQuarantinedSha)
      ) {
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
        throw new Error(
          `remote-tracking branch origin/${branch} changed during cleanup`,
        );
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
      if (
        !sameSnapshot(branchConfigSnapshot(quarantine), quarantineBranchConfig)
      ) {
        throw new Error(
          `quarantine config for ${branch} changed during cleanup`,
        );
      }
      run("git", [
        "config",
        "--local",
        "--remove-section",
        `branch.${quarantine}`,
      ]);
    }
    if (branchConfigExists(branch))
      throw new Error(`branch config for ${branch} survived cleanup`);
    if (branchConfigExists(quarantine))
      throw new Error(`quarantine config for ${branch} survived cleanup`);
  } catch (error) {
    throw new Error(
      `cleanup partially failed: ${error.message}; remaining=${JSON.stringify(cleanupRemainingState(target, branch))}`,
    );
  }
  const remaining = cleanupRemainingState(target, branch);
  const remainingEntries = Object.entries(remaining).filter(([, value]) =>
    Boolean(value),
  );
  if (remainingEntries.length) {
    throw new Error(
      `cleanup did not remove every target resource: ${JSON.stringify(remaining)}`,
    );
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
  project-sync <issue-number>
  queue
  reconcile
  status <issue-number> <status-label>
  start <issue-number>
  resume <issue-number>
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
    if (command === "project-sync" && arg) return projectSync(arg);
    if (command === "queue") return queue();
    if (command === "reconcile") return reconcile();
    if (command === "status" && arg && argv[2]) return status(arg, argv[2]);
    if (command === "start" && arg) return start(arg);
    if (command === "resume" && arg) return resume(arg);
    if (command === "spec" && arg) return spec(arg);
    if (command === "spec-check" && arg) return specCheck(arg);
    if (command === "qa-check" && arg) return qaCheck(arg);
    if (command === "pr" && arg) return createPr(arg);
    if (command === "merge" && arg) return mergePr(arg);
    if (command === "close" && arg && secondArg)
      return closeIssue(arg, secondArg);
    if (command === "cleanup" && arg && secondArg)
      return cleanup(arg, secondArg);
    usage();
    process.exit(2);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: "error",
          message: error.message,
          ...(error.resumeDiagnostics || {}),
          ...(error.projectDiagnostics || {}),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  assertIssueStatus,
  blockedFromLabels,
  branchForIssue,
  checkStateFailures,
  checkoutFailures,
  dependencyNumbers,
  defaultWorktreeRoot,
  issueSlug,
  listCheckState,
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
};
