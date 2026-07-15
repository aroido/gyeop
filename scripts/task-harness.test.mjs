import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  branchForIssue,
  issueSlug,
  qaPathForIssue,
  qaFailures,
  slugify,
  specFailures,
  specPathForIssue,
  statusLabels,
} from "./task-harness.mjs";

const issue = {
  number: 123,
  title: "[Frontend] 방문자 3장 응답 화면 구현",
};

test("slugify creates stable branch-safe slugs", () => {
  assert.equal(slugify("[Frontend] Build visitor response flow!"), "frontend-build-visitor-response-flow");
  assert.equal(slugify("..."), "task");
});

test("issue paths and branch names are deterministic", () => {
  assert.equal(issueSlug(issue), "issue-123");
  assert.equal(branchForIssue(issue), "codex/issue-123");
  assert.equal(specPathForIssue(issue), "docs/specs/issue-123.md");
  assert.equal(qaPathForIssue(issue), "docs/temp/qa/issue-123.md");
});

test("status labels cover the task gate states", () => {
  assert.deepEqual(statusLabels, [
    "status:ready",
    "status:spec",
    "status:implementing",
    "status:qa",
    "status:blocked",
  ]);
});

test("spec gate accepts a complete reviewed GYEOP spec", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gyeop-spec-"));
  const file = path.join(dir, "spec.md");
  fs.writeFileSync(
    file,
    `# 스펙

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
`,
  );

  assert.deepEqual(specFailures(file), []);
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

