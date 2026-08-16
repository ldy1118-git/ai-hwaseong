"""POST /api/terms/lookup — 공고문에 실제로 나온 용어만 골라준다.

vercel.json 이 /api/terms/lookup 을 이 파일로 넘긴다.
파일 이름에 terms 를 쓰지 않는 이유는 glossary.py 주석 참고.

요청  { "text": "공고문", "documents": ["사업자등록증", ...] }
응답  { "terms": [...], "documents": [...], "glossary": "..." }

사전 전체를 LLM 프롬프트에 넣으면 토큰도 낭비고 엉뚱한 용어까지 끌어온다.
"""

from __future__ import annotations

# Vercel 런타임은 sys.path 에 /var/task 만 넣는다. 이 파일이 있는 api/ 는
# 들어가지 않아서 옆 파일(_shared 등)을 import 할 수 없다. 직접 넣어준다.
# 이것 없이 배포하면 전부 FUNCTION_INVOCATION_FAILED 로 죽는다.
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from _shared import Base, read_json, send_json

import terms


class handler(Base):  # noqa: N801
    def do_POST(self) -> None:  # noqa: N802
        payload = read_json(self)
        text = payload.get("text") or ""
        names = payload.get("documents") or []

        if not isinstance(text, str):
            return send_json(self, {"error": "text 는 문자열이어야 합니다"}, 400)
        if not isinstance(names, list):
            names = []

        try:
            found = terms.find_terms(text)
            docs = [doc for doc in (terms.find_document(str(n)) for n in names) if doc]
            glossary = terms.glossary_for(text)
        except Exception as error:
            return send_json(self, {"error": f"용어 조회 실패: {error}"}, 500)

        send_json(self, {"terms": found, "documents": docs, "glossary": glossary})

    def do_GET(self) -> None:  # noqa: N802
        send_json(self, {
            "error": "POST 로 호출하세요",
            "example": {"text": "공고문 내용", "documents": ["사업자등록증"]},
        }, 405)
