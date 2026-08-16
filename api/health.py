"""GET /api/health — 배포가 살아있는지, 공고를 몇 건 읽었는지.

배포 직후 여기부터 열어볼 것. 공고가 0건이면 vercel.json 의
includeFiles 가 policy_data/ 를 안 싣고 있다는 뜻이다.
"""

from __future__ import annotations

import os

from _shared import Base, send_json

import matching


class handler(Base):  # noqa: N801
    def do_GET(self) -> None:  # noqa: N802
        try:
            folder = matching.default_notices_folder()
            count = len(matching.load_policies_from_folder(folder))
            using_real = folder.name == "notices" and "policy_data" in str(folder)
        except Exception as error:
            return send_json(self, {"ok": False, "error": str(error)}, 500)

        send_json(self, {
            "ok": True,
            "notices": count,
            "notices_source": "policy_data (실제 공고)" if using_real else "backend (샘플)",
            "llm_key_configured": bool(os.environ.get("GEMINI_API_KEY", "").strip()),
            "ocr": "미지원 — torch 가 Vercel 용량 한도를 넘는다. 로컬 서버에서 시연할 것",
        })
