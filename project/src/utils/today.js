/**
 * 오늘 날짜. 한국 시간 기준으로 그때그때 구한다.
 *
 * 프롬프트에 "오늘 날짜는 2026년 8월 17일" 처럼 박아뒀더니 그날이 지나자
 * 챗봇이 계속 8월 17일이라고 답했다. 서류 체크리스트 쪽은 더 나빴다 —
 * "접수 기간이 이미 종료됐으면 경고" 를 8월 15일 기준으로 판단해서
 * 그 뒤에 마감된 공고를 못 걸러냈다.
 *
 * 브라우저 시간대가 무엇이든 한국 날짜가 나오게 Asia/Seoul 로 고정한다.
 * 사장님도 심사위원도 한국에 있다.
 */

const SEOUL = 'Asia/Seoul'

/** "2026년 8월 19일" — 프롬프트에 넣어 사람이 읽는 형식. */
export function todayKR(now = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: SEOUL, year: 'numeric', month: 'long', day: 'numeric',
  }).format(now)
}

/** "2026-08-19" — 날짜를 비교할 때. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}
