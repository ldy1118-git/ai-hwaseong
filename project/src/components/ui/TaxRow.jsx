import { ChevronDown, ExternalLink, Check } from 'lucide-react'
import { todayISO } from '../../utils/today'
import { taxDoneKey, setTaxDone } from '../../utils/taxDone'

/**
 * 세무 신고 한 줄. 눌러서 펴면 무엇을 어디서 어떻게 하는지 나온다.
 *
 * **두 화면이 같이 쓴다.** 전에는 이 내용이 `/district` 에만 있었다.
 * 달력(`/schedule`)에서 「부가가치세 2기 확정신고」를 봐도 제목과 D-day
 * 뿐이라, 뭘 준비해야 하는지 알려면 「내 매장 현황」이라는 이름 뒤로
 * 찾아 들어가야 했다. 세무를 찾으러 거기 갈 이유가 없다.
 *
 * 들어오는 모양이 두 가지다. 둘 다 받는다.
 *
 *   taxSchedule()      원천세는 `recurrence: 'monthly'` 에 dueDate 가 없다
 *                      → 「매월 10일」 한 줄. 연간 개요라 이게 맞다
 *   taxCalendarEvents() 그 열두 개를 각각 날짜로 편 것
 *                      → 실제 날짜와 D-day. 달력 옆이라 이게 맞다
 */

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' → '1월 26일 (월)'. 올해가 아니면 연도를 붙인다. */
export function korDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const y = String(d.getFullYear()) === todayISO().slice(0, 4) ? '' : `${d.getFullYear()}년 `
  return `${y}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`
}

/** 'MM-DD' → '1/25' */
export function shortLegal(due) {
  if (!due || !due.includes('-')) return due
  const [m, d] = due.split('-')
  return `${Number(m)}/${Number(d)}`
}

/**
 * 남은 날. 한국 날짜로 자른다.
 *
 * 브라우저 시간대로 재면 자정 근처에 하루가 어긋나서 지난 신고가 남은
 * 신고로 보인다. 양쪽 다 Z 로 맞춰야 서머타임 쓰는 지역에서도 안 어긋난다.
 */
export function dDay(iso, today = todayISO()) {
  if (!iso) return null
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  )
}

export function dDayLabel(n) {
  if (n == null) return ''
  if (n === 0) return '오늘'
  if (n < 0) return `${-n}일 지남`
  return `D-${n}`
}

/** 법정기한이 휴일이라 밀린 경우에만 붙인다. 안 붙이면 사장님이 하루 늦게 안다. */
export function MovedNote({ legal, actual }) {
  return (
    <p className="text-[13px] text-sunset-orange mt-1 leading-relaxed">
      법정기한 {shortLegal(legal)} 이 휴일이라 {korDate(actual)} 로 밀렸어요
    </p>
  )
}

/** 홈택스는 신고 종류별 주소를 안 열어줘서 첫 화면으로만 보낸다. */
const HOMETAX = 'https://www.hometax.go.kr'

/**
 * @param item        taxSchedule() 또는 taxCalendarEvents() 의 한 건
 * @param open        펴져 있나
 * @param onToggle    펴고 접기
 * @param done        완료 표시됐나 (부르는 쪽이 구독해서 넘긴다)
 */
export default function TaxRow({ item, open, onToggle, done = false }) {
  const n = dDay(item.dueDate)
  const urgent = n != null && n >= 0 && n <= 14

  // 날짜가 정해진 건에만 완료를 붙인다. 「매월 10일」 한 줄에 체크하면
  // 어느 달을 냈다는 말인지 알 수 없다.
  const doneKey = taxDoneKey(item.groupId ?? item.id, item.dueDate)

  // dueDate 가 있으면 언제나 그 날짜를 쓴다. recurrence 는 원본에 그대로
  // 실려 오는데, 편 다음에도 그걸 먼저 보면 9월 10일짜리가 「매월 10일」로
  // 나와서 D-day 와 말이 안 맞는다.
  const when = item.dueDate
    ? korDate(item.dueDate)
    : item.recurrence === 'monthly' ? '매월 10일' : ''

  return (
    <div className={`border-b border-warm-gray/10 last:border-0 ${done ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-2">
        {/* 체크는 늘 보이게 둔다. 원천세는 1년에 열두 번이라, 펴야만
            누를 수 있으면 매번 두 번씩 눌러야 한다. */}
        {doneKey && (
          <button
            type="button"
            onClick={() => setTaxDone(doneKey, !done)}
            aria-pressed={done}
            title={done ? '완료 표시 지우기' : '이 신고를 마쳤다고 표시'}
            className={[
              'tap w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0',
              'transition-colors duration-150',
              done ? 'bg-emerald-600 border-emerald-600 text-white'
                   : 'border-warm-gray/50 text-transparent hover:border-emerald-600/60',
            ].join(' ')}
          >
            <Check size={14} strokeWidth={3} />
          </button>
        )}

        <button onClick={onToggle} className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold text-navy leading-snug
                           ${done ? 'line-through decoration-warm-gray/60' : ''}`}>
              {item.title}
            </p>
            <p className="text-[13px] text-warm-text mt-0.5">
              {when}
              {item.recurring && <span className="text-warm-gray"> · 매월 반복</span>}
              {item.moved && <span className="text-sunset-orange"> · 밀림</span>}
            </p>
          </div>

          {done ? (
            <span className="text-[13px] font-bold text-emerald-600 flex-shrink-0">완료</span>
          ) : item.dueDate ? (
            <span className={`text-[13px] font-bold flex-shrink-0
                              ${urgent ? 'text-sunset-orange' : 'text-warm-text'}`}>
              {dDayLabel(n)}
            </span>
          ) : null}

          <ChevronDown
            size={16}
            className={`text-warm-gray flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open && (
        <div className="pb-3 space-y-2">
          <p className="text-sm text-gray-700 leading-relaxed">{item.easy}</p>

          {item.moved && <MovedNote legal={item.due} actual={item.dueDate} />}

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-primary-bg rounded-lg px-2.5 py-2">
              <p className="text-[13px] text-warm-text">어디서</p>
              <p className="text-[13px] font-semibold text-navy mt-0.5">{item.where}</p>
            </div>
            <div className="bg-primary-bg rounded-lg px-2.5 py-2">
              <p className="text-[13px] text-warm-text">기간</p>
              <p className="text-[13px] font-semibold text-navy mt-0.5 leading-snug">{item.covers}</p>
            </div>
          </div>

          {item.docs?.length > 0 && (
            <div>
              <p className="text-[13px] text-warm-text mb-1">준비할 것</p>
              <div className="flex flex-wrap gap-1">
                {item.docs.map(d => (
                  <span key={d} className="text-[13px] text-navy bg-navy/5 rounded-full px-2 py-0.5">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {item.caution && (
            <p className="text-[13px] text-warm-text leading-relaxed bg-warm-gray/10 rounded-lg px-2.5 py-2">
              {item.caution}
            </p>
          )}

          <p className="text-[13px] text-sunset-orange leading-relaxed">
            안 하면 — {item.penalty}
          </p>

          {/* 「어디서: 홈택스」가 글자로만 있었다. 서류준비 창은 발급처
              링크를 주는데 여기만 안 줬다. */}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {item.where?.includes('홈택스') && (
              <a
                href={HOMETAX}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy text-white
                           text-[13px] font-bold hover:bg-navy/90 transition-colors"
              >
                홈택스 열기 <ExternalLink size={12} />
              </a>
            )}
          </div>

          <p className="text-[13px] text-warm-text/70">근거 {item.source}</p>
        </div>
      )}
    </div>
  )
}
