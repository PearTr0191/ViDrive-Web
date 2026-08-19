"""ViDrive Web API — FastAPI wrapper around the original ViDrive TCO calculation engine."""
from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import time
import uuid
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from src.calculations import (
    calculate_loan_schedule,
    get_fuel_breakdown,
    get_registration_breakdown,
    get_tco,
    get_tco_yearly,
    load_data,
    resolve_city,
    _enrich_car,
    _model_year_for,
)
from src.cli import search_cars as _search_cars
from src.config import (
    ALLOWED_ORIGINS,
    APP_VERSION,
    AREA1_CITIES,
    AREA2_PROVINCES,
    BASE_ANNUAL_MAINTENANCE_EV,
    BASE_ANNUAL_MAINTENANCE_ICE,
    BRAND_LIQUIDITY_MAP,
    CITY_LIST,
    CIVIL_INSURANCE_6_TO_11,
    CIVIL_INSURANCE_UNDER_6,
    DATA_RECENCY_DAYS,
    DEPRECIATION_EQ_PARAMS,
    DEPRECIATION_SHOWROOM_EXIT_PENALTY,
    DIESEL_PRICE_VND,
    DIESEL_PRICE_CURRENT_VND,
    DIESEL_PRICE_FORECAST_VND,
    EV_CHARGING_PRICE_VND,
    EV_EXEMPTION_END_DATE,

    EV_POST_EXEMPTION_DISCOUNT,
    ICE_REGISTRATION_RATE_CENTRAL_CITY,
    ICE_REGISTRATION_RATE_STANDARD,
    INSPECTION_FEE,
    LAST_UPDATED,
    LIQUIDITY_LOGIC_MAP,
    MAINTENANCE_MAJOR_COST_EV,
    MAINTENANCE_MAJOR_COST_ICE,
    MAINTENANCE_MAJOR_COST_ICE_D,
    MAINTENANCE_MAJOR_KM,
    MAINTENANCE_SPIKES,
     MAX_COMPARISON_CARS,
     PARKING_TOLL_ESTIMATES,
    PETROL_PRICE_CURRENT_VND,
    PETROL_PRICE_FORECAST_VND,
    PETROL_PRICE_VND,
    DIESEL_PRICE_CURRENT_VND,
    DIESEL_PRICE_FORECAST_VND,
    DIESEL_PRICE_VND,
    PLATE_FEES, PLATE_FEE_METRO, PLATE_FEE_NON_METRO_AREA1,
    PROPOSALS_DIR,
    ROAD_MAINTENANCE_FEE_YEARLY,
    SAVINGS_INTEREST_RATE,
    SEGMENT_DEPRECIATION_MAP,
    TRAFFIC_EFFICIENCY_MAP,
    VINFAST_FLOOR_YEARS,
    VINFAST_LIQUIDITY_FLOOR,
    WIZARD_SEGMENTS,
)
from src.export import export_compare_csv, export_single_csv
from src.pdf_export import generate_pdf_single, generate_pdf_compare
from src.persistence import (
    clear_history,
    delete_result,
    load_history,
    load_result,
    save_result,
)
from src.wizard import get_wizard_car

app = FastAPI(
    title="ViDrive TCO API",
    description="Vietnamese Total Cost of Ownership calculator for vehicles.",
    version=APP_VERSION,
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "ViDrive backend is running"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
    max_age=600,
)


# ---------------------------------------------------------------------------
# Rate limiting — sliding-window per client IP (stdlib only, no extra deps)
# ---------------------------------------------------------------------------
RATE_LIMIT_MAX: int = 120     # max requests
RATE_LIMIT_WINDOW: int = 60   # per 60s window
_rate_limit_store: dict[str, list[float]] = defaultdict(list)

# --- Server hardening constants ---
MAX_TCO_YEARS: int = 60                      # holding-horizon cap (DoS guard; frontend clamps 0-30)
MAX_ANNUAL_KM: float = 1_000_000.0            # annual-distance cap (DoS guard)
MAX_REQUEST_SIZE_BYTES: int = 5 * 1024 * 1024  # reject oversized bodies (DoS guard)


@app.middleware("http")
async def request_size_middleware(request: Request, call_next):
    """Reject requests whose declared body exceeds the size cap (DoS guard)."""
    length = request.headers.get("content-length")
    if length and int(length) > MAX_REQUEST_SIZE_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": "Payload too large"},
        )
    return await call_next(request)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window_start = now - RATE_LIMIT_WINDOW
    # Prune timestamps outside the window
    recent = [ts for ts in _rate_limit_store[client_ip] if ts > window_start]
    if not recent:
        _rate_limit_store.pop(client_ip, None)
        recent = []
    if len(recent) >= RATE_LIMIT_MAX:
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(RATE_LIMIT_WINDOW)},
            content={"detail": "Rate limit exceeded"},
        )
    recent.append(now)
    _rate_limit_store[client_ip] = recent
    return await call_next(request)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class CarInfo(BaseModel):
    """A car from the database."""

    id: str
    brand: str
    model: str
    price: float
    type: str
    seats: int = 5
    consumption: float = 0.0
    annual_maintenance: float | None = None
    segment: str = "C-Sedan"
    depreciation_rate: float | None = None
    model_year: int | None = None


class CityInfo(BaseModel):
    """A supported city."""

    name: str
    area: int
    diacritic: str


class TcoRequest(BaseModel):
    """Request for a single-car TCO calculation."""

    car_id: str
    car: CarInfo | None = None  # provided when car_id starts with 'custom-'
    city: str = "hanoi"
    km: float = Field(15000, ge=0, le=MAX_ANNUAL_KM)
    years: int = Field(5, ge=0, le=MAX_TCO_YEARS)
    area: int | None = None
    city_ratio: float = Field(0.3, ge=0, le=1)
    show_opp_cost: bool = False
    rush_hour: bool = False
    include_insurance: bool = False
    include_parking_toll: bool = True


class CompareRequest(BaseModel):
    """Request for a multi-car comparison."""

    car_ids: list[str] = Field(..., min_length=2, max_length=MAX_COMPARISON_CARS)
    custom_cars: list[CarInfo] | None = None  # provided when any car_id starts with 'custom-'
    city: str = "hanoi"
    km: float = Field(15000, ge=0, le=MAX_ANNUAL_KM)
    years: int = Field(5, ge=0, le=MAX_TCO_YEARS)
    area: int | None = None
    city_ratio: float = Field(0.3, ge=0, le=1)
    show_opp_cost: bool = False
    rush_hour: bool = False
    include_insurance: bool = False
    include_parking_toll: bool = True


class LoanRequest(BaseModel):
    """Request for a loan calculation."""

    on_road_price: float = Field(..., ge=0)
    down_pct: float = Field(30.0, ge=0, le=100)
    annual_rate: float = Field(0.085, ge=0, le=1)
    term_years: int = Field(5, ge=1, le=15)


