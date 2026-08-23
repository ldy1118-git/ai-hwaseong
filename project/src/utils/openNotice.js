/**
 * 공고 번호만 알 때 상세 화면을 여는 방법.
 *
 * 이 서비스에서 공고 상세로 가는 규칙은 「원본 레코드를
 * localStorage['mars-fit-selected-match'] 에 넣고 /notice 로 이동」이다.
 * NoticeDetail 은 라우트 파라미터를 안 본다(`pages/NoticeDetail.jsx`).
 *
 * 관심공고와 알림은 원본을 안 갖고 있다. 목록에 필요한 것만 줄여서 담기
 * 때문이다 — 원본에는 「신청가능/대상아님」 같은 판정이 들어 있는데, 그건
 * 담을 때의 프로필 기준이라 며칠 지나면 틀린 말이 된다. 사장님이 그 사이
 * 업종이나 사업 상태를 고쳤으면 더 그렇다.
 *
 * 그래서 열 때 매칭을 다시 돌려서 그 공고를 찾는다. ApplicationGuide 가
 * 이미 같은 방식으로 한다 — localStorage 는 「무엇을 보고 있었나」 힌트로만
 * 쓰고 실제 값은 항상 API 에서 새로 받는다.
 */

import { fetchMatches, DEFAULT_PROFILE } from './api'

/**
 * 연다. 열었으면 true, 그 공고가 이제 없으면 false.
 *
 * 마감돼서 목록에서 빠진 공고일 수 있다 — 공고는 매일 아침 갱신되고
 * 마감된 것은 사라진다. 그때는 false 를 돌려주니 부르는 쪽에서 알려줄 것.
 */
export async function openNoticeById(noticeId, navigate) {
  if (!noticeId) return false

  let profile = DEFAULT_PROFILE
  try {
    const saved = localStorage.getItem('mars-fit-profile')
    if (saved) profile = JSON.parse(saved)
  } catch {
    // 프로필이 깨졌으면 기본값으로. 공고를 찾는 데는 지장이 없다.
  }

  let found = null
  try {
    const { results } = await fetchMatches(profile)
    found = (results ?? []).find(r => r.notice_id === noticeId) ?? null
  } catch {
    return false
  }
  if (!found) return false

  localStorage.setItem('mars-fit-selected-match', JSON.stringify(found))
  navigate('/notice')
  return true
}
