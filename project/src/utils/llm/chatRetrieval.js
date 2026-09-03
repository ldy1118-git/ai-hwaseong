/**
 * 챗봇이 답하기 전에 **무엇을 읽을지** 고르는 곳.
 *
 * 전에는 검색 대상이 `terms.json`(용어 43 + 서류 26)뿐이었다. 그런데
 * 지령실 입력창 위에 우리가 직접 깔아둔 추천 질문 여섯 개 중 셋이
 * 공고를 묻는다 — 「지금 신청 가능한 지원사업 알려줘」, 「화성시 소상공인
 * 지원금 있어?」, 「이번 달 마감 임박한 공고 알려줘」. 코퍼스에 공고가
 * 없으니 마이다는 셋 다 "공고나 담당 기관에서 직접 확인하세요"로 답했다.
 * **심사위원이 제일 먼저 눌러볼 칩이 제일 못 답하는 칩이었다.**
 *
 * 그래서 읽는 곳을 넷으로 늘렸다.
 *
 *     용어·서류   data/terms.json          예전부터 있던 것
 *     공고        fetchMatches() 결과      사장님 프로필로 이미 매칭된 것
 *     세무일정    taxCalendarEventsAround()
 *     관심공고    listFavorites()          "내가 담아둔 거 뭐였지"
 *
 * 공고는 **사장님에게 매칭된 결과**를 그대로 쓴다. 공고 원본 76건을 다시
 * 읽지 않는 이유는 두 가지다 — 이미 3분 캐시로 받아둔 것이 있고(api.js),
 * 매칭 결과에는 「신청가능/확인필요」 판정과 점수가 붙어 있어서 그냥
 * 목록보다 훨씬 나은 답이 나온다.
 */

import { taxCalendarEventsAround } from '../taxCalendar.js'
import { taxDoneKey, isTaxDone } from '../taxDone.js'
import { listFavorites } from '../favorites.js'
import { todayISO } from '../today.js'

/* ──────────────────────────────────────────────────────────────
 * 문자열 맞추기
 * ────────────────────────────────────────────────────────────── */

