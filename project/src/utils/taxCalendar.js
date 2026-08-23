/**
 * 세무일정을 달력에 찍을 수 있는 모양으로 편다.
 *
 * `taxSchedule()` 은 화면용이 아니라 「무엇을 해야 하나」 목록이라 모양이
 * 두 가지다 — 연 1~2회짜리는 `dueDate` 한 개, 원천세처럼 매달 있는 것은
 * `dueDates` 열두 개. 달력은 날짜 하나에 점 하나를 찍으므로 여기서 편다.
 *
 * **`utils/taxSchedule.js` 를 건드리지 않는다.** 그 파일은
 * `policy_data/tax_schedule.py` 와 두 벌로 존재해서 한쪽만 고치면 화면과
 * 서버가 다른 날짜를 말한다. 이 파일은 화면에만 필요한 것이라 짝이 없다.
 */

import { taxSchedule } from './taxSchedule'
import { todayISO } from './today'

/**
 * @returns {object[]} 날짜 하나에 한 건씩. 원본 항목의 설명·준비물·가산세를
 *   그대로 달고 나온다 — 달력 옆에서 바로 펴 보려면 필요하다.
 *
 *   id        'vat-1st-final-2026' · 'withholding-monthly-2026-9'
 *   groupId   원본 항목 번호. 매월 반복을 한 줄로 접을 때 쓴다
 *   recurring 매월 반복 중 하나인가
 *   dueDate   'YYYY-MM-DD'. 공휴일·주말이면 이미 밀린 날짜다
 *   due       법정기한 'MM-DD'. 밀린 이유를 말할 때 쓴다
 *   moved     밀렸는가
 *   그 밖에 easy · where · covers · docs · caution · penalty · source
 *
 * 「해당되면 이것도」(ifApplicable)는 넣지 않는다. 프로필만으로는 해당
 * 여부를 알 수 없어서, 달력에 찍으면 안 해도 되는 날에 점이 생긴다.
 * 종합소득세가 5월·6월 두 번 뜨고 원천세가 매월·반기 둘 다 뜬다.
 *
 * 사업자가 아니면 빈 배열이 나온다 — 부르는 쪽에서 그걸로 판단하면 된다.
 */
export function taxCalendarEvents(profile, year) {
  if (!profile) return []

  // 운영중인 사업자에게만. 예비창업자는 신고 의무가 아직 없다.
  //
  // 이걸 안 막으면 예비창업자에게 열 건이 뜬다. taxSchedule 의 applies()
  // 가 「프로필에 값이 없으면 통과」라서 그렇다 — 과세유형을 아직 안 고른
  // 사장님에게 일단 다 보여주려는 것인데, 사업자가 아닌 사람에게는 일반과세
  // 부가세와 간이과세 부가세가 같은 날 나란히 뜬다. 둘은 양립할 수 없다.
  //
  // applies() 는 policy_data/tax_schedule.py 와 두 벌이라 여기서 막는다.
  // District.jsx 도 isOwner 로 같은 선을 긋고 있다.
  if (profile.business_status !== '운영중') return []

  const { mustDo } = taxSchedule(profile, year)
  const out = []

  for (const event of mustDo) {
    // applies_to 는 걸러낼 때 쓰고 끝이라 화면까지 들고 갈 필요가 없다.
    // dueDates 는 아래에서 펴므로 남기면 같은 값이 두 벌이 된다.
    const { dueDates, dueDate, moved, applies_to, ...rest } = event

    if (Array.isArray(dueDates)) {
      // 매달 있는 것. 열두 개가 각각 다른 날짜라 따로 찍는다.
      dueDates.forEach((d, i) => {
        if (d?.date) out.push({
          ...rest,
          id: `${event.id}-${year}-${i + 1}`,
          groupId: event.id,
          recurring: true,
          // rest.due 는 '매월 10일' 이라 밀린 이유를 말할 수 없다.
          // 그 달의 법정기한('MM-DD')으로 바꿔 단다.
          due: d.legal,
          dueDate: d.date,
          moved: Boolean(d.moved),
        })
      })
    } else if (dueDate) {
      out.push({
        ...rest,
        id: `${event.id}-${year}`,
        groupId: event.id,
        recurring: false,
        dueDate,
        moved: Boolean(moved),
      })
    }
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/**
 * 올해와 내년 것을 같이 준다.
 *
 * 달력은 월을 넘길 수 있다. 올해 것만 넘기면 12월에서 한 번만 넘겨도
 * 점이 전부 사라져서 세무일정이 없는 것처럼 보인다.
 */
export function taxCalendarEventsAround(profile, year = new Date().getFullYear()) {
  return [...taxCalendarEvents(profile, year), ...taxCalendarEvents(profile, year + 1)]
}

/**
 * 오늘 기준으로 제일 가까운 신고 하나. 홈 배너와 「다음 세무일정」 카드용.
 *
 * `taxSchedule.js` 의 nextDeadline() 을 안 쓴다. 그쪽은 dueDate 가 있는
 * 것만 보는데 원천세는 「매월 10일」이라 dueDate 가 없다. 직원 있는
 * 사장님에게는 그게 제일 가까운 신고인데, 배너는 두 달 뒤 부가세를
 * 가리키고 있었다.
 *
 * 사업자가 아니면 null 이다 — 예비창업자에게 신고 의무는 아직 없다.
 */
export function nextTaxDeadline(profile, today = todayISO()) {
  const events = taxCalendarEventsAround(profile, Number(today.slice(0, 4)))
  return events.find(e => e.dueDate >= today) ?? null
}
