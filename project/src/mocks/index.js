/**
 * VITE_MOCK=true 일 때 모든 API/LLM 호출 대신 반환되는 목업 데이터.
 * UI 개발 전용 — 서버 없이 실행 가능.
 *
 * 사용: .env 에 VITE_MOCK=true 추가 후 npm run build (또는 npm run dev)
 */

const TODAY = new Date()
const daysFrom = (n) => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── 매칭 결과 목업 (fetchMatches 대체) ───────────────────────────────────
export const MOCK_MATCHES = {
  count: 4,
  results: [
    {
      notice_id: 'mock-001',
      notice_title: '2026년 화성시 소상공인 경영안정 자금 지원',
      summary: '화성시 소재 소상공인의 경영 안정을 위해 최대 3천만 원 저금리 융자를 지원합니다.',
      organizer: '화성시',
      operator: '화성시 소상공인지원센터',
      overall_status: '신청가능',
      match_score: 92,
      apply_period: { start: daysFrom(-10), end: daysFrom(42) },
      apply_url: null,
      apply_method: '방문 접수 또는 온라인',
      contact: '화성시 소상공인지원센터 031-000-0000',
      application_detail: '소상공인 경영안정 자금 융자 지원사업입니다. 업력 1년 이상, 화성시 소재 사업장 대상.',
      application_status: '접수중',
      source_url: null,
      condition_results: [
        { condition: '지역', detail: '화성시 소재 사업장 — 충족', status: '충족' },
        { condition: '업력', detail: '12개월 이상 — 충족 (현재 12개월)', status: '충족' },
        { condition: '업종', detail: '음식·카페업 해당', status: '충족' },
        { condition: '소득분위', detail: '일반 과세 소상공인 해당', status: '충족' },
      ],
      expected_documents: [
        { name: '사업자등록증', required_type: '공통필수', confidence: 'confirmed' },
        { name: '신청서', required_type: '공통필수', confidence: 'confirmed' },
        { name: '납세완납증명서', required_type: '공통필수', confidence: 'confirmed' },
        { name: '사업용 통장 사본', required_type: '공통필수', confidence: 'estimated' },
        { name: '임대차계약서', required_type: '조건부', confidence: 'estimated', trigger_reason: '임차 사업장인 경우' },
      ],
    },
    {
      notice_id: 'mock-002',
      notice_title: '2026년 소상공인 디지털 전환 지원사업',
      summary: '카드 단말기·포스 시스템·온라인 판매채널 구축 비용을 최대 200만 원 지원합니다.',
      organizer: '중소벤처기업부',
      operator: '소상공인시장진흥공단',
      overall_status: '조건부',
      match_score: 78,
      apply_period: { start: daysFrom(-5), end: daysFrom(15) },
      apply_url: 'https://www.sbiz.or.kr',
      apply_method: '온라인 신청',
      contact: '소상공인시장진흥공단 1357',
      application_detail: '디지털 전환 지원. 연 매출 1억 5천만 원 이하 소상공인 우선 지원.',
      application_status: '접수중',
      source_url: null,
      condition_results: [
        { condition: '지역', detail: '전국 — 충족', status: '충족' },
        { condition: '업종', detail: '음식업 포함', status: '충족' },
        { condition: '매출', detail: '연 매출 확인 필요 (미입력)', status: '확인필요' },
        { condition: '기존 수혜', detail: '동일 사업 수혜 여부 확인 필요', status: '확인필요' },
      ],
      expected_documents: [
        { name: '사업자등록증', required_type: '공통필수', confidence: 'confirmed' },
        { name: '신청서', required_type: '공통필수', confidence: 'confirmed' },
        { name: '부가가치세 과세표준증명', required_type: '공통필수', confidence: 'confirmed' },
        { name: '견적서', required_type: '조건부', confidence: 'estimated', trigger_reason: '구입 예정 장비 항목' },
      ],
    },
    {
      notice_id: 'mock-003',
      notice_title: '2026년 동반성장몰 입점 지원사업',
      summary: '대형 온라인 마켓 입점 수수료·광고비를 최대 100만 원 지원합니다.',
      organizer: '화성시',
      operator: '화성시 경제진흥원',
      overall_status: '신청가능',
      match_score: 71,
      apply_period: { start: daysFrom(-20), end: daysFrom(60) },
      apply_url: null,
      apply_method: '이메일 접수',
      contact: '화성시 경제진흥원 031-000-1234',
      application_detail: '지역 소상공인 온라인 판로 개척 지원. 제조·판매업 우선.',
      application_status: '접수중',
      source_url: null,
      condition_results: [
        { condition: '지역', detail: '화성시 소재 — 충족', status: '충족' },
        { condition: '업종', detail: '음식·카페업 — 조건부 (제조·판매업 우선)', status: '확인필요' },
      ],
      expected_documents: [
        { name: '사업자등록증', required_type: '공통필수', confidence: 'confirmed' },
        { name: '신청서', required_type: '공통필수', confidence: 'confirmed' },
        { name: '온라인 채널 스크린샷', required_type: '조건부', confidence: 'estimated', trigger_reason: '기존 채널 운영 여부' },
      ],
    },
    {
      notice_id: 'mock-004',
      notice_title: '소상공인 고용보험료 지원사업',
      summary: '소상공인 사업주의 고용보험료 50%를 최대 12개월 지원합니다.',
      organizer: '고용노동부',
      operator: '근로복지공단',
      overall_status: '대상아님',
      match_score: 45,
      apply_period: { start: daysFrom(-30), end: daysFrom(90) },
      apply_url: 'https://www.kcomwel.or.kr',
      apply_method: '온라인 신청',
      contact: '근로복지공단 1588-0075',
      application_detail: '직원 1인 이상 고용 사업주 대상.',
      application_status: '상시',
      source_url: null,
      condition_results: [
        { condition: '고용', detail: '직원 1인 이상 필요 — 불충족 (직원 없음)', status: '불충족' },
      ],
      expected_documents: [
        { name: '사업자등록증', required_type: '공통필수', confidence: 'confirmed' },
        { name: '고용보험 피보험자 명부', required_type: '공통필수', confidence: 'confirmed' },
      ],
    },
  ],
}

