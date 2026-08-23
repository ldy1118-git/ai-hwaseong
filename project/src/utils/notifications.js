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
import { getNotifySettings, subscribeNotifySettings } from './notifySettings'
import { taxCalendarEventsAround } from './taxCalendar'
import { todayISO } from './today'

const READ_KEY = 'mars-fit-notifications-read'
const EVENT = 'mars-fit-notifications-changed'

/* ── 새로 뜬 공고 ──────────────────────────────────────────
 *
 * 공고는 매일 아침 06:11 에 갱신된다(연구실 서버 cron). 그날 새로 뜬 것
 * 중에 조건이 잘 맞는 게 있으면 알려준다. 사장님이 매일 목록을 훑어야만
 * 알 수 있던 것이다.
 *
 * 서버가 아니라 브라우저가 판단한다. 지난번에 본 공고 번호를 적어두고
 * 이번에 온 목록과 견준다. 로그인이 필요 없고 시연에서 안 깨진다.
 *
 * **처음 들어온 사람에게는 하나도 안 띄운다.** 적어둔 게 없으면 58건이
 * 전부 「새로 뜬 공고」가 된다. 첫 방문에는 목록만 적어두고 넘어간다.
 */
const SEEN_KEY = 'mars-fit-seen-notices'
const NEW_KEY = 'mars-fit-new-notices'

// 점수는 조건별 가중평균(0~100)이다. 실제 분포에서 최고가 81, 다수가 73이라
// 70 아래는 「조건이 잘 맞는다」고 말하기 어렵다. 판정이 「신청가능」인
// 것만 본다 — 「확인필요」는 우리도 되는지 모른다는 뜻이라 알릴 게 못 된다.
const NEW_SCORE_MIN = 70
// 하루에 여러 건이 한꺼번에 떠도 종에 다섯 개까지만. 그 이상은 목록에서 본다.
const NEW_MAX_PER_SYNC = 5
// 일주일 지나면 「새로 떴다」는 말이 안 맞는다.
const NEW_KEEP_DAYS = 7
// 본 공고 번호가 무한정 쌓이지 않게. 지금 공고가 58건이라 넉넉하다.
const SEEN_MAX = 1000

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

/** 넘겨받은 게 없으면 이 기기에 저장된 프로필을 쓴다. */
function readProfile(given) {
  if (given) return given
  try {
    return JSON.parse(localStorage.getItem('mars-fit-profile') ?? 'null')
  } catch {
    return null
  }
}

function readList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // 저장이 막혀도 화면은 돌아가게 둔다.
  }
}

/**
 * 매칭 결과를 받아 새로 뜬 공고를 골라 둔다. 목록을 받아온 화면에서 부른다.
 *
 * @param results  /api/match 가 준 results 배열. Home 의 카드({raw})도 받는다.
 * @returns 이번에 새로 잡힌 알림 수
 */
export function syncNoticeAlerts(results, today = todayISO()) {
  const rows = (results ?? [])
    .map(r => r?.raw ?? r)
    .filter(r => r?.notice_id)
  if (rows.length === 0) return 0

  const seen = new Set(readList(SEEN_KEY))
  const first = seen.size === 0

  const fresh = rows.filter(r => !seen.has(r.notice_id))
  rows.forEach(r => seen.add(r.notice_id))
  writeList(SEEN_KEY, [...seen].slice(-SEEN_MAX))

  // 처음 온 사람에게는 아무것도 안 띄운다. 전부 「새로 떴다」가 되어버린다.
  if (first) return 0

  const settings = getNotifySettings()
  if (!settings.newNotices) return 0

  const picked = fresh
    .filter(r => r.overall_status === '신청가능')
    .filter(r => Number(r.match_score) >= (settings.minScore ?? NEW_SCORE_MIN))
    .sort((a, b) => Number(b.match_score) - Number(a.match_score))
    .slice(0, NEW_MAX_PER_SYNC)
  if (picked.length === 0) return 0

  const kept = readList(NEW_KEY).filter(n => daysSince(n.created, today) < NEW_KEEP_DAYS)
  const have = new Set(kept.map(n => n.notice_id))

  const added = picked
    .filter(r => !have.has(r.notice_id))
    .map(r => ({
      notice_id: r.notice_id,
      title: r.notice_title ?? '이름 없는 공고',
      score: Number(r.match_score),
      apply_url: r.apply_url ?? null,
      created: today,
    }))
  if (added.length === 0) return 0

  writeList(NEW_KEY, [...added, ...kept])
  window.dispatchEvent(new Event(EVENT))
  return added.length
}

