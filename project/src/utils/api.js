// JupyterHub 프록시 환경에서 포트만 교체해 API URL을 동적으로 결정
function getApiBase() {
  const proxyMatch = window.location.pathname.match(/^(\/user\/[^/]+\/proxy\/)(\d+)/)
  if (proxyMatch) {
    return window.location.origin + proxyMatch[1] + '8000'
  }
  return import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
}

async function post(path, body) {
  const res = await fetch(getApiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

// 기본 사용자 프로필 (온보딩 완료 전 fallback)
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

export function fetchMatches(userProfile = DEFAULT_PROFILE, deviceId = 'guest') {
  return post('/api/match', {
    user_profile: userProfile,
    device_id: deviceId,
    notices_folder: 'notices',
  })
}

export function loadUser(deviceId) {
  return post('/api/user/load', { device_id: deviceId })
}

export function saveUser(deviceId, profile, chatHistory = null) {
  return post('/api/user/save', { device_id: deviceId, profile, chat_history: chatHistory })
}
