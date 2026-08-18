"""Exhaustive real-data stress test for the resale pipeline.

Validates `calculate_resale()` (and the production yearly-blend path) against
EVERY real bonbanh/oto listing (390 records across 161 distinct matched cars) — far
beyond the 10 held-out points validated by resale_mape_eval.py — plus invariant
sweeps over all 82 catalogue cars.

Modes
-----
A. PRODUCTION PATH (all 390 real records)
   For each (car, year, annual_km) real listing, call calculate_resale() exactly
   as the API does (car catalogue brand/type/segment/price + car_id) and compare
   the retention against the real resale_pct. VinFast records are scored against
   the option-B open-market value (`market_value`), not the buyback-guarantee
   floor, so the gate measures true market accuracy. Reported:
       - Per-record APE distribution (median / p90 / max), per source
       - Per-car MAPE, per-(car, year) median MAPE

B. LEAVE-ONE-CAR-OUT GENERALIZATION (honest OOS)
   All 390 real records already live inside training_data.json (in-sample!). To
   get a defensible out-of-sample number we retrain the RF+GB ensemble (and all
   group stats) excluding the car's real rows + its calibrated anchors, then
   predict that car's real records. Per-car MAPE over ~161 retrains approximates
   the "never calibrated this model" error a real buyer sees.

C. INVARIANTS (all 82 cars)
   - production get_tco_yearly() curve monotonicity (resale non-increasing)
   - single-year calculate_resale() bounds at several annual_km values
   - VinFast resale note presence for years 1..7
   - zero exceptions raised across every call

Exit code 0 = Mode A car-year MAPE <= 4% AND max APE <= 10% AND Mode C invariants pass.
Mode B is REPORT ONLY (it is the honester generalization number; gate not asserted).
"""
import json
import os
import shutil
import sys
import tempfile
import warnings
from collections import defaultdict
from statistics import median

os.chdir(r"D:\Projects\ViDrive Web\backend")
sys.path.insert(0, ".")
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import joblib  # noqa: E402
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor  # noqa: E402

from src.calculations import calculate_resale, get_tco_yearly, _enrich_car  # noqa: E402
import src.ml_model as mlmod  # noqa: E402
from src.ml_model import get_predictor  # noqa: E402
import src.config as cfg  # noqa: E402

GATE_MAPE = 4.0
GATE_MAX_APE = 10.0

# ---------------------------------------------------------------------------
# CLI controls (default: run everything)
#   --skip-A    skip production-path real-data MAPE
#   --skip-B    skip leave-one-car-out retrain
#   --skip-C    skip invariants sweep
#   --b-limit N cap LOCO cars (for smoke tests)
# ---------------------------------------------------------------------------
RUN_A = True
RUN_B = True
RUN_C = True
B_LIMIT = None
_cli = sys.argv[1:]
for i, a in enumerate(_cli):
    if a == "--skip-a":
        RUN_A = False
    elif a == "--skip-b":
        RUN_B = False
    elif a == "--skip-c":
        RUN_C = False
    elif a == "--b-limit" and i + 1 < len(_cli):
        B_LIMIT = int(_cli[i + 1])

cars = json.load(open("data/cars.json", encoding="utf-8"))
bonbanh = json.load(open("data/models/bonbanh_real.json", encoding="utf-8"))
oto = json.load(open("data/models/oto_real.json", encoding="utf-8"))
training_raw = json.load(open("data/models/training_data.json", encoding="utf-8"))

# (brand, price) uniquely identifies a catalogue car (verified 390/390, 0 collisions)
BP = {(c["brand"], c["price"]): cid for cid, c in cars.items()}


def car_of(r):
    """Map a real record to (car_id, car) or (None, None) if unmatched."""
    cid = BP.get((r["brand"], r["price"]))
    if cid is None:
        return None, None
    return cid, cars[cid]


ALL_REAL = bonbanh + oto


def ape(pred: float, real: float) -> float:
    return abs(pred - real) / real * 100.0 if real else 0.0