function daysSince(date, today) {
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(diff) ? 999 : Math.round(diff / 86400000)
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
/**
 * @param profile  세무 신고기한을 계산하려면 필요하다. 안 넘기면 저장된 것을
 *                 읽는다 — 부르는 곳이 여럿이라 매번 넘기게 하면 빠뜨린다.
 */
export function listNotifications(today = todayISO(), profile = undefined) {
  const read = new Set(readIds())
  const settings = getNotifySettings()

  // ① 담아둔 공고의 마감이 다가온 것
  const deadlines = !settings.deadlines ? [] : listFavorites()
    .map((fav) => {
      const left = daysLeft(fav.apply_period?.end, today)
      if (left === null || left < 0 || left > 7) return null

      const step = STEPS.find(s => left <= s.within)
      if (!step) return null

      const what = fav.auto ? '서류 준비 중인 ' : ''
      const id = `${fav.notice_id}:${step.key}`
      return {
        id,
        kind: 'deadline',
        notice_id: fav.notice_id,
        title: fav.notice_title,
        message: `${what}「${fav.notice_title}」이 ${step.label} 마감이에요`,
        daysLeft: left,
        urgency: step.urgency,
        apply_url: fav.apply_url ?? null,
        read: read.has(id),
        // 급한 마감 → 새 공고 → 나머지 마감. 오늘·내일 마감이 제일 위다.
        rank: left <= 1 ? 0 : 2,
      }
    })
    .filter(Boolean)

  // ② 새로 뜬 공고 중 조건이 잘 맞는 것
  const fresh = !settings.newNotices ? [] : readList(NEW_KEY)
    .filter(n => daysSince(n.created, today) < NEW_KEEP_DAYS)
    .map((n) => {
      const id = `new:${n.notice_id}`
      return {
        id,
        kind: 'new',
        notice_id: n.notice_id,
        title: n.title,
        message: `조건에 잘 맞는 공고가 새로 떴어요 — 「${n.title}」`,
        score: n.score,
        daysLeft: null,
        urgency: 'soon',
        apply_url: n.apply_url ?? null,
        read: read.has(id),
        rank: 1,
      }
    })

  // ③ 세무 신고기한. 놓치면 가산세가 붙어서 공고 마감보다 무겁다.
  //    운영중인 사업자가 아니면 taxCalendarEventsAround 가 빈 배열을 준다.
  const tax = !settings.tax ? [] : taxCalendarEventsAround(readProfile(profile))
    .map((e) => {
      const left = daysLeft(e.dueDate, today)
      if (left === null || left < 0 || left > 7) return null
      const step = STEPS.find(s => left <= s.within)
      if (!step) return null
      const id = `tax:${e.id}:${step.key}`
      return {
        id,
        kind: 'tax',
        notice_id: null,
        title: e.title,
        message: `「${e.title}」 신고기한이 ${step.label}이에요`,
        daysLeft: left,
        urgency: step.urgency,
        apply_url: null,
        read: read.has(id),
        // 세무는 안 하면 가산세다. 같은 D-day 면 공고보다 위로 올린다.
        rank: left <= 1 ? -1 : 2,
      }
    })
    .filter(Boolean)

  return [...deadlines, ...fresh, ...tax].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft
    return 0
  })
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
  const offSettings = subscribeNotifySettings(handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
    offFavorites()
    offSettings()
  }
}