class WizardRequest(BaseModel):
    """Request for a custom car via wizard."""

    brand: str
    model: str = "Custom"
    price: float = Field(..., ge=0)
    type: str = "ICE"
    consumption: float = 6.0
    annual_maintenance: float | None = None
    seats: int = 5
    segment: str = "C-Sedan"
    depreciation_rate: float | None = None
    city: str = "hanoi"
    km: float = Field(15000, ge=0, le=MAX_ANNUAL_KM)
    years: int = Field(5, ge=0, le=MAX_TCO_YEARS)
    area: int | None = None
    city_ratio: float = Field(0.3, ge=0, le=1)
    show_opp_cost: bool = False
    rush_hour: bool = False
    include_insurance: bool = False
    include_parking_toll: bool = True


class HistorySaveRequest(BaseModel):
    """Request to save a result to history."""

    name: str = Field(..., max_length=200)
    data: dict[str, Any]


class BreakdownRequest(BaseModel):
    """Request for a calculation breakdown (verbose mode)."""

    car_id: str
    car: CarInfo | None = None  # provided when car_id starts with 'custom-'
    city: str = "hanoi"
    km: float = Field(15000, ge=0, le=MAX_ANNUAL_KM)
    years: int = Field(5, ge=0, le=MAX_TCO_YEARS)
    city_ratio: float = Field(0.3, ge=0, le=1)
    area: int | None = None
    rush_hour: bool = False


class ParkingTollOut(BaseModel):
    """Monthly parking + toll estimates."""

    monthly_parking: int
    monthly_toll: int
    monthly_total: int
    total_over_period: int


class RegistrationOut(BaseModel):
    """Registration tax + plate fee + inspection + year-1 road fee + insurance + on-road."""

    tax: int
    plate: int
    inspection: int
    road_fee: int
    insurance: int
    on_road: int
    total: int


class TcoResult(BaseModel):
    """Single-car TCO result. All monetary values are integer VND."""

    price: float
    reg: RegistrationOut
    reg_tax: int
    on_road: int
    fuel: int
    maint: int
    legal: int
    operating: int
    parking_toll: ParkingTollOut
    resale: int
    resale_logic: str
    resale_spread: int | None = None
    resale_std: int | None = None
    resale_note_key: str | None = None
    resale_market_value: int | None = None
    resale_guarantee_value: int | None = None
    resale_guarantee_floor: int | None = None
    warnings: list[str] | None = None
    depreciation: int
    opp_cost: int
    liquidity: str
    tco: int
    true_financial_impact: int
    monthly: int
    insurance_optional: int = 0
    inspection_periodic: int = 0
    rush_hour_applied: bool = False
    confidence_low: int | None = None
    confidence_high: int | None = None
    ml_max_year: int | None = None


class YearlyBreakdownOut(BaseModel):
    """One year of per-year TCO breakdown. All monetary values are integer VND."""

    year: int
    year_label: str
    fuel: int
    maintenance: int
    legal: int
    inspection: int = 0
    parking_toll: int
    operating_cumulative: int
    resale: int
    resale_market_value: int | None = None
    resale_guarantee_value: int | None = None
    depreciation: int
    cumulative_tco: int


class YearlyBreakdownResponse(BaseModel):
    """Per-year TCO breakdown response."""

    car_id: str
    years: int
    yearly: list[YearlyBreakdownOut]
    warnings: list[str] | None = None
    ml_max_year: int | None = None


class TcoCalculationResponse(BaseModel):
    """Response wrapper for single-car TCO calculation."""

    car_id: str
    car: CarInfo
    city: str
    area: int
    km: float
    years: int
    city_ratio: float
    show_opp_cost: bool
    rush_hour: bool = False
    include_insurance: bool = False
    include_parking_toll: bool = True
    result: TcoResult


class CompareResponse(BaseModel):
    """Response wrapper for multi-car comparison."""

    car_ids: list[str]
    city: str
    area: int
    km: float
    years: int
    city_ratio: float
    show_opp_cost: bool
    rush_hour: bool = False
    include_insurance: bool = False
    include_parking_toll: bool = True
    results: list[TcoResult]


class LoanResult(BaseModel):
    """Loan schedule output. All monetary values are integer VND."""

    loan_amount: int
    down_payment: int
    monthly_payment: int
    total_interest: int
    total_repayment: int
    effective_cost: int
    term_months: int
    annual_rate: float


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

_cars_cache: dict[str, dict] | None = None


def _get_cars() -> dict[str, dict]:
    global _cars_cache
    if _cars_cache is None:
        _cars_cache = load_data()
    return _cars_cache


def _is_custom_car_id(car_id: str) -> bool:
    """True when *car_id* refers to a wizard-built custom car (not in cars.json)."""
    return car_id.startswith("custom-")


def _resolve_custom_car(car_id: str, car: CarInfo | None) -> dict:
    """Build a car dict from the provided CarInfo for a custom car.

    Raises HTTP 400 if *car* is missing when *car_id* is a custom ID, because
    the backend cannot reconstruct a custom car from its ID alone.
    """
    if car is None:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Custom car data required",
                "car_id": car_id,
                "message": "Custom cars (ID starting with 'custom-') must include the full car payload in the 'car' field.",
            },
        )
    car_dict = car.model_dump()
    car_dict["id"] = car_id
    return car_dict


def _resolve_car(car_id: str, car: CarInfo | None, cars: dict[str, dict]) -> dict:
    """Resolve a car by ID, falling back to provided custom car data.

    Regular cars are looked up in *cars* (cars.json). Custom cars (IDs starting
    with ``custom-``) require the ``car`` payload and are not looked up in
    cars.json.
    """
    if _is_custom_car_id(car_id):
        return _resolve_custom_car(car_id, car)
    if car_id not in cars:
        raise HTTPException(status_code=404, detail=f"Car '{car_id}' not found")
    return cars[car_id]


_ownership_stats_cache: dict | None = None
_ownership_stats_ts: float = 0.0


_VALID_CITY_DISPLAYS = {display for display, _norm, _area, _dk in CITY_LIST}


def _resolve_area(city: str, area: int | None) -> int:
    """Resolve the area tier, falling back to city-based detection.

    Raises HTTP 400 if the city is not recognized. Thông tư 155/2025 metro
    logic needs to know whether a city is Hanoi/HCMC core; silently
    defaulting unknown inputs to Area 2 masks user typos and unsupported
    locations (Item 5 — explicit failure over silent misclassification).
    """
    if area is not None:
        return area
    display, resolved = resolve_city(city)
    if display not in _VALID_CITY_DISPLAYS:
        supported = ", ".join(d for d, _n, _a, _dk in CITY_LIST)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Unknown city",
                "input": city,
                "resolved_to": display,
                "supported_cities": supported,
            },
        )
    return resolved


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/cars", response_model=list[CarInfo])
def list_cars():
    """List all available cars."""
    cars = _get_cars()
    return [
        CarInfo(
            id=cid,
            brand=c.get("brand", ""),
            model=c.get("model", cid),
            price=c.get("price", 0),
            type=c.get("type", "ICE"),
            seats=c.get("seats", 5),
            consumption=c.get("consumption", 0.0),
            annual_maintenance=c.get("annual_maintenance"),
            segment=c.get("segment", "C-Sedan"),
            depreciation_rate=c.get("depreciation_rate"),
        )
        for cid, c in cars.items()
    ]


