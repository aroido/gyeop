#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
import tomllib
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
    "gyeop-product",
    "gyeop-question-pack-design",
    "gyeop-task",
}
EXPECTED_AGENTS = {
    "critic": ("gpt-5.6-sol", "xhigh"),
    "gyeop-core": ("gpt-5.6-sol", "xhigh"),
    "verifier": ("gpt-5.6-sol", "xhigh"),
}
EXPECTED_MOCKUPS = 7
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
        content = skill_file.read_text(encoding="utf-8")
        frontmatter = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
        if not frontmatter:
            fail(f"missing skill frontmatter: {skill_name}")
        metadata = frontmatter.group(1)
        if not re.search(rf"^name:\s*{re.escape(skill_name)}\s*$", metadata, re.MULTILINE):
            fail(f"skill name differs from folder: {skill_name}")
        if not re.search(r"^description:\s*\S", metadata, re.MULTILINE):
            fail(f"missing skill description: {skill_name}")
        if "TODO" in content:
            fail(f"unresolved TODO in {skill_file.relative_to(ROOT)}")


def read_toml(path: Path) -> dict[str, object]:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as error:
        fail(f"invalid TOML in {path.relative_to(ROOT)}: {error}")


def verify_model_routing() -> None:
    config = read_toml(ROOT / ".codex" / "config.toml")
    if (config.get("model"), config.get("model_reasoning_effort")) != (
        "gpt-5.6-terra",
        "low",
    ):
        fail("root Codex model must be gpt-5.6-terra with low reasoning effort")

    agents_root = ROOT / ".codex" / "agents"
    actual = {path.stem for path in agents_root.glob("*.toml")}
    if actual != set(EXPECTED_AGENTS):
        fail(f"agent files differ: expected={sorted(EXPECTED_AGENTS)} actual={sorted(actual)}")
    for name, expected in EXPECTED_AGENTS.items():
        agent = read_toml(agents_root / f"{name}.toml")
        if agent.get("name") != name:
            fail(f"agent name differs from filename: {name}")
        if (agent.get("model"), agent.get("model_reasoning_effort")) != expected:
            fail(f"agent model routing differs: {name}")
        for field in ("description", "developer_instructions"):
            if not isinstance(agent.get(field), str) or not agent[field].strip():
                fail(f"missing {field}: {name}")


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
    verify_model_routing()
    verify_mockups()
    verify_markdown_links()
    print("Project structure, model routing, SSOT documents, mockups, and local links are valid.")


if __name__ == "__main__":
    main()
