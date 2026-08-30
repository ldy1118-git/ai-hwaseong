/**
 * 창업 여정 상태 관리
 *
 * 사용자가 "아직 모르겠어요"부터 "이미 운영 중이에요"까지
 * 어느 단계에 있는지, 창업 후보는 무엇인지, 각 STEP을 완료했는지를
 * localStorage 에 저장한다.
 *
 * 기기 저장이 원본이고 서버는 통로다 — profile 과 같은 원칙.
 */

const KEY = 'mars-fit-journey'

// STEP 정의
export const STEPS = [
  { num: 1, label: '업종·입지 탐색',      path: '/district' },
  { num: 2, label: '사업 계획 구체화',     path: null },
  { num: 3, label: '사업장 준비',          path: null },
  { num: 4, label: '필수 교육·자격',       path: '/guide/education' },
  { num: 5, label: '인허가·영업신고',      path: '/guide/permit' },
  { num: 6, label: '사업자등록',           path: '/guide/registration' },
  { num: 7, label: '사업 운영 시작',       path: '/home' },
]

const DEFAULT = {
  // 온보딩 경로 A/B/C/D/E
  onboardingPath: null,

  // 2-C에서 선택한 준비 체크리스트
  prepChecklist: {
    hasCategory:  false,  // 업종을 정했어요
    hasBizPlan:   false,  // 사업계획을 세웠어요
    hasLocation:  false,  // 사업장을 알아봤어요
    hasContract:  false,  // 사업장을 계약했어요
    hasEducation: false,  // 필요한 교육을 받았어요
    hasPermit:    false,  // 영업신고·인허가를 받았어요
  },

  // 현재 창업 후보 (상권분석에서 저장)
  // { category, region, address, lat, lng, score, savedAt }
  candidate: null,

  // 비교용 후보 목록 (최대 3개)
  candidates: [],

  // STEP별 완료 여부
  completedSteps: {
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false,
  },

  updatedAt: null,
}

// ── 읽기 ──────────────────────────────────────────────────────────────────

export function getJourney() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT }
    return { ...DEFAULT, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT }
  }
}

// ── 쓰기 ──────────────────────────────────────────────────────────────────

function save(data) {
  const next = { ...data, updatedAt: new Date().toISOString() }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function saveJourney(partial) {
  const current = getJourney()
  return save({ ...current, ...partial })
}

// ── STEP 완료 표시 ─────────────────────────────────────────────────────────

export function completeStep(stepNum) {
  const j = getJourney()
  return save({
    ...j,
    completedSteps: { ...j.completedSteps, [stepNum]: true },
  })
}

// ── 창업 후보 저장 ─────────────────────────────────────────────────────────

export function saveCandidate(candidate) {
  const j = getJourney()
  const updated = { ...candidate, savedAt: new Date().toISOString() }

  // 같은 조합이 이미 있으면 교체, 없으면 앞에 추가 (최대 3개)
  const key = `${candidate.category}|${candidate.address || candidate.region}`
  const existing = j.candidates.filter(
    c => `${c.category}|${c.address || c.region}` !== key
  )
  const candidates = [updated, ...existing].slice(0, 3)

  return save({ ...j, candidate: updated, candidates })
}

export function removeCandidate(index) {
  const j = getJourney()
  const candidates = j.candidates.filter((_, i) => i !== index)
  const candidate = candidates[0] ?? null
  return save({ ...j, candidate, candidates })
}

// ── 현재 단계 자동 추론 ────────────────────────────────────────────────────
//
// 프로필(business_status)과 journey 의 prepChecklist 를 합쳐서
// 지금 몇 단계인지 계산한다.
// 완료된 STEP 중 가장 높은 것의 다음 단계가 현재 단계.

export function inferCurrentStep(profile, journey) {
  const status = profile?.business_status
  const prep   = journey?.prepChecklist ?? {}
  const done   = journey?.completedSteps ?? {}

  // 운영 중 or 신규사업자 → 7단계 (운영 시작)
  if (status === '운영중') return 7

  // 사업자등록 완료 (2-D 경로 or STEP 6 완료)
  if (journey?.onboardingPath === 'D' || done[6]) return 7

  // 인허가·영업신고 완료
  if (prep.hasPermit || done[5]) return 6

  // 필수 교육 완료
  if (prep.hasEducation || done[4]) return 5

  // 사업장 계약 완료
  if (prep.hasContract || done[3]) return 4

  // 사업장 알아보는 중
  if (prep.hasLocation) return 3

  // 업종/사업계획 정해진 상태
  if (prep.hasCategory || prep.hasBizPlan || journey?.candidate) return 2

  return 1
}

// ── 창업 준비도 % ──────────────────────────────────────────────────────────
//
// 7단계를 동등한 가중치로 계산한다.
// 각 단계는 완료(100%)가 아닌 진행 중(50%)도 반영한다.

export function getProgress(profile, journey) {
  const step = inferCurrentStep(profile, journey)
  const done = journey?.completedSteps ?? {}

  // 완료된 단계 수 + 현재 단계를 진행 중(0.5)으로 계산
  const completedCount = Object.values(done).filter(Boolean).length
  const inProgress = step <= 7 && !done[step] ? 0.5 : 0

  return Math.min(100, Math.round(((completedCount + inProgress) / 7) * 100))
}
