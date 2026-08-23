/**
 * 화면을 떠났다 돌아오면 보던 자리로 되돌려준다.
 *
 * 공고 목록을 한참 내려서 「자세히」로 들어갔다 나오면 맨 위로 튀었다.
 * 다음 공고를 보려면 그 자리까지 다시 내려야 했다. 목록이 길수록 심하다.
 *
 * **목록 화면만 기억한다.** 공고 상세는 주소가 `/notice` 하나뿐이라, 기억해
 * 두면 다른 공고를 열었을 때 앞 공고의 위치로 내려가 버린다.
 *
 * sessionStorage 에 둔다. 탭을 닫으면 사라지는 게 맞다 — 어제 보던 자리로
 * 돌아가고 싶은 사람은 없다.
 */

const KEY = 'mars-fit-scroll'

/* 기억할 화면. 목록이라 되돌아올 이유가 있는 곳들이다. */
const REMEMBER = new Set(['/home', '/schedule', '/district'])

function read() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function write(map) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // 사파리 프라이빗 모드처럼 막힌 경우. 되돌리기만 안 될 뿐이다.
  }
}

export function rememberScroll(path, y) {
  if (!REMEMBER.has(path)) return
  write({ ...read(), [path]: Math.round(y) })
}

/**
 * 되돌린다. 되돌렸으면 멈추는 함수를, 아니면 null.
 *
 * **한 번 옮기고 끝내면 안 된다.** 주소가 바뀌는 순간에는 나가는 화면이
 * 아직 떠 있다(전환 애니메이션 0.12초). 그때 문서가 길다고 옮겨봐야, 곧
 * 그 화면이 사라지면서 브라우저가 스크롤을 도로 당겨간다. 처음에 이걸
 * 놓쳐서 되돌리기가 통째로 안 먹었다.
 *
 * 그래서 자리를 잡고 몇 프레임 버틸 때까지 계속 붙잡는다. 공고 목록이
 * API 를 받아 그려지는 시간도 이걸로 같이 기다려진다.
 *
 * 사장님이 그 사이에 직접 스크롤하면 즉시 손을 뗀다. 우리가 계속 끌어당기면
 * 화면이 말을 안 듣는 것처럼 느껴진다.
 */
export function restoreScroll(path) {
  if (!REMEMBER.has(path)) return null
  const want = read()[path]
  if (!want) return null

  let frames = 0
  let held = 0
  let raf = 0
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('keydown', stop)
  }

  const tick = () => {
    if (stopped) return
    const reachable = document.documentElement.scrollHeight - window.innerHeight
    if (reachable >= want) {
      if (Math.abs(window.scrollY - want) > 2) window.scrollTo(0, want)
      else held += 1
    } else {
      held = 0
    }
    // 여덟 프레임(0.13초쯤) 버티면 자리를 잡은 것으로 본다.
    // 2.5초를 기다려도 안 되면 포기한다 — 공고가 줄어서 그 자리가 아예
    // 없어졌을 수 있다.
    if (held >= 8 || (frames += 1) > 150) { stop(); return }
    raf = requestAnimationFrame(tick)
  }

  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('keydown', stop)
  raf = requestAnimationFrame(tick)
  return stop
}
