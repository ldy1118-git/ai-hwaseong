import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import DeadlineCalendar from '../components/ui/DeadlineCalendar'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { listFavorites, subscribeFavorites } from '../utils/favorites'
import { taxCalendarEventsAround } from '../utils/taxCalendar'
import { listUnfinished, subscribeProgress } from '../utils/checklistProgress'
import { todayISO } from '../utils/today'
import TaxProfileHint from '../components/ui/TaxProfileHint'
import DayPanel from '../components/ui/DayPanel'

const LAYERS_KEY = 'mars-fit-schedule-layers'
const LAYERS_DEFAULT = { all: true, fav: true, tax: true }

function readLayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return LAYERS_DEFAULT
    // 저장된 것에 없는 열쇠는 기본값으로 채운다. 나중에 층이 하나 늘면
    // 예전에 저장한 사람 화면에서 그 층이 undefined 라 조용히 꺼져 있다.
    return { ...LAYERS_DEFAULT, ...saved }
  } catch {
    return LAYERS_DEFAULT
  }
}

function writeLayers(value) {
  try { localStorage.setItem(LAYERS_KEY, JSON.stringify(value)) } catch {}
}

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
    <section>
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

/* 무엇을 달력에 그릴지 고르는 칩.
 *
 * 라디오가 아니라 층(layer)이다. 셋 다 켤 수도, 하나만 켤 수도 있다.
 * 「전체 공고」와 「관심공고」는 겹치는 관계라 라디오로 두면 관심공고만
 * 보고 싶을 때 전체를 꺼야 하는지 헷갈린다. 각각 껐다 켜는 게 낫다. */
function LayerChip({ on, onClick, dot, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] font-semibold',
        'transition-colors duration-150',
        on ? 'bg-navy text-white border-navy'
           : 'bg-white text-warm-text border-warm-gray/40 hover:border-navy/40',
      ].join(' ')}
    >
      <span className={`leading-none ${on ? 'text-white' : dot.className}`}>{dot.glyph}</span>
      {label}
      <span className={`tabular-nums ${on ? 'text-white/70' : 'text-warm-gray'}`}>{count}</span>
    </button>
  )
}

/* 다가오는 세무 신고기한.
 *
 * 달력에는 ■ 점만 찍힌다. 날짜를 눌러야 무슨 신고인지 나오는데, 그러려면
 * 어느 날에 점이 있는지 먼저 찾아야 한다. 오른쪽에 펴두면 「이번 달에
 * 뭘 해야 하나」가 바로 읽힌다.
 *
 * 지난 것은 뺀다. 이미 지난 신고기한은 알려줘도 할 수 있는 게 없고,
 * 남은 것 사이에 섞이면 뭐가 남았는지가 흐려진다. */
