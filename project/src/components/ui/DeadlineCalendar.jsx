import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function DeadlineCalendar({ matches = [], loading }) {
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

  const selData = selKey ? (deadlineMap[selKey] ?? { urgent: [], regular: [] }) : null
  const selList = selData ? [...selData.urgent, ...selData.regular] : []

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
            <div key={d} className={`text-center text-[11px] font-semibold py-1
              ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-warm-text'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const key     = `${year}-${month}-${day}`
            const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate()
            const isSel   = selKey === key
            const dl      = deadlineMap[key]
            const hasU    = (dl?.urgent?.length ?? 0) > 0
            const hasR    = (dl?.regular?.length ?? 0) > 0
            const isSun   = (firstDay + day - 1) % 7 === 0
            const isSat   = (firstDay + day - 1) % 7 === 6

            return (
              <button key={day}
                onClick={() => setSelKey(prev => prev === key ? null : key)}
                className={[
                  'flex flex-col items-center py-1.5 rounded-xl transition-colors',
                  isSel   ? 'bg-navy/10' : 'hover:bg-warm-gray/10',
                  isToday ? 'ring-1 ring-inset ring-navy/40' : '',
                ].join(' ')}>
                <span className={[
                  'text-xs leading-none',
                  isToday ? 'font-extrabold text-navy' :
                  isSun   ? 'text-red-400 font-medium' :
                  isSat   ? 'text-blue-400 font-medium' : 'text-gray-700 font-medium',
                ].join(' ')}>
                  {day}
                </span>
                <div className="flex gap-0.5 mt-0.5 h-3 items-center">
                  {hasU && <span className="text-[9px] leading-none text-sunset-orange">★</span>}
                  {hasR && <span className="text-[9px] leading-none text-navy">★</span>}
                </div>
              </button>
            )
          })}
        </div>

        {/* 범례 */}
        <div className="flex gap-5 mt-3 pt-3 border-t border-warm-gray/20">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] leading-none text-sunset-orange">★</span>
            <span className="text-[11px] text-warm-text">긴급 마감 (D-14 이내)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] leading-none text-navy">★</span>
            <span className="text-[11px] text-warm-text">일반 마감</span>
          </div>
        </div>
      </div>

      {/* 선택한 날짜의 공모 목록 */}
      {selData && selList.length === 0 && (
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
