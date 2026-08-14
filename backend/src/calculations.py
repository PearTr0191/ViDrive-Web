from src.config import *
from datetime import date
import json
import re
import unicodedata
from pathlib import Path
from src.ml_model import get_predictor


def _strip_diacritics(text: str) -> str:
    """Normalize Vietnamese diacritics to ASCII for fuzzy matching."""
    normalized = unicodedata.normalize("NFD", text)
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


# Aliases that appear in addresses / official names but never in CITY_LIST keys.
# Stripped BEFORE matching against canonical keys.
_CITY_ALIAS_PREFIXES = (
    "thanh pho ", "tp ", "tinh ", "thua thien ",
)
_CITY_ALIAS_SUFFIXES = (
    " city", " thanh pho", " tp",
)
# Compact-form aliases (no spaces) — used to collapse province prefixes that
# otherwise get welded together (e.g. "thuathienhue" -> "thua thien hue" -> "hue").
_COMPACT_ALIAS_SUFFIXES = (
    "thanhpho", "tinh",
)


def _normalize_city_token(city: str) -> tuple[str, str]:
    """Return (key, key_compact) after diacritic strip + separator + alias normalization.

    Handles kebab/snake/dot slugs, Vietnamese administrative prefixes
    ("thanh pho", "tp", "tinh", "thua thien") and the English "city" suffix
    so that inputs like "ho-chi-minh-city", "thanh-pho-ho-chi-minh",
    "thuathienhue", "thua-thien-hue" all resolve to canonical entries.
    """
    if not city:
        return "", ""
    raw = city.replace("-", " ").replace("_", " ").replace(".", " ")
    raw = _strip_diacritics(raw.lower().strip())
    for prefix in _CITY_ALIAS_PREFIXES:
        if raw.startswith(prefix):
            raw = raw[len(prefix):]
    for suffix in _CITY_ALIAS_SUFFIXES:
        if raw.endswith(suffix):
            raw = raw[: -len(suffix)]
    # Handle compact province-prefix forms (no spaces) — e.g. "thuathienhue"
    # has no separators to split on; we re-add the space before "hue".
    for prefix in ("thua thien ",):
        if prefix.strip().replace(" ", "") in raw.replace(" ", ""):
            # Collapse and re-insert the canonical split
            raw = "hue"
            break
    raw = raw.strip()
    key_compact = raw.replace(" ", "")
    return raw, key_compact


def get_area_tier(city: str) -> int:
    """Resolve city name to area tier with fuzzy matching and diacritics support."""
    key, key_compact = _normalize_city_token(city)
    if not key:
        return 2
    if any(key_compact == c.replace(" ", "") or key == c for c in AREA1_CITIES):
        return 1
    if any(key_compact == c.replace(" ", "") or key == c for c in AREA2_PROVINCES):
        return 2
    return 2


def is_area1_metro(city: str) -> bool:
    """Return True if the city is Hanoi/HCMC core where apartment parking
    is materially more expensive than other Area-1 cities."""
    key, key_compact = _normalize_city_token(city)
    if not key:
        return False
    # Normalize by removing spaces so "HoChiMinh" matches "ho chi minh"
    return any(
        key_compact == m.replace(" ", "") or key == m or m in key_compact or m.replace(" ", "") in key_compact
        for m in AREA1_METRO_CITIES
    )


def resolve_city(city: str) -> tuple[str, int]:
    """Resolve a city input to (display_name, area_tier) with fuzzy matching.

    Accepts diacritics, abbreviations, kebab/snake slugs, Vietnamese
    administrative prefixes ("thanh pho", "tinh", "thua thien") and the
    English "city" suffix. Returns the canonical display name and area tier.
    """
    if not city:
        return "", 2
    key, key_compact = _normalize_city_token(city)
    if not key:
        return "", 2

    # Check direct matches in CITY_LIST
    for display, norm_key, area, diacritic_key in CITY_LIST:
        dk = _strip_diacritics(diacritic_key)
        if key == norm_key or key == dk or key_compact == norm_key.replace(" ", "") or key_compact == dk.replace(" ", ""):
            return display, area

    # Check AREA1_CITIES and AREA2_PROVINCES for any remaining entries
    if any(key_compact == c.replace(" ", "") or key == c for c in AREA1_CITIES):
        # Find the display name
        for display, norm_key, area, _ in CITY_LIST:
            if norm_key.replace(" ", "") == key_compact or norm_key == key:
                return display, area
        return city.title(), 1
    if any(key_compact == c.replace(" ", "") or key == c for c in AREA2_PROVINCES):
        for display, norm_key, area, _ in CITY_LIST:
            if norm_key.replace(" ", "") == key_compact or norm_key == key:
                return display, area
        return city.title(), 2

    # Fuzzy match: check if any city name contains the input (space-insensitive)
    best_match = None
    best_len = float("inf")
    for display, norm_key, area, diacritic_key in CITY_LIST:
        dk = _strip_diacritics(diacritic_key)
        nk_compact = norm_key.replace(" ", "")
        dk_compact = dk.replace(" ", "")
        if key_compact in nk_compact or key_compact in dk_compact or key in norm_key or key in dk:
            if len(norm_key) < best_len:
                best_match = (display, area)
                best_len = len(norm_key)

    if best_match:
        return best_match

    # Default to Area 2
    return city.title(), 2


