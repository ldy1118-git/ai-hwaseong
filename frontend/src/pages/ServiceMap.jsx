import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, ArrowDown, Home, Calendar, Gift,
  MapPin, MessageCircle, User, BarChart2, Bell, FileCheck,
} from 'lucide-react'

const FLOW = [
  {
    step: '01',
    label: '랜딩',
    path: '/',
    color: 'bg-blue-600',
    lightColor: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-700',
    desc: '서비스 소개 + 업종 비교',
    features: ['주요 기능 한눈에 보기', '업종별 평균 매출·경쟁도 비교', '비로그인 체험 진입'],
  },
  {
    step: '02',
    label: '온보딩',
    path: '/onboarding',
    color: 'bg-purple-600',
    lightColor: 'bg-purple-50 border-purple-200',
    textColor: 'text-purple-700',
    desc: '1분 설정 · 3단계',
    features: ['창업 상황 선택 (운영 중 / 준비 중 / 탐색 중)', '업종·지역·연령·소득 입력', '사업자등록증 OCR 자동 인식'],
  },
  {
    step: '03',
    label: '대시보드',
    path: '/dashboard',
    color: 'bg-hwaseong-blue',
    lightColor: 'bg-blue-50 border-blue-200',
    textColor: 'text-hwaseong-blue',
    desc: '맞춤 홈 화면',
    features: ['긴급 마감 배너 (D-5 이내)', '세무·지원사업·상권 카드 미리보기', '4개 빠른 메뉴 진입'],
  },
]

const FEATURES = [
  {
    icon: Calendar,
    color: 'bg-blue-100 text-blue-600',
    border: 'border-blue-200',
    title: '세무 신고 일정',
    path: '/tax',
    items: ['D-day 배지로 마감 긴급도 표시', '준비 서류 체크리스트 (탭별)', '홈택스 직접 연결'],
  },
  {
    icon: Gift,
    color: 'bg-green-100 text-green-600',
    border: 'border-green-200',
    title: '지원사업 찾기',
    path: '/support',
    items: ['업종·지역 기반 매칭도(%) 표시', '카테고리 필터 (자금/디지털/지역/창업)', '4단계 신청 동행 (자격→서류→제출→대기)'],
  },
  {
    icon: MapPin,
    color: 'bg-purple-100 text-purple-600',
    border: 'border-purple-200',
    title: '상권 변화 보기',
    path: '/district',
    items: ['행정동 단위 상권 선택', '유동인구·매출·점포수 지표', '최근 6개월 방문객 추이 차트'],
  },
  {
    icon: MessageCircle,
    color: 'bg-amber-100 text-amber-600',
    border: 'border-amber-200',
    title: 'AI 챗봇',
    path: '/dashboard',
    items: ['세무·지원·상권 키워드 자동 응답', '빠른 질문 버튼 4종', '출처 명시 (신뢰도 표기)'],
  },
]

export default function ServiceMap() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-hwaseong-blue text-white px-5 pt-12 pb-8">
        <p className="text-blue-200 text-xs font-medium mb-1">MVP v1.0 · 화성시 소상공인 AI 경영동행</p>
        <h1 className="text-2xl font-bold leading-tight mb-2">서비스 구조도</h1>
        <p className="text-blue-100 text-sm">6개 화면 + AI 챗봇으로 구성된 서비스 전체 흐름</p>
      </div>

      {/* 사용자 플로우 */}
      <div className="px-5 pt-6 pb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">사용자 플로우</p>
        <div className="space-y-2">
          {FLOW.map((item, i) => (
            <div key={item.step}>
              <button
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 bg-white ${item.lightColor} text-left transition-all active:scale-95`}
              >
                <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-xs font-bold">{item.step}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-bold text-sm ${item.textColor}`}>{item.label}</span>
                    <span className="text-xs text-gray-400">{item.desc}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.features.map(f => (
                      <span key={f} className="text-[10px] bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
              {i < FLOW.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown size={16} className="text-gray-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium">대시보드에서 진입하는 기능</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* 주요 기능 4종 */}
      <div className="px-5 space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">핵심 기능</p>
        {FEATURES.map(({ icon: Icon, color, border, title, path, items }) => (
          <button
            key={title}
            onClick={() => navigate(path)}
            className={`w-full bg-white rounded-2xl border-2 ${border} p-4 text-left transition-all active:scale-95`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center shrink-0`}>
                <Icon size={17} />
              </div>
              <span className="font-bold text-gray-800 text-sm">{title}</span>
              <ChevronRight size={15} className="text-gray-300 ml-auto" />
            </div>
            <ul className="space-y-1">
              {items.map(item => (
                <li key={item} className="flex items-start gap-2 text-xs text-gray-500">
                  <span className="text-gray-300 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {/* 예정 기능 */}
      <div className="mx-5 mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-amber-700 mb-2">2차 개발 예정</p>
        <div className="flex flex-wrap gap-2">
          {['매출 진단 (AI 분석)', '알림 푸시 (마감 D-7)', '사업자등록증 OCR 실제 연동', '공공 API 실데이터 연동'].map(f => (
            <span key={f} className="text-xs bg-amber-100 text-amber-600 px-2.5 py-1 rounded-full">{f}</span>
          ))}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="px-5 mt-6 space-y-2">
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-hwaseong-blue text-white py-4 rounded-2xl font-bold text-sm"
        >
          대시보드 바로 보기 →
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full bg-white border border-gray-200 text-gray-600 py-3.5 rounded-2xl font-medium text-sm"
        >
          랜딩 페이지로 돌아가기
        </button>
      </div>
    </div>
  )
}
