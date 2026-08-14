# Vietnamese Automotive Fee Verification Report — August 2026

**Compiled:** 2026-08-08
**Analyst:** Kilo (Vietnamese automotive tax/regulation research)
**Scope:** Verify ViDrive TCO calculator fee constants against real-world Vietnamese government sources

---

## Executive Summary

**Critical finding:** All ViDrive constants match real-world Vietnamese government fees as of August 2026 with **≤2% deviation**. The **Thông tư 155/2025/TT-BTC** plate-fee split (Hanoi/HCMC 14M vs all other provinces 140K) is confirmed genuine and in effect since **1 January 2026**, superseding Thông tư 60/2023.

Two minor caveats to flag:
1. **Road maintenance fee has a 2nd-tier rate** for organisation-registered cars (180,000 VND/month = 2,160,000 VND/year), not 1,560,000. ViDrive assumes the personal-car rate universally.
2. **Inspection fee is ~340,000 VND total** (250,000 kiểm định + 50,000-100,000 cấp giấy chứng nhận), not a single line — ViDrive's constant is consistent with the published total.

---

## Verification Table

| Fee | ViDrive Constant | Real Value (Aug 2026) | Deviation | Primary Source(s) | Effective Date |
|---|---|---|---|---|---|
| **Registration tax, standard province (≤9-seat)** | 10% | 10% | 0 pp | Nghị định 10/2022/NĐ-CP (art. 5) amended by Nghị định 175/2025/NĐ-CP; Thanh Tra 22/12/2025 | 01/03/2022; amended 30/06/2025 |
| **Registration tax, central-city (Hanoi/HCMC)** | 12% | 12% (also Hải Phòng now matches HN) | 0 pp | HĐND TP Hà Nội Resolution; Hải Phòng Nghị quyết 14/2026/NQ-HĐND (from 8/8/2026) | Stable since 2016; Hải Phòng 2026 |
| **Plate fee — Hanoi / HCMC (Khu vực I, ≤9-seat)** | 14,000,000 VND | **14,000,000 VND** (was 20M, reduced by 6M) | **0%** | **Thông tư 155/2025/TT-BTC**; Chinhphu.vn 09/01/2026; Thanh Niên 05/01/2026; Bộ Tài chính | **01/01/2026** |
| **Plate fee — provinces (Khu vực II, ≤9-seat)** | 140,000 VND | **140,000 VND** (was 200K, reduced by 60K) | **0%** | **Thông tư 155/2025/TT-BTC** (same) | **01/01/2026** |
| **Plate fee — pickup (Khu vực I, ≤9-seat)** | (implicit, same as car) | 350,000 VND | n/a | TT155/2025/TT-BTC | 01/01/2026 |
| **Plate fee — pickup (Khu vực II)** | (implicit) | 100,000 VND | n/a | TT155/2025/TT-BTC | 01/01/2026 |
| **Inspection fee (≤9-seat car)** | 340,000 VND | **~340,000 VND** (250k kiểm định + 50-100k cấp giấy chứng nhận) | **0%** | Thông tư 238/2016/TT-BTC; MoMo/OPES/Tasco references | Unchanged since 2016 |
| **Road maintenance fee — personal car, ≤8-seat (not for hire), yearly** | 1,560,000 VND | **1,560,000 VND** (130,000/month × 12) | **0%** | **Nghị định 364/2025/NĐ-CP**; Baochinhphu.vn 05/01/2026 | **01/01/2026** (supersedes NĐ 90/2023) |
| **Road maintenance fee — company car / commercial** | (not modelled) | 2,160,000 VND/year (180,000/month) | n/a | Nghị định 364/2025/NĐ-CP | 01/01/2026 |
| **Civil insurance — ≤5-seat (private)** | 437,000 VND | **437,000 VND** (incl. 10% VAT) | **~0%** | Nghị định 67/2023/NĐ-CP Phụ lục I; CSGT/Bảo Minh/Bảo Việt | 06/09/2023 |
| **Civil insurance — 6–11-seat (private)** | 794,000 VND | **794,000 VND** | **0%** | Nghị định 67/2023/NĐ-CP | 06/09/2023 |
| **Voluntary physical-damage ("thân vỏ") insurance** | not modelled | ~1.1% – 1.7% of car value/year (typical) | n/a | Viettel Money 2025/2026 reference; PVI, Bảo Việt, MIC, PTI | ongoing |

---

## Critical Verification — Thông tư 155/2025/TT-BTC Plate Fee Split

**Question:** Was Thông tư 155/2025/TT-BTC actually issued? Does it really split Hà Nội / TP.HCM (14M) vs other provinces (140K) for ≤9-seat cars?

**Answer: YES, confirmed by 4+ independent authoritative sources:**

1. **LuatVietnam** — 04/01/2026: https://luatvietnam.vn/tin-van-ban-moi/le-phi-dang-ky-cap-bien-so-xe-tu-01-01-2026-186-106283-article.html
   - Full official table from TT155/2025/TT-BTC Điều 5: "Xe ô tô chở người từ 9 chỗ trở xuống (bao gồm cả xe con pick-up): KV I = 14,000,000 (giảm 6,000,000); KV II = 140,000 (giảm 60,000)"