def load_data():
    cars_file = Path(__file__).parent.parent / "data" / "cars.json"
    if not cars_file.exists():
        return {}
    with cars_file.open("r", encoding="utf-8") as f:
        raw = json.load(f) or {}
    try:
        sorted_items = sorted(
            raw.items(),
            key=lambda kv: (kv[1].get("brand", "").lower(), kv[1].get("model", "").lower()),
        )
        return dict(sorted_items)
    except Exception:
        return raw


def calculate_registration(price, city, car_type, purchase_date=None, area=None):
    """Registration tax + plate fee, auto-resolved by area tier.

    Per Thông tư 155/2025/TT-BTC (effective Jan 1 2026):
    - Hanoi and HCMC: 12% registration tax + 14M plate fee.
    - Other Area-1 cities (Da Nang, Hue, Can Tho, Hai Phong): 10% standard
      registration tax + 140K plate fee (same as Area-2/3).
    - Area-2/3: 10% standard registration tax + 140K plate fee.
    """
    if area is None:
        area = get_area_tier(city)
    is_metro = is_area1_metro(city) if area == 1 else False
    tax_rate = ICE_REGISTRATION_RATE_CENTRAL_CITY if is_metro else ICE_REGISTRATION_RATE_STANDARD

    if car_type in ["ICE", "ICE-D", "HEV"]:
        tax = price * tax_rate
    elif car_type == "EV":
        today = purchase_date or date.today()
        tax = 0.0 if today <= EV_EXEMPTION_END_DATE else price * tax_rate * EV_POST_EXEMPTION_DISCOUNT
    else:
        tax = 0.0

    if area == 1:
        plate = PLATE_FEE_METRO if is_metro else PLATE_FEE_NON_METRO_AREA1
    else:
        plate = PLATE_FEES[area]
    return {
        "tax": round(tax),
        "plate": round(plate),
        "inspection": round(INSPECTION_FEE),
        "total": round(tax + plate + INSPECTION_FEE),
    }


def _model_year_for(car: dict) -> int:
    """Resolve a car's model/production year; fall back to the car-id year suffix."""
    my = car.get("model_year")
    if my:
        try:
            return int(my)
        except (TypeError, ValueError):
            pass
    car_id = car.get("id", "")
    m = re.search(r"_(\d{4})$", car_id)
    if m:
        return int(m.group(1))
    return date.today().year


def _enrich_car(car: dict, car_id: str | None = None) -> dict:
    """Attach id + derived model_year so downstream inspection logic can use them."""
    enriched = dict(car)
    if car_id is not None:
        enriched["id"] = car_id
    enriched["model_year"] = _model_year_for(enriched)
    return enriched


def _inspection_ages(model_year: int, purchase_year: int, years: int) -> list[float]:
    """Inspection ages (from production year) falling within the holding window [age0, age0+years].

    Cadence per Thông tư 47/2024/TT-BGTVT (eff. 2025-01-01), preserved by
    Thông tư 30/2026/TT-BXD (eff. 2026-07-01): first PAID inspection at 36 months,
    then 24 months while car age <7yr, 12 months at 7–20yr, 6 months beyond 20yr.
    """
    age0 = max(0, purchase_year - model_year)
    ages: list[float] = []
    a = 3.0
    while a <= 30:
        ages.append(a)
        if a < 7:
            step = 2.0
        elif a <= 20:
            step = 1.0
        else:
            step = 0.5
        a += step
    return [age for age in ages if age0 <= age <= age0 + years]


def calculate_periodic_inspection(car: dict, purchase_date=None, years: int = 5,
                                  fee: int = INSPECTION_FEE) -> int:
    """Recurring vehicle inspection (đăng kiểm) cost beyond the acquisition fee.

    `calculate_registration` already books ONE inspection into `on_road`; this adds
    only the SUBSEQUENT periodic inspections across the holding period.
    """
    if years <= 0:
        return 0
    model_year = _model_year_for(car)
    purchase_year = (purchase_date or date.today()).year
    due = _inspection_ages(model_year, purchase_year, years)
    extra = max(0, len(due) - 1) if due else 0
    return extra * fee


def calculate_fuel_cost(km, consumption, car_type, city_ratio=0.0, rush_hour=False):
    """Adjusts fuel consumption based on city traffic ratio using the efficiency matrix.

    Returns an integer (rounded to the nearest VND) to avoid IEEE-754 precision
    artifacts leaking through the API (e.g. 142798950.00000003).

    `rush_hour=True` bumps the city-efficiency multiplier from its baseline
    (1.50x for ICE) toward the 2.0x Otofun-reported Hà Nội rush-hour peak. The
    bump scales linearly with `city_ratio` so a pure-highway commute is unaffected.
    """
    if not consumption or consumption <= 0:
        return 0.0

    freeway_mult, city_mult = TRAFFIC_EFFICIENCY_MAP.get(car_type, (1.0, 1.0))
    if rush_hour and city_ratio > 0:
        # Per-powertrain rush-hour city target from TRAFFIC_RUSH_HOUR_MULT. ICE bumps toward
        # the 2.0x Otofun Hà Nội gridlock peak; HEV/EV drop further below 1.0 because stop-and-go
        # traffic gives regen braking more recovery opportunities (DOE / fueleconomy.gov).
        # The city-share scaling is applied by final_mult below, so all-highway commutes stay
        # unaffected.
        city_mult = TRAFFIC_RUSH_HOUR_MULT.get(car_type, 2.0)
    final_mult = freeway_mult + (city_mult - freeway_mult) * city_ratio
    adjusted_consumption = consumption * final_mult

    if car_type in ["ICE", "HEV"]:
        price = PETROL_PRICE_CURRENT_VND
    elif car_type == "ICE-D":
        price = DIESEL_PRICE_CURRENT_VND
    else:
        price = EV_CHARGING_PRICE_VND

    return round((km / 100) * adjusted_consumption * price)


