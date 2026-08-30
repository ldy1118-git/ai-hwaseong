/**
 * 외부 사이트 이동 전 미리보기 바텀시트.
 * 어느 사이트인지, 무엇을 하는 곳인지 알려주고 열기 버튼을 제공한다.
 */

export const SITE_INFO = {
  'hometax.go.kr':       { name: '홈택스 (국세청)',            emoji: '🏛', desc: '사업자등록 신청과 세금 관련 증명서 발급을 온라인으로 처리할 수 있어요.' },
  'gov.kr':              { name: '정부24',                     emoji: '🏢', desc: '영업신고 등 각종 인허가 신청을 온라인으로 처리할 수 있어요.' },
  'kfia.or.kr':          { name: '한국식품산업협회',            emoji: '🍱', desc: '식품위생교육(신규 영업자)을 온라인으로 신청하고 수료증을 받을 수 있어요.' },
  'q-net.or.kr':         { name: 'Q-net (한국산업인력공단)',   emoji: '📝', desc: '미용사 면허 등 국가기술자격 시험을 접수하고 합격 여부를 확인할 수 있어요.' },
  'nhis.or.kr':          { name: '국민건강보험공단',            emoji: '💊', desc: '건강보험료 납부 확인서를 발급받을 수 있어요.' },
  '4insure.or.kr':       { name: '4대 사회보험 정보연계센터',  emoji: '🔗', desc: '4대 보험 완납 증명서를 발급받을 수 있어요.' },
  'sbiz.or.kr':          { name: '소상공인마당',               emoji: '🏪', desc: '소상공인 지원사업 신청과 관련 증명서 발급이 가능해요.' },
  'minwon.go.kr':        { name: '민원24',                    emoji: '📋', desc: '각종 민원 서류를 온라인으로 신청할 수 있어요.' },
  'bizno.net':           { name: '사업자등록 조회',            emoji: '📄', desc: '사업자등록 정보를 확인할 수 있어요.' },
  'bizinfo.go.kr':       { name: '기업마당',                  emoji: '🏗', desc: '신청서·사업계획서 양식을 이 공고 페이지에서 다운받을 수 있어요.' },
  'hwaseong.go.kr':      { name: '화성시청',                  emoji: '🏙', desc: '화성시 지원사업 신청 양식을 다운받을 수 있어요.' },
  'mss.go.kr':           { name: '중소벤처기업부',             emoji: '🏛', desc: '중소벤처기업부 지원사업 신청 양식을 다운받을 수 있어요.' },
  'semas.or.kr':         { name: '소상공인시장진흥공단',       emoji: '🏪', desc: '소상공인 지원사업 신청 양식을 다운받을 수 있어요.' },
  'kosmes.or.kr':        { name: '중소기업진흥공단',           emoji: '🏗', desc: '중소기업 지원사업 신청 양식을 다운받을 수 있어요.' },
}

export function getSiteInfo(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    const known = SITE_INFO[host]
    if (known) return known
    // 부분 매칭
    const partial = Object.entries(SITE_INFO).find(([key]) => host.includes(key))
    if (partial) return partial[1]
    return { name: host, emoji: '🌐', desc: '해당 사이트에서 서류를 발급받을 수 있어요.' }
  } catch {
    return { name: '외부 사이트', emoji: '🌐', desc: '해당 사이트에서 서류를 발급받을 수 있어요.' }
  }
}

export default function SiteLaunchSheet({ url, docName, onClose }) {
  if (!url) return null
  const site = getSiteInfo(url)

  function open() {
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div
        className="fixed bottom-0 inset-x-0 z-[70] bg-white rounded-t-3xl shadow-2xl max-w-2xl mx-auto"
        style={{ animation: 'slideUp 0.22s ease' }}
      >
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

        <div className="px-5 pt-4 pb-6">
          <div className="w-10 h-1 bg-warm-gray/40 rounded-full mx-auto mb-5" />

          {/* 사이트 정보 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-navy/8 flex items-center justify-center text-2xl flex-shrink-0">
              {site.emoji}
            </div>
            <div>
              <p className="text-base font-bold text-navy">{site.name}</p>
              <p className="text-xs text-warm-text mt-0.5">{site.desc}</p>
            </div>
          </div>

          {/* 서류명 강조 */}
          {docName && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mb-5 flex items-center gap-2">
              <span className="text-emerald-500 text-base">📄</span>
              <div>
                <p className="text-xs text-warm-text">발급할 서류</p>
                <p className="text-sm font-bold text-gray-800">{docName}</p>
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={open}
            className="w-full py-3.5 rounded-2xl bg-navy text-white text-sm font-bold
                       hover:bg-navy/90 active:scale-[0.98] transition-all mb-2"
          >
            {site.name} 열기 →
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-warm-gray/20 text-navy text-sm font-semibold"
          >
            취소
          </button>
        </div>
      </div>
    </>
  )
}
