import { useEffect, useState } from 'react'
import { Sparkles, CalendarClock, Receipt } from 'lucide-react'
import {
  getNotifySettings, setNotifySettings, subscribeNotifySettings,
  SCORE_CHOICES, TAX_LEAD_CHOICES, DEFAULTS,
} from '../../utils/notifySettings'
import KakaoNotifyCard from './KakaoNotifyCard'

/** 켜고 끄는 줄 하나. */
function Row({ icon: Icon, title, desc, on, onToggle, children, showChildren }) {
  // 기본은 켜졌을 때만 보여준다. 세무 쪽은 꺼져 있어도 보여야 한다 —
  // 시점 버튼이 사라지면 「한 달 전」을 끄고 「하루 전」으로 바꿀 수가 없다.
  const open = showChildren ?? on
  return (
    <div className="py-3 border-b border-warm-gray/20 last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon size={15} className={`flex-shrink-0 mt-0.5 ${on ? 'text-navy' : 'text-warm-text'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${on ? 'text-navy' : 'text-warm-text'}`}>{title}</p>
          <p className="text-[13px] text-warm-text leading-relaxed mt-0.5">{desc}</p>
        </div>
        {/* 스위치. checkbox 를 숨기고 모양만 그리면 키보드와 화면낭독기가
            그대로 동작한다 — 직접 만든 div 스위치는 그게 안 된다.

            색과 위치는 peer-checked 가 아니라 on 으로 직접 그린다.
            peer-* 는 **형제**에게만 먹어서, 손잡이(안쪽 span)는 형제가
            아니라 자식이라 무시됐다. 켜도 색만 바뀌고 동그라미가 제자리에
            있었던 게 그 탓이다. 초점 테두리만 형제라 peer 로 둔다. */}
        <label className="flex-shrink-0 cursor-pointer mt-0.5">
          <input
            type="checkbox" checked={on} onChange={onToggle}
            className="sr-only peer" aria-label={title}
          />
          <span className={[
            'block w-11 h-6 rounded-full relative transition-colors duration-150',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-navy/40',
            on ? 'bg-navy' : 'bg-warm-gray/50',
          ].join(' ')}>
            <span className={[
              'absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm',
              'transition-transform duration-150',
              on ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')} />
          </span>
        </label>
      </div>
      {open && children && <div className="mt-2.5 pl-[27px]">{children}</div>}
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
        <p className="text-[13px] font-bold text-warm-text mb-1.5">
          매칭 점수 몇 점부터 알릴까요
        </p>
        <div className="flex gap-1.5">
          {SCORE_CHOICES.map(c => {
            const on = s.minScore === c.value
            return (
              <button
                key={c.value} type="button"
                onClick={() => set({ minScore: c.value })}
                aria-pressed={on}
                className={[
                  'flex-1 rounded-xl border py-2 text-center transition-colors tabular-nums',
                  'text-sm font-bold',
                  on ? 'border-navy bg-navy text-white'
                     : 'border-warm-gray/40 text-warm-text hover:border-navy/40',
                ].join(' ')}
              >
                {c.value}점
              </button>
            )
          })}
        </div>
        {/* 고른 것에 따라 한 줄만 바뀐다. 칸마다 설명을 넣으면 글자가 작아져서
            정작 숫자가 안 읽힌다. */}
        <p className="mt-1.5 text-[13px] text-warm-text leading-relaxed">
          {SCORE_CHOICES.find(c => c.value === s.minScore)?.hint}
          {' '}홈 공고 카드에 보이는 그 점수예요.
        </p>
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
          onToggle={() => {
            // 켤 때 고른 시점이 하나도 없으면 기본값을 되돌려준다.
            // 안 그러면 켜자마자 아무것도 안 오는 상태가 된다.
            if (!s.tax && (s.taxLead ?? []).length === 0) {
              set({ tax: true, taxLead: [...DEFAULTS.taxLead] })
            } else {
              set({ tax: !s.tax })
            }
          }}
          showChildren
        >
          <p className="text-[13px] font-bold text-warm-text mb-1.5">
            며칠 전에 알릴까요 <span className="font-medium">(여러 개 고를 수 있어요)</span>
          </p>
          <div className="flex gap-1.5">
            {TAX_LEAD_CHOICES.map(c => {
              const on = (s.taxLead ?? []).includes(c.value)
              return (
                <button
                  key={c.value} type="button"
                  onClick={() => {
                    const now = s.taxLead ?? []
                    const next = on ? now.filter(v => v !== c.value) : [...now, c.value]
                    // 스위치와 시점을 하나로 묶는다. 마지막 하나를 끄면
                    // 세무 알림도 같이 꺼지고, 다시 하나를 고르면 켜진다.
                    //
                    // 전에는 마지막 하나를 못 끄게 막았다. 그랬더니 「한 달
                    // 전」에서 「하루 전」으로 바꾸려면 하루 전을 먼저 켜야
                    // 했다 — 순서를 강요하는 셈이었다.
                    set({ taxLead: next.sort((a, b) => b - a), tax: next.length > 0 })
                  }}
                  aria-pressed={on}
                  className={[
                    'flex-1 rounded-xl border py-2 text-center text-[13px] font-bold',
                    'transition-colors',
                    on ? 'border-navy bg-navy text-white'
                       : 'border-warm-gray/40 text-warm-text hover:border-navy/40',
                  ].join(' ')}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[13px] text-warm-text leading-relaxed">
            {(s.taxLead ?? []).length === 0
              ? '하나도 안 고르셔서 세무 알림이 꺼져 있어요.'
              : (s.taxLead ?? []).length > 1
              ? '고른 시점마다 한 번씩 알려드려요.'
              : '한 번만 알려드려요. 미리 챙기려면 두 개 이상 고르는 게 좋아요.'}
          </p>
        </Row>
      )}

      {/* 「어디로 받을지」. 위의 「무엇을 받을지」와 같은 상자에 둔다 —
          상자를 나누면 카톡이 또 다른 알림 종류처럼 보인다.
          로그인 안 했으면 스스로 안 그린다. */}
      <div className="pb-3">
        <KakaoNotifyCard inline />
      </div>
    </div>
  )
}
