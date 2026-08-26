import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import Header from '../components/layout/Header'
import DeadlineCalendar from '../components/ui/DeadlineCalendar'
import { fetchMatches, DEFAULT_PROFILE } from '../utils/api'
import { listFavorites, subscribeFavorites } from '../utils/favorites'
import { taxCalendarEventsAround } from '../utils/taxCalendar'
import { listUnfinished, subscribeProgress } from '../utils/checklistProgress'
import { todayISO } from '../utils/today'
import TaxProfileHint from '../components/ui/TaxProfileHint'
import DayPanel from '../components/ui/DayPanel'
import TaxRow from '../components/ui/TaxRow'
import FavoriteButton from '../components/ui/FavoriteButton'
import { listTaxDone, subscribeTaxDone, taxDoneKey } from '../utils/taxDone'

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

/* 오른쪽 단의 두 묶음을 접어둘 수 있게 한다.
 *
 * 셋을 다 켜면 오른쪽에 「세무 신고기한」과 「상시 접수」가 세로로 쌓인다.
 * 넓은 화면에서는 각각 62vh 까지 차서 둘을 합치면 화면 한 장을 넘고,
 * 좁은 화면에서는 상한이 없어서 더 길다. 아래 있는 상시 접수를 보려면
 * 세무 목록을 통째로 지나가야 했다.
 *
 * 무엇을 접어뒀는지는 **그 기기에만** 남긴다. 층 토글(LAYERS_KEY)과 같은
 * 성격이다 — 이 화면을 어떻게 보고 싶은지는 그 기기에서의 습관이지
 * 사장님의 자료가 아니다. 따라다니면 오히려 이상하다. */
const SECTIONS_KEY = 'mars-fit-schedule-sections'
const SECTIONS_DEFAULT = { fav: true, tax: true, always: true }   // true 가 펼침

function readSections() {
  try {
    const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return SECTIONS_DEFAULT
    return { ...SECTIONS_DEFAULT, ...saved }
  } catch {
    return SECTIONS_DEFAULT
  }
}

function writeSections(value) {
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(value)) } catch {}
}

/* 접었다 펴는 묶음.
 *
 * 테두리로 한 덩어리라는 걸 보여준다. 전에는 제목과 목록이 배경 위에
 * 그냥 떠 있어서, 두 묶음이 세로로 이어지면 어디까지가 세무이고 어디부터
 * 상시 접수인지가 안 갈렸다.
 *
 * 건수는 접어도 계속 보인다. 접은 목적이 「안 볼 것을 치우는 것」이지
 * 「없는 셈 치는 것」이 아니라서다. 남은 신고가 세 건인지 없는지는
 * 접어둔 채로도 알아야 한다.
 *
 * **높이는 grid-template-rows 로 움직인다.** 0fr → 1fr 로 가면 브라우저가
 * 내용 높이를 알아서 잡아준다. max-height 로 하면 실제보다 넉넉한 값을
 * 박아야 하는데, 그러면 짧은 묶음은 다 펴진 뒤에도 한참 더 기다린다.
 *
 * 접힌 동안에도 내용은 DOM 에 남는다(그래야 높이가 움직인다). 그대로 두면
 * Tab 키가 안 보이는 버튼 서른 개를 지나간다. `inert` 로 통째로 뺀다.
 *
 * inert 는 **빈 문자열로 넘긴다.** React 18 은 참/거짓을 모르는 속성으로
 * 보고 조용히 버린다(`inert={true}` 는 아무것도 안 붙는다). 19 에서 바뀌므로
 * 올릴 때 같이 볼 것. */
