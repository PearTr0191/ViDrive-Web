# -*- coding: utf-8 -*-
"""ViDrive: expose VinFast raw guarantee floor unconditionally + transparency.

Extends shipped Option B (market_value/guarantee_value) with a NEW raw floor
field `resale_guarantee_floor` that is always present for VinFast and rendered
unconditionally (even when below the open-market headline). Also fixes the
misleading CI disclaimer text and adds a Methodology transparency section.
"""
import io, re

ROOT = r"D:\Projects\ViDrive Web"
def P(rel): return ROOT + "\\" + rel

def lit(rel, old, new, expected=1):
    s = io.open(P(rel), encoding="utf-8").read()
    n = s.count(old)
    assert n == expected, f"{rel}: literal {old[:60]!r}... count {n} != {expected}"
    io.open(P(rel), "w", encoding="utf-8").write(s.replace(old, new))
    print(f"OK  literal {rel}: {n}")

def rgx(rel, pat, fn, expected, flags=re.DOTALL):
    s = io.open(P(rel), encoding="utf-8").read()
    new, n = re.subn(pat, fn, s, flags=flags)
    assert n == expected, f"{rel}: regex {pat[:70]!r}... count {n} != {expected}"
    io.open(P(rel), "w", encoding="utf-8").write(new)
    print(f"OK  regex   {rel}: {n}")

def replace_line(rel, pat, new_full_line, expected=1):
    # re.sub with a lambda so new_full_line is inserted literally (no backslash/group processing)
    rgx(rel, pat, lambda m: new_full_line, expected)

def insert_after(rel, pat, newkeys, expected=1):
    rgx(rel, pat, lambda m: m.group(0) + newkeys, expected)

# ── i18n new values ──
EN_CI_EXP    = "In 19 of 20 cases, the actual total cost lands in this range (calibrated in-distribution)."
EN_CI_DISC   = "Cars outside the calibration set can exceed this band — leave-one-car-out validation reports a ~16% mean generalization gap."
EN_CAP       = "Guarantee floor — a safety net, not a resale forecast."
EN_BELOW     = "Below the open-market estimate — the guarantee is a floor, not a forecast."
EN_METHOD    = ("The 95% confidence band combines uncertainty from registration tax, running costs "
                "(fuel, maintenance, insurance, parking/tolls), and the resale model in-distribution "
                "prediction std. It is calibrated in-distribution; leave-one-car-out (LOCO) validation "
                "reports a ~16% mean generalization gap, so real outcomes may exceed the band. For "
                "VinFast, two numbers are disclosed: the open-market resale estimate (headline, used "
                "for TCO) and the manufacturer buy-back floor (raw scheduled value, always shown). The "
                "floor is a guaranteed minimum, not a resale forecast.")

VI_CI_EXP    = "Trong 19 trên 20 trường hợp, chi phí thực tế nằm trong khoảng này (được hiệu chuẩn trong phân phái)."
VI_CI_DISC   = "Xe nằm ngoài tập calib có thể vượt khỏi dải này — kiểm thử độc lập (leave-one-car-out) cho thấy khoảng trống chung hơn ~16% trung bình."
VI_CAP       = "Sàn bảo hành — mạng lưới an toàn, không phải dự báo giá bán."
VI_BELOW     = "Dưới ước tính thị trường — cam kết là sàn, không phải dự báo."
VI_METHOD    = ("Dải tin cậy 95% kết hợp độ bất địn từ thuế đăng ký, chi phí vận hành (nhiên liệu, bảo "
                "dưỡng, bảo hiểm, đỗ xe/phí cầu) và độ lệch chuẩn dự báo giá bán lại trong phân phái "
                "mẫu. Được hiệu chuẩn trong phân phái; kiểm thử độc lập (leave-one-car-out/LOCO) ghi "
                "nhận khoảng trống chung hơn ~16% trung bình, nên kết quả thực tế có thể vượt khỏi "
                "dải. Đối với VinFast, hai con số được công bố: ước tính thị trường (số đầu, dùng "
                "cho TCO) và sàn mua lại nhà sản xuất (giá trị lịch trình thô, luôn hiển thị). Sàn là "
                "mức tối thiểu bảo hành, không phải dự báo giá bán.")

