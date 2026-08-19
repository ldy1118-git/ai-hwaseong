import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import DeadlineCalendar from '../components/ui/DeadlineCalendar'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'

function calcDDay(end) {
  if (!end) return null
  return Math.ceil((new Date(end) - new Date()) / 86400000)
}

function mapMatch(r) {
  return {
    id:    r.notice_id,
    title: r.notice_title,
    score: r.match_score,
    dDay:  calcDDay(r.apply_period?.end),
    raw:   r,
  }
}

/* 마감일이 없는 공고를 따로 모아 보여준다.
 *
 * 달력은 날짜가 있는 것만 그릴 수 있어서 apply_period.end 가 없으면
 * 조용히 버린다. 그런데 지금 공고 59건 중 30건이 「예산 소진시까지」
 * 처럼 문구로만 적혀 있다. 절반이 넘는 공고가 이 화면에서 통째로
 * 사라지는데 화면에는 그런 티가 안 났다. 아래에 따로 세운다. */
function AlwaysOpen({ matches }) {
  const navigate = useNavigate()
  const list = matches.filter(m => m.dDay === null && m.raw?.apply_period?.note)
  if (list.length === 0) return null

  return (
    <section className="mt-6 lg:mt-0">
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-base font-bold text-navy">상시 접수</h3>
        <span className="text-sm font-bold text-sunset-orange">{list.length}건</span>
      </div>
      <p className="text-sm text-warm-text mb-3 leading-snug">
        마감일이 정해져 있지 않아 달력에는 없어요. 예산이 떨어지면 닫히니 서두르는 게 좋아요.
      </p>
      {/* 30건이 그대로 늘어서면 달력 옆에서 화면을 한참 넘긴다.
          넓은 화면에서만 높이를 재고 안에서 스크롤한다. */}
      <div className="space-y-2 lg:max-h-[62vh] lg:overflow-y-auto lg:pr-1">
        {list.map(m => (
          <button key={m.id}
            onClick={() => {
              localStorage.setItem('mars-fit-selected-match', JSON.stringify(m.raw))
              navigate('/notice')
            }}
            className="w-full text-left bg-white border border-warm-gray/30 rounded-xl px-4 py-3
                       hover:border-navy/40 transition flex items-start gap-3">
            <span className="flex-1 text-sm font-medium text-navy leading-snug line-clamp-2">
              {m.title}
            </span>
            <span className="text-xs font-bold text-warm-text whitespace-nowrap mt-0.5">
              {m.raw.apply_period.note}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function InProgressCard({ inProgress, onResume }) {
  const pct = inProgress.totalCount > 0
    ? Math.round((inProgress.checkedCount / inProgress.totalCount) * 100)
    : 0
  return (
    <div className="mb-4 bg-white border border-navy/20 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
        <p className="text-xs font-bold text-navy">서류 준비 중</p>
        <span className="ml-auto text-xs text-warm-text flex-shrink-0">
          {inProgress.checkedCount}/{inProgress.totalCount} 완료
        </span>
      </div>
      <p className="text-sm font-medium text-navy line-clamp-2 mb-3 leading-snug">
        {inProgress.notice_title}
      </p>
      <div className="h-1.5 bg-warm-gray/20 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-sunset-orange rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <button
        onClick={onResume}
        className="w-full py-2.5 rounded-xl bg-navy text-white text-xs font-bold
                   hover:bg-navy/90 active:scale-[0.98] transition-all"
      >
        이어서 준비하기 →
      </button>
    </div>
  )
}

export default function Schedule() {
  const navigate = useNavigate()
  const [matches,    setMatches]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [inProgress, setInProgress] = useState(null)

  useEffect(() => {
    const profile = (() => {
      try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
    })() ?? DEFAULT_PROFILE

    fetchMatches(profile)
      .then(r => setMatches((r?.results ?? []).map(mapMatch)))
      .catch(() => {})
      .finally(() => setLoading(false))

    try {
      const saved = JSON.parse(localStorage.getItem('mars-fit-checklist-progress') ?? 'null')
      if (saved?.notice_id && (saved.checkedCount ?? 0) < (saved.totalCount ?? 1)) {
        setInProgress(saved)
      }
    } catch {}
  }, [])

  function resumeApply() {
    if (inProgress?.raw) {
      localStorage.setItem('mars-fit-selected-match', JSON.stringify(inProgress.raw))
    }
    navigate('/apply')
  }

  return (
    <div className="min-h-screen bg-primary-bg pb-20">
      <Header />
      <div className="max-w-4xl lg:max-w-6xl mx-auto px-5 pt-4 lg:pt-6">
        <h2 className="text-base font-bold text-navy mb-4">신청 마감 일정</h2>
        {inProgress && (
          <InProgressCard inProgress={inProgress} onResume={resumeApply} />
        )}

        {/* 넓은 화면에서는 두 단으로 편다.
            달력은 날짜가 있는 것만 그릴 수 있고, 상시 접수는 날짜가 없다.
            성격이 아예 다른 둘을 세로로 쌓아두면 상시 접수가 달력 밑에
            묻혀서 안 보인다 — 그런데 그게 59건 중 30건이다.
            나란히 놓으면 「날짜가 있는 것 / 없는 것」이 한눈에 갈린다. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-6 lg:items-start">
          <div className="min-w-0">
            <DeadlineCalendar matches={matches} loading={loading} inProgress={inProgress} />
          </div>
          <div className="min-w-0">
            <AlwaysOpen matches={matches} />
          </div>
        </div>
      </div>
    </div>
  )
}
