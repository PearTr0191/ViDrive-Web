"""Scrape old Toyota Fortuner listings (age >= 8) from oto.com.vn and bonbanh.com.vn.

Goal: find real deep-tail (y8+) Fortuner resale observations to fix the
parametric extrapolation over-prediction at y14 (predicted 0.526 vs real 0.313).

Outputs candidate records; merging into training_data.json is a separate step
so we can eyeball matches before committing.

Usage:
    python scrape_fortuner_tail.py
"""
import json
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import (  # noqa: E402
    parse_oto_text, parse_bonbanh_text, find_new_price, load_cars_json,
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}
from pipeline_common import CURRENT_YEAR
MIN_AGE = 8  # only care about deep-tail to fix y14 over-prediction


def try_get(url: str, timeout: int = 25):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.content.decode("utf-8")
    except Exception as e:
        print(f"  ERR {url}: {e}")
    return None


def main() -> None:
    cars_data = load_cars_json()
    candidates = []

    # --- oto.com.vn: direct brand/model path ---
    print("=== oto.com.vn/toyota-fortuner ===")
    for page in range(1, 12):
        url = f"https://oto.com.vn/mua-ban-xe-toyota-fortuner?page={page}"
        text = try_get(url)
        if text is None:
            break
        lsts = parse_oto_text(text)
        if not lsts:
            print(f"  page {page}: 0 listings (stop)")
            break
        old = [l for l in lsts if CURRENT_YEAR - l["year"] >= MIN_AGE]
        print(f"  page {page}: {len(lsts)} listings, {len(old)} age>={MIN_AGE}")
        for l in old:
            msrp = find_new_price(l["brand"], l["model"], cars_data)
            if msrp is None:
                continue
            rp = l["price"] / msrp
            if 0.10 <= rp <= 0.95:
                candidates.append({
                    "source": "oto", "brand": l["brand"], "model": l["model"],
                    "segment": l["segment"], "car_type": l["car_type"],
                    "year": l["year"], "age": CURRENT_YEAR - l["year"],
                    "price": int(msrp), "resale_value": int(l["price"]),
                    "resale_pct": round(rp, 4), "annual_km": l["mileage_km"],
                })
        time.sleep(0.3)

    # --- bonbanh.com.vn ---
    print("=== bonbanh.com/oto/toyota/fortuner ===")
    for page in range(1, 12):
        url = f"https://bonbanh.com/oto/toyota/fortuner/page/{page}" if page > 1 else \
              "https://bonbanh.com/oto/toyota/fortuner"
        text = try_get(url)
        if text is None:
            break
        lsts = parse_bonbanh_text(text)
        if not lsts:
            print(f"  page {page}: 0 listings (stop)")
            break
        old = [l for l in lsts if CURRENT_YEAR - l["year"] >= MIN_AGE]
        print(f"  page {page}: {len(lsts)} listings, {len(old)} age>={MIN_AGE}")
        for l in old:
            msrp = find_new_price(l["brand"], l["model"], cars_data)
            if msrp is None:
                continue
            rp = l["price"] / msrp
            if 0.10 <= rp <= 0.95:
                candidates.append({
                    "source": "bonbanh", "brand": l["brand"], "model": l["model"],
                    "segment": l["segment"], "car_type": l["car_type"],
                    "year": l["year"], "age": CURRENT_YEAR - l["year"],
                    "price": int(msrp), "resale_value": int(l["price"]),
                    "resale_pct": round(rp, 4), "annual_km": l["mileage_km"],
                })
        time.sleep(0.3)

    print(f"\n=== {len(candidates)} candidate Fortuner deep-tail records ===")
    for c in sorted(candidates, key=lambda x: x["age"]):
        print(f"  {c['source']} y{c['year']} (age {c['age']}) ret={c['resale_pct']:.3f} "
              f"msrp={c['price']:,} list={c['resale_value']:,} km={c['annual_km']} type={c['car_type']}")

    out = HERE / "fortuner_tail_candidates.json"
    out.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
