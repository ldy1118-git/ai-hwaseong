/**
 * 신고를 마쳤다는 표시.
 *
 * 7월에 부가세를 냈는데 화면은 계속 D-day 를 셌다. 지원사업에는 서류
 * 진행률이 있는데 세무에는 「했다」고 적을 데가 없었다.
 *
 * **날짜가 정해진 건에만 붙인다.** 원천세를 「매월 10일」 한 줄로 보여주는
 * 자리에서는 완료를 누를 수 없다 — 「9월 10일 것을 냈다」는 말이 되지만
 * 「원천세를 냈다」는 어느 달인지 알 수 없다.
 *
 *     { 'vat-1st-final::2026-07-27': '2026-07-25T02:11:00.000Z', ... }
 *
 * 열쇠에 날짜를 통째로 넣는다. 항목 번호만 쓰면 해가 바뀌어도 같은 열쇠가
 * 되어 작년에 낸 표시가 올해 것에 그대로 붙는다.
 *
 * 기기 저장이 원본이고, 로그인했으면 `utils/userState.js` 가 서버에 같이
 * 올린다. 폰에서 체크한 것이 PC 에도 보인다.
 */

const KEY = 'mars-fit-tax-done'
const EVENT = 'mars-fit-tax-done-changed'

// 지난 것을 언제까지 들고 있을까. 서버에도 같이 올라가는 값이라
// 무한정 쌓이면 안 된다. 재작년 신고를 되짚어 볼 일은 없다.
const KEEP_DAYS = 400

/** 항목 번호와 기한으로 열쇠를 만든다. 기한이 없으면 표시할 수 없다. */
export function taxDoneKey(baseId, dueDate) {
  return baseId && dueDate ? `${baseId}::${dueDate}` : null
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
    window.dispatchEvent(new Event(EVENT))
  } catch {
    // 저장이 막혀도 화면은 돌아가게 둔다.
  }
}

/** 오래된 것을 떨어낸다. 열쇠 뒤쪽이 기한이라 거기서 읽는다. */
function prune(map) {
  const limit = new Date(Date.now() - KEEP_DAYS * 86400000)
    .toISOString().slice(0, 10)
  const out = {}
  for (const [key, at] of Object.entries(map)) {
    const due = key.split('::')[1] ?? ''
    if (due >= limit) out[key] = at
  }
  return out
}

export function listTaxDone() {
  return read()
}

export function isTaxDone(key) {
  return Boolean(key) && Boolean(read()[key])
}

/** 켜고 끄기. 껐으면 열쇠를 지운다 — false 로 남겨두면 계속 쌓인다. */
export function setTaxDone(key, done) {
  if (!key) return
  const map = read()
  if (done) map[key] = new Date().toISOString()
  else delete map[key]
  write(prune(map))
}

export function subscribeTaxDone(handler) {
  window.addEventListener(EVENT, handler)
  // 다른 탭에서 고친 것도 받는다. storage 는 그 탭 말고 다른 탭에만 온다.
  const onStorage = e => { if (e.key === KEY) handler() }
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}
