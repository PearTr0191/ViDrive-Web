"""
Multi-source scraper: extracts listings from chotot.vn, oto.com.vn, bonbanh.com
and merges into training_data.json.

Usage:
  python data/models/multi_source_scraper.py
  Then follow the prompts to use Playwright for each source.
"""
import html
import json
import re
import sys
from pathlib import Path
from typing import Optional

HERE = Path(__file__).parent
TRAINING_FILE = HERE / "training_data.json"
CARS_FILE = HERE.parent / "cars.json"

BRANDS = [
    "Toyota", "Honda", "Hyundai", "Kia", "Mazda", "Mitsubishi", "Ford",
    "VinFast", "Vinfast", "Nissan", "Suzuki", "Subaru", "Isuzu", "MG",
    "BYD", "Geely", "Omoda", "Jaecoo", "Haval", "Peugeot", "Mercedes",
    "Mercedes-Benz", "BMW", "Audi", "Lexus", "Volkswagen", "Chevrolet",
    "Daewoo", "Ssangyong", "Land Rover", "Jeep", "Porsche", "Mini",
    "Volvo", "Tesla", "Mini Cooper", "Hummer", "Zotye",
]

BRAND_ALIASES = {
    "vinfast": "VinFast",
    "mercedes-benz": "Mercedes-Benz",
    "mercedes": "Mercedes-Benz",
    "mini cooper": "Mini",
}

SEGMENT_KEYWORDS = {
    "A-Hatch": ["morning", "i10", "spark", "grand i10", "wigo"],
    "B-Hatch": ["jazz", "yaris", "mazda2", "rio", "swift", "baleno"],
    "A-SUV": ["raize", "sonet", "stonic", "venue"],
    "B-Sedan": ["vios", "accent", "city", "almera", "soluto"],
    "C-Sedan": ["civic", "elantra", "mazda3", "mazda 3", "k3", "altis", "corolla altis",
                "mg5", "cerato", "forte", "focus"],
    "D-Sedan": ["camry", "accord", "mazda6", "sonata", "teana", "e200",
                "e300", "s450", "7 series", "5 series"],
    "B-SUV": ["corolla cross", "creta", "seltos", "cx-30", "cx30", "kona",
              "xforce", "mg zs", "s-cross", "vitara", "hr-v", "xv",
              "crosstrek", "vf5", "vf6", "vf e34", "e34", "atto 3",
              "t-cross", "tracker", "ecosport"],
    "C-SUV": ["cr-v", "cx-5", "cx5", "tucson", "sportage", "forester",
              "outlander", "territory", "mg hs", "haval h6", "jaecoo 7",
              "ex5", "vf7", "x-trail", "rogue", "santa fe", "santafe",
              "glc 300", "glc"],
    "D-SUV": ["fortuner", "everest", "pajero", "montero", "mu-x",
              "trailblazer", "vf8", "vf9", "highlander", "prado",
              "land cruiser", "defender", "range rover", "gx 460",
              "lx 570", "gls", "x5", "cx-8", "cx8", "sorento",
              "cayenne", "macan"],
    "MPV": ["innova", "avanza", "veloz", "xpander", "ertiga", "xl7",
            "carens", "br-v", "custin", "stargazer", "carnival",
            "sedona", "freed", "mpv7", "limo", "transit",
            "alphard", "previa", "tourneo"],
    "Pickup": ["hilux", "ranger", "navara", "triton", "d-max", "strada",
               "colorado", "bt-50"],
    "EV-Mini": ["vf3", "wuling", "mini ev", "ex2"],
}


def norm_brand(name: str) -> str:
    return BRAND_ALIASES.get(name.lower().strip(), name)


def find_brand(text: str) -> Optional[str]:
    """Match a car brand as a whole word, longest-match first.

    Word-boundary matching prevents substring collisions (e.g. "MG" matching
    inside "AMG"), and longest-first ordering ensures "Mercedes-Benz" wins
    over the shorter "Mercedes"."""
    t = text.lower()
    for brand in sorted(BRANDS, key=len, reverse=True):
        if re.search(r"\b" + re.escape(brand.lower()) + r"\b", t):
            return norm_brand(brand)
    return None


