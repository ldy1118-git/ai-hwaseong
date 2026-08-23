/**
 * 인앱 알림. 관심공고의 마감이 다가오면 알려준다.
 *
 * 서버가 없다. 브라우저가 관심공고 목록(`utils/favorites.js`)과 각 공고의
 * 마감일을 이미 갖고 있어서, 화면을 열 때 그 자리에서 계산한다. 저장하는
 * 것은 「어느 알림을 읽었는가」뿐이다.
 *
 * 카톡 알림(2단계)은 이야기가 다르다. 밤중에 서버가 보내야 하니 관심공고가
 * 서버에도 있어야 한다. 그건 그때 붙인다.
 *
 * **마감일이 없는 공고가 절반이다.** 58건 중 30건은 apply_period 에 end 가
 * 없고 note 문자열만 있다 — 「세부사업별 상이」, 「2020.01.01 ~ 2026.12.31」.
 * note 를 파싱해서 날짜를 뽑지 않는다. 「세부사업별 상이」에서 억지로 숫자를
 * 꺼내면 틀린 마감일로 알림이 가고, 그건 안 알리느니만 못하다.
 */

import { listFavorites, subscribeFavorites } from './favorites'
import { todayISO } from './today'

const READ_KEY = 'mars-fit-notifications-read'
const EVENT = 'mars-fit-notifications-changed'

/**
 * 알림이 뜨는 문턱. 위에서부터 먼저 맞는 것 하나만 쓴다.
 *
 * D-5 처럼 문턱에 딱 안 맞는 날에도 알림이 남아 있어야 해서 「이하」로 본다.
 * 날이 갈수록 D7 → D3 → D1 → D0 으로 갈아타고, 문턱마다 id 가 달라서
 * 읽음 표시가 새 알림을 덮지 않는다.
 */
const STEPS = [
  { key: 'D0', within: 0, label: '오늘',     urgency: 'urgent' },
  { key: 'D1', within: 1, label: '내일',     urgency: 'urgent' },
  { key: 'D3', within: 3, label: '3일 뒤',   urgency: 'soon'   },
  { key: 'D7', within: 7, label: '일주일 뒤', urgency: 'info'   },
]

function readIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeIds(ids) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids))
  } catch {
    // 저장이 막혀도 화면은 돌아가게 둔다. 새로고침하면 다시 안 읽음이 될 뿐이다.
  }
  window.dispatchEvent(new Event(EVENT))
}

/**
 * 오늘부터 며칠 남았나. 마감일이 없으면 null.
 *
 * 날짜만 비교한다. 시각을 섞으면 오후에 열었을 때 하루가 깎여서 「내일
 * 마감」이 「오늘 마감」으로 보인다. todayISO 가 한국 날짜를 준다.
 */
export function daysLeft(endDate, today = todayISO()) {
  if (typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null
  const diff = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)
  return Number.isNaN(diff) ? null : Math.round(diff / 86400000)
}

/**
 * 지금 띄울 알림 목록. 급한 것부터.
 *
 * 마감이 지난 것은 알리지 않는다 — 이미 늦었다고 알려봐야 할 수 있는 게 없다.
 * 목록에서는 계속 보이니까 사장님이 직접 지우면 된다.
 */
export function listNotifications(today = todayISO()) {
  const read = new Set(readIds())

  return listFavorites()
    .map((fav) => {
      const left = daysLeft(fav.apply_period?.end, today)
      if (left === null || left < 0 || left > 7) return null

      const step = STEPS.find(s => left <= s.within)
      if (!step) return null

      const what = fav.auto ? '서류 준비 중인 ' : ''
      const id = `${fav.notice_id}:${step.key}`
      return {
        id,
        notice_id: fav.notice_id,
        title: fav.notice_title,
        message: `${what}「${fav.notice_title}」이 ${step.label} 마감이에요`,
        daysLeft: left,
        urgency: step.urgency,
        apply_url: fav.apply_url ?? null,
        read: read.has(id),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

export function unreadCount(today = todayISO()) {
  return listNotifications(today).filter(n => !n.read).length
}

export function markRead(id) {
  const ids = readIds()
  if (ids.includes(id)) return
  writeIds([...ids, id])
}

/**
 * 종을 열면 전부 읽음으로. 지금 떠 있는 것만 넣는다.
 *
 * 읽음 id 를 무한정 쌓지 않으려고, 저장할 때 지금 살아있는 알림 것만 남긴다.
 * 관심공고를 지우면 그 id 도 같이 사라진다.
 */
export function markAllRead(today = todayISO()) {
  const alive = listNotifications(today).map(n => n.id)
  const keep = new Set([...readIds().filter(id => alive.includes(id)), ...alive])
  writeIds([...keep])
}

/** 알림이나 관심공고가 바뀔 때마다 부른다. 해제 함수를 돌려준다. */
export function subscribeNotifications(handler) {
  const onStorage = (e) => { if (!e.key || e.key === READ_KEY) handler() }
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', onStorage)
  const offFavorites = subscribeFavorites(handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
    offFavorites()
  }
}
