"""Verify the Fortuner ICE-D y14 exception is fixed by the relaxed deep-tail anchor,
and check no regression on other deep-tail anchors (Vios y18, etc.)."""
import sys
sys.path.insert(0, "backend")
from src.ml_model import get_predictor  # noqa: E402
from src.calculations import calculate_resale, _parametric_retention  # noqa: E402

p = get_predictor()


def show(group_brand, group_seg, group_type, label):
    gc = p.get_group_curve(group_brand, group_seg, group_type)
    print(f"\n=== {label}: {group_brand} {group_seg} {group_type} ===")
    print("  group_curve anchors:", {y: round(r, 3) for y, r in sorted(gc.items())})
    print("  group_max_year (ML horizon):", p.get_car_max_training_year(group_brand, group_seg, group_type))


show("Toyota", "D-SUV", "ICE-D", "Fortuner 2.4 (THE EXCEPTION)")
show("Toyota", "B-Sedan", "ICE", "Vios")

print("\n=== Fortuner y14 prediction vs real 0.313 ===")
for yrs in [7, 9, 10, 12, 14, 16, 18]:
    ret = _parametric_retention("Toyota", "D-SUV", "ICE-D", yrs, 15000, p)
    print(f"  Fortuner ICE-D y{yrs}: param_ret={ret:.3f}  (real y14=0.313)")

print("\n=== calculate_resale (full, with floor/clamp) ===")
for yrs in [9, 14, 18]:
    r = calculate_resale(price=1_055_000_000, brand="Toyota", years=yrs,
                          car_type="ICE-D", segment="D-SUV", annual_km=15000)
    print(f"  Fortuner ICE-D y{yrs}: value={r['value']:,} logic={r['logic']} ml={r.get('ml_value')} param={r.get('parametric_value')}")
