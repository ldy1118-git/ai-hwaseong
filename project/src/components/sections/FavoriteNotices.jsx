import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, ChevronRight, ChevronDown, FileText } from 'lucide-react'
import Card from '../ui/Card'
import { listFavorites, removeFavorite, subscribeFavorites } from '../../utils/favorites'
import { daysLeft } from '../../utils/notifications'
import { openNoticeById } from '../../utils/openNotice'

/**
 * 관심공고 목록.
 *
 * ★ 로 담은 것과, 서류를 준비하기 시작해서 자동으로 담긴 것이 같이 있다.
 * 자동으로 담긴 것은 「서류 준비 중」이라고 적어준다 — 누른 적이 없는데
 * 목록에 있으면 왜 있는지 모른다.
 *
 * 담긴 게 없으면 아무것도 그리지 않는다. 빈 카드가 화면을 차지하면
 * 사장님이 뭘 해야 하는지가 아니라 뭐가 없는지를 먼저 읽게 된다.
 */
// 처음에 보여줄 개수. 담은 게 열 몇 건이 되면 목록이 화면을 다 먹어서
// 그 아래(창업 궤도, 유형별 안내)가 스크롤 밖으로 밀린다.
const PREVIEW = 5

export default function FavoriteNotices({ className = '' }) {
  const navigate = useNavigate()
  const [items, setItems] = useState(() => listFavorites())
  const [gone, setGone] = useState('')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => subscribeFavorites(() => setItems(listFavorites())), [])

  if (items.length === 0) return null

  const hidden = Math.max(0, items.length - PREVIEW)
  const shown = expanded ? items : items.slice(0, PREVIEW)

  return (
    <Card padding="sm" className={className}>
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <Star size={15} className="text-sunset-orange" fill="currentColor" strokeWidth={0} />
        <h2 className="text-sm font-bold text-navy">관심공고</h2>
        <span className="text-xs text-warm-gray">{items.length}</span>
      </div>

      <ul className="divide-y divide-warm-gray/20">
        {shown.map((f) => {
          const left = daysLeft(f.apply_period?.end)
          // 마감일이 없는 공고가 절반이다(58건 중 30건). 「세부사업별 상이」
          // 같은 문장에서 날짜를 뽑아내지 않는다. 모르면 모른다고 적는다.
          const dday =
            left === null ? '마감일 미정'
            : left < 0    ? '마감됨'
            : left === 0  ? '오늘 마감'
            : `D-${left}`
          const urgent = left !== null && left >= 0 && left <= 7

          return (
            <li key={f.notice_id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setGone('')
                  const opened = await openNoticeById(f.notice_id, navigate)
                  if (!opened) setGone(f.notice_id)
                }}
                className="flex-1 min-w-0 text-left px-1 py-2.5 group"
              >
                <div className="flex items-center gap-1.5">
                  <p className="flex-1 min-w-0 truncate text-[13px] font-semibold text-navy
                                group-hover:underline">
                    {f.notice_title}
                  </p>
                  <ChevronRight size={14} className="flex-shrink-0 text-warm-gray" />
                </div>

                <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                  <span className={urgent ? 'font-bold text-sunset-orange' : 'text-warm-gray'}>
                    {dday}
                  </span>
                  {f.organizer && (
                    <span className="truncate text-warm-gray">{f.organizer}</span>
                  )}
                  {f.auto && (
                    <span className="flex items-center gap-0.5 flex-shrink-0 text-navy/70">
                      <FileText size={11} /> 서류 준비 중
                    </span>
                  )}
                </div>

                {gone === f.notice_id && (
                  <p className="mt-1 text-[11px] text-sunset-orange">
                    이 공고는 지금 목록에 없어요. 마감됐을 수 있어요.
                  </p>
                )}
              </button>

              <button
                type="button"
                onClick={() => removeFavorite(f.notice_id)}
                aria-label={`${f.notice_title} 관심공고에서 빼기`}
                title="관심공고에서 빼기"
                className="flex-shrink-0 p-1.5 rounded-full text-sunset-orange
                           hover:bg-sunset-orange/10 transition-colors duration-150"
              >
                <Star size={16} fill="currentColor" strokeWidth={2} />
              </button>
            </li>
          )
        })}
      </ul>

      {/* 접었을 때만 몇 건이 숨었는지 적는다. 「더보기」만 있으면 눌러볼
          만한지 알 수가 없다. */}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-center gap-1 pt-2 mt-1
                     border-t border-warm-gray/20
                     text-[12px] font-semibold text-navy hover:underline"
        >
          {expanded ? '접기' : `${hidden}건 더보기`}
          <ChevronDown
            size={13}
            className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </Card>
  )
}