function CollapsibleSection({ title, count, tone, open, onToggle, children }) {
  return (
    <section className="rounded-2xl border border-warm-gray/30 bg-white shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-baseline gap-2 px-4 py-3.5 text-left group
                   hover:bg-warm-gray/5 transition-colors"
      >
        <h3 className="text-base font-bold text-navy">{title}</h3>
        <span className={`text-sm font-bold ${tone}`}>{count}</span>
        <ChevronDown
          size={18}
          className={`ml-auto self-center flex-shrink-0 text-warm-gray
                      transition-transform duration-300 group-hover:text-navy
                      motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out
                    motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden" inert={open ? undefined : ''}>
          {/* 제목과 내용 사이 실선. 접힐 때 같이 사라져야 해서 안쪽에 둔다. */}
          <div className="h-px bg-warm-gray/20" />
          <div className="px-4 pt-3 pb-4">{children}</div>
        </div>
      </div>
    </section>
  )
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

/* 담아둔 공고.
 *
 * 칩으로 「관심공고」만 켜도 **달력에 점만 찍히고 목록이 없었다.** 어느
 * 공고인지 보려면 칸을 하나씩 눌러야 했다. 홈에는 목록이 있는데 여기엔
 * 안 붙어 있었다 — 담아둔 것을 보러 오는 화면이 정작 일정인데도.
 *
 * 마감이 가까운 순이고, 마감일이 없는 것은 뒤로 보낸다 — 「상시 접수」
 * 묶음이 아래에 따로 있어서 거기서 다시 만난다.
 */
function Favorites({ matches, favSet, open, onToggle }) {
  const navigate = useNavigate()

  const list = matches
    .filter(m => favSet.has(m.id))
    .sort((a, b) => {
      if (a.dDay === null) return b.dDay === null ? 0 : 1
      if (b.dDay === null) return -1
      return a.dDay - b.dDay
    })

  if (list.length === 0) return null

  return (
    <CollapsibleSection
      title="관심공고" count={`${list.length}건`} tone="text-sunset-orange"
      open={open} onToggle={onToggle}
    >
      <p className="text-sm text-warm-text mb-3 leading-snug">
        ★ 로 담아두신 것이에요. 마감이 가까운 것부터 보여드려요.
      </p>
      <div className="space-y-2 lg:max-h-[58vh] lg:overflow-y-auto lg:pr-1">
        {list.map(m => (
          <div key={m.id}
            className="bg-primary-bg border border-warm-gray/25 rounded-xl pl-1.5 pr-4 py-2.5
                       hover:border-navy/40 transition flex items-start gap-1.5">
            <FavoriteButton notice={m} size={18} className="mt-0.5" />
            <button
              onClick={() => {
                localStorage.setItem('mars-fit-selected-match', JSON.stringify(m.raw))
                navigate('/notice')
              }}
              className="flex-1 min-w-0 text-left flex items-start gap-3 py-0.5">
              <span className="flex-1 text-sm font-medium text-navy leading-snug line-clamp-2">
                {m.title}
              </span>
              <span className={[
                'text-xs font-bold whitespace-nowrap mt-0.5',
                m.dDay === null ? 'text-warm-gray'
                  : m.dDay <= 7 ? 'text-sunset-orange' : 'text-warm-text',
              ].join(' ')}>
                {m.dDay === null ? '마감일 미정'
                  : m.dDay === 0 ? '오늘 마감'
                    : `D-${m.dDay}`}
              </span>
            </button>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  )
}

/* 마감일이 없는 공고를 따로 모아 보여준다.
 *
 * 달력은 날짜가 있는 것만 그릴 수 있어서 apply_period.end 가 없으면
 * 조용히 버린다. 그런데 지금 공고 59건 중 30건이 「예산 소진시까지」
 * 처럼 문구로만 적혀 있다. 절반이 넘는 공고가 이 화면에서 통째로
 * 사라지는데 화면에는 그런 티가 안 났다. 아래에 따로 세운다. */
function AlwaysOpen({ matches, hideIds, open, onToggle }) {
  const navigate = useNavigate()
  const list = matches.filter(m =>
    m.dDay === null && m.raw?.apply_period?.note && !hideIds?.has(m.id))
  if (list.length === 0) return null

  return (
    <CollapsibleSection
      title="상시 접수" count={`${list.length}건`} tone="text-sunset-orange"
      open={open} onToggle={onToggle}
    >
      <p className="text-sm text-warm-text mb-3 leading-snug">
        마감일이 정해져 있지 않아 달력에는 없어요. 예산이 떨어지면 닫히니 서두르는 게 좋아요.
      </p>
      {/* 30건이 그대로 늘어서면 달력 옆에서 화면을 한참 넘긴다.
          넓은 화면에서만 높이를 재고 안에서 스크롤한다. */}
      {/* 한 줄 안에 누를 데가 둘이다 — ★ 와 제목. 줄 전체를 <button> 으로
          두고 그 안에 별을 넣으면 버튼 안의 버튼이라 잘못된 마크업이 된다.
          바깥을 <div> 로 바꾸고 둘을 나란히 놓는다.

          ★ 를 제목 앞에 둔 이유는, 마감일이 없는 공고라 「지금 신청할까」
          보다 「일단 담아두자」가 먼저 나오기 때문이다. 예산이 떨어지면
          닫히는데 그게 언제인지는 아무도 안 알려준다. */}
      <div className="space-y-2 lg:max-h-[58vh] lg:overflow-y-auto lg:pr-1">
        {list.map(m => (
          <div key={m.id}
            className="bg-primary-bg border border-warm-gray/25 rounded-xl pl-1.5 pr-4 py-2.5
                       hover:border-navy/40 transition flex items-start gap-1.5">
            <FavoriteButton notice={m} size={18} className="mt-0.5" />
            <button
              onClick={() => {
                localStorage.setItem('mars-fit-selected-match', JSON.stringify(m.raw))
                navigate('/notice')
              }}
              className="flex-1 min-w-0 text-left flex items-start gap-3 py-0.5">
              <span className="flex-1 text-sm font-medium text-navy leading-snug line-clamp-2">
                {m.title}
              </span>
              <span className="text-xs font-bold text-warm-text whitespace-nowrap mt-0.5">
                {m.raw.apply_period.note}
              </span>
            </button>
          </div>
        ))}
      </div>
    </CollapsibleSection>
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
        'tap flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] font-semibold',
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
 * 남은 것 사이에 섞이면 뭐가 남았는지가 흐려진다.
 *
 * 줄을 누르면 펴지면서 달력도 그 날로 옮겨간다. 무엇을 준비해야 하는지와
 * 그게 언제인지를 한 번에 본다. */
function TaxSchedule({ events, profile, onPick, open, onToggle }) {
  const today = todayISO()
  const [openId, setOpenId]   = useState(null)
  const [doneMap, setDoneMap] = useState(listTaxDone)

  useEffect(() => subscribeTaxDone(() => setDoneMap(listTaxDone())), [])

  const doneOf = e => Boolean(doneMap[taxDoneKey(e.groupId ?? e.id, e.dueDate)])

  /* 매월 반복은 제일 가까운 한 건만 남긴다.
   *
   * 안 접으면 직원 있는 사장님 화면에서 「원천세 신고·납부 (매월)」이
   * 열여섯 줄 이어진다. 달력에는 열두 개 점이 그대로 찍힌다 — 목록은
   * 할 일이고 달력은 지도다.
   *
   * 이번 달 것을 완료로 찍으면 다음 달 것으로 넘어간다. 안 넘기면 체크한
   * 순간 원천세가 목록에서 사라져서 다음 달을 챙길 데가 없어진다. */
  const upcoming = useMemo(() => {
    const future = events.filter(e => e.dueDate >= today)
    const picked = new Set()
    const out = []
    for (const e of future) {
      if (!e.recurring) { out.push(e); continue }
      if (picked.has(e.groupId)) continue
      const laterUndone = future.some(
        x => x.recurring && x.groupId === e.groupId && x.dueDate > e.dueDate && !doneOf(x),
      )
      if (doneOf(e) && laterUndone) continue
      picked.add(e.groupId)
      out.push(e)
    }
    return out
  }, [events, today, doneMap])

  if (upcoming.length === 0) return null

  const left = upcoming.filter(e => !doneOf(e)).length

  return (
    <CollapsibleSection
      title="세무 신고기한"
      count={left > 0 ? `${left}건` : '다 하셨어요'}
      tone="text-emerald-600"
      open={open} onToggle={onToggle}
    >
      <p className="text-sm text-warm-text mb-3 leading-snug">
        기한을 넘기면 가산세가 붙어요. 공휴일·주말이면 다음 날로 밀린 날짜예요.
        줄을 누르면 무엇을 준비할지 펴져요.
      </p>

      {/* 사업자 형태·과세유형을 안 정하면 해당될 수 있는 게 전부 뜬다.
          왜 많은지 말해주고 고칠 길을 준다. */}
      <TaxProfileHint profile={profile} className="mb-3" />

      <div className="lg:max-h-[58vh] lg:overflow-y-auto">
        {upcoming.map((e, i) => {
          const [year] = e.dueDate.split('-')
          // 해가 바뀌는 자리에 줄을 하나 넣는다. 없으면 10.26 다음에 1.25 가
          // 와서 순서가 틀린 것처럼 읽힌다 — 내년 것인데 그 말이 어디에도 없다.
          const newYear = i > 0 && upcoming[i - 1].dueDate.slice(0, 4) !== year
          return (
            <div key={e.id}>
              {newYear && (
                <div className="flex items-center gap-2 pt-3 pb-1">
                  <span className="text-[13px] font-bold text-warm-gray">{year}년</span>
                  <span className="flex-1 h-px bg-warm-gray/30" />
                </div>
              )}
              <TaxRow
                item={e}
                done={doneOf(e)}
                open={openId === e.id}
                onToggle={() => {
                  const next = openId === e.id ? null : e.id
                  setOpenId(next)
                  // 펼 때만 달력을 옮긴다. 접을 때도 튀면 어지럽다.
                  if (next) onPick?.(e.dueDate)
                }}
              />
            </div>
          )
        })}
      </div>
    </CollapsibleSection>
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

  // 오른쪽 단의 두 묶음이 접혀 있는지. 층 토글과 같이 그 기기에만 남는다.
  const [sections, setSections] = useState(readSections)
  const toggleSection = key => setSections(v => {
    const next = { ...v, [key]: !v[key] }
    writeSections(next)
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
            {/* 층 칩을 끄면 이 묶음도 같이 사라진다. 달력에서 뺐는데
                옆에 목록이 남아 있으면 껐다는 말이 아니다. */}
            {layers.fav && (
              <Favorites
                matches={matches} favSet={favSet}
                open={sections.fav} onToggle={() => toggleSection('fav')}
              />
            )}
            <TaxSchedule
              events={shownTax} profile={profile} onPick={pickDate}
              open={sections.tax} onToggle={() => toggleSection('tax')}
            />
            {/* 담아둔 것은 위 「관심공고」 묶음에 이미 있다. 여기 또 그리면
                같은 공고가 한 화면에 두 번 뜬다. 단 관심공고 층이 꺼져 있으면
                위 묶음이 없으므로 빼지 않는다 — 빼면 아예 안 보인다. */}
            <AlwaysOpen
              matches={shown}
              hideIds={layers.fav ? favSet : null}
              open={sections.always} onToggle={() => toggleSection('always')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
