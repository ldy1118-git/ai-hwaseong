import { useEffect, useState } from 'react'
import { Sparkles, CalendarClock, Receipt } from 'lucide-react'
import {
  getNotifySettings, setNotifySettings, subscribeNotifySettings, SCORE_CHOICES,
} from '../../utils/notifySettings'

/** 켜고 끄는 줄 하나. */
function Row({ icon: Icon, title, desc, on, onToggle, children }) {
  return (
    <div className="py-3 border-b border-warm-gray/20 last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon size={15} className={`flex-shrink-0 mt-0.5 ${on ? 'text-navy' : 'text-warm-gray'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${on ? 'text-navy' : 'text-warm-gray'}`}>{title}</p>
          <p className="text-[12px] text-warm-text leading-relaxed mt-0.5">{desc}</p>
        </div>
        {/* 스위치. checkbox 를 숨기고 모양만 그리면 키보드와 화면낭독기가
            그대로 동작한다 — 직접 만든 div 스위치는 그게 안 된다. */}
        <label className="flex-shrink-0 cursor-pointer mt-0.5">
          <input
            type="checkbox" checked={on} onChange={onToggle}
            className="sr-only peer" aria-label={title}
          />
          <span className="block w-10 h-6 rounded-full bg-warm-gray/40 transition-colors
                           peer-checked:bg-navy peer-focus-visible:ring-2
                           peer-focus-visible:ring-navy/40 relative">
            <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white
                             transition-transform peer-checked:translate-x-4" />
          </span>
        </label>
      </div>
      {on && children && <div className="mt-2.5 pl-[27px]">{children}</div>}
    </div>
  )
}

/**
 * 어떤 알림을 받을지.
 *
 * 여기서 끄면 **앱 안의 종과 카톡이 같이** 안 온다. 설정은 로그인했으면
 * 서버로도 올라가고(`utils/userState.js`), 새벽에 카톡을 보낼 때 서버가
 * 그 값을 본다(`scripts/notify_kakao.py`). 한쪽만 보면 화면에는 껐는데
 * 카톡은 계속 오는 일이 생긴다.
 *
 * 세무 신고기한은 운영중인 사업자에게만 있다. 아니면 줄 자체를 안 그린다 —
 * 켜도 아무것도 안 오는 스위치는 고장 난 것처럼 보인다.
 */
export default function NotifySettings({ profile, className = '' }) {
  const [s, setS] = useState(getNotifySettings)

  useEffect(() => subscribeNotifySettings(() => setS(getNotifySettings())), [])

  const set = patch => setS(setNotifySettings(patch))
  const isOwner = profile?.business_status === '운영중'

  return (
    <div className={`bg-white border border-warm-gray/30 rounded-2xl px-4 ${className}`}>
      <Row
        icon={Sparkles}
        title="조건에 맞는 새 공고"
        desc="공고는 매일 아침 갱신돼요. 그중 내 조건에 맞는 게 뜨면 알려드려요."
        on={s.newNotices}
        onToggle={() => set({ newNotices: !s.newNotices })}
      >
        <p className="text-[11px] font-bold text-warm-text mb-1.5">얼마나 잘 맞아야 알릴까요</p>
        <div className="flex gap-1.5">
          {SCORE_CHOICES.map(c => {
            const on = s.minScore === c.value
            return (
              <button
                key={c.value} type="button"
                onClick={() => set({ minScore: c.value })}
                aria-pressed={on}
                className={[
                  'flex-1 rounded-xl border px-2 py-2 text-center transition-colors',
                  on ? 'border-navy bg-navy text-white'
                     : 'border-warm-gray/40 text-warm-text hover:border-navy/40',
                ].join(' ')}
              >
                <span className="block text-[12px] font-bold">{c.label}</span>
                <span className={`block text-[10px] mt-0.5 ${on ? 'text-white/70' : 'text-warm-gray'}`}>
                  {c.hint}
                </span>
              </button>
            )
          })}
        </div>
      </Row>

      <Row
        icon={CalendarClock}
        title="담아둔 공고 마감"
        desc="★ 로 담은 공고와 서류를 준비 중인 공고가 마감되기 전에 알려드려요."
        on={s.deadlines}
        onToggle={() => set({ deadlines: !s.deadlines })}
      />

      {isOwner && (
        <Row
          icon={Receipt}
          title="세무 신고기한"
          desc="부가세·종합소득세 같은 신고 기한이 다가오면 알려드려요. 놓치면 가산세가 붙어요."
          on={s.tax}
          onToggle={() => set({ tax: !s.tax })}
        />
      )}
    </div>
  )
}
