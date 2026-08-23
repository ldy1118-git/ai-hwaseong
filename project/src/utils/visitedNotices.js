/**
 * 한 번 열어본 공고를 기억한다.
 *
 * 목록이 마흔 건이 넘는데 다 비슷하게 생겨서, 스크롤을 오르내리다 보면
 * 아까 본 것을 또 연다. 열어본 것은 흐리게 해서 눈이 안 가게 한다.
 *
 * **지우지는 않는다.** 본 공고도 신청은 안 했을 수 있고, 마감 전에 다시
 * 찾을 수도 있다. 흐리게만 하고 자리는 그대로 둔다.
 *
 * 기기에만 둔다. 「어디까지 봤나」는 그 기기에서의 흔적이라 폰까지
 * 따라다닐 이유가 없다 — 관심공고와 다른 점이다.
 */

const KEY = 'mars-fit-visited-notices'
const EVENT = 'mars-fit-visited-changed'

// 공고가 58건이라 넉넉하다. 오래된 것부터 밀어낸다.
const MAX = 300

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function isVisited(noticeId) {
  return Boolean(noticeId) && read().includes(noticeId)
}

export function markVisited(noticeId) {
  if (!noticeId) return
  const list = read().filter(id => id !== noticeId)
  list.push(noticeId)
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)))
  } catch {
    // 저장이 막혀도 화면은 돌아가게 둔다.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeVisited(handler) {
  const onStorage = (e) => { if (!e.key || e.key === KEY) handler() }
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}
