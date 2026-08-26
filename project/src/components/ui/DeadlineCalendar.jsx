import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, CornerUpLeft, X as XIcon } from 'lucide-react'
import { listNotes, setNote, noteKey, subscribeNotes } from '../../utils/calendarNotes'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param taxEvents  세무일정. `utils/taxCalendar.js` 의 taxCalendarEvents() 모양.
 *                   기본값이 빈 배열이라 안 넘기면 예전처럼 공고만 그린다.
 */
/* 고른 날 하나에 대한 모든 것. 달력 위에 뜬다.
 *
 * 처음에는 달력 아래에 폈다. 그러면 날짜를 누를 때마다 아래가 늘었다
 * 줄었다 해서 달력 자체가 위아래로 움직였고, 목록을 보려면 화면을 내려야
 * 해서 어느 날을 고른 건지 안 보였다. 위에 띄우면 달력이 그대로 뒤에 남고
 * 아래는 비어 있다.
 *
 * 세무 신고기한을 공고보다 위에 둔다. 신청은 안 해도 그만이지만 신고는
 * 안 하면 가산세가 붙는다.
 */
function DayDialog({
  dateKey, taxList, noticeList, urgentSet, note, onSaveNote, onOpenNotice, onClose,
}) {
  const [draft, setDraft] = useState(note)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setDraft(note); setSaved(false) }, [dateKey, note])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const [year, month, day] = dateKey.split('-')
  const empty = taxList.length === 0 && noticeList.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
         role="dialog" aria-modal="true" aria-label={`${Number(month)}월 ${Number(day)}일`}>
      <div className="absolute inset-0 bg-navy/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl
                      max-h-[85vh] flex flex-col">

        <div className="flex items-center gap-2 px-5 pt-5 pb-3 flex-shrink-0">
          <p className="text-base font-extrabold text-navy">
            {Number(month)}월 {Number(day)}일
          </p>
          <span className="text-[11px] text-warm-gray">{year}년</span>
          <button type="button" onClick={onClose} aria-label="닫기"
            className="tap ml-auto p-1 rounded-full text-warm-gray hover:bg-warm-gray/15">
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {taxList.map(e => (
            <div key={e.id}
              className="bg-emerald-50 border border-emerald-600/25 rounded-xl px-4 py-3
                         flex items-center gap-3">
              <span className="text-emerald-600 text-[13px] leading-none flex-shrink-0">■</span>
              <span className="flex-1 text-sm font-medium text-navy leading-snug">{e.title}</span>
              <span className="text-xs font-bold text-emerald-700 flex-shrink-0">신고기한</span>
            </div>
          ))}

          {noticeList.map(m => {
            const isUrgent = urgentSet.has(m)
            return (
              <button key={m.id} onClick={() => onOpenNotice(m)}
                className={[
                  'w-full text-left bg-white border rounded-xl px-4 py-3',
                  'flex items-center gap-3 hover:shadow-sm transition-shadow',
                  isUrgent ? 'border-sunset-orange/30' : 'border-warm-gray/20',
                ].join(' ')}>
                <span className={`text-xs font-bold flex-shrink-0 w-10
                  ${isUrgent ? 'text-sunset-orange' : 'text-navy'}`}>
                  {m.dDay !== null ? `D-${m.dDay}` : '마감'}
                </span>
                <p className="text-xs text-navy font-medium flex-1 line-clamp-2">{m.title}</p>
                <span className="text-warm-gray/40 text-lg flex-shrink-0">›</span>
              </button>
            )
          })}

          {empty && (
            <p className="text-xs text-warm-text text-center py-1">
              이 날은 마감하는 공모가 없어요.
            </p>
          )}

          {/* 메모는 언제나 그린다. 공고도 세무일정도 없는 날에 적을 일이
              오히려 더 많다. */}
          <div className="pt-1">
            <label className="flex items-center gap-1.5 mb-1.5 text-[12px] font-bold text-warm-text">
              <Pencil size={12} className="text-amber-500" />
              메모
              {saved && <span className="font-medium text-emerald-600">저장됐어요</span>}
            </label>
            <textarea
              value={draft}
              onChange={e => { setDraft(e.target.value); setSaved(false) }}
              rows={3}
              placeholder="이 날 할 일을 적어두세요"
              className="w-full resize-y rounded-xl border border-warm-gray/40 bg-white
                         px-3.5 py-2.5 text-sm text-navy leading-relaxed
                         placeholder:text-warm-gray
                         focus:outline-none focus:border-amber-500/70"
            />
            {/* 비우고 저장하면 지워진다. 「지우기」를 따로 두면 버튼이 둘이 된다. */}
            <button
              type="button"
              onClick={() => { onSaveNote(draft); setSaved(true) }}
              disabled={draft.trim() === note.trim()}
              className="mt-2 w-full py-2.5 rounded-xl bg-navy text-white text-xs font-bold
                         disabled:opacity-35 disabled:cursor-default
                         hover:bg-navy/90 active:scale-[.99] transition-all">
              {draft.trim() ? '메모 저장' : note ? '메모 지우기' : '메모 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DeadlineCalendar({
  matches = [], loading, inProgress = null, inProgressItems = [], taxEvents = [],
  focus = null, onSelectDay = null,
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
  // 창을 연 날. 고른 칸(selKey)과 따로 둔다 — 오른쪽 목록에서 날짜를
  // 누를 때는 그 칸을 펴 보여주기만 하고 창은 안 띄운다. 달력을 가리면
  // 「어디인지 보려고」 누른 뜻이 사라진다.
  const [openDay, setOpenDay] = useState(false)
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
    setOpenDay(false)
    // 오른쪽 판도 그 날로 맞춰준다. 달력만 넘어가고 판은 딴 날이면 어긋난다.
    if (onSelectDay) onSelectDay(focus.date)
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
            className="tap w-8 h-8 rounded-full hover:bg-warm-gray/20 flex items-center justify-center
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
                className="tap flex items-center gap-1 px-2 py-1 rounded-full
                           border border-warm-gray/40 text-[11px] font-bold text-navy
                           hover:border-navy/50 hover:bg-warm-gray/10 transition-colors">
                <CornerUpLeft size={11} /> 오늘
              </button>
            )}
          </div>
          <button onClick={nextMonth}
            className="tap w-8 h-8 rounded-full hover:bg-warm-gray/20 flex items-center justify-center
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
                onClick={() => {
                  // 같은 칸을 다시 누르면 선택이 풀린다. 밖에 그린 판을
                  // 닫는 유일한 길이라 토글을 유지한다.
                  const next = selKey === key ? null : key
                  setSelKey(next)
                  if (onSelectDay) onSelectDay(next && noteKey(year, month, day))
                  else setOpenDay(Boolean(next))
                }}
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

      {!onSelectDay && openDay && selNoteKey && (
        <DayDialog
          dateKey={selNoteKey}
          taxList={selTax}
          noticeList={selList}
          urgentSet={new Set(selData?.urgent ?? [])}
          note={notes[selNoteKey] ?? ''}
          onSaveNote={text => setNote(selNoteKey, text)}
          onOpenNotice={m => {
            localStorage.setItem('mars-fit-selected-match', JSON.stringify(m.raw))
            navigate('/notice')
          }}
          onClose={() => setOpenDay(false)}
        />
      )}

    </section>
  )
}
