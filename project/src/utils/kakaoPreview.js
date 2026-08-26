import { fetchMatches } from './api'
import { getNotifySettings } from './notifySettings'
import { nextTaxDeadline } from './taxCalendar'
import { todayISO } from './today'

/**
 * 「지금 한 통 보내보기」에 실을 본문.
 *
 * **새벽에 오는 것과 같은 모양이어야 한다.** 「테스트입니다」만 오면 진짜
 * 알림이 어떻게 생겼는지는 여전히 모른다. 확인하려고 눌렀는데 확인이 안
 * 되는 셈이다.
 *
 * 문안은 `scripts/notify_kakao.py` 의 `message_for()` · `message_for_tax()`
 * 와 같게 맞춰뒀다. **한쪽만 고치면 확인용과 진짜가 다르게 생긴다** — 그러면
 * 이 버튼이 확인 구실을 못 한다.
 *
 *     project/src/utils/kakaoPreview.js  ←→  scripts/notify_kakao.py
 *
 * 새벽 발송과 다른 점이 하나 있다. 저쪽은 **새로 뜬 것**만 보내지만
 * 여기는 지금 걸리는 것 중 제일 잘 맞는 것을 싣는다. 확인하려고 누른
 * 순간에 새 공고가 있을 리 없어서다.
 */

const MAX_NOTICES = 3

/** 세무 한 건 — `message_for_tax()` 의 단수 갈래와 같은 문장이다. */
function taxPart(event, today) {
  if (!event) return null
  const left = Math.round(
    (new Date(event.dueDate) - new Date(today)) / 86400000,
  )
  const when = left <= 0 ? '오늘까지예요'
    : left === 1 ? '내일까지예요'
      : `${left}일 남았어요`
  return `세무 신고기한이 다가와요\n\n「${event.title}」\n${when}`
}

/** 공고 — `message_for()` 와 같은 문장이다. */
function noticePart(rows) {
  if (!rows.length) return null
  if (rows.length === 1) {
    const row = rows[0]
    const end = row.apply_period?.end
    return '조건에 잘 맞는 지원사업이에요\n\n'
      + `「${row.notice_title}」\n`
      + `매칭 ${row.match_score}점`
      + (end ? `\n마감 ${end}` : '')
  }
  return [`조건에 맞는 지원사업 ${rows.length}건이에요\n`]
    .concat(rows.map(r => `· ${r.notice_title} (${r.match_score}점)`))
    .join('\n')
}

/**
 * 보낼 본문을 만든다. 공고를 못 불러와도 세무만으로 한 통을 꾸민다 —
 * 확인하려고 눌렀는데 아무것도 안 오는 게 제일 나쁘다.
 */
export async function testMessageText() {
  const today = todayISO()
  let profile = null
  try { profile = JSON.parse(localStorage.getItem('mars-fit-profile') || 'null') } catch { /* 없으면 없는 대로 */ }

  const settings = getNotifySettings()
  const parts = []

  if (settings.tax !== false) {
    const part = taxPart(nextTaxDeadline(profile, today), today)
    if (part) parts.push(part)
  }

  if (settings.newNotices !== false && profile) {
    try {
      const results = await fetchMatches(profile)
      const min = Number(settings.minScore) || 70
      const rows = results
        .filter(r => r.overall_status === '신청가능' && (r.match_score ?? 0) >= min)
        .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
        .slice(0, MAX_NOTICES)
        .map(r => ({
          notice_title: r.notice_title ?? r.title,
          match_score: r.match_score,
          apply_period: r.apply_period,
        }))
      const part = noticePart(rows)
      if (part) parts.push(part)
    } catch { /* 공고를 못 불러와도 세무만으로 보낸다 */ }
  }

  if (!parts.length) {
    return '알림이 이렇게 옵니다.\n\n'
      + '지금은 조건에 걸리는 공고도 다가오는 신고기한도 없어요. '
      + '새로 뜨면 정해두신 시각에 이 자리로 보내드릴게요.'
  }

  // 한 통에 묶는다. 따로 보내면 두 번 울린다 — 새벽 발송과 같은 규칙이다.
  return parts.join('\n\n───────────\n\n')
}
