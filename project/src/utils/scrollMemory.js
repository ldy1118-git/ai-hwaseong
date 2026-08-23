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
 * 되돌린다. 되돌렸으면 정리 함수를, 아니면 null.
 *
 * 바로 못 옮긴다 — 공고 목록은 API 를 받은 뒤에 그려져서, 화면이 뜬 순간엔
 * 문서가 짧아 그 자리까지 내려갈 수가 없다. 브라우저가 알아서 맨 위로
 * 붙여버린다. 그래서 문서가 충분히 길어질 때까지 몇 프레임 기다린다.
 */
export function restoreScroll(path) {
  if (!REMEMBER.has(path)) return null
  const want = read()[path]
  if (!want) return null

  let frame = 0
  let raf = 0
  const tick = () => {
    const reachable = document.documentElement.scrollHeight - window.innerHeight
    if (reachable >= want) {
      window.scrollTo(0, want)
      return
    }
    // 2초쯤(120프레임) 기다려도 안 길어지면 포기한다. 공고가 줄어서
    // 그 자리가 아예 없어졌을 수 있다.
    if (++frame > 120) return
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
