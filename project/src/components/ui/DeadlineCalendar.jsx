import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, CornerUpLeft } from 'lucide-react'
import { listNotes, setNote, noteKey, subscribeNotes } from '../../utils/calendarNotes'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param taxEvents  세무일정. `utils/taxCalendar.js` 의 taxCalendarEvents() 모양.
 *                   기본값이 빈 배열이라 안 넘기면 예전처럼 공고만 그린다.
 */
/* 날짜 하나에 붙는 메모. 달력 위에 뜨는 창이다.
 *
 * 처음에는 달력 아래에 칸을 폈는데, 적으려면 화면을 내려야 하고 적는
 * 동안 어느 날을 고른 건지 안 보였다. 위에 띄우면 달력이 그대로 뒤에
 * 남는다.
 *
 * 창에는 저장 버튼을 둔다. 아래 칸일 때는 손을 떼면 저장하게 했는데,
 * 창은 닫는 동작(바깥 누르기·Esc)이 분명해서 그때 저장인지 취소인지가
 * 애매해진다. 물어보지 말고 버튼으로 가른다. */
function DayNoteDialog({ dateKey, value, onSave, onClose }) {
  const [draft, setDraft] = useState(value)
  const boxRef = useRef(null)

  useEffect(() => { setDraft(value) }, [dateKey, value])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // 열자마자 적을 수 있게. 한 번 더 눌러야 하면 창을 띄운 값이 없다.
    boxRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const [year, month, day] = dateKey.split('-')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
         role="dialog" aria-modal="true" aria-label="메모">
      <div className="absolute inset-0 bg-navy/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Pencil size={14} className="text-amber-500" />
          <p className="text-sm font-extrabold text-navy">
            {Number(month)}월 {Number(day)}일 메모
          </p>
          <span className="ml-auto text-[11px] text-warm-gray">{year}년</span>
        </div>

        <textarea
          ref={boxRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          placeholder="이 날 할 일을 적어두세요"
          className="w-full resize-y rounded-xl border border-warm-gray/40 bg-white
                     px-3.5 py-2.5 text-sm text-navy leading-relaxed
                     placeholder:text-warm-gray
                     focus:outline-none focus:border-amber-500/70"
        />

        <div className="flex gap-2 mt-4">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-warm-gray/40
                       text-xs font-bold text-warm-text hover:bg-warm-gray/10 transition-colors">
            취소
          </button>
          {/* 비우고 저장하면 지워진다. 「지우기」를 따로 두면 버튼이 셋이 된다. */}
          <button
            type="button" onClick={() => { onSave(draft); onClose() }}
            className="flex-1 py-2.5 rounded-xl bg-navy text-white text-xs font-bold
                       hover:bg-navy/90 active:scale-[.99] transition-all">
            {draft.trim() ? '저장' : value ? '메모 지우기' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * @param focus  { date: 'YYYY-MM-DD', seq: number } — 밖에서 특정 날짜를 펴게
 *               한다. 오른쪽 목록에서 항목을 누르면 달력이 그 달로 넘어가고
 *               그 칸이 선택된다. seq 는 같은 날짜를 다시 눌러도 반응하게
 *               하려고 있다 — 날짜만 보면 값이 안 바뀌어서 아무 일도 안 난다.
 */
export default function DeadlineCalendar({
  matches = [], loading, inProgress = null, inProgressItems = [], taxEvents = [],
  focus = null,
}) {
  const navigate = useNavigate()
  const today    = new Date()
  const boxRef   = useRef(null)

  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selKey, setSelKey] = useState(null)

  // date-key → { urgent: Match[], regular: Match[] }
  const deadlineMap = useMemo(() => {
    const map = {}
    matches.forEach(m => {
      const end = m.raw?.apply_period?.end
      if (!end) return
      const d = new Date(end)
      if (isNaN(d)) return
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = { urgent: [], regular: [] }
      ;(m.dDay !== null && m.dDay <= 14 ? map[key].urgent : map[key].regular).push(m)
    })
    return map
  }, [matches])

  // 'YYYY-MM-DD' → 메모. 달력 칸의 열쇠(`${y}-${m0}-${d}`)와 형식이 다르다.
  // 달력 쪽은 월이 0부터라 저장 열쇠로 쓰면 다른 화면에서 읽을 때 어긋난다.
  const [notes, setNotes] = useState(() => listNotes())
  const [noteOpen, setNoteOpen] = useState(false)
  useEffect(() => subscribeNotes(() => setNotes(listNotes())), [])

  // date-key → TaxEvent[]. 공고와 따로 둔다. 같은 날에 둘 다 있을 수 있고,
  // 「신청 마감」과 「신고 기한」은 놓쳤을 때 벌어지는 일이 아예 다르다.
  const taxMap = useMemo(() => {
    const map = {}
    taxEvents.forEach(e => {
      const [y, m, d] = (e.dueDate ?? '').split('-').map(Number)
      if (!y || !m || !d) return
      const key = `${y}-${m - 1}-${d}`
      ;(map[key] ??= []).push(e)
    })
    return map
  }, [taxEvents])

  // 밖에서 날짜를 지정하면 그 달로 넘어가 그 칸을 편다.
  useEffect(() => {
    if (!focus?.date) return
    const [y, m, d] = focus.date.split('-').map(Number)
    if (!y || !m || !d) return
    setYear(y)
    setMonth(m - 1)
    setSelKey(`${y}-${m - 1}-${d}`)
    // 좁은 화면에서는 달력이 목록보다 위에 있다. 안 옮겨주면 눌러도
    // 화면에 아무 변화가 없어 보인다.
    //
    // 'nearest' 인 이유 — 넓은 화면에서는 달력과 목록이 나란히 있어서
    // 이미 다 보인다. 'start' 로 두면 볼 필요도 없는데 화면이 덜컥 움직인다.
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focus?.date, focus?.seq])

  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  const awayFromToday =
    year !== today.getFullYear() || month !== today.getMonth() ||
    (selKey !== null && selKey !== todayKey)

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelKey(todayKey)
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelKey(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelKey(null)
  }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells       = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  // 준비 중인 공고는 여러 개일 수 있다. inProgress(한 건)는 옛 호출부를
  // 위해 남겨두고 같이 합친다.
  const inProgressKeys = useMemo(() => {
    const keys = new Set()
    for (const item of [...(inProgress ? [inProgress] : []), ...inProgressItems]) {
      const end = item?.apply_period?.end
      if (!end) continue
      const d = new Date(end)
      if (isNaN(d)) continue
      keys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }
    return keys
  }, [inProgress, inProgressItems])

  const selData = selKey ? (deadlineMap[selKey] ?? { urgent: [], regular: [] }) : null
  const selList = selData ? [...selData.urgent, ...selData.regular] : []
  const selTax  = selKey ? (taxMap[selKey] ?? []) : []

  // 선택한 칸의 저장용 열쇠. selKey 는 'YYYY-M-D'(월 0시작)라 그대로 못 쓴다.
  const selNoteKey = selKey
    ? (([y, m, d]) => noteKey(Number(y), Number(m), Number(d)))(selKey.split('-'))
    : null

  return (
    <section ref={boxRef} className="px-5 pb-8 scroll-mt-20">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-sunset-orange" />
        <h2 className="text-sm font-bold text-navy">마감 캘린더</h2>
      </div>

      <div className="bg-white border border-warm-gray/20 rounded-2xl p-4 shadow-sm">
        {/* 월 이동 */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth}
            className="w-8 h-8 rounded-full hover:bg-warm-gray/20 flex items-center justify-center
                       text-navy text-xl font-bold transition-colors leading-none">
            ‹
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-navy">{year}년 {month + 1}월</span>
            {/* 다른 달을 뒤지다 보면 돌아오는 길이 없었다. 이번 달을 보고
                있고 고른 칸도 없으면 누를 이유가 없어서 안 그린다. */}
            {awayFromToday && (
              <button
                type="button" onClick={goToday}
                className="flex items-center gap-1 px-2 py-1 rounded-full
                           border border-warm-gray/40 text-[11px] font-bold text-navy
                           hover:border-navy/50 hover:bg-warm-gray/10 transition-colors">
                <CornerUpLeft size={11} /> 오늘
              </button>
            )}
          </div>
          <button onClick={nextMonth}
            className="w-8 h-8 rounded-full hover:bg-warm-gray/20 flex items-center justify-center
                       text-navy text-xl font-bold transition-colors leading-none">
            ›
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-[13px] lg:text-sm font-semibold py-1
              ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-warm-text'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 —
            전에는 세로가 py-1.5 로 40px 쯤 고정이었다. 넓은 화면에서는
            칸 폭이 100px 가까이 되는데 높이는 그대로라 납작해 보였다.
            정사각형으로 두면 어느 폭에서든 달력다운 비율이 나온다. */}
        <div className="grid grid-cols-7 gap-0.5 lg:gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const key     = `${year}-${month}-${day}`
            const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate()
            const isSel   = selKey === key
            const dl      = deadlineMap[key]
            const hasU    = (dl?.urgent?.length ?? 0) > 0
            const hasR    = (dl?.regular?.length ?? 0) > 0
            const hasIP   = inProgressKeys.has(key)
            const hasTax  = (taxMap[key]?.length ?? 0) > 0
            const hasNote = Boolean(notes[noteKey(year, month, day)])
            const isSun   = (firstDay + day - 1) % 7 === 0
            const isSat   = (firstDay + day - 1) % 7 === 6

            const bgClass = isSel
              ? 'bg-navy text-white'
              : hasU
              ? 'bg-sunset-orange/15'
              : hasR
              ? 'bg-navy/10'
              : 'hover:bg-warm-gray/10'

            const textClass = isSel
              ? 'font-extrabold text-white'
              : isToday
              ? 'font-extrabold text-navy'
              : isSun
              ? 'text-red-400 font-medium'
              : isSat
              ? 'text-blue-400 font-medium'
              : 'text-gray-700 font-medium'

            return (
              <button key={day}
                onClick={() => { setNoteOpen(false); setSelKey(prev => prev === key ? null : key) }}
                className={[
                  'relative aspect-square flex flex-col items-center justify-center gap-1',
                  'rounded-xl transition-colors',
                  bgClass,
                  isToday && !isSel ? 'ring-1 ring-inset ring-navy/40' : '',
                ].join(' ')}>
                {/* 메모는 모서리 점으로. 아래 줄에 네 번째 글자를 넣으면
                    좁은 화면에서 칸을 넘친다. */}
                {hasNote && (
                  <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full
                    ${isSel ? 'bg-white' : 'bg-amber-500'}`} />
                )}
                <span className={`text-xs lg:text-base leading-none ${textClass}`}>{day}</span>
                <div className="h-3 flex items-center gap-0.5">
                  {(hasU || hasR) && !isSel && (
                    <span className={`text-[13px] lg:text-base leading-none ${hasU ? 'text-sunset-orange' : 'text-navy'}`}>★</span>
                  )}
                  {hasIP && !isSel && (
                    <span className="text-[13px] lg:text-base leading-none text-blue-400">◉</span>
                  )}
                  {hasTax && !isSel && (
                    <span className="text-[13px] lg:text-base leading-none text-emerald-600">■</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* 범례 */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-warm-gray/20">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] leading-none text-sunset-orange">★</span>
            <span className="text-[13px] text-warm-text">긴급 마감 (D-14 이내)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] leading-none text-navy">★</span>
            <span className="text-[13px] text-warm-text">일반 마감</span>
          </div>
          {inProgressKeys.size > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] leading-none text-blue-400">◉</span>
              <span className="text-[13px] text-warm-text">서류 준비 중</span>
            </div>
          )}
          {taxEvents.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] leading-none text-emerald-600">■</span>
              <span className="text-[13px] text-warm-text">세무 신고기한</span>
            </div>
          )}
          {Object.keys(notes).length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-[13px] text-warm-text">내 메모</span>
            </div>
          )}
        </div>
      </div>

      {/* 고른 날의 메모. 공고도 세무일정도 없는 날에도 적을 수 있어야 해서
          목록이 비어 있어도 그린다. 적힌 게 있으면 눌러보기 전에 보여준다. */}
      {selNoteKey && (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="mt-3 w-full flex items-start gap-2 text-left
                     bg-white border border-warm-gray/40 rounded-xl px-3.5 py-2.5
                     hover:border-amber-500/60 transition-colors duration-150">
          <Pencil size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
          {notes[selNoteKey] ? (
            <span className="flex-1 min-w-0 text-sm text-navy leading-relaxed whitespace-pre-line">
              {notes[selNoteKey]}
            </span>
          ) : (
            <span className="flex-1 text-sm text-warm-gray">이 날 할 일을 적어두세요</span>
          )}
        </button>
      )}

      {noteOpen && selNoteKey && (
        <DayNoteDialog
          dateKey={selNoteKey}
          value={notes[selNoteKey] ?? ''}
          onSave={text => setNote(selNoteKey, text)}
          onClose={() => setNoteOpen(false)}
        />
      )}

      {/* 선택한 날짜의 세무 신고기한 —
          공고보다 위에 둔다. 신청은 안 해도 그만이지만 신고는 안 하면
          가산세가 붙는다. 눌러도 이동하지 않는다 — 세무일정 화면은
          사업자에게만 있어서, 눌렀는데 아무 데도 못 가면 더 헷갈린다. */}
      {selTax.length > 0 && (
        <div className="mt-3 space-y-2">
          {selTax.map(e => (
            <div key={e.id}
              className="bg-emerald-50 border border-emerald-600/25 rounded-xl px-4 py-3
                         flex items-center gap-3">
              <span className="text-emerald-600 text-[13px] leading-none flex-shrink-0">■</span>
              <span className="flex-1 text-sm font-medium text-navy leading-snug">{e.title}</span>
              <span className="text-xs font-bold text-emerald-700 flex-shrink-0">신고기한</span>
            </div>
          ))}
        </div>
      )}

      {/* 선택한 날짜의 공모 목록 */}
      {selData && selList.length === 0 && selTax.length === 0 && (
        <p className="mt-2 text-xs text-warm-text text-center">이 날은 마감하는 공모가 없어요.</p>
      )}
      {selList.length > 0 && (
        <div className="mt-3 space-y-2">
          {selList.map(m => {
            const isUrgent = selData.urgent.includes(m)
            return (
              <button key={m.id}
                onClick={() => {
                  localStorage.setItem('mars-fit-selected-match', JSON.stringify(m.raw))
                  navigate('/notice')
                }}
                className={[
                  'w-full text-left bg-white border rounded-xl px-4 py-3',
                  'flex items-center gap-3 hover:shadow-sm transition-shadow',
                  isUrgent ? 'border-sunset-orange/30' : 'border-warm-gray/20',
                ].join(' ')}>
                <span className={`text-xs font-bold flex-shrink-0 w-10
                  ${isUrgent ? 'text-sunset-orange' : 'text-navy'}`}>
                  {m.dDay !== null ? `D-${m.dDay}` : '마감'}
                </span>
                <p className="text-xs text-navy font-medium flex-1 line-clamp-2 text-left">
                  {m.title}
                </p>
                <span className="text-warm-gray/40 text-lg flex-shrink-0">›</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
