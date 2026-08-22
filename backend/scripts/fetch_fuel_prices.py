#!/usr/bin/env python3
"""Fetch current Vietnamese retail fuel prices (vung 1) into assumptions.json.

Primary source: baomoi.com utility page (static HTML table of MoT-managed vung-1/vung-2
retail prices, refreshed every adjustment cycle). Cross-checks against webgia.com's
Petrolimex retail table when available (best-effort; gaps tolerated).

Only *_CURRENT_* constants are automated — the 5-year FORECAST values are human-
calibrated model assumptions and are never touched.

Exit codes:
  0 = NO_CHANGE   (prices unchanged beyond noise threshold)
  2 = UPDATED     (assumptions.json rewritten; caller should commit)
  3 = INVALID     (fetch/parse/validation failure; caller should open an issue)
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

import requests

BACKEND = Path(__file__).resolve().parent.parent
ASSUMPTIONS_PATH = BACKEND / "data" / "assumptions.json"

BAOMOI_URL = "https://baomoi.com/tien-ich-gia-xang-dau.epi"
WEBGIA_URL = "https://webgia.com/gia-xang-dau/petrolimex/"
SOURCE_NOTE = "MoT-managed vung-1 retail cycle (baomoi.com aggregate)"
NOISE_FRACTION = 0.005    # ignore sub-0.5% moves to avoid no-op commits
MAX_DELTA_FRACTION = 0.15  # larger jumps indicate a parse error, not a real adjustment
MIN_PRICE, MAX_PRICE = 10_000, 50_000

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
}

PRODUCT_KEYS = [
    ("RON_95_III", re.compile(r"E10\s*RON\s*95-III", re.IGNORECASE)),
    ("DO_05S_II", re.compile(r"DO\s*0?,?05S-II", re.IGNORECASE)),
]

KEY_MAP = {
    "RON_95_III": "PETROL_PRICE_CURRENT_VND",
    "DO_05S_II": "DIESEL_PRICE_CURRENT_VND",
}


def _cell_text(row_html: str) -> list[str]:
    cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.DOTALL)
    return [re.sub(r"<[^>]+>", "", c).strip() for c in cells]


def _parse_price(token: str) -> int | None:
    digits = re.sub(r"[^\d]", "", token.split()[0] if token else "")
    if not digits:
        return None
    return int(digits)


def _fetch_baomoi() -> dict[str, int]:
    resp = requests.get(BAOMOI_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text
    prices: dict[str, int] = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL):
        cells = _cell_text(row)
        # Rows may carry leading decorative cells (icons); locate the product
        # label by pattern, then read the NEXT cell as the vung-1 price.
        for idx, label in enumerate(cells):
            for product_key, pattern in PRODUCT_KEYS:
                if pattern.search(label) and product_key not in prices:
                    rest = [c for c in cells[idx + 1:] if c]
                    if rest:
                        price = _parse_price(rest[0])  # first value column = vung 1
                        if price is not None:
                            prices[product_key] = price
    return prices


def _fetch_webgia_crosscheck() -> dict[str, int]:
    """Best-effort cross-check; empty result is acceptable."""
    try:
        resp = requests.get(WEBGIA_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException:
        return {}
    prices: dict[str, int] = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", resp.text, re.DOTALL):
        cells = _cell_text(row)
        for idx, label in enumerate(cells):
            for product_key, pattern in PRODUCT_KEYS:
                if pattern.search(label) and product_key not in prices:
                    rest = [c for c in cells[idx + 1:] if c]
                    if rest:
                        price = _parse_price(rest[0])
                        if price is not None:
                            prices[product_key] = price
    return prices


def validate(prices: dict[str, int], current: dict[str, int]) -> list[str]:
    problems: list[str] = []
    for product_key, value in prices.items():
        if not MIN_PRICE <= value <= MAX_PRICE:
            problems.append(f"{product_key}={value} outside sanity band {MIN_PRICE}-{MAX_PRICE}")
            continue
        key = KEY_MAP[product_key]
        old = current.get(key)
        if old and abs(value - old) / old > MAX_DELTA_FRACTION:
            problems.append(f"{key}: fetched {value} vs current {old} "
                            f"(>{MAX_DELTA_FRACTION:.0%} jump suggests parse error)")
    missing = [pk for pk, _ in PRODUCT_KEYS if pk not in prices]
    if missing:
        problems.append(f"failed to parse required products from source: {missing}")
    return problems


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raw = json.loads(ASSUMPTIONS_PATH.read_text(encoding="utf-8"))
    meta = raw.setdefault("_meta", {})
    current = {KEY_MAP[pk]: raw[KEY_MAP[pk]] for pk, _ in PRODUCT_KEYS if KEY_MAP[pk] in raw}

    try:
        prices = _fetch_baomoi()
    except requests.RequestException as exc:
        print(f"INVALID: source fetch failed: {exc}")
        return 3

    cross = _fetch_webgia_crosscheck()
    for product_key, value in cross.items():
        mine = prices.get(product_key)
        if mine and abs(value - mine) / mine > 0.01:
            print(f"WARN: sources disagree on {product_key}: baomoi={mine} webgia={value}")

    problems = validate(prices, current)
    if problems:
        for problem in problems:
            print(f"INVALID: {problem}")
        return 3

    changed: dict[str, int] = {}
    for product_key, value in prices.items():
        key = KEY_MAP[product_key]
        old = raw.get(key)
        if old is None or abs(value - old) / max(old, 1) > NOISE_FRACTION:
            changed[key] = value

    if not changed:
        print("NO_CHANGE: all fetched prices within noise threshold")
        return 0

    for key, value in changed.items():
        old_value = raw.get(key)
        raw[key] = value
        entry = meta.get(key) if isinstance(meta.get(key), dict) else {}
        entry.update({
            "domain": "fuel",
            "verified_at": date.today().isoformat(),
            "source": BAOMOI_URL,
            "note": SOURCE_NOTE,
        })
        meta[key] = entry
        print(f"UPDATE {key}: {old_value} -> {value}")

    ASSUMPTIONS_PATH.write_text(
        json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"UPDATED: {len(changed)} price(s) written to assumptions.json")
    return 2


if __name__ == "__main__":
    sys.exit(main())
