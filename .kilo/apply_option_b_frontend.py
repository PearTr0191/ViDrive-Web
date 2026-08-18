#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Apply VinFast Option B frontend disclosure edits + fix editor indent artifacts.
Exact string matching with assertions; fails loudly if a target is missing."""
import re, sys

ROOT = r"D:\Projects\ViDrive Web"

def done(msg): print("OK  " + msg)

# ── 1. api.ts: add market_value / guarantee_value to TcoResult ────────────────
p = ROOT + r"\frontend\src\lib\api.ts"
s = open(p, encoding="utf-8").read()
before = s
pat = re.compile(r"(\s*)resale_note_key\?: string\n(\s*)warnings\?: string\[\] \| null\n")
def api_repl(m):
    g1, g2 = m.group(1), m.group(2)
    return (g1 + "resale_note_key?: string\n"
            + g1 + "resale_market_value?: number | null\n"
            + g1 + "resale_guarantee_value?: number | null\n"
            + g2 + "warnings?: string[] | null\n")
new, n = pat.subn(api_repl, s)
assert n == 1, f"api.ts: expected 1 match, got {n}"
open(p, "w", encoding="utf-8").write(new)
done("api.ts: added resale_market_value/resale_guarantee_value")

# ── 2. i18n.tsx: fix broken EN indent (8->4) + add VI guaranteeFloor key ──────
p = ROOT + r"\frontend\src\lib\i18n.tsx"
s = open(p, encoding="utf-8").read()
old_en = "        'tco.predictedResale': 'Predicted Resale',\n"
new_en = "    'tco.predictedResale': 'Predicted Resale',\n"
assert s.count(old_en) == 1, f"i18n EN: expected 1, got {s.count(old_en)}"
s = s.replace(old_en, new_en)
done("i18n.tsx: fixed EN predictedResale indent (8->4)")

old_vi = "    'tco.totalDepreciation': 'Tổng khấu hao',\n"
new_vi = ("    'tco.guaranteeFloor': 'Sàn bảo hành',\n"
          "    'tco.totalDepreciation': 'Tổng khấu hao',\n")
assert s.count(old_vi) == 1, f"i18n VI: expected 1, got {s.count(old_vi)}"
s = s.replace(old_vi, new_vi)
done("i18n.tsx: added VI tco.guaranteeFloor")
open(p, "w", encoding="utf-8").write(s)

# ── 3. config.py: fix two over-indented (8->4) comment first-lines ───────────
p = ROOT + r"\backend\src\config.py"
s = open(p, encoding="utf-8").read()
fixes = [
    ("        # single calibration anchor would clamp the entire curve flat. vf8/vfe34/vf5 are",
     "    # single calibration anchor would clamp the entire curve flat. vf8/vfe34/vf5 are"),
    ("        # VinFast is omitted from this anchor table \u2014 its open-market headline floats",
     "    # VinFast is omitted from this anchor table \u2014 its open-market headline floats"),
]
for old, new in fixes:
    assert s.count(old) == 1, f"config: missing {old[:40]!r} (got {s.count(old)})"
    s = s.replace(old, new)
    done("config.py: fixed comment indent")
open(p, "w", encoding="utf-8").write(s)

# ── 4. TcoCalculator.tsx: fix broken const indent (4->2) ──────────────────────
p = ROOT + r"\frontend\src\pages\TcoCalculator.tsx"
s = open(p, encoding="utf-8").read()
old = "    const depreciationItems: Array<{\n"
new = "  const depreciationItems: Array<{\n"
assert s.count(old) == 1, f"TcoCalculator: expected 1, got {s.count(old)}"
s = s.replace(old, new)
open(p, "w", encoding="utf-8").write(s)
done("TcoCalculator.tsx: fixed depreciationItems indent (4->2)")

# ── 5. Compare.tsx: add guarantee-floor disclosure after the per-car note ─────
p = ROOT + r"\frontend\src\pages\Compare.tsx"
s = open(p, encoding="utf-8").read()
note_div = '<div className="text-[10px] text-[var(--text-muted)] mt-0.5">{t(r.resale_note_key)}</div>'
assert s.count(note_div) == 2, f"Compare note_div: expected 2, got {s.count(note_div)}"
floor_extra = (
    "\n{r.resale_guarantee_value != null && r.resale_guarantee_value > r.resale && (\n"
    "  <div className=\"text-[10px] text-[var(--text-secondary)] mt-0.5\">\n"
    "    <span className=\"font-medium\">{t('tco.guaranteeFloor')}</span>: {formatVND(r.resale_guarantee_value)}\n"
    "  </div>\n"
    ")}"
)
# Insert floor block after each note div (both ML and parametric blocks).
# Build a regex that captures leading indent per line.
pat = re.compile(r'^([ \t]*)' + re.escape(note_div) + r'$', re.M)
def cmp_repl(m):
    ind = m.group(1)
    pad = ind + "  "
    return (ind + note_div + "\n"
            + ind + "{r.resale_guarantee_value != null && r.resale_guarantee_value > r.resale && (\n"
            + pad + "<div className=\"text-[10px] text-[var(--text-secondary)] mt-0.5\">\n"
            + pad + "  <span className=\"font-medium\">{t('tco.guaranteeFloor')}</span>: {formatVND(r.resale_guarantee_value)}\n"
            + pad + "</div>\n"
            + ind + ")}")
new_s, n = pat.subn(cmp_repl, s)
assert n == 2, f"Compare: expected 2 note_div replacements, got {n}"
open(p, "w", encoding="utf-8").write(new_s)
done("Compare.tsx: added guarantee-floor disclosure (2 blocks)")

print("\nALL EDITS APPLIED.")
