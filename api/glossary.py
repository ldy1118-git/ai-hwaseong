"""행정용어 사전. GET 은 전체, POST 는 공고문에 나온 것만.

    GET  /api/terms         사전 원본 전체
    POST /api/terms/lookup  { "text": "공고문", "documents": ["사업자등록증", ...] }
                            → { "terms": [...], "documents": [...], "glossary": "..." }

**한 파일에 둘을 담은 이유는 Vercel Hobby 요금제가 함수를 12개까지만
배포해주기 때문이다.** 13개가 되는 순간 빌드가 통째로 실패해서 아무도
배포를 못 한다. 실제로 그렇게 한 번 막혔다. 같은 자원(/api/terms)을
다루는 둘이라 합치는 게 원래 모양이기도 하다.

**함수를 새로 만들기 전에 `ls api/*.py | grep -v '^_'` 로 세어볼 것.**
밑줄로 시작하는 파일은 함수로 안 세니, 급하면 그렇게 내릴 수도 있다
(api/_ping.py 가 그 경우다).

프론트가 terms.json 을 복사해 두면 사전을 고쳤을 때 복사본이 조용히 낡는다.
여기서 받아 쓰면 원본 하나만 남는다.

사전 전체를 LLM 프롬프트에 넣으면 토큰도 낭비고 엉뚱한 용어까지 끌어온다.
그래서 lookup 이 따로 있다.

파일 이름이 glossary 인 이유: api/terms.py 로 두면 policy_data/terms.py 를
가려버려서 `import terms` 가 자기 자신을 불러온다. vercel.json 이
/api/terms 와 /api/terms/lookup 을 둘 다 여기로 넘긴다.
"""

from __future__ import annotations

# Vercel 런타임은 sys.path 에 /var/task 만 넣는다. 이 파일이 있는 api/ 는
# 들어가지 않아서 옆 파일(_shared 등)을 import 할 수 없다. 직접 넣어준다.
# 이것 없이 배포하면 전부 FUNCTION_INVOCATION_FAILED 로 죽는다.
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from _shared import Base, read_json, send_json

import terms

_data = None


def data() -> dict:
    global _data
    if _data is None:
        _data = terms.load()
    return _data


class handler(Base):  # noqa: N801
    def do_GET(self) -> None:  # noqa: N802
        try:
            send_json(self, data())
        except Exception as error:
            send_json(self, {"error": f"사전을 읽지 못했습니다: {error}"}, 500)

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