def calculate_opportunity_cost(principal, years, rate=SAVINGS_INTEREST_RATE):
    """Cumulative interest lost if capital were in a savings account."""
    if years <= 0:
        return 0.0
    try:
        return principal * ((1 + rate) ** years) - principal
    except OverflowError:
        return float('inf')


def calculate_maintenance(km, car_type, base_cost=None, years=1):
    """Calculate total maintenance over `years` given annual `km`.

    Per-powertrain base annual maintenance is selected when `base_cost` is not given:
      - ICE/ICE-D/HEV -> BASE_ANNUAL_MAINTENANCE_ICE (~8M VND/yr; Vietnamese dealer routine cadence)
      - EV            -> BASE_ANNUAL_MAINTENANCE_EV (~1.2M VND/yr; VinFast owner-report calibrated)
    `base_cost` is honored when the caller (or a ConfigProposals patch) supplies an explicit
    override — the per-powertrain default below only fills in when no override is supplied.

    On top of the pro-rated base cost, periodic major-service spikes fire once per threshold
    crossed (e.g. 75k total km = 1×40k spike; 160k total km = 4×40k + 2×80k + 1×120k).
    Thresholds and costs are powertrain-specific per Vietnamese OEM service schedules
    (see MAINTENANCE_SPIKES in config). Returns integer VND.
    """
    if base_cost is None:
        base_cost = (BASE_ANNUAL_MAINTENANCE_EV if car_type == "EV"
                     else BASE_ANNUAL_MAINTENANCE_ICE)
    annual = base_cost
    total = annual * years

    total_km = km * years
    spike_cost = 0
    for threshold, cost in MAINTENANCE_SPIKES.get(car_type, MAINTENANCE_SPIKES["ICE"]):
        spike_count = total_km // threshold
        spike_cost += spike_count * cost

    return round(total + spike_cost)


def resolve_liquidity_bonus(brand, car_type, segment):
    """'Bespoke Logic' for market demand multipliers."""
    if car_type == "HEV":
        return LIQUIDITY_LOGIC_MAP["HEV"]

    tier = BRAND_LIQUIDITY_MAP.get(brand, "Tier 3")

    if car_type == "EV":
        return LIQUIDITY_LOGIC_MAP["EV"].get(brand, LIQUIDITY_LOGIC_MAP["EV"]["Default"])

    tier_logic = LIQUIDITY_LOGIC_MAP.get(tier, LIQUIDITY_LOGIC_MAP["Tier 3"])
    return tier_logic.get(segment, tier_logic.get("Default", 1.0))


def calculate_resale(price, brand, years, car_type, segment, annual_km=15000, custom_rate=None):
    """Calculates residual value using ML prediction first, falling back to parametric.
    Returns dict with keys: value (rounded to nearest VND), logic, ml_spread (optional),
    ml_std (optional), resale_note_key (optional).

    VinFast-specific floor: VinFast's 70% buyback guarantee plus strong Vietnamese used-EV
    market liquidity mean real retention exceeds the parametric EV_Market decay curve by
    25-35% for the first 24 months (bonbanh.com.vn 2026-07, 416 listings, mean 0.60-0.70
    retention at 3yr vs ViDrive parametric 0.46). When the computed residual falls below
    `price * VINFAST_LIQUIDITY_FLOOR` and ownership is within the guarantee window, we
    clamp the residual up to the floor and surface the `resale.vinfastLiquidityFloor` note
    so the Methodology page can disclose the structural support. Above-floor cars are left
    unchanged; after the 24-month window the curve decays normally."""
    is_vinfast = brand == "VinFast"
    base_note_key = "resale.vinfastGuarantee" if is_vinfast else None

    if years == 0:
        return {"value": round(price), "logic": "parametric", "resale_note_key": base_note_key}

    if custom_rate is not None:
        value = round(price * ((1 - custom_rate) ** years))
        return _apply_vinfast_floor(value, price, years, is_vinfast, base_note_key, "custom")

    # Try ML prediction first
    try:
        predictor = get_predictor()
        ml_result = predictor.predict_resale(brand, segment, car_type, years, annual_km, price)
        if ml_result["ml_prediction"] is not None:
            predicted_pct = ml_result["ml_prediction"]
            if 0.05 <= predicted_pct <= 1.0:
                return _apply_vinfast_floor(
                    round(price * predicted_pct), price, years, is_vinfast, base_note_key, "ml",
                    extra={"ml_spread": round(ml_result.get("ml_spread", 0) * price),
                           "ml_std": round(ml_result.get("ml_std", 0) * price)},
                )
    except Exception:
        pass  # Fall through to parametric

    # Parametric path (fallback)
    tier_label = BRAND_LIQUIDITY_MAP.get(brand, "Tier 3")
    category = "EV_Market" if car_type == "EV" else tier_label
    seg_adj = SEGMENT_DEPRECIATION_MAP.get(segment, {}).get("decay_adj", 1.0)
    params = DEPRECIATION_EQ_PARAMS.get(category, DEPRECIATION_EQ_PARAMS["Tier 3"])
    decay = params["annual_decay"] * seg_adj

    # Extra 1.5% loss per 10k km over 15k/yr
    usage_penalty = max(0, (annual_km - 15000) / 10000) * 0.015
    decay += usage_penalty

    retention = (1 - params["y1_drop"]) * ((1 - decay) ** (years - 1))
    bonus = resolve_liquidity_bonus(brand, car_type, segment)
    retention *= bonus

    return _apply_vinfast_floor(
        round(price * retention), price, years, is_vinfast, base_note_key, "parametric")


