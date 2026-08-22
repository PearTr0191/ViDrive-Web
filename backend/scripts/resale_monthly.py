#!/usr/bin/env python3
"""Monthly resale-data refresh driver (bonbanh source, requests-based).

Scrapes page-1 bonbanh listings for every catalogue car, converts them to
real training records with strict filters (brand + tolerant model match,
retention band 0.15-0.95, valid age/km), deduplicates against
data/models/bonbanh_real.json, and merges atomically.

training_data.json is NEVER touched here — it must stay pure-ORIG (leakage
precondition enforced by the stress gate).

Exit codes:
  0 = merged (or nothing new); caller proceeds to gate
  4 = fatal (scrape layer returned nothing at all)
"""
from __future__ import annotations

import json
import sys
import time
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
MODELS_DIR = BACKEND / "data" / "models"
CARS_PATH = BACKEND / "data" / "cars.json"
REAL_PATH = MODELS_DIR / "bonbanh_real.json"

sys.path.insert(0, str(MODELS_DIR))

from multi_source_scraper import parse_bonbanh_text  # noqa: E402
from catalogue_watch import (  # noqa: E402
    _fetch, _model_matches, _slug, _slug_candidates,
)

CURRENT_YEAR = date.today().year
RETENTION_BAND = (0.15, 0.95)
MAX_AGE_YEARS = 25
REQUEST_SLEEP = 0.35


def to_real_record(lst: dict, car_id: str, msrp: int) -> dict | None:
    """Filter + convert one listing into a real record (gate-compatible shape)."""
    price, year = lst.get("price"), lst.get("year")
    km = lst.get("km") or lst.get("mileage")
    if not price or not year:
        return None
    retention = float(price) / msrp
    if not RETENTION_BAND[0] < retention < RETENTION_BAND[1]:
        return None
    age = CURRENT_YEAR - year
    if not 1 <= age <= MAX_AGE_YEARS:
        return None
    if km is not None and (not isinstance(km, (int, float)) or km <= 0):
        return None
    rec = {
        "brand": lst["brand"],
        "model": lst.get("model", ""),
        "year": year,
        "years": age,
        "price": msrp,
        "resale_pct": round(retention, 4),
        "annual_km": int(km) if km else 15000,
        "source": "bonbanh",
    }
    return rec


def dedupe_key(rec: dict) -> tuple:
    return (rec["brand"], rec["model"], rec["year"], rec["resale_pct"], rec["annual_km"])


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cars = json.loads(CARS_PATH.read_text(encoding="utf-8"))
    existing_raw = json.loads(REAL_PATH.read_text(encoding="utf-8")) if REAL_PATH.exists() else []
    seen = {(r.get("brand"), r.get("model"), r.get("year"), r.get("resale_pct"), r.get("annual_km"))
            for r in existing_raw}

    added, scanned_any = [], False
    for car_id, car in cars.items():
        msrp = car["price"]
        for slug_candidate in _slug_candidates(car["model"]):
            url = f"https://bonbanh.com/oto/{_slug(car['brand'])}/{slug_candidate}"
            text = _fetch(url)
            time.sleep(REQUEST_SLEEP)
            if text is None:
                continue
            listings = parse_bonbanh_text(text)
            if not listings:
                continue
            scanned_any = True
            for lst in listings:
                if lst.get("brand") != car["brand"]:
                    continue
                if not _model_matches(lst.get("model", ""), car["model"]):
                    continue
                rec = to_real_record(lst, car_id, msrp)
                if rec is None:
                    continue
                k = dedupe_key(rec)
                if k in seen:
                    continue
                seen.add(k)
                rec["matched_car_id"] = car_id
                added.append(rec)
            break

    if not scanned_any:
        print("FATAL: scrape layer returned zero pages across the whole catalogue")
        return 4

    print(f"new unique real records: {len(added)}")
    if added:
        merged = existing_raw + added
        tmp = REAL_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(REAL_PATH)
        print(f"merged -> {REAL_PATH.name} ({len(existing_raw)} -> {len(merged)})")
    else:
        print("nothing new to merge")
    return 0


if __name__ == "__main__":
    sys.exit(main())
