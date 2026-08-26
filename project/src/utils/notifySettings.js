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

  /* 카톡을 **언제** 받을지. 앱 안의 종은 여기 안 걸린다 — 열면 바로 보이는
     것이라 시각을 정할 이유가 없다.
   *
   * 공고는 새벽 6시 11분에 받아온다. 예전에는 받자마자 카톡을 보냈는데,
   * 그 시각에 울리는 건 알림이 아니라 민폐다. 받는 일과 보내는 일을 갈랐다.
   *
   * 기본은 **아침 8시, 매일**이다. 요일을 기본에서 줄이지 않는 이유는,
   * 줄이면 세무 신고기한 알림이 하루 늦게 갈 수 있어서다. 완전히 놓치지는
   * 않는다 — 기한 자체가 늘 평일이고(휴일이면 다음 날로 미는 규칙),
   * 최악이라도 기한 당일 아침에는 간다. */
  sendHour: 8,                     // 0~23
  sendMinute: 0,                   // 0·5·10 … 55. 5분 단위다
  sendDays: [0, 1, 2, 3, 4, 5, 6], // 0=일 … 6=토. **JS Date.getDay() 와 같은 번호다**
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

/** 요일 이름. 번호는 Date.getDay() 와 같다 — 0 이 일요일이다. */
export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export const SEND_HOURS = Array.from({ length: 24 }, (_, h) => h)

/* 분은 **5분 단위**다. 1분 단위로 두면 고르기만 번거롭고, 서버가 그만큼
   자주 깨어나야 한다. 지금 발송 cron 이 5분마다 도는 것과 짝이다 —
   여기를 1분으로 바꾸려면 crontab 도 같이 바꿔야 한다. */
export const SEND_MINUTE_STEP = 5
export const SEND_MINUTES = Array.from({ length: 60 / SEND_MINUTE_STEP }, (_, i) => i * SEND_MINUTE_STEP)

/** 「오전 8시」처럼 읽히게. 24시간제로 적으면 아침·저녁이 한눈에 안 온다. */
export function hourLabel(h) {
  if (h === 0) return '밤 12시'
  if (h === 12) return '낮 12시'
  return h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`
}

/** 「오전 8시 30분」. 정각이면 분을 안 붙인다 — 「8시 0분」은 어색하다. */
export function timeLabel(h, m) {
  return m ? `${hourLabel(h)} ${m}분` : hourLabel(h)
}

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

    /* 시각과 요일도 깨진 값이 들어올 수 있다. 여기서 막지 않으면 서버가
       그대로 받아 읽다가 아무 때나 보내거나 아예 안 보낸다. */
    if (!Number.isInteger(merged.sendHour) || merged.sendHour < 0 || merged.sendHour > 23) {
      merged.sendHour = DEFAULTS.sendHour
    }
    // 5분 단위로 맞춘다. 어디선가 7분 같은 값이 들어오면 서버가 도는 시각과
    // 영영 안 맞아서 알림이 안 간다.
    if (!Number.isInteger(merged.sendMinute) || merged.sendMinute < 0 || merged.sendMinute > 59) {
      merged.sendMinute = DEFAULTS.sendMinute
    }
    merged.sendMinute -= merged.sendMinute % SEND_MINUTE_STEP
    if (!Array.isArray(merged.sendDays)) merged.sendDays = [...DEFAULTS.sendDays]
    merged.sendDays = [...new Set(
      merged.sendDays.filter(n => Number.isInteger(n) && n >= 0 && n <= 6),
    )].sort((a, b) => a - b)
    // 하나도 안 남으면 아무 날도 아니라서 영영 안 온다. 화면에서 마지막
    // 하나는 못 끄게 막아두지만, 저장된 값이 깨졌을 때를 대비한다.
    if (merged.sendDays.length === 0) merged.sendDays = [...DEFAULTS.sendDays]

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