@app.get("/api/cars/search", response_model=list[CarInfo])
def search_cars(q: str):
    """Search cars by brand, model, type, or segment."""
    cars = _get_cars()
    results = _search_cars(cars, q)
    return [
        CarInfo(
            id=cid,
            brand=c.get("brand", ""),
            model=c.get("model", cid),
            price=c.get("price", 0),
            type=c.get("type", "ICE"),
            seats=c.get("seats", 5),
            consumption=c.get("consumption", 0.0),
            annual_maintenance=c.get("annual_maintenance"),
            segment=c.get("segment", "C-Sedan"),
            depreciation_rate=c.get("depreciation_rate"),
        )
        for cid, c in results.items()
    ]


@app.get("/api/cars/{car_id}", response_model=CarInfo)
def get_car(car_id: str):
    """Get a single car by ID."""
    cars = _get_cars()
    if car_id not in cars:
        raise HTTPException(status_code=404, detail=f"Car '{car_id}' not found")
    c = cars[car_id]
    return CarInfo(
        id=car_id,
        brand=c.get("brand", ""),
        model=c.get("model", car_id),
        price=c.get("price", 0),
        type=c.get("type", "ICE"),
        seats=c.get("seats", 5),
        consumption=c.get("consumption", 0.0),
        annual_maintenance=c.get("annual_maintenance"),
        segment=c.get("segment", "C-Sedan"),
        depreciation_rate=c.get("depreciation_rate"),
        model_year=_model_year_for({"id": car_id}),
    )


@app.get("/api/cities", response_model=list[CityInfo])
def list_cities():
    """List all supported cities with area tiers."""
    return [
        CityInfo(name=display, area=area, diacritic=diacritic)
        for display, _norm, area, diacritic in CITY_LIST
    ]


@app.get("/api/stats/ownership")
def ownership_stats(car_id: str | None = None):
    """Fleet annual *operating* ownership cost distribution.

    Social-proof signal only — honest and auditable. Computed as the mean over
    every car of (fuel + maintenance + legal) / years, using a Hanoi baseline
    (15,000 km/yr, 5 years, 60% city driving). Resale is excluded so
    brand-specific resale assumptions do not skew the figure. Cached 30 min.

    If fewer than 10 cars are modelled, `insufficient` is returned and the
    frontend hides the line rather than showing a misleading number.

    Optional `car_id` query param returns `user_percentile` — the standard
    percentile (0–100) of that car's annual cost within the fleet, so the
    frontend can render "top X% most expensive".
    """
    global _ownership_stats_cache, _ownership_stats_ts
    now = datetime.now().timestamp()
    if _ownership_stats_cache is not None and (now - _ownership_stats_ts) < 30 * 60:
        cached = _ownership_stats_cache
    else:
        cars = _get_cars()
        annual_costs: dict[str, int] = {}
        for cid, c in cars.items():
            enriched = _enrich_car(c, cid)
            res = get_tco(enriched, "hanoi", 15000, 5, city_ratio=0.3)
            operating = res["fuel"] + res["maint"] + res["legal"]
            annual_costs[cid] = int(round(operating / 5))

        values = list(annual_costs.values())
        sample_size = len(values)
        computed_at = datetime.now().isoformat()

        if sample_size < 10:
            cached = {
                "min_annual_cost_vnd": None,
                "max_annual_cost_vnd": None,
                "mean_annual_cost_vnd": None,
                "sample_size": sample_size,
                "assumptions_version": APP_VERSION,
                "computed_at": computed_at,
                "insufficient": True,
                "_annual_costs": annual_costs,
            }
        else:
            cached = {
                "min_annual_cost_vnd": min(values),
                "max_annual_cost_vnd": max(values),
                "mean_annual_cost_vnd": int(round(sum(values) / sample_size)),
                "sample_size": sample_size,
                "assumptions_version": APP_VERSION,
                "computed_at": computed_at,
                "insufficient": False,
                "_annual_costs": annual_costs,
            }
        _ownership_stats_cache = cached
        _ownership_stats_ts = now

    payload = {k: v for k, v in cached.items() if not k.startswith("_")}

    if not cached.get("insufficient") and car_id:
        annual_costs = cached.get("_annual_costs", {})
        if car_id in annual_costs:
            user_cost = annual_costs[car_id]
            values = list(annual_costs.values())
            cheaper_or_equal = sum(1 for v in values if v <= user_cost)
            payload["user_percentile"] = int(round(cheaper_or_equal / len(values) * 100))
        else:
            payload["user_percentile"] = None
    else:
        payload["user_percentile"] = None

    return payload


@app.post("/api/tco/calculate", response_model=TcoCalculationResponse)
def calculate_tco(req: TcoRequest):
    """Calculate TCO for a single car.

    Custom cars (car_id starting with ``custom-``) must include the full car
    payload in ``req.car``; they are not present in cars.json.
    """
    cars = _get_cars()
    c = _resolve_car(req.car_id, req.car, cars)
    car_info = CarInfo(
        id=req.car_id,
        brand=c.get("brand", ""),
        model=c.get("model", req.car_id),
        price=c.get("price", 0),
        type=c.get("type", "ICE"),
        seats=c.get("seats", 5),
        consumption=c.get("consumption", 0.0),
        annual_maintenance=c.get("annual_maintenance"),
        segment=c.get("segment", "C-Sedan"),
        depreciation_rate=c.get("depreciation_rate"),
        model_year=_model_year_for(c),
    )
    c = _enrich_car(c, req.car_id)
    area = _resolve_area(req.city, req.area)
    res = get_tco(
        c, req.city, req.km, req.years,
        area=area, city_ratio=req.city_ratio,
        rush_hour=req.rush_hour, include_insurance=req.include_insurance,
        include_parking_toll=req.include_parking_toll,
    )
    return {
        "car_id": req.car_id,
        "car": car_info,
        "city": req.city,
        "area": area,
        "km": req.km,
        "years": req.years,
        "city_ratio": req.city_ratio,
        "show_opp_cost": req.show_opp_cost,
        "rush_hour": req.rush_hour,
        "include_insurance": req.include_insurance,
        "include_parking_toll": req.include_parking_toll,
        "result": res,
    }


