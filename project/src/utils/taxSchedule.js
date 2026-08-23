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
  2027: [
    '01-01',
    '02-06', '02-07', '02-08', '02-09',  // 설날 + 대체
    '03-01',
    '05-05',
    '05-13',                             // 부처님오신날
    '06-06',                             // 현충일 (일요일이어도 대체 없음)
    '08-15', '08-16',                    // 광복절(일) + 대체
    '09-14', '09-15', '09-16',           // 추석
    '10-03', '10-04',                    // 개천절(일) + 대체
    '10-09', '10-11',                    // 한글날(토) + 대체
    '12-25', '12-27',                    // 성탄절(토) + 대체
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
  // 참/거짓으로 답하는 것들. 목록이 아니라 값으로 견준다.
  for (const key of ['has_employee', 'withholding_half']) {
    const want = target[key]
    const mine = profile?.[key]
    if (want != null && mine != null && want !== mine) return false
  }
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
    // 조건이 붙어 있어도 사장님이 그 조건을 직접 답했으면 더는 「해당되면
    // 이것도」가 아니다. 원천세 반기납부가 그렇다 — 승인을 받았는지는
    // 사장님만 안다. 받았다고 답하면 1월·7월 두 건이 반드시 해야 하는
    // 것으로 올라온다.
    const asked = event.conditional_resolved_by
    const resolved = asked != null && profile?.[asked] != null
    ;(event.conditional && !resolved ? ifApplicable : mustDo).push(item)
  }

  const byDate = (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')
  return {
    mustDo: mustDo.sort(byDate),
    ifApplicable: ifApplicable.sort(byDate),
    holidaysKnown: holidaysKnown(year),
  }
}

/* nextDeadline() 은 지웠다.
 *
 * dueDate 가 있는 것만 보던 함수라, 「매월 10일」인 원천세를 통째로
 * 놓쳤다. 직원 있는 사장님에게는 그게 제일 가까운 신고인데 홈 배너는
 * 두 달 뒤 부가세를 가리켰다.
 *
 * 대신 `utils/taxCalendar.js` 의 nextTaxDeadline() 을 쓴다. 거기는 매월
 * 반복을 이미 날짜별로 펴둔 자리라 그냥 제일 앞을 집으면 된다. 이 파일은
 * policy_data/tax_schedule.py 와 두 벌이라, 짝이 없는 화면용 계산을
 * 여기 두지 않는 편이 낫다. */
