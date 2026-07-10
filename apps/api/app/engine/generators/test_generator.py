"""Test Generator — creates pytest skeleton files for uncovered service modules.

Scans `app/services/` and `app/api/v1/` for Python files that don't have a
corresponding file under `tests/`. Writes skeleton test files that can be
filled in by developers or an AI agent.

Output: `tests/generated/<module_name>_test.py`
"""
from __future__ import annotations

import ast
from pathlib import Path


class TestGenerator:
    """Generates pytest skeleton files for modules missing test coverage."""

    SERVICES_GLOB = "app/services/**/*.py"
    API_GLOB = "app/api/v1/*.py"

    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root
        self.api_root = project_root / "apps" / "api"
        self.tests_dir = self.api_root / "tests" / "generated"

    def run(self) -> list[Path]:
        """Generate skeleton test files for uncovered modules. Returns list of new files."""
        if not self.api_root.exists():
            return []

        self.tests_dir.mkdir(parents=True, exist_ok=True)
        existing_tests = {p.name for p in self.tests_dir.glob("*.py")}

        generated: list[Path] = []
        for src_file in self._find_uncovered_sources(existing_tests):
            out_path = self.tests_dir / f"test_{src_file.stem}.py"
            skeleton = self._build_skeleton(src_file)
            if skeleton:
                out_path.write_text(skeleton)
                generated.append(out_path)

        return generated

    def _find_uncovered_sources(self, existing_tests: set[str]) -> list[Path]:
        candidates: list[Path] = []
        api_root = self.api_root

        for glob in (self.SERVICES_GLOB, self.API_GLOB):
            for f in api_root.glob(glob):
                if f.name.startswith("_"):
                    continue
                test_name = f"test_{f.stem}.py"
                if test_name not in existing_tests:
                    candidates.append(f)

        return candidates

    def _build_skeleton(self, src_file: Path) -> str:
        """Return a skeleton pytest file for the given source file."""
        try:
            source = src_file.read_text()
            tree = ast.parse(source)
        except (OSError, SyntaxError):
            return ""

        functions = [
            node.name
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and not node.name.startswith("_")
        ]

        classes = [
            node.name
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef)
        ]

        if not functions and not classes:
            return ""

        rel = src_file.relative_to(self.api_root)
        module_path = str(rel).replace("/", ".").removesuffix(".py")

        lines = [
            f'"""Auto-generated skeleton tests for {module_path}.',
            "",
            "Fill in these stubs with real assertions.",
            "DO NOT commit this file without meaningful test bodies.",
            '"""',
            "from __future__ import annotations",
            "",
            "import pytest",
            "",
        ]

        if functions:
            lines += [
                f"# Functions detected: {', '.join(functions[:10])}",
                "",
            ]

        for cls in classes[:5]:
            lines += [
                f"class Test{cls}:",
                '    """Skeleton tests for {cls}."""',
                "",
                "    def test_placeholder(self) -> None:",
                '        """Replace with a real test."""',
                "        assert True",
                "",
            ]

        if not classes and functions:
            for fn in functions[:8]:
                is_async = False
                try:
                    for node in ast.walk(ast.parse(src_file.read_text())):
                        if isinstance(node, ast.AsyncFunctionDef) and node.name == fn:
                            is_async = True
                            break
                except (OSError, SyntaxError):
                    pass

                if is_async:
                    lines += [
                        f"@pytest.mark.asyncio",
                        f"async def test_{fn}() -> None:",
                        f'    """Skeleton test for {fn}."""',
                        "    assert True",
                        "",
                    ]
                else:
                    lines += [
                        f"def test_{fn}() -> None:",
                        f'    """Skeleton test for {fn}."""',
                        "    assert True",
                        "",
                    ]

        return "\n".join(lines)

    def coverage_gaps(self) -> list[dict]:
        """Return list of {module, test_file} for uncovered modules (no disk writes)."""
        if not self.api_root.exists():
            return []
        existing = {p.name for p in self.tests_dir.glob("*.py")} if self.tests_dir.exists() else set()
        return [
            {"module": str(f.relative_to(self.api_root)), "missing_test": f"test_{f.stem}.py"}
            for f in self._find_uncovered_sources(existing)
        ]