const norm = (s) => (s ?? '').replace(/[\s·・,.?!'"()[\]~]/g, '').toLowerCase()

/**
 * 질문 안에서 c 와 겹치는 가장 긴 조각의 길이.
 *
 * 한국어는 조사가 붙어서 낱말 경계가 없다. 「사업자등록증명원 어떻게
 * 발급해요?」에서 '사업자등록증명원'을 통째로 찾는 건 되지만
 * 「임차료 지원 신청」에서 별칭 '임차료 납부 증빙'을 통째로 찾을 수는 없다.
 * 겹치는 조각이 3글자 이상이면 같은 걸 말하는 것으로 본다.
 */
function overlap(q, c) {
  for (let len = c.length; len >= 3; len--) {
    for (let start = 0; start + len <= c.length; start++) {
      const piece = c.slice(start, start + len)
      if (q.includes(piece) && !isGeneric(piece)) return len
    }
  }
  return 0
}

/* 겹친 조각이 어느 이름에나 들어 있는 말이면 겹친 게 아니다.
 *
 * 「지금 신청 가능한 지원사업 알려줘」가 별칭 '융자지원사업'의 뒤 네 글자로
 * 「융자」에 걸렸다. 융자 얘기는 한 마디도 없는 질문인데 말풍선 아래 근거에
 * 「융자」가 떴다 — 출처가 틀리면 출처가 아니다.
 *
 * 아래 STOPWORDS 와 **같은지**만 보면 못 막는다. '지원사업'을 막아도 한 글자
 * 짧은 '지원사'로 다시 샌다. 그래서 흔한 말의 조각인지까지 본다. 반대 방향
 * (조각이 흔한 말을 품고 있는지)은 안 본다 — '사업자등록'이 '사업'을 품었다고
 * 버리면 「사업자등록증명원」이 아무것도 못 찾는다. */
function isGeneric(piece) {
  for (const w of STOPWORDS) if (w.includes(piece)) return true
  return false
}

/**
 * 후보 이름들(본명 + 별칭) 중 질문에 제일 잘 맞는 것.
 *
 * **완전일치가 부분일치를 언제나 이긴다.** 그래서 100 을 얹는다.
 * 예전 점수 함수는 2글자만 겹쳐도 1점씩 쌓고 이름이 길수록 점수가
 * 높아져서, 「이번 달 마감 임박한 공고」에 '사업장현황신고'가 딸려왔다.
 * 실제로 재보니 추천 칩 여섯 개 중 다섯 개에서 상위 3건이 전부 엉뚱한
 * 항목이었다. 문턱도 없어서 무조건 3건을 끌고 왔다.
 */
function scoreNames(question, names) {
  const q = norm(question)
  let exact = 0, partial = 0, hitLabel = null, partLabel = null

  for (const name of names) {
    const c = norm(name)
    if (c.length < 2) continue
    if (q.includes(c)) {
      if (c.length > exact) { exact = c.length; hitLabel = name }
      continue
    }
    const len = overlap(q, c)
    if (len > partial) { partial = len; partLabel = name }
  }

  if (exact)   return { score: 100 + exact, matched: hitLabel }
  if (partial) return { score: partial,     matched: partLabel }
  return null
}

function pickTop(question, list, nameKey, limit) {
  return list
    .map(item => ({ item, hit: scoreNames(question, [item[nameKey], ...(item.aliases ?? [])]) }))
    .filter(o => o.hit)
    .sort((a, b) => b.hit.score - a.hit.score)
    .slice(0, limit)
    .map(o => o.item)
}

/* ──────────────────────────────────────────────────────────────
 * 질문의 결
 * ────────────────────────────────────────────────────────────── */

/**
 * 낱말이 안 겹쳐도 무엇을 묻는지는 알 수 있다.
 *
 * 「지금 신청 가능한 지원사업 알려줘」에는 공고 제목과 겹치는 낱말이
 * 하나도 없다. 검색으로는 아무것도 안 걸린다. 그런데 이건 **목록을
 * 달라는 질문**이라서 검색이 아니라 상위 몇 건을 그냥 주면 된다.
 */
export function detectIntent(question) {
  const q = norm(question)
  const has = (...ws) => ws.some(w => q.includes(w))

  return {
    /* 「뭐 있어?」 — 검색이 아니라 목록.
     *
     * 여기에 '알려줘'를 넣었다가 뺐다. 무슨 질문이든 끝에 붙는 말이라,
     * 「임차료 지원 신청 방법 알려줘」에도 목록형으로 걸려서 상관없는
     * 공고 다섯 건이 딸려나갔다. 사장님이 임차료를 물었는데 벤처인증
     * 공고를 읽게 된다. **목록이 나갈 자리는 「뭐 있어?」뿐이다.** */
    list:     has('신청가능', '신청할수있', '받을수있', '받을수', '지원사업', '지원금',
                  '추천', '뭐가있', '뭐있', '어떤게있', '어떤사업', '해당되는', '나한테맞'),
    deadline: has('마감', '임박', '언제까지', '얼마안남', '급한', '서두', '기한'),
    tax:      has('세금', '신고', '부가세', '부가가치세', '종소세', '종합소득세',
                  '원천세', '원천징수', '납부', '세무', '홈택스', '가산세'),
    docs:     has('서류', '준비물', '제출', '뭘내', '뭐내', '발급', '증명', '떼'),
    favorite: has('담아둔', '관심공고', '즐겨찾', '찜한', '별표', '저장한'),
  }
}

/* ──────────────────────────────────────────────────────────────
 * 공고
 * ────────────────────────────────────────────────────────────── */

const OPEN = new Set(['접수중', '기간미상'])

function daysLeft(end, today) {
  if (!end) return null
  const ms = new Date(`${end}T00:00:00`) - new Date(`${today}T00:00:00`)
  return Number.isNaN(ms) ? null : Math.round(ms / 86400000)
}

/**
 * 지금 신청할 수 있는 것만 남긴다.
 *
 * 「대상아님」을 빼는 이유는, 남겨두면 마이다가 사장님이 못 받는 사업을
 * 신나게 설명하기 때문이다. 「확인필요」는 남긴다 — 우리도 되는지
 * 모른다는 뜻이지 안 된다는 뜻이 아니다.
 */
function openNotices(matches, today) {
  return (matches ?? []).filter(m => {
    if (m?.overall_status === '대상아님') return false
    if (!OPEN.has(m?.application_status)) return false
    /* 「접수중」인데 마감일이 어제인 공고가 있다. 공고는 새벽 06:11 에
     * 한 번 받아오므로 그 뒤에 자정을 넘긴 것은 판정이 하루 낡아 있다.
     * 오늘 48건 중 1건이 그랬고, 어제 마감한 수만큼 매일 생긴다.
     *
     * 남겨두면 두 가지가 같이 망가진다 — 끝난 사업을 1순위로 권하고,
     * D-day 가 음수라 프롬프트에 「(D--1)」이 실려서 마이다가 그대로
     * 따라 적는다. 마감일이 아예 없는 공고(절반이 그렇다)는 남긴다. */
    const end = m?.apply_period?.end
    return !(end && end < today)
  })
}

/* 질문에서 뜻이 있는 낱말만 뽑는다.
 *
 * 공고 제목으로는 부분일치 검색이 안 통한다. 제목이 「2026년 소상공인
 * 고용보험료 지원사업 공고」처럼 길고, 어느 제목에나 '지원'·'사업'·'공고'가
 * 들어 있어서다. 실제로 재보니 「임차료 지원 신청 방법 알려줘」가
 * '료지원' 세 글자로 고용보험료 공고에 걸렸다.
 *
 * 형태소 분석기는 안 쓴다. 번들에 사전이 통째로 들어가는데(수 MB) 얻는
 * 것에 비해 너무 무겁다. 띄어쓰기로 자르고 조사만 떼면 이 정도 질문에는
 * 충분하다 — 「전시회 참가 지원 있어?」에서 '전시회'만 남으면 된다. */
const PARTICLE = /(은|는|이|가|을|를|에|의|도|만|로|으로|와|과|랑|이랑|부터|까지|에서|에게|한테|보다|처럼)$/

// 어느 공고 제목에나 들어 있어서 검색어가 못 되는 낱말.
const STOPWORDS = new Set([
  '지원', '사업', '공고', '신청', '모집', '알려', '알려줘', '있어', '있나', '있어요',
  '없어', '어떻게', '방법', '뭐야', '뭐가', '받을', '받고', '싶어', '해줘', '하는',
  '되나', '되나요', '참여', '대상', '관련', '해당', '가능', '내용', '정보',
  '지금', '요즘', '이번', '올해', '우리',
  // '지원'·'사업'이 각각 걸러지는데 붙여 쓴 '지원사업'은 안 걸러져서,
  // 「지금 신청 가능한 지원사업 알려줘」가 검색으로 빠졌다. 열려 있는
  // 48건 중 20건(42%)의 제목에 이 넉 자가 들어 있어서, 제목에 이 말이
  // 있느냐 없느냐로 네 건이 뽑혔다 — 내일 마감하는 국내전시회 단체관은
  // 제목이 「모집 공고」라 빠졌다. **이건 검색이 아니라 목록을 달라는
  // 질문이다.** 걸러내면 아래 intent.list 로 떨어져 상위 5건이 나간다.
  '지원사업',
  // 두 글자도 제목에 있으면 통과하게 되면서 흔한 말을 따로 막아야 해졌다.
  // 열려 있는 47건의 제목에서 재본 값이다 — 모집 62%, 기업 45%, 경기 28%.
  // '비용'은 2% 로 드물지만 「간판 교체 비용」의 '비용'이 「벤처인증 비용
  // 지원사업」에 걸린다. 무엇에 드는 돈인지를 빼면 남는 게 없는 말이라 뺀다.
  // '참가'는 '참여'와 같은 말이다. 「전시회 참가 지원 있어?」가 '참가'만으로
  // 「참가기업 모집」 상투구를 셋 더 끌고 왔다.
  '모집', '기업', '경기', '비용', '참가',
  // 서비스 자체에 대한 물음('조건 충족 여부 어떻게 확인해?')이 아무 공고나
  // 끌고 오지 않게. 공고 제목·본문에 흔한 낱말이라 검색어가 못 된다.
  '조건', '충족', '여부', '확인', '확인해', '준비', '서류', '기준',
])

/* 조사를 떼고 남는 것이 한 글자면 떼지 않는다.
 *
 * 「판로」의 '로'는 조사가 아니라 낱말의 일부인데 그냥 떼면 '판' 한 글자가
 * 되고, 두 글자 미만은 버리므로 검색어가 통째로 사라진다. 판로는 열려
 * 있는 공고 여덟 건이 말하는 주제인데 「판로 지원 있어?」가 한 건도 못
 * 찾았다. 진로·경로도 같은 자리에서 없어진다. */
function stripParticle(word) {
  const stem = word.replace(PARTICLE, '')
  return stem.length >= 2 ? stem : word
}

/* norm 을 조사 떼기보다 먼저 한다. 「'전시회'를」처럼 따옴표가 붙으면
 * 조사가 끝에 안 와서 안 떨어지고, '전시회를'로 남아 제목의 '전시회'에
 * 안 걸린다. 부호를 먼저 털어내면 그럴 일이 없다. */
function keywords(question) {
  return question
    .split(/[\s,./?!·]+/)
    .map(w => stripParticle(norm(w)))
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

/* 제목에 있으면 그것만으로 통과선을 넘긴다.
 *
 * 전에는 제목을 요약문의 두 배로만 쳤다(길이×2 vs 길이). 그러면 **두 글자
 * 낱말은 제목에 있어도 4점이라 문턱 6 을 못 넘는다.** 판로·자금·대출·보증·
 * 고용·수출·점포 — 사장님이 실제로 치는 말이 대부분 두 글자다. 「판로 지원
 * 있어?」가 판로가 제목에 든 공고를 두고도 한 건도 못 찾았다.
 *
 * 문턱을 4 로 내리는 것으로는 안 된다. 요약문에 네 글자만 겹쳐도 통과해서,
 * 「소상공인」처럼 거의 모든 요약문에 있는 말이 아무 공고나 네 건 끌고 온다.
 *
 * 그래서 길이가 아니라 **어디에 있느냐**로 가른다. 제목이면 +4 를 얹어
 * 두 글자(6)부터 통과하고, 요약문에만 있으면 길이 그대로라 여섯 글자
 * 이상인 긴 구절만 통과한다. 재보니 열려 있는 공고 47건에서 판로·대출·
 * 보증은 제목 1건씩(2%)이고 모집 29건(62%)·기업 21건(45%)·경기 13건(28%)
 * 이다. 뒤쪽은 길이가 아니라 흔해서 검색어가 못 되므로 아래 STOPWORDS 로
 * 뺀다. */
const KEYWORD_FLOOR = 6
const TITLE_BONUS = 4

function keywordScore(notice, keys) {
  const title = norm(notice.notice_title)
  const summary = norm(notice.summary)
  let score = 0
  for (const k of keys) {
    if (title.includes(k)) score += k.length + TITLE_BONUS
    else if (summary.includes(k)) score += k.length
  }
  return score
}

/**
 * 질문에 맞는 공고를 고른다.
 *
 * 목록형 질문이면 검색을 건너뛰고 상위 몇 건을 준다. `/api/match` 가
 * 이미 「접수중 먼저, 그 안에서 점수순」으로 정렬해서 보내주므로
 * 여기서 다시 sort 하지 않는다 — **받은 배열을 그 자리에서 바꾸면
 * 같은 객체를 나눠 쓰는 다른 화면의 순서까지 바뀐다**(project/CLAUDE.md).
 */
export function retrieveNotices(question, matches, intent = detectIntent(question), today = todayISO()) {
  const open = openNotices(matches, today)
  if (!open.length) return []

  /* 「마감」·「기한」은 세무 질문에도 붙는다. 「부가세 신고 기한 언제야?」에
   * 마감 임박 공고 다섯 건을 딸려 보내면 안 된다 — 그건 세무일정이 답할
   * 질문이다. 세무 쪽이 같이 걸리면 공고 목록은 내지 않는다. */
  if (intent.deadline && !intent.tax) {
    // 마감일이 없는 공고가 절반이다. 날짜가 있는 것만 D-day 로 줄 세운다 —
    // 없는 것에 날짜를 지어 붙이는 것보다 빼는 게 낫다.
    const dated = open
      .map(m => ({ m, d: daysLeft(m?.apply_period?.end, today) }))
      .filter(o => o.d !== null && o.d >= 0)
      .sort((a, b) => a.d - b.d)
      .map(o => o.m)
    if (dated.length) return dated.slice(0, 5)
  }

  const keys = keywords(question)
  if (keys.length) {
    const found = open
      .map(m => ({ m, score: keywordScore(m, keys) }))
      .filter(o => o.score >= KEYWORD_FLOOR)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(o => o.m)
    if (found.length) return found
  }

  return intent.list ? open.slice(0, 5) : []
}

export function formatNoticeContext(notices, today = todayISO()) {
  if (!notices.length) return ''
  const lines = ['=== 사장님께 매칭된 지원사업 (RAG · 오늘 기준 실제 데이터) ===']

  for (const n of notices) {
    const d = daysLeft(n?.apply_period?.end, today)
    lines.push(`\n[${n.notice_title ?? '제목 없음'}]`)
    lines.push(`  주관: ${n.organizer ?? '미상'} / 판정: ${n.overall_status} (적합도 ${n.match_score}점)`)
    lines.push(`  접수: ${n.apply_period?.start ?? '?'} ~ ${n.apply_period?.end ?? '마감일 미정'}`
             + (d !== null ? ` (D-${d})` : ''))
    if (n.summary)      lines.push(`  내용: ${n.summary.slice(0, 220)}`)
    if (n.apply_method) lines.push(`  신청방법: ${n.apply_method}`)
    if (n.contact)      lines.push(`  문의: ${n.contact}`)
    if (n.apply_url)    lines.push(`  URL: ${n.apply_url}`)

    // 서류가 열 개 넘는 공고가 있다. 다 싣지 않는다 — 공고 다섯 건이면
    // 서류만 오십 줄이라 정작 마감일·신청방법이 프롬프트 뒤로 밀린다.
    const need = (n.expected_documents ?? []).map(d2 => d2.name).filter(Boolean)
    if (need.length) {
      lines.push(`  필요서류: ${need.slice(0, 8).join(', ')}`
               + (need.length > 8 ? ` 외 ${need.length - 8}건` : ''))
    }

    // 「확인필요」가 왜 확인필요인지 말해줄 수 있어야 한다. 이것 없이는
    // 마이다가 "확인이 필요해요"까지만 말하고 무엇을 확인할지 못 말한다.
    // detail 에 공고문 원문이 통째로 들어 있는 건이 있다. 잘라 싣는다.
    const unknown = (n.condition_results ?? []).filter(c => c.status === '확인필요')
    if (unknown.length)
      lines.push(`  확인필요: ${unknown.map(c => (c.detail ?? c.condition).slice(0, 120)).join(' / ')}`)
  }
  return lines.join('\n')
}

/* ──────────────────────────────────────────────────────────────
 * 세무일정
 * ────────────────────────────────────────────────────────────── */

/**
 * 다가오는 신고기한. 화면(일정 탭)이 쓰는 것과 **같은 함수**를 부른다.
 * 여기서 날짜를 다시 계산하면 챗봇과 달력이 다른 날을 말하게 된다.
 */
export function retrieveTax(profile, today = todayISO(), limit = 4) {
  let events = []
  try { events = taxCalendarEventsAround(profile) } catch { return [] }

  const done = e => {
    try { return isTaxDone(taxDoneKey(e.groupId ?? e.id, e.dueDate)) } catch { return false }
  }

  const future = events
    .filter(e => e?.dueDate && e.dueDate >= today && !done(e))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  /* 매월 반복은 제일 가까운 한 건만 남긴다. `/schedule` 오른쪽 목록과
   * 같은 규칙이다(`pages/Schedule.jsx` 의 TaxSchedule).
   *
   * 안 접으면 원천세가 자리를 다 차지한다. 직원 있는 사장님에게 다가오는
   * 기한 넉 줄을 주면 「원천세(매월)」이 9·10·11·12월로 네 줄이 되고,
   * 10월 25일 부가세 예정고지는 한 줄도 못 들어간다. 사장님이 「다음
   * 신고 뭐예요?」라고 물었는데 원천세만 네 번 듣는다. */
  const seen = new Set()
  const out = []
  for (const e of future) {
    if (e.recurring) {
      if (seen.has(e.groupId)) continue
      seen.add(e.groupId)
    }
    out.push(e)
    if (out.length >= limit) break
  }
  return out
}

export function formatTaxContext(events, today = todayISO()) {
  if (!events.length) return ''
  const lines = ['=== 사장님의 다가오는 세무 신고기한 (RAG · 실제 계산값) ===']
  for (const e of events) {
    const d = daysLeft(e.dueDate, today)
    lines.push(`\n[${e.title}] ${e.dueDate}${d !== null ? ` (D-${d})` : ''}`)
    if (e.easy)    lines.push(`  쉬운 설명: ${e.easy}`)
    if (e.covers)  lines.push(`  대상 기간: ${e.covers}`)
    if (e.where)   lines.push(`  어디서: ${e.where}`)
    if (e.docs?.length) lines.push(`  준비물: ${e.docs.join(', ')}`)
    if (e.penalty) lines.push(`  늦으면: ${e.penalty}`)
    if (e.caution) lines.push(`  주의: ${e.caution}`)
    // 법정기한이 공휴일·주말이라 밀린 날은 그렇다고 말해줘야 한다.
    if (e.moved && e.due) lines.push(`  (법정기한 ${e.due} 이 공휴일·주말이라 ${e.dueDate} 로 밀렸습니다)`)
  }
  return lines.join('\n')
}

/* ──────────────────────────────────────────────────────────────
 * 관심공고
 * ────────────────────────────────────────────────────────────── */

export function formatFavoriteContext(limit = 5) {
  let favs = []
  try { favs = listFavorites() } catch { return '' }
  if (!favs.length) return ''
  const lines = ['=== 사장님이 ★ 로 담아둔 공고 ===']
  for (const f of favs.slice(0, limit)) {
    lines.push(`- ${f.notice_title ?? f.title ?? f.notice_id}`
             + (f.apply_period?.end ? ` (마감 ${f.apply_period.end})` : ' (마감일 미정)'))
  }
  return lines.join('\n')
}

/* ──────────────────────────────────────────────────────────────
 * 용어·서류 (예전부터 있던 것 — 점수 함수만 갈았다)
 * ────────────────────────────────────────────────────────────── */

export function retrieveContext(question, termsData) {
  return {
    terms: pickTop(question, termsData?.terms ?? [],     'term', 3),
    docs:  pickTop(question, termsData?.documents ?? [], 'name', 3),
  }
}
