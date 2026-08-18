/**
 * 세무일정을 프로필에 맞춰 걸러주고 실제 기한을 계산한다.
 *
 * policy_data/tax_schedule.py 와 같은 로직이다. 한쪽을 고치면 다른 쪽도
 * 고쳐야 한다. 파이썬 쪽이 원본이고 날짜 검증도 거기서 했다.
 *
 *   import { taxSchedule } from '../utils/taxSchedule'
 *   const { mustDo, ifApplicable } = taxSchedule(profile, 2026)
 *
 * **법정기한을 그대로 화면에 띄우면 틀린다.**
 * 국세청 규정: "신고기한이 공휴일·토요일인 경우 그 다음 날을 신고기한으로 한다."
 * 2026년만 봐도 법정기한 10개 중 6개가 밀린다. 종합소득세는 5/31 이 아니라
 * 6/1 이다. 국세청 세무일정 페이지도 밀린 날짜로 표기한다.
 */

import calendar from '../data/tax_calendar.json'

// 관공서 공휴일. 세무서가 닫으면 기한이 밀린다.
// 설날·추석은 음력이라 해마다 다르고 대체공휴일 규칙도 있어서 적어 넣는다.
// **연말에 다음 해를 채울 것.** 안 채우면 그 해는 주말만 반영된다.
const HOLIDAYS = {
  2026: [
    '01-01',
    '02-16', '02-17', '02-18',          // 설날
    '03-01', '03-02',                   // 삼일절 + 대체
    '05-05',
    '05-24', '05-25',                   // 부처님오신날 + 대체
    '06-06',
    '08-15', '08-17',                   // 광복절 + 대체
    '09-24', '09-25', '09-26',          // 추석
    '10-03', '10-05',                   // 개천절 + 대체
    '10-09',
    '12-25',
  ],
}

const pad = n => String(n).padStart(2, '0')
const mmdd = d => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 세무서가 닫는 날인가 */
function isClosed(d) {
  const day = d.getDay()
  if (day === 0 || day === 6) return true
  return (HOLIDAYS[d.getFullYear()] || []).includes(mmdd(d))
}

/** 법정기한 → 실제 기한. 밀렸는지도 같이 돌려준다 */
export function actualDue(year, month, day) {
  const legal = new Date(year, month - 1, day)
  const moved = new Date(legal)
  while (isClosed(moved)) moved.setDate(moved.getDate() + 1)
  return {
    date: `${moved.getFullYear()}-${pad(moved.getMonth() + 1)}-${pad(moved.getDate())}`,
    moved: moved.getTime() !== legal.getTime(),
  }
}

/** 공휴일을 적어둔 해인가. 아니면 주말만 반영된 날짜다 */
export const holidaysKnown = year => year in HOLIDAYS

/**
 * 이 사람에게 해당되는 일정인가.
 *
 * 답이 없으면 걸러내지 않는다. 모른다는 이유로 빼면 사장님이 신고를
 * 통째로 놓친다. 공고 매칭과 같은 원칙이다.
 */
function applies(event, profile) {
  const target = event.applies_to
  for (const key of ['entity_type', 'vat_type']) {
    const allowed = target[key]
    const mine = profile?.[key]
    if (allowed && mine && !allowed.includes(mine)) return false
  }
  const want = target.has_employee
  const mine = profile?.has_employee
  if (want != null && mine != null && want !== mine) return false
  return true
}

/**
 * @param {object} profile  온보딩 프로필 (entity_type / vat_type / has_employee)
 * @param {number} year
 * @returns {{ mustDo: object[], ifApplicable: object[], holidaysKnown: boolean }}
 *   mustDo        반드시 해야 하는 것
 *   ifApplicable  해당되면 이것도 — 프로필만으로는 해당 여부를 알 수 없다.
 *                 섞어서 보여주면 종합소득세가 5월·6월 두 번 뜨고 원천세가
 *                 매월·반기 둘 다 떠서 사장님이 헷갈린다. 반드시 따로 그릴 것.
 */
export function taxSchedule(profile, year = new Date().getFullYear()) {
  const mustDo = []
  const ifApplicable = []

  for (const event of calendar.events) {
    if (!applies(event, profile)) continue
    const item = { ...event }

    if (event.recurrence === 'monthly') {
      item.dueDates = Array.from({ length: 12 }, (_, i) => ({
        ...actualDue(year, i + 1, 10), legal: `${pad(i + 1)}-10`,
      }))
    } else {
      const [month, day] = event.due.split('-').map(Number)
      const { date, moved } = actualDue(year, month, day)
      item.dueDate = date
      item.moved = moved
    }
    ;(event.conditional ? ifApplicable : mustDo).push(item)
  }

  const byDate = (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')
  return {
    mustDo: mustDo.sort(byDate),
    ifApplicable: ifApplicable.sort(byDate),
    holidaysKnown: holidaysKnown(year),
  }
}

/** 오늘 기준으로 다음에 닥칠 일정 하나. 홈 화면 배너용 */
export function nextDeadline(profile, today = new Date()) {
  const year = today.getFullYear()
  const iso = `${year}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const { mustDo } = taxSchedule(profile, year)
  const upcoming = mustDo.filter(e => e.dueDate && e.dueDate >= iso)
  if (upcoming.length) return upcoming[0]
  // 올해 남은 게 없으면 내년 첫 일정
  return taxSchedule(profile, year + 1).mustDo[0] || null
}