@app.post("/api/tco/compare", response_model=CompareResponse)
def compare_tco(req: CompareRequest):
    """Compare TCO for multiple cars.

    Custom cars (car_id starting with ``custom-``) must be included in
    ``req.custom_cars`` with matching IDs.
    """
    cars = _get_cars()
    # Build lookup from custom_cars if provided
    custom_lookup: dict[str, CarInfo] = {}
    if req.custom_cars:
        for cc in req.custom_cars:
            custom_lookup[cc.id] = cc
    for cid in req.car_ids:
        if _is_custom_car_id(cid):
            if cid not in custom_lookup:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "Custom car data required", "car_id": cid,
                            "message": "Custom cars must be included in the 'custom_cars' field."},
                )
        elif cid not in cars:
            raise HTTPException(status_code=404, detail=f"Car '{cid}' not found")
    area = _resolve_area(req.city, req.area)
    results = [
        get_tco(_enrich_car(_resolve_car(cid, custom_lookup.get(cid), cars), cid),
                req.city, req.km, req.years, area=area, city_ratio=req.city_ratio,
                 rush_hour=req.rush_hour, include_insurance=req.include_insurance,
                 include_parking_toll=req.include_parking_toll)
        for cid in req.car_ids
    ]
    return {
        "car_ids": req.car_ids,
        "city": req.city,
        "area": area,
        "km": req.km,
        "years": req.years,
        "city_ratio": req.city_ratio,
        "show_opp_cost": req.show_opp_cost,
        "rush_hour": req.rush_hour,
        "include_insurance": req.include_insurance,
        "include_parking_toll": req.include_parking_toll,
        "results": results,
    }


@app.post("/api/tco/breakdown")
def tco_breakdown(req: BreakdownRequest):
    """Return detailed calculation breakdowns for fuel and registration."""
    cars = _get_cars()
    car = _resolve_car(req.car_id, req.car, cars)
    area = _resolve_area(req.city, req.area)
    fuel = get_fuel_breakdown(car, req.km, req.years, req.city_ratio, rush_hour=req.rush_hour)
    registration = get_registration_breakdown(car, area, city=req.city)
    return {"fuel": fuel, "registration": registration}


@app.post("/api/tco/yearly-breakdown", response_model=YearlyBreakdownResponse)
def tco_yearly_breakdown(req: TcoRequest):
    """Return per-year TCO breakdown for chart visualization with non-linear curves."""
    cars = _get_cars()
    car = _resolve_car(req.car_id, req.car, cars)
    area = _resolve_area(req.city, req.area)
    yearly, warnings, ml_max_year = get_tco_yearly(
        _enrich_car(car, req.car_id), req.city, req.km, req.years,
        area=area, city_ratio=req.city_ratio,
        include_parking_toll=req.include_parking_toll,
    )
    return {
        "car_id": req.car_id,
        "years": req.years,
        "yearly": yearly,
        "warnings": warnings if warnings else None,
        "ml_max_year": ml_max_year,
    }


@app.post("/api/loan/calculate", response_model=LoanResult)
def calculate_loan(req: LoanRequest):
    """Calculate loan schedule using reducing-balance method."""
    return calculate_loan_schedule(
        req.on_road_price, req.down_pct, req.annual_rate, req.term_years,
    )


@app.post("/api/wizard/custom")
def wizard_custom(req: WizardRequest):
    """Calculate TCO for a custom car built via wizard."""
    car = {
        "brand": req.brand,
        "model": req.model,
        "price": req.price,
        "type": req.type.upper(),
        "seats": req.seats,
        "consumption": req.consumption,
        "annual_maintenance": req.annual_maintenance,
        "segment": req.segment,
    }
    if req.depreciation_rate is not None:
        car["depreciation_rate"] = req.depreciation_rate
    area = _resolve_area(req.city, req.area)
    res = get_tco(
        _enrich_car(car), req.city, req.km, req.years,
        area=area, city_ratio=req.city_ratio,
        rush_hour=req.rush_hour, include_insurance=req.include_insurance,
        include_parking_toll=req.include_parking_toll,
    )
    return {
        "car": car,
        "city": req.city,
        "area": area,
        "km": req.km,
        "years": req.years,
        "city_ratio": req.city_ratio,
        "show_opp_cost": req.show_opp_cost,
        "rush_hour": req.rush_hour,
        "include_insurance": req.include_insurance,
        "include_parking_toll": req.include_parking_toll,
        "result": res,
    }


class CsvExportRequest(BaseModel):
    """JSON body for CSV export. Nested result/loan dicts are passed as-is."""

    export_type: Literal["single", "compare"] = "single"
    car_id: str | None = None
    years: int = Field(5, ge=0, le=MAX_TCO_YEARS)
    city: str = "hanoi"
    km: float = Field(15000, ge=0, le=MAX_ANNUAL_KM)
    area: int = 2
    ratio: float = Field(0.3, ge=0, le=1)
    show_opp: bool = False
    result: dict | None = None
    loan: dict | None = None
    car_ids: list[str] | None = None
    results: list[dict] | None = None
    loans: list[dict] | None = None


@app.post("/api/export/csv")
def export_csv(req: CsvExportRequest, background_tasks: BackgroundTasks):
    """Export results to CSV and return as a downloadable file.

    For single-car: provide car_id + result.
    For comparison: provide car_ids + results (+ optional loans).

    Files are written to an isolated temp dir cleaned up via BackgroundTasks so the
    server's working directory is never polluted (no disk leak / path traversal).
    """
    target_dir = Path(tempfile.mkdtemp(prefix="vidrive_csv_"))
    background_tasks.add_task(shutil.rmtree, str(target_dir), ignore_errors=True)
    if req.export_type == "single":
        if req.car_id is None or req.result is None:
            raise HTTPException(400, detail="car_id and result required for single export")
        path = export_single_csv(req.car_id, req.years, req.result, req.city, req.km, req.area, req.ratio, req.show_opp, req.loan, target_dir=target_dir)
    else:
        if req.car_ids is None or req.results is None:
            raise HTTPException(400, detail="car_ids and results required for compare export")
        path = export_compare_csv(req.car_ids, req.results, req.years, req.city, req.km, req.area, req.ratio, req.show_opp, req.loans, target_dir=target_dir)

    filepath = Path(path)
    if not filepath.exists():
        raise HTTPException(500, detail="CSV file generation failed")

    return FileResponse(
        path=str(filepath),
        media_type="text/csv",
        filename=filepath.name,
    )


class PdfExportRequest(BaseModel):
    """JSON body for PDF export. Mirrors CsvExportRequest shape."""

    export_type: Literal["single", "compare"] = "single"
    lang: Literal["en", "vi"] = "vi"
    car_id: str | None = None
    years: int = Field(5, ge=0, le=MAX_TCO_YEARS)
    city: str = "hanoi"
    km: float = Field(15000, ge=0, le=MAX_ANNUAL_KM)
    area: int | None = None
    ratio: float = Field(0.3, ge=0, le=1)
    show_opp: bool = False
    result: dict | None = None
    loan: dict | None = None
    car_ids: list[str] | None = None
    results: list[dict] | None = None
    loans: list[dict] | None = None


