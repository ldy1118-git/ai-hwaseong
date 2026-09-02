import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Card from '../ui/Card'
import { fetchMatches, lookupTerms, DEFAULT_PROFILE } from '../../utils/api'
import { generateText } from '../../utils/llm/llmProvider'
import findImg from '../../../design/find.png'
import searchImg from '../../../design/search.png'
import FavoriteButton from '../ui/FavoriteButton'
import { useRememberedScroll } from '../../utils/scrollMemory'
import { isVisited, markVisited, subscribeVisited } from '../../utils/visitedNotices'
import { listFavorites, subscribeFavorites } from '../../utils/favorites'
import { listApplied, subscribeApplied } from '../../utils/appliedPrograms'

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

  // 한 번 열어본 공고는 흐리게. 목록이 마흔 건이 넘고 다 비슷하게 생겨서,
  // 오르내리다 보면 아까 본 것을 또 연다.
  const [seen, setSeen] = useState(() => isVisited(item.id))
  useEffect(() => {
    setSeen(isVisited(item.id))
    return subscribeVisited(() => setSeen(isVisited(item.id)))
  }, [item.id])
  const conditions = (item.raw?.condition_results ?? []).filter(c => c.status !== '대상아님')

  // 왼쪽에 색막대를 세운 둥근 카드는 어느 서비스에나 있는 모양이라
  // 눈에 안 남는다. 급한 것은 D-day 색과 「긴급 마감」 묶음이 이미
  // 말해주고 있어서 막대가 없어도 구분된다.
  return (
    <Card padding="compact" tone={isUrgent ? 'urgent' : 'plain'}
      className={seen ? 'opacity-60 hover:opacity-100 transition-opacity duration-150' : ''}>

      {/* 상단: 상태 배지 + 매칭 점수 + D-Day */}
      <div className="flex items-center justify-between gap-3 mb-1">
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
      <p className="text-base font-bold text-navy leading-snug line-clamp-2">
        {seen && (
          <span className="mr-1.5 align-middle text-xs font-bold text-warm-text
                           bg-warm-gray/25 rounded px-1.5 py-0.5">
            본 공고
          </span>
        )}
        {item.title}
      </p>

      {/* 공고 요약 — AI 요약 우선, 없으면 첫 문장 fallback. 어려운 단어는 툴팁 */}
      {(aiDesc || briefDesc(item.summary)) && (
        <p className="mt-1 text-sm text-warm-text leading-relaxed">
          <AnnotatedText text={aiDesc || briefDesc(item.summary)} termDefs={termDefs} />
        </p>
      )}

      {/* 주관기관 — 연한 색으로 채운 상자였는데, 값 하나 담자고 상자를
          두면 카드 안에 상자가 또 생긴다. 괘선 한 줄로 편다. */}
      {item.organizer && (
        <div className="mt-2.5 pt-2 border-t border-warm-gray/25 flex items-baseline gap-3">
          <span className="text-xs font-bold text-warm-text flex-shrink-0">주관기관</span>
          <span className="text-sm text-navy truncate">{item.organizer}</span>
        </div>
      )}

      {/* 하단 액션 바 */}
      <div className="mt-2 pt-1.5 border-t border-warm-gray/30 flex items-center justify-between">
        {conditions.length > 0 ? (
          <button
            onClick={() => setShowReason(v => !v)}
            className={`tap text-sm font-medium transition-colors ${showReason ? 'text-navy' : 'text-warm-text hover:text-navy'}`}
          >
            매칭이유 {showReason ? '▲' : '▼'}
          </button>
        ) : <span />}
        <button
          onClick={onDetail}
          className={`tap text-sm font-medium hover:underline ${isUrgent ? 'text-warm-text' : 'text-navy'}`}
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

const INITIAL_COUNT = 4

/* 목록을 무엇으로 줄 세울지.
 *
 * 잘 맞는 것부터 보고 싶은 사람과 급한 것부터 보고 싶은 사람이 갈린다.
 * 어느 쪽이 맞다고 정할 수가 없어서 고르게 한다.
 *
 * 마감일이 없는 공고가 절반이다(58건 중 30건). 마감순으로 세울 때 그것들을
 * 맨 뒤로 보낸다 — 날짜를 모르는 것을 「급하지 않다」고 위에 두면, 정작
 * 내일 마감인 것이 아래로 밀린다.
 */
const SORTS = {
  score: {
    label: '매칭점수순',
    compare: (a, b) => b.score - a.score,
  },
  deadline: {
    label: '마감임박순',
    compare: (a, b) => {
      if (a.dDay === null && b.dDay === null) return b.score - a.score
      if (a.dDay === null) return 1
      if (b.dDay === null) return -1
      return a.dDay - b.dDay || b.score - a.score
    },
  },
}
const SORT_KEY = 'mars-fit-notice-sort'

/* ───────── 목록 칸을 「카드 INITIAL_COUNT 장」에 묶어둔다 ─────────
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
 * 그래서 첫 몇 장이 실제로 차지하는 높이를 재서 그걸 상한으로 쓴다.
 * 어느 화면에서든 정확히 그만큼 보이고, 나머지는 안에서 스크롤된다.
 * 몇 장인지는 INITIAL_COUNT 하나로 정한다(지금 4장).
 *
 * ResizeObserver 로 계속 지켜본다. 카드 안에서 「매칭이유」를 펴거나
 * AI 요약이 뒤늦게 붙어 높이가 변해도 기준이 따라간다. */
function useCardCap(deps) {
  const ref = useRef(null)
  const [cap, setCap] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const kids = Array.from(el.children)
      // 그 수 이하면 넘칠 게 없다. 상한을 걸면 스크롤바만 생긴다.
      if (kids.length <= INITIAL_COUNT) return setCap(null)
      const third = kids[INITIAL_COUNT - 1]
      // offsetTop 은 배치상의 위치라 스크롤해도 변하지 않는다. 칸을 이미
      // 잘라놓은 뒤에도 그 높이를 그대로 다시 잴 수 있다.
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

// 새 공고 알림 ID 목록을 localStorage에서 읽는다
function readNewIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem('mars-fit-new-notices') ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.map(n => n.notice_id) : [])
  } catch { return new Set() }
}