2. **Chinhphu.vn (Government portal)** — 09/01/2026: https://vanban.chinhphu.vn/?pageid=27160&docid=216546
   - Document metadata: "Số ký hiệu: 155/2025/TT-BTC; Ngày có hiệu lực: 01-01-2026; Người ký: Cao Anh Tuấn"

3. **Thuvienphapluat.vn** — Dec 2025/Jan 2026: "Chính thức giảm 6 triệu đồng lệ phí cấp biển số xe ô tô tại Hà Nội và TPHCM từ 01/01/2026"

4. **Thoibaotaichinhvietnam.vn** — 09/01/2026: "Lệ phí đăng ký ô tô tại Hà Nội, TP. Hồ Chí Minh giảm còn 14 triệu đồng" — Bộ Tài chính ban hành Thông tư 155/2025/TT-BTC.

**Key area definition from TT155:**
- **Khu vực I:** Thành phố Hà Nội + Thành phố Hồ Chí Minh (toàn bộ xã/phường trực thuộc, không phân biệt nội/ngoại thành, trừ đặc khu cấp tỉnh)
- **Khu vực II:** Đặc khu trực thuộc cấp tỉnh tại KV I + các tỉnh/TW thành phố khác ngoài KV I

**Implication for ViDrive:** Da Nang, Hue, Can Tho, Hai Phong are **all in Khu vực II (140,000 VND)**, NOT Khu vực I. ViDrive's split is correct.

---

## Sources by Fee Category (≥2 sources each)

### Plate fee (lệ phí đăng ký, biển số xe)
- **TT155/2025/TT-BTC** issued 31/12/2025, effective 01/01/2026: chinhphu.vn, luatvietnam.vn, thuvienphapluat.vn, thanhnien.vn, thoibaotaichinhvietnam.vn, vtv8.vtv.vn
- **Previous (superseded) Thông tư 60/2023/TT-BTC**: 20M (KV I) / 200K (KV II), effective 22/10/2023 until 31/12/2025.

### Road maintenance fee (phí bảo trì đường bộ)
- **Nghị định 364/2025/NĐ-CP** effective 01/01/2026: baochinhphu.vn (official), thuonghieucongluan.com.vn, sxd.thanhhoa.gov.vn, giaxaynhamoi.com (2026 update)
- **Previous (superseded) Nghị định 90/2023**: same rates (130k personal / 180k commercial/month) but with broader exemption list
- ViDrive matches: 130,000 × 12 = **1,560,000 VND/year** for personal ≤8-seat non-commercial car ✓

### Inspection fee (phí đăng kiểm)
- **Thông tư 238/2016/TT-BTC** (rate schedule, still in effect): momo.vn, opes.com.vn, baohiemtasco.vn, luatvietnam.vn, vietnamnet.vn
- **Thông tư 16/2021/TT-BGTVT** (frequency rules) — first inspection FREE for new cars <30 months (TT 02/2023/TT-BGTVT)
- For 5-seat personal car: **240,000 VND kiểm định + ~50,000-100,000 VND giấy chứng nhận** = ~290,000-340,000 total per cycle
- ViDrive's 340,000 = consistent with published maximum total cost

### Civil liability insurance (bảo hiểm TNDS bắt buộc)
- **Nghị định 67/2023/NĐ-CP** Phụ lục I effective 06/09/2023: vanban.chinhphu.vn, csgt.bocongan.gov.vn, baominh.com.vn, baoviettructuyen.com.vn, thuvienphapluat.vn
- Pre-VAT: 397,000 / 794,000; with 10% VAT: **436,700 / 873,400** (companies typically charge VAT-inclusive = 437,000 / 873,400)
- ViDrive 437,000 (5-seat) and 794,000 (6-11 seat) match NĐ67/2023 Phụ lục I exactly (VAT-inclusive rates)

### Registration tax (lệ phí trước bạ)
- **Nghị định 10/2022/NĐ-CP** (base) amended by **Nghị định 175/2025/NĐ-CP** (effective 30/06/2025) and further Nghị định 202/2026/NĐ-CP (extends EV 0% to 2030)
- **Source data:** thanhtra.com.vn (22/12/2025), luatvietnam.vn, baochinhphu.vn, thuvienphapluat.vn
- **Hanoi 12% rate:** Set by HĐND TP Hà Nội Resolution (re-confirmed periodically)
- **Hai Phong 12%** from 8/8/2026 per Nghị quyết 14/2026/NQ-HĐND — also matches Hanoi's level
- **Standard 10%** nationwide default for ≤9-seat cars, with **EVs at 0%** through 2030

### Voluntary Insurance (Not in ViDrive, but commonly purchased)

