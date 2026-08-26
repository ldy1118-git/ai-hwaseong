"""외부 서버 — OCR + 상권분석 통합 HTTP 서버.

Caddy 가 앞에서 HTTPS 를 처리하고, 이 서버는 localhost 에서만 뜬다.

    브라우저 ──HTTPS──▶ pjrx.kr (Caddy) ──HTTP──▶ 여기 (8001)
                               ↑
             Vercel /api/ocr, /api/foottraffic, /api/commercial 이 중계

엔드포인트:
    GET  /health       헬스체크
    POST /ocr          사업자등록증 OCR
    POST /foottraffic  주변 POI 수집 (Overpass API, LLM 없음 — 요약은 Vercel 이)
    POST /commercial   상가·학교·역·아파트 위치 기반 필터링 (CSV/JSON 에서 로드)

인증: X-Mars-Secret 헤더 (모든 POST 공통).

환경변수:
    OCR_SHARED_SECRET        필수
    OCR_PORT                 기본 8001
    COMMERCIAL_DATA_DIR      데이터 파일 폴더. 기본값: 이 파일 옆 폴더

파일 위치 (COMMERCIAL_DATA_DIR 기준):
    소상공인시장진흥공단_상가(상권)정보_경기_202606.csv   상가 (UTF-8 BOM)
    학교기본정보(초)_경기도교육청.csv                    초등학교 (UTF-8 BOM)
    학교기본정보(중)_경기도교육청.csv                    중학교 (UTF-8 BOM)
    학교기본정보(고)_경기도교육청.csv                    고등학교 (UTF-8 BOM)
    국가철도공단_코레일_지하철_주소데이터_20250630.csv    역 주소 (CP949)
    한국철도공사_역별 승하차 현황_20241231.csv            역 승하차 (CP949)
    apartments_hwaseong.json                            아파트 단지 (preprocess_apartments.py 로 생성)
"""

from __future__ import annotations

import base64
import csv
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))                       # 서버에서: 같은 폴더
sys.path.insert(1, str(_here.parent / "backend"))    # 저장소에서: backend/

import Foottraffic  # noqa: E402
import OCR          # noqa: E402

HOST = "127.0.0.1"
PORT = int(os.environ.get("OCR_PORT", "8001"))

MAX_IMAGE_BYTES = 6 * 1024 * 1024
SECRET = os.environ.get("OCR_SHARED_SECRET", "")

# ── 상권 데이터 (시작 시 1회 CSV 에서 로드) ─────────────────────────

_STORES:      list[dict] = []          # {"lat": float, "lng": float, "cat": "r"|"c"|"a"}
_SCHOOLS:     list[dict] = []          # {"name": str, "level": str, "lat": float, "lng": float}
_STATIONS:    list[dict] = []          # {"name": str, "line": str, "lat": float, "lng": float, "passengers": int}
_APT_BY_DONG: dict[str, dict] = {}    # 동리 → {"eup": str, "complexes": int, "total_units": int}
_DONG_CACHE:  dict[tuple, str | None] = {}  # (lat4, lng4) → 동리 이름
_CARD_SALES:  dict[str, dict] = {}    # 행정동코드 → {"area_name": str, "total_sales": float, "peak_tz": str, "peak_pct": float, "time_dist": dict}

# 화성시 행정동코드 ↔ 이름 (2020년 기준, 카드매출 CSV 와 맞춤)
_HWASEONG_DONG_CODES: dict[str, str] = {
    "병점1동": "4159025300",
    "병점2동": "4159025600",
    "진안동":  "4159025900",
    "반월동":  "4159026200",
    "기배동":  "4159031000",
    "화산동":  "4159032000",
    "동탄1동": "4159033000",
    "동탄2동": "4159034000",
    "동탄3동": "4159035000",
    "동탄4동": "4159036000",
}
# 역방향: 코드 → 이름
_HWASEONG_CODE_DONGS: dict[str, str] = {v: k for k, v in _HWASEONG_DONG_CODES.items()}

_TZ_LABELS: dict[str, str] = {
    "TZ01": "자정~새벽 2시",
    "TZ02": "새벽 2~4시",
    "TZ03": "오전",
    "TZ04": "오전 중반",
    "TZ05": "점심 전후",
    "TZ06": "오후",
    "TZ07": "저녁",
    "TZ08": "밤",
    "TZ09": "늦은 밤",
    "TZ10": "심야",
}

_UA = "hwaseong-ai-hackathon/1.0"


