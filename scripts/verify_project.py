#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = [
    ROOT / "README.md",
    ROOT / "AGENTS.md",
    ROOT / ".codex" / "AGENTS.md",
    ROOT / "docs" / "product" / "core-feature-priority.md",
    ROOT / "docs" / "product" / "question-pack-spec.md",
    ROOT / "docs" / "product" / "decision-log.md",
    ROOT / "docs" / "product" / "full-product-plan.md",
    ROOT / "docs" / "templates" / "implementation-spec.md",
    ROOT / "docs" / "templates" / "qa-verdict.md",
    ROOT / "docs" / "engineering" / "github-task-workflow.md",
]
EXPECTED_SKILLS = {
    "gyeop-issue-writer",
    "gyeop-product-doc-writer",
    "gyeop-product-guardrails",
    "gyeop-question-pack-design",
    "gyeop-spec-writer",
    "gyeop-task",
    "gyeop-viral-flow-review",
}
EXPECTED_MOCKUPS = 6
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
IGNORED_DIRS = {".git", ".next", "coverage", "dist", "node_modules", "playwright-report", "test-results"}


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def verify_required_files() -> None:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED_FILES if not path.exists()]
    if missing:
        fail("missing required files: " + ", ".join(missing))


def verify_skills() -> None:
    skills_root = ROOT / ".codex" / "skills"
    actual = {path.name for path in skills_root.iterdir() if path.is_dir()}
    if actual != EXPECTED_SKILLS:
        fail(f"skill folders differ: expected={sorted(EXPECTED_SKILLS)} actual={sorted(actual)}")

    for skill_name in sorted(EXPECTED_SKILLS):
        skill_file = skills_root / skill_name / "SKILL.md"
        agent_file = skills_root / skill_name / "agents" / "openai.yaml"
        if not skill_file.exists() or not agent_file.exists():
            fail(f"incomplete skill structure: {skill_name}")
        if "TODO" in skill_file.read_text(encoding="utf-8"):
            fail(f"unresolved TODO in {skill_file.relative_to(ROOT)}")


def verify_mockups() -> None:
    mockups = sorted((ROOT / "docs" / "assets" / "mockups").glob("*.png"))
    if len(mockups) != EXPECTED_MOCKUPS:
        fail(f"expected {EXPECTED_MOCKUPS} mockups, found {len(mockups)}")


def verify_markdown_links() -> None:
    errors: list[str] = []
    for markdown in ROOT.rglob("*.md"):
        if any(part in IGNORED_DIRS for part in markdown.relative_to(ROOT).parts):
            continue
        text = markdown.read_text(encoding="utf-8")
        for raw_target in LINK_RE.findall(text):
            target = raw_target.strip().split(" ", 1)[0].strip("<>")
            if not target or target.startswith(("#", "http://", "https://", "mailto:", "data:", "app://")):
                continue
            target = target.split("#", 1)[0]
            resolved = Path(target) if target.startswith("/") else markdown.parent / target
            if not resolved.exists():
                errors.append(f"{markdown.relative_to(ROOT)} -> {raw_target}")
    if errors:
        fail("broken local markdown links:\n" + "\n".join(errors))


def main() -> None:
    verify_required_files()
    verify_skills()
    verify_mockups()
    verify_markdown_links()
    print("Project structure, SSOT documents, mockups, and local links are valid.")


if __name__ == "__main__":
    main()
