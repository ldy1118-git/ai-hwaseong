"""GET /api/ping — 진단용. 표준 라이브러리만 쓰고 우리 코드를 하나도 안 부른다.

배포 후 다른 함수가 전부 FUNCTION_INVOCATION_FAILED 로 죽었을 때
원인을 좁히려고 만들었다.

  200 이면  → 런타임과 배포는 정상. 문제는 우리 import 쪽
  404 면    → 새 커밋이 배포되지 않았다
  500 이면  → 파이썬 런타임 자체나 vercel.json 설정 문제

sys.path 와 실제 파일 목록을 같이 돌려주므로, includeFiles 가 무엇을
올렸는지 눈으로 확인할 수 있다.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path


class handler(BaseHTTPRequestHandler):  # noqa: N801
    def do_GET(self):  # noqa: N802
        here = Path(__file__).resolve()
        root = here.parent.parent

        def listing(folder):
            path = root / folder
            if not path.is_dir():
                return f"(없음: {path})"
            names = sorted(p.name for p in path.iterdir())
            return names[:20] + ([f"... 총 {len(names)}개"] if len(names) > 20 else [])

        payload = {
            "ok": True,
            "python": sys.version.split()[0],
            "cwd": os.getcwd(),
            "__file__": str(here),
            "root": str(root),
            "sys_path_head": sys.path[:6],
            "files": {
                "api": listing("api"),
                "backend": listing("backend"),
                "policy_data": listing("policy_data"),
                "policy_data/notices": listing("policy_data/notices"),
            },
        }
        body = json.dumps(payload, ensure_ascii=False, indent=1).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