def _data_dir() -> Path:
    return Path(os.environ.get("COMMERCIAL_DATA_DIR", Path(__file__).parent))


# ── CSV 로더 ─────────────────────────────────────────────────────────

def _load_stores() -> list[dict]:
    """소상공인시장진흥공단 상가 CSV → 화성시 음식·카페·학원만."""
    path = _data_dir() / "소상공인시장진흥공단_상가(상권)정보_경기_202606.csv"
    result = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if "화성" not in row.get("시군구명", ""):
                continue
            try:
                lat = float(row["위도"])
                lng = float(row["경도"])
            except (ValueError, KeyError):
                continue
            if not (lat and lng):
                continue

            대 = row.get("상권업종대분류명", "")
            중 = row.get("상권업종중분류명", "").strip()

            if 대 == "음식":
                cat = "c" if 중 == "비알코올" else "r"
            elif 대 == "교육" and 중 in ("기타 교육", "일반 교육"):
                cat = "a"
            else:
                continue

            result.append({"lat": lat, "lng": lng, "cat": cat})
    return result


def _load_schools() -> list[dict]:
    """경기도교육청 학교 CSV 3종 → 화성시 학교."""
    level_map = {"02": "초등", "03": "중학", "04": "고등"}
    files = [
        ("학교기본정보(초)_경기도교육청.csv", "초등"),
        ("학교기본정보(중)_경기도교육청.csv", "중학"),
        ("학교기본정보(고)_경기도교육청.csv", "고등"),
    ]
    result = []
    data_dir = _data_dir()
    for filename, _ in files:
        path = data_dir / filename
        with open(path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                region = row.get("지역", "")
                if "화성시" not in region:
                    continue
                if row.get("폐교여부", "N") == "Y":
                    continue
                try:
                    lat = float(row["위도"])
                    lng = float(row["경도"])
                except (ValueError, KeyError):
                    continue
                level = level_map.get(row.get("학교급코드", ""), "기타")
                result.append({"name": row["학교명"], "level": level, "lat": lat, "lng": lng})
    return result


def _load_stations() -> list[dict]:
    """코레일 역 주소 + 승하차 CSV → 화성시 인근 역 (Nominatim 지오코딩)."""
    data_dir = _data_dir()
    addr_path  = data_dir / "국가철도공단_코레일_지하철_주소데이터_20250630.csv"
    psgr_path  = data_dir / "한국철도공사_역별 승하차 현황_20241231.csv"

    # 승하차 합계 (역명 → 일평균 승객)
    # CSV 는 연간 합계라 365 로 나눈다
    passengers: dict[str, int] = {}
    with open(psgr_path, encoding="cp949", newline="") as f:
        for row in csv.DictReader(f):
            try:
                total = int(row["승차인원"]) + int(row["하차인원"])
                passengers[row["역명"]] = round(total / 365)
            except (ValueError, KeyError):
                continue

    # 화성시 인근 역 (화성시 주소 + 바로 인접 오산시 역)
    TARGET = {"병점", "서동탄", "세마", "어천", "야목"}
    stations_raw: list[dict] = []
    with open(addr_path, encoding="cp949", newline="") as f:
        for row in csv.DictReader(f):
            name = row["역명"]
            addr = row.get("도로명주소", "") or row.get("지번주소", "")
            in_hwaseong = "화성" in addr
            in_target   = name in TARGET
            if not (in_hwaseong or in_target):
                continue
            stations_raw.append({"name": name, "line": row["선명"], "address": addr})

    # Nominatim 지오코딩
    result = []
    for s in stations_raw:
        coords = _geocode(f"{s['name']}역 {s['address']}")
        if coords is None:
            coords = _geocode(f"{s['name']}역")
        if coords is None:
            print(f"[stations] 좌표 못 찾음: {s['name']}", file=sys.stderr)
            continue
        lat, lng = coords
        result.append({
            "name":       s["name"],
            "line":       s["line"],
            "lat":        lat,
            "lng":        lng,
            "passengers": passengers.get(s["name"], 0),
        })
        print(f"[stations] {s['name']} ({s['line']}) → {lat:.4f}, {lng:.4f}", file=sys.stderr)

    return result


def _geocode(query: str) -> tuple[float, float] | None:
    """Photon (OSM) 으로 주소 → (위도, 경도). 실패 시 None."""
    params = urllib.parse.urlencode({"q": query, "limit": 1})
    req = urllib.request.Request(
        f"https://photon.komoot.io/api/?{params}",
        headers={"User-Agent": _UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read())
        features = data.get("features", [])
        if features:
            coords = features[0]["geometry"]["coordinates"]  # [lng, lat]
            return float(coords[1]), float(coords[0])
    except Exception as e:
        print(f"[geocode] 실패: {query} — {e}", file=sys.stderr)
    return None


def _load_apt_by_dong() -> dict[str, dict]:
    """K-apt 단지_면적정보 CSV → 화성시 동리별 아파트 집계.
    좌표·지오코딩 없이 CSV 에서 직접 읽는다."""
    data_dir = _data_dir()
    candidates = sorted(data_dir.glob("*단지*면적*.csv"), reverse=True)
    if not candidates:
        print("경고: K-apt 단지_면적정보 CSV 없음 — 아파트 동별 정보 비활성화.", file=sys.stderr)
        return {}

    path = candidates[0]
    print(f"[apartments] {path.name} 로딩...", file=sys.stderr, flush=True)

    raw = None
    for enc in ("utf-8-sig", "cp949", "utf-8"):
        try:
            raw = path.read_text(encoding=enc)
            break
        except UnicodeDecodeError:
            continue
    if raw is None:
        print("[apartments] CSV 인코딩 감지 실패", file=sys.stderr)
        return {}

    # 면책 행(첫 줄) 건너뛰고 헤더 자동 감지
    reader = csv.reader(io.StringIO(raw))
    headers = None
    rows_raw = []
    for row in reader:
        cells = [c.strip() for c in row]
        if headers is None:
            if sum(1 for c in cells if c) >= 6:
                headers = cells
            continue
        rows_raw.append(cells)

    if not headers:
        print("[apartments] 헤더 행을 찾지 못했습니다", file=sys.stderr)
        return {}

    # 단지코드별 집계 (같은 단지가 면적 세부별로 여러 행)
    by_code: dict[str, dict] = {}
    for cells in rows_raw:
        d = dict(zip(headers, cells))
        if "화성" not in str(d.get("시군구", "")):
            continue
        code = str(d.get("단지코드", "")).strip()
        if not code:
            continue
        try:
            units = int(str(d.get("세대수", 0) or 0).replace(",", ""))
        except (ValueError, TypeError):
            units = 0
        if code not in by_code:
            by_code[code] = {
                "dong": str(d.get("동리", "")).strip(),
                "eup":  str(d.get("읍면", "")).strip(),
                "units": 0,
            }
        by_code[code]["units"] += units

    # 동리별 집계
    by_dong: dict[str, dict] = {}
    for info in by_code.values():
        dong = info["dong"]
        if not dong:
            continue
        if dong not in by_dong:
            by_dong[dong] = {"eup": info["eup"], "complexes": 0, "total_units": 0}
        by_dong[dong]["complexes"] += 1
        by_dong[dong]["total_units"] += info["units"]

    print(f"[apartments] {len(by_dong)}개 동, {len(by_code)}개 단지 로드", file=sys.stderr, flush=True)
    return by_dong


def _load_card_sales() -> dict[str, dict]:
    """분석시스템_카드매출_시간대별.csv → 화성시 행정동별 카드매출 요약."""
    path = _data_dir() / "분석시스템_카드매출_시간대별.csv"
    if not path.exists():
        print("경고: 카드매출 CSV 없음 — 매출 분석 비활성화.", file=sys.stderr)
        return {}

    raw: dict[str, dict] = {}  # 코드 → {time_dist, total_sales}
    try:
        with open(path, encoding="cp949", newline="") as f:
            for row in csv.DictReader(f):
                code = row.get("행정동코드", "").strip()
                if not code.startswith("4159"):
                    continue
                tz  = row.get("시간대코드", "").strip()
                cat = row.get("중분류업종코드", "").strip()
                if cat != "TO":
                    continue
                try:
                    sales = float(row.get("매출금액", 0) or 0)
                    pct   = float(row.get("매출금액비율", 0) or 0)
                except (ValueError, TypeError):
                    continue
                if code not in raw:
                    raw[code] = {"total_sales": 0.0, "time_dist": {}}
                if tz == "TOT":
                    raw[code]["total_sales"] = sales
                else:
                    raw[code]["time_dist"][tz] = pct
    except Exception as e:
        print(f"[card_sales] 로드 실패: {e}", file=sys.stderr)
        return {}

    result = {}
    for code, info in raw.items():
        td   = info["time_dist"]
        peak = max(td, key=td.get) if td else "TZ06"
        result[code] = {
            "area_name":   _HWASEONG_CODE_DONGS.get(code, code),
            "total_sales": info["total_sales"],
            "peak_tz":     peak,
            "peak_pct":    td.get(peak, 0.0),
            "time_dist":   td,
        }

    print(f"[card_sales] {len(result)}개 행정동 로드", file=sys.stderr, flush=True)
    return result


def _find_card_sales(dong_name: str | None) -> dict | None:
    """역지오코딩 동명 → 카드매출 데이터. 없으면 화성시 평균."""
    if not _CARD_SALES or not dong_name:
        return None

    # 1차: 직접 매핑 (병점2동 → 코드)
    code = _HWASEONG_DONG_CODES.get(dong_name)
    if code and code in _CARD_SALES:
        return _CARD_SALES[code]

    # 2차: 숫자 제거 후 매핑 (병점동 → 병점1동 or 병점2동)
    legal = _strip_dong_number(dong_name)
    if legal != dong_name:
        for name, c in _HWASEONG_DONG_CODES.items():
            if legal in name and c in _CARD_SALES:
                return _CARD_SALES[c]

    # 3차: 부분 일치 (동탄 → 동탄1동)
    for name, c in _HWASEONG_DONG_CODES.items():
        keyword = dong_name.rstrip("동읍면리").rstrip("1234567890")
        if keyword and keyword in name and c in _CARD_SALES:
            return _CARD_SALES[c]

    # 4차: 화성시 평균
    vals = list(_CARD_SALES.values())
    if not vals:
        return None
    avg_sales = sum(v["total_sales"] for v in vals) / len(vals)
    return {
        "area_name":   "화성시 평균",
        "total_sales": avg_sales,
        "peak_tz":     "TZ06",
        "peak_pct":    0.0,
        "time_dist":   {},
    }


def _reverse_geocode_dong(lat: float, lng: float) -> str | None:
    """Nominatim 역지오코딩 → 동리 이름. 소수점 4자리(≈11m) 단위로 캐시."""
    key = (round(lat, 4), round(lng, 4))
    if key in _DONG_CACHE:
        return _DONG_CACHE[key]
    params = urllib.parse.urlencode({"lat": lat, "lon": lng, "format": "json", "zoom": 14})
    req = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/reverse?{params}",
        headers={"User-Agent": _UA},
    )
    dong = None
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read())
        addr = data.get("address", {})
        dong = addr.get("suburb") or addr.get("village") or addr.get("quarter") or None
        if dong:
            dong = dong.strip()
    except Exception as e:
        print(f"[reverse_geocode] {lat},{lng} — {e}", file=sys.stderr)
    _DONG_CACHE[key] = dong
    return dong


