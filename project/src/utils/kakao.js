/**
 * 카카오 로그인.
 *
 * 흐름은 이렇다.
 *   1. 사용자가 버튼을 누른다 → 카카오 로그인 페이지로 보낸다
 *   2. 카카오가 우리 주소로 되돌려 보낸다. ?code=... 가 붙어 온다
 *   3. 그 code 를 서버에 넘긴다. 서버가 토큰으로 바꾸고 JWT 를 준다
 *
 * **code 를 토큰으로 바꾸는 건 서버가 한다.** 그러려면 client_secret 이
 * 필요한데 그게 브라우저에 있으면 안 된다.
 *
 * 주의: 이 앱은 HashRouter 를 쓴다. 카카오는 등록된 주소 뒤에 ?code= 를
 * 붙여서 보내므로 주소가 `https://…/?code=xxx` 가 된다. 해시(#/) 앞이라
 * 라우터가 못 잡는다. 그래서 앱이 뜰 때 location.search 를 직접 본다.
 */

import {
  apiUrl, loginWithKakao,
  getKakaoNotifyState, enableKakaoNotify, disableKakaoNotify,
} from './api'

/** 카카오 로그인 페이지로 이동. 서버가 만들어준 주소를 그대로 쓴다. */
export async function goToKakaoLogin() {
  const res = await fetch(apiUrl('/api/auth/kakao'))
  const data = await res.json().catch(() => ({}))

  if (!res.ok || !data.authorize_url) {
    throw new Error(data.error || '카카오 로그인을 시작할 수 없습니다')
  }
  window.location.href = data.authorize_url
}

/**
 * 카카오에서 돌아온 직후인지 확인하고, 맞으면 로그인을 마친다.
 *
 * @returns {Promise<null | {new_user, onboarding_completed, user}>}
 *          카카오에서 온 게 아니면 null.
 */
export async function consumeKakaoRedirect() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')

  if (!code && !error) return null

  // 주소창에서 code 를 지운다. 남겨두면 새로고침할 때 이미 쓴 code 로
  // 다시 로그인하려다 실패한다 (인가 코드는 한 번만 쓸 수 있다).
  const clean = window.location.pathname + window.location.hash
  window.history.replaceState({}, '', clean)

  if (error) {
    // 사용자가 카카오 화면에서 취소를 눌렀을 때도 여기로 온다.
    throw new Error(params.get('error_description') || '카카오 로그인이 취소되었습니다')
  }
  return loginWithKakao(code)
}


/* ── 카톡 알림 ────────────────────────────────────────────────
 *
 * 로그인과 같은 카카오 인가를 한 번 더 쓴다. 다른 점은 두 가지 —
 * `scope=talk_message` 를 달고, `state=notify` 를 달아 돌아왔을 때
 * 로그인 처리와 구분한다.
 *
 * 왜 로그인할 때 같이 안 받나 — 「카카오톡 메시지 전송」을 로그인 화면에
 * 띄우면 처음 온 사람이 광고 오는 줄 알고 체크를 뺀다. 왜 필요한지
 * 설명할 자리가 없다. 콘솔에서 **이용 중 동의**로 두고 여기서 물어본다.
 */

/** 돌아온 주소가 알림 동의 결과인가. 로그인 처리가 가로채기 전에 봐야 한다. */
export function isKakaoNotifyReturn() {
  return new URLSearchParams(window.location.search).get('state') === 'notify'
}

/** 지금 켜져 있나 + 켜러 갈 주소. 로그인 안 했으면 던진다. */
export const getKakaoNotify = getKakaoNotifyState

/** 카카오 동의 화면으로 보낸다. */
export async function goToKakaoNotifyConsent() {
  const { authorize_url: url } = await getKakaoNotifyState()
  if (!url) throw new Error('카카오 설정이 끝나지 않았습니다')
  window.location.href = url
}

/** 동의하고 돌아왔을 때. code 를 서버에 넘겨 켠다. */
export async function finishKakaoNotify() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')

  // 주소창을 먼저 치운다. 남겨두면 새로고침할 때 이미 쓴 code 로 또 켜려다
  // 실패한다. 인가 코드는 한 번만 쓸 수 있다.
  window.history.replaceState({}, '', window.location.pathname + window.location.hash)

  if (error) throw new Error('카카오톡 알림 동의가 취소되었어요')
  if (!code) throw new Error('카카오에서 코드를 받지 못했어요')

  return enableKakaoNotify(code)
}

/** 끈다. 서버에서 refresh_token 행이 지워진다. */
export const stopKakaoNotify = disableKakaoNotify