def _apply_vinfast_floor(value, price, years, is_vinfast, base_note_key, logic, extra=None):
    """Clamp VinFast residual at the buyback-window floor, with a softer post-window
    decay anchored on the floor. The floor fires only when the parametric curve would
    otherwise fall below it; above-floor residuals pass through untouched. The floor
    note replaces the default guarantee note only when the floor fires (so the UI can
    disclose which mechanism shaped the prediction).

    Floor behavior:
      - years <= VINFAST_FLOOR_YEARS (36mo): floor = price * VINFAST_LIQUIDITY_FLOOR (flat)
      - years  > VINFAST_FLOOR_YEARS:       floor = floor * (1 - decay)^(years - window)
        so the post-window curve decays naturally from the floor instead of snapping
        back to the parametric prediction (which understates real VF retention by
        ~25-35% vs bonbanh 3-yr data).
    """
    result: dict = {"value": value, "logic": logic}
    if extra:
        result.update(extra)
    if is_vinfast:
        if years <= VINFAST_FLOOR_YEARS:
            floor = round(price * VINFAST_LIQUIDITY_FLOOR)
        else:
            decay_periods = years - VINFAST_FLOOR_YEARS
            anchor = price * VINFAST_LIQUIDITY_FLOOR
            floor = round(anchor * ((1 - VINFAST_FLOOR_DECAY) ** decay_periods))
        if value < floor:
            result["value"] = floor
            # Floor fired: prefer the floor-disclosure note so the Methodology page
            # can explain the structural support rather than just the guarantee text.
            result["resale_note_key"] = "resale.vinfastLiquidityFloor"
            result["vinfast_floor_applied"] = True
        else:
            result["resale_note_key"] = base_note_key
    return result


def _calculate_tco_uncertainty(reg: dict, fuel: float, maint: float,
                                road_fees: float, insurance: float,
                                parking_toll: float, resale: float,
                                resale_std: float | None,
                                inspection_periodic: float = 0) -> float:
    """Compute combined standard deviation of TCO via error propagation.

    Components:
      - Registration: fractional variance of tax + fixed plate/inspection
      - Fuel: fractional variance scaled by total fuel cost
      - Maintenance: fractional variance scaled by total maint cost
      - Road fees: fractional variance scaled by total road fees
      - Insurance: fractional variance scaled by total insurance
      - Parking & toll: combined into one fractional variance
      - Resale: model-derived ml_std (preferred) or parametric fallback (5% of resale)

    Variances are independent and summed in quadrature:
        σ_tco² = σ_reg² + σ_fuel² + σ_maint² + σ_road_fees² + σ_insurance² + σ_parking² + σ_resale²
    """
    import math

    # Registration uncertainty (tax is %-based, plate/inspection are fixed)
    reg_tax_std = reg["tax"] * REGISTRATION_VARIANCE
    reg_fixed_std = (reg["plate"] + reg["inspection"]) * REGISTRATION_VARIANCE
    sigma_reg = math.sqrt(reg_tax_std ** 2 + reg_fixed_std ** 2)

    # Fuel uncertainty
    sigma_fuel = fuel * FUEL_PRICE_VARIANCE

    # Maintenance uncertainty
    sigma_maint = maint * MAINTENANCE_COST_VARIANCE

    # Road fees uncertainty (fixed yearly * years)
    sigma_road_fees = road_fees * ROAD_FEE_VARIANCE

    # Insurance uncertainty
    sigma_insurance = insurance * INSURANCE_RATE_VARIANCE

    # Periodic inspection (fixed fee, same variance class as registration fixed fees)
    sigma_inspection = inspection_periodic * REGISTRATION_VARIANCE

    # Parking & toll uncertainty
    sigma_parking = parking_toll * PARKING_TOLL_VARIANCE

    # Resale uncertainty — prefer model-derived std, fall back to parametric (5% of resale)
    if resale_std is not None and resale_std > 0:
        sigma_resale = resale_std
    else:
        sigma_resale = abs(resale) * RESALE_PARAMETRIC_STD_PCT

    combined = math.sqrt(
        sigma_reg ** 2
        + sigma_fuel ** 2
        + sigma_maint ** 2
        + sigma_road_fees ** 2
        + sigma_insurance ** 2
        + sigma_inspection ** 2
        + sigma_parking ** 2
        + sigma_resale ** 2
    )
    return combined


