/**
 * 서류 준비 진행 상태. 어느 공고의 서류를 어디까지 챙겼나.
 *
 * **예전에는 한 건만 저장했다.** localStorage 에 객체 하나를 통째로
 * `setItem` 하는 구조라, 두 번째 공고의 서류를 준비하기 시작하면 첫 번째
 * 공고에서 체크한 것이 말없이 사라졌다. 관심공고에는 남아 있어서 다시
 * 찾아갈 수는 있었지만, 열어보면 체크가 전부 풀려 있었다.
 *
 * 공고 번호를 열쇠로 하는 지도로 바꾼다. 열쇠 이름은 그대로 둔다 —
 * 이미 저장된 것을 첫 읽기에서 새 모양으로 옮긴다(`migrate`).
 *
 * 저장은 localStorage. 관심공고와 같은 이유로 서버에 안 둔다 — 로그인이
 * 필수가 아니다. **기기가 바뀌면 사라진다.**
 */

const KEY = 'mars-fit-checklist-progress'
const EVENT = 'mars-fit-checklist-progress-changed'

/**
 * 예전 모양(한 건짜리 객체)을 지도로 옮긴다.
 *
 * 옛 값은 최상위에 notice_id 를 들고 있고, 새 값은 공고 번호가 열쇠라
 * 최상위에 그런 것이 없다. 그걸로 구분한다.
 */
function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  if (typeof parsed.notice_id === 'string') {
    return { [parsed.notice_id]: parsed }
  }
  return parsed
}

function read() {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
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

/** 최근에 손댄 것부터. 다 끝낸 것은 빼고 싶으면 부르는 쪽에서 거른다. */
export function listProgress() {
  return Object.values(read()).sort(
    (a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
  )
}

/** 아직 다 못 챙긴 것만. 일정 탭의 「이어서 준비하기」가 쓰는 것. */
export function listUnfinished() {
  return listProgress().filter(p => (p.checkedCount ?? 0) < (p.totalCount ?? 1))
}

export function getProgress(noticeId) {
  return noticeId ? (read()[noticeId] ?? null) : null
}

export function saveProgress(record) {
  if (!record?.notice_id) return
  const map = read()
  map[record.notice_id] = { ...record, updated_at: new Date().toISOString() }
  write(map)
}

export function removeProgress(noticeId) {
  if (!noticeId) return
  const map = read()
  delete map[noticeId]
  write(map)
}

export function subscribeProgress(handler) {
  const onStorage = (e) => { if (!e.key || e.key === KEY) handler() }
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}
