#!/usr/bin/env python3
"""Print basic hints for sign/token/ciphertext-looking strings."""

from __future__ import annotations

import argparse
import re


HEX_RE = re.compile(r"^[0-9a-fA-F]+$")
B64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
URL_B64_RE = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")


def hints(value: str) -> list[str]:
    result: list[str] = []
    length = len(value)
    if HEX_RE.fullmatch(value):
        result.append("hex alphabet")
        if length == 32:
            result.append("md5-like length")
        elif length == 40:
            result.append("sha1-like length")
        elif length == 64:
            result.append("sha256-like length")
        elif length % 32 == 0:
            result.append("block/ciphertext-like hex length")
    elif B64_RE.fullmatch(value):
        result.append("base64-like alphabet")
    elif URL_B64_RE.fullmatch(value):
        result.append("urlsafe-base64-like alphabet")
    else:
        result.append("custom or mixed alphabet")

    if "." in value:
        result.append("dot-framed value")
    if "-" in value or "_" in value:
        result.append("url-safe separators present")
    if length >= 120:
        result.append("long artifact; check envelope, RSA, compressed payload, or packed telemetry")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Fingerprint a suspicious protocol value.")
    parser.add_argument("value")
    args = parser.parse_args()
    print(f"length={len(args.value)}")
    for hint in hints(args.value):
        print(f"- {hint}")


if __name__ == "__main__":
    main()
