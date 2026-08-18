#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Normalize the TcoResult field block (api.ts) to consistent 2-space indent.
Verifies each line's field name matches before rewriting, so we never clobber
unrelated content."""
import pathlib

p = pathlib.Path(r"D:\Projects\ViDrive Web/frontend/src/lib/api.ts")
L = p.read_text(encoding="utf-8").split("\n")

correct = [
    "  resale: number",
    "  resale_logic: string",
    "  resale_spread?: number",
    "  resale_std?: number",
    "  resale_note_key?: string",
    "  resale_market_value?: number | null",
    "  resale_guarantee_value?: number | null",
    "  warnings?: string[] | null",
    "  depreciation: number",
    "  opp_cost: number",
    "  liquidity: string",
    "  tco: number",
    "  true_financial_impact: number",
    "  monthly: number",
    "  confidence_low?: number | null",
    "  confidence_high?: number | null",
    "  ml_max_year?: number | null",
]

start = 77  # 0-indexed line 78
for i, exp in zip(range(start, start + len(correct)), correct):
    cur_stripped = L[i].lstrip()
    assert cur_stripped == exp.lstrip(), f"line {i+1} field mismatch: {L[i]!r} != {exp!r}"
    L[i] = exp

p.write_text("\n".join(L), encoding="utf-8")
print(f"api.ts: normalized lines {start+1}-{start+len(correct)} to 2-space (verified field names)")
