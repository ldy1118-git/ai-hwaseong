"""POST /api/match — 프로필로 공고를 매칭한다.

요청  { "user_profile": {...}, "device_id": "..." }
응답  { "count": N, "results": [...] }

user_profile 의 키 이름은 policy_data/schema.md 를 그대로 따라야 한다.
다른 이름으로 보내면 **에러 없이 조용히 무시되고** 그 조건이 통째로 빠진다.
"""

from __future__ import annotations

# Vercel 런타임은 sys.path 에 /var/task 만 넣는다. 이 파일이 있는 api/ 는
# 들어가지 않아서 옆 파일(_shared 등)을 import 할 수 없다. 직접 넣어준다.
# 이것 없이 배포하면 전부 FUNCTION_INVOCATION_FAILED 로 죽는다.
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from _shared import Base, read_json, send_json

import matching

# 공고 JSON 은 배포 때 고정이므로 콜드 스타트마다 한 번만 읽는다.
_policies = None


def policies() -> list[dict]:
    global _policies
    if _policies is None:
        _policies = matching.load_policies_from_folder(matching.default_notices_folder())
    return _policies


class handler(Base):  # noqa: N801  Vercel 이 이 이름을 찾는다
    def do_POST(self) -> None:  # noqa: N802
        payload = read_json(self)
        profile = payload.get("user_profile") or {}

        if not isinstance(profile, dict):
            return send_json(self, {"error": "user_profile 은 객체여야 합니다"}, 400)

        try:
            results = matching.match_policies(policies(), profile)
        except Exception as error:  # 공고 한 건이 깨져도 화면 전체가 죽지 않게
            return send_json(self, {"error": f"매칭 실패: {error}"}, 500)

        return send_json(self, {"count": len(results), "results": results})

    def do_GET(self) -> None:  # noqa: N802
        # 브라우저로 직접 열어봤을 때 뭐가 잘못됐는지 알려준다.
        send_json(self, {
            "error": "POST 로 호출하세요",
            "example": {"user_profile": {"region": "화성시", "business_status": "운영중"}},
            "loaded_notices": len(policies()),
        }, 405)
