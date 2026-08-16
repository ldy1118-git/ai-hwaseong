"""GET /api/terms — 행정용어 사전 원본.

프론트가 terms.json 을 복사해 두면 사전을 고쳤을 때 복사본이 조용히 낡는다.
여기서 받아 쓰면 원본 하나만 남는다.

공고문에 실제로 나온 용어만 필요하면 /api/terms/lookup 을 쓸 것.

파일 이름이 glossary 인 이유: api/terms.py 로 두면 policy_data/terms.py 를
가려버려서 `import terms` 가 자기 자신을 불러온다. vercel.json 이
/api/terms 를 여기로 넘긴다.
"""

from __future__ import annotations

from _shared import Base, send_json

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
