"""Merge the eyeball-reviewed palisade+german real records.

Bypasses `merge_into_training`: it has a latent KeyError on training_data rows
that lack an `id` field (the ~2,157 synthetic ORIG rows), so it cannot run against
the current training_data.json. Direct append is faithful & idempotent instead:
the candidates are already fully-formed real records (resale_pct = used/MSRP in
[0.15, 0.95], source = oto/bonbanh -> is_real=True for the shrinkage blend).

- training_data.json: +241 real rows (all candidates, dedup by synthetic uid;
  matches the codebase's ~2x real-rows-per-cell richness that real_all (41)
  already collapses).
- real_all.json: +41 deduped real rows (cell key) -> ad-hoc holdout eval set.
- bonbanh_real.json / oto_real.json: UNTOUCHED. The shipped gate (Mode A = bonbanh+oto,
  390 baseline) stays intact as the retrain regression check; Mode C
  (all 82 catalogue cars) validates the new anchors' invariants (monotonic,
  bounded, no crashes, VF notes).

Calibrated anchors already live in config.py CALIBRATED_RESALE_ANCHORS.
"""
import io
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from multi_source_scraper import _norm  # noqa: E402

CAND = json.load(io.open(HERE / "pal_german_candidates.json", encoding="utf-8"))
REAL = json.load(io.open(HERE / "pal_german_real.json", encoding="utf-8"))


def uid(r: dict) -> str:
    return (
        f"pg_{r['brand']}_{_norm(r['model'])}_{r['years']}yr_"
        f"{r['annual_km']}km_{r['resale_value']}"
    )


# --- training_data.json: full candidate set (dedup by unique_id) ---
TD = HERE / "training_data.json"
td = json.load(io.open(TD, encoding="utf-8"))
existing = {r.get("id") for r in td}
added_td = 0
for r in CAND:
    u = uid(r)
    if u in existing:
        continue
    existing.add(u)
    td.append({
        "id": u,
        "brand": r["brand"],
        "model": r["model"],
        "segment": r["segment"],
        "car_type": r["car_type"],
        "price": r["price"],
        "years": r["years"],
        "annual_km": r["annual_km"],
        "resale_value": r["resale_value"],
        "resale_pct": r["resale_pct"],
        "source": r["source"],
    })
    added_td += 1
with io.open(TD, "w", encoding="utf-8") as f:
    json.dump(td, f, indent=2, ensure_ascii=False)
print(f"training_data.json: +{added_td} real rows -> total {len(td)}")

# --- real_all.json: deduped holdout (codebase cell key) ---
RA = HERE / "real_all.json"
real = json.load(io.open(RA, encoding="utf-8"))
keyf = lambda r: (r["brand"], r["model"], r["years"], r["annual_km"])
seen = {keyf(r) for r in real}
added_ra = 0
for r in REAL:
    k = keyf(r)
    if k in seen:
        continue
    seen.add(k)
    real.append(r)
    added_ra += 1
with io.open(RA, "w", encoding="utf-8") as f:
    json.dump(real, f, indent=2, ensure_ascii=False)
print(f"real_all.json: +{added_ra} real rows -> total {len(real)}")
