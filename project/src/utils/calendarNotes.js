/**
 * 달력 메모. 날짜 하나에 사장님이 적어두는 한 덩이.
 *
 * 「25일에 세무사 방문」, 「서류 떼러 가기」 같은 것. 우리가 못 채워주는
 * 일정이 사장님한테는 더 많다.
 *
 * 날짜당 하나만 둔다. 여러 개를 붙일 수 있게 하면 지우기·순서·수정이
 * 따라붙는데, 달력 칸을 눌러 몇 글자 적는 자리에는 과하다. 줄바꿈은
 * 되니까 여러 건을 적어도 된다.
 *
 * 저장은 localStorage — 관심공고와 같은 이유다. 로그인이 필수가 아니라
 * 서버에만 두면 로그인 안 한 사람은 적어도 사라진다. **기기가 바뀌면
 * 없어진다.**
 */

const KEY = 'mars-fit-calendar-notes'
const EVENT = 'mars-fit-calendar-notes-changed'

/** 날짜 열쇠. 달력이 쓰는 'YYYY-M-D'(월 0시작)가 아니라 'YYYY-MM-DD' 로 통일한다. */
export function noteKey(year, month0, day) {
  const pad = n => String(n).padStart(2, '0')
  return `${year}-${pad(month0 + 1)}-${pad(day)}`
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function write(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // 저장이 막혀도 화면은 돌아가게 둔다.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function listNotes() {
  return read()
}

export function getNote(dateKey) {
  return read()[dateKey] ?? ''
}

/**
 * 적는다. 빈 문자열이면 지운다 — 사장님이 다 지우고 나가면 그 날의
 * 표시도 같이 없어져야 한다. 빈 메모가 남아 점만 찍혀 있으면 눌러보고
 * 아무것도 없어서 두 번 헷갈린다.
 */
export function setNote(dateKey, text) {
  if (!dateKey) return
  const map = read()
  const value = (text ?? '').trim()
  if (value) map[dateKey] = value
  else delete map[dateKey]
  write(map)
}

export function subscribeNotes(handler) {
  const onStorage = (e) => { if (!e.key || e.key === KEY) handler() }
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}
