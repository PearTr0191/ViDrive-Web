"""Test continuous blending with VinFast (floor mechanism)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.calculations import _blend_resale_curve
from src.ml_model import get_predictor

predictor = get_predictor()

# VinFast VF8, D-SUV, EV
price = 1_150_000_000
mt = predictor.get_car_max_training_year("VinFast", "D-SUV", "EV")
print(f"VinFast VF8: mt={mt}")

curve = _blend_resale_curve(price, "VinFast", "D-SUV", "EV", 15000, 16, mt, predictor)
print("\n=== VinFast VF8 blended curve ===")
for entry in curve:
    raw_ml = f"{entry['raw_ml']:>15,}" if entry['raw_ml'] else "None"
    pct = entry["value"] / price * 100
    print(f"  Y{entry['year']:2d}: value={entry['value']:>15,} ({pct:.1f}%)  raw_ml={raw_ml}  raw_param={entry['raw_param']:>15,}  logic={entry['logic']}  floor={entry.get('vinfast_floor_applied', False)}")

# Check monotonicity
prev = float('inf')
ok = True
for entry in curve:
    if entry["value"] > prev:
        print(f"  VIOLATION at Y{entry['year']}: {entry['value']:,} > {prev:,}")
        ok = False
    prev = entry["value"]
print(f"\nMonotonicity: {'PASS' if ok else 'FAIL'}")

# Check VinFast floor at years 1-3
print("\n=== VinFast floor check (years 1-3 should be >= 70%) ===")
for entry in curve[:3]:
    pct = entry["value"] / price * 100
    print(f"  Y{entry['year']}: {pct:.1f}%  floor_applied={entry.get('vinfast_floor_applied', False)}")

# Ford Ranger test
print("\n=== Ford Ranger (ICE-D, D-SUV) ===")
price_ranger = 1_055_000_000
mt_ranger = predictor.get_car_max_training_year("Ford", "D-SUV", "ICE-D")
print(f"mt={mt_ranger}")
curve_r = _blend_resale_curve(price_ranger, "Ford", "D-SUV", "ICE-D", 15000, 16, mt_ranger, predictor)
for entry in curve_r:
    pct = entry["value"] / price_ranger * 100
    print(f"  Y{entry['year']:2d}: {entry['value']:>15,} ({pct:.1f}%)  logic={entry['logic']}")

prev = float('inf')
ok = True
for entry in curve_r:
    if entry["value"] > prev:
        print(f"  VIOLATION at Y{entry['year']}: {entry['value']:,} > {prev:,}")
        ok = False
    prev = entry["value"]
print(f"Monotonicity: {'PASS' if ok else 'FAIL'}")
