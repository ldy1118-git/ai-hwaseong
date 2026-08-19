/**
 * 서류 이름을 화면에 쓸 수 있게 다듬는다.
 *
 * 공고문 첨부(HWP·PDF)에서 뽑은 글이라 원문의 흔적이 그대로 붙어 있다.
 * 데이터는 건드리지 않는다 — 원문에 무엇이 적혀 있었는지가 근거이므로
 * 지우면 안 되고, 보여줄 때만 다듬는다.
 *
 *   자가점검표 ● 진흥원 서식   →  자가점검표        (붙임: 진흥원 서식)
 *   표준 재무제표 증명 또는     →  표준 재무제표 증명
 *   ‘25년 매출액 증빙          →  '25년 매출액 증빙
 */

// 글머리표. 원문에서 항목을 나누던 기호가 이름 안에 섞여 들어온다.
const BULLETS = /[●○▪◆■※□▶·•]/g

// 목록 끝이 잘리면서 남는 접속어. "표준 재무제표 증명 또는" 처럼
// 문장이 중간에서 끝나 보인다.
const DANGLING = /[\s,]*(또는|및|이나|혹은|등)\s*$/

export function cleanDocName(raw) {
  const text = String(raw ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim()
  if (!text) return { name: '', note: null }

  // 첫 글머리표 앞이 이름, 뒤는 부연이다. "자가점검표 ● 진흥원 서식"
  const [head, ...rest] = text.split(BULLETS)
  const name = head.replace(DANGLING, '').replace(/\s+/g, ' ').trim()
  const note = rest.join(' ').replace(/\s+/g, ' ').trim()

  return { name: name || text, note: note || null }
}
