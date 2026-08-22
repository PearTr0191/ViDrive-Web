"""Targeted, eyeball-first real-record scraper for the newly catalogued Hyundai
Palisade (palisade_2026) plus the 11 German cars already in cars.json but with
NO real resale records anywhere in the pipeline (training_data.json / bonbanh_real
/ oto_real / real_all / CALIBRATED_RESALE_ANCHORS) -> they currently fall through
to the contaminated parametric group curve.

Design (accuracy-first; zero fabrication):
  * Reuses the codebase's proven parsers (parse_oto_text / parse_bonbanh_text /
    to_real_record / find_new_price) so every resale_pct is a REAL bonbanh/oto
    observation matched to a REAL cars.json MSRP.
  * to_real_record returns None when find_new_price can't resolve MSRP -> the
    est_factor fallback in merge_into_training is NEVER triggered by this script.
  * segment is taken verbatim from cars.json (NOT infer_segment), because
    infer_segment's price-tier rule mis-sorts premium cars (e.g. BMW 320i @1.70B
    and C-Class @1.60B both fall to D-SUV). Retention values stay REAL; only the
    segment label is corrected to the catalog truth.
  * Eyeball-first: writes candidates to pal_german_candidates.json ONLY. Merging
    into training_data.json / real_all.json is a SEPARATE, manual step (mirrors
    the Fortuner precedent: scrape_fortuner_tail -> eyeball -> add_fortuner_tail).

Usage:
    python backend/data/models/scrape_palisade_german.py
"""
import json
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import (  # noqa: E402
    _norm,
    parse_bonbanh_text,
    parse_oto_text,
    find_new_price,
    load_cars_json,
)
from scrape_oto import to_real_record  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
}
from pipeline_common import CURRENT_YEAR
MAX_AGE = 12  # capture the full depreciation curve (y1..y12)

# (oto_slug, bonbanh_brand, bonbanh_model, catalog_id)
TARGETS = [
    ("hyundai-palisade", "hyundai", "palisade", "palisade_2026"),
    ("mercedes-c-class", "mercedes", "c-class", "cclass_2026"),
    ("mercedes-e-class", "mercedes", "e-class", "eclass_2026"),
    ("mercedes-glc", "mercedes", "glc", "glc_2026"),
    ("bmw-serie-3", "bmw", "3-series", "bmw3_2026"),
    ("bmw-serie-5", "bmw", "5-series", "bmw5_2026"),
    ("bmw-x3", "bmw", "x3", "x3_2026"),
    ("bmw-x5", "bmw", "x5", "x5_2026"),
    ("audi-a4", "audi", "a4", "a4_2026"),
    ("audi-a6", "audi", "a6", "a6_2026"),
    ("audi-q3", "audi", "q3", "q3_2026"),
    ("audi-q5", "audi", "q5", "q5_2026"),
]


def try_get(url: str, timeout: int = 25):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.content.decode("utf-8")
    except Exception as e:
        print(f"  ERR {url}: {e}")
    return None


def scrape_oto_for(slug: str, max_pages: int = 8) -> list[dict]:
    all_lsts: list[dict] = []
    for page in range(1, max_pages + 1):
        text = try_get(f"https://oto.com.vn/mua-ban-xe-{slug}?page={page}")
        if text is None:
            break
        lsts = parse_oto_text(text)
        if not lsts:
            break
        all_lsts.extend(lsts)
        if len(lsts) < 11:
            break  # last page reached
        time.sleep(0.2)
    return all_lsts


def scrape_bonbanh_for(brand: str, model: str, max_pages: int = 12) -> list[dict]:
    all_lsts: list[dict] = []
    for page in range(1, max_pages + 1):
        url = f"https://bonbanh.com/oto/{brand}/{model}"
        if page > 1:
            url += f"/page/{page}"
        text = try_get(url)
        if text is None:
            break
        lsts = parse_bonbanh_text(text)
        if not lsts:
            break
        all_lsts.extend(lsts)
        time.sleep(0.3)
    return all_lsts


def build_record(lst: dict, cid: str, cars_data: dict) -> dict | None:
    """Convert a raw scraped listing into a verified real record.

    Returns None (skip, no estimate) when MSRP is unresolvable, retention is
    outside 0.15..0.95, the car is too young/old, the brand/model don't match the
    target, or mileage/age are invalid. Every surviving record carries REAL market
    data only.
    """
    rec = to_real_record(lst, cars_data)
    if rec is None:
        return None
    age = CURRENT_YEAR - lst.get("year", 0)
    if not (1 <= age <= MAX_AGE):
        return None
    car = cars_data.get(cid, {})
    if lst.get("brand") != car.get("brand"):
        return None  # cross-brand page leakage
    # Keep only the target MODEL (oto/bonbanh pages can mix sibling models of the
    # same brand, e.g. a C-Class page listing an E-Class). shorter-in-longer
    # containment, same rule as find_new_price.
    cat_model = _norm(car.get("model", ""))
    lst_model = _norm(rec.get("model", ""))
    if cat_model and lst_model and not (lst_model in cat_model or cat_model in lst_model):
        return None
    # Accuracy: force catalog segment + car_type. infer_segment's price-tier rule
    # mis-sorts premium cars (e.g. BMW 320i @1.70B -> D-SUV). Retention stays REAL.
    seg = car.get("segment")
    if seg:
        rec["segment"] = seg
    rec["car_type"] = car.get("type", "ICE")
    return rec


def main() -> None:
    cars_data = load_cars_json()

    print("=== MSRP resolution (find_new_price) ===")
    for _, _, _, cid in TARGETS:
        car = cars_data.get(cid)
        msrp = car["price"] if car else None
        print(f"  {cid:14s} catalog_price={msrp}  -> {'OK' if msrp else 'MISSING(CATALOG ERR)'}")

    candidates: list[dict] = []
    by_car: dict[str, list[dict]] = {cid: [] for _, _, _, cid in TARGETS}

    print("\n=== oto.com.vn (primary) ===")
    for slug, _, _, cid in TARGETS:
        lsts = scrape_oto_for(slug)
        kept = 0
        for lst in lsts:
            rec = build_record(lst, cid, cars_data)
            if rec is None:
                continue
            rec["source"] = "oto"
            candidates.append(rec)
            by_car[cid].append(rec)
            kept += 1
        print(f"  {cid:14s} slug={slug:22s} raw={len(lsts):3d} kept={kept}")

    print("\n=== bonbanh.com.vn (secondary) ===")
    for slug, brand, model, cid in TARGETS:
        lsts = scrape_bonbanh_for(brand, model)
        kept = 0
        for lst in lsts:
            rec = build_record(lst, cid, cars_data)
            if rec is None:
                continue
            rec["source"] = "bonbanh"
            candidates.append(rec)
            by_car[cid].append(rec)
            kept += 1
        print(f"  {cid:14s} {brand}/{model:12s} raw={len(lsts):3d} kept={kept}")
        time.sleep(0.5)

    out = HERE / "pal_german_candidates.json"
    out.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n=== {len(candidates)} candidate records ===")
    for cid, recs in by_car.items():
        if recs:
            ages = sorted({r["years"] for r in recs})
            pcts = sorted({r["resale_pct"] for r in recs})
            srcs = sorted({s for s in (r["source"] for r in recs)})
            print(f"  {cid:14s} n={len(recs):3d} src={srcs} years={ages} "
                  f"pct[min={pcts[0]:.3f} max={pcts[-1]:.3f}]")
        else:
            print(f"  {cid:14s} n=0  -- NO real records found (will leave un-anchored)")
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
