"""
K-apt 단지_면적정보 xlsx/CSV -> apartments_hwaseong.json

Usage:
    python preprocess_apartments.py 20260821_단지_면적정보.xlsx
    python preprocess_apartments.py 20260821_단지_면적정보.csv

Output: apartments_hwaseong.json (same folder)
"""

import csv
import io
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

_UA = "hwaseong-ai-hackathon/1.0"
_HERE = Path(__file__).resolve().parent
OUT = _HERE / "apartments_hwaseong.json"
CACHE = _HERE / "_apt_geocache.json"


def _geocode(query):
    """Photon (komoot) 으로 지오코딩. 429 시 10초 대기 후 1회 재시도."""
    params = urllib.parse.urlencode({"q": query, "limit": 1, "lang": "ko"})
    url = f"https://photon.komoot.io/api/?{params}"
    for attempt in range(2):
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                data = json.loads(res.read())
            features = data.get("features", [])
            if features:
                coords = features[0]["geometry"]["coordinates"]  # [lng, lat]
                return float(coords[1]), float(coords[0])
            return None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"  429 rate limit — waiting 10s ...")
                time.sleep(10)
            else:
                print(f"  geocode error: {e}")
                return None
        except Exception as e:
            print(f"  geocode error: {e}")
            return None
    return None


def _read_rows(path):
    """xlsx or CSV -> list of dicts (header auto-detected)."""
    suffix = path.suffix.lower()

    if suffix == ".csv":
        raw = None
        for enc in ("utf-8-sig", "cp949", "utf-8"):
            try:
                raw = path.read_text(encoding=enc)
                break
            except UnicodeDecodeError:
                continue
        if raw is None:
            print("ERROR: cannot decode CSV")
            return []

        try:
            dialect = csv.Sniffer().sniff(raw[:4096], delimiters=",\t")
        except csv.Error:
            dialect = csv.excel

        reader = csv.reader(io.StringIO(raw), dialect)
        headers = None
        rows = []
        for row in reader:
            cells = [c.strip() for c in row]
            non_empty = sum(1 for c in cells if c)
            if headers is None:
                # header row: many non-empty cells (disclaimer has just 1)
                if non_empty >= 6:
                    headers = cells
                    print(f"columns: {headers}")
                continue
            if non_empty < 3:
                continue
            rows.append(dict(zip(headers, cells)))
        return rows

    else:  # xlsx
        try:
            import openpyxl
        except ImportError:
            print("openpyxl not installed: pip install openpyxl")
            raise SystemExit(1)

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        print(f"xlsx dimensions: {ws.dimensions}")

        all_rows = []
        for row in ws.iter_rows(values_only=True):
            all_rows.append([str(c).strip() if c is not None else "" for c in row])
        wb.close()

        print(f"total rows: {len(all_rows)}")
        for i, r in enumerate(all_rows[:5]):
            non_empty = [c for c in r if c]
            print(f"  row {i+1} ({len(non_empty)} cells): {non_empty[:4]}")

        headers = None
        rows = []
        for cells in all_rows:
            non_empty = sum(1 for c in cells if c)
            if headers is None:
                if non_empty >= 6:
                    headers = cells
                    print(f"columns: {headers}")
                continue
            if non_empty < 3:
                continue
            rows.append(dict(zip(headers, cells)))
        return rows


def main():
    if len(sys.argv) < 2:
        print("Usage: python preprocess_apartments.py <file.xlsx or file.csv>")
        raise SystemExit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        raise SystemExit(1)

    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
        print(f"Geocode cache: {len(cache)} entries")

    print(f"Loading {path.name} ...")
    all_rows = _read_rows(path)
    print(f"Total rows read: {len(all_rows)}")

    # group by complex code, sum units
    complexes = defaultdict(lambda: {"name": "", "eup": "", "dong": "", "units": 0})
    hwaseong_count = 0

    for d in all_rows:
        sigungu = str(d.get("시군구", "") or d.get("sigungu", "") or "")
        # fallback: try key containing '시군구'
        if not sigungu:
            for k, v in d.items():
                if "시군구" in k:
                    sigungu = str(v or "")
                    break

        if "화성" not in sigungu:  # 화성
            continue

        hwaseong_count += 1
        code = str(d.get("단지코드", "") or "").strip()  # 단지코드
        name = str(d.get("단지명", "") or "").strip()        # 단지명
        if not code or not name:
            continue

        try:
            units = int(str(d.get("세대수", 0) or 0).replace(",", ""))  # 세대수
        except (ValueError, TypeError):
            units = 0

        complexes[code]["name"] = name
        complexes[code]["eup"]  = str(d.get("읍면", "") or "").strip()   # 읍면
        complexes[code]["dong"] = str(d.get("동리", "") or "").strip()   # 동리
        complexes[code]["units"] += units

    print(f"Hwaseong rows: {hwaseong_count}")
    print(f"Hwaseong complexes: {len(complexes)}")

    if len(complexes) == 0:
        print("\nDEBUG - first 3 rows:")
        for d in all_rows[:3]:
            print(" ", dict(list(d.items())[:6]))
        print("Check column names above.")
        raise SystemExit(1)

    need = [(c, i) for c, i in complexes.items() if c not in cache]
    print(f"Geocoding needed: {len(need)} (1/sec, ~{len(need)}s)")

    result = []
    for code, info in complexes.items():
        if code in cache and cache[code] is not None:
            coords = cache[code]
            result.append({"name": info["name"], "units": info["units"],
                           "dong": info["dong"], "eup": info["eup"],
                           "lat": coords[0], "lng": coords[1]})
            continue

        parts = ["경기도", "화성시"]  # 경기도, 화성시
        if info["eup"]:
            parts.append(info["eup"])
        if info["dong"]:
            parts.append(info["dong"])
        parts.append(info["name"])
        query = " ".join(parts)

        print(f"  {info['name']}")
        coords = _geocode(query)
        time.sleep(1.1)

        if coords is None:
            coords = _geocode(f"경기도 화성시 {info['name']}")  # 경기도 화성시
            time.sleep(1.1)

        cache[code] = list(coords) if coords else None
        CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

        if coords:
            result.append({"name": info["name"], "units": info["units"],
                           "dong": info["dong"], "eup": info["eup"],
                           "lat": coords[0], "lng": coords[1]})
        else:
            print(f"    -> failed")

    print(f"\nResult: {len(result)}/{len(complexes)} with coordinates")
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {OUT}")
    print("Restart the server to apply.")


if __name__ == "__main__":
    main()
