"""Phase 5C-oto: scrape REAL used-car listings from oto.com.vn (search results)
and build a mileage-aware real dataset, the same shape as bonbanh_real.json.

Uses requests + the SSR HTML in the initial response (no Playwright needed):
  - URL: https://oto.com.vn/mua-ban-xe?page=N  (path/query pagination, ~15 cards)
  - cards are <div class="item-car ..."> with <span class="car-name">,
    <ul class="tag-list"> (mileage/fuel/trans/condition), <p class="price">.

Usage:
    python oto_scrape.py 30   # scrape up to 30 pages (~450 raw listings)
"""
import io
import json
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import parse_oto_text, load_cars_json, find_new_price  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}
from pipeline_common import CURRENT_YEAR
OUT_FILE = HERE / "oto_real.json"
RETENTION_LO, RETENTION_HI = 0.15, 0.95
MAX_ANNUAL_KM = 100_000
MIN_ANNUAL_KM = 5_000
MAX_PRICE = 5_000_000_000  # filter out commercial/land parcels masquerading as cars

N_PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 30


def fetch_page(page_no: int) -> str:
    url = "https://oto.com.vn/mua-ban-xe" if page_no == 1 else f"https://oto.com.vn/mua-ban-xe?page={page_no}"
    r = requests.get(url, headers=HEADERS, timeout=25)
    r.raise_for_status()
    # oto.com.vn does not reliably declare charset; decode raw UTF-8 bytes
    # (fuel glyphs mix HTML entities + UTF-8 bytes) so requests.text is unsafe.
    return r.content.decode("utf-8", errors="replace")


def to_real_record(lst: dict, cars_data: dict) -> dict | None:
    brand = lst.get("brand")
    model = lst.get("model", "")
    year = lst.get("year")
    if not year or year >= CURRENT_YEAR:
        return None
    msrp = find_new_price(brand or "", model, cars_data)
    if msrp is None:
        return None
    listing_price = lst.get("price")
    if not listing_price or listing_price <= 0 or listing_price > MAX_PRICE:
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
        "source": "oto",
    }


def main() -> None:
    cars_data = load_cars_json()
    out: dict[str, dict] = {}
    raw_total = 0
    for p in range(1, N_PAGES + 1):
        try:
            page_html = fetch_page(p)
        except Exception as e:
            print(f"page {p}: ERR {e}")
            time.sleep(0.5)
            continue
        lsts = parse_oto_text(page_html)
        raw_total += len(lsts)
        added = 0
        for lst in lsts:
            rec = to_real_record(lst, cars_data)
            if rec is None:
                continue
            key = (rec["brand"], rec["model"], rec["years"], rec["annual_km"])
            out[key] = rec
            added += 1
        if p % 5 == 0:
            print(f"  page {p}: +{added} real (running unique: {len(out)}), raw parsed: {raw_total}")
        time.sleep(0.3)

    records = list(out.values())
    with io.open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    print(f"DONE. unique real records: {len(records)} (raw parsed: {raw_total}) -> {OUT_FILE}")
    from collections import Counter
    print("car_type:", dict(Counter(r["car_type"] for r in records)))
    print("top brands:", Counter(r["brand"] for r in records).most_common(8))
    kms = [r["annual_km"] for r in records]
    yrs = [r["years"] for r in records]
    pcts = [r["resale_pct"] for r in records]
    print("years: min=%d med=%d max=%d" % (min(yrs), sorted(yrs)[len(yrs) // 2], max(yrs)))
    print("annual_km: min=%d med=%d max=%d" % (min(kms), sorted(kms)[len(kms) // 2], max(kms)))
    print("resale_pct: min=%.3f med=%.3f max=%.3f" % (min(pcts), sorted(pcts)[len(pcts) // 2], max(pcts)))


if __name__ == "__main__":
    main()
