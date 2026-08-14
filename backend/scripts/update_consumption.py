"""
Update cars.json consumption values from scraped owner-reported data.

Reads:
  - backend/data/cars.json                              (existing DB)
  - backend/data/cars_consumption_sources.json          (scrape output, generated manually or by scraper)

Writes:
  - backend/data/cars.json                              (consumption field replaced + float-noise cleaned)
  - backend/data/cars_consumption_sources.json          (if missing; preserves existing entries)

The sources file format is:
{
  "<car_id>": {
    "median": <float>,            # owner-reported real-world median, L/100km (ICE) or kWh/100km (EV)
    "samples": [<float>, ...],    # raw data points that went into the median (>= 1)
    "source_type": "owner_reported" | "manufacturer_fallback",
    "sources": [{ "url": "...", "title": "...", "date": "YYYY-MM" }, ...],
    "notes": "free text summary of methodology or caveat"
  },
  ...
}

Cars not in the sources file are kept at their existing value but their stored
float-precision noise is cleaned (e.g. 6.077000000000001 -> 6.08). The sources
file is written with manufacturer_fallback entries for those cars so the
provenance is explicit.
"""
import json
import statistics
import sys
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
CARS_FILE = ROOT / "data" / "cars.json"
SOURCES_FILE = ROOT / "data" / "cars_consumption_sources.json"


def round2(x: float) -> float:
    """Clean float-precision noise (e.g. 6.077000000000001 -> 6.08)."""
    return round(float(x), 2)


def median_or_none(samples):
    cleaned = [float(s) for s in samples if s is not None]
    if not cleaned:
        return None
    return round2(statistics.median(cleaned))


def load_existing_sources():
    if not SOURCES_FILE.exists():
        return {}
    with SOURCES_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    if not CARS_FILE.exists():
        sys.exit(f"Missing {CARS_FILE}")

    with CARS_FILE.open("r", encoding="utf-8") as f:
        cars = json.load(f)

    sources = load_existing_sources()
    today = date.today().isoformat()

    updated = 0
    fallback_kept = 0
    median_changed = []

    for car_id, car in cars.items():
        existing = round2(car.get("consumption", 0))
        if car_id in sources and sources[car_id].get("source_type") == "owner_reported":
            entry = sources[car_id]
            median = median_or_none(entry.get("samples", []))
            if median is not None and median != existing:
                median_changed.append((car_id, existing, median))
            if median is not None:
                car["consumption"] = median
                sources[car_id]["median"] = median
            updated += 1
        else:
            # No scraped data: keep existing value but clean noise + record fallback
            car["consumption"] = existing
            sources[car_id] = {
                "median": existing,
                "samples": [existing],
                "source_type": "manufacturer_fallback",
                "sources": [],
                "notes": "No owner-reported scrape data; manufacturer figure preserved.",
                "updated": today,
            }
            fallback_kept += 1
        # Always clean float-precision noise in the file
        car["consumption"] = round2(car["consumption"])

    with CARS_FILE.open("w", encoding="utf-8") as f:
        json.dump(cars, f, indent=2, ensure_ascii=False)
        f.write("\n")

    with SOURCES_FILE.open("w", encoding="utf-8") as f:
        json.dump(sources, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Updated {updated} cars from scraped sources; {fallback_kept} kept at manufacturer fallback.")
    if median_changed:
        print("Notable changes (existing -> new):")
        for car_id, old, new in median_changed:
            print(f"  {car_id}: {old} -> {new} L/100km")


if __name__ == "__main__":
    main()
