"""
Foottraffic.py — 주변 상권 POI 수집 모듈 (외부 서버용)

도로명주소 또는 좌표(lat, lng)를 받아서:
  1. Nominatim (OSM) 으로 주소 → 좌표 변환
  2. Overpass API (OSM) 로 반경 내 POI 수집 (학교·아파트·음식점·카페)

LLM 요약은 하지 않는다. 외부 서버는 데이터 수집만 담당하고,
요약은 Vercel 의 /api/llm 이 처리한다.

CLI:
  python3 Foottraffic.py "경기도 화성시 동탄대로 354"
  python3 Foottraffic.py --lat 37.2001 --lng 127.0735 --radius 800
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_RADIUS = 500  # 기본 반경(m)

_UA       = "hwaseong-ai-hackathon/1.0"
_PHOTON   = "https://photon.komoot.io/api/"
_OVERPASS = "https://overpass-api.de/api/interpreter"


# ── 지오코딩 ────────────────────────────────────────────────────

def geocode(address: str) -> tuple[float, float] | None:
    """주소 → (위도, 경도). 실패 시 None."""
    params = urllib.parse.urlencode({"q": address, "limit": 1})
    try:
        req = urllib.request.Request(
            f"{_PHOTON}?{params}",
            headers={"User-Agent": _UA},
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read())
        features = data.get("features", [])
        if features:
            coords = features[0]["geometry"]["coordinates"]  # [lng, lat]
            return float(coords[1]), float(coords[0])
    except Exception as e:
        print(f"[geocode] 주소 변환 실패: {e}")
    return None


# ── Overpass POI 수집 ───────────────────────────────────────────

def _overpass(query: str) -> list[dict]:
    """Overpass QL 실행 → elements 리스트."""
    body = f"data={urllib.parse.quote(query)}"
    req  = urllib.request.Request(
        _OVERPASS,
        data=body.encode(),
        headers={
            "User-Agent":   _UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            return json.loads(res.read()).get("elements", [])
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Overpass API 오류 {e.code}: {e.read().decode()[:200]}")


def _name(el: dict) -> str:
    return el.get("tags", {}).get("name", "")


def search_pois(lat: float, lng: float, radius: int = DEFAULT_RADIUS) -> dict[str, Any]:
    """
    Overpass API 로 반경 내 POI 를 수집한다.

    OSM 태그 기준:
      학교       amenity = school | university | college
      음식점     amenity = restaurant | fast_food
      카페       amenity = cafe
      아파트     building = apartments | apartment  +  name 에 "아파트" 포함
    """
    around = f"around:{radius},{lat},{lng}"

    query = f"""
[out:json][timeout:25];
(
  node["amenity"~"^(school|university|college)$"]({around});
  way ["amenity"~"^(school|university|college)$"]({around});
  node["amenity"~"^(restaurant|fast_food)$"]({around});
  way ["amenity"~"^(restaurant|fast_food)$"]({around});
  node["amenity"="cafe"]({around});
  way ["amenity"="cafe"]({around});
  way ["name"~"아파트"]({around});
  relation["name"~"아파트"]({around});
);
out tags center;
""".strip()

    elements = _overpass(query)

    schools, restaurants, cafes, apartments = [], [], [], []

    for el in elements:
        tags     = el.get("tags", {})
        amenity  = tags.get("amenity", "")
        name     = tags.get("name", "")

        if amenity in ("school", "university", "college"):
            if name:
                schools.append(name)
        elif amenity in ("restaurant", "fast_food"):
            if name:
                restaurants.append(name)
        elif amenity == "cafe":
            if name:
                cafes.append(name)
        elif "아파트" in name:
            apartments.append(name)

    # 중복 제거 (같은 장소가 node/way 둘 다 나올 수 있음)
    def dedup(lst: list[str]) -> list[str]:
        seen: set[str] = set()
        result = []
        for v in lst:
            if v not in seen:
                seen.add(v)
                result.append(v)
        return result

    schools     = dedup(schools)
    restaurants = dedup(restaurants)
    cafes       = dedup(cafes)
    apartments  = dedup(apartments)

    return {
        "schools":     schools,
        "apartments":  apartments,
        "restaurants": {"count": len(restaurants), "samples": restaurants[:5]},
        "cafes":       {"count": len(cafes),       "samples": cafes[:5]},
    }


# ── 메인 함수 ────────────────────────────────────────────────────

def analyze(
    address: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius: int = DEFAULT_RADIUS,
) -> dict[str, Any]:
    """POI 를 수집해서 반환한다. LLM 요약은 Vercel /api/foottraffic 이 담당한다."""
    resolved_address = address or ""

    if lat is None or lng is None:
        if not address:
            raise ValueError("address 또는 (lat, lng) 중 하나가 필요합니다")
        coords = geocode(address)
        if coords is None:
            return {"error": f"주소를 찾을 수 없어요: {address}"}
        lat, lng = coords

    if not resolved_address:
        resolved_address = f"위도 {lat:.5f}, 경도 {lng:.5f}"

    pois = search_pois(lat, lng, radius)

    return {
        "coords":   {"lat": lat, "lng": lng},
        "address":  resolved_address,
        "radius_m": radius,
        "pois":     pois,
    }


# ── CLI ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="주변 POI 수집 (OpenStreetMap) — LLM 요약 없음")
    parser.add_argument("address", nargs="?", help="도로명 주소")
    parser.add_argument("--lat",    type=float, help="위도")
    parser.add_argument("--lng",    type=float, help="경도")
    parser.add_argument("--radius", type=int, default=DEFAULT_RADIUS, help="반경(m), 기본 500")
    args = parser.parse_args()

    if not args.address and (args.lat is None or args.lng is None):
        parser.error("주소 또는 --lat/--lng 를 입력하세요")

    result = analyze(
        address=args.address,
        lat=args.lat,
        lng=args.lng,
        radius=args.radius,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