@app.post("/api/export/pdf")
async def export_pdf(req: PdfExportRequest, background_tasks: BackgroundTasks):
    """Export results to PDF (LaTeX) or plain-text fallback via the ViDrive PDF engine.

    Runs PDF generation in a thread (via run_in_threadpool) so the event loop
    stays responsive, and cleans up the temp directory via BackgroundTasks.
    """
    import threading
    import src.i18n as i18n_mod

    lang = req.lang if req.lang in ('en', 'vi') else 'vi'
    lock = getattr(export_pdf, '_lang_lock', threading.Lock())
    export_pdf._lang_lock = lock  # type: ignore[attr-defined]
    saved_lang = i18n_mod._lang

    target_dir = Path(tempfile.mkdtemp(prefix="vidrive_pdf_"))
    background_tasks.add_task(shutil.rmtree, str(target_dir), ignore_errors=True)

    with lock:
        i18n_mod.set_language(lang)
        try:
            # Resolve area from city if not provided
            if req.area is None:
                try:
                    _, area = resolve_city(req.city)
                except Exception:
                    area = 2
            else:
                area = req.area

            km_int = int(req.km)
            years_val = req.years
            ratio_val = req.ratio
            show_opp_val = req.show_opp

            if req.export_type == "single":
                if req.car_id is None or req.result is None:
                    raise HTTPException(400, detail="car_id and result required for single export")
                msg = await run_in_threadpool(
                    generate_pdf_single,
                    req.car_id, 0, req.result, req.city, km_int, years_val,
                    area, ratio_val, show_opp_val, req.loan,
                    target_dir=target_dir,
                )
            else:
                if req.car_ids is None or req.results is None:
                    raise HTTPException(400, detail="car_ids and results required for compare export")
                msg = await run_in_threadpool(
                    generate_pdf_compare,
                    req.car_ids, req.results, 0, req.city, km_int, years_val,
                    area, ratio_val, show_opp_val, req.loans,
                    target_dir=target_dir,
                )

            # Locate the generated file in the temp directory
            from datetime import date as _date
            if req.export_type == "single":
                safe_id = re.sub(r'[^a-z0-9_]', '_', (req.car_id or '').lower())[:64]
                base_name = f"vidrive_{safe_id}_{_date.today().strftime('%Y%m%d')}"
            else:
                base_name = f"vidrive_compare_{_date.today().strftime('%Y%m%d')}"

            pdf_file = target_dir / f"{base_name}.pdf"
            txt_file = target_dir / f"{base_name}.txt"
            tex_file = target_dir / f"{base_name}.tex"

            if pdf_file.exists():
                return FileResponse(
                    path=str(pdf_file),
                    media_type="application/pdf",
                    filename=pdf_file.name,
                )
            if txt_file.exists():
                return FileResponse(
                    path=str(txt_file),
                    media_type="text/plain",
                    filename=txt_file.name,
                )
            if tex_file.exists():
                return FileResponse(
                    path=str(tex_file),
                    media_type="application/x-tex",
                    filename=tex_file.name,
                )
            raise HTTPException(500, detail=f"PDF generation failed: {msg}")
        finally:
            i18n_mod._lang = saved_lang


@app.get("/api/history", response_model=list[dict])
def get_history():
    """Load all saved results."""
    return load_history()


@app.get("/api/history/{name}", response_model=dict)
def get_history_result(name: str):
    """Load a specific saved result by name."""
    data = load_result(name)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Result '{name}' not found")
    return data


@app.post("/api/history/save")
def save_history(req: HistorySaveRequest):
    """Save a result to history."""
    path = save_result(req.name, req.data)
    return {"path": path, "name": req.name}


