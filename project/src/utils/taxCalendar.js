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

/**
 * @returns {{ id: string, title: string, dueDate: string, moved: boolean }[]}
 *   dueDate 는 'YYYY-MM-DD'. 공휴일·주말이면 이미 밀린 날짜다.
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
    if (Array.isArray(event.dueDates)) {
      // 매달 있는 것. 열두 개가 각각 다른 날짜라 따로 찍는다.
      event.dueDates.forEach((d, i) => {
        if (d?.date) out.push({
          id: `${event.id}-${year}-${i + 1}`,
          title: event.title,
          dueDate: d.date,
          moved: Boolean(d.moved),
        })
      })
    } else if (event.dueDate) {
      out.push({
        id: `${event.id}-${year}`,
        title: event.title,
        dueDate: event.dueDate,
        moved: Boolean(event.moved),
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
