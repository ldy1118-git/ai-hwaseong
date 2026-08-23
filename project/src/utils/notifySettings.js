/**
 * 알림 설정. 무엇을, 얼마나 잘 맞을 때 알릴지.
 *
 * **브라우저와 서버가 같이 읽는다.** 앱 안의 종은 브라우저가 계산하고,
 * 카톡은 새벽에 연구실 서버가 보낸다(`scripts/notify_kakao.py`). 한쪽만
 * 보면 화면에는 껐는데 카톡은 계속 오는 일이 생긴다.
 *
 * 그래서 저장 자리가 관심공고와 같다 — 기기(localStorage)가 원본이고,
 * 로그인했으면 `user_state.settings` 로 같이 올라간다(`utils/userState.js`).
 * 로그인 안 한 사람은 기기에만 있고, 어차피 카톡도 안 간다.
 *
 * 카톡을 켰는지 껐는지는 여기 없다. 그건 `kakao_notify` 테이블에 토큰이
 * 있느냐로 판단한다 — 설정에 따로 적어두면 둘이 어긋날 수 있다.
 */

const KEY = 'mars-fit-notify-settings'
const EVENT = 'mars-fit-notify-settings-changed'

/**
 * 처음엔 다 켜둔다. 뭐가 있는지 보여주고 시끄러우면 끄게 하는 쪽이,
 * 꺼둔 채로 「알림이 안 오네」 하는 것보다 낫다.
 *
 * minScore 는 조건별 가중평균(0~100)이다. 실제 분포에서 최고가 81,
 * 다수가 73이라 70 아래는 「잘 맞는다」고 말하기 어렵다.
 */
export const DEFAULTS = {
  newNotices: true,   // 조건에 맞는 공고가 새로 떴을 때
  minScore: 70,       // 그중 몇 점 이상만 (60 | 70 | 80)
  deadlines: true,    // 담아둔 공고의 마감이 다가올 때
  tax: true,          // 세무 신고기한이 다가올 때 (운영중인 사업자만)

  // 세무 신고기한을 며칠 전에 알릴지. **여러 개 고를 수 있다.**
  //
  // 하나만 고르게 하면 곤란하다 — 한 달 전에만 알리면 그때 미뤄두고
  // 잊어버리고, 하루 전에만 알리면 서류를 준비할 시간이 없다. 미리 한 번,
  // 코앞에 한 번이 실제로 필요한 모양이다.
  taxLead: [7, 1],
}

/* 점수를 그대로 보여준다.
 *
 * 「넓게·보통·좁게」로 두었더니 같은 것을 두 가지 말로 부르는 꼴이었다 —
 * 홈 공고 카드에는 「매칭 91점」이라고 숫자가 이미 떠 있다. 설정에서만
 * 다른 말을 쓰면 둘이 같은 것인지 알 수가 없다. */
/** 세무 신고기한을 며칠 전에 알릴지. 여러 개 고를 수 있다. */
export const TAX_LEAD_CHOICES = [
  { value: 30, label: '한 달 전' },
  { value: 7,  label: '일주일 전' },
  { value: 1,  label: '하루 전' },
]

export const SCORE_CHOICES = [
  { value: 60, hint: '조건이 조금이라도 맞으면 알려드려요. 알림이 잦아져요.' },
  { value: 70, hint: '웬만큼 맞을 때 알려드려요.' },
  { value: 80, hint: '거의 다 맞을 때만 알려드려요. 놓치는 게 생길 수 있어요.' },
]

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULTS }
    // 저장된 것에 없는 항목은 기본값으로 채운다. 나중에 종류가 하나 늘면
    // 예전에 저장한 사람 화면에서 그것만 조용히 꺼져 있다.
    const merged = { ...DEFAULTS, ...saved }
    // taxLead 는 배열이다. 깨진 값이 들어오면 화면이 죽는다.
    if (!Array.isArray(merged.taxLead)) merged.taxLead = [...DEFAULTS.taxLead]
    merged.taxLead = merged.taxLead.filter(n => Number.isFinite(n)).sort((a, b) => b - a)
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

export function getNotifySettings() {
  return read()
}

export function setNotifySettings(patch) {
  const next = { ...read(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장이 막혀도 화면은 돌아가게 둔다.
  }
  window.dispatchEvent(new Event(EVENT))
  return next
}

export function subscribeNotifySettings(handler) {
  const onStorage = (e) => { if (!e.key || e.key === KEY) handler() }
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}
