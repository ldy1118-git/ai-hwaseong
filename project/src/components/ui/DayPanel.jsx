import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { getNote, setNote, subscribeNotes } from '../../utils/calendarNotes'

/**
 * 달력에서 고른 날 하나. 오른쪽 단 맨 위에 붙는다.
 *
 * 처음에는 달력 아래에 폈고, 그다음에는 창으로 띄웠다. 둘 다 걸렸다 —
 * 아래는 날짜를 누를 때마다 달력이 위아래로 움직였고, 창은 다른 날을
 * 보려면 매번 닫아야 했다.
 *
 * 오른쪽에 두면 달력은 그대로 있고 날짜를 옮겨 누르면 이 자리 내용만
 * 바뀐다. 세무 신고기한·상시 접수와 같은 단이라 눈이 갈 자리도 하나다.
 *
 * 닫기 버튼이 없다. 고른 칸을 한 번 더 누르면 선택이 풀리면서 사라진다.
 */
export default function DayPanel({ dateKey, matches = [], taxEvents = [] }) {
  const navigate = useNavigate()
  const [note, setLocalNote] = useState(() => getNote(dateKey))
  const [draft, setDraft] = useState(note)
  const [saved, setSaved] = useState(false)

  // 다른 날을 누르면 그 날의 메모로 갈아탄다. 안 하면 앞 날짜에 적던 글이
  // 남아서, 저장하면 엉뚱한 날에 붙는다.
  useEffect(() => {
    const current = getNote(dateKey)
    setLocalNote(current)
    setDraft(current)
    setSaved(false)
  }, [dateKey])

  useEffect(() => subscribeNotes(() => setLocalNote(getNote(dateKey))), [dateKey])

  const [year, month, day] = dateKey.split('-')

  const tax = taxEvents.filter(e => e.dueDate === dateKey)
  const notices = matches.filter(m => m.raw?.apply_period?.end === dateKey)
  const empty = tax.length === 0 && notices.length === 0

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-base font-bold text-navy">
          {Number(month)}월 {Number(day)}일
        </h3>
        <span className="text-sm text-warm-text">{year}년</span>
      </div>

      <div className="space-y-2">
        {/* 세무 신고기한을 공고보다 위에 둔다. 신청은 안 해도 그만이지만
            신고는 안 하면 가산세가 붙는다. */}
        {tax.map(e => (
          <div key={e.id}
            className="bg-emerald-50 border border-emerald-600/25 rounded-xl px-4 py-3
                       flex items-center gap-3">
            <span className="text-emerald-600 text-sm leading-none flex-shrink-0">■</span>
            <span className="flex-1 text-sm font-medium text-navy leading-snug">{e.title}</span>
            <span className="text-xs font-bold text-emerald-700 flex-shrink-0">신고기한</span>
          </div>
        ))}

        {notices.map(m => {
          const urgent = m.dDay !== null && m.dDay <= 14
          return (
            <button key={m.id}
              onClick={() => {
                localStorage.setItem('mars-fit-selected-match', JSON.stringify(m.raw))
                navigate('/notice')
              }}
              className={[
                'w-full text-left bg-white border rounded-xl px-4 py-3',
                'flex items-center gap-3 hover:shadow-sm transition-shadow',
                urgent ? 'border-sunset-orange/30' : 'border-warm-gray/20',
              ].join(' ')}>
              <span className={`text-[13px] font-bold flex-shrink-0 w-11
                ${urgent ? 'text-sunset-orange' : 'text-navy'}`}>
                {m.dDay !== null ? `D-${m.dDay}` : '마감'}
              </span>
              <p className="text-sm text-navy font-medium flex-1 line-clamp-2">{m.title}</p>
              <span className="text-warm-gray/40 text-lg flex-shrink-0">›</span>
            </button>
          )
        })}

        {empty && (
          <p className="text-sm text-warm-text py-1">이 날은 마감하는 공모가 없어요.</p>
        )}

        {/* 메모는 언제나 그린다. 공고도 세무일정도 없는 날에 적을 일이
            오히려 더 많다. */}
        <div className="pt-1">
          <label className="flex items-center gap-1.5 mb-1.5 text-[13px] font-bold text-warm-text">
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
            onClick={() => { setNote(dateKey, draft); setSaved(true) }}
            disabled={draft.trim() === note.trim()}
            className="mt-2 w-full py-3 rounded-xl bg-navy text-white text-sm font-bold
                       disabled:opacity-35 disabled:cursor-default
                       hover:bg-navy/90 active:scale-[.99] transition-all">
            {draft.trim() ? '메모 저장' : note ? '메모 지우기' : '메모 저장'}
          </button>
        </div>
      </div>
    </section>
  )
}