// ── 서류 체크리스트 목업 (generateChecklistV1 대체) ──────────────────────
export const MOCK_CHECKLIST = {
  raw: '',
  error: null,
  matched: [],
  unmatched: [],
  parsed: {
    program_name: '2026년 화성시 소상공인 경영안정 자금 지원',
    overall_status: '신청가능',
    status_reason: '모든 필수 조건을 충족했어요.',
    checklist: [
      {
        step: 1,
        document: '사업자등록증 사본',
        required_type: '필수',
        how_to_get: '홈택스(www.hometax.go.kr) → 민원증명 → 사업자등록증명 발급',
        how_to_get_offline: '세무서 방문 발급',
        fee: '무료',
        estimated_time: '즉시 (온라인 5분)',
        url: 'https://www.hometax.go.kr',
        caution: '발급일 기준 3개월 이내 서류여야 해요.',
        confidence: 'confirmed',
        verify_note: null,
      },
      {
        step: 2,
        document: '신청서',
        required_type: '필수',
        how_to_get: '화성시 소상공인지원센터 방문 또는 홈페이지에서 양식 다운로드',
        how_to_get_offline: null,
        fee: '무료',
        estimated_time: '작성 15분',
        url: null,
        caution: null,
        confidence: 'confirmed',
        verify_note: null,
      },
      {
        step: 3,
        document: '납세완납증명서',
        required_type: '필수',
        how_to_get: '홈택스 → 민원증명 → 납세증명서(완납)',
        how_to_get_offline: '세무서 방문',
        fee: '무료',
        estimated_time: '즉시 발급',
        url: 'https://www.hometax.go.kr',
        caution: null,
        confidence: 'confirmed',
        verify_note: null,
      },
      {
        step: 4,
        document: '사업용 통장 사본',
        required_type: '필수',
        how_to_get: '사업자 명의 통장 첫 페이지 복사',
        how_to_get_offline: null,
        fee: '무료',
        estimated_time: '즉시',
        url: null,
        caution: '반드시 사업자 명의여야 해요. 개인 통장은 안 돼요.',
        confidence: 'estimated',
        verify_note: '접수기관에 재확인 권장',
      },
      {
        step: 5,
        document: '임대차계약서',
        required_type: '조건부',
        how_to_get: '임대인과 체결한 계약서 사본 제출',
        how_to_get_offline: null,
        fee: '무료',
        estimated_time: '보유 시 즉시',
        url: null,
        caution: '임차 사업장인 경우만 제출. 자가 사업장이면 건물등기부등본 대체.',
        confidence: 'estimated',
        verify_note: null,
      },
    ],
    pending_conditions: [],
    important_notes: [
      `마감일이 ${daysFrom(42)}이에요. 서류 준비에 여유를 두세요.`,
      '방문 접수 시 화성시 소상공인지원센터 운영시간(평일 09:00~18:00)을 확인하세요.',
    ],
    estimated_prep_days: 2,
    contact: '화성시 소상공인지원센터 031-000-0000',
    apply_method: '방문 접수 또는 온라인',
  },
}