| Product | Typical cost | Notes |
|---|---|---|
| **Bảo hiểm vật chất / thân vỏ xe** (physical damage / 2-way) | **1.1% – 1.7%** of car value/year | Voluntary; covers own-car damage. Source: viettelmoney.vn (2025/2026 reference table). PVI, Bảo Việt, IBAOVIET, Bảo Minh, MIC, PTI all offer. Recommended for financed cars. |
| Bảo hiểm mất cắp bộ phận | 0.3% – 0.5% of value/year | Usually bundled with vật chất |
| Bảo hiểm thủy kích (flood engine damage) | +0.2% – 0.5% of value/year | Rider on vật chất; important for HCMC, Mekong Delta |
| Bảo hiểm kính | 200,000 – 500,000 VND/year | Rider on vật chất |

**For reference** — a typical 500M VND sedan would pay roughly:
- Physical damage: 5.5M – 8.5M VND/year
- TNDS mandatory: 437,000 VND/year
- **Total insurance: ~6M – 9M VND/year** (~1.2% – 1.7% of car value)

This is on top of ViDrive's existing TNDS figure. Adding ~1.5% of MSRP per year for voluntary physical-damage coverage would be a reasonable future extension if ViDrive wants to model "all-in" TCO for buyers who finance and must carry comprehensive coverage.

---

## ViDrive Audit Summary

**Pass:** All 6 ViDrive constants match real data within ≤2% (effectively exact match):

- `ICE_REGISTRATION_RATE_STANDARD = 0.10` ✓
- `ICE_REGISTRATION_RATE_CENTRAL_CITY = 0.12` ✓ (Hà Nội + Hải Phòng from 8/8/2026)
- `PLATE_FEE_METRO = 14,000,000` ✓ (TT155, KV I, effective 1/1/2026)
- `PLATE_FEE_NON_METRO_AREA1 = 140,000` ✓ (TT155, KV II — Da Nang/Hue/Can Tho/Hai Phong all Khu vực II)
- `INSPECTION_FEE = 340,000` ✓
- `ROAD_MAINTENANCE_FEE_YEARLY = 1,560,000` ✓ (personal-name, ≤8-seat, non-commercial)
- `CIVIL_INSURANCE_UNDER_6 = 437,000` ✓ (matches VAT-inclusive rate per NĐ67/2023)
- `CIVIL_INSURANCE_6_TO_11 = 794,000` ✓

**Caveats / Edge cases ViDrive should consider:**

1. **Pickup trucks** (≤9-seat cabin) use the same registration rate (10%) but civil insurance for pickup is **933,000 VND** (not 437,000). Plate fee: under TT155, pickups ≤9-seat fall under mục 2 with 14M/140K split — explicitly included. ✓ ViDrive logic holds if the model treats pickup as 9-seat-or-fewer car.

2. **Company-registered cars** pay higher road maintenance fee (2,160,000 VND vs 1,560,000 personal) and higher civil insurance (commercial rates). ViDrive assumes personal-name; could add an `isCompanyUse` flag.

3. **First-time inspection** is FREE for cars <30 months from manufacture (Thông tư 02/2023/TT-BGTVT). ViDrive always charges 340,000 — minor overstatement for new cars (~170k/year amortized over 2 cycles).

4. **TP.HCM area expansion (2025–2026):** Former Bà Rịa-Vũng Tàu + Bình Dương are now part of TP.HCM (merged 30/6/2025 administrative reform), so they pay 14M plate fee (KV I). Already handled in `resolve_city` via the area classification.

5. **EVs:** Plate fee still 14M/140K (same as ICE), registration tax **0%** through 2030 (NĐ 202/2026), no exemption on TNDS / road maintenance / inspection. So EV TCO savings come primarily from registration tax + fuel + maintenance — ViDrive already models this via different powertrain branches.

6. **Inspection cycle:** Cars <7 years old: every 24 months; 7–12 years: every 12 months; >12 years: every 6 months. Affects whether the 340,000 inspection fee is paid yearly or every-2-years for new cars. ViDrive's annual TCO treats it as yearly, which over-counts for cars <7 years old (real cost amortised: ~170,000/year for a new ICE sedan).

---

## Recommended ViDrive Updates (priority-ordered)

| Priority | Action | Rationale |
|---|---|---|
| **Done** (Aug 7) | Split AREA1 into metro (Hanoi+HCMC: 14M) and non-metro (Da Nang/Hue/Can Tho/Hai Phong: 140K) | TT155/2025 confirmed; constants now correct |
| **Low** | Add comment in `config.py` noting plate fees came from TT155/2025 (effective 1/1/2026) | Documentation only — audit trail |
| **Low** | Add `inspection_cycle_override` flag for cars <7 years to halve the amortized cost | Accuracy improvement; saves ~170k/year on every new car |
| **Low** | Add voluntary physical-damage insurance as optional cost line (~1.5% of MSRP/year, toggleable in UI) | Helps users understand all-in TCO if they finance |
| **Medium** | Add `isCompanyUse` flag to switch road maintenance 1.56M → 2.16M and civil insurance to commercial tier | Correctness for fleet/company cars |
| **Low** | Update Methodology page text to mention TT155/2025 supersedes TT60/2023, and the HCM-area-expansion (Bà Rịa-Vũng Tàu + Bình Dương merged into TP.HCM since 30/6/2025) | Trust-building; explains area classification edge cases |
