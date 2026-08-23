/**
 * 기기 사이로 이어보기.
 *
 * 관심공고·달력 메모·서류 진행·신청 완료가 브라우저에만 있었다. PC 에서
 * ★ 담은 공고가 폰에는 없고, 로그아웃하면 통째로 날아갔다.
 *
 * **기기 저장은 그대로 둔다.** 로그인이 필수가 아니라서 서버로 옮기면
 * 로그인 안 한 사람은 ★ 를 눌러도 아무 일이 안 일어난다. 로그인한 사람만
 * 여기서 서버에 같이 올린다.
 *
 *     기기(localStorage)  ← 언제나 원본. 화면은 이것만 읽는다
 *          ↕
 *     서버(user_state)    ← 로그인했을 때만. 다른 기기로 이어주는 통로
 *
 * 올리는 것은 **사장님이 만든 것**뿐이다. 알림 읽음 표시나 일정 탭 토글은
 * 그 기기에서의 습관이라 따라다니면 오히려 이상하다.
 */

import { getToken, getUserState, putUserState } from './api'

/* 서버로 올릴 열쇠. 값은 localStorage 에 들어있는 그대로다. */
const KEYS = {
  favorites: 'mars-fit-favorites',
  notes:     'mars-fit-calendar-notes',
  progress:  'mars-fit-checklist-progress',
  applied:   'mars-fit-applied-programs',
}

/* 이 이벤트 중 하나라도 뜨면 올린다. 각 util 이 저장할 때 쏘는 것들이다. */
const EVENTS = [
  'mars-fit-favorites-changed',
  'mars-fit-calendar-notes-changed',
  'mars-fit-checklist-progress-changed',
  'mars-fit-applied-changed',
]

const PUSH_DELAY = 1500

function readRaw(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장이 막혀도 화면은 돌아가게 둔다.
  }
}

/** 지금 이 기기의 상태를 한 덩이로. */
function snapshot() {
  const out = {}
  for (const [name, key] of Object.entries(KEYS)) {
    const value = readRaw(key)
    if (value !== null && value !== undefined) out[name] = value
  }
  return out
}

/* ── 합치기 ──────────────────────────────────────────────────
 *
 * 로그인할 때 한 번만 한다. 그 뒤로는 이 기기가 원본이고 서버는 그걸
 * 그대로 받아 적는다.
 *
 * 서버에서 「합치기만」 하면 안 되는 이유 — 사장님이 ★ 를 뺀 공고를
 * 서버는 「이 기기에 없을 뿐」인지 「지운 것」인지 구분할 수 없다. 합치기만
 * 하면 뺀 공고가 계속 되살아난다. 그래서 합치는 것은 여기서 한 번이고,
 * 그 뒤로는 통째로 덮어쓴다.
 */

/** 관심공고 — 공고 번호로 합치고, 담은 시각이 늦은 쪽을 남긴다. */
function mergeFavorites(mine = [], theirs = []) {
  const map = new Map()
  for (const item of [...theirs, ...mine]) {
    if (!item?.notice_id) continue
    const old = map.get(item.notice_id)
    if (!old || String(item.saved_at ?? '') >= String(old.saved_at ?? '')) {
      map.set(item.notice_id, item)
    }
  }
  return [...map.values()].sort(
    (a, b) => String(b.saved_at ?? '').localeCompare(String(a.saved_at ?? '')),
  )
}

/** 달력 메모 — 날짜별. 시각이 없어서 이 기기 것을 남긴다. */
function mergeNotes(mine = {}, theirs = {}) {
  return { ...theirs, ...mine }
}

/** 서류 진행 — 공고별. 최근에 손댄 쪽을 남긴다. */
function mergeProgress(mine = {}, theirs = {}) {
  const out = { ...theirs }
  for (const [id, item] of Object.entries(mine)) {
    const old = out[id]
    if (!old || String(item?.updated_at ?? '') >= String(old?.updated_at ?? '')) {
      out[id] = item
    }
  }
  return out
}

/** 신청 완료 — 공고 번호로 합친다. 신청한 사실은 취소되지 않는다. */
function mergeApplied(mine = [], theirs = []) {
  const map = new Map()
  for (const item of [...theirs, ...mine]) {
    if (item?.notice_id) map.set(item.notice_id, item)
  }
  return [...map.values()].sort(
    (a, b) => String(b.applied_at ?? '').localeCompare(String(a.applied_at ?? '')),
  )
}

const MERGERS = {
  favorites: mergeFavorites,
  notes:     mergeNotes,
  progress:  mergeProgress,
  applied:   mergeApplied,
}

/**
 * 서버 것을 내려받아 이 기기 것과 합친다. 로그인 직후에 부른다.
 *
 * 서버에 아무것도 없으면 이 기기 것이 그대로 올라간다 — 둘러보기로
 * 담아둔 것이 계정에 붙는 순간이다.
 */
export async function pullState() {
  if (!getToken()) return false

  let theirs = {}
  try {
    theirs = (await getUserState())?.state ?? {}
  } catch {
    // 서버가 잠깐 안 되는 것뿐이다. 기기 것으로 계속 쓴다.
    return false
  }

  const mine = snapshot()
  const merged = {}
  for (const name of Object.keys(KEYS)) {
    const merge = MERGERS[name]
    const value = merge(mine[name], theirs[name])
    merged[name] = value
    writeRaw(KEYS[name], value)
  }

  // 합친 결과를 서버에도 맞춰둔다. 안 하면 다음 기기가 또 옛것과 합친다.
  try { await putUserState(merged) } catch { /* 다음 변경 때 올라간다 */ }

  // 화면들이 다시 읽게 한다. 각 util 의 구독자가 이 이벤트를 듣고 있다.
  EVENTS.forEach(name => window.dispatchEvent(new Event(name)))
  return true
}

/** 지금 상태를 서버에 올린다. 실패해도 조용히 넘어간다. */
export async function pushState() {
  if (!getToken()) return
  try { await putUserState(snapshot()) } catch { /* 다음 변경 때 다시 */ }
}

let timer = null
let started = false

/**
 * 바뀔 때마다 올리기 시작한다. 앱이 뜰 때 한 번 부른다.
 *
 * 바로 안 올리고 잠깐 모은다 — ★ 를 연달아 세 번 누르면 요청이 세 번
 * 나간다. 마지막 것만 보내도 결과는 같다.
 *
 * 창을 닫거나 탭을 옮길 때도 한 번 밀어넣는다. 모으는 사이에 나가버리면
 * 마지막 변경이 안 올라간다.
 */
export function startStateSync() {
  if (started) return
  started = true

  const schedule = () => {
    if (!getToken()) return
    clearTimeout(timer)
    timer = setTimeout(pushState, PUSH_DELAY)
  }

  EVENTS.forEach(name => window.addEventListener(name, schedule))

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer)
      pushState()
    }
  })
}