@app.delete("/api/history/{name}")
def delete_history(name: str):
    """Delete a saved result."""
    success = delete_result(name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Result '{name}' not found")
    return {"deleted": name}


@app.delete("/api/history")
def clear_all_history():
    """Clear all saved results."""
    count = clear_history()
    return {"cleared": count}


@app.get("/api/config")
def get_config():
    """Get app configuration and metadata."""
    return {
        "version": APP_VERSION,
        "max_comparison_cars": MAX_COMPARISON_CARS,
        "supported_cities": len(CITY_LIST),
    }


# ---------------------------------------------------------------------------
# Community config proposals — review-only feedback loop (no live override)
# ---------------------------------------------------------------------------


def _v(value: Any) -> float:
    """Return a numeric value for schema serialization (reads live constant)."""
    return value


ASSUMPTIONS: list[dict[str, Any]] = [
    # --- Fuel Prices: current retail (used in calc) vs 5-yr forecast ---
    {
        "key": "PETROL_PRICE_CURRENT_VND", "group": "fuelPrices",
        "label_i18n": "config.fuel.petrolCurrent", "type": "float",
        "unit": "VND/L", "min": 0, "max": 1_000_000, "step": 50,
        "editable": True, "value": lambda: _v(PETROL_PRICE_CURRENT_VND),
    },
    {
        "key": "PETROL_PRICE_FORECAST_VND", "group": "fuelPrices",
        "label_i18n": "config.fuel.petrolForecast", "type": "float",
        "unit": "VND/L", "min": 0, "max": 1_000_000, "step": 50,
        "editable": False, "value": lambda: _v(PETROL_PRICE_FORECAST_VND),
    },
    {
        "key": "DIESEL_PRICE_CURRENT_VND", "group": "fuelPrices",
        "label_i18n": "config.fuel.dieselCurrent", "type": "float",
        "unit": "VND/L", "min": 0, "max": 1_000_000, "step": 50,
        "editable": True, "value": lambda: _v(DIESEL_PRICE_CURRENT_VND),
    },
    {
        "key": "DIESEL_PRICE_FORECAST_VND", "group": "fuelPrices",
        "label_i18n": "config.fuel.dieselForecast", "type": "float",
        "unit": "VND/L", "min": 0, "max": 1_000_000, "step": 50,
        "editable": False, "value": lambda: _v(DIESEL_PRICE_FORECAST_VND),
    },
    {
        "key": "EV_CHARGING_PRICE_VND", "group": "fuelPrices",
        "label_i18n": "config.fuel.evCharging", "type": "float",
        "unit": "VND/kWh", "min": 0, "max": 100_000, "step": 10,
        "editable": True, "value": lambda: _v(EV_CHARGING_PRICE_VND),
    },
    # --- Registration ---
    {
        "key": "ICE_REGISTRATION_RATE_STANDARD", "group": "registration",
        "label_i18n": "config.reg.iceStandard", "type": "float",
        "unit": "ratio", "min": 0, "max": 1, "step": 0.001,
        "editable": True, "value": lambda: _v(ICE_REGISTRATION_RATE_STANDARD),
    },
    {
        "key": "ICE_REGISTRATION_RATE_CENTRAL_CITY", "group": "registration",
        "label_i18n": "config.reg.iceCentralCity", "type": "float",
        "unit": "ratio", "min": 0, "max": 1, "step": 0.001,
        "editable": True, "value": lambda: _v(ICE_REGISTRATION_RATE_CENTRAL_CITY),
    },
    {
        "key": "EV_POST_EXEMPTION_DISCOUNT", "group": "registration",
        "label_i18n": "config.reg.evDiscount", "type": "float",
        "unit": "ratio", "min": 0, "max": 1, "step": 0.01,
        "editable": True, "value": lambda: _v(EV_POST_EXEMPTION_DISCOUNT),
    },
    {
        "key": "EV_EXEMPTION_END_DATE", "group": "info",
        "label_i18n": "config.reg.evExemptionEnd", "type": "date",
        "unit": "", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(EV_EXEMPTION_END_DATE.isoformat()),
    },
    # --- On-Road Fees ---
    {
        "key": "INSPECTION_FEE", "group": "onRoadFees",
        "label_i18n": "config.onRoad.inspection", "type": "float",
        "unit": "VND", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(INSPECTION_FEE),
    },
    {
        "key": "ROAD_MAINTENANCE_FEE_YEARLY", "group": "onRoadFees",
        "label_i18n": "config.onRoad.maintenance", "type": "float",
        "unit": "VND/year", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(ROAD_MAINTENANCE_FEE_YEARLY),
    },
    {
        "key": "CIVIL_INSURANCE_UNDER_6", "group": "onRoadFees",
        "label_i18n": "config.onRoad.insuranceUnder6", "type": "float",
        "unit": "VND/year", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(CIVIL_INSURANCE_UNDER_6),
    },
    {
        "key": "CIVIL_INSURANCE_6_TO_11", "group": "onRoadFees",
        "label_i18n": "config.onRoad.insurance6to11", "type": "float",
        "unit": "VND/year", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(CIVIL_INSURANCE_6_TO_11),
    },
    # --- PLATE_FEES: Area-1 splits into metro (Hanoi/HCMC) vs other (Da Nang/Hue/Can Tho/Hai Phong) ---
    {
        "key": "PLATE_FEE_METRO", "group": "onRoadFees", "area": "1_metro",
        "label_i18n": "config.onRoad.plateFeeArea1Metro", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(PLATE_FEE_METRO),
    },
    {
        "key": "PLATE_FEE_NON_METRO_AREA1", "group": "onRoadFees", "area": "1_other",
        "label_i18n": "config.onRoad.plateFeeArea1Other", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(PLATE_FEE_NON_METRO_AREA1),
    },
    {
        "key": "PLATE_FEES", "group": "onRoadFees", "area": 2,
        "label_i18n": "config.onRoad.plateFeeArea2", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(PLATE_FEES[2]),
    },
    {
        "key": "PLATE_FEES", "group": "onRoadFees", "area": 3,
        "label_i18n": "config.onRoad.plateFeeArea3", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(PLATE_FEES[3]),
    },
    # --- Maintenance ---
    {
        "key": "BASE_ANNUAL_MAINTENANCE_ICE", "group": "maintenance",
        "label_i18n": "methodology.assumption.iceBaseAnnual", "type": "int",
        "unit": "VND",
        "editable": True, "value": lambda: _v(BASE_ANNUAL_MAINTENANCE_ICE),
        "description_i18n": "methodology.assumption.iceBaseAnnualDesc",
    },
    {
        "key": "BASE_ANNUAL_MAINTENANCE_EV", "group": "maintenance",
        "label_i18n": "methodology.assumption.evBaseAnnual", "type": "int",
        "unit": "VND",
        "editable": True, "value": lambda: _v(BASE_ANNUAL_MAINTENANCE_EV),
        "description_i18n": "methodology.assumption.evBaseAnnualDesc",
    },
    {
        "key": "MAINTENANCE_MAJOR_KM", "group": "maintenance",
        "label_i18n": "config.maint.majorServiceKm", "type": "float",
        "unit": "km", "min": 1_000, "max": 200_000, "step": 1_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_MAJOR_KM),
    },
    {
        "key": "MAINTENANCE_MAJOR_COST_ICE", "group": "maintenance",
        "label_i18n": "config.maint.majorCostIce", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_MAJOR_COST_ICE),
    },
    {
        "key": "MAINTENANCE_MAJOR_COST_ICE_D", "group": "maintenance",
        "label_i18n": "config.maint.majorCostIceD", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_MAJOR_COST_ICE_D),
    },
    {
        "key": "MAINTENANCE_MAJOR_COST_EV", "group": "maintenance",
        "label_i18n": "config.maint.majorCostEv", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_MAJOR_COST_EV),
    },
    # --- Maintenance spike tiers (40k / 80k / 120k for ICE/ICE-D/HEV; 15k / 45k / 90k for EV) ---
    # Each entry references the corresponding powertrain's spike schedule from MAINTENANCE_SPIKES.
    # These allow users to propose alternative costs for each major service mile-interval.
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "ICE", "tier": "40k",
        "label_i18n": "config.maint.spike40kIce", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["ICE"][0][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "ICE", "tier": "80k",
        "label_i18n": "config.maint.spike80kIce", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["ICE"][1][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "ICE", "tier": "120k",
        "label_i18n": "config.maint.spike120kIce", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["ICE"][2][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "ICE-D", "tier": "40k",
        "label_i18n": "config.maint.spike40kIceD", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["ICE-D"][0][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "ICE-D", "tier": "80k",
        "label_i18n": "config.maint.spike80kIceD", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["ICE-D"][1][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "ICE-D", "tier": "120k",
        "label_i18n": "config.maint.spike120kIceD", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["ICE-D"][2][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "HEV", "tier": "40k",
        "label_i18n": "config.maint.spike40kHev", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["HEV"][0][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "HEV", "tier": "80k",
        "label_i18n": "config.maint.spike80kHev", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["HEV"][1][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "HEV", "tier": "120k",
        "label_i18n": "config.maint.spike120kHev", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["HEV"][2][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "EV", "tier": "15k",
        "label_i18n": "config.maint.spike15kEv", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["EV"][0][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "EV", "tier": "45k",
        "label_i18n": "config.maint.spike45kEv", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["EV"][1][1]),
    },
    {
        "key": "MAINTENANCE_SPIKES", "group": "maintenance", "car_type": "EV", "tier": "90k",
        "label_i18n": "config.maint.spike90kEv", "type": "float",
        "unit": "VND", "min": 0, "max": 50_000_000, "step": 100_000,
        "editable": True, "value": lambda: _v(MAINTENANCE_SPIKES["EV"][2][1]),
    },
    # --- Market Factors ---
    {
        "key": "SAVINGS_INTEREST_RATE", "group": "marketFactors",
        "label_i18n": "config.market.savingsRate", "type": "float",
        "unit": "ratio", "min": 0, "max": 1, "step": 0.001,
        "editable": True, "value": lambda: _v(SAVINGS_INTEREST_RATE),
    },
    # --- Depreciation ---
    {
        "key": "DEPRECIATION_SHOWROOM_EXIT_PENALTY", "group": "depreciation",
        "label_i18n": "config.deprec.showroomExitPenalty", "type": "float",
        "unit": "ratio", "min": 0, "max": 1, "step": 0.001,
        "editable": True, "value": lambda: _v(DEPRECIATION_SHOWROOM_EXIT_PENALTY),
    },
    # --- Depreciation engine tiers (read-only) ---
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "Tier 1",
        "label_i18n": "config.deprec.tier1.y1Drop", "type": "float",
        "unit": "y1_drop", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["Tier 1"]["y1_drop"]),
    },
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "Tier 1",
        "label_i18n": "config.deprec.tier1.annualDecay", "type": "float",
        "unit": "annual_decay", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["Tier 1"]["annual_decay"]),
    },
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "Tier 2",
        "label_i18n": "config.deprec.tier2.y1Drop", "type": "float",
        "unit": "y1_drop", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["Tier 2"]["y1_drop"]),
    },
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "Tier 2",
        "label_i18n": "config.deprec.tier2.annualDecay", "type": "float",
        "unit": "annual_decay", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["Tier 2"]["annual_decay"]),
    },
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "Tier 3",
        "label_i18n": "config.deprec.tier3.y1Drop", "type": "float",
        "unit": "y1_drop", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["Tier 3"]["y1_drop"]),
    },
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "Tier 3",
        "label_i18n": "config.deprec.tier3.annualDecay", "type": "float",
        "unit": "annual_decay", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["Tier 3"]["annual_decay"]),
    },
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "EV_Market",
        "label_i18n": "config.deprec.evMarket.y1Drop", "type": "float",
        "unit": "y1_drop", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["EV_Market"]["y1_drop"]),
    },
    {
        "key": "DEPRECIATION_EQ_PARAMS", "group": "depreciation", "tier": "EV_Market",
        "label_i18n": "config.deprec.evMarket.annualDecay", "type": "float",
        "unit": "annual_decay", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DEPRECIATION_EQ_PARAMS["EV_Market"]["annual_decay"]),
    },
    # --- Traffic Efficiency (per powertrain) ---
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "ICE",
        "label_i18n": "config.traffic.iceCity", "type": "float",
        "unit": "city_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["ICE"][0]),
    },
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "ICE",
        "label_i18n": "config.traffic.iceHighway", "type": "float",
        "unit": "highway_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["ICE"][1]),
    },
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "ICE-D",
        "label_i18n": "config.traffic.iceDCity", "type": "float",
        "unit": "city_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["ICE-D"][0]),
    },
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "ICE-D",
        "label_i18n": "config.traffic.iceDHighway", "type": "float",
        "unit": "highway_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["ICE-D"][1]),
    },
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "HEV",
        "label_i18n": "config.traffic.hevCity", "type": "float",
        "unit": "city_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["HEV"][0]),
    },
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "HEV",
        "label_i18n": "config.traffic.hevHighway", "type": "float",
        "unit": "highway_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["HEV"][1]),
    },
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "EV",
        "label_i18n": "config.traffic.evCity", "type": "float",
        "unit": "city_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["EV"][0]),
    },
    {
        "key": "TRAFFIC_EFFICIENCY_MAP", "group": "trafficEfficiency", "car_type": "EV",
        "label_i18n": "config.traffic.evHighway", "type": "float",
        "unit": "highway_factor", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(TRAFFIC_EFFICIENCY_MAP["EV"][1]),
    },
    # --- Parking & Toll (per area) ---
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area1_metro",
        "label_i18n": "config.parkingToll.area1MetroParking", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area1_metro"]["parking_monthly"]),
    },
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area1_metro",
        "label_i18n": "config.parkingToll.area1MetroToll", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area1_metro"]["toll_monthly"]),
    },
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area1",
        "label_i18n": "config.parkingToll.area1Parking", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area1"]["parking_monthly"]),
    },
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area1",
        "label_i18n": "config.parkingToll.area1Toll", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area1"]["toll_monthly"]),
    },
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area2",
        "label_i18n": "config.parkingToll.area2Parking", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area2"]["parking_monthly"]),
    },
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area2",
        "label_i18n": "config.parkingToll.area2Toll", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area2"]["toll_monthly"]),
    },
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area3",
        "label_i18n": "config.parkingToll.area3Parking", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area3"]["parking_monthly"]),
    },
    {
        "key": "PARKING_TOLL_ESTIMATES", "group": "parkingToll", "area": "area3",
        "label_i18n": "config.parkingToll.area3Toll", "type": "float",
        "unit": "VND/month", "min": 0, "max": 10_000_000, "step": 10_000,
        "editable": True, "value": lambda: _v(PARKING_TOLL_ESTIMATES["area3"]["toll_monthly"]),
    },
    # --- Structural / read-only ---
    {
        "key": "CITY_LIST", "group": "structural",
        "label_i18n": "config.structural.cities", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(len(CITY_LIST)),
    },
    {
        "key": "AREA1_CITIES", "group": "structural",
        "label_i18n": "config.structural.area1Cities", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(len(AREA1_CITIES)),
    },
    {
        "key": "AREA2_PROVINCES", "group": "structural",
        "label_i18n": "config.structural.area2Provinces", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(len(AREA2_PROVINCES)),
    },
    {
        "key": "WIZARD_SEGMENTS", "group": "structural",
        "label_i18n": "config.structural.wizardSegments", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(len(WIZARD_SEGMENTS)),
    },
    {
        "key": "BRAND_LIQUIDITY_MAP", "group": "structural",
        "label_i18n": "config.structural.brands", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(len(BRAND_LIQUIDITY_MAP)),
    },
    {
        "key": "LIQUIDITY_LOGIC_MAP", "group": "structural",
        "label_i18n": "config.structural.liquidityTiers", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(len(LIQUIDITY_LOGIC_MAP)),
    },
    {
        "key": "SEGMENT_DEPRECIATION_MAP", "group": "structural",
        "label_i18n": "config.structural.segments", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(len(SEGMENT_DEPRECIATION_MAP)),
    },
    # --- Info / metadata (read-only) ---
    {
        "key": "APP_VERSION", "group": "info",
        "label_i18n": "config.info.version", "type": "string",
        "unit": "", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(APP_VERSION),
    },
    {
        "key": "LAST_UPDATED", "group": "info",
        "label_i18n": "config.info.lastUpdated", "type": "date",
        "unit": "", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(LAST_UPDATED.isoformat()),
    },
    {
        "key": "DATA_RECENCY_DAYS", "group": "info",
        "label_i18n": "config.info.dataRecency", "type": "int",
        "unit": "days", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(DATA_RECENCY_DAYS),
    },
    {
        "key": "MAX_COMPARISON_CARS", "group": "info",
        "label_i18n": "config.info.maxCompareCars", "type": "int",
        "unit": "count", "min": None, "max": None, "step": None,
        "editable": False, "value": lambda: _v(MAX_COMPARISON_CARS),
    },
]

