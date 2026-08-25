/**
 * 백엔드 호출. 배포 환경에서는 같은 도메인의 /api/* 를 그대로 부른다.
 *
 * UI 개발 전용 mock 모드: .env 에 VITE_MOCK=true 를 추가하면
 * 서버 없이 목업 데이터만으로 모든 화면을 테스트할 수 있다.
 */

import {
  MOCK_MATCHES,
  MOCK_TERMS_LOOKUP,
  MOCK_OCR_RESULT,
  delay,
} from '../mocks/index.js'

const MOCK = localStorage.getItem('mars-mock') === 'true'

/** 요청 경로를 환경에 맞게 바꿔준다. 배포에서는 그대로 상대경로. */
export function apiUrl(path) {
  const override = import.meta.env.VITE_API_URL
  if (override) return override.replace(/\/$/, '') + path

  // JupyterHub 프록시: pathname = /user/<id>/proxy/<port>/...
  // fetch('/api/match') 는 origin 기준 절대경로라서 프록시 prefix가 날아간다.
  // prefix 를 그대로 붙여줘야 /user/22016084/proxy/3002/api/match 로 간다.
  const m = window.location.pathname.match(/^(\/user\/[^/]+\/proxy\/\d+)/)
  if (m) return m[1] + path

  return path  // Vercel / 로컬 직접 접속
}

async function post(path, body) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `API ${res.status}: ${path}`)
  }
  return res.json()
}

// 온보딩 완료 전 fallback
export const DEFAULT_PROFILE = {
  age: 30,
  region: '화성시',
  business_status: '운영중',
  category: '카페',
  career_experience: '없음',
  asset_group: '일반',
  business_period_months: 12,
  annual_revenue_krw: null,
  marital_status: '미혼',
  living_with_parents: false,
}

/* 매칭 결과를 잠깐 들고 있는다.
 *
 * 이 함수를 부르는 화면이 일곱이다 — 홈·일정·내 매장·공고상세·서류준비·
 * 대시보드·openNotice. 캐시가 없을 때 시연 동선을 한 바퀴 돌면
 * **245KB 를 다섯 번 받고 2.96초를 기다린다.** 다섯 번 다 같은 내용이다.
 *
 * 공고는 하루에 한 번, 새벽 6시 11분 cron 때만 바뀐다. 3분은 아주 넉넉히
 * 짧게 잡은 것이다.
 *
 * **결과가 아니라 약속을 들고 있는다.** 그래야 두 화면이 동시에 뜰 때도
 * 요청이 한 번만 나간다. 결과만 캐시하면 첫 응답이 오기 전에 부른 쪽은
 * 그냥 또 부른다.
 *
 * 열쇠에 프로필을 통째로 넣는다. 내 정보에서 업종을 고치면 열쇠가 달라져
 * 저절로 다시 받는다 — 따로 지우는 손이 필요 없다.
 *
 * 실패한 약속은 버린다. 안 그러면 잠깐 끊겼을 때 3분 동안 다시 열어도
 * 계속 같은 실패를 돌려준다.
 *
 * 받은 배열을 그 자리에서 바꾸면 안 된다. 부르는 쪽이 전부 filter/map 으로
 * 새로 만들고 있어서 지금은 괜찮다. **sort() 를 결과에 바로 걸지 말 것** —
 * 한 화면에서 정렬하면 다른 화면의 순서까지 같이 바뀐다.
 */
const MATCH_TTL = 3 * 60 * 1000
let matchCache = null      // { key, at, promise }

/**
 * 조건에 맞는 지원사업을 받아온다.
 *
 * notices_folder 를 넘기지 않는다. 넘기면 backend/notices/ 의 **샘플 19건**
 * (형식 참고용 가짜 데이터)을 읽는다. 기본값이 policy_data/notices/ 의
 * 실제 공고이므로 그냥 두면 된다.
 */
export function fetchMatches(userProfile = DEFAULT_PROFILE, deviceId = 'guest') {
  if (MOCK) return delay().then(() => MOCK_MATCHES)

  const key = JSON.stringify([userProfile, deviceId])
  const now = Date.now()
  if (matchCache && matchCache.key === key && now - matchCache.at < MATCH_TTL) {
    return matchCache.promise
  }

  const promise = post('/api/match', { user_profile: userProfile, device_id: deviceId })
  matchCache = { key, at: now, promise }
  promise.catch(() => {
    if (matchCache && matchCache.promise === promise) matchCache = null
  })
  return promise
}


