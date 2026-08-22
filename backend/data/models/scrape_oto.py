"""Phase 5D: scrape REAL used-car listings from oto.com.vn.

oto.com.vn uses direct URL paths per brand/model (e.g. /mua-ban-xe-toyota-vios).
The HTML is fully parseable — the earlier note about "Playwright needed" was
based on the generic ?page=N search which returns default results. Direct
brand/model paths return structured, real Vietnamese-market listings with
mileage, price, and year.

The oto.com.vn parser (parse_oto_text) is already implemented in
multi_source_scraper.py — this script just uses the right URL format.

Usage:
    python scrape_oto.py
"""
import json
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import parse_oto_text, find_new_price, load_cars_json  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}

OUT_FILE = HERE / "oto_real.json"
from pipeline_common import CURRENT_YEAR
RETENTION_LO, RETENTION_HI = 0.15, 0.95
MAX_ANNUAL_KM = 100_000
MIN_ANNUAL_KM = 5_000

# Brand-model URL slugs for Vietnamese-market cars in cars.json.
# Format: (url_keyword, display_name) — the URL path is /mua-ban-xe-{keyword}
BRAND_MODEL_SLUGS = [
    # Toyota
    ("toyota-vios", "Toyota Vios"),
    ("toyota-camry", "Toyota Camry"),
    ("toyota-fortuner", "Toyota Fortuner"),
    ("toyota-corolla-cross", "Toyota Corolla Cross"),
    ("toyota-yaris-cross", "Toyota Yaris Cross"),
    ("toyota-innova", "Toyota Innova"),
    ("toyota-veloz-cross", "Toyota Veloz Cross"),
    ("toyota-hilux", "Toyota Hilux"),
    ("toyota-raize", "Toyota Raize"),
    ("toyota-corolla-altis", "Toyota Corolla Altis"),
    # Honda
    ("honda-civic", "Honda Civic"),
    ("honda-city", "Honda City"),
    ("honda-crv", "Honda CR-V"),
    ("honda-br-v", "Honda BR-V"),
    ("honda-jazz", "Honda Jazz"),
    # Hyundai
    ("hyundai-creta", "Hyundai Creta"),
    ("hyundai-tucson", "Hyundai Tucson"),
    ("hyundai-santafe", "Hyundai Santa Fe"),
    ("hyundai-kona", "Hyundai Kona"),
    ("hyundai-elantra", "Hyundai Elantra"),
    ("hyundai-grand-i10", "Hyundai Grand i10"),
    ("hyundai-stargazer", "Hyundai Stargazer"),
    ("hyundai-custin", "Hyundai Custin"),
    # Kia
    ("kia-sportage", "Kia Sportage"),
    ("kia-seltos", "Kia Seltos"),
    ("kia-k3", "Kia K3"),
    ("kia-carens", "Kia Carens"),
    ("kia-sedona", "Kia Sedona"),
    ("kia-morning", "Kia Morning"),
    ("kia-sonet", "Kia Sonet"),
    # Mazda
    ("mazda3", "Mazda 3"),
    ("mazda-cx5", "Mazda CX-5"),
    ("mazda-cx30", "Mazda CX-30"),
    ("mazda-cx8", "Mazda CX-8"),
    # Ford
    ("ford-everest", "Ford Everest"),
    ("ford-ranger", "Ford Ranger"),
    ("ford-territory", "Ford Territory"),
    ("ford-focus", "Ford Focus"),
    # Mitsubishi
    ("mitsubishi-xpander", "Mitsubishi Xpander"),
    ("mitsubishi-outlander", "Mitsubishi Outlander"),
    ("mitsubishi-pajero-sport", "Mitsubishi Pajero Sport"),
    ("mitsubishi-xforce", "Mitsubishi Xforce"),
    ("mitsubishi-triton", "Mitsubishi Triton"),
    # VinFast
    ("vinfast-vf8", "VinFast VF8"),
    ("vinfast-vf9", "VinFast VF9"),
    ("vinfast-vf6", "VinFast VF6"),
    ("vinfast-vf7", "VinFast VF7"),
    ("vinfast-vf5", "VinFast VF5"),
    ("vinfast-vf3", "VinFast VF3"),
    ("vinfast-vsipping", "VinFast"),
    # Other brands
    ("honda-accord", "Honda Accord"),
    ("hyundai-palisade", "Hyundai Palisade"),
    ("kia-opic", "Kia"),
    ("subaru-forester", "Subaru Forester"),
    ("nissan-x-trail", "Nissan X-Trail"),
    ("nissan-almera", "Nissan Almera"),
    ("mg-zs", "MG ZS"),
    ("mg-hs", "MG HS"),
    ("mg-mg5", "MG MG5"),
    ("byd-atto3", "BYD Atto 3"),
    ("byd-seal", "BYD Seal"),
    ("omoda-c5", "Omoda C5"),
    ("jaecoo-7", "Jaecoo 7"),
    ("haval-h6", "Haval H6"),
    ("geely-ex5", "Geely EX5"),
]


