#!/usr/bin/env python3
"""Car-catalogue operations CLI with enforced MSRP provenance.

Commands:
  update-price <car_id> --price N --source-url URL [--note TEXT]
      Update a catalogue car's MSRP. Refuses URLs outside the official
      manufacturer/gia-niem-yet allowlist unless --force is given.
  add-car <car_id> --brand B --model M --price N --type T --seats S
          --consumption C --maintenance M --segment SEG [--source-url URL]
      Append a new catalogue entry after checking config-map coverage.

Both commands write backend/data/cars.json atomically, record provenance in
backend/data/cars_price_sources.json, and finish by running validate_data.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

BACKEND = Path(__file__).resolve().parent.parent
CARS_PATH = BACKEND / "data" / "cars.json"
PRICE_SOURCES_PATH = BACKEND / "data" / "cars_price_sources.json"

OFFICIAL_SOURCE_DOMAINS = {
    "toyota.com.vn", "hyundai.com.vn", "ford.com.vn", "vinfastauto.com",
    "kia.com.vn", "mazda.com.vn", "honda.com.vn", "suzuki.com.vn",
    "nissan.com.vn", "mitsubishi-motors.com.vn", "mgmotor.vn",
    "mercedes-benz.com.vn", "bmvietnam.com", "audi.com.vn",
    "subaru.vn", "isuvn.com", "peugeot.com.vn", "lexus.com.vn",
}
VALID_TYPES = {"ICE", "ICE-D", "HEV", "EV"}
MAX_SANE_PRICE_JUMP = 0.30  # warn when new MSRP deviates >30 pct from current


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _save_atomic(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def _check_source_url(source_url: str | None, force: bool) -> bool:
    """Return True when the provenance requirement is satisfied."""
    if not source_url:
        print("ERROR: --source-url is required: prices must cite an official "
              "gia-niem-yet page (MSRP-only policy).")
        return False
    host = urlparse(source_url).hostname or ""
    if not any(host == d or host.endswith("." + d) for d in OFFICIAL_SOURCE_DOMAINS):
        if force:
            print(f"WARN: '{host}' is not on the official-source allowlist; "
                  f"--force given, recording anyway.")
            return True
        print(f"ERROR: '{host}' is not an official manufacturer source. Pass "
              f"--force only for verified official gia-niem-yet pages.")
        return False
    return True


def cmd_update_price(args: argparse.Namespace) -> int:
    if not _check_source_url(args.source_url, args.force):
        return 1
    cars = _load(CARS_PATH)
    if args.car_id not in cars:
        print(f"ERROR: '{args.car_id}' not in cars.json")
        return 1
    car = cars[args.car_id]
    old_price = car["price"]
    if args.price <= 0 or not isinstance(args.price, int):
        print("ERROR: --price must be a positive integer (VND)")
        return 1
    jump = abs(args.price - old_price) / old_price
    if jump > MAX_SANE_PRICE_JUMP and not args.force:
        print(f"ERROR: {args.price:,} differs from current {old_price:,} by "
              f"{jump:.0%} (> {MAX_SANE_PRICE_JUMP:.0%}). Re-check the source "
              f"or pass --force.")
        return 1

    car["price"] = args.price
    _save_atomic(CARS_PATH, cars)

    sources = _load(PRICE_SOURCES_PATH) if PRICE_SOURCES_PATH.exists() else {}
    sources[args.car_id] = {
        "field": "price",
        "value": args.price,
        "previous_value": old_price,
        "verified_at": date.today().isoformat(),
        "source": args.source_url,
        "note": args.note or "",
    }
    _save_atomic(PRICE_SOURCES_PATH, sources)

    print(f"UPDATED {args.car_id}: {old_price:,} -> {args.price:,} VND")
    print(f"PROVENANCE -> {PRICE_SOURCES_PATH.name}")
    return _run_validator()


def cmd_add_car(args: argparse.Namespace) -> int:
    from src.config import BRAND_LIQUIDITY_MAP, SEGMENT_DEPRECIATION_MAP, WIZARD_SEGMENTS  # noqa: E402

    cars = _load(CARS_PATH)
    if args.car_id in cars:
        print(f"ERROR: '{args.car_id}' already exists")
        return 1
    if args.type not in VALID_TYPES:
        print(f"ERROR: --type must be one of {sorted(VALID_TYPES)}")
        return 1
    if args.segment not in SEGMENT_DEPRECIATION_MAP:
        print(f"WARN: segment '{args.segment}' missing from SEGMENT_DEPRECIATION_MAP "
              f"(would silently default to decay_adj 1.0)")
    if args.brand not in BRAND_LIQUIDITY_MAP:
        print(f"WARN: brand '{args.brand}' missing from BRAND_LIQUIDITY_MAP "
              f"(would silently default to Tier 3)")
    if args.segment not in WIZARD_SEGMENTS:
        print(f"WARN: segment '{args.segment}' missing from WIZARD_SEGMENTS")

    cars[args.car_id] = {
        "brand": args.brand,
        "model": args.model,
        "price": args.price,
        "type": args.type,
        "seats": args.seats,
        "consumption": args.consumption,
        "annual_maintenance": args.maintenance,
        "segment": args.segment,
    }
    _save_atomic(CARS_PATH, cars)
    image_hint = Path(BACKEND.parent / "frontend" / "public" / "cars" / f"{args.car_id}.webp")
    if not image_hint.exists():
        print(f"WARN: add an image at frontend/public/cars/{args.car_id}.webp "
              f"(UI falls back to SVG silhouette)")
    if args.source_url and PRICE_SOURCES_PATH:
        sources = _load(PRICE_SOURCES_PATH) if PRICE_SOURCES_PATH.exists() else {}
        sources[args.car_id] = {
            "field": "price",
            "value": args.price,
            "verified_at": date.today().isoformat(),
            "source": args.source_url,
            "note": "initial entry",
        }
        _save_atomic(PRICE_SOURCES_PATH, sources)
    print(f"ADDED {args.car_id}")
    return _run_validator()


def _run_validator() -> int:
    import subprocess
    result = subprocess.run(
        [sys.executable, str(BACKEND / "scripts" / "validate_data.py")],
        check=False,
    )
    return 0 if result.returncode == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_up = sub.add_parser("update-price", help="Update a car's MSRP with provenance")
    p_up.add_argument("car_id")
    p_up.add_argument("--price", type=int, required=True)
    p_up.add_argument("--source-url", required=True)
    p_up.add_argument("--note", default="")
    p_up.add_argument("--force", action="store_true",
                      help="accept non-allowlist source or >30 pct jump")
    p_up.set_defaults(func=cmd_update_price)

    p_add = sub.add_parser("add-car", help="Add a catalogue car")
    p_add.add_argument("car_id")
    p_add.add_argument("--brand", required=True)
    p_add.add_argument("--model", required=True)
    p_add.add_argument("--price", type=int, required=True)
    p_add.add_argument("--type", dest="type", default="ICE")
    p_add.add_argument("--seats", type=int, default=5)
    p_add.add_argument("--consumption", type=float, required=True)
    p_add.add_argument("--maintenance", type=int, required=True,
                       help="annual_maintenance VND/yr")
    p_add.add_argument("--segment", required=True)
    p_add.add_argument("--source-url", default=None)
    p_add.set_defaults(func=cmd_add_car)

    sys.path.insert(0, str(BACKEND))
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
