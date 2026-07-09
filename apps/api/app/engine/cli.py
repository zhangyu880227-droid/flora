"""
Flora Self-Improvement Engine — CLI entry point.

Usage (from apps/api/):
    python -m app.engine                        # scan with auto-detected root
    python -m app.engine --root /path/to/Flora  # explicit root
    python -m app.engine --verbose              # debug logging
    python -m app.engine --dry-run              # scan only, don't write files
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="flora-engine",
        description="Flora Self-Improvement Engine — scan, detect, improve.",
    )
    parser.add_argument("--root", type=str, help="Project root directory (auto-detected if omitted)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Debug logging")
    parser.add_argument("--dry-run", action="store_true", help="Scan only — do not write any output files")
    args = parser.parse_args(argv)

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%H:%M:%S")

    from .core import SelfImprovementEngine

    root = Path(args.root).resolve() if args.root else None
    engine = SelfImprovementEngine(project_root=root)

    _banner(engine.project_root)

    if args.dry_run:
        print("  [dry-run] scanning without writing output files…\n")
        files = engine.scanner.scan()
        findings = []
        for analyzer in engine.analyzers:
            try:
                findings.extend(analyzer.analyze(files))
            except Exception as e:
                print(f"  [warn] {analyzer.name}: {e}")
        _print_summary(files, findings)
        return 0

    result = engine.run()

    _print_summary(result, result.findings)
    print(f"\n  Output files updated:")
    print(f"    {engine.project_root}/PROJECT_STATUS.md")
    print(f"    {engine.project_root}/ATLAS.md")
    print(f"    {engine.flora_dir}/atlas.json")
    print(f"    {engine.flora_dir}/tasks.json\n")
    return 0


def _banner(root: Path) -> None:
    print()
    print("  ┌─────────────────────────────────────────┐")
    print("  │   Flora Self-Improvement Engine v1.0    │")
    print("  └─────────────────────────────────────────┘")
    print(f"  Root: {root}")
    print()


def _print_summary(result_or_files, findings) -> None:
    from .scanner import ScannedFile
    from .models import ScanResult

    if isinstance(result_or_files, ScanResult):
        r = result_or_files
        print(f"\n  Scan {r.scan_id} complete in {r.duration_seconds:.1f}s")
        print(f"  Files scanned : {r.files_scanned}")
    else:
        print(f"\n  Files scanned : {len(result_or_files)}")

    print(f"  Findings      : {len(findings)}")

    by_sev: dict[str, int] = {}
    for f in findings:
        by_sev[f.severity] = by_sev.get(f.severity, 0) + 1

    for sev in ("critical", "high", "medium", "low"):
        count = by_sev.get(sev, 0)
        if count:
            bar = "█" * min(count, 30)
            print(f"  {sev:10} {bar} {count}")


if __name__ == "__main__":
    sys.exit(main())