def _strip_dong_number(name: str) -> str:
    """행정동 → 법정동 근사 변환. 끝의 숫자를 제거.
    병점2동 → 병점동, 동탄1동 → 동탄동, 남양1리 → 남양리"""
    import re
    return re.sub(r"(\d+)(동|읍|면|리)$", r"\2", name)


def _apt_dong_summary(lat: float, lng: float) -> dict | None:
    """핀 위치를 역지오코딩해 해당 동의 아파트 단지 수·세대수를 반환.
    행정동(병점2동)과 법정동(병점동) 불일치 시 숫자 제거 후 재시도."""
    if not _APT_BY_DONG:
        return None
    dong_name = _reverse_geocode_dong(lat, lng)
    if dong_name is None:
        return None

    # 1차: 정확히 일치
    info = _APT_BY_DONG.get(dong_name)
    if info:
        return {"dong": dong_name, "eup": info["eup"],
                "complexes": info["complexes"], "total_units": info["total_units"]}

    # 2차: 행정동 숫자 제거 → 법정동 근사 (병점2동 → 병점동)
    legal = _strip_dong_number(dong_name)
    if legal != dong_name:
        info = _APT_BY_DONG.get(legal)
        if info:
            return {"dong": legal, "eup": info["eup"],
                    "complexes": info["complexes"], "total_units": info["total_units"]}

    return {"dong": dong_name, "eup": "", "complexes": 0, "total_units": 0}