def parse_price(text: str) -> Optional[float]:
    text = text.lower().strip().replace(" ", "").replace(",", "")
    m = re.search(r"([\d.]+)\s*đ", text)
    if m:
        return float(m.group(1).replace(".", ""))
    # Accept both Vietnamese billion spellings: "tỷ" (U+1EF7) and "tỉ" (U+1ED9).
    m = re.search(r"([\d.]+)\s*t(?:ỷ|ỉ)", text)
    if m:
        return float(m.group(1).replace(".", "")) * 1_000_000_000
    m = re.search(r"([\d.]+)\s*(?:triệu|tr)", text)
    if m:
        return float(m.group(1).replace(".", "")) * 1_000_000
    # "410 triệu" format
    m = re.search(r"([\d]+)\s*triệu", text)
    if m:
        return float(m.group(1)) * 1_000_000
    return None
def parse_mileage(text: str) -> Optional[int]:
    text = text.lower().replace(",", "")
    m = re.search(r"([\d.]+)\s*vạn\s*km", text)
    if m:
        return int(float(m.group(1)) * 10000)
    m = re.search(r"([\d.]+)\s*km", text)
    if m:
        return int(m.group(1).replace(".", ""))
    return None


def parse_year(text: str) -> Optional[int]:
    m = re.search(r"\b(20[0-2][0-9])\b", text)
    if m:
        y = int(m.group(1))
        if 2000 <= y <= 2026:
            return y
    return None


def infer_type(text: str) -> str:
    t = text.lower()
    if "dầu" in t or "diesel" in t:
        return "ICE-D"
    if "điện" in t:
        return "EV"
    if "hybrid" in t or "hev" in t:
        return "HEV"
    return "ICE"


def infer_segment(brand: str, model: str, price: float) -> str:
    ml = model.lower()
    for seg, kws in SEGMENT_KEYWORDS.items():
        for kw in kws:
            if kw in ml:
                return seg
    if price < 400_000_000:
        return "A-Hatch"
    elif price < 600_000_000:
        return "B-Sedan"
    elif price < 900_000_000:
        return "C-Sedan"
    elif price < 1_500_000_000:
        return "D-Sedan"
    else:
        return "D-SUV"


def extract_model(title: str, brand: str) -> str:
    rest = re.sub(re.escape(brand), "", title, flags=re.IGNORECASE).strip()
    rest = re.sub(r"\s*20[0-2][0-9]\s*", " ", rest)
    rest = re.sub(r"\s*(?:trắng|đen|đỏ|xám|bạc|xanh|nâu|vàng|cam|tím)\s*", " ", rest, flags=re.IGNORECASE)
    rest = re.sub(r"\s*(?:mới|cũ|chính\s*hãng|giá\s*tốt|số\s*(?:tự\s*động|sàn)|tự\s*động)\s*", " ", rest, flags=re.IGNORECASE)
    rest = re.sub(r"[^\w\s\-/]", " ", rest)
    rest = re.sub(r"\s+", " ", rest).strip()
    rest = re.sub(r"[\-\s]+$", "", rest).strip()
    return rest[:80] if rest else brand


