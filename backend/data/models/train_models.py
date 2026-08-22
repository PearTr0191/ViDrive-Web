"""
Train resale prediction models (Random Forest & Gradient Boosting)
from training_data.json. Saves .pkl files to data/models/.
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
import joblib

HERE = Path(__file__).parent
DATA_FILE = HERE / "training_data.json"
RF_PATH = HERE / "resale_rf.pkl"
GB_PATH = HERE / "resale_gb.pkl"


def load_data() -> pd.DataFrame:
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    df = pd.DataFrame(raw)
    df["log_price"] = np.log(df["price"] + 1)
    df["km_per_year"] = df["annual_km"]
    df["is_real"] = df["source"].notna() & (df["source"] != "ORIG")
    return df


def encode_features(df: pd.DataFrame) -> pd.DataFrame:
    cats = ["brand", "segment", "car_type"]
    encoded = pd.get_dummies(df[cats], prefix=cats, drop_first=False).astype(float)
    result = pd.concat(
        [df[["years", "km_per_year", "log_price"]].reset_index(drop=True),
         encoded.reset_index(drop=True)],
        axis=1,
    )
    return result


REAL_UPSAMPLE_FACTOR = 20  # synthetic:real ~ 1.1:1 after upsample


def prepare_training_matrix(rows: list[dict], seed: int = 42,
                            ) -> tuple[np.ndarray, np.ndarray]:
    """Feature matrix + target with the canonical 20x real-row upsampling.

    Single source of truth shared by train_models.main(), the stress-gate's
    fit_ensemble (Mode B LOCO), and phase5c_train_eval — the three previously
    duplicated implementations whose drift risk this eliminates.
    """
    df = pd.DataFrame(rows)
    df["log_price"] = np.log(df["price"].astype(float) + 1)
    df["km_per_year"] = df["annual_km"]
    df["is_real"] = df["source"].notna() & (df["source"] != "ORIG")
    feats = encode_features(df).to_numpy(dtype=float)
    y = df["resale_pct"].to_numpy(dtype=float)
    is_real = df["is_real"].to_numpy(bool)
    real_idx = np.where(is_real)[0]
    synth_idx = np.where(~is_real)[0]
    train_idx = np.concatenate([synth_idx, np.repeat(real_idx, REAL_UPSAMPLE_FACTOR)])
    rng = np.random.RandomState(seed)
    rng.shuffle(train_idx)
    return feats[train_idx], y[train_idx]


def train_ensemble(rows: list[dict], seed: int = 42, n_jobs: int = -1
                   ) -> tuple[RandomForestRegressor, GradientBoostingRegressor]:
    X_train, y_train = prepare_training_matrix(rows, seed=seed)
    rf = RandomForestRegressor(
        n_estimators=600, max_depth=15, min_samples_leaf=2,
        random_state=seed, n_jobs=n_jobs,
    )
    rf.fit(X_train, y_train)
    gb = GradientBoostingRegressor(
        n_estimators=500, max_depth=5, learning_rate=0.03,
        min_samples_leaf=4, subsample=0.8, random_state=seed,
    )
    gb.fit(X_train, y_train)
    return rf, gb


def main():
    df = load_data()
    feature_cols = encode_features(df)
    y = df["resale_pct"].to_numpy(dtype=float)

    is_real = df["is_real"].to_numpy(bool)
    X = feature_cols.to_numpy(dtype=float)

    X_test = X[is_real]
    y_test = y[is_real]

    # Upsample real data 20x so real-world patterns dominate training, counteracting
    # the parametric-synthetic contamination in training_data.json (2,157 synthetic vs
    # 764 real rows). Real rows carry true Vietnamese market depreciation
    # (bonbanh+oto); synthetic rows are parametric samples.
    rf, gb = train_ensemble(df.to_dict("records"))

    synth_count = int((~df["is_real"]).sum())
    real_count = int(df["is_real"].sum())
    print(f"Train: {synth_count + real_count * REAL_UPSAMPLE_FACTOR} rows "
          f"({synth_count} synth + {real_count * REAL_UPSAMPLE_FACTOR} upsampled real)"
          f"  |  Test: {len(X_test)} real-only rows")

    for name, model in [("RF", rf), ("GB", gb)]:
        preds = model.predict(X_test)
        mae = mean_absolute_error(y_test, preds)
        mape = mean_absolute_percentage_error(y_test, preds) * 100
        print(f"{name}  | MAE: {mae:.4f}  | MAPE: {mape:.2f}%")

    # Ensemble MAE/MAPE on real-only test
    ens_preds = (rf.predict(X_test) + gb.predict(X_test)) / 2.0
    ens_mae = mean_absolute_error(y_test, ens_preds)
    ens_mape = mean_absolute_percentage_error(y_test, ens_preds) * 100
    print(f"ENS | MAE: {ens_mae:.4f}  | MAPE: {ens_mape:.2f}%")

    joblib.dump(rf, RF_PATH)
    joblib.dump(gb, GB_PATH)
    print(f"Models saved to {RF_PATH.parent}")


if __name__ == "__main__":
    main()