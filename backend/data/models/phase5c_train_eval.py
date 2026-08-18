"""Phase 5C: sophisticated + Cautious training-data expansion.

Upgrades Phase 5 in two ways:
  1. REAL holdout validation. Phase 5 scored merged models against the clean SYNTHETIC
     holdout, which guaranteed failure (noisy real data looks like an error vs clean
     synthetic). Instead we evaluate base (synthetic) vs merged (synthetic+real) on a
     held-out REAL slice — the metric that actually matters for production accuracy.
  2. Unified feature space: base and merged share the same one-hot columns (union of
     synth+real categories, zero-padded), so the comparison is apples-to-apples and
     real-only brands evaluate fairly.

Gate (cautious, auto-revert):
  ACCEPT iff:
    (a) merged_real_mae <= base_real_mae + 0.003   (real-world generalization not worse)
    (b) merged_synth_mae <= base_synth_mae + 0.004  (synthetic curve not degraded)
  --both must hold. If rejected, training_data.json / .pkl stay as-is (rollback-only).
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
import joblib

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

ORIG_FILE = HERE / "training_data.json"
REAL_FILE = HERE / "real_all.json"
RF_PATH = HERE / "resale_rf.pkl"
GB_PATH = HERE / "resale_gb.pkl"
BACKUP_DIR = HERE / "backup_phase5c"

CATS = ["brand", "segment", "car_type"]
EPS_REAL = 0.003
EPS_SYNTH = 0.004


def load_orig() -> pd.DataFrame:
    with open(ORIG_FILE, encoding="utf-8") as f:
        df = pd.DataFrame(json.load(f))
    df["log_price"] = np.log(df["price"].astype(float) + 1)
    df["km_per_year"] = df["annual_km"].astype(float)
    return df


def load_real() -> pd.DataFrame:
    with open(REAL_FILE, encoding="utf-8") as f:
        df = pd.DataFrame(json.load(f))
    df["log_price"] = np.log(df["price"].astype(float) + 1)
    df["km_per_year"] = df["annual_km"].astype(float)
    return df


def unified_columns(orig: pd.DataFrame, real: pd.DataFrame) -> list[str]:
    enc = pd.get_dummies(pd.concat([orig[CATS], real[CATS]]), prefix=CATS, drop_first=False).astype(float)
    return ["years", "km_per_year", "log_price"] + list(enc.columns)


def encode(df: pd.DataFrame, cols: list[str]) -> np.ndarray:
    enc = pd.get_dummies(df[CATS], prefix=CATS, drop_first=False).astype(float)
    X = pd.concat(
        [df[["years", "km_per_year", "log_price"]].reset_index(drop=True), enc.reset_index(drop=True)],
        axis=1,
    )
    return X.reindex(columns=cols, fill_value=0.0).to_numpy(dtype=float)


def train_model(df: pd.DataFrame, cols: list[str]):
    X = encode(df, cols)
    y = df["resale_pct"].to_numpy(dtype=float)
    rf = RandomForestRegressor(n_estimators=600, max_depth=15, min_samples_leaf=3, random_state=42, n_jobs=-1)
    gb = GradientBoostingRegressor(n_estimators=500, max_depth=5, learning_rate=0.03, min_samples_leaf=4, subsample=0.8, random_state=42)
    rf.fit(X, y)
    gb.fit(X, y)
    return rf, gb, X, y


def ensemble_mae(rf, gb, X, y) -> float:
    preds = (rf.predict(X) + gb.predict(X)) / 2.0
    return float(mean_absolute_error(y, preds))


def split_real(real: pd.DataFrame):
    """Group-aware 75/25 split: groups with >=2 rows are stratified; singletons -> train."""
    real = real.copy()
    real["grp"] = real["brand"].astype(str) + "|" + real["segment"].astype(str) + "|" + real["car_type"].astype(str)
    vc = real["grp"].value_counts()
    strat_pool = real[real["grp"].isin(vc[vc >= 2].index)]
    singletons = real[~real["grp"].isin(vc[vc >= 2].index)]
    if stratify_ok := len(strat_pool["grp"].unique()) >= 2:
        tr, te = train_test_split(strat_pool, test_size=0.25, random_state=42, stratify=strat_pool["grp"])
    else:
        tr, te = train_test_split(strat_pool, test_size=0.25, random_state=42)
    real_train = pd.concat([tr, singletons], ignore_index=True)
    real_holdout = te.reset_index(drop=True)
    return real_train, real_holdout


def main() -> None:
    orig = load_orig()
    real = load_real()
    print(f"ORIG rows: {len(orig)}  |  REAL rows: {len(real)}")

    cols = unified_columns(orig, real)
    print(f"unified feature cols: {len(cols)}")

    # Split original synthetic exactly like train_models.main (85/15) for the guardrail.
    synth_train, synth_test = train_test_split(orig, test_size=0.15, random_state=42)
    real_train, real_holdout = split_real(real)
    print(f"synth_train={len(synth_train)} synth_test={len(synth_test)}  real_train={len(real_train)} real_holdout={len(real_holdout)}")

    # BASE  = synthetic-only (current shipped behaviour)
    base_rf, base_gb, base_synth_X, base_synth_y = train_model(synth_train, cols)
    base_real_X = encode(real_holdout, cols)
    base_real_y = real_holdout["resale_pct"].to_numpy(dtype=float)
    base_synth_X = encode(synth_test, cols)
    base_synth_y = synth_test["resale_pct"].to_numpy(float)
    base_real_mae = ensemble_mae(base_rf, base_gb, base_real_X, base_real_y)
    base_synth_mae = ensemble_mae(base_rf, base_gb, base_synth_X, base_synth_y)

    # MERGED = synthetic + real
    merged_train = pd.concat([synth_train, real_train], ignore_index=True)
    mrg_rf, mrg_gb, _, _ = train_model(merged_train, cols)
    mrg_real_mae = ensemble_mae(mrg_rf, mrg_gb, base_real_X, base_real_y)
    mrg_synth_mae = ensemble_mae(mrg_rf, mrg_gb, base_synth_X, base_synth_y)

    # Also evaluate the CURRENTLY deployed (full-ORIG) model on the real holdout (context).
    deployed_real_mae = float("nan")
    try:
        import src.ml_model as M  # noqa
        M._predictor = None
        pred = M.get_predictor()
        if pred._rf is not None and pred._gb is not None and pred._feature_cols is not None:
            Xv_dep = encode(real_holdout, pred._feature_cols)
            dpreds = (pred._rf.predict(Xv_dep) + pred._gb.predict(Xv_dep)) / 2.0
            deployed_real_mae = float(mean_absolute_error(base_real_y, dpreds))
    except Exception as e:
        print("deployed eval note:", e)

    print("\n=== HOLD-OUT MAE (resale_pct) ===")
    print(f"BASE  (synthetic-only):  real_holdout MAE = {base_real_mae:.4f} | synth_test MAE = {base_synth_mae:.4f}")
    print(f"MERGED (synth+real):     real_holdout MAE = {mrg_real_mae:.4f} | synth_test MAE = {mrg_synth_mae:.4f}")
    try:
        print(f"DEPLOYED (full ORIG):    real_holdout MAE = {deployed_real_mae:.4f}")
    except Exception:
        pass

    delta_real = mrg_real_mae - base_real_mae
    delta_synth = mrg_synth_mae - base_synth_mae
    print(f"\ndelta_real  (merged-base) = {delta_real:+.4f}   (gate: <= {EPS_REAL})")
    print(f"delta_synth (merged-base) = {delta_synth:+.4f}   (gate: <= {EPS_SYNTH})")

    accept = delta_real <= EPS_REAL and delta_synth <= EPS_SYNTH
    print(f"\nGATE: {'ACCEPT' if accept else 'REJECT (keep rollback)'}")

    if accept:
        BACKUP_DIR.mkdir(exist_ok=True)
        # backup originals so we can revert
        for name, src in [("training_data.json", ORIG_FILE), ("resale_rf.pkl", RF_PATH), ("resale_gb.pkl", GB_PATH)]:
            (BACKUP_DIR / (name + ".bak")).write_bytes(src.read_bytes())
        # serialize ORIG rows then real rows.
        orig_records = json.load(open(ORIG_FILE, encoding="utf-8"))
        real_records = json.load(open(REAL_FILE, encoding="utf-8"))
        out_records = list(orig_records) + real_records
        with open(ORIG_FILE, "w", encoding="utf-8") as f:
            json.dump(out_records, f, indent=2, ensure_ascii=False)
        # retrain final on full merged (ORIG + all real)
        fcols = unified_columns(orig, real)
        frf, fgb, _, _ = train_model(pd.concat([orig, real], ignore_index=True), fcols)
        joblib.dump(frf, RF_PATH)
        joblib.dump(fgb, GB_PATH)
        print(f"\nFINAL: training_data.json now {len(out_records)} rows (ORIG + {len(real_records)} real); RF+GB retrained & saved.")
    else:
        print("\nFINAL: training_data.json & .pkl UNCHANGED (rollback-only state preserved).")
    print(f"real_holdout size = {len(real_holdout)}  (info; >=30 is meaningful)")


if __name__ == "__main__":
    main()
