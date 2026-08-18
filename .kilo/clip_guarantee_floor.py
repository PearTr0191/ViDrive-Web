# -*- coding: utf-8 -*-
import re, sys

P = r"D:\Projects\ViDrive Web\frontend\src\pages\TcoCalculator.tsx"
s = open(P, encoding="utf-8").read()
orig = s

# 1) add index param so we can cap by year position
old_map = r'\(entry: YearlyBreakdownEntry\) => \(\{'
assert len(re.findall(old_map, s)) == 1, f'map opener: {len(re.findall(old_map, s))} (expected 1)'
s = re.sub(old_map, '(entry: YearlyBreakdownEntry, i) => ({', s, count=1)

# 2) replace the old comment + guarantee block with a window-capped guarantee
old_block = r'// VinFast buyback guarantee is a FIXED window.*?:\s*null,'
new_block = (
    '// VinFast buyback guarantee is a FIXED window: the per-year floor is the guarantee\n'
    '        // ONLY inside it; past it (S10 post-window decay, config.py\n'
    '        // VINFAST_FLOOR_DECAY=0.095) there is no buyback promise, so the dashed floor\n'
    '        // line terminates at the window end and the green market-resale line continues\n'
    '        // (merge into the main line where support ends). vfWindowEnd (above) is the\n'
    '        // first post-window year; keep the floor only where i < vfWindowEnd.\n'
    '        guarantee:\n'
    '          entry.resale_guarantee_value != null && i < vfWindowEnd\n'
    '            ? entry.resale_guarantee_value\n'
    '            : null,'
)
assert re.search(old_block, s, re.DOTALL), 'old guarantee block not found'
s, n = re.subn(old_block, new_block, s, count=1, flags=re.DOTALL)
assert n == 1, f'old block replace count={n}'

# 3) insert vfWindowEnd detection block immediately before `    const baseLineData:`
vf_block = (
    '    // VinFast buyback guarantee is a FIXED window. Detect its last guaranteed year\n'
    '    // from the raw floors: schedule ratios (0.914..1.0 for the 5-yr ramp; flat 1.0\n'
    '    // for the 3-yr liquidity floor) are all > the decay ratio 1-0.095=0.905, so the\n'
    '    // window ends at the first year whose floor-to-previous-floor ratio <= 0.905.\n'
    '    const rawFloors = (yearlyData?.yearly ?? []).map((e: YearlyBreakdownEntry) => e.resale_guarantee_value);\n'
    '    let vfWindowEnd = rawFloors.length;\n'
    '    for (let k = 1; k < rawFloors.length; k++) {\n'
    '      const cur = rawFloors[k], prev = rawFloors[k - 1];\n'
    '      if (cur != null && prev != null && prev > 0 && cur / prev <= 1 - 0.095 + 1e-9) { vfWindowEnd = k; break; }\n'
    '    }\n'
    '    const baseLineData: { year: string; resale: number; operating: number; cumulative: number; guarantee?: number | null }[] = yearlyData?.yearly'
)
old_decl = '    const baseLineData: { year: string; resale: number; operating: number; cumulative: number; guarantee?: number | null }[] = yearlyData?.yearly'
assert s.count(old_decl) == 1, f'decl: {s.count(old_decl)} (expected 1)'
s = s.replace(old_decl, vf_block, 1)

assert s != orig, 'no change applied'
open(P, "w", encoding="utf-8").write(s)
print("OK clip_guarantee_floor applied")
