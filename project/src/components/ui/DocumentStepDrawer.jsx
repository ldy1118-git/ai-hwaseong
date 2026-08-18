import { useState, useEffect } from 'react'
import { apiUrl } from '../../utils/api'

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

async function fetchLlmSteps(docName) {
  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 돕는 든든한 동료예요.
서류 발급 방법을 사장님이 바로 따라할 수 있도록 구체적인 단계로 설명해주세요.
말투는 "~해요", "~하세요" 처럼 친근하게.
JSON 형식으로만 응답: {"steps":["1단계","2단계",...],"fee":"비용","time":"소요시간","tip":"팁(없으면 null)"}`,
      prompt: `"${docName}" 서류를 발급받는 방법을 단계별로 알려주세요.`,
      json: true,
    }),
  })
  const data = await res.json()
  return JSON.parse(data.text)
}

// ── 단계 체크 목록 ─────────────────────────────────────────────
function StepChecklist({ steps, checked, onToggle, color = 'navy' }) {
  if (!steps?.length) return null
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li
          key={i}
          onClick={() => onToggle(i)}
          className="flex gap-3 cursor-pointer group"
        >
          {/* 번호 / 체크 */}
          <span className={[
            'shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all',
            checked[i]
              ? 'bg-navy border-navy text-white'
              : `border-${color}/30 text-${color}/60 group-hover:border-${color}/60`,
          ].join(' ')}>
            {checked[i] ? '✓' : i + 1}
          </span>
          {/* 내용 */}
          <p className={[
            'text-sm pt-1 leading-relaxed transition-colors',
            checked[i] ? 'text-warm-text line-through' : 'text-gray-700',
          ].join(' ')}>
            {step}
          </p>
        </li>
      ))}
    </ol>
  )
}

// ── 메인 드로어 ────────────────────────────────────────────────
export default function DocumentStepDrawer({ item, termsData, onClose, onComplete }) {
  const [tab, setTab]             = useState('online')
  const [stepChecked, setStepChecked] = useState([])   // 현재 탭의 단계 체크 여부
  const [llmData, setLlmData]     = useState(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmError, setLlmError]   = useState('')

  const doc = findDoc(item?.label, termsData)

  const hasOnline  = (doc?.issue?.online?.length  ?? 0) > 0
  const hasOffline = (doc?.issue?.offline?.length ?? 0) > 0

  // 드로어 열릴 때마다 초기화
  useEffect(() => {
    if (!item) return
    const firstTab = hasOnline ? 'online' : hasOffline ? 'offline' : 'llm'
    setTab(firstTab)
    setLlmData(null)
    setLlmError('')
  }, [item?.label])

  // 탭이 바뀌면 단계 체크 초기화
  useEffect(() => {
    const steps = currentSteps()
    setStepChecked(new Array(steps.length).fill(false))
    if (tab === 'llm' && !llmData && !llmLoading) loadLlm()
  }, [tab, llmData])

  function currentSteps() {
    if (tab === 'online')  return doc?.issue?.online  ?? []
    if (tab === 'offline') return doc?.issue?.offline ?? []
    if (tab === 'llm')     return llmData?.steps       ?? []
    return []
  }

  function toggleStep(i) {
    setStepChecked(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  const steps      = currentSteps()
  const allDone    = steps.length > 0 && stepChecked.length === steps.length && stepChecked.every(Boolean)
  const doneCount  = stepChecked.filter(Boolean).length

  async function loadLlm() {
    setLlmLoading(true)
    setLlmError('')
    try {
      const result = await fetchLlmSteps(item.label)
      setLlmData(result)
    } catch {
      setLlmError('마이다가 잠깐 연결이 끊겼어요. 다시 시도해주세요.')
    } finally {
      setLlmLoading(false)
    }
  }

  function handleComplete() {
    onComplete?.(item.id)
    onClose()
  }

  if (!item) return null

  const TABS = [
    hasOnline  && { key: 'online',  label: '🖥 온라인' },
    hasOffline && { key: 'offline', label: '🏢 오프라인' },
    { key: 'llm', label: '🌟 마이다 안내' },
  ].filter(Boolean)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl
                      max-h-[85vh] flex flex-col max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="px-5 pt-3 pb-4 border-b border-warm-gray/20">
          <div className="w-10 h-1 bg-warm-gray/40 rounded-full mx-auto mb-4" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs text-warm-text font-semibold mb-0.5">서류 발급 절차</p>
              <h2 className="text-lg font-bold text-navy">{item.label}</h2>
              {doc?.easy && (
                <p className="text-sm text-warm-text mt-1 leading-relaxed">{doc.easy}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-full bg-warm-gray/20 flex items-center
                         justify-center text-warm-text hover:bg-warm-gray/40 transition-colors"
            >✕</button>
          </div>

          {/* 비용·시간 배지 */}
          {doc?.issue && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {doc.issue.fee  && <span className="text-xs bg-star-yellow/20 text-navy px-2.5 py-1 rounded-full font-medium">💰 {doc.issue.fee}</span>}
              {doc.issue.time && <span className="text-xs bg-navy/10 text-navy px-2.5 py-1 rounded-full font-medium">⏱ {doc.issue.time}</span>}
            </div>
          )}
        </div>

        {/* 탭 + 진행률 */}
        <div className="px-5 border-b border-warm-gray/20">
          <div className="flex">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`py-2.5 px-3 text-xs font-semibold transition-colors border-b-2 -mb-px
                  ${tab === t.key ? 'border-navy text-navy' : 'border-transparent text-warm-text hover:text-navy'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* 단계 진행 바 */}
          {steps.length > 0 && (
            <div className="py-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-warm-gray/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy rounded-full transition-all duration-300"
                  style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-warm-text font-medium shrink-0">
                {doneCount}/{steps.length} 완료
              </span>
            </div>
          )}
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* 온라인 / 오프라인 탭 */}
          {(tab === 'online' || tab === 'offline') && (
            <>
              <StepChecklist
                steps={steps}
                checked={stepChecked}
                onToggle={toggleStep}
                color="navy"
              />
              {tab === 'online' && doc?.issue?.url && (
                <a
                  href={doc.issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                             bg-navy/10 text-navy text-sm font-semibold hover:bg-navy/20 transition-colors"
                >
                  사이트 바로가기 →
                </a>
              )}
            </>
          )}

          {/* 마이다 LLM 안내 탭 */}
          {tab === 'llm' && (
            <>
              {llmLoading && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="flex gap-1">
                    {[0, 0.15, 0.3].map((d, i) => (
                      <span key={i} className="w-2 h-2 rounded-full bg-navy animate-bounce"
                        style={{ animationDelay: `${d}s` }} />
                    ))}
                  </div>
                  <p className="text-sm text-warm-text">마이다가 발급 방법을 찾고 있어요...</p>
                </div>
              )}
              {llmError && (
                <div className="text-center py-6">
                  <p className="text-sm text-warm-text mb-3">{llmError}</p>
                  <button onClick={loadLlm} className="text-xs text-navy underline underline-offset-2">다시 시도</button>
                </div>
              )}
              {llmData && !llmLoading && (
                <>
                  <StepChecklist steps={llmData.steps} checked={stepChecked} onToggle={toggleStep} />
                  {(llmData.fee || llmData.time) && (
                    <div className="flex gap-2 flex-wrap">
                      {llmData.fee  && <span className="text-xs bg-star-yellow/20 text-navy px-2.5 py-1 rounded-full font-medium">💰 {llmData.fee}</span>}
                      {llmData.time && <span className="text-xs bg-navy/10 text-navy px-2.5 py-1 rounded-full font-medium">⏱ {llmData.time}</span>}
                    </div>
                  )}
                  {llmData.tip && (
                    <div className="bg-star-yellow/15 border border-star-yellow/40 rounded-xl p-3">
                      <p className="text-xs font-bold text-navy mb-1">💡 마이다 팁</p>
                      <p className="text-sm text-gray-700">{llmData.tip}</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* 주의·혼동 */}
          {doc?.caution && (
            <div className="bg-sunset-orange/10 border border-sunset-orange/30 rounded-xl p-3">
              <p className="text-xs font-bold text-sunset-orange mb-1">⚠ 주의</p>
              <p className="text-sm text-gray-700">{doc.caution}</p>
            </div>
          )}
          {doc?.confused_with && (
            <div className="bg-warm-gray/10 border border-warm-gray/30 rounded-xl p-3">
              <p className="text-xs font-bold text-warm-text mb-1">⚡ "{doc.confused_with.name}"과 헷갈리지 마세요</p>
              <p className="text-sm text-gray-700">{doc.confused_with.why}</p>
            </div>
          )}

          {/* 여백 (완료 버튼이 가리지 않도록) */}
          <div className="h-4" />
        </div>

        {/* 완료 버튼 — 항상 하단 고정 */}
        <div className="px-5 py-4 border-t border-warm-gray/20 bg-white">
          <button
            onClick={handleComplete}
            disabled={!allDone}
            className={[
              'w-full py-3.5 rounded-2xl text-sm font-bold transition-all duration-300',
              allDone
                ? 'bg-navy text-white shadow-lg shadow-navy/30 scale-100'
                : 'bg-warm-gray/20 text-warm-text cursor-not-allowed',
            ].join(' ')}
          >
            {allDone
              ? '✅ 서류 준비 완료! 체크리스트에 표시할게요'
              : `단계를 순서대로 완료해주세요 (${doneCount}/${steps.length})`}
          </button>
        </div>
      </div>
    </>
  )
}