def parse_chotot_text(page_text: str) -> list[dict]:
    """Parse chotot.vn page text."""
    listings = []
    seen = set()
    lines = page_text.split('\n')
    
    noise = {
        "Toàn quốc", "Liên hệ", "Đăng nhập", "Bán xe", "Lưu tìm kiếm",
        "Xem thêm", "Lọc", "Ô tô", "Giá", "Năm sản xuất", "Hãng xe",
        "Nhiên liệu", "Hộp số", "Tình trạng", "Đăng bởi", "Xoá lọc",
        "Khu vực:", "Gần tôi", "Tất cả", "Cá nhân", "Bán chuyên",
        "Tin có video", "Tin mới nhất", "Dạng lưới", "Hết ga hết số",
        "Chat", "Bấm để hiện số", "Giá tốt", "1 chủ",
        "Tải ứng dụng Chợ Tốt", "Hỗ trợ khách hàng", "Về Chợ Tốt",
        "Liên kết", "Trung tâm trợ giúp", "An toàn mua bán",
        "Liên hệ hỗ trợ", "Giới thiệu", "Quy chế hoạt động sàn",
        "Chính sách bảo mật", "Giải quyết tranh chấp", "Tuyển dụng",
        "Truyền thông", "Blog",
    }
    
    clean = []
    for line in lines:
        s = line.strip()
        if not s or s in noise:
            continue
        if s.startswith(("Bạn cần tìm", "Mua bán ô tô cũ", "Giá xe ô tô cũ",
                         "Từ 1/6/2026", "CÔNG TY TNHH", "Địa chỉ:", "Email:",
                         "CSKH:", "Gói Ô Tô", "Gói Xe Máy")):
            continue
        if re.match(r'^(?:Toyota|Hyundai|Kia|Ford|VinFast|Honda|Mitsubishi|Mazda|Chevrolet|Mercedes)\s*$', s):
            continue
        clean.append(s)
    
    i = 0
    while i < len(clean):
        line = clean[i]
        brand = find_brand(line)
        if not brand:
            i += 1
            continue
        year = parse_year(line)
        if not year:
            i += 1
            continue
        
        block_lines = [line]
        i += 1
        while i < len(clean):
            nl = clean[i]
            nb = find_brand(nl)
            ny = parse_year(nl)
            if nb and ny and nb != brand:
                break
            if parse_price(nl) and len(block_lines) >= 3:
                block_lines.append(nl)
                i += 1
                break
            block_lines.append(nl)
            i += 1
        
        price = None
        for bl in block_lines:
            p = parse_price(bl)
            if p:
                price = p
                break
        if not price:
            continue
        
        mileage = 0
        for bl in block_lines:
            m = parse_mileage(bl)
            if m:
                mileage = m
                break
        
        car_type = infer_type('\n'.join(block_lines))
        model = extract_model(block_lines[0], brand)
        segment = infer_segment(brand, model, price)
        
        lid = f"{brand.lower()}_{model.lower().replace(' ', '_')[:40]}_{year}"
        if lid in seen:
            continue
        seen.add(lid)
        
        listings.append({
            "id": lid, "brand": brand, "model": model[:80],
            "segment": segment, "car_type": car_type,
            "price": price, "year": year, "mileage_km": mileage,
        })
    
    return listings


def _fix_mojibake(text: str) -> str:
    """Decode HTML entities and repair UTF-8 bytes that were misread as Latin-1.

    oto.com.vn serves listing HTML where some Vietnamese glyphs are HTML
    entities (e.g. ``&#225;``) and the rest are raw UTF-8 bytes.  When
    ``requests.text`` decodes the body it can misread the UTF-8 bytes as
    cp1252; callers should pass ``response.content.decode('utf-8')`` and we
    only html-unescape here.  The Latin-1 repair handles callers that did
    not pre-decode correctly, so the parser is robust either way.
    """
    s = html.unescape(text)
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def parse_oto_price(text: str) -> Optional[float]:
    """Parse oto.com.vn prices which may span the billion ('tỷ'/'tỉ') and
    million ('triệu') parts, e.g. '4 tỷ 999 triệu', '865 triệu', '7 tỉ 198 triệu'.
    Falls back to parse_price for single-unit forms."""
    # oto.com.vn spells the billion unit as "tỉ" (U+1ED9) as often as "tỷ"
    # (U+1EF7); match both, otherwise >=1-tỉ listings lose the billion portion.
    # Strip inner HTML tags first so <strong>2</strong> tỉ <strong>979</strong>
    # triệu collapses to "2tỉ979triệu" before the regex runs.
    low = re.sub(r"<[^>]+>", " ", _fix_mojibake(text)).lower().replace(" ", "").replace(",", "")
    total = 0.0
    m = re.search(r"([\d.]+)t(?:ỷ|ỉ)", low)
    if m:
        total += float(m.group(1)) * 1_000_000_000
    m = re.search(r"([\d.]+)triệu", low)
    if m:
        total += float(m.group(1)) * 1_000_000
    if total > 0:
        return total
    return parse_price(_fix_mojibake(text))