/** 행정용어 사전 전체. 프론트에 복사본을 두지 말 것 — 원본이 바뀌면 낡는다. */
export async function fetchTerms() {
  if (MOCK) return delay().then(() => ({ terms: [], documents: [] }))
  const res = await fetch(apiUrl('/api/terms'))
  if (!res.ok) throw new Error(`용어 사전을 불러오지 못했습니다 (${res.status})`)
  return res.json()
}

/** 공고문에 실제로 등장한 용어만. 사전 전체를 프롬프트에 넣으면 토큰 낭비다. */
export function lookupTerms(text, documents = []) {
  if (MOCK) return delay().then(() => MOCK_TERMS_LOOKUP)
  return post('/api/terms/lookup', { text, documents })
}

/** mock 모드에서 사업자등록증 OCR 결과를 흉내낸다. */
export function mockOcrResult() {
  return delay(800).then(() => MOCK_OCR_RESULT)
}

// ── 사용자 (카카오 로그인 후에만 동작) ─────────────────────────────

const TOKEN_KEY = 'mars-fit-token'

export const getToken   = () => localStorage.getItem(TOKEN_KEY)
export const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

/** 카카오에서 받은 인가 코드로 로그인. { token, new_user, onboarding_completed } */
export async function loginWithKakao(code) {
  const data = await post('/api/auth/kakao', { code })
  if (data?.token?.access_token) setToken(data.token.access_token)
  return data
}

async function authed(path, method, body) {
  const token = getToken()
  if (!token) throw new Error('로그인이 필요합니다')

  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    clearToken()               // 만료된 토큰을 들고 계속 실패하지 않게 지운다
    throw new Error(data.error || '다시 로그인해주세요')
  }
  if (!res.ok) throw new Error(data.error || `API ${res.status}: ${path}`)
  return data
}

/** 온보딩 결과 저장. 이미 있으면 갱신된다(멱등). */
export const saveOnboarding = (profile) =>
  authed('/api/users/me/onboarding', 'PUT', { profile })

/** 저장된 프로필 조회. { profile, onboarding_completed } */
export const loadOnboarding = () =>
  authed('/api/users/me/onboarding', 'GET')

/** 일부 항목만 수정. 안 넘긴 항목은 그대로 남는다. */
export const patchOnboarding = (profile) =>
  authed('/api/users/me/onboarding', 'PATCH', { profile })

/** 저장된 온보딩 답변을 서버에서 지운다. 로그인 이력은 남는다. */
export const deleteOnboarding = () =>
  authed('/api/users/me/onboarding', 'DELETE')

/* 기기 사이로 이어지는 것들 (관심공고·메모·서류진행·신청완료).
   서버는 내용을 해석하지 않는다. 합치는 판단은 utils/userState.js 가 한다. */

export const getUserState = () =>
  authed('/api/users/me/state', 'GET')

export const putUserState = (state) =>
  authed('/api/users/me/state', 'PUT', { state })

/* 카톡 알림 — refresh_token 은 서버에만 있다. 여기로 안 내려온다. */

/** { enabled, authorize_url } */
export const getKakaoNotifyState = () =>
  authed('/api/notify/kakao', 'GET')

/** 동의하고 받은 code 로 켠다. */
export const enableKakaoNotify = (code) =>
  authed('/api/notify/kakao', 'POST', { code })

/** 끈다. 서버에서 토큰 행이 지워진다. */
export const disableKakaoNotify = () =>
  authed('/api/notify/kakao', 'DELETE')

/** 이 기기에 남은 것을 전부 지운다.
 *
 *  키를 하나씩 적어두면 새 키가 생겼을 때 빠뜨린다 — 실제로 로그아웃이
 *  applied-programs 와 checklist-progress 를 안 지우고 있었다. 접두어로
 *  훑어서 통째로 지운다. */
export function clearLocalData() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('mars-fit-')) keys.push(k)
  }
  keys.forEach(k => localStorage.removeItem(k))
  return keys
}
