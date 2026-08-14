#!/usr/bin/env python3
"""공고 첨부파일을 받아 텍스트로 바꾼다.

기업마당 API 의 사업개요는 200~400자짜리 요약이라 자격요건이 거의 없다.
진짜 요건("창업 7년 이내", "휴업·폐업 중인 경우 제외")은 첨부 공고문에 있다.

    python3 policy_data/fetch_docs.py            첨부 받아서 텍스트로
    python3 policy_data/fetch_docs.py --report   무엇이 되고 무엇이 안 됐는지

결과는 policy_data/raw/docs/<공고ID>.txt 에 쌓인다. 이미 있으면 건너뛴다.

형식별 처리
    PDF    pdftotext -layout (텍스트층이 없는 스캔본은 실패한다)
    HWPX   ZIP 안의 XML 에서 글자만 뽑는다
    HWP    처리 못 함. 한글 바이너리라 별도 라이브러리가 필요하다
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "policy_data" / "raw"
DOCS_DIR = RAW_DIR / "docs"

sys.path.insert(0, str(ROOT / "policy_data"))
from collect import field, haystack, is_open, scope, SOSANG, USABLE  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (ai-hwaseong hackathon; contact via github.com/ldy1118-git)"}
PAUSE = 1.0  # 서버에 부담 주지 않기 위한 간격


def target_rows() -> list[dict]:
    """가장 최근에 받아둔 원본에서 우리 대상 공고만 고른다."""
    snapshots = sorted(RAW_DIR.glob("bizinfo_*.json"))
    if not snapshots:
        print("원본이 없습니다. 먼저 실행하세요:", file=sys.stderr)
        print("  python3 policy_data/collect.py --raw", file=sys.stderr)
        raise SystemExit(1)
    rows = json.loads(snapshots[-1].read_text(encoding="utf-8"))
    return [r for r in rows
            if SOSANG.search(haystack(r)) and scope(r) in USABLE and is_open(r)]


def candidates(entry: dict) -> list[tuple[str, str]]:
    """(파일명, URL) 후보를 좋은 순서로. 본문출력파일이 대개 공고문 본문이다."""
    pairs = [
        (field(entry, "printFileNm"), field(entry, "printFlpthNm")),
        (field(entry, "fileNm"), field(entry, "flpthNm")),
    ]
    return [(n, u) for n, u in pairs if n and u]


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def pdf_to_text(data: bytes) -> str:
    result = subprocess.run(
        ["pdftotext", "-layout", "-", "-"],
        input=data, capture_output=True, timeout=120,
    )
    return result.stdout.decode("utf-8", "replace")


def hwpx_to_text(data: bytes) -> str:
    """HWPX 는 OWPML 을 담은 ZIP 이다. section*.xml 의 글자만 긁는다."""
    chunks: list[str] = []
    with zipfile.ZipFile(BytesIO(data)) as archive:
        names = [n for n in archive.namelist() if re.search(r"section\d*\.xml$", n)]
        for name in sorted(names):
            xml = archive.read(name).decode("utf-8", "replace")
            # <hp:t> 안의 글자가 본문이다
            for match in re.findall(r"<hp:t[^>]*>(.*?)</hp:t>", xml, re.S):
                text = re.sub(r"<[^>]+>", "", match)
                if text.strip():
                    chunks.append(text)
    return "\n".join(chunks)


def extract(name: str, data: bytes) -> tuple[str, str]:
    """(텍스트, 사용한 방법). 실패하면 텍스트가 빈 문자열."""
    lowered = name.lower()
    if data[:4] == b"%PDF":
        return pdf_to_text(data), "pdf"
    if data[:2] == b"PK" and lowered.endswith(".hwpx"):
        return hwpx_to_text(data), "hwpx"
    if data[:2] == b"PK" and lowered.endswith(".zip"):
        return "", "zip(압축 안 품)"
    if lowered.endswith(".hwp"):
        return "", "hwp(처리 못 함)"
    if lowered.endswith((".jpg", ".jpeg", ".png")):
        return "", "이미지"
    return "", f"모르는 형식({lowered[-6:]})"


def main() -> int:
    report_only = "--report" in sys.argv
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    rows = target_rows()
    print(f"대상 공고 {len(rows)}건\n")

    results: list[tuple[str, str, int, str]] = []  # (공고ID, 방법, 글자수, 공고명)

    for index, entry in enumerate(rows, 1):
        pblanc_id = field(entry, "pblancId", "seq")
        title = field(entry, "pblancNm", "title")
        out_path = DOCS_DIR / f"{pblanc_id}.txt"

        if out_path.exists():
            text = out_path.read_text(encoding="utf-8")
            results.append((pblanc_id, "캐시", len(text), title))
            print(f"[{index:2}/{len(rows)}] 캐시  {len(text):6}자  {title[:42]}")
            continue
        if report_only:
            results.append((pblanc_id, "없음", 0, title))
            continue

        pairs = candidates(entry)
        best_text = ""
        attempts: list[str] = []  # 후보마다 무슨 일이 있었는지 그대로 적는다
        for name, url in pairs:
            try:
                data = download(url)
            except Exception as error:
                attempts.append(f"{name[-12:]}:내려받기실패({type(error).__name__})")
                continue
            text, how = extract(name, data)
            size = len(text.strip())
            attempts.append(f"{how}:{size}자")
            if size > len(best_text.strip()):
                best_text = text
            if len(best_text.strip()) > 500:
                break  # 충분히 건졌으면 다음 후보는 안 본다
            time.sleep(PAUSE)
        best_how = " + ".join(attempts) if attempts else "첨부 URL 없음"

        cleaned = re.sub(r"[ \t]+", " ", best_text).strip()
        if len(cleaned) > 200:
            out_path.write_text(cleaned, encoding="utf-8")
        results.append((pblanc_id, best_how, len(cleaned), title))
        mark = "OK  " if len(cleaned) > 200 else "실패"
        print(f"[{index:2}/{len(rows)}] {mark} {best_how:22} {len(cleaned):6}자  {title[:42]}")
        time.sleep(PAUSE)

    ok = [r for r in results if r[2] > 200]
    print()
    print("=" * 66)
    print(f"본문 확보 {len(ok)}/{len(results)}건")
    print("=" * 66)
    failed = [r for r in results if r[2] <= 200]
    if failed:
        print("\n못 가져온 것 — 손으로 봐야 한다")
        for pblanc_id, how, _, title in failed:
            print(f"  · [{how}] {title[:52]}")
            print(f"      https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId={pblanc_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