def parse_oto_text(page_text: str) -> list[dict]:
    """Parse oto.com.vn search-result HTML into listing dicts.

    Each listing card is a ``<div class="item-car ...">`` containing:
      - ``<span class="car-name">{year} - {Brand} {Model} - {desc}</span>``
      - ``<ul class="tag-list">`` with <li>: mileage, fuel, trans, condition
      - ``<p class="price">{price} triệu/tỷ</p>``

    Only *used* cars (``Xe cũ``) are kept; new-car listings would bias
    year-1 retention toward ~1.0.  ``page_text`` may be the raw HTML from
    ``response.content.decode('utf-8')`` (preferred) or ``response.text``.
    """
    listings = []
    seen = set()

    # Split into individual item-car blocks.  We split on the opening div of
    # each card; ``dev-item-car`` inside a card must not match, so we require
    # the ``class="item-car`` boundary (with the quote) that only opens cards.
    blocks = page_text.split('class="item-car')
    # blocks[0] is the page preamble (before the first card).
    for block in blocks[1:]:
        title_m = re.search(r'<span class="car-name">(.*?)</span>', block, re.S)
        if not title_m:
            continue
        title = _fix_mojibake(re.sub(r"<[^>]+>", "", title_m.group(1))).strip()
        # title format: "2024 - Toyota Land Cruiser V6 3.5L TURBO - <desc>"
        parts = [p.strip() for p in title.split(" - ")]
        year = parse_year(title)
        if not year:
            continue
        if len(parts) < 2:
            continue
        year_str, brand_model = parts[0], parts[1]

        brand = find_brand(brand_model)
        if not brand:
            continue

        # Condition: only keep used cars
        tag_html = re.search(r'<ul class="tag-list">(.*?)</ul>', block, re.S)
        condition = ""
        if tag_html:
            lis = re.findall(r"<li[^>]*>(.*?)</li>", tag_html.group(1), re.S)
            lis = [_fix_mojibake(re.sub(r"<[^>]+>", "", x)).strip() for x in lis]
            if lis:
                condition = lis[-1]  # last <li> is the condition tag
        if condition != "Xe cũ":
            continue  # skip new cars / unknown

        mileage = 0
        car_type = "ICE"
        for li in lis:
            ml = parse_mileage(li)
            if ml:
                mileage = ml
        if lis:
            # fuel is the <li> containing "Máy xăng" / "Máy dầu" / "Hybrid" / "Điện"
            fuel_li = next((li for li in lis if re.search(r"Máy xăng|Máy dầu|Hybrid|Điện|hybrid|diesel|petrol", li, re.I)), None)
            if fuel_li:
                car_type = infer_type(fuel_li)

        price_m = re.search(r'<p class="price">(.*?)</p>', block, re.S)
        if not price_m:
            continue
        price = parse_oto_price(price_m.group(1))
        if not price:
            continue

        model = extract_model(brand_model, brand)
        segment = infer_segment(brand, model, price)

        lid = f"oto_{brand.lower()}_{model.lower().replace(' ', '_')[:40]}_{year}_{mileage}"
        if lid in seen:
            continue
        seen.add(lid)

        listings.append({
            "id": lid, "brand": brand, "model": model[:80],
            "segment": segment, "car_type": car_type,
            "price": price, "year": year, "mileage_km": mileage,
        })

    return listings


