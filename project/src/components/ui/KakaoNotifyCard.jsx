import { useEffect, useState } from 'react'
import { MessageSquare, Check, Loader2 } from 'lucide-react'
import { getToken } from '../../utils/api'
import { getKakaoNotify, goToKakaoNotifyConsent, stopKakaoNotify } from '../../utils/kakao'

/**
 * 카카오톡 알림 켜기·끄기.
 *
 * 조건에 잘 맞는 지원사업이 새로 뜨면 사장님 카톡의 「나와의 채팅」으로
 * 알려준다. 연구실 서버가 매일 아침 공고를 갱신한 뒤 보낸다
 * (`scripts/notify_kakao.py`).
 *
 * **로그인이 있어야 한다.** 보낼 대상을 알아야 하기 때문이다. 로그인을
 * 안 했으면 카드를 안 그린다 — 눌렀는데 「로그인이 필요합니다」만 나오는
 * 버튼은 없느니만 못하다. 종(인앱 알림)은 로그인 없이도 되니까 알림 자체가
 * 없어지는 것은 아니다.
 *
 * 켜는 순간 카카오 동의 화면으로 나갔다가 돌아온다. 로그인할 때 같이 안
 * 받는 이유는 `utils/kakao.js` 에 적어뒀다.
 */
export default function KakaoNotifyCard({ inline = false, className = '' }) {
  const [enabled, setEnabled] = useState(null)   // null = 아직 모름
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loggedIn = Boolean(getToken())

  useEffect(() => {
    if (!loggedIn) return
    let dead = false
    getKakaoNotify()
      .then(d => { if (!dead) setEnabled(Boolean(d.enabled)) })
      .catch(() => { if (!dead) setEnabled(false) })
    return () => { dead = true }
  }, [loggedIn])

  if (!loggedIn) return null

  async function turnOn() {
    setBusy(true); setError('')
    try {
      await goToKakaoNotifyConsent()   // 여기서 화면이 카카오로 넘어간다
    } catch (err) {
      setError(err.message || '알림을 켜지 못했어요')
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true); setError('')
    try {
      await stopKakaoNotify()
      setEnabled(false)
    } catch (err) {
      setError(err.message || '알림을 끄지 못했어요')
    }
    setBusy(false)
  }

  // inline 이면 자기 상자를 안 그린다. 알림 설정 상자 안에 들어갈 때 쓴다 —
  // 「무엇을 받을지」와 「어디로 받을지」가 상자 두 개로 갈려 있으면 같은
  // 층위로 보인다.
  return (
    <div className={[
      inline
        ? 'pt-3 border-t border-warm-gray/20'
        : `bg-white border rounded-2xl px-4 py-3.5 ${enabled ? 'border-[#FEE500]' : 'border-warm-gray/30'}`,
      className,
    ].join(' ')}>
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={14} className={enabled ? 'text-[#3C1E1E]' : 'text-warm-text'} />
        <p className="text-sm font-bold text-navy">카카오톡으로도 받기</p>
        {enabled && (
          <span className="flex items-center gap-0.5 text-[13px] font-bold text-emerald-600">
            <Check size={11} /> 켜짐
          </span>
        )}
      </div>

      <p className="text-[13px] text-warm-text leading-relaxed">
        앱을 안 열어도 카톡으로 알려드려요. 위에서 켜둔 것만 보내요.
        {' '}<span className="text-warm-text">본인에게만 보내고 광고는 보내지 않아요.</span>
      </p>

      {error && (
        <p className="mt-2 text-[13px] text-sunset-orange leading-relaxed">{error}</p>
      )}

      <button
        type="button"
        onClick={enabled ? turnOff : turnOn}
        disabled={busy || enabled === null}
        className={[
          'mt-3 w-full py-2.5 rounded-xl text-[13px] font-bold',
          'flex items-center justify-center gap-1.5',
          'disabled:opacity-40 disabled:cursor-default transition-all active:scale-[.99]',
          enabled
            ? 'border border-warm-gray/40 text-warm-text hover:bg-warm-gray/10'
            : 'bg-[#FEE500] text-[#3C1E1E] hover:brightness-95',
        ].join(' ')}
      >
        {busy && <Loader2 size={13} className="animate-spin" />}
        {enabled === null ? '확인 중...' : enabled ? '알림 끄기' : '카톡으로 알림 받기'}
      </button>
    </div>
  )
}
