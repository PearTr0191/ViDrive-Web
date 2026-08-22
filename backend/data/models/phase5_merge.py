"""Phase 5: scrape bonbanh.com.vn, merge ONLY listings that match a real
cars.json MSRP (with a plausible retention band), into training_data.json
flagged source='bonbanh'."""
import json
import sys
import time
from pathlib import Path

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
from pipeline_common import CURRENT_YEAR
TRAINING_FILE = HERE / "training_data.json"
N_PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 100


def main() -> None:
    cars_data = load_cars_json()
    training = json.load(open(TRAINING_FILE, encoding="utf-8"))
    existing = {r["id"] for r in training}

    added = 0
    skipped_unmatched = 0
    skipped_band = 0
    for p in range(1, N_PAGES + 1):
        try:
            r = requests.get(f"https://bonbanh.com/oto?page={p}", headers=HEADERS, timeout=20)
            if r.status_code != 200:
                continue
            for lst in parse_bonbanh_text(r.text):
                age = CURRENT_YEAR - lst["year"]
                if age <= 0:
                    continue
                np_ = find_new_price(lst["brand"], lst["model"], cars_data)
                if np_ is None:
                    skipped_unmatched += 1
                    continue
                rp = round(lst["price"] / np_, 4)
                if rp < 0.2 or rp > 0.95:  # exclude near-new demos / implausible
                    skipped_band += 1
                    continue
                mileage = lst.get("mileage_km", 0)
                annual_km = min(100000, max(5000, mileage // age)) if mileage else 15000
                uid = f"{lst['id']}_{age}yr_{annual_km}km"
                if uid in existing:
                    continue
                existing.add(uid)
                training.append({
                    "id": uid,
                    "brand": lst["brand"],
                    "model": lst["model"],
                    "segment": lst["segment"],
                    "car_type": lst["car_type"],
                    "price": int(np_),
                    "years": age,
                    "annual_km": annual_km,
                    "resale_value": int(lst["price"]),
                    "resale_pct": rp,
                    "source": "bonbanh",
                })
                added += 1
        except Exception as e:  # pragma: no cover
            print(f"page {p}: ERR {e}")
        if p % 20 == 0:
            print(f"  ...page {p}: +{added} so far")
        time.sleep(0.25)

    json.dump(training, open(TRAINING_FILE, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"DONE. Added {added} bonbanh records "
          f"(skipped: {skipped_unmatched} unmatched, {skipped_band} out-of-band). "
          f"Total training rows: {len(training)}")


if __name__ == "__main__":
    main()
