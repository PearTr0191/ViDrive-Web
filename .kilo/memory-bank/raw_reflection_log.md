***
Date: 2026-08-14
TaskRef: "Code review of PressToEditNumber component + usage in TcoCalculator"

Learnings:
- PressToEditNumber.tsx commit() had dead code: clamp() already bounds the value to [min, max], so the subsequent `if (clamped < min || clamped > max)` check was always false. Error state was unreachable.
- Enter-key handler (handleKeyDown) did not guard against NaN before calling commit(), unlike handleBlur which checked Number.isNaN. Typing non-numeric text and pressing Enter would silently commit NaN→clamp→min.
- TcoCalculator.tsx used PressToEditNumber max={150000} but the adjacent range slider had max="50000". If a user typed a value >50000 via the number input, the sliderStyle CSS var would compute >100% ("--val": "202%") causing visual overflow, and aria-valuemax={50000} would be inconsistent with the actual value.

Fixes Applied:
- Extracted shared commitFromInput(input) helper that handles NaN checking, used by both handleKeyDown (Enter) and handleBlur — eliminating duplicated NaN logic.
- Removed dead error-check + setError branch from commit(); it now just clamps, clears error, calls onSave, and exits edit mode.
- Aligned PressToEditNumber max from 150000 → 50000 to match the slider in TcoCalculator.tsx.

Verification:
- tsc --noEmit: 0 errors
- vite build: ✓ built in 1.53s (500kB chunk warning is a known pseudo-error per AGENTS.md)

Improvements_Identified_For_Consolidation:
- Always run BOTH tsc --noEmit AND vite build for TS projects — tsc passes NaN-through dead-code paths and JSX syntax edge cases that Vite (rolldown/OXC) catches.
- When a number input component allows "values beyond the slider's range" by design, ensure the consuming page's slider aria-valuemax and sliderStyle max parameter are aligned to avoid accessibility and visual overflow.
***
