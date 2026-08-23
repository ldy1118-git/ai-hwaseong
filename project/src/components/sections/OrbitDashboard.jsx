import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../ui/Card'
import { fetchMatches, lookupTerms, DEFAULT_PROFILE } from '../../utils/api'
import { generateText } from '../../utils/llm/llmProvider'
import findImg from '../../../design/find.png'
import FavoriteButton from '../ui/FavoriteButton'

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

/* 마우스가 있는 기기인가. NoticeDetail 과 같은 이유다 — 전에는 CSS
   group-hover 로만 열려서, 마우스를 얹고 있는 동안에만 보였고 누를 수는
   없었다. 터치 화면에서는 아예 안 열렸다. */
const CAN_HOVER = typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover)').matches

/* 어려운 단어 하나. 눌러서 뜻을 펴고, 바깥을 누르거나 Esc 로 닫는다.
   마우스가 있으면 올리기만 해도 열린다. */
function Term({ label, def }) {
  const [show, setShow] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!show) return
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) setShow(false) }
    const esc = e => { if (e.key === 'Escape') setShow(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [show])

  const hover = CAN_HOVER
    ? { onMouseEnter: () => setShow(true), onMouseLeave: () => setShow(false) }
    : {}

  return (
    <span className="relative inline" ref={wrap}>
      <button
        type="button"
        aria-expanded={show}
        aria-label={`${label} 뜻 보기`}
        onClick={e => { e.stopPropagation(); setShow(v => !v) }}
        {...hover}
        className="underline decoration-dotted decoration-navy/50 cursor-help font-medium text-navy
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 rounded-sm"
      >
        {label}
      </button>
      {show && (
        <span className="absolute bottom-full left-0 mb-2 w-[min(14rem,72vw)] bg-navy text-white
                         text-[12px] leading-relaxed rounded-xl px-3 py-2 z-50
                         pointer-events-none shadow-lg whitespace-normal">
          <strong className="block text-[13px] mb-0.5">{label}</strong>
          {def.easy}
          {def.caution && (
            <span className="block mt-1 text-sunset-orange">주의 · {def.caution}</span>
          )}
        </span>
      )}
    </span>
  )
}

// 텍스트에서 어려운 단어를 찾아 눌렀을 때(또는 마우스를 올렸을 때) 뜻을 보여준다.
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
        return <Term key={i} label={part} def={def} />
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
    <Card padding="md" tone={isUrgent ? 'urgent' : 'plain'}>

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
        <div className="flex items-center gap-1 min-w-0">
        {item.dDay !== null ? (
          <span className={`text-base font-bold ${isUrgent ? 'text-sunset-orange' : 'text-navy'}`}>
            D-{item.dDay}
          </span>
        ) : item.raw?.apply_period?.note ? (
          <span className="text-sm font-bold text-warm-text text-right min-w-0">
            {item.raw.apply_period.note}
          </span>
        ) : null}
        {/* ★ 관심공고. 카드 전체가 눌리는 자리라 버튼 안에서 전파를 막는다 */}
        <FavoriteButton notice={item} size={18} />
        </div>
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

      {/* 매칭이유 — 버튼 **아래**에 편다.
          전에는 이 패널이 액션 바 위에 있었다. 그래서 「매칭이유」를 누르면
          내용이 버튼 위로 밀고 들어오면서 버튼 자신이 카드 맨 아래로
          내려갔다. 방금 누른 자리에 손가락을 두고 다시 누르면 엉뚱한 게
          눌린다. 접는 버튼은 편 자리에 그대로 있어야 한다. */}
      {showReason && conditions.length > 0 && (
        <div className="mt-2.5 space-y-1.5 origin-top" style={{ animation: 'reasonOpen .18s ease-out' }}>
          <style>{`
            @keyframes reasonOpen {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: none; }
            }
          `}</style>
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

/* ───────── 목록 칸을 「카드 세 장」에 묶어둔다 ─────────
 *
 * 공고 서른 건을 그대로 세우면 페이지가 끝없이 길어져서, 오른쪽 공고를
 * 읽는 동안 왼쪽 캘린더는 한참 위로 사라진다. 그렇다고 「더보기」로
 * 접어두면 사장님이 목록을 보려고 버튼을 한 번 더 눌러야 한다.
 * 칸 안에서만 스크롤시키면 둘 다 해결된다.
 *
 * 칸 높이를 62vh 로 못박아봤는데 그게 틀렸다. 화면이 짧은 노트북에서는
 * 카드가 두 장 반만 보이고 큰 모니터에서는 네 장이 보인다 — 기준이
 * 화면 높이지 카드가 아니기 때문이다.
 *
 * 그래서 첫 세 장이 실제로 차지하는 높이를 재서 그걸 상한으로 쓴다.
 * 어느 화면에서든 정확히 세 장이 보이고, 나머지는 안에서 스크롤된다.
 *
 * ResizeObserver 로 계속 지켜본다. 카드 안에서 「매칭이유」를 펴거나
 * AI 요약이 뒤늦게 붙어 높이가 변해도 기준이 따라간다. */
function useThreeCardCap(deps) {
  const ref = useRef(null)
  const [cap, setCap] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const kids = Array.from(el.children)
      // 세 장 이하면 넘칠 게 없다. 상한을 걸면 스크롤바만 생긴다.
      if (kids.length <= INITIAL_COUNT) return setCap(null)
      const third = kids[INITIAL_COUNT - 1]
      // offsetTop 은 배치상의 위치라 스크롤해도 변하지 않는다. 칸을 이미
      // 잘라놓은 뒤에도 세 장의 높이를 그대로 다시 잴 수 있다.
      setCap(third.offsetTop + third.offsetHeight - kids[0].offsetTop)
    }
    measure()

    // 칸에 상한이 걸리고 나면 컨테이너는 더 이상 커지지 않는다. 카드가
    // 혼자 자라는 것(매칭이유 펼침, AI 요약 도착)을 놓치지 않으려면
    // 카드도 같이 지켜봐야 한다.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    Array.from(el.children).slice(0, INITIAL_COUNT).forEach(k => ro.observe(k))
    return () => ro.disconnect()
  }, deps)

  return [ref, cap]
}

