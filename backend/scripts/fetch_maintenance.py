#!/usr/bin/env python3
"""Maintenance menu watcher: derives expected annual maintenance from published
dealer/OEM service menus and records provenance — SIGNAL ONLY.

Sources (static-HTML verified 2026-08-22):
  - xe5s.vn VinFast family article: per-model per-visit cost + 5-year total ranges.

Known sources that do NOT work with plain requests (documented for future work):
  - vinfastcaugie.net tables are JS-rendered (needs Playwright).
  - toyota.com.vn "Bảng giá" PDF is the VEHICLE price list, not the service list.
  - pvoil.com.vn returns 403 to plain requests.

Derivation: annual_expected = mid(5yr_total_range) / 5 when available, else
mid(per_visit) * (REF_ANNUAL_KM / interval_km). Compared against cars.json
annual_maintenance; within ±DEVIATION_THRESHOLD counts as consistent.

Exit codes:
  0 = NO_CHANGE           (no car deviated; provenance refreshed where parsed)
  2 = PROVENANCE_UPDATED  (provenance written, all cars within tolerance)
  3 = PR_NEEDED           (>=1 car deviated beyond threshold; proposal printed)
  4 = INVALID             (no source yielded any parseable model)
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

import requests

BACKEND = Path(__file__).resolve().parent.parent
CARS_PATH = BACKEND / "data" / "cars.json"
SOURCES_PATH = BACKEND / "data" / "maintenance_sources.json"

REF_ANNUAL_KM = 12_500          # reference usage used to amortize per-visit costs
DEFAULT_INTERVAL_KM = 12_000    # VinFast service cadence when intervals unknown
DEVIATION_THRESHOLD = 0.25      # flag beyond ±25% vs current calibration

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
}

XE5S_URL = ("https://xe5s.vn/blog-xe/danh-gia-xe/chi-phi-bao-duong-xe-vinfast-"
            "vf3-vf5-vf6-vf7-vf8-den-vf9-va-limo-green-658.html")

MODEL_MAP = {  # article model token -> catalogue car_id candidates (checked vs cars.json)
    "VF3": ["vf3_2026"],
    "VF5": ["vf5_2026", "vf5plus_2026"],
    "VF6": ["vf6_2026"],
    "VF7": ["vf7_2026"],
    "VF8": ["vf8_2026"],
    "VF9": ["vf9_2026"],
}

_RANGE_VND = r"([\d.,]+)\s*(?:[–\-]|&ndash;|&ndash)\s*([\d.,]+)"
_PER_VISIT_RE = re.compile(r"mỗi lần\s*:\s*" + _RANGE_VND + r"\s*VNĐ")
# Sections state the model's OWN 5-year total first, then comparisons ("So với ...
# xăng ... 30–40 triệu"). Separator may be ':', '≈' or 'khoảng' — capture all and
# take the first.
_TOTAL_5Y_RE = re.compile(r"5 năm[^0-9]{0,24}" + _RANGE_VND + r"\s*triệu")
MAX_PLAUSIBLE_ANNUAL = 6_000_000  # beyond this the parse grabbed a comparison range


def _fetch(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            return resp.text
        print(f"  source {url} -> HTTP {resp.status_code}", file=sys.stderr)
    except requests.RequestException as exc:
        print(f"  source {url} failed: {exc}", file=sys.stderr)
    return None


def _strip_html(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    return html.unescape(re.sub(r"\s+", " ", text))


def _range_mid(lo: str, hi: str, scale: float = 1.0) -> float | None:
    def num(token: str) -> float | None:
        clean = token.replace(".", "").replace(",", "")
        return float(clean) * scale if clean else None

    low, high = num(lo), num(hi)
    if low is None or high is None or high < low:
        return None
    return (low + high) / 2


def parse_xe5s(page_html: str) -> dict[str, dict]:
    """Extract {model_token: {per_visit_mid, total_5y_mid}} from the article."""
    sections = re.split(r"<h[23][^>]*>", page_html)[1:]
    out: dict[str, dict] = {}
    for section in sections:
        title = _strip_html(section.split("</h")[0])
        match = re.search(r"VinFast\s+(VF\d+|Limo)", title)
        if not match:
            continue
        body = _strip_html(section.split("</h", 1)[1] if "</h" in section else section)
        record: dict = {}
        visit = _PER_VISIT_RE.search(body)
        if visit:
            record["per_visit_mid"] = _range_mid(visit.group(1), visit.group(2))
        totals = _TOTAL_5Y_RE.findall(body)
        if totals:
            first = _range_mid(totals[0][0], totals[0][1], scale=1_000_000)
            # A first-match implying more than any real EV maintenance cost means
            # either the model's own figure was phrased unusually or we grabbed a
            # comparison range. Keep it, but mark implausible so main() records
            # provenance WITHOUT emitting a change proposal.
            if first is not None:
                if first / 5 > MAX_PLAUSIBLE_ANNUAL:
                    record["total_5y_mid"] = None
                    record["implausible_total"] = round(first)
                else:
                    record["total_5y_mid"] = first
        if record:
            out[match.group(1)] = record
    return out


def derive_annual(record: dict) -> int | None:
    """Expected annual maintenance at REF_ANNUAL_KM from a parsed menu record."""
    total = record.get("total_5y_mid")
    if total:
        return round(total / 5)
    visit = record.get("per_visit_mid")
    if visit:
        visits_per_year = REF_ANNUAL_KM / DEFAULT_INTERVAL_KM
        return round(visit * visits_per_year)
    return None


def collect(cars: dict, wanted: set[str] | None) -> dict[str, dict]:
    """Fetch all sources; map parsed models onto catalogue ids present in `wanted`."""
    page = _fetch(XE5S_URL)
    if page is None:
        return {}
    parsed = parse_xe5s(page)
    results: dict[str, dict] = {}
    for model_token, candidate_ids in MODEL_MAP.items():
        stats = parsed.get(model_token)
        if not stats:
            continue
        implausible_total = stats.pop("implausible_total", None)
        annual = derive_annual(stats) if "total_5y_mid" in stats or "per_visit_mid" in stats else None
        if annual is None and implausible_total is None:
            continue
        for car_id in candidate_ids:
            if car_id in cars and (wanted is None or car_id in wanted):
                results[car_id] = {
                    "annual_expected_vnd": annual,
                    "method": "dealer_menu",
                    "source_url": XE5S_URL,
                    **({"flag": "implausible_source_total",
                        "implausible_source_value": implausible_total}
                       if implausible_total is not None else {}),
                }
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cars", default=None,
                        help="comma-separated car_ids to check (default: all matched)")
    parser.add_argument("--dry-run", action="store_true", help="never write files")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cars = json.loads(CARS_PATH.read_text(encoding="utf-8"))
    wanted = {c.strip() for c in args.cars.split(",")} if args.cars else None

    found = collect(cars, wanted)
    if not found:
        print("INVALID: no maintenance menu yielded any catalogue car")
        return 4

    registry = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    overrides = registry.get("_meta", {}).get("brand_overrides", {})
    today = date.today().isoformat()
    deviations: list[str] = []
    updated = False

    for car_id, entry in sorted(found.items()):
        flagged = "flag" in entry
        brand = cars[car_id].get("brand", "")
        adjustment = overrides.get(brand, 1.0)
        expected = round(entry["annual_expected_vnd"] * adjustment) if entry["annual_expected_vnd"] else None
        current = cars[car_id]["annual_maintenance"]
        deviation = abs(expected - current) / max(current, 1) if expected else None
        if flagged:
            status = f"FLAGGED ({entry.get('flag')}: source total {entry.get('implausible_source_value'):,})"
        elif deviation is not None and deviation > DEVIATION_THRESHOLD:
            status = "PR_NEEDED"
        else:
            status = "OK"
        detail = (f"{car_id}: derived {expected:,} vs current {current:,} "
                  f"(deviation {deviation:.0%})" if expected else f"{car_id}: no plausible derivation")
        print(f"{detail} -> {status}")
        if status == "PR_NEEDED" and expected:
            deviations.append(
                f"- **{car_id}**: menu-derived {expected:,} VND/yr vs "
                f"catalogue {current:,} ({deviation:.0%}) — evidence: {entry['source_url']}"
            )
        if not args.dry_run:
            registry[car_id] = {
                **{k: v for k, v in entry.items() if k != "annual_expected_vnd"},
                "annual_expected_vnd": expected,
                "invoice_adjustment": adjustment,
                "current_annual_maintenance": current,
                "deviation_vs_current": round(deviation, 4) if deviation is not None else None,
                "verified_at": today,
            }
            updated = True

    if updated and not args.dry_run:
        tmp = SOURCES_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n",
                       encoding="utf-8")
        tmp.replace(SOURCES_PATH)

    if deviations:
        print("\nPROPOSED PR CONTENT (apply manually via reviewed PR):\n"
              + "\n".join(deviations))
        return 3
    print("PROVENANCE_UPDATED" if updated and not args.dry_run else "NO_CHANGE")
    return 2 if updated and not args.dry_run else 0


if __name__ == "__main__":
    sys.exit(main())
