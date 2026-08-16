/**
 * 백엔드 호출. 배포 환경에서는 같은 도메인의 /api/* 를 그대로 부른다.
 *
 * 호스트를 코드에 박으면 배포 주소가 바뀔 때마다 다시 빌드해야 한다.
 * 상대경로면 Vercel 에서도, 로컬 서버에서도, JupyterHub 프록시에서도
 * 같은 코드가 돈다.
 */

/** 요청 경로를 환경에 맞게 바꿔준다. 배포에서는 그대로 상대경로. */
export function apiUrl(path) {
  // 로컬에서 프론트(5173)와 서버(8000)를 따로 띄울 때만 쓴다.
  // .env.local 에 VITE_API_URL=http://127.0.0.1:8000 을 넣으면 된다.
  const override = import.meta.env.VITE_API_URL
  if (override) return override.replace(/\/$/, '') + path

  // JupyterHub 프록시 환경: /user/<id>/proxy/3002/... 로 서빙된다.
  // 이때만 포트를 8000 으로 바꿔 백엔드를 부른다.
  const proxy = window.location.pathname.match(/^(\/user\/[^/]+\/proxy\/)(\d+)/)
  if (proxy) return window.location.origin + proxy[1] + '8000' + path

  return path
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

/**
 * 조건에 맞는 지원사업을 받아온다.
 *
 * notices_folder 를 넘기지 않는다. 넘기면 backend/notices/ 의 **샘플 19건**
 * (형식 참고용 가짜 데이터)을 읽는다. 기본값이 policy_data/notices/ 의
 * 실제 공고 25건이므로 그냥 두면 된다.
 */
export function fetchMatches(userProfile = DEFAULT_PROFILE, deviceId = 'guest') {
  return post('/api/match', { user_profile: userProfile, device_id: deviceId })
}

/** 행정용어 사전 전체. 프론트에 복사본을 두지 말 것 — 원본이 바뀌면 낡는다. */
export async function fetchTerms() {
  const res = await fetch(apiUrl('/api/terms'))
  if (!res.ok) throw new Error(`용어 사전을 불러오지 못했습니다 (${res.status})`)
  return res.json()
}

/** 공고문에 실제로 등장한 용어만. 사전 전체를 프롬프트에 넣으면 토큰 낭비다. */
export function lookupTerms(text, documents = []) {
  return post('/api/terms/lookup', { text, documents })
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