def _load_commercial_data() -> None:
    global _STORES, _SCHOOLS, _STATIONS, _APT_BY_DONG
    data_dir = _data_dir()

    store_csv = data_dir / "소상공인시장진흥공단_상가(상권)정보_경기_202606.csv"
    school_csv = data_dir / "학교기본정보(초)_경기도교육청.csv"
    station_csv = data_dir / "국가철도공단_코레일_지하철_주소데이터_20250630.csv"

    missing = [p for p in [store_csv, school_csv, station_csv] if not p.exists()]
    if missing:
        for p in missing:
            print(f"경고: CSV 없음 — {p.name}. /commercial 은 503.", file=sys.stderr)
        return

    print("상권 CSV 로딩 중... (상가 352MB, 잠시 기다려주세요)", file=sys.stderr, flush=True)
    _STORES = _load_stores()
    print(f"  상가: {len(_STORES)}개 로드", file=sys.stderr, flush=True)

    _SCHOOLS = _load_schools()
    print(f"  학교: {len(_SCHOOLS)}개 로드", file=sys.stderr, flush=True)

    print("  역 지오코딩 중...", file=sys.stderr, flush=True)
    _STATIONS = _load_stations()
    print(f"  역: {len(_STATIONS)}개 로드", file=sys.stderr, flush=True)

    _APT_BY_DONG = _load_apt_by_dong()

    global _CARD_SALES
    _CARD_SALES = _load_card_sales()


