import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  School, Utensils, BookOpen, Coffee, Building2, Search, Train,
  Maximize2, X as XIcon, Sparkles, Users, CreditCard, MapPin,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiUrl } from '../../utils/api'
import marsImg   from '../../../design/mars.png'
import searchImg from '../../../design/search.png'
import findImg   from '../../../design/find.png'

// ── Leaflet 아이콘 ───────────────────────────────────────────────
const leafletIcon = L.icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
})

// ── 순수 Leaflet 지도 컴포넌트 ──────────────────────────────────
function LeafletMap({ position, onMove, radii, markers }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markerRef    = useRef(null)
  const overlayRef   = useRef(null)
  const onMoveRef    = useRef(onMove)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [position.lat, position.lng], zoom: 14, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    const marker = L.marker([position.lat, position.lng], { draggable: true, icon: leafletIcon }).addTo(map)
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng()
      onMoveRef.current({ lat, lng })
    })
    overlayRef.current = L.layerGroup().addTo(map)
    mapRef.current = map; markerRef.current = marker
    setMapReady(true)
    return () => {
      map.remove()
      mapRef.current = null; markerRef.current = null; overlayRef.current = null
      setMapReady(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markerRef.current?.setLatLng([position.lat, position.lng])
    mapRef.current?.setView([position.lat, position.lng], mapRef.current.getZoom(), { animate: true })
  }, [position.lat, position.lng])

  useEffect(() => {
    if (!mapReady || !overlayRef.current || !radii || !markers) return
    overlayRef.current.clearLayers()
    const cfgMap = Object.fromEntries(AMENITY_CONFIG.map(c => [c.key, c]))
    AMENITY_CONFIG.forEach(({ key, color }) => {
      L.circle([position.lat, position.lng], {
        radius: radii[key], color, fillColor: color,
        fillOpacity: 0.07, weight: 1.5, dashArray: '5 4', opacity: 0.6,
      }).addTo(overlayRef.current)
    })
    markers.forEach(({ lat, lng, key, popup }) => {
      const { color, char } = cfgMap[key] || {}
      if (!color) return
      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="width:16px;height:16px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:white;box-shadow:0 1px 4px rgba(0,0,0,.35)">${char}</div>`,
          className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        }),
      }).addTo(overlayRef.current)
      if (popup) m.bindPopup(popup)
    })
  }, [mapReady, position.lat, position.lng, radii, markers])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

// ── 상수 ─────────────────────────────────────────────────────────
const HWS_CENTER = { lat: 37.1999, lng: 126.8317 }

const TZ_LABELS = {
  TZ01: '자정~새벽',  TZ02: '새벽',    TZ03: '오전',
  TZ04: '오전 중반', TZ05: '점심 전후', TZ06: '오후',
  TZ07: '저녁',      TZ08: '밤',       TZ09: '늦은 밤', TZ10: '심야',
}

const AMENITY_CONFIG = [
  { key: 'restaurants', label: '음식점', Icon: Utensils,  color: '#F97316', char: '식' },
  { key: 'cafes',       label: '카페',   Icon: Coffee,    color: '#92400E', char: '카' },
  { key: 'academies',   label: '학원',   Icon: BookOpen,  color: '#8B5CF6', char: '원' },
  { key: 'schools',     label: '학교',   Icon: School,    color: '#3B82F6', char: '학' },
  { key: 'stations',    label: '지하철역', Icon: Train,   color: '#1E3A5F', char: '역' },
]

const DEFAULT_RADII = { schools: 500, restaurants: 500, academies: 500, cafes: 500, stations: 500 }

// 도보 시간 기준 범위 프리셋
const RANGE_PRESETS = [
  { label: '가까이',  meters: 300,  walk: '약 5분', desc: '핵심 상권만' },
  { label: '보통',    meters: 500,  walk: '약 10분', desc: '일반적인 기준', recommended: true },
  { label: '넓게',    meters: 1000, walk: '약 20분', desc: '넓은 상권 반영' },
]

const COMPETITION_THRESHOLDS = {
  restaurants: [30, 80],
  cafes:       [15, 40],
  academies:   [15, 40],
}

function competitionLevel(key, count) {
  const [mid, high] = COMPETITION_THRESHOLDS[key] || [20, 60]
  if (count >= high) return { label: '경쟁 심함',  emoji: '🔴', color: '#EF4444', bg: '#FEF2F2',
    tip: '경쟁이 치열해요. 차별화 전략이 꼭 필요해요.' }
  if (count >= mid)  return { label: '경쟁 보통',  emoji: '🟡', color: '#F97316', bg: '#FFF7ED',
    tip: '어느 정도 경쟁이 있어요. 틈새를 잘 공략해보세요.' }
  return               { label: '경쟁 적음',  emoji: '🟢', color: '#10B981', bg: '#F0FDF4',
    tip: '경쟁이 많지 않아요. 새로운 수요를 만들기 좋아요.' }
}

function calcFootTrafficScore(am, stationPassengers, aptDong) {
  const stationScore = (stationPassengers != null && stationPassengers > 0)
    ? stationPassengers * 0.15
    : am.stations * 650
  const aptScore = Math.round((aptDong?.total_units || 0) * 0.08)
  return Math.round(am.schools * 220 + am.restaurants * 55 + am.cafes * 90 + aptScore + stationScore)
}

function footTrafficLevel(score) {
  if (score >= 8000) return { text: '매우 활발', color: '#10B981',
    desc: '역·학교·아파트가 고루 갖춰진 핵심 상권이에요.' }
  if (score >= 4000) return { text: '활발',     color: '#3B82F6',
    desc: '음식점·카페가 모여 있어 점심·저녁에 사람이 몰려요.' }
  return               { text: '안정적',   color: '#8B5CF6',
    desc: '조용한 주거 중심 상권으로 단골 비중이 높아요.' }
}

async function fetchCommercialSummary({ amenities, aptDong, cardSales, stationPassengersTotal, radii }) {
  const aptLine = aptDong && aptDong.total_units > 0
    ? `아파트: ${aptDong.dong} 내 ${aptDong.complexes}개 단지, ${aptDong.total_units.toLocaleString()}세대`
    : '아파트 정보: 없음'
  const stationLine = amenities.stations > 0
    ? `역: ${amenities.stations}개${stationPassengersTotal > 0 ? ` (일 평균 ${stationPassengersTotal.toLocaleString()}명)` : ''}`
    : '역: 없음'
  let salesLine = ''
  if (cardSales) {
    const b = Math.round(cardSales.total_sales / 100_000_000)
    salesLine = `이 지역 카드매출: 월 약 ${b}억원 / 피크: ${TZ_LABELS[cardSales.peak_tz] || cardSales.peak_tz} (${cardSales.peak_pct.toFixed(1)}%)`
  }
  const bizTotal = amenities.restaurants + amenities.cafes + amenities.academies
  const distLine = bizTotal > 0
    ? `업종 분포: 음식점 ${amenities.restaurants}개, 카페 ${amenities.cafes}개, 학원 ${amenities.academies}개`
    : ''

  const prompt = [
    `반경 ${radii.schools}m 내 학교: ${amenities.schools}개`,
    `반경 ${radii.restaurants}m 내 ${distLine}`,
    stationLine, aptLine, salesLine,
  ].filter(Boolean).join('\n')

  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 응원하는 상권 분석 도우미예요.
창업 예정 위치 데이터를 바탕으로 유동인구 규모, 카드매출 수준, 업종 분포, 경쟁 현황을 짧게 분석해주세요.
마지막에 창업 시 핵심 조언 한 문장을 덧붙여주세요.
"~해요", "~거든요" 처럼 친근한 말투로, 구체적인 숫자를 활용해 주세요.`,
      prompt,
    }),
  })
  const data = await res.json()
  return data.text || ''
}

