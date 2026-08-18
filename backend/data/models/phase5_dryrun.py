"""Phase 5 dry-run: fetch bonbanh.com.vn listing pages, parse, and report
how many training records would be added (without writing)."""
import re
import sys
import time
import json
from pathlib import Path
from collections import Counter

import requests

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import (  # noqa: E402
    parse_bonbanh_text, load_cars_json, find_new_price,
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
}
CURRENT_YEAR = 2026
N_PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 30


def main() -> None:
    cars_data = load_cars_json()
    existing = set(
        r["id"] for r in json.load(open(HERE / "training_data.json", encoding="utf-8"))
    )

    all_listings = []
    for p in range(1, N_PAGES + 1):
        try:
            r = requests.get(f"https://bonbanh.com/oto?page={p}", headers=HEADERS, timeout=20)
            if r.status_code != 200:
                print(f"page {p}: status {r.status_code}")
                continue
            listings = parse_bonbanh_text(r.text)
            all_listings.extend(listings)
        except Exception as e:  # pragma: no cover
            print(f"page {p}: ERR {e}")
        time.sleep(0.3)

    print(f"\nParsed used-car listings from {N_PAGES} pages: {len(all_listings)}")

    matched = 0
    unmatched = 0
    would_add = 0
    by_brand = Counter()
    samples = []
    resale_vals = []
    for lst in all_listings:
        age = CURRENT_YEAR - lst["year"]
        if age <= 0:
            continue
        np_ = find_new_price(lst["brand"], lst["model"], cars_data)
        if np_ is None:
            unmatched += 1
            continue  # no real MSRP -> skip (blanket fallback is too noisy)
        matched += 1
        rp = round(lst["price"] / np_, 4)
        # plausible used-car retention band; exclude near-new demos / implausible
        if rp < 0.2 or rp > 0.95:
            continue
        mileage = lst.get("mileage_km", 0)
        annual_km = min(100000, max(5000, mileage // age)) if mileage else 15000
        uid = f"{lst['id']}_{age}yr_{annual_km}km"
        if uid in existing:
            continue
        would_add += 1
        by_brand[lst["brand"]] += 1
        resale_vals.append(rp)
        if len(samples) < 14:
            samples.append((lst["brand"], lst["model"], lst["year"], age,
                           int(lst["price"]), int(np_), rp))

    print(f"Matched to cars.json MSRP: {matched} | unmatched (skipped): {unmatched}")
    print(f"Would ADD (matched, plausible, unique): {would_add}")
    print(f"By brand: {by_brand.most_common(20)}")
    if resale_vals:
        import statistics
        print(f"resale_pct: min={min(resale_vals):.3f} median={statistics.median(resale_vals):.3f} "
              f"mean={statistics.mean(resale_vals):.3f} max={max(resale_vals):.3f}")
    print("Samples (brand, model, mfy, age, used, msrp, ret%):")
    for s in samples:
        print("  ", s)


if __name__ == "__main__":
    main()