# Backfill last_verified on every assumption entry (ISO date of latest config.py audit).
for _entry in ASSUMPTIONS:
    _entry.setdefault("last_verified", "2026-08-08")

# Build a flat dict of editable assumption entries for fast lookup by proposal submission
_EDITABLE_KEYS: dict[tuple[str, tuple], dict[str, Any]] = {}
for _entry in ASSUMPTIONS:
    if _entry.get("editable"):
        _sub: tuple = ()
        for _f in ("area", "tier", "car_type"):
            if _f in _entry:
                _sub = _sub + (_entry[_f],)
        _EDITABLE_KEYS[(_entry["key"], _sub)] = _entry


class AssumptionItem(BaseModel):
    key: str
    group: str
    label_i18n: str
    type: str
    unit: str
    min: float | int | None = None
    max: float | int | None = None
    step: float | int | None = None
    value: Any
    editable: bool
    area: Any = None
    tier: str | None = None
    car_type: str | None = None
    last_verified: str | None = None


class AssumptionGroup(BaseModel):
    key: str
    title_i18n: str
    items: list[AssumptionItem]


class AssumptionsResponse(BaseModel):
    metadata: dict[str, Any]
    groups: list[AssumptionGroup]


class ConfigProposalChange(BaseModel):
    key: str
    value: float
    area: Any = None
    tier: str | None = None
    car_type: str | None = None


