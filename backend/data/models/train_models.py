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


def main():
    df = load_data()
    feature_cols = encode_features(df)
    y = df["resale_pct"].to_numpy(dtype=float)

    is_real = df["is_real"].to_numpy(bool)
    X = feature_cols.to_numpy(dtype=float)

    X_test = X[is_real]
    y_test = y[is_real]

    # Upsample real data 20x (synthetic:real ~ 1.1:1 after upsample) so real-world
    # patterns dominate training, counteracting the parametric-synthetic contamination
    # in training_data.json (2,157 synthetic vs 764 real rows). Real rows carry true
    # Vietnamese market depreciation (bonbanh+oto); synthetic rows are parametric samples.
    real_idx = np.where(is_real)[0]
    synth_idx = np.where(~is_real)[0]
    train_idx = np.concatenate([synth_idx, np.repeat(real_idx, 20)])
    np.random.seed(42)
    np.random.shuffle(train_idx)
    X_train = X[train_idx]
    y_train = y[train_idx]

    rf = RandomForestRegressor(
        n_estimators=600,
        max_depth=15,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)

    gb = GradientBoostingRegressor(
        n_estimators=500,
        max_depth=5,
        learning_rate=0.03,
        min_samples_leaf=4,
        subsample=0.8,
        random_state=42,
    )
    gb.fit(X_train, y_train)

    print(f"Train: {len(X_train)} rows ({len(synth_idx)} synth + {len(real_idx)*20} upsampled real)  |  Test: {len(X_test)} real-only rows")

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