// ── 공통 UI: 단계 헤더 ───────────────────────────────────────────
function StepHeader({ number, title, desc }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="w-7 h-7 rounded-full bg-navy text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
        {number}
      </span>
      <div>
        <p className="text-sm font-bold text-navy leading-tight">{title}</p>
        {desc && <p className="text-[11px] text-warm-text mt-0.5">{desc}</p>}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function CommercialAnalysisView() {
  const [position, setPosition]           = useState(HWS_CENTER)
  const [address, setAddress]             = useState('')
  const [searching, setSearching]         = useState(false)
  const [radii, setRadii]                 = useState(DEFAULT_RADII)
  const [activePreset, setActivePreset]   = useState(500)
  const [showDetailSliders, setShowDetailSliders] = useState(false)
  const [expanded, setExpanded]           = useState(false)
  const [apiData, setApiData]             = useState(null)
  const [llmSummary, setLlmSummary]       = useState('')
  const [llmLoading, setLlmLoading]       = useState(false)
  const [llmAsked, setLlmAsked]           = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/api/commercial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: position.lat, lng: position.lng, radii }),
      })
        .then(r => r.json())
        .then(setApiData)
        .catch(() => {})
    }, 300)
  }, [position.lat, position.lng, radii])

  useEffect(() => {
    setLlmSummary('')
    setLlmAsked(false)
  }, [position.lat, position.lng])

  const { amenities, displayMarkers, stationPassengersTotal, aptDong, cardSales } = useMemo(() => {
    const counts  = apiData?.counts  || {}
    const markers = apiData?.markers || {}
    const amenities = {
      schools: counts.schools ?? 0, restaurants: counts.restaurants ?? 0,
      academies: counts.academies ?? 0, cafes: counts.cafes ?? 0, stations: counts.stations ?? 0,
    }
    const rawPassengers = markers.stations
      ? markers.stations.reduce((s, st) => s + (st.passengers || 0), 0) : null
    const aptDong   = apiData?.apt_dong   ?? null
    const cardSales = apiData?.card_sales ?? null
    const displayMarkers = []
    ;(markers.schools || []).forEach(s =>
      displayMarkers.push({ lat: s.lat, lng: s.lng, key: 'schools', popup: `<b>${s.name}</b><br>${s.level}` })
    )
    ;(markers.stations || []).forEach(s =>
      displayMarkers.push({
        lat: s.lat, lng: s.lng, key: 'stations',
        popup: `<b>${s.name}역</b> (${s.line})${s.passengers > 0 ? `<br>일 평균 ${s.passengers.toLocaleString()}명` : ''}`,
      })
    )
    ;['restaurants', 'cafes', 'academies'].forEach(key =>
      (markers[key] || []).forEach(s => displayMarkers.push({ lat: s.lat, lng: s.lng, key }))
    )
    return { amenities, displayMarkers, stationPassengersTotal: rawPassengers, aptDong, cardSales }
  }, [apiData])

  const ftScore = useMemo(
    () => calcFootTrafficScore(amenities, stationPassengersTotal, aptDong),
    [amenities, stationPassengersTotal, aptDong]
  )
  const ftLevel  = footTrafficLevel(ftScore)
  const bizTotal = amenities.restaurants + amenities.cafes + amenities.academies

  const applyPreset = useCallback((meters) => {
    setActivePreset(meters)
    setRadii({ schools: meters, restaurants: meters, academies: meters, cafes: meters, stations: meters })
  }, [])

  const handleMarkerMove = useCallback((pos) => {
    setPosition(pos)
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`)
      .then(r => r.json())
      .then(d => {
        if (d.address) {
          const parts = [d.address.suburb || d.address.quarter, d.address.city || d.address.county].filter(Boolean)
          setAddress(parts.join(' '))
        }
      })
      .catch(() => {})
  }, [])

  const handleSearch = useCallback(async (e) => {
    e.preventDefault()
    const q = address.trim()
    if (!q) return
    setSearching(true)
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=kr`
      )
      const data = await res.json()
      if (data[0]) setPosition({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
    } catch {}
    setSearching(false)
  }, [address])

  const setRadius = useCallback((key, value) => {
    setActivePreset(null) // 직접 설정 시 프리셋 해제
    setRadii(prev => ({ ...prev, [key]: Number(value) }))
  }, [])

  const handleAskMaida = useCallback(async () => {
    setLlmLoading(true)
    setLlmSummary('')
    setLlmAsked(true)
    try {
      const text = await fetchCommercialSummary({ amenities, aptDong, cardSales, stationPassengersTotal, radii })
      setLlmSummary(text)
    } catch {
      setLlmSummary('마이다가 잠깐 연결이 끊겼어요. 다시 시도해주세요.')
    } finally {
      setLlmLoading(false)
    }
  }, [amenities, aptDong, cardSales, stationPassengersTotal, radii])

  return (
    <div className="max-w-xl mx-auto px-4 space-y-4 pb-10">

      {/* ─── 마이다 인트로 ─────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy/80 rounded-2xl px-5 py-4 flex items-center gap-4">
        <div className="absolute top-2 right-24 w-1.5 h-1.5 rounded-full bg-white/20" />
        <div className="absolute top-6 right-36 w-1 h-1 rounded-full bg-white/15" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-1">마이다 상권분석</p>
          <p className="text-[15px] font-extrabold text-white leading-snug mb-1.5">
            창업 예정지, 상권 먼저<br />살펴볼게요!
          </p>
          <p className="text-[11px] text-white/70 leading-relaxed">
            위치를 고르면 주변 가게·학교·역·아파트를<br />
            실제 데이터로 분석해드려요.
          </p>
        </div>
        <img src={marsImg} alt="마이다" className="w-20 h-20 object-contain flex-shrink-0"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }} />
      </div>

      {/* ─── STEP 1: 위치 선택 ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
        <StepHeader
          number={1}
          title="어디서 창업하고 싶으세요?"
          desc="지도에서 핀을 드래그하거나 아래에서 주소를 검색해보세요"
        />

        {/* 지도 */}
        <div className="relative rounded-xl overflow-hidden border border-warm-gray/15" style={{ height: 240 }}>
          <LeafletMap position={position} onMove={handleMarkerMove} radii={radii} markers={displayMarkers} />
          <button
            onClick={() => setExpanded(true)}
            className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm border border-warm-gray/30
                       rounded-lg p-1.5 shadow hover:bg-white transition-colors"
            style={{ zIndex: 1000 }}
            title="지도 크게 보기"
          >
            <Maximize2 size={13} className="text-navy" />
          </button>
        </div>

        {/* 현재 위치 표시 */}
        {address && (
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-warm-text">
            <MapPin size={11} className="text-navy flex-shrink-0" />
            <span>선택한 위치: <strong className="text-navy">{address}</strong></span>
          </div>
        )}

        {/* 주소 검색 */}
        <form onSubmit={handleSearch} className="flex gap-1.5 mt-2.5">
          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="예: 동탄역, 병점동, 봉담읍..."
            className="flex-1 min-w-0 text-[11px] bg-gray-50 border border-warm-gray/30 rounded-xl
                       px-3 py-2.5 text-navy placeholder:text-warm-gray/50
                       focus:outline-none focus:border-navy focus:bg-white transition-colors"
          />
          <button type="submit" disabled={searching}
            className="flex-shrink-0 bg-navy text-white rounded-xl px-3 py-2.5 text-xs font-semibold
                       disabled:opacity-50 flex items-center gap-1 transition-opacity">
            <Search size={13} />
            <span className="hidden sm:inline">검색</span>
          </button>
        </form>
      </div>

      {/* ─── STEP 2: 범위 설정 ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
        <StepHeader
          number={2}
          title="얼마나 넓은 범위를 살펴볼까요?"
          desc="걸어서 이동 가능한 거리를 기준으로 선택해보세요"
        />

        {/* 프리셋 버튼 3개 */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {RANGE_PRESETS.map(({ label, meters, walk, desc, recommended }) => {
            const active = activePreset === meters
            return (
              <button key={meters} onClick={() => applyPreset(meters)}
                className={`relative flex flex-col items-center py-3.5 px-2 rounded-xl border-2 transition-all
                  ${active
                    ? 'border-navy bg-navy text-white shadow-md'
                    : 'border-warm-gray/30 bg-gray-50 text-warm-text hover:border-navy/40 hover:bg-white'
                  }`}
              >
                {recommended && (
                  <span className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full
                    ${active ? 'bg-white text-navy' : 'bg-star-yellow text-navy'}`}>
                    추천
                  </span>
                )}
                <span className="text-sm font-extrabold mb-0.5">{label}</span>
                <span className={`text-[10px] font-medium ${active ? 'text-white/80' : 'text-navy/60'}`}>{walk}</span>
                <span className={`text-[9px] mt-0.5 ${active ? 'text-white/60' : 'text-warm-text/50'}`}>{desc}</span>
              </button>
            )
          })}
        </div>

        {/* 시설별 세부 설정 토글 */}
        <button
          onClick={() => setShowDetailSliders(v => !v)}
          className="w-full flex items-center justify-center gap-1 text-[11px] text-navy/50 hover:text-navy transition-colors py-1"
        >
          {showDetailSliders ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showDetailSliders ? '세부 설정 닫기' : '시설 종류별로 따로 설정하기'}
        </button>

        {showDetailSliders && (
          <div className="mt-3 pt-3 border-t border-warm-gray/10 space-y-3">
            {AMENITY_CONFIG.map(({ key, label, Icon, color }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon size={10} style={{ color }} />
                    <span className="text-[11px] text-warm-text">{label} 반경</span>
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color }}>
                    {radii[key] >= 1000 ? `${radii[key] / 1000}km` : `${radii[key]}m`}
                  </span>
                </div>
                <input
                  type="range" min={100} max={3000} step={50}
                  value={radii[key]}
                  onChange={e => setRadius(key, e.target.value)}
                  className="w-full h-1.5 cursor-pointer"
                  style={{ accentColor: color }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── STEP 3: 분석 결과 ────────────────────────────────── */}
      <div>
        <div className="flex items-start gap-3 mb-4">
          <span className="w-7 h-7 rounded-full bg-navy text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
          <div className="flex-1 flex items-center gap-2">
            <div>
              <p className="text-sm font-bold text-navy leading-tight">이 위치의 상권은 어때요?</p>
              <p className="text-[11px] text-warm-text mt-0.5">선택한 범위 안의 데이터를 분석한 결과예요</p>
            </div>
            <img src={searchImg} alt="" className="w-8 h-8 object-contain flex-shrink-0 ml-auto" />
          </div>
        </div>

        {/* 주변 시설 요약 칩 */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {AMENITY_CONFIG.map(({ key, label, Icon, color }) => (
            <div key={key}
              className="flex items-center gap-1 bg-white rounded-full px-2.5 py-1.5
                         border border-warm-gray/20 shadow-sm">
              <Icon size={9} style={{ color }} />
              <span className="text-[10px] text-warm-text">{label}</span>
              <span className="text-[11px] font-extrabold text-navy">{amenities[key]}</span>
              <span className="text-[9px] text-warm-text">개</span>
            </div>
          ))}
        </div>

        {/* 핵심 지표 4개 */}
        <div className="grid grid-cols-2 gap-3 mb-3">

          {/* 유동인구 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
            <div className="flex items-center gap-1 mb-1">
              <Users size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">유동인구 예측</p>
            </div>
            <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
              {ftScore >= 10000
                ? `${(ftScore / 10000).toFixed(1)}만`
                : ftScore.toLocaleString()}
              <span className="text-[11px] font-normal text-warm-text ml-1">명/일</span>
            </p>
            <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: ftLevel.color, background: ftLevel.color + '18' }}>
              {ftLevel.text}
            </span>
            <p className="text-[10px] text-warm-text mt-1.5 leading-snug">{ftLevel.desc}</p>
          </div>

          {/* 카드매출 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
            <div className="flex items-center gap-1 mb-1">
              <CreditCard size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">이 지역 카드매출</p>
            </div>
            {cardSales ? (
              <>
                <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
                  {Math.round(cardSales.total_sales / 100_000_000).toLocaleString()}
                  <span className="text-[11px] font-normal text-warm-text ml-1">억/월</span>
                </p>
                <p className="text-[10px] text-warm-text mt-2 leading-snug">
                  가장 바쁜 시간대는<br />
                  <strong className="text-navy">{TZ_LABELS[cardSales.peak_tz] || cardSales.peak_tz}</strong>이에요
                  <span className="text-warm-text/60"> ({cardSales.peak_pct.toFixed(1)}%)</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-warm-text/30 mt-1">—</p>
                <p className="text-[10px] text-warm-text mt-2 leading-snug">화성시 집계 지역 밖이에요</p>
              </>
            )}
          </div>

          {/* 거주수요 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
            <div className="flex items-center gap-1 mb-1">
              <Building2 size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">주변 아파트</p>
            </div>
            {aptDong && aptDong.total_units > 0 ? (
              <>
                <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
                  {aptDong.total_units.toLocaleString()}
                  <span className="text-[11px] font-normal text-warm-text ml-1">세대</span>
                </p>
                <p className="text-[10px] text-warm-text mt-2 leading-snug">
                  <strong className="text-navy">{aptDong.dong}</strong>에<br />
                  단지 {aptDong.complexes}개가 있어요
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-warm-text/30 mt-1">—</p>
                <p className="text-[10px] text-warm-text mt-2 leading-snug">이 동의 아파트 정보가 없어요</p>
              </>
            )}
          </div>

          {/* 역세권 */}
          <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
            <div className="flex items-center gap-1 mb-1">
              <Train size={10} className="text-warm-text" />
              <p className="text-[10px] text-warm-text font-medium">역세권</p>
            </div>
            {amenities.stations > 0 ? (
              <>
                <p className="text-xl font-extrabold text-navy tabular-nums leading-none">
                  {amenities.stations}
                  <span className="text-[11px] font-normal text-warm-text ml-1">개역</span>
                </p>
                <p className="text-[10px] text-warm-text mt-2 leading-snug">
                  {stationPassengersTotal > 0
                    ? <>일 평균 <strong className="text-navy">
                        {stationPassengersTotal >= 10000
                          ? `${(stationPassengersTotal / 10000).toFixed(1)}만`
                          : stationPassengersTotal.toLocaleString()}
                      </strong>명이 이용해요</>
                    : '가까운 역이 있어요'
                  }
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-warm-text/30 mt-1">—</p>
                <p className="text-[10px] text-warm-text mt-2 leading-snug">범위 안에 역이 없어요</p>
              </>
            )}
          </div>
        </div>

        {/* 경쟁 현황 */}
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
          <p className="text-[12px] font-bold text-navy mb-3">경쟁 현황</p>

          {bizTotal > 0 ? (
            <div className="space-y-4">
              {[
                { key: 'restaurants', label: '음식점이', max: 200 },
                { key: 'cafes',       label: '카페가',   max: 80  },
                { key: 'academies',   label: '학원이',   max: 80  },
              ].map(({ key, label, max }) => {
                const count = amenities[key]
                const pct   = Math.min((count / max) * 100, 100)
                const lvl   = competitionLevel(key, count)
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-navy font-medium">
                        {label} <strong className="tabular-nums">{count}개</strong> 있어요
                      </p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: lvl.color, background: lvl.bg }}>
                        {lvl.emoji} {lvl.label}
                      </span>
                    </div>
                    <div className="h-2 bg-warm-gray/15 rounded-full overflow-hidden mb-1">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: lvl.color }} />
                    </div>
                    <p className="text-[10px] text-warm-text">{lvl.tip}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-warm-text/50 py-2">범위 안에 업체 데이터가 없어요</p>
          )}

          {amenities.schools > 0 && (
            <div className="mt-4 pt-3 border-t border-warm-gray/10">
              <p className="text-[11px] text-warm-text">
                <School size={10} className="inline text-blue-500 mr-1 mb-0.5" />
                반경 안에 학교가 <strong className="text-navy">{amenities.schools}개</strong> 있어요 —
                하교 시간대 고객 유입 기대돼요
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── STEP 4: 마이다 종합 분석 ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-7 h-7 rounded-full bg-navy text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
          <div className="flex-1 flex items-start gap-2">
            <div>
              <p className="text-sm font-bold text-navy leading-tight">마이다의 종합 한마디</p>
              <p className="text-[11px] text-warm-text mt-0.5">위 데이터를 보고 마이다가 종합 분석해드려요</p>
            </div>
            <img src={findImg} alt="마이다" className="w-10 h-10 object-contain flex-shrink-0" />
          </div>
        </div>

        <button
          onClick={handleAskMaida}
          disabled={llmLoading || !apiData}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm
                     transition-all disabled:opacity-50 disabled:cursor-not-allowed
                     bg-navy text-white hover:bg-navy/90 active:scale-[0.99]"
        >
          <Sparkles size={15} />
          {llmLoading ? '마이다가 분석 중이에요...' : '마이다에게 이 위치 물어보기'}
        </button>

        {!llmAsked && !llmLoading && (
          <p className="text-center text-[10px] text-warm-text/60 mt-2">
            위 3단계까지 완료한 뒤 눌러보세요
          </p>
        )}

        {llmAsked && (
          <div className="mt-4 pt-4 border-t border-warm-gray/15">
            {llmLoading ? (
              <div className="space-y-2.5 animate-pulse">
                {[1, 0.9, 0.85, 0.7].map((w, i) => (
                  <div key={i} className="h-2.5 bg-warm-gray/20 rounded-full" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{llmSummary}</p>
            )}
          </div>
        )}
      </div>

      {/* ─── 확대 지도 모달 ───────────────────────────────────── */}
      {expanded && (
        <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 9999 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-warm-gray/20 flex-shrink-0">
            <p className="text-sm font-bold text-navy">지도에서 위치 선택</p>
            <button onClick={() => setExpanded(false)} className="p-1 rounded-lg hover:bg-warm-gray/10">
              <XIcon size={20} className="text-navy" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LeafletMap position={position} onMove={handleMarkerMove} radii={radii} markers={displayMarkers} />
          </div>
          <div className="px-4 py-3 border-t border-warm-gray/20 flex-shrink-0 bg-white">
            <form onSubmit={handleSearch} className="flex gap-1.5">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="예: 동탄역, 병점동, 봉담읍..."
                className="flex-1 min-w-0 text-[11px] bg-gray-50 border border-warm-gray/30 rounded-xl
                           px-3 py-2.5 text-navy placeholder:text-warm-gray/50
                           focus:outline-none focus:border-navy transition-colors"
              />
              <button type="submit" disabled={searching}
                className="flex-shrink-0 bg-navy text-white rounded-xl px-3 py-2.5 disabled:opacity-50">
                <Search size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
