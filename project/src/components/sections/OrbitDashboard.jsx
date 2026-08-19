import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../ui/Card'
import { fetchMatches, lookupTerms, DEFAULT_PROFILE } from '../../utils/api'
import { generateText } from '../../utils/llm/llmProvider'
import findImg from '../../../design/find.png'

// API 키는 서버에만 둔다. VITE_ 환경변수는 빌드 결과물에 그대로 박혀서
// 배포하면 누구나 꺼낼 수 있다. LLM 호출은 llmProvider 가 /api/llm 으로 넘긴다.

function briefDesc(summary) {
  if (!summary) return null
  // ☞ 이후는 자격요건 bullet이므로 제거, 개행도 제거
  const clean = summary.split('☞')[0].split('\n')[0].trim()
  // 첫 번째 완결 문장(다. 로 끝나는 지점)만 취한다
  const m = clean.match(/^.+?다\./)
  return m ? m[0] : clean
}

// 텍스트에서 어려운 단어를 찾아 마우스 오버 시 툴팁으로 뜻을 보여준다.
function AnnotatedText({ text, termDefs }) {
  if (!text || !termDefs?.length) return <>{text}</>

  const matching = termDefs.filter(t => text.includes(t.term))
  if (!matching.length) return <>{text}</>

  const sorted = [...matching].sort((a, b) => b.term.length - a.term.length)
  const escaped = sorted.map(t => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) => {
        const def = sorted.find(t => t.term === part)
        if (!def) return part
        return (
          <span key={i} className="relative group inline">
            <span className="underline decoration-dotted decoration-navy/50 cursor-help font-medium text-navy">
              {part}
            </span>
            <span className="absolute bottom-full left-0 mb-2 w-56 bg-navy text-white text-[12px] leading-relaxed rounded-xl px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg whitespace-normal">
              <strong className="block text-[13px] mb-0.5">{def.term}</strong>
              {def.easy}
              {def.caution && (
                <span className="block mt-1 text-sunset-orange">주의 · {def.caution}</span>
              )}
            </span>
          </span>
        )
      })}
    </>
  )
}

function calcDDay(endDate) {
  if (!endDate) return null
  return Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24))
}

const STATUS_STYLE = {
  '신청가능': 'text-emerald-600 bg-emerald-50',
  '조건부':   'text-sunset-orange bg-sunset-orange/10',
  '확인필요': 'text-warm-text bg-warm-gray/20',
}

// 매칭 점수.
//
// 전에는 카드 폭을 다 쓰는 진행 막대였다. 막대는 「진행 중」이라는 뜻으로
// 읽히는데 이건 진행이 아니라 **적합도**다. 게다가 어느 대시보드에나 있는
// 모양이라 눈에 안 남는다. 숫자를 위로 올려 상태 배지 옆에 붙였다 —
// 카드가 한 줄 짧아지고, 목록이 이미 점수순이라 비교도 순서로 된다.
function ScoreTag({ score }) {
  if (score === undefined || score === null) return null
  return (
    <span className="text-sm font-bold text-warm-text tabular-nums">
      매칭 {score}
      <span className="text-xs font-semibold text-warm-gray">점</span>
    </span>
  )
}


const COND_STYLE = {
  '충족':    { dot: 'bg-emerald-400', text: 'text-emerald-600', icon: '✓' },
  '불충족':  { dot: 'bg-red-400',     text: 'text-red-500',     icon: '✕' },
  '확인필요':{ dot: 'bg-sunset-orange', text: 'text-sunset-orange', icon: '?' },
}