// 섹션 타이틀 행
function SectionHead({ label, count, accent = 'navy', pulse = false }) {
  const colors = {
    navy:    ['bg-navy', 'text-navy'],
    orange:  ['bg-sunset-orange', 'text-sunset-orange'],
    emerald: ['bg-emerald-500', 'text-emerald-600'],
    amber:   ['bg-amber-500', 'text-amber-600'],
    purple:  ['bg-purple-400', 'text-purple-600'],
  }
  const [dot, text] = colors[accent] ?? colors.navy
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-2 h-2 rounded-full ${dot}${pulse ? ' animate-pulse' : ''}`} />
      <h2 className={`text-base font-bold ${text}`}>{label}</h2>
      {count != null && count > 0 && (
        <span className="text-xs font-semibold text-warm-text bg-warm-gray/20 rounded-full px-2 py-0.5">
          {count}건
        </span>
      )}
    </div>
  )
}

// 현재 매칭 결과에 없는 관심공고 (마감됐거나 조건 미달)
function SimpleFavCard({ fav }) {
  const dDay = fav.apply_period?.end ? calcDDay(fav.apply_period.end) : null
  const expired = dDay !== null && dDay < 0
  return (
    <Card padding="compact" tone="plain" className={expired ? 'opacity-50' : ''}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-bold text-navy leading-snug flex-1 line-clamp-2">
          {fav.notice_title}
        </p>
        {dDay !== null && (
          <span className={`text-sm font-bold shrink-0 ${expired ? 'text-warm-text' : 'text-navy'}`}>
            {expired ? '마감' : `D-${dDay}`}
          </span>
        )}
      </div>
      {fav.organizer && <p className="mt-1 text-xs text-warm-text">{fav.organizer}</p>}
      {expired && <p className="mt-1 text-sm text-sunset-orange">마감된 공고예요</p>}
    </Card>
  )
}

// 신청 완료 한 줄
function AppliedCard({ app }) {
  const date = app.applied_at
    ? new Date(app.applied_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    : null
  return (
    <div className="bg-white border border-warm-gray/20 rounded-2xl p-3.5 shadow-sm flex items-start gap-3">
      <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
        <span className="text-emerald-600 text-[10px] font-bold">✓</span>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-navy line-clamp-2">{app.notice_title}</p>
        {app.organizer && <p className="text-xs text-warm-text mt-0.5">{app.organizer}</p>}
      </div>
      {date && <span className="text-xs text-warm-text shrink-0 mt-0.5">{date}</span>}
    </div>
  )
}

export default function OrbitDashboard({ userProfile, prefetchedMatches, prefetchedLoading }) {
  const navigate = useNavigate()
  const [allItems, setAllItems]   = useState([])
  const [sortKey, setSortKey]     = useState(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY)
      return saved in SORTS ? saved : 'score'
    } catch { return 'score' }
  })
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [aiDescs, setAiDescs]     = useState({})
  const [termDefs, setTermDefs]   = useState([])
  const [favorites, setFavorites] = useState(() => listFavorites())
  const [applied, setApplied]     = useState(() => listApplied())
  const [newIds, setNewIds]       = useState(() => readNewIds())

  // 관심공고·신청완료·새 공고 목록이 바뀌면 따라간다
  useEffect(() => {
    const unsub1 = subscribeFavorites(() => setFavorites(listFavorites()))
    const unsub2 = subscribeApplied(list => setApplied(list))
    const onNew = () => setNewIds(readNewIds())
    window.addEventListener('mars-fit-notifications-changed', onNew)
    return () => {
      unsub1()
      unsub2()
      window.removeEventListener('mars-fit-notifications-changed', onNew)
    }
  }, [])

  // 공고 데이터 로딩
  useEffect(() => {
    const signal = { cancelled: false }

    // Home.jsx 가 미리 fetch 한 데이터가 있으면 자체 네트워크 호출 스킵
    if (Array.isArray(prefetchedMatches)) {
      const isLoading = prefetchedLoading ?? false
      setLoading(isLoading)
      setError(null)
      setAllItems(prefetchedMatches)
      if (!isLoading && prefetchedMatches.length) {
        setAiDescs({})
        summarizeBatch(prefetchedMatches, signal, setAiDescs)
      }
      return () => { signal.cancelled = true }
    }

    setLoading(true)
    setError(null)
    setAiDescs({})

    fetchMatches(userProfile ?? DEFAULT_PROFILE)
      .then(({ results }) => {
        if (signal.cancelled) return
        const mapped = (results ?? [])
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
        setAllItems(mapped)
        summarizeBatch(mapped, signal, setAiDescs)
      })
      .catch(err => { if (!signal.cancelled) setError(err.message) })
      .finally(() => { if (!signal.cancelled) setLoading(false) })

    return () => { signal.cancelled = true }
  }, [userProfile, prefetchedMatches, prefetchedLoading])

  // 화면에 보이는 텍스트에서 어려운 단어를 찾아온다
  useEffect(() => {
    const text = allItems
      .slice(0, INITIAL_COUNT * 2)
      .map(item => aiDescs[item.id] || briefDesc(item.summary))
      .filter(Boolean)
      .join('\n')
    if (!text) return
    let cancelled = false
    lookupTerms(text, [])
      .then(result => { if (!cancelled) setTermDefs(result.terms ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [allItems, aiDescs])

  // 섹션별 파생 데이터
  const urgentItems = useMemo(
    () => allItems
      .filter(r => r.status === '신청가능' && r.dDay !== null && r.dDay <= 7)
      .sort((a, b) => a.dDay - b.dDay || b.score - a.score),
    [allItems]
  )
  const applicableItems = useMemo(
    () => allItems.filter(r => r.status === '신청가능').sort((a, b) => b.score - a.score),
    [allItems]
  )
  const newItems = useMemo(
    () => allItems.filter(r => newIds.has(r.id)).sort((a, b) => b.score - a.score),
    [allItems, newIds]
  )
  const byId = useMemo(() => Object.fromEntries(allItems.map(r => [r.id, r])), [allItems])
  const favItems = useMemo(
    () => favorites.map(f => byId[f.notice_id] ?? f).filter(Boolean),
    [favorites, byId]
  )
  const compare = (SORTS[sortKey] ?? SORTS.score).compare
  const allSorted = useMemo(() => [...allItems].sort(compare), [allItems, sortKey])

  const wide = useIsWide()
  // 전체 탐색만 wide 화면에서 내부 스크롤로 자른다
  const [allRef, allCap] = useCardCap([allSorted.slice(0, INITIAL_COUNT), loading, aiDescs])
  useRememberedScroll('home-all', allRef, !loading && allCap != null)

  // 각 섹션 확장 상태
  const [urgentExpanded,     setUrgentExpanded]     = useState(false)
  const [applicableExpanded, setApplicableExpanded] = useState(false)
  const [newExpanded,        setNewExpanded]         = useState(false)
  const [favExpanded,        setFavExpanded]         = useState(false)
  const [appliedExpanded,    setAppliedExpanded]     = useState(false)
  const [allExpanded,        setAllExpanded]         = useState(false)

  useEffect(() => { setAllExpanded(false) }, [sortKey])

  const URGENT_INIT     = 2
  const APPLICABLE_INIT = 3
  const NEW_INIT        = 3
  const FAV_INIT        = 3
  const APPLIED_INIT    = 3

  const urgentVisible     = urgentExpanded     ? urgentItems     : urgentItems.slice(0, URGENT_INIT)
  const applicableVisible = applicableExpanded ? applicableItems : applicableItems.slice(0, APPLICABLE_INIT)
  const newVisible        = newExpanded        ? newItems        : newItems.slice(0, NEW_INIT)
  const favVisible        = favExpanded        ? favItems        : favItems.slice(0, FAV_INIT)
  const appliedVisible    = appliedExpanded    ? applied         : applied.slice(0, APPLIED_INIT)
  const allVisible        = allExpanded        ? allSorted       : allSorted.slice(0, INITIAL_COUNT)

  function handleDetail(item) {
    markVisited(item.id)
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
            src={searchImg}
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
        <div className="grid grid-cols-1 gap-2.5">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </section>
    )
  }

  return (
    <section className="px-5 pb-28 space-y-7">

      {/* ── 지금 신청 가능한 지원사업 ── */}
      {(applicableItems.length > 0 || loading) && (
        <div>
          <SectionHead label="지금 신청 가능한 지원사업"
            count={!loading ? applicableItems.length : undefined}
            accent="emerald" />
          <div className="grid grid-cols-1 gap-2.5">
            {loading
              ? [1, 2, 3].map(i => <SkeletonCard key={i} />)
              : applicableVisible.map(item => (
                  <ProgramCard key={item.id} item={item} accent="navy"
                    onDetail={() => handleDetail(item)}
                    aiDesc={aiDescs[item.id]} termDefs={termDefs} />
                ))
            }
          </div>
          {!loading && applicableItems.length > APPLICABLE_INIT && (
            <button type="button"
              onClick={() => setApplicableExpanded(v => !v)}
              className="w-full flex items-center justify-center gap-1 py-2 mt-1
                         border-t border-warm-gray/20 text-sm font-semibold text-emerald-600 hover:underline">
              {applicableExpanded ? '접기' : `${applicableItems.length - APPLICABLE_INIT}건 더보기`}
              <ChevronDown size={13} className={`transition-transform duration-150 ${applicableExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* ── 긴급 마감 ── */}
      {urgentItems.length > 0 && (
        <div>
          <SectionHead label="긴급 마감" count={urgentItems.length} accent="orange" pulse />
          <div className="grid grid-cols-1 gap-2.5">
            {urgentVisible.map(item => (
              <ProgramCard key={item.id} item={item} accent="orange"
                onDetail={() => handleDetail(item)}
                aiDesc={aiDescs[item.id]} termDefs={termDefs} />
            ))}
          </div>
          {urgentItems.length > URGENT_INIT && (
            <button type="button"
              onClick={() => setUrgentExpanded(v => !v)}
              className="w-full flex items-center justify-center gap-1 py-2 mt-1
                         border-t border-warm-gray/20 text-sm font-semibold text-sunset-orange hover:underline">
              {urgentExpanded ? '접기' : `${urgentItems.length - URGENT_INIT}건 더보기`}
              <ChevronDown size={13} className={`transition-transform duration-150 ${urgentExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* ── 새로 발견한 지원사업 ── */}
      {newItems.length > 0 && (
        <div>
          <SectionHead label="새로 발견한 지원사업" count={newItems.length} accent="purple" />
          <div className="grid grid-cols-1 gap-2.5">
            {newVisible.map(item => (
              <ProgramCard key={item.id} item={item} accent="navy"
                onDetail={() => handleDetail(item)}
                aiDesc={aiDescs[item.id]} termDefs={termDefs} />
            ))}
          </div>
          {newItems.length > NEW_INIT && (
            <button type="button"
              onClick={() => setNewExpanded(v => !v)}
              className="w-full flex items-center justify-center gap-1 py-2 mt-1
                         border-t border-warm-gray/20 text-sm font-semibold text-purple-600 hover:underline">
              {newExpanded ? '접기' : `${newItems.length - NEW_INIT}건 더보기`}
              <ChevronDown size={13} className={`transition-transform duration-150 ${newExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* ── 관심공고 ── */}
      {favItems.length > 0 && (
        <div>
          <SectionHead label="관심공고" count={favItems.length} accent="amber" />
          <div className="grid grid-cols-1 gap-2.5">
            {favVisible.map((item, i) =>
              item.id
                ? <ProgramCard key={item.id} item={item} accent="navy"
                    onDetail={() => handleDetail(item)}
                    aiDesc={aiDescs[item.id]} termDefs={termDefs} />
                : <SimpleFavCard key={item.notice_id ?? i} fav={item} />
            )}
          </div>
          {favItems.length > FAV_INIT && (
            <button type="button"
              onClick={() => setFavExpanded(v => !v)}
              className="w-full flex items-center justify-center gap-1 py-2 mt-1
                         border-t border-warm-gray/20 text-sm font-semibold text-amber-600 hover:underline">
              {favExpanded ? '접기' : `${favItems.length - FAV_INIT}건 더보기`}
              <ChevronDown size={13} className={`transition-transform duration-150 ${favExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* ── 신청 완료 ── */}
      {applied.length > 0 && (
        <div>
          <SectionHead label="신청 완료" count={applied.length} accent="emerald" />
          <div className="grid grid-cols-1 gap-2.5">
            {appliedVisible.map((app, i) => (
              <AppliedCard key={app.notice_id ?? i} app={app} />
            ))}
          </div>
          {applied.length > APPLIED_INIT && (
            <button type="button"
              onClick={() => setAppliedExpanded(v => !v)}
              className="w-full flex items-center justify-center gap-1 py-2 mt-1
                         border-t border-warm-gray/20 text-sm font-semibold text-emerald-600 hover:underline">
              {appliedExpanded ? '접기' : `${applied.length - APPLIED_INIT}건 더보기`}
              <ChevronDown size={13} className={`transition-transform duration-150 ${appliedExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* ── 전체 지원사업 탐색 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-navy" />
          <h2 className="text-base font-bold text-navy">전체 지원사업 탐색</h2>
          {!loading && (
            <span className="text-xs font-semibold text-warm-text bg-warm-gray/20 rounded-full px-2 py-0.5">
              {allItems.length}건
            </span>
          )}
          {!loading && allItems.length > 1 && (
            <div className="ml-auto flex items-center gap-1 flex-shrink-0" role="group" aria-label="정렬">
              {Object.entries(SORTS).map(([key, s2]) => {
                const on = sortKey === key
                return (
                  <button key={key} type="button"
                    onClick={() => {
                      setSortKey(key)
                      try { localStorage.setItem(SORT_KEY, key) } catch {}
                    }}
                    aria-pressed={on}
                    className={[
                      'px-2.5 py-1 rounded-full text-sm font-bold transition-colors',
                      on ? 'bg-navy text-white' : 'text-warm-text hover:bg-warm-gray/20',
                    ].join(' ')}
                  >
                    {s2.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div ref={allRef} style={capStyle(wide, allCap)}
             className="grid grid-cols-1 gap-2.5 lg:pr-1.5">
          {loading
            ? [1, 2, 3].map(i => <SkeletonCard key={i} />)
            : allVisible.map(item => (
                <ProgramCard key={item.id} item={item} accent="navy"
                  onDetail={() => handleDetail(item)}
                  aiDesc={aiDescs[item.id]} termDefs={termDefs} />
              ))
          }
        </div>
        {!loading && allSorted.length > INITIAL_COUNT && (
          <button type="button"
            onClick={() => setAllExpanded(v => !v)}
            className="w-full flex items-center justify-center gap-1 py-2 mt-1
                       border-t border-warm-gray/20 text-sm font-semibold text-navy hover:underline">
            {allExpanded ? '접기' : `${allSorted.length - INITIAL_COUNT}건 더보기`}
            <ChevronDown size={13} className={`transition-transform duration-150 ${allExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {!loading && allItems.length === 0 && (
        <p className="text-sm text-warm-text text-center py-8">현재 조건에 맞는 지원사업이 없어요.</p>
      )}
    </section>
  )
}
