import sys, subprocess, json
try:
    import PIL, numpy
except Exception:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pillow", "numpy"])

from PIL import Image
import numpy as np

def analyze(name):
    p = f"frontend/public/hero/lucid-{name}.jpg"
    im = Image.open(p).convert("RGB")
    W, H = im.size
    a = np.asarray(im).astype(np.float64)
    # sample background from a 12x12 corner (avoid edges)
    corner = a[2:14, 2:14].reshape(-1, 3).mean(axis=0)
    # also sample all four corners and take the most common-ish (use min diff)
    diff = np.sqrt(((a - corner) ** 2).sum(axis=2))
    # ink = clearly different from corner bg
    thr = max(35.0, diff.mean() + diff.std())
    mask = diff > thr
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return {"name": name, "W": W, "H": H, "ink": None}
    return {
        "name": name, "W": W, "H": H,
        "ink_center_y_frac": round(float(ys.mean()) / H, 4),
        "ink_center_x_frac": round(float(xs.mean()) / W, 4),
        "ink_box_top": int(ys.min()), "ink_box_bot": int(ys.max()),
        "ink_box_left": int(xs.min()), "ink_box_right": int(xs.max()),
        "ink_px": int(len(ys)),
    }

res = [analyze("light"), analyze("dark")]
print(json.dumps(res, indent=2))