# ════════════════════════════════════════════════════════════════════════════
# 1. backend/src/calculations.py
# ════════════════════════════════════════════════════════════════════════════

# 1a. docstring note (literal, ASCII, 4-space)
lit("backend/src/calculations.py",
    "    the primary value. Non-VinFast cars return the same input for all three keys.\n    \"\"\"",
    "    the primary value. Non-VinFast cars return the same input for all three keys.\n"
    "    ``resale_guarantee_floor`` holds the raw scheduled buy-back floor (always present\n"
    "    for VinFast, None otherwise) — exposed separately so the UI can disclose it\n"
    "    even when it sits below the open-market estimate. ``market_value`` aliases the\n"
    "    headline; ``guarantee_value`` is the effective floor support (max(market, floor));\n"
    "    ``resale`` (the consumer-facing headline) is the open-market value, unchanged.\n    \"\"\"",
    1)

# 1b. _apply_vinfast_floor body — set resale_guarantee_floor (regex, em-dash-safe)
rgx("backend/src/calculations.py",
    r'    if is_vinfast:\n        floor = _vinfast_floor_value\(price, years, car_id\)\n'
    r'        if floor is not None and value < floor:\n'
    r'            # Floor is the binding.*?\n'
    r'            result\["resale_note_key"\] = "resale.vinfastLiquidityFloor"\n'
    r'            result\["vinfast_floor_applied"\] = True\n'
    r'            result\["guarantee_value"\] = round\(floor\)\n'
    r'        else:\n'
    r'            result\["resale_note_key"\] = base_note_key\n'
    r'            result\["guarantee_value"\] = round\(value\)\n'
    r'        # Option B: expose the two numbers separately\. Headline == open market\.\n'
    r'        result\["market_value"\] = round\(value\)\n'
    r'    else:\n'
    r'        result\["market_value"\] = round\(value\)\n'
    r'        result\["guarantee_value"\] = round\(value\)\n'
    r'    return result',
    lambda m:
    "    if is_vinfast:\n"
    "        floor = _vinfast_floor_value(price, years, car_id)\n"
    "        # Raw scheduled guarantee floor — always exposed for VinFast (even when it\n"
    "        # sits below the open-market headline) so the UI can disclose it unconditionally.\n"
    "        result[\"resale_guarantee_floor\"] = round(floor) if floor is not None else None\n"
    "        if floor is not None and value < floor:\n"
    "            # Floor is the binding guarantee support — disclose it, keep headline market.\n"
    "            result[\"resale_note_key\"] = \"resale.vinfastLiquidityFloor\"\n"
    "            result[\"vinfast_floor_applied\"] = True\n"
    "            result[\"guarantee_value\"] = round(floor)\n"
    "        else:\n"
    "            result[\"resale_note_key\"] = base_note_key\n"
    "            result[\"guarantee_value\"] = round(value)\n"
    "        # Option B: expose the two numbers separately. Headline == open market.\n"
    "        result[\"market_value\"] = round(value)\n"
    "    else:\n"
    "        result[\"market_value\"] = round(value)\n"
    "        result[\"guarantee_value\"] = round(value)\n"
    "        result[\"resale_guarantee_floor\"] = None\n"
    "    return result",
    1)

# 1c. calculate_resale years==0 branch — add raw floor (None; no depreciation period)
lit("backend/src/calculations.py",
    '        result["guarantee_value"] = round(price)\n        return result\n',
    '        result["guarantee_value"] = round(price)\n        result["resale_guarantee_floor"] = None\n        return result\n',
    1)

# 1d. get_tco return dict — expose raw floor to TcoResult
lit("backend/src/calculations.py",
    '        "resale_guarantee_value": resale_result.get("guarantee_value"),\n',
    '        "resale_guarantee_value": resale_result.get("guarantee_value"),\n'
    '        "resale_guarantee_floor": resale_result.get("resale_guarantee_floor"),\n',
    1)

