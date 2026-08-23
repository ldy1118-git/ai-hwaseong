import { useNavigate } from 'react-router-dom'
import { Info, ChevronRight } from 'lucide-react'

/**
 * 세무일정이 필요 이상으로 많이 뜨는 이유를 설명한다.
 *
 * `taxSchedule` 의 `applies()` 는 **프로필에 값이 없으면 통과**시킨다.
 * 모르면 빼기보다 보여주는 쪽이 안전해서 그렇게 돼 있는데, 화면만 보면
 * 이렇게 나온다.
 *
 *     법인세 신고·납부       ← 개인사업자인데도
 *     종합소득세 신고·납부    ← 법인인데도
 *
 * 둘은 양립할 수 없다. 사장님은 어느 쪽이 자기 것인지 모른 채 둘 다
 * 챙겨야 하나 고민하게 된다. 온보딩에서 「잘 모르겠어요」로 넘기면 이
 * 상태가 된다.
 *
 * 목록을 임의로 줄이지 않는다 — 우리가 모르는 것을 안다고 치고 지우면
 * 진짜 해야 할 신고가 사라진다. 대신 왜 많은지 말하고 고칠 길을 준다.
 */
export default function TaxProfileHint({ profile, className = '' }) {
  const navigate = useNavigate()

  const missing = []
  if (!profile?.entity_type) missing.push({
    key: 'entity_type',
    what: '사업자 형태(개인/법인)',
    then: '법인세와 종합소득세 중 하나만',
  })
  if (!profile?.vat_type) missing.push({
    key: 'vat_type',
    what: '과세유형(일반/간이)',
    then: '부가가치세 신고를 실제 횟수대로',
  })

  if (missing.length === 0) return null

  return (
    <button
      type="button"
      onClick={() => navigate('/onboarding')}
      className={[
        'w-full flex items-start gap-2 text-left',
        'bg-primary-bg border border-warm-gray/30 rounded-xl px-3.5 py-3',
        'hover:border-navy/40 transition-colors duration-150',
        className,
      ].join(' ')}
    >
      <Info size={14} className="text-navy flex-shrink-0 mt-0.5" />
      <span className="flex-1 min-w-0 text-[13px] text-warm-text leading-relaxed">
        {missing.map(m => m.what).join('와 ')}를 아직 안 정하셔서,
        해당될 수 있는 일정을 <b className="text-navy">모두</b> 보여드리고 있어요.
        정해주시면 {missing.map(m => m.then).join(', ')} 보여드릴게요.
      </span>
      <ChevronRight size={14} className="text-warm-text flex-shrink-0 mt-0.5" />
    </button>
  )
}
