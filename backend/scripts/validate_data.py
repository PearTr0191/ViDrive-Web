"""Fail-loud validation for ViDrive data files.

Validates:
  - backend/data/assumptions.json  (schema, types, sanity bands, provenance coverage)
  - backend/data/resale_anchors.json (retention bounds, car-id references)
  - backend/data/cars.json         (required fields, config-map coverage, images)

Exit codes: 0 = valid (warnings allowed), 1 = errors found.
Usage: python backend/scripts/validate_data.py [--json]
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND / "data"
FRONTEND_CARS = BACKEND.parent / "frontend" / "public" / "cars"

sys.path.insert(0, str(BACKEND))

REQUIRED_ASSUMPTIONS = [
    "PETROL_PRICE_CURRENT_VND", "PETROL_PRICE_FORECAST_VND",
    "DIESEL_PRICE_CURRENT_VND", "DIESEL_PRICE_FORECAST_VND",
    "EV_CHARGING_PRICE_VND",
    "ICE_REGISTRATION_RATE_STANDARD", "ICE_REGISTRATION_RATE_CENTRAL_CITY",
    "EV_EXEMPTION_END_DATE", "EV_POST_EXEMPTION_DISCOUNT",
    "PLATE_FEES", "PLATE_FEE_METRO", "PLATE_FEE_NON_METRO_AREA1",
    "INSPECTION_FEE", "ROAD_MAINTENANCE_FEE_YEARLY",
    "CIVIL_INSURANCE_UNDER_6", "CIVIL_INSURANCE_6_TO_11",
    "OPTIONAL_PHYSICAL_DAMAGE_INSURANCE_RATE",
    "BASE_ANNUAL_MAINTENANCE_ICE", "BASE_ANNUAL_MAINTENANCE_EV",
    "MAINTENANCE_MAJOR_KM", "MAINTENANCE_MAJOR_COST_ICE",
    "MAINTENANCE_MAJOR_COST_ICE_D", "MAINTENANCE_MAJOR_COST_EV",
    "MAINTENANCE_SPIKES", "SAVINGS_INTEREST_RATE", "PARKING_TOLL_ESTIMATES",
]

FUEL_KEYS = {
    "PETROL_PRICE_CURRENT_VND", "PETROL_PRICE_FORECAST_VND",
    "DIESEL_PRICE_CURRENT_VND", "DIESEL_PRICE_FORECAST_VND",
}
RATE_KEYS = {
    "ICE_REGISTRATION_RATE_STANDARD", "ICE_REGISTRATION_RATE_CENTRAL_CITY",
    "EV_POST_EXEMPTION_DISCOUNT", "OPTIONAL_PHYSICAL_DAMAGE_INSURANCE_RATE",
    "SAVINGS_INTEREST_RATE",
}
VALID_CAR_TYPES = {"ICE", "ICE-D", "HEV", "EV"}

errors: list[str] = []
warnings: list[str] = []


def _err(msg: str) -> None:
    errors.append(msg)


def _warn(msg: str) -> None:
    warnings.append(msg)


def _load_json(path: Path, detect_dupes: bool = False) -> dict:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        _err(f"{path.name}: file missing")
        return {}
    try:
        if detect_dupes:
            dupes: list[str] = []

            def _pairs(pairs):
                keys = [k for k, _ in pairs]
                seen = set()
                for k in keys:
                    if k in seen:
                        dupes.append(k)
                    seen.add(k)
                return dict(pairs)

            data = json.loads(text, object_pairs_hook=_pairs)
            top_dupes = [k for k in set(dupes) if isinstance(data.get(k), dict)]
            if top_dupes:
                _err(f"{path.name}: duplicate ids collapsed by parser: {sorted(top_dupes)}")
            return data
        return json.loads(text)
    except json.JSONDecodeError as exc:
        _err(f"{path.name}: invalid JSON ({exc})")
        return {}


def validate_assumptions() -> dict:
    raw = _load_json(DATA_DIR / "assumptions.json")
    if not raw:
        return {}
    meta = raw.get("_meta", {})

    for key in REQUIRED_ASSUMPTIONS:
        if key not in raw:
            _err(f"assumptions.json: missing required constant '{key}'")
        elif key not in meta:
            _warn(f"assumptions.json: '{key}' has no _meta provenance entry")

    for key in FUEL_KEYS:
        val = raw.get(key)
        if isinstance(val, (int, float)) and not 10_000 <= val <= 50_000:
            _err(f"assumptions.json: {key}={val} outside sanity band 10k-50k VND/L")

    for key in RATE_KEYS:
        val = raw.get(key)
        if isinstance(val, (int, float)) and not 0.0 <= val <= 1.0:
            _err(f"assumptions.json: {key}={val} is not a fraction in [0, 1]")

    try:
        date.fromisoformat(str(raw.get("EV_EXEMPTION_END_DATE", "")))
    except ValueError:
        _err(f"assumptions.json: EV_EXEMPTION_END_DATE={raw.get('EV_EXEMPTION_END_DATE')!r} not ISO date")

    spikes = raw.get("MAINTENANCE_SPIKES", {})
    for powertrain, pairs in spikes.items():
        seen_km = 0
        for km, cost in pairs:
            if km <= seen_km:
                _err(f"assumptions.json: MAINTENANCE_SPIKES[{powertrain}] thresholds not ascending at {km}")
            seen_km = km
            if not 0 < cost < 100_000_000:
                _err(f"assumptions.json: MAINTENANCE_SPIKES[{powertrain}] cost {cost} implausible")

    for name, entry in meta.items():
        if name.startswith("_"):
            continue
        if not isinstance(entry, dict) or not entry.get("verified_at"):
            _err(f"assumptions.json: _meta.{name} missing verified_at")
            continue
        try:
            date.fromisoformat(str(entry["verified_at"]))
        except ValueError:
            _err(f"assumptions.json: _meta.{name}.verified_at not ISO date")
    return raw


def validate_resale_anchors(cars: dict) -> dict:
    raw = _load_json(DATA_DIR / "resale_anchors.json")
    if not raw:
        return {}
    meta = raw.pop("_meta", {})
    for car_id, years in raw.items():
        if cars and car_id not in cars:
            _warn(f"resale_anchors.json: '{car_id}' not in cars.json catalogue")
        for year, retention in years.items():
            try:
                y = int(year)
            except (TypeError, ValueError):
                _err(f"resale_anchors.json: {car_id} year '{year}' not an integer")
                continue
            if y < 1 or y > 30:
                _err(f"resale_anchors.json: {car_id} year {y} out of range 1-30")
            if not 0.05 <= float(retention) <= 0.95:
                _err(f"resale_anchors.json: {car_id} y{y} retention {retention} outside 0.05-0.95")
    if meta and not meta.get("verified_at"):
        _warn("resale_anchors.json: _meta missing verified_at")
    return raw


def validate_cars() -> dict:
    path = DATA_DIR / "cars.json"
    cars = _load_json(path, detect_dupes=True)
    if not cars:
        return {}

    from src.config import BRAND_LIQUIDITY_MAP, SEGMENT_DEPRECIATION_MAP, WIZARD_SEGMENTS  # noqa: E402

    for car_id, car in cars.items():
        for field in ("brand", "model", "price", "type", "seats", "consumption",
                      "annual_maintenance", "segment"):
            if field not in car:
                _err(f"cars.json: {car_id} missing field '{field}'")
        if car.get("type") not in VALID_CAR_TYPES:
            _err(f"cars.json: {car_id} type '{car.get('type')}' not in {sorted(VALID_CAR_TYPES)}")
        if not isinstance(car.get("price"), int) or car["price"] <= 0:
            _err(f"cars.json: {car_id} price must be a positive integer")
        if not isinstance(car.get("annual_maintenance"), int) or car["annual_maintenance"] <= 0:
            _err(f"cars.json: {car_id} annual_maintenance must be a positive integer")
        if not 0.5 <= float(car.get("consumption", 0)) <= 40:
            _err(f"cars.json: {car_id} consumption {car.get('consumption')} implausible (L or kWh/100km)")

        brand = car.get("brand")
        if brand and brand not in BRAND_LIQUIDITY_MAP:
            _warn(f"cars.json: {car_id} brand '{brand}' missing from BRAND_LIQUIDITY_MAP "
                  f"(silently defaults to Tier 3)")
        segment = car.get("segment")
        if segment and segment not in SEGMENT_DEPRECIATION_MAP:
            _warn(f"cars.json: {car_id} segment '{segment}' missing from SEGMENT_DEPRECIATION_MAP "
                  f"(silently defaults to decay_adj 1.0)")
        if segment and segment not in WIZARD_SEGMENTS:
            _warn(f"cars.json: {car_id} segment '{segment}' missing from WIZARD_SEGMENTS "
                  f"(unavailable in the wizard)")

        image = FRONTEND_CARS / f"{car_id}.webp"
        if not image.exists():
            _warn(f"cars.json: {car_id} has no image at frontend/public/cars/{car_id}.webp "
                  f"(UI falls back to SVG silhouette)")
    return cars


def validate_consumption_provenance(cars: dict) -> None:
    if not cars:
        return
    prov = _load_json(DATA_DIR / "cars_consumption_sources.json")
    if not prov:
        _warn("cars_consumption_sources.json: file missing or unreadable")
        return
    missing = [cid for cid in cars if cid not in prov]
    if missing:
        _warn(f"cars_consumption_sources.json: {len(missing)} catalogue cars lack provenance "
              f"(manufacturer_fallback on next update_consumption run): {missing[:8]}")


def validate_real_listing_files(cars: dict) -> None:
    """Cross-model contamination guard for the resale pipeline's real data."""
    sys.path.insert(0, str(DATA_DIR / "models"))
    sys.path.insert(0, str(BACKEND / "scripts"))
    try:
        # Canonical matcher — duplicated normalizers drifted once already.
        from catalogue_watch import _model_matches
    except Exception as exc:  # pragma: no cover
        _warn(f"real-listing contamination check skipped ({exc})")
        return

    bp = {(c.get("brand"), c.get("price")): cid for cid, c in cars.items()}
    for fname in ("bonbanh_real.json", "oto_real.json"):
        records = _load_json(DATA_DIR / "models" / fname)
        for i, r in enumerate(records):
            cid = bp.get((r.get("brand"), r.get("price")))
            if cid and not _model_matches(r.get("model"), cars[cid].get("model")):
                _err(f"{fname}: record {i} '{r.get('model')}' is cross-model "
                     f"contamination for [{cid}] — purge before gating")


def main() -> int:
    assumptions = validate_assumptions()
    cars = validate_cars()
    validate_resale_anchors(cars)
    validate_consumption_provenance(cars)
    validate_real_listing_files(cars)

    if "--json" in sys.argv:
        print(json.dumps({"errors": errors, "warnings": warnings}, indent=2, ensure_ascii=False))
    else:
        for w in warnings:
            print(f"WARN  {w}")
        for e in errors:
            print(f"ERROR {e}")
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)"
              f"{'' if assumptions or cars else ' (files unreadable)'}")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