def _zero_tco_dict(car: dict, city: str, km: float, purchase_date=None, area=None) -> dict:
    """TCO with a 0-year horizon: acquisition (on-road) only.

    No operating costs accrue and resale equals price (no ownership period),
    so depreciation and TCO both equal the on-road price. Used to keep a
    years=0 request from producing a divide/domain error.
    """
    price = car["price"]
    if area is None:
        area = get_area_tier(city)
    reg = calculate_registration(price, city, car["type"], purchase_date, area=area)
    seats = car.get("seats", 5)
    insurance_rate = CIVIL_INSURANCE_UNDER_6 if seats < 6 else CIVIL_INSURANCE_6_TO_11
    # "Giá lăn bánh" (on-road price) = MSRP + reg_tax + plate + inspection + year-1
    # road-maintenance fee + year-1 civil insurance. The first-year road and insurance
    # fees are paid upfront at registration in Vietnam (per user spec Aug 2026), so
    # they belong in the acquisition block, not the multi-year operating tail.
    on_road = price + reg["total"] + ROAD_MAINTENANCE_FEE_YEARLY + insurance_rate
    return {
        "price": price,
        "reg": reg,
        "reg_tax": reg["tax"],
        "on_road": round(on_road),
        "fuel": 0,
        "maint": 0,
        "legal": 0,
        "operating": 0,
        "parking_toll": {
            "monthly_parking": 0,
            "monthly_toll": 0,
            "monthly_total": 0,
            "total_over_period": 0,
        },
        "resale": round(price),
        "resale_logic": "parametric",
        "resale_spread": None,
        "resale_std": None,
        "resale_note_key": None,
        "depreciation": 0,
        "opp_cost": 0,
        "liquidity": BRAND_LIQUIDITY_MAP.get(car.get("brand"), "Tier 3 (Niche)"),
        "tco": round(on_road),
        "true_financial_impact": round(on_road),
        "monthly": 0,
        "confidence_low": round(on_road),
        "confidence_high": round(on_road),
    }


def get_tco(car, city, km, years=5, purchase_date=None, area=None, city_ratio=0.0,
            rush_hour=False, include_insurance=False):
    """Master TCO: Acquisition + Running - Resale

    `rush_hour=True` swaps in the per-powertrain rush-hour city multiplier from
    TRAFFIC_RUSH_HOUR_MULT — a gridlock penalty for ICE/ICE-D (up to 2.0x for Hà Nội per
    Otofun #12498) but a regen-driven efficiency gain for EV/HEV. `include_insurance=True`
    adds an optional line for
    voluntary physical-damage ("thân vỏ") coverage at ~1.5% of MSRP per year — typical
    PVI / Bảo Việt / Bảo Minh market rate. Both are surfaced on `TcoResult` so the
    frontend can disclose which toggles shaped the prediction.
    """
    if years <= 0:
        return _zero_tco_dict(car, city, km, purchase_date, area)
    price = car["price"]
    reg = calculate_registration(price, city, car["type"], purchase_date, area=area)
    seats = car.get("seats", 5)
    insurance_rate = CIVIL_INSURANCE_UNDER_6 if seats < 6 else CIVIL_INSURANCE_6_TO_11
    # "Giá lăn bánh" (on-road price) = MSRP + reg_tax + plate + inspection + year-1
    # road-maintenance fee + year-1 civil insurance (paid upfront in Vietnam).
    on_road = price + reg["total"] + ROAD_MAINTENANCE_FEE_YEARLY + insurance_rate

    fuel = calculate_fuel_cost(km, car["consumption"], car["type"], city_ratio, rush_hour=rush_hour) * years
    maint = calculate_maintenance(km, car["type"], car.get("annual_maintenance"), years)
    # Year-1 road fee + civil insurance are already in `on_road`, so the operating
    # tail covers only the remaining (years-1) years. Total TCO is unchanged; this
    # just keeps the acquisition block correctly bounded.
    road_fees = ROAD_MAINTENANCE_FEE_YEARLY * (years - 1)
    insurance = insurance_rate * (years - 1)
    # Optional voluntary physical-damage ("thân vỏ") coverage — ~1.5% of MSRP / year.
    # Applies to the full ownership period so it compares on the same horizon as other
    # components. Disabled by default; surfaced in `insurance_optional` so the UI can
    # disclose which toggle fired.
    insurance_optional = round(price * OPTIONAL_PHYSICAL_DAMAGE_INSURANCE_RATE) * years if include_insurance else 0
    # Recurring inspection (đăng kiểm) beyond the one booked into on_road.
    inspection_periodic = calculate_periodic_inspection(car, purchase_date, years)
    operating = fuel + maint + road_fees + insurance + insurance_optional + inspection_periodic

    # Parking & Toll estimates (scaled by city/highway split; metro sub-tier via city)
    parking_toll = calculate_parking_toll(area or get_area_tier(city), years, city_ratio, city=city)

    resale_result = calculate_resale(
        price,
        car["brand"],
        years,
        car["type"],
        car.get("segment", "C-Sedan"),
        annual_km=km,
        custom_rate=car.get("depreciation_rate"),
    )
    resale = resale_result["value"]
    resale_logic = resale_result["logic"]
    resale_std = resale_result.get("ml_std")
    resale_note_key = resale_result.get("resale_note_key")
    depreciation = price - resale

    # [v0.5.0] Market Research Factors
    opp_cost = calculate_opportunity_cost(on_road, years)
    liquidity = BRAND_LIQUIDITY_MAP.get(car.get("brand"), "Tier 3 (Niche)")

    tco = (on_road + operating + parking_toll["total_over_period"]) - resale

    # Confidence interval via error propagation
    combined_std = _calculate_tco_uncertainty(
        reg, fuel, maint, road_fees, insurance,
        parking_toll["total_over_period"], resale, resale_std,
        inspection_periodic,
    )
    confidence_low = tco - CONFIDENCE_Z_SCORE * combined_std
    confidence_high = tco + CONFIDENCE_Z_SCORE * combined_std

    return {
        "price": price,
        "reg": reg,
        "reg_tax": reg["tax"],
        "on_road": round(on_road),
        "fuel": fuel,
        "maint": maint,
        "legal": round(road_fees + insurance + inspection_periodic),
        "operating": round(operating),
        "insurance_optional": round(insurance_optional),
        "inspection_periodic": round(inspection_periodic),
        "rush_hour_applied": bool(rush_hour and city_ratio > 0),
        "parking_toll": {
            **parking_toll,
            "monthly_parking": round(parking_toll["monthly_parking"]),
            "monthly_toll": round(parking_toll["monthly_toll"]),
            "monthly_total": round(parking_toll["monthly_total"]),
            "total_over_period": round(parking_toll["total_over_period"]),
        },
        "resale": resale,
        "resale_logic": resale_logic,
        "resale_spread": resale_result.get("ml_spread"),
        "resale_std": resale_std,
        "resale_note_key": resale_note_key,
        "depreciation": round(depreciation),
        "opp_cost": round(opp_cost),
        "liquidity": liquidity,
        "tco": round(tco),
        "true_financial_impact": round(tco + opp_cost),
        "monthly": round(operating / (years * 12)),
        "confidence_low": round(confidence_low),
        "confidence_high": round(confidence_high),
    }