# ── 거리 계산 ─────────────────────────────────────────────────────────

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ── 공통 헬퍼 ────────────────────────────────────────────────────────

def _send(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler: BaseHTTPRequestHandler, max_bytes: int = 1024 * 1024) -> dict | None:
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        _send(handler, {"error": "본문 길이를 읽을 수 없습니다"}, 400)
        return None
    if length <= 0:
        _send(handler, {"error": "본문이 비었습니다"}, 400)
        return None
    if length > max_bytes:
        _send(handler, {"error": "요청이 너무 큽니다"}, 413)
        return None
    try:
        return json.loads(handler.rfile.read(length).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        _send(handler, {"error": "JSON 이 아닙니다"}, 400)
        return None


def _decode_image(value: str) -> bytes:
    if value.startswith("data:"):
        _, _, value = value.partition(",")
    value += "=" * (-len(value) % 4)
    return base64.b64decode(value, validate=False)


# ── 핸들러 ───────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args) -> None:  # noqa: N802
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")

    def _check_secret(self) -> bool:
        if not SECRET:
            _send(self, {"error": "서버에 OCR_SHARED_SECRET 이 없습니다"}, 500)
            return False
        if self.headers.get("X-Mars-Secret") != SECRET:
            _send(self, {"error": "인증 실패"}, 401)
            return False
        return True

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") not in ("/health", ""):
            return _send(self, {"error": "없는 경로"}, 404)
        _send(self, {
            "ok": True,
            "ocr_ready":        OCR.warm_up(),
            "commercial_ready": bool(_STORES),
            "stores":           len(_STORES),
            "schools":          len(_SCHOOLS),
            "stations":         len(_STATIONS),
            "apt_dongs":        len(_APT_BY_DONG),
        })

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.rstrip("/")
        if path == "/ocr":
            self._handle_ocr()
        elif path == "/foottraffic":
            self._handle_foottraffic()
        elif path == "/commercial":
            self._handle_commercial()
        else:
            _send(self, {"error": "없는 경로"}, 404)

    # ── /ocr ─────────────────────────────────────────────────────────

    def _handle_ocr(self) -> None:
        if not self._check_secret():
            return

        payload = _read_json(self, max_bytes=MAX_IMAGE_BYTES * 2)
        if payload is None:
            return

        image = payload.get("image")
        if not isinstance(image, str) or not image:
            return _send(self, {"error": "image 가 없습니다"}, 400)

        try:
            data = _decode_image(image)
        except Exception:
            return _send(self, {"error": "이미지를 해석할 수 없습니다"}, 400)
        if len(data) > MAX_IMAGE_BYTES:
            return _send(self, {"error": "사진이 너무 큽니다"}, 413)

        try:
            result = OCR.extract_from_bytes(data)
        except RuntimeError as error:
            return _send(self, {"error": str(error)}, 503)
        except Exception as error:
            return _send(self, {"error": f"읽지 못했습니다: {error}"}, 422)
        finally:
            del data

        if not result.get("result"):
            return _send(self, {"error": "사업자등록증에서 글자를 찾지 못했습니다"}, 422)

        return _send(self, result)

    # ── /foottraffic ─────────────────────────────────────────────────

    def _handle_foottraffic(self) -> None:
        if not self._check_secret():
            return

        payload = _read_json(self, max_bytes=4096)
        if payload is None:
            return

        address = payload.get("address")
        lat = payload.get("lat")
        lng = payload.get("lng")
        radius = int(payload.get("radius") or Foottraffic.DEFAULT_RADIUS)

        if not address and (lat is None or lng is None):
            return _send(self, {"error": "address 또는 lat·lng 가 필요합니다"}, 400)

        try:
            lat_f = float(lat) if lat is not None else None
            lng_f = float(lng) if lng is not None else None
        except (TypeError, ValueError):
            return _send(self, {"error": "lat·lng 는 숫자여야 합니다"}, 400)

        try:
            result = Foottraffic.analyze(address=address, lat=lat_f, lng=lng_f, radius=radius)
        except Exception as error:
            return _send(self, {"error": f"상권 분석 실패: {error}"}, 500)

        return _send(self, result, 422 if "error" in result else 200)

    # ── /commercial ──────────────────────────────────────────────────

    def _handle_commercial(self) -> None:
        if not self._check_secret():
            return

        if not _STORES:
            return _send(self, {"error": "상권 데이터가 아직 로드되지 않았습니다"}, 503)

        payload = _read_json(self, max_bytes=4096)
        if payload is None:
            return

        try:
            lat = float(payload["lat"])
            lng = float(payload["lng"])
        except (KeyError, TypeError, ValueError):
            return _send(self, {"error": "lat·lng 가 필요합니다"}, 400)

        radii = payload.get("radii") or {}
        r = {
            "schools":     int(radii.get("schools")     or 500),
            "restaurants": int(radii.get("restaurants") or 500),
            "cafes":       int(radii.get("cafes")       or 500),
            "academies":   int(radii.get("academies")   or 500),
            "stations":    int(radii.get("stations")    or 500),
        }

        # 상가: bbox 로 먼저 좁힌 뒤 정밀 거리 계산
        max_r  = max(r["restaurants"], r["cafes"], r["academies"])
        lat_d  = max_r / 111_320 * 1.1
        lng_d  = lat_d / math.cos(math.radians(lat))

        restaurants, cafes, academies = [], [], []
        for s in _STORES:
            if abs(s["lat"] - lat) > lat_d or abs(s["lng"] - lng) > lng_d:
                continue
            dist = _haversine(lat, lng, s["lat"], s["lng"])
            cat  = s["cat"]
            if cat == "r" and dist <= r["restaurants"]:
                restaurants.append({"lat": s["lat"], "lng": s["lng"]})
            elif cat == "c" and dist <= r["cafes"]:
                cafes.append({"lat": s["lat"], "lng": s["lng"]})
            elif cat == "a" and dist <= r["academies"]:
                academies.append({"lat": s["lat"], "lng": s["lng"]})

        schools = [
            s for s in _SCHOOLS
            if _haversine(lat, lng, s["lat"], s["lng"]) <= r["schools"]
        ]
        stations = [
            s for s in _STATIONS
            if _haversine(lat, lng, s["lat"], s["lng"]) <= r["stations"]
        ]

        def sample(lst: list, n: int = 40) -> list:
            if len(lst) <= n:
                return lst
            step = math.ceil(len(lst) / n)
            return lst[::step][:n]

        # 아파트: 반경 개수가 아닌 핀 위치 동 단위 집계
        apt_dong = _apt_dong_summary(lat, lng)

        # 카드매출: 역지오코딩 동명으로 행정동 매출 데이터 조회
        dong_name = apt_dong.get("dong") if apt_dong else _reverse_geocode_dong(lat, lng)
        card_sales = _find_card_sales(dong_name)

        return _send(self, {
            "counts": {
                "schools":     len(schools),
                "restaurants": len(restaurants),
                "cafes":       len(cafes),
                "academies":   len(academies),
                "stations":    len(stations),
            },
            "markers": {
                "schools":     schools,
                "restaurants": sample(restaurants),
                "cafes":       sample(cafes),
                "academies":   sample(academies),
                "stations":    stations,
            },
            "apt_dong":   apt_dong,
            "card_sales": card_sales,
        })


# ── 진입점 ───────────────────────────────────────────────────────────

def main() -> None:
    if not SECRET:
        print("OCR_SHARED_SECRET 이 없습니다.", file=sys.stderr)
        raise SystemExit(1)

    _load_commercial_data()

    print("easyocr 모델 로딩 중...", file=sys.stderr, flush=True)
    if not OCR.warm_up():
        print("경고: easyocr 미설치 — /ocr 작동 안 함.", file=sys.stderr)
    else:
        print("OCR 준비됨.", file=sys.stderr, flush=True)

    print(f"서버 시작 — http://{HOST}:{PORT}", file=sys.stderr, flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