# ════════════════════════════════════════════════════════════════════════════
# 2. backend/src/api.py — TcoResult Pydantic field (extra="forbid" → must declare)
# ════════════════════════════════════════════════════════════════════════════
lit("backend/src/api.py",
    "    resale_guarantee_value: int | None = None\n    warnings: list[str] | None = None",
    "    resale_guarantee_value: int | None = None\n"
    "    resale_guarantee_floor: int | None = None\n"
    "    warnings: list[str] | None = None",
    1)

# ════════════════════════════════════════════════════════════════════════════
# 3. frontend/src/lib/api.ts — TcoResult interface
# ════════════════════════════════════════════════════════════════════════════
lit("frontend/src/lib/api.ts",
    "  resale_guarantee_value?: number | null\n  warnings?: string[] | null",
    "  resale_guarantee_value?: number | null\n"
    "  resale_guarantee_floor?: number | null\n"
    "  warnings?: string[] | null",
    1)

# ════════════════════════════════════════════════════════════════════════════
# 4. frontend/src/lib/i18n.tsx
# ════════════════════════════════════════════════════════════════════════════
i18n = "frontend/src/lib/i18n.tsx"

# 4a. CI explainer/disclaimer rewrites (regex; ASCII-prefix disambiguates EN vs VI)
replace_line(i18n, r"'tco\.ciExplainer': 'In 19[^']*',",
    "'tco.ciExplainer': '" + EN_CI_EXP + "',", 1)
replace_line(i18n, r"'tco\.ciDisclaimer': 'Confidence interval[^']*',",
    "'tco.ciDisclaimer': '" + EN_CI_DISC + "',", 1)
replace_line(i18n, r"'tco\.ciExplainer': 'Trong 19[^']*',",
    "'tco.ciExplainer': '" + VI_CI_EXP + "',", 1)
replace_line(i18n, r"'tco\.ciDisclaimer': 'K[^']*',",   # K → Vietnamese "Khoảng..."
    "'tco.ciDisclaimer': '" + VI_CI_DISC + "',", 1)

# 4b. guaranteeFloorCaption + guaranteeFloorBelowMarket (EN + VI)
insert_after(i18n, r"    'tco\.guaranteeFloor': 'Guarantee floor',\n",
    "    'tco.guaranteeFloorCaption': '" + EN_CAP + "',\n"
    "    'tco.guaranteeFloorBelowMarket': '" + EN_BELOW + "',\n", 1)
insert_after(i18n, r"    'tco\.guaranteeFloor': 'S[^']*',\n",   # S → Vietnamese "Sàn..."
    "    'tco.guaranteeFloorCaption': '" + VI_CAP + "',\n"
    "    'tco.guaranteeFloorBelowMarket': '" + VI_BELOW + "',\n", 1)

# 4c. Methodology resale-confidence disclosure (EN + VI)
insert_after(i18n, r"    'methodology\.loanCostsFormula': 'Interest = loan[^']*',\n",
    "    'methodology.resaleConfidenceDesc': '" + EN_METHOD + "',\n", 1)
insert_after(i18n, r"    'methodology\.loanCostsFormula': 'L[^']*',\n",   # L → Vietnamese "Lãi..."
    "    'methodology.resaleConfidenceDesc': '" + VI_METHOD + "',\n", 1)

# ════════════════════════════════════════════════════════════════════════════
# 5. frontend/src/pages/TcoCalculator.tsx
# ════════════════════════════════════════════════════════════════════════════
# 5a. deprecationItems floor spread: always show RAW floor (literal)
lit("frontend/src/pages/TcoCalculator.tsx",
    "    // Option B (VinFast buyback): disclose the guarantee floor as a separate line\n"
    "    // only when it exceeds the open-market headline (i.e. the floor is binding).\n"
    "    ...(result.result.resale_guarantee_value != null && result.result.resale_guarantee_value > result.result.resale + 1\n"
    "      ? [{ label: t('tco.guaranteeFloor'), value: result.result.resale_guarantee_value, guaranteeFloor: true }]\n"
    "      : []),\n",
    "    // Option B (VinFast buyback): always disclose the RAW scheduled guarantee floor\n"
    "    // for VinFast cars (null for non-VinFast). The floor is a guaranteed minimum,\n"
    "    // not a resale forecast — the headline above is the expected open-market resale.\n"
    "    // Showing it unconditionally makes the floor visible even when it sits below\n"
    "    // the open-market estimate (previously hidden when guarantee_value == market).\n"
    "    ...(result.result.resale_guarantee_floor != null\n"
    "      ? [{ label: t('tco.guaranteeFloor'), value: result.result.resale_guarantee_floor, guaranteeFloor: true }]\n"
    "      : []),\n",
    1)

