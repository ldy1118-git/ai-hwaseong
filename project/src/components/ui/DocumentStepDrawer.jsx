import { useState, useEffect } from 'react'
import { apiUrl } from '../../utils/api'
import { getSiteInfo } from './SiteLaunchSheet'
import marsImg from '../../../design/mars.png'
const cheerImg = marsImg  // cheer.png 추가되면 교체

function findDoc(name, termsData) {
  if (!name || !termsData?.documents) return null
  const q = name.replace(/\s/g, '').toLowerCase()
  return termsData.documents.find(d =>
    [d.name, ...(d.aliases || [])].some(c =>
      c.replace(/\s/g, '').toLowerCase().includes(q) ||
      q.includes(c.replace(/\s/g, '').toLowerCase())
    )
  ) ?? null
}

async function fetchLlmSteps(docName, issueUrl) {
  const site = issueUrl ? getSiteInfo(issueUrl) : null
  const siteContext = site
    ? `\n준비 사이트: ${site.name} (${issueUrl})\n화면 오른쪽에 이미 이 사이트가 열려 있어요. 별도로 사이트를 찾아갈 필요 없이, 오른쪽 화면 기준으로 단계를 안내해주세요.`
    : ''

  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 돕는 든든한 동료예요.
서류를 발급받거나 양식을 다운로드하는 방법을 사장님이 바로 따라할 수 있도록 구체적인 단계로 설명해주세요.
준비 사이트가 주어진 경우, 그 사이트 기준으로 어디서 무엇을 눌러야 하는지 구체적으로 안내해주세요. "사이트에 접속해요" 같은 단계는 쓰지 마세요 — 이미 열려 있으니까요.
중요: 서류를 제출하거나 신청을 완료하는 단계는 절대 포함하지 마세요. 서류를 발급·다운로드·작성하는 것까지만 안내하세요. 제출·신청은 별도 절차에서 진행됩니다.
말투는 "~해요", "~하세요" 처럼 친근하게.
JSON 형식으로만 응답: {"steps":["1단계","2단계",...],"fee":"비용(없으면 null)","time":"소요시간(없으면 null)","tip":"팁(없으면 null)"}`,
      prompt: `"${docName}" 서류를 준비하는 방법을 단계별로 알려주세요.${siteContext}`,
      json: true,
    }),
  })
  const data = await res.json()
  return JSON.parse(data.text)
}

// 신청서·양식 계열 서류 — 공고 신청 페이지에서 다운받아야 하는 것들
const FORM_KEYWORDS = ['신청서', '사업계획서', '개인정보', '동의서', '계획서', '견적서']

function isFormDoc(label) {
  return FORM_KEYWORDS.some(k => label?.includes(k))
}

export default function DocumentStepDrawer({ item, termsData, applyUrl, onClose, onComplete }) {
  const [stepChecked, setStepChecked] = useState([])
  const [llmData, setLlmData]         = useState(null)
  const [llmLoading, setLlmLoading]   = useState(false)
  const [llmError, setLlmError]       = useState('')
  const [iframeState, setIframeState] = useState('loading') // 'loading' | 'loaded' | 'blocked'

  const doc      = findDoc(item?.label, termsData)
  const issueUrl = doc?.issue?.url ?? (isFormDoc(item?.label) ? (applyUrl ?? null) : null)
  const fee      = doc?.issue?.fee  || llmData?.fee  || null
  const time     = doc?.issue?.time || llmData?.time || null

  useEffect(() => {
    if (!item) return
    setLlmData(null)
    setLlmError('')
    setStepChecked([])
    setIframeState('loading')
    loadLlm()
  }, [item?.label])

  function handleIframeLoad(e) {
    try {
      const href = e.target.contentWindow.location.href
      // X-Frame-Options 차단 시 about:blank 또는 chrome-error:// 로 남는다
      if (!href || href === 'about:blank' || href.startsWith('chrome-error://')) {
        setIframeState('blocked')
      } else {
        setIframeState('loaded')
      }
    } catch {
      // SecurityError = 크로스오리진이지만 정상적으로 로드됨
      setIframeState('loaded')
    }
  }

  function openNewWindow(url) {
    const sidebarW = Math.max(window.innerWidth * 0.25, 200)
    const w    = window.innerWidth - sidebarW
    const h    = window.innerHeight
    const left = window.screenX + sidebarW
    const top  = window.screenY
    window.open(url, '_blank', `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`)
  }

  useEffect(() => {
    setStepChecked(new Array(llmData?.steps?.length ?? 0).fill(false))
  }, [llmData?.steps?.length])

  async function loadLlm() {
    setLlmLoading(true)
    setLlmError('')
    try {
      const result = await fetchLlmSteps(item.label, issueUrl)
      setLlmData(result)
    } catch {
      setLlmError('마이다가 잠깐 연결이 끊겼어요.')
    } finally {
      setLlmLoading(false)
    }
  }

  function toggleStep(i) {
    setStepChecked(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  function handleComplete() {
    onComplete?.(item.id)
    onClose()
  }

  if (!item) return null

  const steps     = llmData?.steps ?? []
  const doneCount = stepChecked.filter(Boolean).length
  const allDone   = steps.length > 0 && doneCount === steps.length
  const site      = issueUrl ? getSiteInfo(issueUrl) : null

  return (
    <div className="fixed inset-0 z-50 flex">

      {/* LEFT: 마이다 안내 사이드바 (1/4) */}
      <div
        className="w-1/4 min-w-[200px] h-full bg-white shadow-2xl flex flex-col"
        style={{ animation: 'slideInLeft 0.25s ease' }}
      >
        <style>{`
          @keyframes slideInLeft { from { transform: translateX(-100%) } to { transform: translateX(0) } }
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
          @keyframes popIn { from { opacity:0; transform:scale(0.85) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
        `}</style>

        {/* 사이드바 헤더 */}
        <div className="bg-navy px-4 py-4 flex-shrink-0">
          <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1">✨ 마이다 안내</p>
          <h2 className="text-white text-sm font-bold leading-snug">{item.label}</h2>
          {(fee || time) && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {fee  && <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">💰 {fee}</span>}
              {time && <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">⏱ {time}</span>}
            </div>
          )}
        </div>

        {/* 체크리스트 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {llmLoading && (
            <div className="space-y-4 animate-pulse">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-warm-gray/30 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="h-2 bg-warm-gray/30 rounded-full" />
                    <div className="h-2 bg-warm-gray/20 rounded-full w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {llmError && (
            <div className="text-center py-6">
              <p className="text-xs text-warm-text mb-2">{llmError}</p>
              <button onClick={loadLlm} className="text-xs text-navy underline">다시 시도</button>
            </div>
          )}

          {!llmLoading && !llmError && steps.length > 0 && (
            <ol className="space-y-3.5">
              {steps.map((step, i) => (
                <li key={i} onClick={() => toggleStep(i)} className="flex gap-2.5 cursor-pointer group">
                  <span className={[
                    'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all mt-0.5',
                    stepChecked[i]
                      ? 'bg-navy border-navy text-white'
                      : 'border-navy/30 text-navy/50 group-hover:border-navy/70',
                  ].join(' ')}>
                    {stepChecked[i] ? '✓' : i + 1}
                  </span>
                  <p className={[
                    'text-xs leading-relaxed transition-colors pt-0.5',
                    stepChecked[i] ? 'text-warm-text/60 line-through' : 'text-gray-700',
                  ].join(' ')}>
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* 진행바 + 완료 버튼 */}
        <div className="px-4 py-4 border-t border-warm-gray/20 flex-shrink-0 space-y-3">
          {steps.length > 0 && (
            <div>
              <div className="h-1.5 bg-warm-gray/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy rounded-full transition-all duration-300"
                  style={{ width: `${(doneCount / steps.length) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-warm-text text-right mt-1">{doneCount}/{steps.length} 완료</p>
            </div>
          )}
          <button
            onClick={handleComplete}
            disabled={!allDone}
            className={[
              'w-full py-2.5 rounded-xl text-xs font-bold transition-all',
              allDone
                ? 'bg-navy text-white shadow-md'
                : 'bg-warm-gray/20 text-warm-text cursor-not-allowed',
            ].join(' ')}
          >
            {allDone ? '✅ 준비 완료!' : '단계를 완료해주세요'}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl bg-warm-gray/15 text-warm-text text-xs font-medium"
          >
            닫기
          </button>
        </div>
      </div>

      {/* RIGHT: iframe 영역 (3/4) */}
      <div className="flex-1 flex flex-col bg-gray-50" style={{ animation: 'fadeIn 0.25s ease' }}>
        {site ? (
          <>
            {/* 상단 바 */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-warm-gray/20 flex-shrink-0 shadow-sm">
              <span className="text-lg">{site.emoji}</span>
              <span className="text-sm font-bold text-navy">{site.name}</span>
              <span className="text-xs text-warm-text truncate hidden sm:block">— {item.label}</span>
              <button
                onClick={() => openNewWindow(issueUrl)}
                className="ml-auto text-xs text-navy font-semibold px-3 py-1.5 rounded-lg bg-navy/8 hover:bg-navy/15 transition-colors flex-shrink-0"
              >
                새 창으로 열기 ↗
              </button>
            </div>

            {/* iframe + 상태 오버레이 */}
            <div className="flex-1 relative overflow-hidden">

              {/* iframe — blocked일 때는 렌더 안 함 */}
              {iframeState !== 'blocked' && (
                <iframe
                  key={issueUrl}
                  src={issueUrl}
                  title={site.name}
                  className="absolute inset-0 w-full h-full border-none"
                  onLoad={handleIframeLoad}
                  onError={() => setIframeState('blocked')}
                />
              )}

              {/* 로딩 중 */}
              {iframeState === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                  <span className="w-9 h-9 rounded-full border-4 border-warm-gray/30 border-t-navy animate-spin" />
                  <p className="text-xs text-warm-text">{site.name} 불러오는 중...</p>
                </div>
              )}

              {/* 차단됨 — 폴백 */}
              {iframeState === 'blocked' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 bg-white">
                  <span className="text-5xl">🔒</span>
                  <p className="text-sm font-bold text-navy text-center leading-relaxed">
                    {site.name}에서<br />이 화면 안에서 열기를 허용하지 않아요
                  </p>
                  <p className="text-xs text-warm-text text-center leading-relaxed">
                    보안 정책 때문이에요.<br />
                    왼쪽 체크리스트를 확인하고 새 창에서 진행해주세요.
                  </p>
                  <button
                    onClick={() => openNewWindow(issueUrl)}
                    className="px-6 py-3 rounded-2xl bg-navy text-white text-sm font-bold
                               hover:bg-navy/90 active:scale-[0.98] transition-all shadow-lg"
                  >
                    {site.name} 새 창으로 열기 →
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-b from-blue-50/40 to-white">
            <div className="flex flex-col items-center gap-2" style={{ animation: 'popIn 0.3s ease' }}>

              {/* 말풍선 */}
              <div className="relative bg-white rounded-2xl border border-warm-gray/30 px-5 py-4 shadow-md text-center max-w-xs">
                <p className="text-sm text-navy font-medium leading-relaxed">
                  이 서류는 온라인 발급 대신<br />직접 준비해야 해요.<br />
                  왼쪽 체크리스트 단계를 따라<br />하나씩 해결해봐요! 💪
                </p>
                {/* 말풍선 꼬리 — 아래 방향, 테두리 */}
                <span className="absolute" style={{
                  bottom: '-10px', left: '50%', transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '10px solid transparent',
                  borderRight: '10px solid transparent',
                  borderTop: '10px solid #D1D5DB',
                }} />
                {/* 말풍선 꼬리 — 흰색 채움 */}
                <span className="absolute" style={{
                  bottom: '-8px', left: '50%', transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '9px solid transparent',
                  borderRight: '9px solid transparent',
                  borderTop: '9px solid white',
                }} />
              </div>

              {/* 마이다 캐릭터 */}
              <img
                src={cheerImg}
                alt="마이다"
                className="object-contain drop-shadow-lg"
                style={{ width: '288px', height: '288px', animation: 'float 3s ease-in-out infinite' }}
              />
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
