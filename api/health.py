"""GET /api/health — 배포가 살아있는지, 공고를 몇 건 읽었는지.

배포 직후 여기부터 열어볼 것. 공고가 0건이면 vercel.json 의
includeFiles 가 policy_data/ 를 안 싣고 있다는 뜻이다.
"""

from __future__ import annotations

# Vercel 런타임은 sys.path 에 /var/task 만 넣는다. 이 파일이 있는 api/ 는
# 들어가지 않아서 옆 파일(_shared 등)을 import 할 수 없다. 직접 넣어준다.
# 이것 없이 배포하면 전부 FUNCTION_INVOCATION_FAILED 로 죽는다.
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import os

import _store
from _shared import Base, send_json

import matching

# 자기 점검용 가짜 회원번호. 카카오 회원번호는 전부 숫자라 절대 겹치지 않는다.
SENTINEL = "__health_check__"


def write_check() -> dict:
    """회원 생성(INSERT)까지 실제로 해보고 지운다.  /api/health?deep=1

    조회만 확인하면 sequences 권한 누락을 못 잡는다. 그 경우 SELECT 는
    되는데 users INSERT 에서 id 자동 증가가 막혀서, 카카오 로그인 중
    **신규 회원일 때만** 실패한다. 기존 회원은 멀쩡해서 찾기 어렵다.

    남기지 않는다. 만들고 바로 지운다.
    """
    try:
        user = _store.create_user(SENTINEL, "점검용")
    except _store.StoreError as error:
        message = str(error)
        if "sequence" in message.lower() or "42501" in message:
            return {"ok": False, "reason": "INSERT 권한 없음 — sequences GRANT 확인",
                    "detail": message[:200]}
        return {"ok": False, "reason": message[:200]}

    try:
        _store.upsert_profile(int(user["id"]), {"region": "점검"})
        profile_ok = bool(_store.get_profile(int(user["id"])))
    except _store.StoreError as error:
        profile_ok = False
        detail = str(error)[:200]
    else:
        detail = None
    finally:
        try:
            _store._call("DELETE", "users", params={"provider_id": f"eq.{SENTINEL}"})
        except _store.StoreError:
            pass  # 남아도 로그인에 지장은 없다. 지워지면 좋고.

    return {"ok": profile_ok, "users_insert": True,
            "profiles_upsert": profile_ok, **({"detail": detail} if detail else {})}


def database() -> dict:
    """Supabase 까지 실제로 붙어보고 결과를 돌려준다.

    설정만 확인하면 "키는 꽂혔는데 권한이 없어서 안 되는" 상태를 못 잡는다.
    Data API 의 'expose new tables' 를 끄면 anon 역할에 권한이 안 붙는데,
    service_role 이 그대로 통과하는지는 붙여봐야 안다.
    """
    try:
        _store.find_user_by_provider(SENTINEL)
    except _store.StoreError as error:
        message = str(error)
        if "SUPABASE_URL" in message:
            return {"connected": False, "reason": "환경변수 미설정"}
        if "permission denied" in message or "42501" in message:
            return {"connected": False, "reason": "권한 없음 — anon 키를 넣었는지 확인",
                    "detail": message[:200]}
        if "does not exist" in message or "42P01" in message:
            return {"connected": False, "reason": "테이블 없음 — supabase_schema.sql 실행 필요",
                    "detail": message[:200]}
        return {"connected": False, "reason": message[:200]}
    return {"connected": True}



def count_keys(env: str) -> int:
    """그 제공자에 꽂힌 키 개수. api/llm.py 의 read_keys 와 같은 규칙이다."""
    seen = set()
    for suffix in [""] + [f"_{n}" for n in range(2, 6)]:
        key = os.environ.get(env + suffix, "").strip().strip("\"'").strip()
        if key:
            seen.add(key)
    return len(seen)


def ocr_status() -> dict[str, Any]:
    """사진 읽는 서버가 붙어 있는지.

    easyocr 는 torch 까지 1.4GB 라 Vercel 함수(250MB)에 안 들어간다. 그래서
    별도 서버가 맡고 `api/ocr.py` 는 중계만 한다. 그 서버 주소가
    OCR_BACKEND_URL 이다 — 무료 터널이라 켤 때마다 바뀐다.

    **여기서 실제로 환경변수를 본다.** 전에는 「미지원」이라고 박아둔 문자열
    이라, 주소를 넣고 재배포해도 계속 미지원이라고 답했다. 온보딩이 이 값을
    보고 사진과 직접 입력 중 무엇을 앞에 낼지 정하므로, 틀리면 사장님이
    안 되는 버튼을 먼저 누르게 된다.

    주소 자체는 안 내보낸다. 켜져 있는지만 알려준다.
    """
    if os.environ.get("OCR_BACKEND_URL", "").strip():
        return {"ready": True, "detail": "사진 읽는 서버가 연결되어 있어요"}
    return {
        "ready": False,
        "detail": "사진 읽는 서버가 연결되지 않았어요. 온보딩에서 직접 입력으로 안내합니다.",
    }


class handler(Base):  # noqa: N801
    def do_GET(self) -> None:  # noqa: N802
        deep = "deep=1" in (self.path or "")
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
            "database": database(),
            **({"write_check": write_check()} if deep else {}),
            "configured": {
                # LLM 은 셋 중 하나만 있으면 챗봇이 돈다. 셋 다 false 면
                # 챗봇이 죽어 있다는 뜻이라 배포 후 여기부터 볼 것.
                # 몇 개 꽂혔는지까지 센다. 한 제공자에 키를 여러 개 넣을 수
                # 있어서(GROQ_API_KEY, GROQ_API_KEY_2, ...) 있다/없다만으로는
                # 두 번째 키가 들어갔는지 밖에서 확인할 방법이 없다.
                # 키 값은 내보내지 않는다. 개수만이다.
                "GROQ_API_KEY": count_keys("GROQ_API_KEY"),
                "XAI_API_KEY": count_keys("XAI_API_KEY"),
                "GEMINI_API_KEY": count_keys("GEMINI_API_KEY"),
                "JWT_SECRET": bool(os.environ.get("JWT_SECRET", "").strip()),
                "KAKAO_CLIENT_ID": bool(os.environ.get("KAKAO_CLIENT_ID", "").strip()),
                # 사진 읽는 서버와 나눠 갖는 비밀번호. 값은 안 내보낸다.
                # 주소(OCR_BACKEND_URL)와 따로 넣게 되어 있어서, 둘 중 하나만
                # 넣고 「왜 안 되지」 하는 일이 생긴다. 아래 ocr.ready 와 같이 볼 것.
                "OCR_SHARED_SECRET": bool(os.environ.get("OCR_SHARED_SECRET", "").strip()),
                "KAKAO_REDIRECT_URI": os.environ.get("KAKAO_REDIRECT_URI", "") or None,
            },
            "ocr": ocr_status(),
        })
