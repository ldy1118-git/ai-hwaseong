import { useState, useEffect } from 'react'
import { apiUrl } from '../../utils/api'
import { getSiteInfo } from './SiteLaunchSheet'
import marsImg from '../../../design/mars.png'

async function fetchApplySteps(programName, applyMethod, hasUrl) {
  const methodCtx = applyMethod ? `\n접수 방법: ${applyMethod}` : ''
  const urlCtx = hasUrl
    ? '\n오른쪽 화면에 신청 사이트가 열려 있어요. 별도로 찾아갈 필요 없이 오른쪽 화면 기준으로 안내해주세요.'
    : '\n온라인 신청 링크가 없어요. 방문 또는 이메일 접수 기준으로 안내해주세요.'

  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 돕는 든든한 동료예요.
서류 준비까지 완료한 사장님이 지원사업을 실제로 신청 접수하는 과정을 단계별로 안내해주세요.
서류 준비 과정은 이미 끝났으니 포함하지 마세요. 신청서 작성·제출·접수 확인 과정만 안내하세요.
말투는 "~해요", "~하세요"처럼 친근하게.
JSON 형식으로만 응답: {"steps":["1단계","2단계",...],"tip":"신청 시 꼭 알아야 할 팁(없으면 null)"}`,
      prompt: `"${programName}" 지원사업 신청 접수 방법을 단계별로 알려주세요.${methodCtx}${urlCtx}`,
      json: true,
    }),
  })
  const data = await res.json()
  return JSON.parse(data.text)
}

export default function ApplyStepDrawer({ program, onClose, onComplete }) {
  const [stepChecked, setStepChecked] = useState([])
  const [llmData,     setLlmData]     = useState(null)
  const [llmLoading,  setLlmLoading]  = useState(false)
  const [llmError,    setLlmError]    = useState('')
  const [iframeState, setIframeState] = useState('loading')
  const [applied,     setApplied]     = useState(false)

  const applyUrl = program?.apply_url ?? null
  const site     = applyUrl ? getSiteInfo(applyUrl) : null

  useEffect(() => {
    if (!program) return
    setLlmData(null)
    setLlmError('')
    setStepChecked([])
    setIframeState('loading')
    setApplied(false)
    loadLlm()
  }, [program?.notice_id])

  useEffect(() => {
    setStepChecked(new Array(llmData?.steps?.length ?? 0).fill(false))
  }, [llmData?.steps?.length])

  async function loadLlm() {
    setLlmLoading(true)
    setLlmError('')
    try {
      const result = await fetchApplySteps(
        program.notice_title,
        program.apply_method,
        !!program.apply_url,
      )
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
    setApplied(true)
    onComplete?.()
  }

  function openNewWindow(url) {
    const sidebarW = Math.max(window.innerWidth * 0.25, 200)
    window.open(url, '_blank',
      `width=${window.innerWidth - sidebarW},height=${window.innerHeight},` +
      `left=${window.screenX + sidebarW},top=${window.screenY},noopener,noreferrer`)
  }

  function handleIframeLoad(e) {
    try {
      const href = e.target.contentWindow.location.href
      if (!href || href === 'about:blank' || href.startsWith('chrome-error://')) {
        setIframeState('blocked')
      } else {
        setIframeState('loaded')
      }
    } catch {
      setIframeState('loaded')
    }
  }

  if (!program) return null

  const steps     = llmData?.steps ?? []
  const doneCount = stepChecked.filter(Boolean).length
  const allDone   = steps.length > 0 && doneCount === steps.length

  const periodText = (() => {
    const p = program?.apply_period ?? {}
    if (p.start || p.end) return `${p.start ?? '?'} ~ ${p.end ?? '?'}`
    if (p.note) return p.note
    return null
  })()

  return (
    <div className="fixed inset-0 z-50 flex">
      <style>{`
        @keyframes slideInLeft { from { transform: translateX(-100%) } to { transform: translateX(0) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        @keyframes popIn { from { opacity:0; transform:scale(0.85) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes confetti { from { opacity:0; transform:scale(0.7) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `}</style>

      {/* LEFT: 마이다 안내 사이드바 */}
      <div className="w-1/4 min-w-[200px] h-full bg-white shadow-2xl flex flex-col"
           style={{ animation: 'slideInLeft 0.25s ease' }}>

        {/* 헤더 */}
        <div className="bg-navy px-4 py-4 flex-shrink-0">
          <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1">🚀 신청 동행</p>
          <h2 className="text-white text-sm font-bold leading-snug line-clamp-3">{program.notice_title}</h2>
          <div className="flex flex-col gap-1 mt-2">
            {program.apply_method && (
              <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full self-start">
                📬 {program.apply_method}
              </span>
            )}
            {periodText && (
              <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full self-start">
                📅 {periodText}
              </span>
            )}
          </div>
        </div>

        {/* 신청 완료 화면 */}
        {applied ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4"
               style={{ animation: 'confetti 0.4s ease' }}>
            <div className="text-5xl">🎉</div>
            <div className="text-center">
              <p className="text-base font-bold text-navy">신청 완료!</p>
              <p className="text-xs text-warm-text mt-1.5 leading-relaxed">
                마이다가 결과를 응원할게요.<br />결과는 공고 문의처로 확인하세요.
              </p>
            </div>
            {program.contact && (
              <div className="w-full bg-primary-bg rounded-xl px-3 py-2.5 text-xs text-warm-text">
                <span className="font-semibold text-navy">📞 문의처</span>
                <p className="mt-0.5">{program.contact}</p>
              </div>
            )}
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-navy text-white text-xs font-bold">
              닫기
            </button>
          </div>
        ) : (
          <>
            {/* 체크리스트 */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {llmLoading && (
                <div className="space-y-4 animate-pulse">
                  {[1,2,3,4,5].map(i => (
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
                <>
                  <ol className="space-y-3.5">
                    {steps.map((step, i) => (
                      <li key={i} onClick={() => toggleStep(i)}
                          className="flex gap-2.5 cursor-pointer group">
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
                  {llmData?.tip && (
                    <div className="mt-4 bg-sunset-orange/10 border border-sunset-orange/20 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] font-bold text-sunset-orange mb-0.5">💡 마이다 팁</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{llmData.tip}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 진행바 + 완료 버튼 */}
            <div className="px-4 py-4 border-t border-warm-gray/20 flex-shrink-0 space-y-3">
              {steps.length > 0 && (
                <div>
                  <div className="h-1.5 bg-warm-gray/20 rounded-full overflow-hidden">
                    <div className="h-full bg-navy rounded-full transition-all duration-300"
                         style={{ width: `${(doneCount / steps.length) * 100}%` }} />
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
                {allDone ? '🎉 신청 완료!' : '단계를 완료해주세요'}
              </button>
              <button onClick={onClose}
                className="w-full py-2 rounded-xl bg-warm-gray/15 text-warm-text text-xs font-medium">
                닫기
              </button>
            </div>
          </>
        )}
      </div>

      {/* RIGHT: 신청 사이트 영역 */}
      <div className="flex-1 flex flex-col bg-gray-50" style={{ animation: 'fadeIn 0.25s ease' }}>
        {applyUrl && site ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-warm-gray/20 flex-shrink-0 shadow-sm">
              <span className="text-lg">{site.emoji}</span>
              <span className="text-sm font-bold text-navy">{site.name}</span>
              <span className="text-xs text-warm-text truncate hidden sm:block">— {program.notice_title}</span>
              <button
                onClick={() => openNewWindow(applyUrl)}
                className="ml-auto text-xs text-navy font-semibold px-3 py-1.5 rounded-lg bg-navy/8 hover:bg-navy/15 transition-colors flex-shrink-0"
              >
                새 창으로 열기 ↗
              </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
              {iframeState !== 'blocked' && (
                <iframe
                  key={applyUrl}
                  src={applyUrl}
                  title={site.name}
                  className="absolute inset-0 w-full h-full border-none"
                  onLoad={handleIframeLoad}
                  onError={() => setIframeState('blocked')}
                />
              )}

              {iframeState === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                  <span className="w-9 h-9 rounded-full border-4 border-warm-gray/30 border-t-navy animate-spin" />
                  <p className="text-xs text-warm-text">{site.name} 불러오는 중...</p>
                </div>
              )}

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
                    onClick={() => openNewWindow(applyUrl)}
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
          /* URL 없음 — 오프라인/방문 안내 */
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6"
               style={{ animation: 'popIn 0.3s ease' }}>
            <div className="flex flex-col items-center gap-2">
              <div className="relative bg-white rounded-2xl border border-warm-gray/30 px-5 py-4 shadow-md text-center max-w-xs">
                <p className="text-sm text-navy font-medium leading-relaxed">
                  이 사업은 온라인 신청 대신<br />
                  {program.apply_method
                    ? `${program.apply_method}으로 접수해요.`
                    : '직접 방문하거나 문의처로 접수해요.'}<br />
                  왼쪽 단계를 따라 하나씩 준비해봐요! 💪
                </p>
                <span className="absolute" style={{
                  bottom: '-10px', left: '50%', transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '10px solid transparent', borderRight: '10px solid transparent',
                  borderTop: '10px solid #D1D5DB',
                }} />
                <span className="absolute" style={{
                  bottom: '-8px', left: '50%', transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '9px solid transparent', borderRight: '9px solid transparent',
                  borderTop: '9px solid white',
                }} />
              </div>
              <img src={marsImg} alt="마이다" className="object-contain drop-shadow-lg"
                   style={{ width: '240px', height: '240px', animation: 'float 3s ease-in-out infinite' }} />
            </div>

            {/* 문의처/기간 카드 */}
            {(program.contact || periodText) && (
              <div className="w-full max-w-sm bg-white rounded-2xl border border-warm-gray/20 shadow px-5 py-4 space-y-3">
                {periodText && (
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-warm-text w-16 shrink-0 pt-0.5">📅 기간</span>
                    <span className="text-sm text-navy font-medium">{periodText}</span>
                  </div>
                )}
                {program.contact && (
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-warm-text w-16 shrink-0 pt-0.5">📞 문의처</span>
                    <span className="text-sm text-navy font-medium">{program.contact}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