class ConfigProposalIn(BaseModel):
    author: str | None = None
    locale: Literal["en", "vi"] = "en"
    changes: list[ConfigProposalChange]
    metadata: dict[str, Any] | None = None


GROUP_TITLES: dict[str, str] = {
    "fuelPrices": "config.group.fuelPrices",
    "registration": "config.group.registration",
    "onRoadFees": "config.group.onRoadFees",
    "maintenance": "config.group.maintenance",
    "marketFactors": "config.group.marketFactors",
    "depreciation": "config.group.depreciation",
    "trafficEfficiency": "config.group.trafficEfficiency",
    "parkingToll": "config.group.parkingToll",
    "structural": "config.group.structural",
    "info": "config.group.info",
}


def get_assumptions_schema() -> AssumptionsResponse:
    """Build the assumptions schema response from the live ASSUMPTIONS registry."""
    # Group entries, preserving registry order
    groups_ordered: list[str] = []
    groups_map: dict[str, list[dict[str, Any]]] = {}
    for entry in ASSUMPTIONS:
        g = entry["group"]
        if g not in groups_map:
            groups_map[g] = []
            groups_ordered.append(g)
        groups_map[g].append({
            k: (v() if callable(v) else v)
            for k, v in entry.items()
        })

    groups: list[AssumptionGroup] = []
    for g in groups_ordered:
        items: list[AssumptionItem] = []
        for raw in groups_map[g]:
            items.append(AssumptionItem(**{
                k: raw[k] for k in (
                    "key", "group", "label_i18n", "type", "unit",
                    "min", "max", "step", "value", "editable",
                    "area", "tier", "car_type", "last_verified",
                ) if k in raw
            }))
        groups.append(AssumptionGroup(
            key=g,
            title_i18n=GROUP_TITLES.get(g, g),
            items=items,
        ))

    metadata = {
        "last_updated": LAST_UPDATED.isoformat(),
        "data_recency_days": DATA_RECENCY_DAYS,
        "days_since_update": (date.today() - LAST_UPDATED).days,
        "data_stale": (date.today() - LAST_UPDATED).days > DATA_RECENCY_DAYS,
        "app_version": APP_VERSION,
    }
    return AssumptionsResponse(metadata=metadata, groups=groups)


@app.get("/api/config/assumptions", response_model=AssumptionsResponse)
def get_assumptions():
    """Return all numeric config assumptions with labels, units, bounds, and editability flags."""
    return get_assumptions_schema()


@app.post("/api/config/proposals")
def submit_proposal(req: ConfigProposalIn, request: Request):
    """Submit a config assumption proposal. Writes a timestamped JSON file for review.

    Review-only: proposals do NOT override live calculations.
    """
    errors: list[str] = []
    current_values: list[dict[str, Any]] = []

    for change in req.changes:
        change_key = change.key
        sub: tuple = ()
        for f in ("area", "tier", "car_type"):
            val = getattr(change, f, None)
            if val is not None:
                sub = sub + (val,)
        entry = _EDITABLE_KEYS.get((change_key, sub))
        if entry is None:
            errors.append(f"{change_key} (sub={sub}): not an editable assumption")
            continue
        # Validate value type
        try:
            if entry["type"] == "int":
                prop_val = int(float(change.value))
            elif entry["type"] == "float":
                prop_val = float(change.value)
            else:
                errors.append(f"{change_key}: non-numeric type")
                continue
        except (ValueError, TypeError):
            errors.append(f"{change_key}: value is not numeric")
            continue
        # Validate bounds
        if entry.get("min") is not None and prop_val < entry["min"]:
            errors.append(f"{change_key}: below minimum ({entry['min']})")
        if entry.get("max") is not None and prop_val > entry["max"]:
            errors.append(f"{change_key}: above maximum ({entry['max']})")
        # Record current value
        current_values.append({
            "key": change_key,
            "sub": list(sub),
            "current": entry["value"](),
            "proposed": prop_val,
        })

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    if not req.changes:
        raise HTTPException(status_code=400, detail={"errors": ["no changes provided"]})

    PROPOSALS_DIR.mkdir(parents=True, exist_ok=True)
    ts = date.today().strftime("%Y%m%d_%H%M%S")
    filename = f"proposal_{ts}_{uuid.uuid4().hex[:8]}.json"
    filepath = PROPOSALS_DIR / filename

    payload_written = {
        "timestamp": date.today().isoformat(),
        "author": req.author,
        "locale": req.locale,
        "user_agent": request.headers.get("user-agent", ""),
        "changes": [c.model_dump() for c in req.changes],
        "current": current_values,
    }
    if req.metadata:
        payload_written["metadata"] = req.metadata

    filepath.write_text(json.dumps(payload_written, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"status": "saved", "path": filename}