function TaxSchedule({ events, profile, onPick }) {
  const today = todayISO()
  const upcoming = events.filter(e => e.dueDate >= today)
  if (upcoming.length === 0) return null

  const dday = (date) => Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  )

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-base font-bold text-navy">세무 신고기한</h3>
        <span className="text-sm font-bold text-emerald-600">{upcoming.length}건</span>
      </div>
      <p className="text-sm text-warm-text mb-3 leading-snug">
        기한을 넘기면 가산세가 붙어요. 공휴일·주말이면 다음 날로 밀린 날짜예요.
      </p>

      {/* 사업자 형태·과세유형을 안 정하면 해당될 수 있는 게 전부 뜬다.
          왜 많은지 말해주고 고칠 길을 준다. */}
      <TaxProfileHint profile={profile} className="mb-3" />
      <div className="space-y-2 lg:max-h-[62vh] lg:overflow-y-auto lg:pr-1">
        {upcoming.map((e, i) => {
          const left = dday(e.dueDate)
          const soon = left <= 7
          const [year, month, day] = e.dueDate.split('-')
          // 해가 바뀌는 자리에 줄을 하나 넣는다. 없으면 10.26 다음에 1.25 가
          // 와서 순서가 틀린 것처럼 읽힌다 — 내년 것인데 그 말이 어디에도 없다.
          const newYear = i > 0 && upcoming[i - 1].dueDate.slice(0, 4) !== year
          return (
            <div key={e.id}>
            {newYear && (
              <div className="flex items-center gap-2 pt-2 pb-1">
                <span className="text-[11px] font-bold text-warm-gray">{year}년</span>
                <span className="flex-1 h-px bg-warm-gray/30" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onPick?.(e.dueDate)}
              title="달력에서 이 날 보기"
              className={[
                'w-full text-left bg-white border rounded-xl px-4 py-3 flex items-center gap-3',
                'hover:border-emerald-600/60 transition-colors duration-150',
                soon ? 'border-emerald-600/40' : 'border-warm-gray/30',
              ].join(' ')}>
              <span className="text-sm font-bold text-emerald-700 tabular-nums flex-shrink-0 w-12">
                {Number(month)}.{Number(day)}
              </span>
              <span className="flex-1 text-sm font-medium text-navy leading-snug">
                {e.title}
                {/* 법정 기한이 공휴일이라 밀린 날. 달력을 보고 「왜 26일이지」
                    하는 사장님에게 이유를 준다. */}
                {e.moved && (
                  <span className="ml-1.5 text-[11px] font-normal text-warm-gray">밀림</span>
                )}
              </span>
              <span className={[
                'text-xs font-bold whitespace-nowrap flex-shrink-0',
                soon ? 'text-emerald-700' : 'text-warm-text',
              ].join(' ')}>
                {left === 0 ? '오늘' : `D-${left}`}
              </span>
            </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function InProgressCard({ inProgress, onResume, onPick }) {
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
      <div className="flex gap-2">
        <button
          onClick={onResume}
          className="flex-1 py-2.5 rounded-xl bg-navy text-white text-xs font-bold
                     hover:bg-navy/90 active:scale-[0.98] transition-all"
        >
          이어서 준비하기 →
        </button>
        {/* 마감일이 문구로만 적힌 공고가 절반이라, 달력에 없는 것도 있다. */}
        {inProgress.apply_period?.end && (
          <button
            onClick={() => onPick?.(inProgress.apply_period.end)}
            title="달력에서 마감일 보기"
            className="px-3 py-2.5 rounded-xl border border-warm-gray/40 text-xs font-bold
                       text-navy hover:border-navy/50 hover:bg-warm-gray/10 transition-colors"
          >
            달력에서
          </button>
        )}
      </div>
    </div>
  )
}

export default function Schedule() {
  const navigate = useNavigate()
  const [matches,    setMatches]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [inProgress, setInProgress] = useState([])
  const [favIds,     setFavIds]     = useState(() => listFavorites().map(f => f.notice_id))
  const [taxEvents,  setTaxEvents]  = useState([])
  const [profile,    setProfile]    = useState(null)

  // 달력에게 「이 날을 펴라」고 시킨다. seq 가 있어야 같은 날짜를 다시
  // 눌러도 반응한다 — 날짜만 넘기면 값이 안 바뀌어서 아무 일도 안 난다.
  const [focus, setFocus] = useState(null)
  const pickDate = date => setFocus(f => ({ date, seq: (f?.seq ?? 0) + 1 }))

  // 달력에서 고른 날. 오른쪽 단 맨 위에 그 날 내용을 편다. 창으로 띄웠더니
  // 다른 날을 보려면 매번 닫아야 했다.
  const [selectedDay, setSelectedDay] = useState(null)

  // 무엇을 그릴지. 셋 다 켠 채로 시작한다 — 처음 온 사람에게 뭐가 있는지
  // 다 보여주고, 많다 싶으면 끄게 한다. 반대로 하면 끈 줄 모르고 「공고가
  // 없네」 한다.
  //
  // 껐던 것은 기억한다. 관심공고만 보려고 매번 두 개를 끄는 사람이 있을
  // 텐데, 들어올 때마다 다시 켜져 있으면 그때마다 또 꺼야 한다.
  const [layers, setLayers] = useState(readLayers)
  const toggle = key => setLayers(v => {
    const next = { ...v, [key]: !v[key] }
    writeLayers(next)
    return next
  })

  useEffect(() => subscribeFavorites(
    () => setFavIds(listFavorites().map(f => f.notice_id)),
  ), [])

  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('mars-fit-profile')) } catch { return null }
    })() ?? DEFAULT_PROFILE

    setProfile(saved)
    // 사업자가 아니면 빈 배열이 나온다. 그러면 칩도 안 그린다.
    setTaxEvents(taxCalendarEventsAround(saved))

    fetchMatches(saved)
      .then(r => setMatches((r?.results ?? []).map(mapMatch)))
      .catch(() => {})
      .finally(() => setLoading(false))

  }, [])

  // 준비하다 만 공고는 여러 개일 수 있다. 예전에는 한 건만 저장돼서
  // 두 번째를 열면 첫 번째 체크가 사라졌다.
  useEffect(() => {
    const refresh = () => setInProgress(listUnfinished())
    refresh()
    return subscribeProgress(refresh)
  }, [])

  function resumeApply(item) {
    if (item?.raw) {
      localStorage.setItem('mars-fit-selected-match', JSON.stringify(item.raw))
    }
    navigate('/apply')
  }

  // 켠 층만 합친다. 관심공고는 전체 공고의 일부라, 전체를 켜면 이미
  // 들어와 있고 전체를 끄면 관심공고만 남는다.
  const favSet = new Set(favIds)
  const shown = layers.all
    ? matches
    : layers.fav
    ? matches.filter(m => favSet.has(m.id))
    : []
  const shownTax = layers.tax ? taxEvents : []
  const favCount = matches.filter(m => favSet.has(m.id)).length
  const nothingOn = !layers.all && !layers.fav && !layers.tax

  return (
    <div className="min-h-screen bg-primary-bg pb-20">
      <Header />
      <div className="max-w-4xl lg:max-w-6xl mx-auto px-5 pt-4 lg:pt-6">
        <h2 className="text-base font-bold text-navy mb-3">신청 마감 일정</h2>

        {/* 무엇을 그릴지 고르는 칩. 세무일정은 사업자에게만 있어서,
            없으면 칩 자체를 안 그린다 — 눌러도 아무것도 안 생기는 버튼은
            고장 난 것처럼 보인다. */}
        <div className="flex flex-wrap gap-2 mb-4">
          <LayerChip
            on={layers.all} onClick={() => toggle('all')}
            dot={{ glyph: '★', className: 'text-navy' }}
            label="전체 공고" count={matches.length}
          />
          <LayerChip
            on={layers.fav} onClick={() => toggle('fav')}
            dot={{ glyph: '★', className: 'text-sunset-orange' }}
            label="관심공고" count={favCount}
          />
          {taxEvents.length > 0 && (
            <LayerChip
              on={layers.tax} onClick={() => toggle('tax')}
              dot={{ glyph: '■', className: 'text-emerald-600' }}
              label="세무일정" count={taxEvents.length}
            />
          )}
        </div>

        {nothingOn && (
          <p className="mb-4 text-xs text-warm-text bg-white border border-warm-gray/30
                        rounded-xl px-4 py-3">
            표시할 것을 하나 이상 골라주세요.
          </p>
        )}
        {inProgress.map(item => (
          <InProgressCard
            key={item.notice_id}
            inProgress={item}
            onResume={() => resumeApply(item)}
            onPick={pickDate}
          />
        ))}

        {/* 넓은 화면에서는 두 단으로 편다.
            달력은 날짜가 있는 것만 그릴 수 있고, 상시 접수는 날짜가 없다.
            성격이 아예 다른 둘을 세로로 쌓아두면 상시 접수가 달력 밑에
            묻혀서 안 보인다 — 그런데 그게 59건 중 30건이다.
            나란히 놓으면 「날짜가 있는 것 / 없는 것」이 한눈에 갈린다. */}
        {/* 달력 칸을 정사각형으로 바꿨더니 폭이 그대로면 한 칸이 100px 가까이
            된다. 달력 쪽에 상한을 두고 남는 폭은 상시 접수에 준다 —
            공고 제목이 길어서 넓을수록 읽기 좋다. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)] lg:gap-x-6 lg:items-start">
          <div className="min-w-0">
            <DeadlineCalendar
              matches={shown} loading={loading} inProgressItems={inProgress}
              taxEvents={shownTax} focus={focus} onSelectDay={setSelectedDay}
            />
          </div>
          {/* 세무일정을 상시 접수보다 위에 둔다. 신청은 안 해도 그만이지만
              신고는 안 하면 가산세가 붙는다. */}
          {/* 여백을 여기서 한 번에 준다. 두 섹션이 각자 mt-6 lg:mt-0 을
              들고 있었더니, 넓은 화면에서 둘 다 mt-0 이 되어 붙어버렸다. */}
          <div className="min-w-0 mt-6 lg:mt-0 space-y-6">
            {/* 고른 날이 맨 위. 달력에서 같은 칸을 다시 누르면 사라진다. */}
            {selectedDay && (
              <DayPanel dateKey={selectedDay} matches={shown} taxEvents={shownTax} />
            )}
            <TaxSchedule events={shownTax} profile={profile} onPick={pickDate} />
            <AlwaysOpen matches={shown} />
          </div>
        </div>
      </div>
    </div>
  )
}