# 5b. render caption for the floor item (regex, captured indent for JSX-safe placement)
def repl_tco_label(m):
    ind = m.group('ind')
    i1 = ind + '  '
    i2 = ind + '    '
    return (
        ind + "{item.label}\n"
        + ind + "{item.guaranteeFloor && (\n"
        + i1 + '<span className="block text-[10px] text-[var(--text-muted)] mt-1">\n'
        + i2 + "{result.result.resale_guarantee_floor != null && result.result.resale_guarantee_floor < result.result.resale\n"
        + i2 + "  ? t('tco.guaranteeFloorBelowMarket')\n"
        + i2 + "  : t('tco.guaranteeFloorCaption')}\n"
        + i1 + "</span>\n"
        + ind + ")}\n"
    )
rgx("frontend/src/pages/TcoCalculator.tsx",
    r'(?P<ind>[ \t]*)\{item\.label\}\n',
    repl_tco_label, 1)

# ════════════════════════════════════════════════════════════════════════════
# 6. frontend/src/pages/Compare.tsx — BOTH identical floor blocks (count==2)
# ════════════════════════════════════════════════════════════════════════════
pat_cmp = re.compile(
    r'(?P<ind>[ \t]*)\{r\.resale_guarantee_value != null && r\.resale_guarantee_value > r\.resale && \(\n'
    r'[ \t]*<div className="text-\[10px\] text-\[var\(--text-secondary\)\] mt-0\.5">\n'
    r"[ \t]*<span className=\"font-medium\">\{t\('tco\.guaranteeFloor'\)\}</span>: \{formatVND\(r\.resale_guarantee_value\)\}\n"
    r'[ \t]*</div>\n'
    r'[ \t]*\)\}',
    re.DOTALL
)
def repl_cmp(m):
    ind = m.group('ind'); i1 = ind + '  '; i2 = ind + '    '
    return (
        ind + "{r.resale_guarantee_floor != null && (\n"
        + i1 + '<div className="text-[10px] text-[var(--text-secondary)] mt-0.5">\n'
        + i2 + "<span className=\"font-medium\">{t('tco.guaranteeFloor')}</span>: {formatVND(r.resale_guarantee_floor)}\n"
        + i1 + "</div>\n"
        + i1 + "{r.resale_guarantee_floor < r.resale && (\n"
        + i2 + '<div className="text-[10px] text-[var(--text-muted)] mt-0.5">{t(\'tco.guaranteeFloorBelowMarket\')}</div>\n'
        + i1 + ")}\n"
        + ind + ")}"
    )
rgx("frontend/src/pages/Compare.tsx", pat_cmp, repl_cmp, 2)

# ════════════════════════════════════════════════════════════════════════════
# 7. frontend/src/pages/Methodology.tsx — new transparency section
# ════════════════════════════════════════════════════════════════════════════
lit("frontend/src/pages/Methodology.tsx",
    "    descKey: 'resale.vinfastLiquidityFloor',\n    proseOnly: true,\n  },\n]",
    "    descKey: 'resale.vinfastLiquidityFloor',\n    proseOnly: true,\n  },\n"
    "  {\n"
    "    key: 'resaleConfidence',\n"
    "    icon: 'depreciation' as keyof typeof iconMap,\n"
    "    descKey: 'methodology.resaleConfidenceDesc',\n"
    "    proseOnly: true,\n"
    "  },\n]",
    1)

print("\n=== ALL EDITS APPLIED ===")
