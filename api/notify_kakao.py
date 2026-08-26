"""카카오톡 알림 켜기·끄기.

    GET    /api/notify/kakao          지금 켜져 있나 + 켜러 갈 주소
    POST   /api/notify/kakao          동의하고 받은 code 로 켠다
    DELETE /api/notify/kakao          끈다

**왜 로그인과 따로 인가를 받나** — 「카카오톡 메시지 전송」을 로그인 화면에
같이 띄우면 처음 온 사람이 광고 오는 줄 알고 체크를 뺀다. 왜 필요한지
설명할 자리가 없기 때문이다. 그래서 콘솔에서 **이용 중 동의**로 두고,
사장님이 「카톡 알림 받기」를 눌렀을 때만 `scope=talk_message` 로 한 번 더
물어본다.

    ① GET  → authorize_url 을 받아 그리로 보낸다 (scope=talk_message)
    ② 카카오가 code 를 들고 돌아온다
    ③ POST { code } → 토큰 교환 → refresh_token 저장

**refresh_token 을 저장한다.** 그 사람 카톡으로 메시지를 보낼 수 있는
자격증명이다. Supabase 에만 두고 저장소·로그·응답에 절대 싣지 않는다.
끄면 행을 지운다.

실제 발송은 여기가 아니라 연구실 서버의 `scripts/notify_kakao.py` 가 한다.
Vercel 함수는 요청이 와야 도는데, 알림은 아무도 안 부를 때 나가야 한다.
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import urllib.error
import urllib.parse
import urllib.request

import _auth
import _store
from _shared import Base, read_json, send_json

TOKEN_URL = "https://kauth.kakao.com/oauth/token"
MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
TIMEOUT = 10

# 「나에게 보내기」에 필요한 것 하나뿐이다. 친구 목록·친구에게 보내기는
# 심사가 걸리고 우리에게 필요하지도 않다.
SCOPE = "talk_message"


def _authorize_url() -> str:
    client_id = _os.environ.get("KAKAO_CLIENT_ID", "").strip()
    redirect_uri = _os.environ.get("KAKAO_REDIRECT_URI", "").strip()
    if not client_id or not redirect_uri:
        raise RuntimeError("KAKAO_CLIENT_ID / KAKAO_REDIRECT_URI 가 설정되지 않았습니다")
    query = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        # 돌아왔을 때 로그인과 구분하는 표시. 이게 없으면 App.jsx 의
        # 로그인 처리가 이 code 를 먼저 집어가고, 알림은 안 켜진 채
        # 로그인만 다시 된다.
        "state": "notify",
    })
    return f"https://kauth.kakao.com/oauth/authorize?{query}"


def _exchange(code: str) -> dict:
    """code 를 토큰으로 바꾼다. refresh_token 까지 통째로 돌려준다."""
    client_id = _os.environ.get("KAKAO_CLIENT_ID", "").strip()
    redirect_uri = _os.environ.get("KAKAO_REDIRECT_URI", "").strip()
    secret = _os.environ.get("KAKAO_CLIENT_SECRET", "").strip()

    form = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    if secret:
        form["client_secret"] = secret

    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode(form).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"카카오 토큰 교환 실패 ({error.code}): {detail}") from error
    except Exception as error:
        raise RuntimeError(f"카카오에 연결하지 못했습니다: {error}") from error

    if not payload.get("refresh_token"):
        # 동의 화면에서 체크를 빼면 여기까지는 오는데 권한이 없다.
        raise RuntimeError("카카오가 refresh_token 을 주지 않았습니다. 동의를 취소하셨나요?")
    return payload


def _refresh(refresh_token: str) -> dict:
    """refresh_token 으로 access_token 을 새로 받는다.

    `scripts/notify_kakao.py` 의 같은 이름 함수와 같은 일을 한다. 새벽
    발송은 연구실 서버가 하고 이건 화면에서 부르는 길이라 각자 갖고 있다.
    **한쪽만 고치면 한쪽만 멈춘다.**
    """
    form = {
        "grant_type": "refresh_token",
        "client_id": _os.environ.get("KAKAO_CLIENT_ID", "").strip(),
        "refresh_token": refresh_token,
    }
    secret = _os.environ.get("KAKAO_CLIENT_SECRET", "").strip()
    if secret:
        form["client_secret"] = secret

    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode(form).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"토큰 갱신 실패 ({error.code}): {detail}") from error
    except Exception as error:
        raise RuntimeError(f"카카오에 연결하지 못했습니다: {error}") from error

    if not payload.get("access_token"):
        raise RuntimeError("카카오가 access_token 을 주지 않았습니다")
    return payload


def _send_memo(access_token: str, text: str) -> None:
    """「나에게 보내기」. 그 사람 카톡의 「나와의 채팅」에만 뜬다."""
    link = _os.environ.get("SITE_URL", "https://ai-hwaseong-ten.vercel.app").strip()
    template = {
        "object_type": "text",
        "text": text,
        "link": {"web_url": link, "mobile_web_url": link},
        "button_title": "열어보기",
    }
    request = urllib.request.Request(
        MEMO_URL,
        data=urllib.parse.urlencode({
            "template_object": json.dumps(template, ensure_ascii=False),
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"({error.code}) {detail}") from error
    except Exception as error:
        raise RuntimeError(str(error)) from error


def _granted(access_token: str) -> bool:
    """talk_message 에 실제로 동의했는지 카카오에 물어본다.

    code 를 받아왔다고 동의한 것은 아니다. 동의 화면에서 체크를 빼고
    넘어가도 code 는 나온다. 그대로 저장하면 새벽에 발송이 전부 실패한다.
    """
    request = urllib.request.Request(
        "https://kapi.kakao.com/v2/user/scopes",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        # 확인에 실패했다고 켜기를 막지는 않는다. 발송 쪽에서 다시 걸린다.
        return True
    for scope in payload.get("scopes", []):
        if scope.get("id") == SCOPE:
            return bool(scope.get("agreed"))
    return False


class handler(Base):  # noqa: N801  Vercel 이 이 이름을 찾는다
    def do_GET(self) -> None:  # noqa: N802
        try:
            user_id = _auth.user_id_from(self)
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)

        try:
            url = _authorize_url()
        except RuntimeError as error:
            return send_json(self, {"error": str(error)}, 503)

        try:
            enabled = _store.get_kakao_notify(user_id) is not None
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)

        # refresh_token 은 절대 안 내려보낸다. 켜졌는지만 알려준다.
        send_json(self, {"enabled": enabled, "authorize_url": url})

    def do_POST(self) -> None:  # noqa: N802
        try:
            user_id = _auth.user_id_from(self)
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)

        body = read_json(self)

        # 「지금 한 통 보내보기」. 켜둔 사람이 진짜 오는지 확인할 때 쓴다.
        # **새 함수를 만들지 않는다** — Vercel Hobby 는 12개까지고 지금 11개다.
        # 같은 자원(그 사람의 카톡 알림)을 다루므로 여기서 가른다.
        if (body.get("action") or "").strip() == "test":
            return self._send_test(user_id, body)

        code = (body.get("code") or "").strip()
        if not code:
            return send_json(self, {"error": "code 가 없습니다"}, 400)

        try:
            tokens = _exchange(code)
        except RuntimeError as error:
            return send_json(self, {"error": str(error)}, 502)

        if not _granted(tokens.get("access_token", "")):
            return send_json(self, {
                "error": "카카오톡 메시지 전송에 동의하지 않으셔서 알림을 켤 수 없어요",
            }, 403)

        try:
            _store.set_kakao_notify(user_id, tokens["refresh_token"])
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)

        send_json(self, {"enabled": True})

    def _send_test(self, user_id: int, body: dict) -> None:
        """지금 한 통 보낸다.

        **본문은 화면이 만들어 보낸다.** 여기서 다시 매칭을 돌리면 같은
        판정 로직이 두 벌이 된다. 화면에는 이미 매칭 결과와 세무 기한이
        있으니 그대로 쓰는 게 맞다.

        남의 카톡으로는 못 간다 — 「나에게 보내기」라 그 사람의 「나와의
        채팅」에만 뜬다. 그래서 본문을 화면이 정해도 위험하지 않다.

        **보낸 기록을 남기지 않는다.** 새벽 발송(`scripts/notify_kakao.py`)은
        같은 공고를 두 번 안 보내려고 기록하는데, 여기서 적어버리면 확인 한
        번에 그날 진짜 알림이 사라진다.
        """
        text = (body.get("text") or "").strip()
        if not text:
            return send_json(self, {"error": "보낼 내용이 없습니다"}, 400)
        # 카카오 텍스트 템플릿 상한이 200자다. 넘으면 통째로 거절당한다.
        if len(text) > 190:
            text = text[:189] + "…"

        try:
            row = _store.get_kakao_notify(user_id)
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)
        if not row:
            return send_json(self, {"error": "카톡 알림이 꺼져 있어요"}, 409)

        try:
            tokens = _refresh(row["refresh_token"])
        except RuntimeError as error:
            return send_json(self, {"error": str(error)}, 502)

        # 카카오가 refresh_token 을 새로 주면 갈아끼운다. 안 그러면 두 달 뒤
        # 조용히 멈춘다.
        fresh = tokens.get("refresh_token")
        if fresh and fresh != row["refresh_token"]:
            try:
                _store.set_kakao_notify(user_id, fresh)
            except _store.StoreError:
                pass  # 보내는 건 계속한다

        try:
            _send_memo(tokens["access_token"], text)
        except (KeyError, RuntimeError) as error:
            return send_json(self, {"error": f"보내지 못했어요: {error}"}, 502)

        send_json(self, {"sent": True})

    def do_DELETE(self) -> None:  # noqa: N802
        try:
            user_id = _auth.user_id_from(self)
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)
        try:
            _store.clear_kakao_notify(user_id)
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)
        send_json(self, {"enabled": False})
