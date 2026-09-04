#!/usr/bin/env python3
"""Compare two public-safe protocol samples as JSON or text."""

from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path
from typing import Any


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def parse_json(text: str) -> Any | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def flatten(value: Any, prefix: str = "$") -> dict[str, str]:
    rows: dict[str, str] = {}
    if isinstance(value, dict):
        for key in sorted(value):
            rows.update(flatten(value[key], f"{prefix}.{key}"))
        return rows
    if isinstance(value, list):
        for index, item in enumerate(value):
            rows.update(flatten(item, f"{prefix}[{index}]"))
        return rows
    rows[prefix] = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return rows


def compare_json(left: Any, right: Any, limit: int) -> int:
    left_map = flatten(left)
    right_map = flatten(right)
    keys = sorted(set(left_map) | set(right_map))
    diffs: list[str] = []
    for key in keys:
        if key not in right_map:
            diffs.append(f"left_only {key} = {left_map[key]}")
        elif key not in left_map:
            diffs.append(f"right_only {key} = {right_map[key]}")
        elif left_map[key] != right_map[key]:
            diffs.append(f"changed {key}\n  left:  {left_map[key]}\n  right: {right_map[key]}")

    print("mode=json")
    print(f"diff_count={len(diffs)}")
    for row in diffs[:limit]:
        print(f"- {row}")
    return 0 if not diffs else 1


def compare_text(left: str, right: str, limit: int) -> int:
    diff = list(difflib.unified_diff(left.splitlines(), right.splitlines(), fromfile="left", tofile="right", lineterm=""))
    print("mode=text")
    print(f"diff_lines={len(diff)}")
    for row in diff[:limit]:
        print(row.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8", errors="replace"))
    return 0 if not diff else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare two JSON/text protocol samples.")
    parser.add_argument("left")
    parser.add_argument("right")
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args()

    left_text = read_text(Path(args.left))
    right_text = read_text(Path(args.right))
    left_json = parse_json(left_text)
    right_json = parse_json(right_text)

    if left_json is not None and right_json is not None:
        raise SystemExit(compare_json(left_json, right_json, args.limit))
    raise SystemExit(compare_text(left_text, right_text, args.limit))


if __name__ == "__main__":
    main()
