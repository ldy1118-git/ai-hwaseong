/**
 * 관심공고. 사장님이 ★ 를 누른 공고와, 서류를 준비하기 시작한 공고를 모은다.
 *
 * 왜 localStorage 냐 — 로그인이 필수가 아니다. `/home` 에 가드가 없어서
 * 카카오 로그인 없이도 서비스를 다 쓸 수 있다. 서버에만 두면 로그인 안 한
 * 사람은 ★ 를 눌러도 아무 일이 안 일어난다. 신청완료(`mars-fit-applied-programs`)
 * 와 체크리스트 진행도 이미 같은 자리에 있다.
 *
 * **기기가 바뀌면 사라진다.** 나중에 카톡 알림을 붙일 때는 서버가 밤중에
 * 이 목록을 읽어야 하는데 localStorage 는 서버가 못 본다. 그때 Supabase
 * 동기화를 여기 더한다 — 화면 쪽은 이 파일만 보고 있으므로 그쪽은 안 바뀐다.
 *
 * 저장 형식 — 공고 원본을 통째로 넣지 않는다. 목록을 그리는 데 필요한
 * 것만 남긴다. 원본은 크고, 매칭 결과는 프로필이 바뀌면 어차피 달라진다.
 */

const KEY = 'mars-fit-favorites'

/** 목록이 바뀌었을 때 화면들에게 알린다. storage 이벤트는 다른 탭에만 가서 따로 쏜다. */
const EVENT = 'mars-fit-favorites-changed'

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // 사파리 프라이빗 모드처럼 저장이 막힌 경우. 화면은 그냥 돌아가게 둔다.
  }
  window.dispatchEvent(new Event(EVENT))
}

/**
 * 공고를 저장할 모양으로 줄인다.
 *
 * 부르는 곳마다 손에 든 것이 다르다 — Home 은 mapMatch 를 거친 카드
 * ({id, title, raw}), NoticeDetail 과 ApplicationGuide 는 API 원본
 * ({notice_id, notice_title}). 둘 다 받는다.
 */
export function toFavorite(notice) {
  if (!notice) return null
  const raw = notice.raw ?? notice
  const id = raw.notice_id ?? notice.id
  if (!id) return null
  return {
    notice_id:    id,
    notice_title: raw.notice_title ?? notice.title ?? '이름 없는 공고',
    organizer:    raw.organizer ?? notice.organizer ?? null,
    apply_period: raw.apply_period ?? {},
    apply_url:    raw.apply_url ?? notice.applyUrl ?? null,
  }
}

export function listFavorites() {
  return read()
}

export function isFavorite(noticeId) {
  if (!noticeId) return false
  return read().some(f => f.notice_id === noticeId)
}

/**
 * 추가한다. 이미 있으면 아무것도 안 한다 — 눌린 상태를 유지한다.
 *
 * auto 는 서류준비를 시작해서 자동으로 담긴 것. 사장님이 직접 누른 게
 * 아니라서 목록에 「서류 준비 중」이라고 적어준다. 자동으로 담겼다가
 * 손으로 다시 누르면 auto 를 떼서 직접 담은 것으로 올린다.
 */
export function addFavorite(notice, { auto = false } = {}) {
  const item = toFavorite(notice)
  if (!item) return read()

  const list = read()
  const found = list.find(f => f.notice_id === item.notice_id)
  if (found) {
    if (!auto && found.auto) {
      found.auto = false
      write(list)
    }
    return list
  }

  list.unshift({ ...item, auto, saved_at: new Date().toISOString() })
  write(list)
  return list
}

export function removeFavorite(noticeId) {
  const list = read().filter(f => f.notice_id !== noticeId)
  write(list)
  return list
}

/** 눌렀을 때. 담겼으면 true 를 돌려준다. */
export function toggleFavorite(notice) {
  const item = toFavorite(notice)
  if (!item) return false
  if (isFavorite(item.notice_id)) {
    removeFavorite(item.notice_id)
    return false
  }
  addFavorite(notice)
  return true
}

/**
 * 마감이 급한 것부터. 저장 순서(담은 순)는 안 건드리고 복사본을 돌려준다.
 *
 * 마감일이 없는 공고가 절반이다 — 58건 중 30건은 apply_period 에 end 가
 * 없고 「세부사업별 상이」 같은 note 뿐이다. 그것들은 아직 신청할 수 있으니
 * 날짜가 있는 것들 아래, 이미 끝난 것 위에 둔다. 순서는
 *
 *     급한 것 → 먼 것 → 마감일 미정 → 마감됨
 *
 * 마감된 것을 맨 아래로 내리는 이유는 이제 할 수 있는 게 없어서다. 지우지는
 * 않는다 — 사장님이 담아둔 것을 우리가 말없이 치우면 사라진 줄 안다.
 */
export function sortByDeadline(list, today) {
  const day = today ?? new Date().toISOString().slice(0, 10)
  const rank = (f) => {
    const end = f.apply_period?.end
    if (typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [1, '']
    return end < day ? [2, end] : [0, end]
  }
  return [...list].sort((a, b) => {
    const [ga, da] = rank(a)
    const [gb, db] = rank(b)
    if (ga !== gb) return ga - gb
    if (da === db) return 0
    // 마감된 것끼리는 최근에 끝난 것이 위로. 오래된 것이 위에 있으면
    // 방금 놓친 게 제일 아래로 밀린다.
    return ga === 2 ? (da < db ? 1 : -1) : (da < db ? -1 : 1)
  })
}

/**
 * 목록이 바뀔 때마다 부른다. 해제 함수를 돌려준다.
 *
 *     useEffect(() => subscribeFavorites(() => setList(listFavorites())), [])
 *
 * 같은 탭에서는 EVENT 로, 다른 탭에서는 storage 로 온다. 한 화면에 ★ 가
 * 여러 개 떠 있을 때 하나를 누르면 나머지도 같이 바뀌어야 한다.
 */
export function subscribeFavorites(handler) {
  const onStorage = (e) => { if (!e.key || e.key === KEY) handler() }
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}