def calculate_parking_toll(area: int, years: int, city_ratio: float = 0.0, city: str | None = None) -> dict:
    """
    Calculate parking & toll estimates based on area tier and city/highway split.
    - Parking scales with city driving (city_ratio)
    - Tolls scale with highway driving (1 - city_ratio)
    - When area==1 and city is Hanoi/HCMC core, use the area1_metro sub-tier
      (apartment parking 2.0M VND/mo vs 1.5M for other Area-1 cities).
    """
    # Resolve tier key; prefer metro sub-tier when applicable
    if area == 1 and city and is_area1_metro(city):
        area_key = "area1_metro"
    else:
        area_key = f"area{area}" if area in (1, 2, 3) else "area2"
    estimates = PARKING_TOLL_ESTIMATES.get(area_key, PARKING_TOLL_ESTIMATES["area2"])

    # Scale parking by city driving, tolls by highway driving
    parking_monthly = estimates["parking_monthly"] * (0.5 + city_ratio)
    toll_monthly = estimates["toll_monthly"] * (1.5 - city_ratio)

    monthly_total = parking_monthly + toll_monthly
    total_over_period = monthly_total * 12 * years

    return {
        "monthly_parking": round(parking_monthly),
        "monthly_toll": round(toll_monthly),
        "monthly_total": round(monthly_total),
        "total_over_period": round(total_over_period),
    }


def calculate_loan_schedule(on_road_price: float, down_pct: float, annual_rate: float, term_years: int) -> dict:
    """
    Calculate loan schedule using reducing balance method (standard in Vietnam).
    Returns monthly payment, total interest, total repayment, and effective cost.

    Edge cases:
    - 0% down: full loan (no down payment)
    - 100% down: no loan needed (zero monthly payment)
    """
    # Clamp down_pct to valid range instead of silently overriding
    down_pct = max(0.0, min(100.0, down_pct))

    loan_amount = on_road_price * (1 - down_pct / 100)
    monthly_rate = annual_rate / 12
    num_payments = term_years * 12

    if loan_amount <= 0:
        # 100% down payment — no loan needed
        return {
            "loan_amount": 0.0,
            "down_payment": round(on_road_price),
            "monthly_payment": 0.0,
            "total_interest": 0.0,
            "total_repayment": 0.0,
            "effective_cost": round(on_road_price),
            "term_months": num_payments,
            "annual_rate": annual_rate,
        }

    if monthly_rate == 0:
        monthly_payment = loan_amount / num_payments
    else:
        # Standard reducing balance formula
        monthly_payment = loan_amount * monthly_rate * (1 + monthly_rate) ** num_payments / ((1 + monthly_rate) ** num_payments - 1)

    total_repayment = monthly_payment * num_payments
    total_interest = total_repayment - loan_amount
    effective_cost = on_road_price + total_interest  # Cash price + financing cost

    return {
        "loan_amount": round(loan_amount),
        "down_payment": round(on_road_price * down_pct / 100),
        "monthly_payment": round(monthly_payment),
        "total_interest": round(total_interest),
        "total_repayment": round(total_repayment),
        "effective_cost": round(effective_cost),
        "term_months": num_payments,
        "annual_rate": annual_rate,
    }