function ProgramCard({ item, accent, onDetail, aiDesc, termDefs }) {
  const [showReason, setShowReason] = useState(false)
  const isUrgent = accent === 'orange'
  const conditions = (item.raw?.condition_results ?? []).filter(c => c.status !== '대상아님')

  // 왼쪽에 색막대를 세운 둥근 카드는 어느 서비스에나 있는 모양이라
  // 눈에 안 남는다. 급한 것은 D-day 색과 「긴급 마감」 묶음이 이미
  // 말해주고 있어서 막대가 없어도 구분된다.
  return (
    <Card padding="md">

      {/* 상단: 상태 배지 + 매칭 점수 + D-Day */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`text-sm font-medium rounded-full px-2.5 py-0.5 flex-shrink-0 ${STATUS_STYLE[item.status] ?? 'text-warm-text bg-warm-gray/20'}`}>
            {item.status}
          </span>
          <ScoreTag score={item.score} />
        </div>
        {/* 공고 59건 중 30건은 마감일이 날짜가 아니라 「예산 소진시까지」
            같은 문구다. 예전에는 날짜가 없으면 이 자리를 통째로 비웠는데,
            그러면 절반이 넘는 공고가 언제까지인지 아무 말도 안 해준다.
            문구가 있으면 그걸 그대로 보여준다 — 사장님에게 필요한 정보다. */}
        {item.dDay !== null ? (
          <span className={`text-base font-bold ${isUrgent ? 'text-sunset-orange' : 'text-navy'}`}>
            D-{item.dDay}
          </span>
        ) : item.raw?.apply_period?.note ? (
          <span className="text-sm font-bold text-warm-text whitespace-nowrap">
            {item.raw.apply_period.note}
          </span>
        ) : null}
      </div>

      {/* 정책명 */}
      <p className="text-base font-bold text-navy leading-snug line-clamp-2">{item.title}</p>

      {/* 공고 요약 — AI 요약 우선, 없으면 첫 문장 fallback. 어려운 단어는 툴팁 */}
      {(aiDesc || briefDesc(item.summary)) && (
        <p className="mt-1.5 text-sm text-warm-text leading-relaxed">
          <AnnotatedText text={aiDesc || briefDesc(item.summary)} termDefs={termDefs} />
        </p>
      )}

      {/* 주관기관 — 연한 색으로 채운 상자였는데, 값 하나 담자고 상자를
          두면 카드 안에 상자가 또 생긴다. 괘선 한 줄로 편다. */}
      {item.organizer && (
        <div className="mt-3 pt-2.5 border-t border-warm-gray/25 flex items-baseline gap-3">
          <span className="text-xs font-bold text-warm-text flex-shrink-0">주관기관</span>
          <span className="text-sm text-navy truncate">{item.organizer}</span>
        </div>
      )}

      {/* 매칭이유 패널 — 조건 결과 직접 표시 */}
      {showReason && conditions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-warm-gray/20 space-y-1.5">
          {conditions.map((c, i) => {
            const s = COND_STYLE[c.status] ?? COND_STYLE['확인필요']
            return (
              <div key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${s.dot}`}>
                  {s.icon}
                </span>
                <div className="flex-1 min-w-0">
                  {/* 매칭이 돌려주는 condition 은 business_status 같은 영문 키다.
                      label 이 있으면 그걸 쓴다 — 없으면 화면에 영문이 그대로 나온다.
                      글씨 크기는 서희가 키운 text-sm 을 그대로 쓴다. */}
                  <span className={`text-sm font-bold ${s.text}`}>{c.label || c.condition}</span>
                  {c.detail && (
                    <p className="text-sm text-warm-text leading-snug mt-0.5">{c.detail}</p>
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
            className={`text-sm font-medium transition-colors ${showReason ? 'text-navy' : 'text-warm-text hover:text-navy'}`}
          >
            매칭이유 {showReason ? '▲' : '▼'}
          </button>
        ) : <span />}
        <button
          onClick={onDetail}
          className={`text-sm font-medium hover:underline ${isUrgent ? 'text-warm-text' : 'text-navy'}`}
        >
          자세히 →
        </button>
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

const INITIAL_COUNT = 3

async function summarizeBatch(items, signal, setAiDescs) {
  // 화면에 바로 보이는 카드만 (각 섹션 top 3 = 최대 6개)
  const visible = items.slice(0, INITIAL_COUNT * 2)
  const targets = visible
    .map(item => ({ id: item.id, summary: item.summary }))
    .filter(t => t.summary)
  if (!targets.length) return
  try {
    const raw = await generateText({
      jsonMode: true,
      systemPrompt: '당신은 소상공인 지원사업 안내 도우미입니다. 지원사업 설명을 쉽고 간결하게 요약합니다.',
      userPrompt: `아래 지원사업 목록의 summary를 각각 소상공인이 바로 이해할 수 있도록 15~35자의 한 줄로 요약해줘. 전문 용어 대신 쉬운 말을 써줘.
JSON 형식으로만 응답해줘: {"results": [{"id": "공고id", "desc": "요약 한 줄"}]}

${JSON.stringify(targets)}`,
    })
    if (signal.cancelled) return   // 컴포넌트 언마운트 또는 새 요청으로 덮어쓰기 방지
    const parsed = JSON.parse(raw)
    const map = {}
    for (const r of (parsed.results ?? [])) {
      if (r.id && r.desc) map[r.id] = r.desc
    }
    setAiDescs(map)
  } catch (err) {
    if (!signal.cancelled) console.warn('[OrbitDashboard] AI 요약 실패:', err.message)
  }
}

export default function OrbitDashboard({ userProfile, prefetchedMatches, prefetchedLoading }) {
  const navigate = useNavigate()
  const [urgent, setUrgent]               = useState([])
  const [regular, setRegular]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [showMoreUrgent, setShowMoreUrgent]   = useState(false)
  const [showMoreRegular, setShowMoreRegular] = useState(false)
  const [aiDescs, setAiDescs]             = useState({})
  const [termDefs, setTermDefs]           = useState([])

  useEffect(() => {
    setShowMoreUrgent(false)
    setShowMoreRegular(false)

    const signal = { cancelled: false }

    // Home.jsx 가 미리 fetch 한 데이터가 있으면 자체 네트워크 호출 스킵
    if (Array.isArray(prefetchedMatches)) {
      const isLoading = prefetchedLoading ?? false
      setLoading(isLoading)
      setError(null)
      const sorted = [...prefetchedMatches].sort((a, b) => b.score - a.score)
      const u = sorted.filter(r => r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14)
      const reg = sorted.filter(r => !(r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14))
      setUrgent(u)
      setRegular(reg)
      // 아직 로딩 중이면 AI 요약 호출 보류 — 데이터 확정 후에 부른다
      if (!isLoading && (u.length || reg.length)) {
        setAiDescs({})
        summarizeBatch([...u, ...reg], signal, setAiDescs)
      }
      return () => { signal.cancelled = true }
    }

    setLoading(true)
    setError(null)
    setAiDescs({})

    fetchMatches(userProfile ?? DEFAULT_PROFILE)
      .then(({ results }) => {
        if (signal.cancelled) return
        const mapped = results
          .filter(r => r.overall_status !== '대상아님')
          .map(r => ({
            id:        r.notice_id,
            title:     r.notice_title,
            summary:   r.summary   ?? null,
            organizer: r.organizer ?? null,
            status:    r.overall_status,
            score:     r.match_score,
            dDay:      calcDDay(r.apply_period?.end),
            applyUrl:  r.apply_url ?? null,
            appStatus: r.application_status,
            raw:       r,
          }))
          .filter(r => r.dDay === null || r.dDay >= 0)
          .sort((a, b) => b.score - a.score)

        const u = mapped.filter(r => r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14)
        const reg = mapped.filter(r => !(r.appStatus === '접수중' && r.dDay !== null && r.dDay <= 14))
        setUrgent(u)
        setRegular(reg)
        summarizeBatch([...u, ...reg], signal, setAiDescs)
      })
      .catch(err => { if (!signal.cancelled) setError(err.message) })
      .finally(() => { if (!signal.cancelled) setLoading(false) })

    return () => { signal.cancelled = true }
  }, [userProfile, prefetchedMatches, prefetchedLoading])

  // 카드에 실제로 표시되는 텍스트가 바뀔 때마다 어려운 단어를 서버에서 찾아온다.
  // aiDescs 가 없으면 briefDesc, 있으면 AI 요약 기준으로 조회한다.
  useEffect(() => {
    const visible = [
      ...urgent.slice(0, INITIAL_COUNT),
      ...regular.slice(0, INITIAL_COUNT),
    ]
    const text = visible
      .map(item => aiDescs[item.id] || briefDesc(item.summary))
      .filter(Boolean)
      .join('\n')
    if (!text) return

    let cancelled = false
    lookupTerms(text, [])
      .then(result => { if (!cancelled) setTermDefs(result.terms ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [urgent, regular, aiDescs])

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
        <div className="grid grid-cols-1 gap-3">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </section>
    )
  }

  const visibleUrgent  = showMoreUrgent  ? urgent  : urgent.slice(0, INITIAL_COUNT)
  const visibleRegular = showMoreRegular ? regular : regular.slice(0, INITIAL_COUNT)

  return (
    <section className="px-5 pb-28">
      {/* 긴급 마감 */}
      {(loading || urgent.length > 0) && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-sunset-orange animate-pulse" />
            <h2 className="text-base font-bold text-sunset-orange tracking-wide uppercase">긴급 마감</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 mb-3">
            {loading
              ? [1, 2].map(i => <SkeletonCard key={i} />)
              : visibleUrgent.map(item => (
                  <ProgramCard key={item.id} item={item} accent="orange" onDetail={() => handleDetail(item)} aiDesc={aiDescs[item.id]} termDefs={termDefs} />
                ))
            }
          </div>
          {!loading && urgent.length > INITIAL_COUNT && (
            <button
              onClick={() => setShowMoreUrgent(v => !v)}
              className="w-full mb-6 py-2.5 rounded-xl border border-sunset-orange/40 text-sm font-medium text-sunset-orange hover:bg-sunset-orange/5 transition-colors"
            >
              {showMoreUrgent ? '접기 ▲' : `추가 사업 더보기 +${urgent.length - INITIAL_COUNT} ▼`}
            </button>
          )}
          {!loading && urgent.length <= INITIAL_COUNT && <div className="mb-6" />}
        </>
      )}

      {/* 지원사업 탐색 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-navy" />
        <h2 className="text-base font-bold text-navy tracking-wide uppercase">지원사업 탐색</h2>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {loading
          ? [1, 2, 3, 4].map(i => <SkeletonCard key={i} />)
          : visibleRegular.map(item => (
              <ProgramCard key={item.id} item={item} accent="navy"
                onDetail={() => handleDetail(item)} aiDesc={aiDescs[item.id]} termDefs={termDefs} />
            ))
        }
      </div>
      {!loading && regular.length > INITIAL_COUNT && (
        <button
          onClick={() => setShowMoreRegular(v => !v)}
          className="w-full mt-3 py-2.5 rounded-xl border border-navy/30 text-sm font-medium text-navy hover:bg-navy/5 transition-colors"
        >
          {showMoreRegular ? '접기 ▲' : `추가 사업 더보기 +${regular.length - INITIAL_COUNT} ▼`}
        </button>
      )}

      {!loading && urgent.length === 0 && regular.length === 0 && (
        <p className="text-sm text-warm-text text-center py-8">현재 조건에 맞는 지원사업이 없어요.</p>
      )}
    </section>
  )
}
