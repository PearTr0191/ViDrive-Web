"""Ad-hoc accuracy eval on the 427-record real_all holdout (NOW incl. German/Palısade)
+ live calculate_resale probes for catalogued cars.

NOT the shipped gate (stress_resale_exhaustive.py covers the 390 baseline only).
This validates the NEW German/Palısade data+anchors end-to-end via the ML path
(market_value when within horizon, parametric anchor beyond).
"""
import io
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, "backend")
import src.config as cfg  # noqa: E402  (for CALIBRATED_RESALE_ANCHORS membership)
from src.calculations import calculate_resale  # noqa: E402


def ape(pred_pct: float, real_pct: float) -> float:
    return abs(pred_pct - real_pct) / real_pct * 100.0 if real_pct else 0.0


HERE = Path("backend/data/models")
cars = json.load(io.open("backend/data/cars.json", encoding="utf-8"))
real = json.load(io.open(HERE / "real_all.json", encoding="utf-8"))
BP = {(c["brand"], c["price"]): cid for cid, c in cars.items()}

NEW_CARS = {"palisade_2026", "a4_2026", "a6_2026", "bmw3_2026", "bmw5_2026",
            "x3_2026", "x5_2026", "q3_2026", "q5_2026", "cclass_2026",
            "eclass_2026", "glc_2026"}

# --- Per-car accuracy on the holdout ---
by_car: dict[str, list[float]] = defaultdict(list)
unmatched = 0
for r in real:
    cid = BP.get((r["brand"], r["price"]))
    if cid is None:
        unmatched += 1
        continue
    car = cars[cid]
    res = calculate_resale(
        car["price"], car["brand"], r["years"], car["type"],
        car.get("segment", "C-Sedan"), annual_km=r["annual_km"], car_id=cid,
    )
    pred_pct = res.get("market_value", res["value"]) / car["price"]
    by_car[cid].append(ape(pred_pct, r["resale_pct"]))

print("=== Per-car accuracy on real_all holdout (%d records) ===" % len(real))
all_apes: list[float] = []
for cid in sorted(by_car):
    a = by_car[cid]
    all_apes += a
    flag = "  <-- NEW" if cid in NEW_CARS else ""
    print(f"  {cid:18s} n={len(a):2d}  MAPE={statistics.mean(a):5.2f}%  max={max(a):6.2f}%{flag}")
print(f"\nOVERALL: MAPE={statistics.mean(all_apes):.2f}%  maxAPE={max(all_apes):.2f}%  "
      f"(n={len(all_apes)}, unmatched={unmatched})")

# --- Live probes of the production path on catalogued cars ---
print("\n=== Live calculate_resale probes (car_id engages anchors) ===")
for cid in ["palisade_2026", "bmw3_2026", "q5_2026", "x5_2026", "a4_2026",
            "a6_2026", "cclass_2026", "vf8_2026", "vios_2026"]:
    car = cars[cid]
    years = ([2, 3, 5, 10] if cid == "palisade_2026" else [1, 3, 5, 10])
    anchored = cid in cfg.CALIBRATED_RESALE_ANCHORS
    for y in years:
        res = calculate_resale(
            car["price"], car["brand"], y, car["type"],
            car.get("segment", "C-Sedan"), annual_km=15000, car_id=cid,
        )
        pv = res.get("market_value", res["value"])
        pct = pv / car["price"]
        note = res.get("resale_note_key")
        print(f"  {cid:14s} y{y:2d}: retention={pct:.3f}  value={pv:>13,.0f}  "
              f"logic={res['logic']}  anchor={'Y' if anchored else 'N'}  note={note}")
