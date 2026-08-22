#!/usr/bin/env python3
"""Catalogue drift watcher: compares fresh bonbanh listing prices vs cars.json MSRP.

SIGNAL ONLY — this script never edits data files. It emits a markdown report
(stdout or --out FILE) listing:
  - used-listing retention outliers vs the car's calibrated anchors (or segment
    peers when unanchored), and
  - current-model-year listings priced away from catalogue MSRP (MSRP drift).

The human path for acting on a signal: `car_ops.py update-price ... --source-url
<official gia-niem-yet page>` in a reviewed PR.

Exit codes: 0 = report produced, 1 = fatal (no listings fetched at all).
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests

BACKEND = Path(__file__).resolve().parent.parent
MODELS_DIR = BACKEND / "data" / "models"
sys.path.insert(0, str(MODELS_DIR))
sys.path.insert(0, str(BACKEND))

from multi_source_scraper import _norm, parse_bonbanh_text  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
}
RETENTION_OUTLIER = 0.25   # flag when median retention deviates this much from anchor
MSRP_DRIFT = 0.05          # flag current-year listings priced >5 pct off MSRP
REQUEST_SLEEP = 0.3
CURRENT_YEAR = date.today().year


def _slug(token: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", token.lower()).strip("-")


def _fetch(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=25)
        if resp.status_code == 200:
            return resp.content.decode("utf-8", errors="replace")
    except requests.RequestException as exc:
        print(f"  ERR {url}: {exc}", file=sys.stderr)
    return None


def _model_tokens(model: str) -> list[str]:
    """Candidate bonbanh model slugs for a catalogue model name."""
    norm = re.sub(r"[^A-Za-z0-9 ]", " ", model).split()
    if not norm:
        return []
    first = _slug(norm[0])
    candidates = [first]
    if len(norm) > 1:
        candidates.append(f"{first}-{_slug(norm[1])}")
    return candidates


def _model_matches(lst_model: str, catalog_model: str) -> bool:
    """Containment match tolerant of the scraper clipping model names.

    parse_bonbanh_text's extract_model sometimes clips the lead word of the
    model ("Camry 2.5 HEV" -> "ry 2 5 HEV"), so plain containment fails.
    Tolerance covers ONLY that clip pattern: the catalogue's first token ends
    with the listing's first token AND they are not identical ('camry' ~ 'ry'
    passes; 'vf3' vs 'vf' fails both directions). When first tokens are EQUAL
    ('corolla' vs 'corolla', 'ranger' vs 'ranger'), siblings are everywhere,
    so require a distinguishing token (len>=3, e.g. trim/variant) to overlap.
    """
    a, b = _norm(lst_model), _norm(catalog_model)
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    tokens_a, tokens_b = a.split(), b.split()
    first_a, first_b = tokens_a[0], tokens_b[0]
    if len(first_a) < 2 or len(first_b) < 2:
        return False
    if first_b.endswith(first_a) and first_a != first_b:
        return True
    if first_a == first_b:
        # Sibling models share the series word ('ranger', 'corolla'): demand
        # the SUB-MODEL token to agree ('wildtrak' != 'raptor',
        # 'cross' != 'altis'), not merely a trim detail like '4x4'.
        if len(tokens_a) < 2 or len(tokens_b) < 2:
            return False
        return tokens_a[1] == tokens_b[1]
    return False


def _slug_candidates(model: str) -> list[str]:
    """bonbanh URL slugs to try, most-specific first.

    Models containing digits (VF 6, CX-5, X5) must never fall back to a
    purely-alphabetic slug: that lands on the brand's generic page whose
    listings span every sibling model.
    """
    has_digit = any(ch.isdigit() for ch in model)
    candidates = [c for c in _model_tokens(model)]
    if has_digit:
        candidates = [c for c in candidates if any(ch.isdigit() for ch in c)]
    return candidates


def scrape_car(brand: str, model: str) -> list[dict]:
    """Fetch page-1 bonbanh listings matching brand + tolerant model match."""
    for model_slug in _slug_candidates(model):
        url = f"https://bonbanh.com/oto/{_slug(brand)}/{model_slug}"
        text = _fetch(url)
        if text is None:
            continue
        listings = parse_bonbanh_text(text)
        kept = [
            lst for lst in listings
            if lst.get("brand") == brand and _model_matches(lst.get("model", ""), model)
        ]
        if kept:
            return kept
    return []


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def _nearest_anchor_deviation(retention: float, age: int, anchors: dict) -> float | None:
    if not anchors:
        return None
    years = sorted(int(y) for y in anchors)
    nearest = min(years, key=lambda y: abs(y - age))
    return abs(retention - float(anchors[str(nearest)] if str(nearest) in anchors
                                 else anchors[nearest]))


def watch(cars: dict, anchors: dict, limit: int | None) -> tuple[list[str], list[str]]:
    lines: list[str] = []
    drift: list[str] = []
    items = list(cars.items())[:limit] if limit else list(cars.items())
    for car_id, car in items:
        listings = scrape_car(car["brand"], car["model"])
        time.sleep(REQUEST_SLEEP)
        if not listings:
            lines.append(f"| {car_id} | {car['brand']} {car['model']} | 0 | — | no listings |")
            continue
        used = [lst for lst in listings if lst.get("year") and lst["year"] < CURRENT_YEAR]
        current_year = [lst for lst in listings if lst.get("year") == CURRENT_YEAR]
        retentions = [
            lst["price"] / car["price"]
            for lst in used
            if lst.get("price") and 0.05 < lst["price"] / car["price"] < 1.5
        ]
        note = "ok"
        if retentions:
            median_ret = _median(retentions)
            ages = [CURRENT_YEAR - lst["year"] for lst in used]
            median_age = max(1, int(round(_median([float(a) for a in ages]))))
            deviation = _nearest_anchor_deviation(
                median_ret, median_age, anchors.get(car_id, {}))
            if deviation is not None and deviation > RETENTION_OUTLIER:
                note = f"RETENTION OUTLIER (median {median_ret:.2f}, anchor gap {deviation:.2f})"
                drift.append(f"- **{car_id}**: used median retention {median_ret:.2f} "
                             f"deviates {deviation:.2f} from nearest calibrated anchor")
            else:
                note = f"used median {median_ret:.2f} (n={len(retentions)})"
        if current_year:
            new_prices = [lst["price"] for lst in current_year if lst.get("price")]
            if new_prices:
                new_median = _median([p / car["price"] for p in new_prices])
                if abs(new_median - 1.0) > MSRP_DRIFT:
                    note += f" | MSRP DRIFT (new-listing median {new_median:.2f}x MSRP)"
                    drift.append(f"- **{car_id}**: current-year listings median "
                                 f"{new_median:.2f}x catalogue MSRP — verify gia-niem-yet")
        lines.append(f"| {car_id} | {car['brand']} {car['model']} | {len(listings)} | {note} |")
    return lines, drift


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None,
                        help="only watch the first N catalogue cars (smoke tests)")
    parser.add_argument("--out", type=Path, default=None,
                        help="write the markdown report to this file")
    args = parser.parse_args()

    cars = json_load_cars()
    anchors = load_anchors()
    rows, drift = watch(cars, anchors, args.limit)

    report = [
        f"# Catalogue drift report {date.today().isoformat()}",
        "",
        f"Scanned {len(rows)} catalogue cars (bonbanh page-1 listings).",
        "",
        "| car_id | car | listings | status |",
        "|---|---|---|---|",
        *rows,
        "",
        "## Signals",
        "",
        *(drift if drift else ["None within tolerance."]),
        "",
        "Act via `car_ops.py update-price <car_id> --price N --source-url <official gia-niem-yet>`.",
    ]
    text = "\n".join(report)
    print(text)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    return 0


def json_load_cars() -> dict:
    return _load_json(BACKEND / "data" / "cars.json")


def _load_json(path: Path) -> dict:
    import json
    return json.loads(path.read_text(encoding="utf-8"))


def load_anchors() -> dict:
    import json
    raw = json.loads((BACKEND / "data" / "resale_anchors.json").read_text(encoding="utf-8"))
    raw.pop("_meta", None)
    return raw


if __name__ == "__main__":
    sys.exit(main())
