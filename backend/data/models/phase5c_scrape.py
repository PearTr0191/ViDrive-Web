"""Phase 5C: scrape REAL used-car listings from bonbanh.com/oto?page=N and build a
mileage-aware real dataset (brand, segment, car_type, years, annual_km, resale_pct).

This complements Phase 5 (which failed its synthetic-holdout gate). The sophistication
upgrade: real listings carry ACTUAL mileage, giving the ML model km->retention signal
that the synthetic ORIG data (year-only retention) cannot provide. oto.com.vn is skipped
(it needs Playwright innerText; raw HTML is not parseable).

Usage:
    python phase5c_scrape.py 120   # scrape up to 120 pages
"""
import json
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import parse_bonbanh_text, load_cars_json, find_new_price  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}
CURRENT_YEAR = 2026
OUT_FILE = HERE / "bonbanh_real.json"
RETENTION_LO, RETENTION_HI = 0.15, 0.95
MAX_ANNUAL_KM = 100_000
MIN_ANNUAL_KM = 5_000

N_PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 120


def scrape_page(page_no: int) -> list[dict]:
    url = f"https://bonbanh.com/oto?page={page_no}"
    r = requests.get(url, headers=HEADERS, timeout=25)
    if r.status_code != 200:
        return []
    return parse_bonbanh_text(r.text)


def to_real_record(lst: dict, cars_data: dict) -> dict | None:
    brand, model = lst.get("brand"), lst.get("model", "")
    year = lst.get("year")
    if not year or year >= CURRENT_YEAR:
        return None
    msrp = find_new_price(brand or "", model, cars_data)
    if msrp is None:
        return None
    listing_price = lst.get("price")
    if not listing_price:
        return None
    rp = listing_price / msrp
    if not (RETENTION_LO <= rp <= RETENTION_HI):
        return None
    mileage = lst.get("mileage_km") or 0
    age = CURRENT_YEAR - year
    if mileage <= 0 or age <= 0:
        return None
    annual_km = min(MAX_ANNUAL_KM, max(MIN_ANNUAL_KM, mileage // age))
    seg = lst.get("segment") or "C-Sedan"
    return {
        "brand": brand,
        "model": model,
        "segment": seg,
        "car_type": lst.get("car_type", "ICE"),
        "price": int(msrp),
        "years": age,
        "annual_km": annual_km,
        "resale_value": int(listing_price),
        "resale_pct": round(rp, 6),
        "source": "bonbanh",
    }


def main() -> None:
    cars_data = load_cars_json()
    out: dict[str, dict] = {}
    matched_total = 0
    for p in range(1, N_PAGES + 1):
        try:
            lsts = scrape_page(p)
        except Exception as e:  # network hiccup on a single page is fine
            print(f"page {p}: ERR {e}")
            time.sleep(0.5)
            continue
        added = 0
        for lst in lsts:
            rec = to_real_record(lst, cars_data)
            if rec is None:
                continue
            key = (rec["brand"], rec["model"], rec["years"], rec["annual_km"])
            out[key] = rec
            added += 1
        matched_total += added
        if p % 20 == 0:
            print(f"  page {p}: +{added} new (running unique matches: {len(out)})")
        if added == 0 and len(out) >= 200:
            # sparse pages after enough data gathered — keep going but slow down
            pass
        time.sleep(0.3)

    records = list(out.values())
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    print(f"DONE. unique real records: {len(records)}  (raw matched: {matched_total}) -> {OUT_FILE}")
    # quick stats
    from collections import Counter
    by_type = Counter(r["car_type"] for r in records)
    by_brand = Counter(r["brand"] for r in records)
    pcts = [r["resale_pct"] for r in records]
    kms = [r["annual_km"] for r in records]
    yrs = [r["years"] for r in records]
    print("car_type:", dict(by_type))
    print("top brands:", by_brand.most_common(8))
    print(
        "resale_pct: min=%.3f med=%.3f max=%.3f"
        % (min(pcts), sorted(pcts)[len(pcts) // 2], max(pcts))
    )
    print(
        "annual_km: min=%d med=%d max=%d"
        % (min(kms), sorted(kms)[len(kms) // 2], max(kms))
    )
    print("years: min=%d med=%d max=%d" % (min(yrs), sorted(yrs)[len(yrs) // 2], max(yrs)))


if __name__ == "__main__":
    main()
