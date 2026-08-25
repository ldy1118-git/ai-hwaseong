"""POST /api/foottraffic — 주변 POI 수집 + LLM 자연어 요약.

흐름:
  1. 외부 서버(pjrx.kr) → Overpass API 로 학교·아파트·음식점·카페 수집
  2. POI 데이터로 프롬프트 구성
  3. Vercel 의 LLM 제공자(Groq → xAI → Gemini)로 2~3문장 요약
  4. { coords, address, radius_m, pois, summary } 반환

외부 서버는 무거운 Overpass 호출만 담당한다. LLM 키는 Vercel 환경변수에만
있으므로 외부 서버에 넘기지 않는다.

필요한 환경변수 (Vercel 대시보드에만 넣는다):
    OCR_BACKEND_URL      https://pjrx.kr
    OCR_SHARED_SECRET    외부 서버 start_external.bat 과 같은 값
    GROQ_API_KEY         (또는 XAI_API_KEY, GEMINI_API_KEY) LLM 요약용
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import urllib.error
import urllib.request

from _shared import Base, read_json, send_json
from llm import PROVIDERS, read_keys, call_openai_compatible, call_gemini

BACKEND = (_os.environ.get("OCR_BACKEND_URL") or "").rstrip("/")
SECRET  = _os.environ.get("OCR_SHARED_SECRET") or ""

TIMEOUT_POI = 30  # Overpass API 는 최대 25초 timeout
TIMEOUT_LLM = 30  # LLM 요약


def _build_prompt(address: str, radius: int, pois: dict) -> str:
    schools     = pois.get("schools", [])
    apartments  = pois.get("apartments", [])
    restaurants = pois.get("restaurants", {})
    cafes       = pois.get("cafes", {})

    school_text = ", ".join(schools[:5]) if schools else "없음"
    apt_text    = ", ".join(apartments[:3]) if apartments else "없음"

    return f"""아래는 특정 위치의 반경 {radius}m 내 실제 OpenStreetMap 데이터입니다.
화성시 소상공인이 창업 입지를 판단할 수 있도록 친근하고 자연스럽게 2~3문장으로 요약해주세요.

위치: {address}

수집된 데이터:
- 학교: {len(schools)}개 ({school_text})
- 아파트 단지: {len(apartments)}개 ({apt_text})
- 음식점: {restaurants.get('count', 0)}개
- 카페: {cafes.get('count', 0)}개

요약 규칙:
1. "주변에 ~" 로 시작하세요
2. 수치를 자연스럽게 문장에 녹여주세요
3. 음식점+카페 합산 5개 이상이면 "활발한 상권", 미만이면 "조용한 주거지역" 등으로 표현하세요
4. 학교·아파트가 많으면 배후 수요가 탄탄하다고 언급하세요
5. 마크다운 없이 순수 텍스트로만 출력하세요"""


def _llm_summary(prompt: str) -> str:
    """키가 꽂힌 첫 번째 제공자로 요약. 실패하면 다음으로."""
    for name, spec in PROVIDERS.items():
        for key in read_keys(spec["env"]):
            try:
                if name == "gemini":
                    return call_gemini(key, spec["model"], "", prompt, False, [])
                else:
                    return call_openai_compatible(
                        spec["url"], key, spec["model"], "", prompt, False, []
                    )
            except Exception as e:
                print(f"[foottraffic] {spec['label']} 실패: {e}")
    raise RuntimeError("사용 가능한 LLM 제공자가 없습니다")


class handler(Base):  # noqa: N801
    def do_POST(self) -> None:  # noqa: N802
        if not BACKEND or not SECRET:
            return send_json(self, {
                "error": "외부 서버가 연결되지 않았습니다. 관리자에게 문의하세요.",
            }, 503)

        payload = read_json(self)
        if not payload.get("address") and (
            payload.get("lat") is None or payload.get("lng") is None
        ):
            return send_json(self, {"error": "address 또는 lat·lng 가 필요합니다"}, 400)

        # 1. 외부 서버에서 POI 수집
        body = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            f"{BACKEND}/foottraffic",
            data=body,
            headers={"Content-Type": "application/json", "X-Mars-Secret": SECRET},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_POI) as res:
                poi_result = json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                relayed = json.loads(e.read().decode("utf-8"))
            except Exception:
                relayed = {"error": f"외부 서버가 {e.code} 로 답했습니다"}
            return send_json(self, relayed, e.code if e.code >= 400 else 502)
        except urllib.error.URLError as e:
            return send_json(self, {
                "error": "상권 분석 서버에 닿지 못했습니다.",
                "detail": str(getattr(e, "reason", e)),
            }, 503)
        except TimeoutError:
            return send_json(self, {
                "error": "분석에 너무 오래 걸렸습니다. 다시 시도해 주세요.",
            }, 504)

        if "error" in poi_result:
            return send_json(self, poi_result, 422)

        # 2. LLM 요약
        address  = poi_result.get("address", "")
        radius_m = poi_result.get("radius_m", 500)
        pois     = poi_result.get("pois", {})

        try:
            summary = _llm_summary(_build_prompt(address, radius_m, pois))
        except Exception as e:
            summary = ""
            print(f"[foottraffic] LLM 요약 실패: {e}")

        return send_json(self, {**poi_result, "summary": summary})

    def do_GET(self) -> None:  # noqa: N802
        send_json(self, {
            "error":       "POST 로 호출하세요",
            "backend_set": bool(BACKEND),
            "secret_set":  bool(SECRET),
        }, 405)