/* 넓은 화면에서만 칸에 가둔다. 좁은 화면에서 안쪽 스크롤을 만들면
 * 바깥 페이지 스크롤과 엉켜서 손가락이 어디를 미는지 알 수 없게 된다. */
function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = e => setWide(e.matches)
    setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

/* 접혀 있을 때는 아무 제한도 걸지 않는다 — 내용이 딱 맞아서 스크롤바가
 * 생길 이유가 없다. 펼쳤을 때만 상한과 스크롤을 준다. */
function capStyle(wide, cap) {
  if (!wide || !cap) return undefined
  // overflowX 를 반드시 같이 적는다. CSS 규칙상 overflow-y 가 visible 이
  // 아니게 되면 overflow-x 도 visible 에서 auto 로 자동 승격된다. 그래서
  // 세로 스크롤만 원했는데 카드가 1px 만 넘쳐도 **가로 스크롤바가 같이
  // 생긴다.** 목록 안에 가로 막대가 걸려 있던 것이 이것이었다.
  return { maxHeight: cap, overflowY: 'auto', overflowX: 'hidden' }
}

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
  const [aiDescs, setAiDescs]             = useState({})
  const [termDefs, setTermDefs]           = useState([])

  useEffect(() => {
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

  // 목록은 언제나 전부 그린다. 「더보기」는 없앴다 — 어차피 칸 안에서
  // 스크롤하는데 버튼까지 두면 같은 일을 두 군데서 시키는 셈이다.
  const wide = useIsWide()
  const [urgentRef,  urgentCap]  = useThreeCardCap([urgent,  loading, aiDescs, termDefs])
  const [regularRef, regularCap] = useThreeCardCap([regular, loading, aiDescs, termDefs])

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


  return (
    <section className="px-5 pb-28">
      {/* 긴급 마감 */}
      {(loading || urgent.length > 0) && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-sunset-orange animate-pulse" />
            <h2 className="text-base font-bold text-sunset-orange tracking-wide uppercase">긴급 마감</h2>
          </div>
          <div ref={urgentRef} style={capStyle(wide, urgentCap)}
               className="grid grid-cols-1 gap-3 mb-6 lg:pr-1.5">
            {loading
              ? [1, 2].map(i => <SkeletonCard key={i} />)
              : urgent.map(item => (
                  <ProgramCard key={item.id} item={item} accent="orange" onDetail={() => handleDetail(item)} aiDesc={aiDescs[item.id]} termDefs={termDefs} />
                ))
            }
          </div>
        </>
      )}

      {/* 지원사업 탐색 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-navy" />
        <h2 className="text-base font-bold text-navy tracking-wide uppercase">지원사업 탐색</h2>
      </div>
      <div ref={regularRef} style={capStyle(wide, regularCap)}
           className="grid grid-cols-1 gap-3 lg:pr-1.5">
        {loading
          ? [1, 2, 3, 4].map(i => <SkeletonCard key={i} />)
          : regular.map(item => (
              <ProgramCard key={item.id} item={item} accent="navy"
                onDetail={() => handleDetail(item)} aiDesc={aiDescs[item.id]} termDefs={termDefs} />
            ))
        }
      </div>

      {!loading && urgent.length === 0 && regular.length === 0 && (
        <p className="text-sm text-warm-text text-center py-8">현재 조건에 맞는 지원사업이 없어요.</p>
      )}
    </section>
  )
}
