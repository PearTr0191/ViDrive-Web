"""Process Playwright-extracted oto_raw_cards.json into real records,
   filter to 10+ year old cars, dedupe against existing oto_real.json,
   and rebuild real_all.json. Reuses multi_source_scraper parsers."""
import io, json
from pathlib import Path
from collections import Counter
import multi_source_scraper as ms

HERE = Path(__file__).parent
DATA = HERE.parent  # data/
CARS = ms.load_cars_json()
from pipeline_common import CURRENT_YEAR


def card_to_listing(card: dict) -> dict | None:
    name = card.get("name", "")
    year = ms.parse_year(name)
    if not year:
        return None
    brand = ms.find_brand(name)
    if not brand:
        return None
    model = ms.extract_model(name, brand)
    price = ms.parse_oto_price(card.get("price", "")) or ms.parse_price(card.get("price", ""))
    tags = card.get("tags", [])
    mileage = 0
    for t in tags:
        m = ms.parse_mileage(t)
        if m:
            mileage = m
            break
    car_type = ms.infer_type(" ".join(tags))
    seg = ms.infer_segment(brand, model, price or 0)
    return {
        "brand": brand, "model": model, "year": year,
        "price": price, "mileage_km": mileage,
        "segment": seg, "car_type": car_type,
    }


def to_real_record(lst: dict) -> dict | None:
    if not lst["year"] or lst["year"] >= CURRENT_YEAR:
        return None
    age = CURRENT_YEAR - lst["year"]
    if age < 10:  # FOCUS: 10+ year old cars
        return None
    msrp = ms.find_new_price(lst["brand"], lst["model"], CARS)
    if msrp is None:
        return None
    listing_price = lst.get("price")
    if not listing_price or listing_price <= 0 or listing_price > 5_000_000_000:
        return None
    rp = listing_price / msrp
    if not (0.15 <= rp <= 0.95):
        return None
    mileage = lst.get("mileage_km") or 0
    if mileage <= 0 or age <= 0:
        return None
    annual_km = min(100_000, max(5_000, mileage // age))
    seg = lst.get("segment") or "C-Sedan"
    return {
        "brand": lst["brand"], "model": lst["model"], "segment": seg,
        "car_type": lst.get("car_type", "ICE"), "price": int(msrp),
        "years": age, "annual_km": annual_km,
        "resale_value": int(listing_price),
        "resale_pct": round(rp, 6), "source": "oto",
    }


def main():
    raw_path = HERE / "oto_raw_cards.json"
    if not raw_path.exists():
        print("no oto_raw_cards.json; run oto_pw.js first"); return
    cards = json.load(io.open(raw_path, encoding="utf-8"))
    print("raw cards loaded:", len(cards))

    # existing oto_real.json (restored baseline)
    existing = json.load(io.open(HERE / "oto_real.json", encoding="utf-8"))
    print("existing oto_real.json:", len(existing),
          "| existing tail(>=10):", sum(1 for r in existing if r["years"] >= 10))
    existing_keys = {(r["brand"], r["model"], r["years"], r["annual_km"]) for r in existing}

    new_recs = []
    for c in cards:
        lst = card_to_listing(c)
        if lst is None:
            continue
        rec = to_real_record(lst)
        if rec is None:
            continue
        key = (rec["brand"], rec["model"], rec["years"], rec["annual_km"])
        if key in existing_keys:
            continue
        existing_keys.add(key)
        new_recs.append(rec)

    # also dedupe within new_recs
    seen = set(); deduped = []
    for r in new_recs:
        k = (r["brand"], r["model"], r["years"], r["annual_km"])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(r)
    new_recs = deduped

    combined = existing + new_recs
    with io.open(HERE / "oto_real.json", "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2, ensure_ascii=False)
    print("new oto tail records added:", len(new_recs))
    print("oto_real.json now:", len(combined))
    cy = Counter(r["years"] for r in new_recs)
    print("new records years:", sorted(cy.items()))

    # rebuild real_all.json = dedup(bonbanh + oto) by real-record key
    bon = json.load(io.open(HERE / "bonbanh_real.json", encoding="utf-8"))
    keyf = lambda r: (r["brand"], r["model"], r["years"], r["annual_km"])
    merged = {}
    for r in bon + combined:
        merged[keyf(r)] = r
    real_all = list(merged.values())
    with io.open(HERE / "real_all.json", "w", encoding="utf-8") as f:
        json.dump(real_all, f, indent=2, ensure_ascii=False)
    print("real_all.json now:", len(real_all))
    rc = Counter(r["years"] for r in real_all)
    print("real_all ages:", sorted(rc.items()))
    print("real_all tail(>=10):", sum(1 for r in real_all if r["years"] >= 10))


if __name__ == "__main__":
    main()
