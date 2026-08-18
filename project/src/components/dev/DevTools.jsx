import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiUrl } from '../../utils/api'

const PAGES = [
  { path: '/',          label: 'Landing',          emoji: '🏠' },
  { path: '/auth',      label: 'Auth',             emoji: '🔑' },
  { path: '/onboarding',label: 'Onboarding',       emoji: '🪄' },
  { path: '/home',      label: 'Home (대시보드)',   emoji: '📊' },
  { path: '/notice',    label: 'NoticeDetail',     emoji: '📄' },
  { path: '/apply',     label: 'ApplicationGuide', emoji: '📋' },
  { path: '/mission',   label: 'MissionControl',   emoji: '🌟' },
]

// ── API 상태 탭 ────────────────────────────────────────────────
function ApiStatus() {
  const [statuses, setStatuses] = useState({
    health: null,  // null | 'ok' | 'fail'
    llm:    null,
  })
  const [checking, setChecking] = useState(false)

  async function checkAll() {
    setChecking(true)
    setStatuses({ health: null, llm: null })

    // /api/health
    try {
      const r = await fetch(apiUrl('/api/health'), { signal: AbortSignal.timeout(5000) })
      setStatuses(s => ({ ...s, health: r.ok ? 'ok' : 'fail' }))
    } catch {
      setStatuses(s => ({ ...s, health: 'fail' }))
    }

    // /api/llm (ping)
    try {
      const r = await fetch(apiUrl('/api/llm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'ping', system: '한 단어로만 답해', json: false }),
        signal: AbortSignal.timeout(15000),
      })
      setStatuses(s => ({ ...s, llm: r.ok ? 'ok' : 'fail' }))
    } catch {
      setStatuses(s => ({ ...s, llm: 'fail' }))
    }

    setChecking(false)
  }

  function Dot({ status }) {
    const color = status === null ? 'bg-warm-gray' : status === 'ok' ? 'bg-green-400' : 'bg-red-400'
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} shrink-0`} />
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 text-sm">
        {[
          { key: 'health', label: '/api/health  (매칭 서버)' },
          { key: 'llm',    label: '/api/llm  (Gemini)' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <Dot status={statuses[key]} />
            <span className="text-warm-text font-mono text-xs">{label}</span>
            {statuses[key] === 'ok'   && <span className="ml-auto text-green-600 text-xs font-semibold">OK</span>}
            {statuses[key] === 'fail' && <span className="ml-auto text-red-500 text-xs font-semibold">FAIL</span>}
          </div>
        ))}
      </div>
      <button
        onClick={checkAll}
        disabled={checking}
        className="w-full py-1.5 rounded-lg bg-navy text-white text-xs font-semibold
                   hover:bg-navy/80 disabled:opacity-50 transition-colors"
      >
        {checking ? '확인 중...' : '상태 확인'}
      </button>
    </div>
  )
}

// ── LLM 테스트 탭 ──────────────────────────────────────────────
function LlmTest() {
  const [prompt, setPrompt]   = useState('')
  const [system, setSystem]   = useState('당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 돕는 든든한 동료예요. ~해요 말투로 답합니다.')
  const [response, setResponse] = useState('')
  const [loading, setLoading]   = useState(false)
  const [elapsed, setElapsed]   = useState(null)

  async function run() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setResponse('')
    setElapsed(null)
    const t0 = Date.now()
    try {
      const r = await fetch(apiUrl('/api/llm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system, json: false }),
      })
      const data = await r.json()
      setResponse(data.text ?? data.error ?? JSON.stringify(data))
    } catch (e) {
      setResponse(`오류: ${e.message}`)
    } finally {
      setElapsed(((Date.now() - t0) / 1000).toFixed(1))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs text-warm-text font-semibold">시스템 프롬프트</label>
      <textarea
        value={system}
        onChange={e => setSystem(e.target.value)}
        rows={2}
        className="w-full text-xs border border-warm-gray/40 rounded-lg px-2 py-1.5
                   resize-none focus:outline-none focus:border-navy/50 font-mono"
      />
      <label className="block text-xs text-warm-text font-semibold">프롬프트</label>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) run() }}
        rows={2}
        placeholder="질문 입력 후 전송..."
        className="w-full text-xs border border-warm-gray/40 rounded-lg px-2 py-1.5
                   resize-none focus:outline-none focus:border-navy/50"
      />
      <button
        onClick={run}
        disabled={loading || !prompt.trim()}
        className="w-full py-1.5 rounded-lg bg-sunset-orange text-white text-xs font-semibold
                   hover:bg-sunset-orange/80 disabled:opacity-50 transition-colors"
      >
        {loading ? '생각 중...' : '전송 (⌘Enter)'}
      </button>
      {response && (
        <div className="bg-gray-50 border border-warm-gray/30 rounded-lg p-2 text-xs
                        text-gray-800 whitespace-pre-wrap max-h-40 overflow-y-auto">
          {response}
          {elapsed && (
            <div className="text-warm-text mt-1 text-right">{elapsed}s</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 프로필 전환 탭 ────────────────────────────────────────────
const MOCK_PROFILES = [
  {
    label: '사업자 (운영중)',
    emoji: '🏪',
    profile: {
      path: 'C',
      business_status: '운영중',
      category: '카페',
      region: '화성시',
      age: 38,
      business_period_months: 24,
      career: '직원 경험 있음',
      asset: '3000만원 미만',
      marital: '기혼',
      parents: false,
    },
  },
  {
    label: '예비 창업자',
    emoji: '🚀',
    profile: {
      path: 'B',
      business_status: '준비중',
      category: '음식점',
      region: '화성시',
      age: 32,
      career: '무경험',
      asset: '5000만원 이상',
      marital: '미혼',
      parents: false,
    },
  },
  {
    label: '탐색자',
    emoji: '🔍',
    profile: {
      path: 'A',
      region: '화성시',
      age: 45,
      career: '직원 경험 있음',
      asset: '3000만원 미만',
      marital: '기혼',
      parents: true,
    },
  },
]

function ProfileSwitcher() {
  const navigate = useNavigate()

  function apply(profile) {
    localStorage.setItem('mars-fit-profile', JSON.stringify(profile))
    navigate('/home')
  }

  const current = (() => {
    try { return JSON.parse(localStorage.getItem('mars-fit-profile') ?? 'null') } catch { return null }
  })()

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-warm-text font-semibold uppercase tracking-wide">유형 전환 (Home 이동)</p>
      {MOCK_PROFILES.map(m => {
        const isActive =
          current?.business_status === m.profile.business_status &&
          current?.path === m.profile.path
        return (
          <button
            key={m.label}
            onClick={() => apply(m.profile)}
            className={[
              'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition-colors border-2',
              isActive
                ? 'border-navy bg-navy text-white font-bold'
                : 'border-warm-gray/30 hover:border-navy/40 text-navy',
            ].join(' ')}
          >
            <span className="text-base flex-shrink-0">{m.emoji}</span>
            <span className="font-semibold flex-1">{m.label}</span>
            {isActive && <span className="text-[10px] opacity-70">현재</span>}
          </button>
        )
      })}
      {current && (
        <div className="mt-2 bg-gray-50 rounded-lg p-2 font-mono text-[10px] text-warm-text break-all max-h-28 overflow-y-auto">
          {JSON.stringify(current, null, 2)}
        </div>
      )}
    </div>
  )
}

// ── 메인 DevTools ──────────────────────────────────────────────
const TABS = ['페이지', '프로필', 'API', 'LLM']

export default function DevTools() {
  const [open, setOpen]   = useState(false)
  const [tab, setTab]     = useState(0)
  const navigate          = useNavigate()
  const location          = useLocation()

  return (
    <div className="fixed top-3 right-3 z-[9999] flex flex-col items-end gap-1">
      {/* 토글 버튼 */}
      <button
        onClick={() => setOpen(o => !o)}
        title="개발자 도구"
        className="w-9 h-9 rounded-full bg-navy shadow-lg flex items-center justify-center
                   text-white text-base hover:bg-navy/80 transition-colors"
      >
        {open ? '✕' : '🛠'}
      </button>

      {/* 패널 */}
      {open && (
        <div className="w-72 bg-white border border-warm-gray/30 rounded-2xl shadow-2xl
                        flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="bg-navy px-4 py-2.5 flex items-center justify-between">
            <span className="text-white text-xs font-bold tracking-wide">🛠 DEV TOOLS</span>
            <span className="text-warm-gray text-xs font-mono">{location.pathname}</span>
          </div>

          {/* 탭 */}
          <div className="flex border-b border-warm-gray/20">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`flex-1 py-2 text-xs font-semibold transition-colors
                  ${tab === i
                    ? 'text-navy border-b-2 border-navy -mb-px'
                    : 'text-warm-text hover:text-navy'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="p-3 overflow-y-auto max-h-[60vh]">

            {/* 페이지 네비게이션 */}
            {tab === 0 && (
              <div className="space-y-1">
                {PAGES.map(p => (
                  <button
                    key={p.path}
                    onClick={() => navigate(p.path)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
                      text-xs transition-colors
                      ${location.pathname === p.path
                        ? 'bg-navy text-white font-semibold'
                        : 'hover:bg-primary-bg text-navy'}`}
                  >
                    <span>{p.emoji}</span>
                    <span className="font-mono">{p.path}</span>
                    <span className="ml-auto text-warm-text text-[10px]">{p.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 프로필 전환 */}
            {tab === 1 && <ProfileSwitcher />}

            {/* API 상태 */}
            {tab === 2 && <ApiStatus />}

            {/* LLM 테스트 */}
            {tab === 3 && <LlmTest />}
          </div>
        </div>
      )}
    </div>
  )
}
