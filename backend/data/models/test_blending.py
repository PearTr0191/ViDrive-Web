"""Quick test of the continuous blending + parametric-ML transition."""
import sys
from pathlib import Path

# Need to reach backend/ for `src` package
ROOT = Path(__file__).resolve().parents[2]  # backend/data/models -> backend
sys.path.insert(0, str(ROOT))

from src.calculations import calculate_resale, get_tco_yearly, _blend_resale_curve, _parametric_retention
from src.ml_model import get_predictor

predictor = get_predictor()

# Test: Toyota Vios, Hanoi, 15k km/year, 16 years
car = {
    "price": 545_000_000,
    "brand": "Toyota",
    "type": "ICE",
    "segment": "B-Sedan",
    "consumption": 6.5,
    "seats": 5,
}

print("=== Toyota Vios: ML horizon vs Parametric ===")
mt = predictor.get_car_max_training_year("Toyota", "B-Sedan", "ICE")
print(f"Per-car ML horizon (mt) = {mt}")

# Compute raw ML and parametric for each year
for year in range(1, 18):
    ml_result = predictor.predict_resale("Toyota", "B-Sedan", "ICE", year, 15000, 545_000_000)
    ml_pct = ml_result["ml_prediction"]
    ml_val = round(545_000_000 * ml_pct) if ml_pct and 0.05 <= ml_pct <= 1.0 else None

    param_ret = _parametric_retention("Toyota", "B-Sedan", "ICE", year, 15000, predictor)
    param_ret = max(0.05, min(0.98, param_ret))
    param_val = round(545_000_000 * param_ret)

    blended = calculate_resale(545_000_000, "Toyota", year, "ICE", "B-Sedan", 15000)

    ml_str = f"{ml_val:>15,}" if ml_val else "None"
    print(f"  Y{year:2d}: ML={ml_str}  Parametric={param_val:>15,}  Blended={blended['value']:>15,}  logic={blended['logic']}")

print("\n=== Continuous blending curve (16 years) ===")
curve = _blend_resale_curve(545_000_000, "Toyota", "B-Sedan", "ICE", 15000, 16, mt, predictor)
for entry in curve:
    raw_ml = f"{entry['raw_ml']:>15,}" if entry['raw_ml'] else "None"
    print(f"  Y{entry['year']:2d}: value={entry['value']:>15,}  raw_ml={raw_ml}  raw_param={entry['raw_param']:>15,}  logic={entry['logic']}")

print("\n=== Blended transition detail (Y5-Y10) ===")
for entry in curve:
    if 5 <= entry['year'] <= 10:
        raw_ml = f"{entry['raw_ml']:>15,}" if entry['raw_ml'] else "None"
        print(f"  Y{entry['year']:2d}: value={entry['value']:>15,}  raw_ml={raw_ml}  raw_param={entry['raw_param']:>15,}  logic={entry['logic']}")

print("\n=== Monotonicity check ===")
prev = float('inf')
ok = True
for entry in curve:
    if entry["value"] > prev:
        print(f"  VIOLATION at Y{entry['year']}: {entry['value']:,} > {prev:,}")
        ok = False
    prev = entry["value"]
if ok:
    print("  All values non-increasing")

# Test get_tco_yearly
print("\n=== get_tco_yearly (Toyota Vios, Hanoi, 15k km, 16 years) ===")
yearly, warnings, _ = get_tco_yearly(car, "Hanoi", 15000, 16)
print(f"Warnings: {warnings}")
for y in yearly:
    print(f"  Y{y['year']:2d}: resale={y['resale']:>15,}  cum_tco={y['cumulative_tco']:>18,}  depreciation={y['depreciation']:>15,}")

# Verify TCO invariant
print("\n=== TCO invariant check ===")
for y in yearly[1:]:
    prev_y = yearly[y['year'] - 2]
    delta_tco = y['cumulative_tco'] - prev_y['cumulative_tco']
    delta_op = y['operating_cumulative'] - prev_y['operating_cumulative']
    delta_depr = (y['resale'] - prev_y['resale'])
    expected = delta_op - delta_depr
    diff = delta_tco - expected
    print(f"  Y{y['year']:2d}: delta_tco={delta_tco:>12,}  expected={expected:>12,}  diff={diff:>8,}")