// ── 챗봇 응답 목업 (generateChatbotResponseV1 대체) ─────────────────────
export const MOCK_CHATBOT_RESPONSES = [
  {
    answer: '안녕하세요 사장님! 마이다예요 😊 오늘은 어떤 걸 도와드릴까요? 지원사업 찾기, 서류 준비, 세금 신고 일정 모두 여쭤봐 주세요!',
    retrieved_terms: [],
    retrieved_docs: [],
    confidence: 'high',
    followup: ['어떤 지원사업을 신청하고 싶으세요?', '서류 준비 방법을 알고 싶으세요?'],
  },
  {
    answer: '사업자등록증은 홈택스(www.hometax.go.kr)에서 바로 발급받을 수 있어요! 로그인 후 "민원증명 → 사업자등록증명"을 선택하시면 무료로 즉시 출력 가능해요 💪 세무서 방문 없이 집에서도 되니 편하게 이용하세요!',
    retrieved_terms: ['사업자등록증'],
    retrieved_docs: ['사업자등록증'],
    confidence: 'high',
    followup: ['납세완납증명서도 필요한가요?', '신청서는 어디서 받나요?'],
  },
  {
    answer: '납세완납증명서는 홈택스에서 "민원증명 → 납세증명서(완납)"로 무료 발급돼요. 발급 즉시 PDF로 받을 수 있어서 편리해요 ✨ 발급일 기준 3개월 이내 서류가 필요하니 신청 직전에 발급받는 게 좋아요!',
    retrieved_terms: ['납세완납증명서'],
    retrieved_docs: ['납세완납증명서'],
    confidence: 'high',
    followup: ['다른 서류도 알고 싶으세요?', '세금 신고 일정도 확인해드릴까요?'],
  },
]

let _chatbotIdx = 0
export function nextMockChatbotResponse() {
  const r = MOCK_CHATBOT_RESPONSES[_chatbotIdx % MOCK_CHATBOT_RESPONSES.length]
  _chatbotIdx++
  return r
}

// ── 용어 조회 목업 (lookupTerms 대체) ────────────────────────────────────
export const MOCK_TERMS_LOOKUP = {
  terms: [
    {
      term: '납세완납증명서',
      easy: '세금을 다 냈다는 걸 국세청이 확인해주는 서류예요.',
      caution: '발급일 기준 3개월 이내 서류여야 해요.',
      verified: true,
    },
    {
      term: '과세표준',
      easy: '세금을 계산할 때 기준이 되는 매출액이에요.',
      caution: null,
      verified: true,
    },
  ],
  documents: [
    {
      name: '사업자등록증',
      easy: '사업을 합법적으로 하고 있다는 국가 공인 서류예요.',
      issue: {
        online: ['홈택스 → 민원증명 → 사업자등록증명'],
        offline: ['세무서 방문'],
        fee: '무료',
        time: '즉시',
        url: 'https://www.hometax.go.kr',
      },
      verified: true,
    },
  ],
  glossary: {},
}

// ── OCR 목업 (Onboarding 사업자등록증 스캔 대체) ─────────────────────────
// 키 이름은 /api/ocr 가 돌려주는 것과 같아야 한다. 영문 키로 두었더니
// Onboarding 이 r.업종 · r.개업일 을 읽는데 값이 undefined 라, mock 모드에서
// 사업자등록증을 올려도 아무것도 안 채워졌다. 에러가 안 나서 몰랐다.
export const MOCK_OCR_RESULT = {
  상호명:        '마이카페',
  사업자등록번호: '123-45-67890',
  대표자:        '홍길동',
  업태:          '음식점업',
  업종:          '카페',
  주소:          '경기도 화성시 동탄대로 123',
  개업일:        '20250801',   // YYYYMMDD — monthsFromOpen 이 이 형식만 받는다
  과세유형:      '일반과세자',
}

// 네트워크 딜레이를 흉내내는 헬퍼
export const delay = (ms = 600) => new Promise(r => setTimeout(r, ms))