def load_cars_json() -> dict:
    if not CARS_FILE.exists():
        return {}
    with open(CARS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def find_new_price(brand: str, model: str, cars_data: dict) -> Optional[float]:
    """Match a scraped (brand, model) to the cars.json catalogue to recover the
    original MSRP. Normalises spaces/hyphens/case so `Mercedes Benz GLC 200
    4Matic` matches `GLC 200 4MATIC`, and uses substring containment with a
    length-ratio score so the closest variant wins."""
    bl = _norm(brand)
    ml = _norm(model)
    if not bl or not ml:
        return None
    best_score = 0.0
    best_price = None
    for cid, car in cars_data.items():
        if _norm(car.get("brand", "")) != bl:
            continue
        cm = _norm(car.get("model", ""))
        if not cm:
            continue
        if ml == cm or ml in cm or cm in ml:
            shorter = min(len(ml), len(cm))
            longer = max(len(ml), len(cm))
            score = shorter / longer
            if score > best_score:
                best_score = score
                best_price = car["price"]
    return best_price


def parse_bonbanh_text(page_text: str) -> list[dict]:
    """Parse bonbanh.com/oto raw HTML listing pages.

    Each listing exposes a `<h3 itemprop="name">Brand Model - YYYY</h3>` title
    and a price element with an exact numeric `content="..."` attribute (VND),
    which we use directly instead of parsing `X Tỷ Y Triệu` text. Only USED
    cars (`<div class="cb1"> Xe cũ`) are kept — new-car listings would bias
    year-1 retention toward ~1.0 and are not resale observations.
    """
    listings = []
    seen = set()

    name_re = re.compile(r'<h3[^>]*itemprop="name"[^>]*>(.*?)</h3>', re.S)
    price_re = re.compile(r'itemprop="price"\s+content="(\d+)"')
    code_re = re.compile(r'Mã:\s*(\d+)')
    status_re = re.compile(r'<div class="cb1">\s*(Xe cũ|Xe mới)<br>')

    statuses = [(m.start(), m.group(1)) for m in status_re.finditer(page_text)]

    def _status_before(pos: int) -> str:
        st = "Xe cũ"
        for s_pos, s_val in statuses:
            if s_pos < pos:
                st = s_val
            else:
                break
        return st

    for m in name_re.finditer(page_text):
        title = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        ym = re.search(r"-\s*(\d{4})\s*$", title)
        if not ym:
            continue
        year = int(ym.group(1))
        if _status_before(m.start()) != "Xe cũ":
            continue  # skip new cars

        window = page_text[m.end(): m.end() + 1500]
        pm = price_re.search(window)
        if not pm:
            continue
        price = float(pm.group(1))

        cm = code_re.search(window)
        code = cm.group(1) if cm else f"{year}_{len(seen)}"
        if code in seen:
            continue
        seen.add(code)

        brand = find_brand(title)
        if not brand:
            continue
        mileage = parse_mileage(window) or 0
        car_type = infer_type(window)
        model = extract_model(title, brand)
        segment = infer_segment(brand, model, price)
        lid = f"bb_{code}"
        listings.append({
            "id": lid, "brand": brand, "model": model[:80],
            "segment": segment, "car_type": car_type,
            "price": price, "year": year, "mileage_km": mileage,
        })
    return listings


def merge_into_training(listings: list[dict], source: str = "scrape") -> int:
    """Merge scraped listings into training_data.json. `source` is flagged on
    expanded records so they can be audited/removed if validation fails."""
    cars_data = load_cars_json()
    with open(TRAINING_FILE, "r", encoding="utf-8") as f:
        training = json.load(f)

    current_year = 2026
    added = 0
    existing_ids = {r["id"] for r in training}
    
    for listing in listings:
        age = current_year - listing["year"]
        if age <= 0:
            continue
        
        new_price = find_new_price(listing["brand"], listing["model"], cars_data)
        if new_price is None:
            est_factor = max(0.5, 1.0 - 0.1 * age)
            new_price = listing["price"] / est_factor
        
        if new_price <= 0:
            continue
        
        resale_pct = round(listing["price"] / new_price, 4)
        if resale_pct <= 0.05 or resale_pct > 1.0:
            continue
        
        mileage = listing.get("mileage_km", 0)
        if mileage and age > 0:
            annual_km = min(100000, max(5000, mileage // age))
        else:
            annual_km = 15000
        
        unique_id = f"{listing['id']}_{age}yr_{annual_km}km"
        if unique_id in existing_ids:
            continue
        
        training.append({
            "id": unique_id,
            "brand": listing["brand"],
            "model": listing["model"],
            "segment": listing["segment"],
            "car_type": listing["car_type"],
            "price": int(new_price),
            "years": age,
            "annual_km": annual_km,
            "resale_value": int(listing["price"]),
            "resale_pct": resale_pct,
            "source": source,
        })
        existing_ids.add(unique_id)
        added += 1
    
    with open(TRAINING_FILE, "w", encoding="utf-8") as f:
        json.dump(training, f, indent=2, ensure_ascii=False)
    
    return added


if __name__ == "__main__":
    print("=== ViDrive Multi-Source Scraper ===")
    print()
    print("This script provides parsing functions for multiple sources.")
    print()
    print("To scrape, navigate to each source and")
    print("extract document.body.innerText, then pipe it to the parser.")
    print()
    print("Sources:")
    print("  1. chotot.vn: https://xe.chotot.com/mua-ban-oto?page=N")
    print("  2. oto.com.vn: https://oto.com.vn/mua-ban-xe")
    print("  3. bonbanh.com: https://bonbanh.com/oto/page/N")
    print()
    print("After extracting text from each page, run:")
    print("  python -c \"from multi_source_scraper import *; ...\"")