def summarize(apes):
    if not apes:
        return {"n": 0, "mape": None, "max": None, "p50": None, "p90": None}
    a = sorted(apes)
    p90 = a[min(len(a) - 1, int(0.90 * len(a)))]
    return {"n": len(a), "mape": sum(a) / len(a), "max": a[-1],
            "p50": a[len(a) // 2], "p90": p90}


def print_sep(title: str, char: str = "=", width: int = 78) -> None:
    print("\n" + char * width)
    print(title)
    print(char * width)


# ---------------------------------------------------------------------------
# Mode A — production path against every real record
# ---------------------------------------------------------------------------
car_year_real = defaultdict(list)   # (car_id, year) -> list[real resale_pct]
car_year_km = defaultdict(list)     # (car_id, year) -> list[annual_km]
per_source_mape = defaultdict(list)
unmatched = []
car_year_apes = defaultdict(list)

if RUN_A:
    print_sep("MODE A — PRODUCTION PATH vs ALL 390 REAL RECORDS")

    for r in ALL_REAL:
        cid, car = car_of(r)
        if cid is None:
            unmatched.append(r)
            continue
        price, brand, y = car["price"], car["brand"], r["years"]
        ct, seg = car["type"], car.get("segment", "C-Sedan")
        res = calculate_resale(price, brand, y, ct, seg,
                               annual_km=r["annual_km"], car_id=cid)
        # VinFast Option B: the buyback-guarantee value is a FLOOR, not a market
        # prediction. Score VinFast records against the open-market value so the
        # gate measures true market accuracy (Mode C still asserts the guarantee
        # floor/note invariants separately).
        pred_value = res.get("market_value", res["value"])
        pred = pred_value / price
        real = r["resale_pct"]
        per_source_mape[r.get("source", "bonbanh")].append(ape(pred, real))
        car_year_real[(cid, y)].append(real)
        car_year_km[(cid, y)].append(r["annual_km"])

    # Standardized comparison at median annual_km per (car, year).
    pa_km = {k: median(v) for k, v in car_year_km.items()}
    for (cid, y), _real_list in car_year_real.items():
        car = cars[cid]
        res = calculate_resale(car["price"], car["brand"], y, car["type"],
                               car.get("segment", "C-Sedan"),
                               annual_km=pa_km[(cid, y)], car_id=cid)
        pred_value = res.get("market_value", res["value"])
        pred = pred_value / car["price"]
        car_year_apes[cid].append(ape(pred, median(_real_list)))

    print("matched records: %d  unmatched: %d  distinct cars: %d" %
          (sum(len(v) for v in car_year_real.values()), len(unmatched),
           len(car_year_real)))
    if unmatched:
        print("unmatched sample:", unmatched[:3])

    print("\n-- Per source, PER-RECORD APE (includes anchor years) --")
    for src in sorted(per_source_mape):
        s = summarize(per_source_mape[src])
        print(f"  {src:8s} n={s['n']:3d}  MAPE={s['mape']:.2f}%  "
              f"p50={s['p50']:.2f}%  p90={s['p90']:.2f}%  max={s['max']:.2f}%")

    print("\n-- Per-car MAPE (car-year medians at median km) --")
    for cid in sorted(car_year_apes):
        s = summarize(car_year_apes[cid])
        print(f"  {cid:22s} n={s['n']:2d}  MAPE={s['mape']:.2f}%  max={s['max']:.2f}%")

# ---------------------------------------------------------------------------
# Mode B: leave-one-car-out retrain (honest generalization)
# ---------------------------------------------------------------------------
def fit_ensemble(rows, rf_p, gb_p, seed=42):
    """Fit RF+GB on `rows` (mirrors train_models.py: 20x real upsample)."""
    df = pd.DataFrame(rows)
    df["log_price"] = np.log(df["price"] + 1)
    df["km_per_year"] = df["annual_km"]
    df["is_real"] = df["source"].notna() & (df["source"] != "ORIG")
    cats = ["brand", "segment", "car_type"]
    enc = pd.get_dummies(df[cats], prefix=cats, drop_first=False).astype(float)
    feats = pd.concat([df[["years", "km_per_year", "log_price"]].reset_index(drop=True),
                       enc.reset_index(drop=True)], axis=1).to_numpy(dtype=float)
    y = df["resale_pct"].to_numpy(dtype=float)
    is_real = df["is_real"].to_numpy(bool)
    real_idx = np.where(is_real)[0]
    synth_idx = np.where(~is_real)[0]
    train_idx = np.concatenate([synth_idx, np.repeat(real_idx, 20)])
    rng = np.random.RandomState(seed)
    rng.shuffle(train_idx)
    rf = RandomForestRegressor(n_estimators=600, max_depth=15, min_samples_leaf=2,
                               random_state=seed, n_jobs=1)
    rf.fit(feats[train_idx], y[train_idx])
    gb = GradientBoostingRegressor(n_estimators=500, max_depth=5, learning_rate=0.03,
                                   min_samples_leaf=4, subsample=0.8, random_state=seed)
    gb.fit(feats[train_idx], y[train_idx])
    joblib.dump(rf, rf_p)
    joblib.dump(gb, gb_p)


def real_rows_of_car(cid: str):
    out = []
    for r in training_raw:
        if r.get("source") in (None, "ORIG"):
            continue
        if BP.get((r.get("brand"), r.get("price"))) == cid:
            out.append(r)
    return out


loco_results = {}
loco_mape = []
loco_max = []

if RUN_B:
    print_sep("MODE B — LEAVE-ONE-CAR-OUT GENERALIZATION (RF+GB RETRAIN)")

    snap_rf = mlmod.RF_PATH
    snap_gb = mlmod.GB_PATH
    snap_tr = mlmod.TRAINING_DATA_FILE
    anchors_backup = {cid: dict(cfg.CALIBRATED_RESALE_ANCHORS[cid])
                      for cid in cfg.CALIBRATED_RESALE_ANCHORS}

    loco_cars = sorted(cid for cid in cars.keys() if real_rows_of_car(cid))
    if B_LIMIT:
        loco_cars = loco_cars[:B_LIMIT]
    print("cars with real training rows: %d" % len(loco_cars))
    workdir = tempfile.mkdtemp(prefix="vidrive_loco_")

    for cid in loco_cars:
        excl_idx = set()
        for i, r in enumerate(training_raw):
            if r.get("source") in (None, "ORIG"):
                continue
            if BP.get((r.get("brand"), r.get("price"))) == cid:
                excl_idx.add(i)
        keep = [r for i, r in enumerate(training_raw) if i not in excl_idx]
        if len(keep) == len(training_raw):
            continue

        rf_p = os.path.join(workdir, f"{cid}_.rf.pkl")
        gb_p = os.path.join(workdir, f"{cid}_.gb.pkl")
        fit_ensemble(keep, rf_p, gb_p)

        # filtered training file so predictor group stats / shrinkage exclude car
        tr_p = os.path.join(workdir, f"{cid}_.training.json")
        with open(tr_p, "w", encoding="utf-8") as fh:
            json.dump(keep, fh, ensure_ascii=False)

        # Drop this car's calibrated anchors (real market data) for the hold-out.
        if cid in cfg.CALIBRATED_RESALE_ANCHORS:
            del cfg.CALIBRATED_RESALE_ANCHORS[cid]

        mlmod.RF_PATH = type(snap_rf)(rf_p)
        mlmod.GB_PATH = type(snap_gb)(gb_p)
        mlmod.TRAINING_DATA_FILE = type(snap_tr)(tr_p)
        mlmod._predictor = None
        get_predictor()

        car = cars[cid]
        price, brand, typ, seg = (car["price"], car["brand"], car["type"],
                                  car.get("segment", "C-Sedan"))
        apes = []
        for i in sorted(excl_idx):
            rec = training_raw[i]
            res = calculate_resale(price, brand, rec["years"], typ, seg,
                                   annual_km=rec["annual_km"], car_id=cid)
            pred = res["value"] / price
            apes.append(ape(pred, rec["resale_pct"]))
        s = summarize(apes)
        loco_results[cid] = s
        print(f"  LOCO {cid:22s} n={s['n']:2d}  MAPE={s['mape'] if s['mape'] else 0:.2f}%"
              f"  max={s['max'] if s['max'] else 0:.2f}%")

        if cid in anchors_backup:
            cfg.CALIBRATED_RESALE_ANCHORS[cid] = anchors_backup[cid]

    # Restore production models + anchors
    cfg.CALIBRATED_RESALE_ANCHORS.clear()
    cfg.CALIBRATED_RESALE_ANCHORS.update(anchors_backup)
    mlmod.RF_PATH = snap_rf
    mlmod.GB_PATH = snap_gb
    mlmod.TRAINING_DATA_FILE = snap_tr
    mlmod._predictor = None
    get_predictor()
    shutil.rmtree(workdir, ignore_errors=True)

    loco_mape = [r["mape"] for r in loco_results.values() if r["mape"] is not None]
    loco_max = [r["max"] for r in loco_results.values() if r["max"] is not None]
    if loco_mape:
        print(f"\nLOOCV: cars={len(loco_results)}  "
              f"mean car-MAPE={sum(loco_mape)/len(loco_mape):.2f}%  "
              f"median={median(loco_mape):.2f}%  "
              f"worst-car-maxAPE={max(loco_max):.2f}%")

# ---------------------------------------------------------------------------
# Mode C: invariants on every catalogue car's production curve
# ---------------------------------------------------------------------------
errors = []
mono_viol = []
vf_miss = []
bounds_viol = []

if RUN_C:
    print_sep("MODE C — INVARIANTS (ALL %d CARS)" % len(cars))

    for cid, car in cars.items():
        ec = _enrich_car(car, cid)
        try:
            yearly, _, _ = get_tco_yearly(ec, "hanoi", 15000, 30)
        except Exception as exc:  # noqa: BLE001
            errors.append((cid, "yearly", type(exc).__name__, str(exc)[:100]))
            continue
        prev = None
        for row in yearly:
            v = row["resale"]
            if prev is not None and v > prev + 1:
                mono_viol.append((cid, row["year"], prev, v))
            prev = v
        if car.get("brand") == "VinFast":
            for yr in range(1, 8):
                r = calculate_resale(car["price"], "VinFast", yr, car["type"],
                                     car.get("segment", "C-SUV"), car_id=cid)
                if not r.get("resale_note_key"):
                    vf_miss.append((cid, yr))

    for cid, car in cars.items():
        for km in (0, 5000, 30000, 60000):
            for yy in (1, 5, 10, 30):
                r = calculate_resale(car["price"], car["brand"], yy, car["type"],
                                     car.get("segment", "C-Sedan"),
                                     annual_km=km, car_id=cid)
                v = r["value"]
                if not (0 <= v <= car["price"]):
                    bounds_viol.append((cid, km, yy, v))

    print("crashes: %d  monotonicity: %d  bounds: %d  VFnote: %d" %
          (len(errors), len(mono_viol), len(bounds_viol), len(vf_miss)))
    for e in errors[:10]:
        print("  ERR", e)
    for m in mono_viol[:10]:
        print("  MONO", m)
    for m in vf_miss[:10]:
        print("  VFMISS", m)
    for b in bounds_viol[:10]:
        print("  BOUND", b)

# ---------------------------------------------------------------------------
# Aggregate + gate
# ---------------------------------------------------------------------------
print_sep("SUMMARY")

mode_a_all = [a for apes in car_year_apes.values() for a in apes]
mape_a = sum(mode_a_all) / len(mode_a_all) if mode_a_all else float("nan")
max_a = max(mode_a_all) if mode_a_all else float("nan")
mode_a_ok = RUN_A and mape_a < GATE_MAPE and max_a < GATE_MAX_APE
inv_ok = not errors and not mono_viol and not bounds_viol and not vf_miss

print(f"Mode A (production path, all real records):")
print(f"  (car,year)-median MAPE = {mape_a:.2f}%   maxAPE = {max_a:.2f}%   "
      f"({len(mode_a_all)} points)")
print(f"  gate (MAPE<{GATE_MAPE}% AND maxAPE<{GATE_MAX_APE}%): "
      f"{'PASS' if mode_a_ok else 'FAIL'}")
if loco_mape:
    print(f"Mode B (LOCO generalization, report-only): mean car-MAPE = "
          f"{sum(loco_mape)/len(loco_mape):.2f}%   median = {median(loco_mape):.2f}%")
print(f"Mode C (invariants): crashes=%d mono=%d bounds=%d vf_miss=%d " %
      (len(errors), len(mono_viol), len(bounds_viol), len(vf_miss)))
print(f"  {'PASS' if inv_ok else 'FAIL'}")

ok = mode_a_ok and inv_ok
print("\nRESULT:", "PASS" if ok else "FAIL")

with open("stress_exhaustive_out.txt", "w", encoding="utf-8") as fh:
    fh.write(f"Mode A car-year MAPE={mape_a:.2f}% maxAPE={max_a:.2f}%\n")
    if loco_mape:
        fh.write(f"Mode B LOOCV mean={sum(loco_mape)/len(loco_mape):.2f}% "
                 f"median={median(loco_mape):.2f}%\n")
    fh.write(f"Mode C crashes={len(errors)} mono={len(mono_viol)} "
             f"bounds={len(bounds_viol)} vf={len(vf_miss)}\n")
    fh.write("RESULT: %s\n" % ("PASS" if ok else "FAIL"))

sys.exit(0 if ok else 1)