def get_tco_yearly(car: dict, city: str, km: float, years: int = 5, purchase_date=None, area=None, city_ratio: float = 0.0) -> list[dict]:
    """Return per-year TCO breakdown for chart visualization.

    Produces a non-linear cumulative cost curve by:
    - Computing depreciation per year via calculate_resale (non-linear ML/parametric curve)
    - Escalating maintenance costs with vehicle age (~15% per year)
    - Keeping fuel/insurance/road fees constant (realistic)
    - Subtracting residual value at each year to get true cumulative ownership cost
    """
    price = car["price"]
    if area is None:
        area = get_area_tier(city)
    if years <= 0:
        return []

    reg = calculate_registration(price, city, car["type"], purchase_date, area=area)
    seats = car.get("seats", 5)
    annual_insurance = CIVIL_INSURANCE_UNDER_6 if seats < 6 else CIVIL_INSURANCE_6_TO_11
    # "Giá lăn bánh" (on-road price) = MSRP + reg_tax + plate + inspection + year-1
    # road-maintenance fee + year-1 civil insurance. Year-1 fees are paid upfront
    # at registration in Vietnam.
    on_road = price + reg["total"] + ROAD_MAINTENANCE_FEE_YEARLY + annual_insurance

    annual_fuel = calculate_fuel_cost(km, car["consumption"], car["type"], city_ratio)
    annual_road = ROAD_MAINTENANCE_FEE_YEARLY
    annual_legal = annual_road + annual_insurance

    # Periodic inspection (đăng kiểm) schedule — on_road already books the first
    # inspection, so we only add the subsequent ones within the holding window.
    model_year = _model_year_for(car)
    purchase_year = (purchase_date or date.today()).year
    due = _inspection_ages(model_year, purchase_year, years)
    extra_ages = set(sorted(due)[1:]) if len(due) > 1 else set()
    age0 = max(0, purchase_year - model_year)

    parking_toll = calculate_parking_toll(area, 1, city_ratio, city=city)
    annual_parking = parking_toll["monthly_total"] * 12

    base_maint = calculate_maintenance(km, car["type"], car.get("annual_maintenance"), 1)

    yearly_data = []
    cumulative_operating = 0.0

    for year in range(1, years + 1):
        # Maintenance escalates with age: ~15% increase per year of vehicle age
        age_factor = 1.0 + 0.15 * (year - 1)
        year_maint = base_maint * age_factor

        # Fuel, parking are constant per year. Year-1 road + civil insurance are
        # already absorbed in `on_road` so we skip them in year 1's operating block
        # to avoid double-counting (matches the acquisition-block formula).
        year_fuel = annual_fuel
        year_inspection = INSPECTION_FEE if (age0 + year) in extra_ages else 0
        year_legal = (annual_legal if year > 1 else 0) + year_inspection
        year_parking = annual_parking

        cumulative_operating += year_fuel + year_maint + year_legal + year_parking

        # Resale value at this year (non-linear curve)
        resale_at_year_result = calculate_resale(
            price,
            car["brand"],
            year,
            car["type"],
            car.get("segment", "C-Sedan"),
            annual_km=km,
            custom_rate=car.get("depreciation_rate"),
        )
        resale_at_year = resale_at_year_result["value"]
        depreciation_at_year = price - resale_at_year

        # Cumulative TCO = on-road price + cumulative operating costs - resale value at this point
        # This produces a concave curve: steep early (depreciation), flattening later
        cumulative_tco = on_road + cumulative_operating - resale_at_year

        yearly_data.append({
            "year": year,
            "year_label": str(year),
            "fuel": round(year_fuel),
            "maintenance": round(year_maint),
            "legal": round(year_legal),
            "inspection": round(year_inspection),
            "parking_toll": round(year_parking),
            "operating_cumulative": round(cumulative_operating),
            "resale": resale_at_year,
            "depreciation": round(depreciation_at_year),
            "cumulative_tco": round(cumulative_tco),
        })

    return yearly_data


