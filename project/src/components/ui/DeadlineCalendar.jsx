import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param taxEvents  세무일정. `utils/taxCalendar.js` 의 taxCalendarEvents() 모양.
 *                   기본값이 빈 배열이라 안 넘기면 예전처럼 공고만 그린다.
 */
export default function DeadlineCalendar({
  matches = [], loading, inProgress = null, taxEvents = [],
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

  const inProgressKey = (() => {
    const end = inProgress?.apply_period?.end
    if (!end) return null
    const d = new Date(end)
    if (isNaN(d)) return null
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  })()

  const selData = selKey ? (deadlineMap[selKey] ?? { urgent: [], regular: [] }) : null
  const selList = selData ? [...selData.urgent, ...selData.regular] : []
  const selTax  = selKey ? (taxMap[selKey] ?? []) : []

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
            const hasIP   = inProgressKey === key
            const hasTax  = (taxMap[key]?.length ?? 0) > 0
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
                  'aspect-square flex flex-col items-center justify-center gap-1',
                  'rounded-xl transition-colors',
                  bgClass,
                  isToday && !isSel ? 'ring-1 ring-inset ring-navy/40' : '',
                ].join(' ')}>
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
          {inProgress && (
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
        </div>
      </div>

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
        <p className="mt-3 text-xs text-warm-text text-center py-2">이 날은 마감하는 공모가 없어요.</p>
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
