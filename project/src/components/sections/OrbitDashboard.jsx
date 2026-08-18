import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../ui/Card'
import { fetchMatches, DEFAULT_PROFILE } from '../../utils/api'
import { generateText, GROQ_MODEL } from '../../utils/llm/llmProvider'
import findImg from '../../../design/find.png'

// API 키는 서버에만 둔다. VITE_ 환경변수는 빌드 결과물에 그대로 박혀서
// 배포하면 누구나 꺼낼 수 있다. LLM 호출은 llmProvider 가 /api/llm 으로 넘긴다.
const GEMINI_KEY = null

function calcDDay(endDate) {
  if (!endDate) return null
  return Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24))
}

const STATUS_STYLE = {
  '신청가능': 'text-emerald-600 bg-emerald-50',
  '조건부':   'text-sunset-orange bg-sunset-orange/10',
  '확인필요': 'text-warm-text bg-warm-gray/20',
}

async function generateCardDesc(title) {
  const text = await generateText({
    model:   GROQ_MODEL,
    jsonMode: true,
    userPrompt: `소상공인 지원사업 공고명: "${title}"

아래 JSON 형식으로만 답해주세요. 다른 텍스트 없이 JSON만 출력하세요.
{
  "easy_desc": "사장님이 바로 이해할 수 있는 한 문장 쉬운 설명 (어떤 목적의 지원인지)",
  "support": "지원받을 수 있는 내용 (교육, 컨설팅, 임차료 지원 등 종류 위주로 간결하게)"
}`,
  })
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(cleaned)
}

// 매칭 점수 바
function ScoreBar({ score, color }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 bg-warm-gray/20 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color === 'orange' ? 'bg-sunset-orange' : 'bg-navy'}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[11px] text-warm-text font-medium flex-shrink-0">매칭 {score}%</span>
    </div>
  )
}

// 스켈레톤 줄
function SkeletonLine({ w = 'w-full', h = 'h-3' }) {
  return <div className={`${w} ${h} bg-warm-gray/20 rounded animate-pulse`} />
}

const COND_STYLE = {
  '충족':    { dot: 'bg-emerald-400', text: 'text-emerald-600', icon: '✓' },
  '불충족':  { dot: 'bg-red-400',     text: 'text-red-500',     icon: '✕' },
  '확인필요':{ dot: 'bg-sunset-orange', text: 'text-sunset-orange', icon: '?' },
}