def scrape_oto_listings(slug: str, max_pages: int = 8) -> list[dict]:
    """Scrape all listing pages for a given oto.com.vn brand/model slug."""
    url_base = f"https://oto.com.vn/mua-ban-xe-{slug}"
    all_listings = []

    for page in range(1, max_pages + 1):
        url = f"{url_base}?page={page}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
            if r.status_code != 200:
                break
            text = r.content.decode("utf-8")
            lsts = parse_oto_text(text)
            if not lsts:
                break
            all_listings.extend(lsts)
            print(f"  {slug} page {page}: +{len(lsts)} listings (total for this slug: {len(all_listings)})")
            if len(lsts) < 11:
                break  # last page
            time.sleep(0.2)
        except Exception as e:
            print(f"  {slug} page {page}: ERR {e}")
            break

    return all_listings


def to_real_record(lst: dict, cars_data: dict) -> dict | None:
    """Convert a scraped listing to a real training record."""
    brand = lst.get("brand")
    model = lst.get("model", "")
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

    return {
        "brand": brand,
        "model": model,
        "segment": lst.get("segment") or "C-Sedan",
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
    out: list[dict] = []
    seen: set = set()

    total_matched = 0
    total_unmatched = 0

    for slug, display in BRAND_MODEL_SLUGS:
        print(f"\n--- Scraping: {display} ({slug}) ---")
        lsts = scrape_oto_listings(slug)

        brand_matched = 0
        brand_unmatched = 0
        for lst in lsts:
            rec = to_real_record(lst, cars_data)
            if rec is None:
                brand_unmatched += 1
                continue

            key = (rec["brand"], rec["model"], rec["years"], rec["annual_km"])
            if key not in seen:
                seen.add(key)
                out.append(rec)
                brand_matched += 1
                total_matched += 1

        brand_unmatched += len(lsts) - brand_matched
        total_unmatched += brand_unmatched
        print(f"  -> {brand_matched} matched, {brand_unmatched} unmatched (of {len(lsts)} parsed)")

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"DONE. unique real records: {len(out)}")
    print(f"Total matched: {total_matched}, total unmatched: {total_unmatched}")
    print(f"Output: {OUT_FILE}")

    if out:
        from collections import Counter
        by_type = Counter(r["car_type"] for r in out)
        by_brand = Counter(r["brand"] for r in out)
        pcts = [r["resale_pct"] for r in out]
        kms = [r["annual_km"] for r in out]
        yrs = [r["years"] for r in out]
        print("\ncar_type:", dict(by_type))
        print("top brands:", by_brand.most_common(10))
        print(f"resale_pct: min={min(pcts):.3f} med={sorted(pcts)[len(pcts)//2]:.3f} max={max(pcts):.3f}")
        print(f"annual_km: min={min(kms)} med={sorted(kms)[len(kms)//2]} max={max(kms)}")
        print(f"years: min={min(yrs)} med={sorted(yrs)[len(yrs)//2]} max={max(yrs)}")


if __name__ == "__main__":
    main()
