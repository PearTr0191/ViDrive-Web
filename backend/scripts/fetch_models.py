#!/usr/bin/env python3
"""Model-artifact fetcher for Render deploys.

Reads backend/data/models/MODELS_VERSION.json:
  source="repo"    -> git-blob pickles are authoritative; nothing to do.
  source="release" -> download assets from the tagged GitHub Release, verify
                      sha256, sanity-load via joblib, and drop an installed-
                      version marker so repeat steps can skip.

Public repo: release assets download without a token. A failure exits 1 so a
broken deploy fails loudly instead of silently serving stale or missing models.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import joblib
import requests

MODELS_DIR = Path(__file__).resolve().parent.parent / "data" / "models"
MANIFEST_PATH = MODELS_DIR / "MODELS_VERSION.json"
MARKER_PATH = MODELS_DIR / ".installed_version"

GITHUB_REPO = os.environ.get("GITHUB_REPO", "PearTr0191/ViDrive-Web")


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    source = manifest.get("source", "repo")
    version = manifest.get("version", "unknown")

    if source == "repo":
        print(f"models: using repo blobs ({version}) — nothing to fetch")
        return 0

    if source != "release":
        print(f"models: unknown manifest source '{source}'")
        return 1

    if MARKER_PATH.exists() and MARKER_PATH.read_text(encoding="utf-8").strip() == version:
        print(f"models: {version} already installed")
        return 0

    assets = manifest.get("assets", {})
    checksums = manifest.get("sha256", {})
    if not assets:
        print("models: release manifest has no assets")
        return 1

    for name in assets:
        url = f"https://github.com/{GITHUB_REPO}/releases/download/{version}/{name}"
        dest = MODELS_DIR / name
        print(f"models: downloading {url}")
        resp = requests.get(url, timeout=300, stream=True)
        if resp.status_code != 200:
            print(f"models: download failed HTTP {resp.status_code} for {name}")
            return 1
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(1 << 20):
                fh.write(chunk)
        digest = sha256_of(tmp)
        expected = checksums.get(name)
        if expected and digest != expected:
            print(f"models: sha256 mismatch for {name} ({digest} != {expected})")
            tmp.unlink(missing_ok=True)
            return 1
        joblib.load(tmp)  # sanity: the pickle must deserialize in THIS environment
        tmp.replace(dest)
        print(f"models: installed {name} ({digest[:12]}…)")

    MARKER_PATH.write_text(version, encoding="utf-8")
    print(f"models: {version} installed OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
