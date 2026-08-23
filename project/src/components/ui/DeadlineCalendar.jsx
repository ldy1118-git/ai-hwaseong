import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { listNotes, setNote, noteKey, subscribeNotes } from '../../utils/calendarNotes'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param taxEvents  세무일정. `utils/taxCalendar.js` 의 taxCalendarEvents() 모양.
 *                   기본값이 빈 배열이라 안 넘기면 예전처럼 공고만 그린다.
 */
/* 날짜 하나에 붙는 메모.
 *
 * 저장 버튼을 따로 두지 않는다. 달력에서 다른 날을 누르거나 화면을 떠나면
 * 적던 게 사라지는데, 저장을 눌러야 남는다는 걸 그때 알게 된다. 칸에서
 * 손을 떼면(blur) 저장한다.
 *
 * 대신 저장됐다는 표시가 필요하다 — 아무 반응이 없으면 눌렀는지 모른다. */
function DayNote({ dateKey, value, onSave }) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)

  // 다른 날을 누르면 그 날의 메모로 갈아탄다. 안 하면 앞 날짜에 적던
  // 글이 남아서, 저장하면 엉뚱한 날에 붙는다.
  useEffect(() => { setDraft(value); setSaved(false) }, [dateKey, value])

  function commit() {
    if (draft.trim() === value.trim()) return
    onSave(draft)
    setSaved(true)
  }

  return (
    <div className="mt-3">
      <label className="flex items-center gap-1.5 mb-1.5 text-[12px] font-bold text-warm-text">
        <Pencil size={12} className="text-amber-500" />
        메모
        {saved && <span className="font-medium text-emerald-600">저장됐어요</span>}
      </label>
      <textarea
        value={draft}
        onChange={e => { setDraft(e.target.value); setSaved(false) }}
        onBlur={commit}
        rows={2}
        placeholder="이 날 할 일을 적어두세요"
        className="w-full resize-y rounded-xl border border-warm-gray/40 bg-white
                   px-3.5 py-2.5 text-sm text-navy leading-relaxed
                   placeholder:text-warm-gray
                   focus:outline-none focus:border-amber-500/70"
      />
    </div>
  )
}

export default function DeadlineCalendar({
  matches = [], loading, inProgress = null, inProgressItems = [], taxEvents = [],
}) {
  const navigate = useNavigate()
  const today    = new Date()

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
    <section className="px-5 pb-8">
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
          <span className="text-sm font-bold text-navy">{year}년 {month + 1}월</span>
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
                onClick={() => setSelKey(prev => prev === key ? null : key)}
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

      {/* 고른 날에 메모. 공고도 세무일정도 없는 날에도 적을 수 있어야 해서
          목록이 비어 있어도 그린다. */}
      {selNoteKey && (
        <DayNote
          dateKey={selNoteKey}
          value={notes[selNoteKey] ?? ''}
          onSave={text => setNote(selNoteKey, text)}
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
