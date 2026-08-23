import { useEffect, useRef, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  listNotifications, unreadCount, markAllRead, subscribeNotifications,
} from '../../utils/notifications'
import { openNoticeById } from '../../utils/openNotice'

/**
 * 🔔 알림. 관심공고의 마감이 다가오면 여기 뜬다.
 *
 * 서버에서 오는 게 아니다. 관심공고 목록과 마감일로 그 자리에서 계산한다
 * (`utils/notifications.js`). 그래서 로그인 없이도 되고 시연에서 안 깨진다.
 *
 * 알림이 없으면 종을 아예 안 그린다. 늘 비어 있는 종은 「눌러도 아무것도
 * 없구나」를 학습시킨다.
 */
export default function NotificationBell({ className = '' }) {
  const navigate = useNavigate()
  const [items, setItems] = useState(() => listNotifications())
  const [unread, setUnread] = useState(() => unreadCount())
  const [open, setOpen] = useState(false)
  const [gone, setGone] = useState('')   // 마감돼서 사라진 공고를 눌렀을 때
  const boxRef = useRef(null)

  useEffect(() => {
    const refresh = () => { setItems(listNotifications()); setUnread(unreadCount()) }
    refresh()
    return subscribeNotifications(refresh)
  }, [])

  // 바깥을 누르면 닫는다. 안 하면 다른 걸 누르려다 목록에 가려서 못 누른다.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  const toneOf = (u) => (
    u === 'urgent' ? 'text-sunset-orange'
    : u === 'soon' ? 'text-navy'
    : 'text-warm-text'
  )

  return (
    <div ref={boxRef} className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          // 열었으면 읽은 것으로 본다. 목록을 봤는데도 빨간 점이 남아 있으면
          // 뭘 더 해야 하는지 알 수가 없다.
          if (next) { markAllRead(); setUnread(0) }
        }}
        aria-label={unread > 0 ? `알림 ${unread}개` : '알림'}
        aria-expanded={open}
        className="relative p-2 rounded-full text-warm-text hover:bg-warm-gray/15 transition-colors duration-150"
      >
        <Bell size={20} strokeWidth={1.9} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1
                           rounded-full bg-sunset-orange text-white
                           text-[10px] font-bold leading-[17px] text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2.5rem))]
                        bg-white border border-warm-gray/40 rounded-2xl
                        shadow-[0_8px_24px_rgba(42,60,119,0.16)] z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-warm-gray/25">
            <span className="text-sm font-bold text-navy">알림 {items.length}</span>
            <button
              type="button" onClick={() => setOpen(false)}
              aria-label="닫기"
              className="p-1 rounded-full text-warm-gray hover:bg-warm-gray/15"
            >
              <X size={16} />
            </button>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-warm-gray/20">
            {items.map(n => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={async () => {
                    setGone('')
                    // 공고는 매일 아침 갱신된다. 담아둔 사이에 마감돼서
                    // 사라졌을 수 있으니 열렸는지 확인하고 알려준다.
                    const opened = await openNoticeById(n.notice_id, navigate)
                    if (opened) setOpen(false)
                    else setGone(n.notice_id)
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-primary-bg transition-colors duration-150"
                >
                  <p className="text-[13px] leading-snug text-warm-text">{n.message}</p>
                  <p className={`mt-1 text-[11px] font-bold ${toneOf(n.urgency)}`}>
                    {n.daysLeft === 0 ? '오늘 마감' : `D-${n.daysLeft}`}
                  </p>
                  {gone === n.notice_id && (
                    <p className="mt-1 text-[11px] text-sunset-orange">
                      이 공고는 지금 목록에 없어요. 마감됐을 수 있어요.
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <p className="px-4 py-2.5 text-[11px] text-warm-gray border-t border-warm-gray/25">
            관심공고로 담은 것만 알려드려요.
          </p>
        </div>
      )}
    </div>
  )
}