function ProgramCard({ item, accent, onDetail }) {
  const [showReason, setShowReason] = useState(false)
  const [easyDesc, setEasyDesc]     = useState('')
  const [support, setSupport]       = useState('')
  const [descLoading, setDescLoading] = useState(true)
  const isUrgent = accent === 'orange'

  useEffect(() => {
    generateCardDesc(item.title)
      .then(d => { setEasyDesc(d.easy_desc ?? ''); setSupport(d.support ?? '') })
      .catch(err => console.error('[desc]', item.title, err))
      .finally(() => setDescLoading(false))
  }, [item.id])

  const conditions = (item.raw?.condition_results ?? []).filter(c => c.status !== '대상아님')

  return (
    <Card padding="md" className={`border-l-4 ${isUrgent ? 'border-l-sunset-orange' : 'border-l-navy'}`}>

      {/* 상단: 상태 배지 + D-Day */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${STATUS_STYLE[item.status] ?? 'text-warm-text bg-warm-gray/20'}`}>
          {item.status}
        </span>
        {item.dDay !== null && (
          <span className={`text-sm font-bold ${isUrgent ? 'text-sunset-orange' : 'text-navy'}`}>
            D-{item.dDay}
          </span>
        )}
      </div>

      {/* 정책명 */}
      <p className="text-sm font-bold text-navy leading-snug line-clamp-2">{item.title}</p>

      {/* 정책 쉬운 설명 */}
      <div className="mt-1.5">
        {descLoading
          ? <SkeletonLine w="w-full" h="h-3" />
          : easyDesc
            ? <p className="text-xs text-warm-text leading-relaxed line-clamp-2">{easyDesc}</p>
            : null
        }
      </div>

      {/* 지원 내용 */}
      <div className="mt-2">
        {descLoading ? (
          <div className="bg-warm-gray/10 rounded-xl px-3 py-2 space-y-1.5">
            <SkeletonLine w="w-2/3" h="h-2.5" />
            <SkeletonLine w="w-full" h="h-2.5" />
          </div>
        ) : support ? (
          <div className={`rounded-xl px-3 py-2 ${isUrgent ? 'bg-sunset-orange/10' : 'bg-navy/5'}`}>
            <p className="text-[10px] font-bold text-warm-text mb-0.5">지원 내용</p>
            <p className="text-xs text-navy leading-relaxed">{support}</p>
          </div>
        ) : null}
      </div>

      {/* 매칭 점수 바 */}
      <ScoreBar score={item.score} color={isUrgent ? 'orange' : 'navy'} />

      {/* 매칭이유 패널 — 조건 결과 직접 표시 */}
      {showReason && conditions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-warm-gray/20 space-y-1.5">
          {conditions.map((c, i) => {
            const s = COND_STYLE[c.status] ?? COND_STYLE['확인필요']
            return (
              <div key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white ${s.dot}`}>
                  {s.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] font-bold ${s.text}`}>{c.condition}</span>
                  {c.detail && (
                    <p className="text-[10px] text-warm-text leading-snug mt-0.5">{c.detail}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 하단 액션 바 */}
      <div className="mt-2 pt-2 border-t border-warm-gray/30 flex items-center justify-between">
        {conditions.length > 0 ? (
          <button
            onClick={() => setShowReason(v => !v)}
            className={`text-xs font-medium transition-colors ${showReason ? 'text-navy' : 'text-warm-text hover:text-navy'}`}
          >
            매칭이유 {showReason ? '▲' : '▼'}
          </button>
        ) : <span />}
        <div className="flex items-center gap-3">
          <button
            onClick={onDetail}
            className={`text-xs font-medium hover:underline ${isUrgent ? 'text-warm-text' : 'text-navy'}`}
          >
            자세히 →
          </button>
          {item.applyUrl && (
            <a href={item.applyUrl} target="_blank" rel="noreferrer"
               className="text-xs text-sunset-orange font-medium hover:underline">
              신청하기 →
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-warm-gray/30 rounded-2xl p-4 space-y-2 animate-pulse">
      <div className="flex justify-between">
        <div className="h-4 w-16 bg-warm-gray/30 rounded-full" />
        <div className="h-4 w-10 bg-warm-gray/20 rounded" />
      </div>
      <div className="h-4 bg-warm-gray/20 rounded w-full" />
      <div className="h-4 bg-warm-gray/20 rounded w-3/4" />
      <div className="h-10 bg-warm-gray/10 rounded-xl" />
      <div className="h-1.5 bg-warm-gray/20 rounded-full" />
    </div>
  )
}

export default function OrbitDashboard({ userProfile, prefetchedMatches, prefetchedLoading }) {
  const navigate = useNavigate()
  const [urgent, setUrgent]   = useState([])
  const [regular, setRegular] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    // Home.jsx 가 미리 fetch 한 데이터가 있으면 자체 네트워크 호출 스킵
    if (Array.isArray(prefetchedMatches)) {
      setLoading(prefetchedLoading ?? false)
      setError(null)
      setUrgent(prefetchedMatches.filter(r => r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14))
      setRegular(prefetchedMatches.filter(r => !(r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14)))
      return
    }

    setLoading(true)
    setError(null)

    fetchMatches(userProfile ?? DEFAULT_PROFILE)
      .then(({ results }) => {
        const mapped = results
          .filter(r => r.overall_status !== '대상아님')
          .map(r => ({
            id:        r.notice_id,
            title:     r.notice_title,
            status:    r.overall_status,
            score:     r.match_score,
            dDay:      calcDDay(r.apply_period?.end),
            applyUrl:  r.apply_url ?? null,
            appStatus: r.application_status,
            raw:       r,
          }))
          .filter(r => r.dDay === null || r.dDay >= 0)
          .sort((a, b) => (a.dDay ?? 999) - (b.dDay ?? 999))

        setUrgent(mapped.filter(r => r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14))
        setRegular(mapped.filter(r => !(r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14)))
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [userProfile, prefetchedMatches, prefetchedLoading])

  function handleDetail(item) {
    localStorage.setItem('mars-fit-selected-match', JSON.stringify(item.raw))
    navigate('/notice')
  }

  if (error) {
    return (
      <section className="px-5 pb-28">
        <div className="bg-sunset-orange/10 border border-sunset-orange/30 rounded-xl p-4 text-sm text-sunset-orange">
          매칭 서버에 연결할 수 없어요.
          <span className="text-xs text-warm-text mt-1 block">{error}</span>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="px-5 pb-28">
        <style>{`
          @keyframes findFloat {
            0%, 100% { transform: translateY(0); }
            50%       { transform: translateY(-10px); }
          }
        `}</style>
        <div className="flex flex-col items-center py-10">
          <img
            src={findImg}
            alt=""
            aria-hidden="true"
            className="w-40 h-40 object-contain"
            style={{ animation: 'findFloat 2s ease-in-out infinite' }}
          />
          <p className="mt-4 text-sm font-semibold text-navy">
            Mars가 딱 맞는 지원사업을 찾고 있어요
          </p>
          <div className="flex gap-1 mt-2">
            {[0, 0.15, 0.3].map((delay, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-warm-gray animate-bounce"
                    style={{ animationDelay: `${delay}s` }} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </section>
    )
  }

  return (
    <section className="px-5 pb-28">
      {/* 긴급 마감 */}
      {(loading || urgent.length > 0) && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-sunset-orange animate-pulse" />
            <h2 className="text-sm font-bold text-sunset-orange tracking-wide uppercase">긴급 마감</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {loading
              ? [1, 2].map(i => <SkeletonCard key={i} />)
              : urgent.map(item => (
                  <ProgramCard key={item.id} item={item} accent="orange" onDetail={() => handleDetail(item)} />
                ))
            }
          </div>
        </>
      )}

      {/* 지원사업 탐색 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-navy" />
        <h2 className="text-sm font-bold text-navy tracking-wide uppercase">지원사업 탐색</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading
          ? [1, 2, 3, 4].map(i => <SkeletonCard key={i} />)
          : regular.map(item => (
              <ProgramCard key={item.id} item={item} accent="navy"
                onDetail={() => handleDetail(item)} />
            ))
        }
      </div>

      {!loading && urgent.length === 0 && regular.length === 0 && (
        <p className="text-sm text-warm-text text-center py-8">현재 조건에 맞는 지원사업이 없어요.</p>
      )}
    </section>
  )
}