def get_fuel_breakdown(car, km, years, city_ratio, rush_hour=False):
    """Return a breakdown of fuel cost calculation for verbose display."""
    consumption = car["consumption"]
    car_type = car["type"]
    freeway_mult, city_mult = TRAFFIC_EFFICIENCY_MAP.get(car_type, (1.0, 1.0))
    if rush_hour and city_ratio > 0:
        city_mult = TRAFFIC_RUSH_HOUR_MULT.get(car_type, 2.0)
    final_mult = freeway_mult + (city_mult - freeway_mult) * city_ratio
    adjusted_consumption = consumption * final_mult

    if car_type in ["ICE", "HEV"]:
        price = PETROL_PRICE_CURRENT_VND
        price_label = f"RON 95 ({PETROL_PRICE_CURRENT_VND:,} VND/L)"
    elif car_type == "ICE-D":
        price = DIESEL_PRICE_CURRENT_VND
        price_label = f"Diesel ({DIESEL_PRICE_CURRENT_VND:,} VND/L)"
    else:
        price = EV_CHARGING_PRICE_VND
        price_label = f"EV Charging ({EV_CHARGING_PRICE_VND:,} VND/kWh)"

    annual_fuel = (km / 100) * adjusted_consumption * price
    total_fuel = annual_fuel * years

    return {
        "consumption": round(consumption, 2),
        "adjusted_consumption": round(adjusted_consumption, 2),
        "freeway_mult": round(freeway_mult, 2),
        "city_mult": round(city_mult, 2),
        "final_mult": round(final_mult, 3),
        "price": price,
        "price_label": price_label,
        "car_type": car_type,
        "annual_fuel": round(annual_fuel),
        "total_fuel": round(total_fuel),
        "years": years,
        "km": km,
        "city_ratio": city_ratio,
    }


def get_registration_breakdown(car, area, city: str | None = None):
    """Return a breakdown of on-road (giá lăn bánh) acquisition for verbose display.

    Mirrors the giá lăn bánh formula used by `get_tco` and `_zero_tco_dict`:
        on_road = price + reg_tax + plate_fee + inspection_fee
                  + year-1 road_maintenance_fee + year-1 civil_insurance

    Plate fee + reg-tax rate are gated by `is_area1_metro` for Area-1 cities
    (Thông tư 155/2025). The two year-1 fees are paid upfront at registration
    in Vietnam, so they belong in the acquisition block — not the multi-year
    operating tail. `total` covers the five non-price fees (reg subtotal).
    """
    price = car["price"]
    car_type = car["type"]
    seats = car.get("seats", 5)
    insurance_rate = CIVIL_INSURANCE_UNDER_6 if seats < 6 else CIVIL_INSURANCE_6_TO_11
    road_fee = ROAD_MAINTENANCE_FEE_YEARLY
    insurance = insurance_rate
    is_metro = is_area1_metro(city) if area == 1 else False
    tax_rate = ICE_REGISTRATION_RATE_CENTRAL_CITY if is_metro else ICE_REGISTRATION_RATE_STANDARD

    if car_type in ["ICE", "ICE-D", "HEV"]:
        tax = price * tax_rate
        tax_desc = f"{price:,} x {tax_rate*100:.0f}% = {tax:,.0f} VND"
    elif car_type == "EV":
        today = date.today()
        if today <= EV_EXEMPTION_END_DATE:
            tax = 0.0
            tax_desc = "EV exempt (before Feb 28, 2027)"
        else:
            tax = price * tax_rate * EV_POST_EXEMPTION_DISCOUNT
            tax_desc = f"{price:,} x {tax_rate*100:.0f}% x {EV_POST_EXEMPTION_DISCOUNT*100:.0f}% = {tax:,.0f} VND"
    else:
        tax = 0.0
        tax_desc = "N/A"

    if area == 1:
        plate = PLATE_FEE_METRO if is_metro else PLATE_FEE_NON_METRO_AREA1
    else:
        plate = PLATE_FEES[area]
    inspection = INSPECTION_FEE
    reg_subtotal = tax + plate + inspection
    total = reg_subtotal + road_fee + insurance  # 5 non-price fees
    on_road = price + total  # full acquisition block (giá lăn bánh)

    return {
        "price": price,
        "car_type": car_type,
        "seats": seats,
        "area": area,
        "tax_rate": tax_rate,
        "tax": round(tax),
        "tax_desc": tax_desc,
        "plate": round(plate),
        "inspection": round(inspection),
        "road_fee": round(road_fee),
        "insurance": round(insurance),
        "total": round(total),
        "on_road": round(on_road),
    }


if __name__ == "__main__":
    """Inline self-test for city-slug normalization."""
    cases = [
        # (input, expected_area, expected_metro)
        ("ho-chi-minh-city",       1, True),
        ("thanh-pho-ho-chi-minh",  1, True),
        ("ho chi minh city",       1, True),
        ("hochiminh",              1, True),
        ("hcmc",                   1, True),
        ("saigon",                 1, True),
        ("ha-noi",                 1, True),
        ("hanoi",                  1, True),
        ("da-nang",                1, False),
        ("thuathienhue",           1, False),
        ("thua-thien-hue",         1, False),
        ("ba-ria-vung-tau",        2, False),
        ("vinh-long",              2, False),
        ("",                       2, False),
    ]

    failures = []
    for inp, expected_area, expected_metro in cases:
        display, area = resolve_city(inp)
        metro = is_area1_metro(inp)
        print(
            f"{inp!r:40} -> display={display!r}, area={area}, metro={metro}"
        )
        if area != expected_area or metro != expected_metro:
            failures.append(
                f"FAIL {inp!r}: expected area={expected_area}, metro={expected_metro}; "
                f"got area={area}, metro={metro}"
            )

    if failures:
        for f in failures:
            print(f)
        raise AssertionError(
            f"{len(failures)} city-slug normalization case(s) failed"
        )
    print(f"\nAll {len(cases)} city-slug cases passed.")
