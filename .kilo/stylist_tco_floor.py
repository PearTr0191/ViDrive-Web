#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Add guaranteeFloor label styling (muted color + lock icon) to the
depreciationItems render site ONLY in TcoCalculator.tsx.

Why scoped: acquisition/operations item types do NOT declare `guaranteeFloor`,
so `item.guaranteeFloor` would be a tsc error outside the depreciation map.
The depreciationItems array type DOES declare `guaranteeFloor?: boolean`,
so the styled span is valid only there. We anchor on `{depreciationItems.map`
and replace the single label span within that block."""
import pathlib
import re

p = pathlib.Path(r"D:\Projects\ViDrive Web/frontend/src/pages/TcoCalculator.tsx")
s = p.read_text(encoding="utf-8")

anchor = '{depreciationItems.map((item, i) => ('
idx = s.index(anchor)
head, tail = s[:idx], s[idx:]

pat = re.compile(r'<span className="text-sm text-\[var\(--text-secondary\)\]">\n( +)\{item\.label\}')
matches = pat.findall(tail)
assert len(matches) == 1, f"expected 1 label span in depreciation map block, got {len(matches)}"

def repl(m):
    ind = m.group(1)
    return (
        '<span className={`text-sm ${item.guaranteeFloor ? \'text-[var(--text-muted)]\' : \'text-[var(--text-secondary)]\'`}>\n'
        + ind + '{item.guaranteeFloor && <span aria-hidden="true" className="mr-1">🔒</span>}\n'
        + ind + '{item.label}'
    )

tail2, n = pat.subn(repl, tail, count=1)
assert n == 1, f"expected 1 replacement, got {n}"
p.write_text(head + tail2, encoding="utf-8")
print("TcoCalculator.tsx: guaranteeFloor label styling applied to depreciation render (muted + 🔒)")
