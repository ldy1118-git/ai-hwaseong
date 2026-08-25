/**
 * 신청을 마친 지원사업.
 *
 * 담는 쪽은 `pages/ApplicationGuide.jsx` 의 markApplied() 다. 여기는
 * **읽는 쪽만** 둔다 — 열쇠 문자열이 화면마다 흩어지면 한 곳을 고칠 때
 * 나머지가 조용히 낡는다.
 *
 * 관심공고와 같은 이유로 localStorage 가 원본이다. 로그인이 필수가 아니라
 * (`/home` 에 가드가 없다) 서버에만 두면 로그인 안 한 사장님에게는
 * 신청 기록이 아예 없는 것이 된다. 로그인한 사람은 그 위에 서버 동기화가
 * 얹힌다(`utils/userState.js` 의 mergeApplied — 공고 번호로 합친다).
 *
 * **신청한 사실은 취소되지 않는다.** 빼는 함수를 두지 않은 이유다.
 */

const KEY = 'mars-fit-applied-programs'

/** markApplied() 가 저장한 뒤 쏘는 것. userState 도 이걸 듣고 서버로 올린다. */
const EVENT = 'mars-fit-applied-changed'

/** 신청한 순서대로(최근 것이 앞). 저장할 때 unshift 하므로 그대로 쓴다. */
export function listApplied() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(p => p?.notice_id) : []
  } catch {
    return []
  }
}


/** 다른 화면에서 신청을 마치면 이쪽 목록도 같이 바뀐다. */
export function subscribeApplied(handler) {
  const fire = () => handler(listApplied())
  window.addEventListener(EVENT, fire)
  window.addEventListener('storage', fire)   // 다른 탭
  return () => {
    window.removeEventListener(EVENT, fire)
    window.removeEventListener('storage', fire)
  }
}
