"""Add the new real bonbanh y2017 Fortuner (D-SUV ICE, 0.615) deep-tail record
to training_data.json and real_all.json, reusing the proven merge logic."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import merge_into_training, load_cars_json  # noqa: E402

OUT_REAL = HERE / "real_all.json"


def main() -> None:
    cars_data = load_cars_json()

    # The scraped candidate (reconstructed listing): bonbanh 2017 Fortuner,
    # listing 335M, msrp 545M (matched via find_new_price), mileage 85k, ICE.
    listing = {
        "id": "bb_fortuner_2017_deeptail",
        "brand": "Toyota",
        "model": "Fortuner",
        "segment": "D-SUV",
        "car_type": "ICE",
        "price": 335_000_000,       # listing price
        "year": 2017,
        "mileage_km": 85_000,
    }

    # Merge into training_data.json (flags source on the new expanded record).
    added = merge_into_training([listing], source="bonbanh")
    print(f"merge_into_training added: {added}")

    # Re-load training_data and confirm the record exists with expected pct.
    td = json.load(open(HERE / "training_data.json", encoding="utf-8"))
    matches = [r for r in td if r.get("source") == "bonbanh" and r.get("years") == 9
               and r.get("segment") == "D-SUV" and r.get("car_type") == "ICE"
               and r.get("brand") == "Toyota"]
    for m in matches:
        print(f"  ADDED -> id={m['id']} years={m['years']} price={m['price']:,} "
              f"resale={m['resale_value']:,} pct={m['resale_pct']:.3f} km={m['annual_km']}")

    # Also append to real_all.json (the canonical real-heldout source for eval).
    real = json.load(open(OUT_REAL, encoding="utf-8"))
    new_rec = matches[0] if matches else None
    if new_rec is None:
        print("ERROR: record not found after merge")
        return
    # avoid duplicate in real_all
    if not any(r.get("id") == new_rec["id"] for r in real):
        real.append(new_rec)
        json.dump(real, open(OUT_REAL, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(f"real_all.json now {len(real)} rows (+1)")
    else:
        print("real_all.json already has this record")


if __name__ == "__main__":
    main()
