import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Info, School, Utensils, BookOpen, Coffee, Building2, Search, Train,
  Maximize2, X as XIcon, Sparkles, Users, CreditCard, ChevronDown, ChevronUp,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiUrl } from '../../utils/api'

/**
 * 상권분석 뷰.
 *
 * District.jsx 에서 떼어냈다. 세무 쪽은 District.jsx 에, 상권 쪽은 여기에 둔다.
 *
 * 지도와 주소 검색에는 API 키가 없다.
 *   타일    — OpenStreetMap
 *   주소검색 — Nominatim (/search, /reverse)
 */

// ── Leaflet 아이콘 CDN 고정 ───────────────────────────────────────
const leafletIcon = L.icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  shadowSize:  [41, 41],
})

// ── 순수 Leaflet 지도 컴포넌트 ───────────────────────────────────
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
    mapRef.current    = map
    markerRef.current = marker
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
          html: `<div style="width:16px;height:16px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:white;box-shadow:0 1px 4px rgba(0,0,0,.35);line-height:1">${char}</div>`,
          className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        }),
      }).addTo(overlayRef.current)
      if (popup) m.bindPopup(popup)
    })
  }, [mapReady, position.lat, position.lng, radii, markers])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

// ── 상수 & 헬퍼 ──────────────────────────────────────────────────

const HWS_CENTER = { lat: 37.1999, lng: 126.8317 }

const TZ_LABELS = {
  TZ01: '자정~새벽 2시', TZ02: '새벽 2~4시', TZ03: '오전',
  TZ04: '오전 중반',    TZ05: '점심 전후',   TZ06: '오후',
  TZ07: '저녁',         TZ08: '밤',          TZ09: '늦은 밤', TZ10: '심야',
}

const AMENITY_CONFIG = [
  { key: 'schools',     label: '학교',   Icon: School,    color: '#3B82F6', char: '학' },
  { key: 'restaurants', label: '음식점', Icon: Utensils,  color: '#F97316', char: '식' },
  { key: 'academies',   label: '학원',   Icon: BookOpen,  color: '#8B5CF6', char: '원' },
  { key: 'cafes',       label: '카페',   Icon: Coffee,    color: '#92400E', char: '카' },
  { key: 'stations',    label: '역',     Icon: Train,     color: '#1E3A5F', char: '역' },
]

const DEFAULT_RADII = { schools: 500, restaurants: 500, academies: 500, cafes: 500, stations: 500 }

// 반경 500m 기준 경쟁 강도 임계값 [보통 시작, 높음 시작]
const COMPETITION_THRESHOLDS = {
  restaurants: [30, 80],
  cafes:       [15, 40],
  academies:   [15, 40],
}

function competitionLevel(key, count) {
  const [mid, high] = COMPETITION_THRESHOLDS[key] || [20, 60]
  if (count >= high) return { label: '높음', color: '#EF4444', bg: '#FEF2F2' }
  if (count >= mid)  return { label: '보통', color: '#F97316', bg: '#FFF7ED' }
  return { label: '낮음', color: '#10B981', bg: '#F0FDF4' }
}

function calcFootTrafficScore(am, stationPassengers, aptDong) {
  const stationScore = stationPassengers != null
    ? stationPassengers * 0.15
    : am.stations * 650
  const aptScore = Math.round((aptDong?.total_units || 0) * 0.08)
  return Math.round(am.schools * 220 + am.restaurants * 55 + am.cafes * 90 + aptScore + stationScore)
}

function footTrafficLabel(score) {
  if (score >= 8000) return { text: '매우 활발', color: '#10B981' }
  if (score >= 4000) return { text: '활발',     color: '#3B82F6' }
  return              { text: '안정적',    color: '#8B5CF6' }
}

async function fetchCommercialSummary({ amenities, aptDong, cardSales, stationPassengersTotal, radii }) {
  const aptLine = aptDong && aptDong.total_units > 0
    ? `아파트: ${aptDong.dong} 내 ${aptDong.complexes}개 단지, ${aptDong.total_units.toLocaleString()}세대`
    : '아파트 정보: 없음'

  const stationLine = amenities.stations > 0
    ? `역: ${amenities.stations}개 (일 평균 ${(stationPassengersTotal || 0).toLocaleString()}명 이용)`
    : '역: 없음'

  let salesLine = ''
  if (cardSales) {
    const billionSales = Math.round(cardSales.total_sales / 100_000_000)
    const peakLabel    = TZ_LABELS[cardSales.peak_tz] || cardSales.peak_tz
    salesLine = `이 지역 카드매출: 월 약 ${billionSales}억원 / 가장 바쁜 시간대: ${peakLabel} (${cardSales.peak_pct.toFixed(1)}%)`
  }

  const bizTotal = amenities.restaurants + amenities.cafes + amenities.academies
  const distLine = bizTotal > 0
    ? `업종 분포: 음식점 ${amenities.restaurants}개, 카페 ${amenities.cafes}개, 학원 ${amenities.academies}개 (합계 ${bizTotal}개)`
    : ''

  const prompt = [
    `반경 ${radii.schools}m 내 학교: ${amenities.schools}개`,
    `반경 ${radii.restaurants}m 내 ${distLine}`,
    stationLine,
    aptLine,
    salesLine,
  ].filter(Boolean).join('\n')

  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 응원하는 상권 분석 도우미예요.
창업 예정 위치의 데이터를 바탕으로 상권을 분석해주세요.
유동인구 규모, 카드매출 수준, 업종 분포(음식점·카페·학원 비율), 경쟁 현황(밀집도)을 각각 짧게 다뤄주세요.
마지막에 창업 시 핵심 조언 한 문장을 덧붙여주세요.
"~해요", "~거든요" 같은 친근한 말투로, 구체적인 숫자를 활용해 주세요.`,
      prompt,
    }),
  })
  const data = await res.json()
  return data.text || ''
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export default function CommercialAnalysisView() {
  const [position, setPosition]   = useState(HWS_CENTER)
  const [address, setAddress]     = useState('')
  const [searching, setSearching] = useState(false)
  const [radii, setRadii]         = useState(DEFAULT_RADII)
  const [expanded, setExpanded]   = useState(false)
  const [sliderOpen, setSliderOpen] = useState(false)
  const [apiData, setApiData]     = useState(null)
  const [llmSummary, setLlmSummary] = useState('')
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmAsked, setLlmAsked]     = useState(false)
  const debounceRef = useRef(null)

  // 위치·반경이 바뀔 때마다 상권 데이터 재조회
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

  // 위치가 바뀌면 LLM 답변 초기화 (새 위치에서 다시 물어보도록)
  useEffect(() => {
    setLlmSummary('')
    setLlmAsked(false)
  }, [position.lat, position.lng])

  const { amenities, displayMarkers, stationPassengersTotal, aptDong, cardSales } = useMemo(() => {
    const counts  = apiData?.counts  || {}
    const markers = apiData?.markers || {}

    const amenities = {
      schools:     counts.schools     ?? 0,
      restaurants: counts.restaurants ?? 0,
      academies:   counts.academies   ?? 0,
      cafes:       counts.cafes       ?? 0,
      stations:    counts.stations    ?? 0,
    }

    const stationPassengersTotal = markers.stations
      ? markers.stations.reduce((sum, s) => sum + (s.passengers || 0), 0)
      : null

    const aptDong   = apiData?.apt_dong   ?? null
    const cardSales = apiData?.card_sales ?? null

    const displayMarkers = []
    ;(markers.schools || []).forEach(s =>
      displayMarkers.push({ lat: s.lat, lng: s.lng, key: 'schools', popup: `<b>${s.name}</b><br>${s.level}` })
    )
    ;(markers.stations || []).forEach(s =>
      displayMarkers.push({
        lat: s.lat, lng: s.lng, key: 'stations',
        popup: `<b>${s.name}역</b> (${s.line})${s.passengers > 0 ? `<br>일 평균 ${s.passengers.toLocaleString()}명 이용` : ''}`,
      })
    )
    ;['restaurants', 'cafes', 'academies'].forEach(key => {
      ;(markers[key] || []).forEach(s => displayMarkers.push({ lat: s.lat, lng: s.lng, key }))
    })

    return { amenities, displayMarkers, stationPassengersTotal, aptDong, cardSales }
  }, [apiData])

  const ftScore = useMemo(
    () => calcFootTrafficScore(amenities, stationPassengersTotal, aptDong),
    [amenities, stationPassengersTotal, aptDong]
  )
  const ftLabel = footTrafficLabel(ftScore)

  const bizTotal = amenities.restaurants + amenities.cafes + amenities.academies

  const applyPosition = useCallback((pos) => setPosition(pos), [])

  const handleMarkerMove = useCallback((pos) => {
    applyPosition(pos)
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`)
      .then(r => r.json())
      .then(d => {
        const addr = d.address
        if (addr) {
          const parts = [addr.road, addr.neighbourhood, addr.suburb, addr.city || addr.county].filter(Boolean)
          setAddress(parts.slice(0, 2).join(' '))
        }
      })
      .catch(() => {})
  }, [applyPosition])

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
      if (data[0]) applyPosition({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
    } catch {}
    setSearching(false)
  }, [address, applyPosition])

  const setRadius = useCallback((key, value) => {
    setRadii(prev => ({ ...prev, [key]: Number(value) }))
  }, [])

  const handleAskMaida = useCallback(async () => {
    setLlmLoading(true)
    setLlmSummary('')
    setLlmAsked(true)
    try {
      const text = await fetchCommercialSummary({
        amenities, aptDong, cardSales,
        stationPassengersTotal,
        radii,
      })
      setLlmSummary(text)
    } catch {
      setLlmSummary('마이다가 잠깐 연결이 끊겼어요. 다시 시도해주세요.')
    } finally {
      setLlmLoading(false)
    }
  }, [amenities, aptDong, cardSales, stationPassengersTotal, radii])

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4 pb-8">

      {/* 데이터 출처 */}
      <div className="flex items-start gap-2 bg-star-yellow/20 border border-star-yellow/50 rounded-xl px-3.5 py-2.5">
        <Info size={12} className="text-navy/50 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-warm-text leading-relaxed">
          음식점·카페·학원 <strong className="text-navy">소상공인시장진흥공단</strong>(2026.06) ·
          학교 <strong className="text-navy">경기도교육청</strong> ·
          역 <strong className="text-navy">한국철도공사</strong> ·
          아파트 <strong className="text-navy">K-apt</strong> 실제 데이터예요.
        </p>
      </div>

      {/* 지도 + 반경 설정 2열 */}
      <div className="flex gap-3 items-stretch">

        {/* 좌측: 지도 + 주소 입력 */}
        <div className="flex flex-col gap-2" style={{ flex: '0 0 58%' }}>
          <div className="relative rounded-2xl shadow-sm" style={{ height: 300 }}>
            <div className="absolute inset-0 rounded-2xl overflow-hidden border border-warm-gray/20">
              <LeafletMap position={position} onMove={handleMarkerMove} radii={radii} markers={displayMarkers} />
            </div>
            <button
              onClick={() => setExpanded(true)}
              title="지도 크게 보기"
              className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm border border-warm-gray/30
                         rounded-lg p-1.5 shadow hover:bg-white transition-colors"
              style={{ zIndex: 1000 }}
            >
              <Maximize2 size={13} className="text-navy" />
            </button>
          </div>
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="도로명주소 입력 후 검색"
              className="flex-1 min-w-0 text-[11px] bg-white border border-warm-gray/30 rounded-xl
                         px-3 py-2 text-navy placeholder:text-warm-gray/60
                         focus:outline-none focus:border-navy transition-colors"
            />
            <button
              type="submit"
              disabled={searching}
              className="flex-shrink-0 bg-navy text-white rounded-xl px-2.5 py-2 disabled:opacity-50 transition-opacity"
            >
              <Search size={14} />
            </button>
          </form>
        </div>

        {/* 우측: 반경 설정 */}
        <div className="flex-1 bg-white rounded-2xl border border-warm-gray/20 shadow-sm overflow-hidden">
          <button
            onClick={() => setSliderOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-[11px] font-bold text-navy">반경 설정</span>
            {sliderOpen
              ? <ChevronUp size={13} className="text-warm-text" />
              : <ChevronDown size={13} className="text-warm-text" />}
          </button>

          {/* 항상 보이는 카운트 요약 */}
          {!sliderOpen && (
            <div className="px-3 pb-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {AMENITY_CONFIG.map(({ key, label, Icon, color }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: color + '22', border: `1.5px solid ${color}` }}>
                    <Icon size={8} style={{ color }} />
                  </div>
                  <span className="text-[10px] text-warm-text flex-1 leading-tight">{label}</span>
                  <span className="text-[11px] font-extrabold text-navy tabular-nums">{amenities[key]}</span>
                  <span className="text-[9px] text-warm-text">개</span>
                </div>
              ))}
            </div>
          )}

          {/* 슬라이더 (펼쳐졌을 때) */}
          {sliderOpen && (
            <div className="px-3 pb-3 space-y-3">
              {AMENITY_CONFIG.map(({ key, label, Icon, color }) => (
                <div key={key}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: color + '22', border: `1.5px solid ${color}` }}>
                      <Icon size={10} style={{ color }} />
                    </div>
                    <span className="text-[10px] text-warm-text flex-1">{label}</span>
                    <span className="text-xs font-extrabold text-navy tabular-nums">{amenities[key]}</span>
                    <span className="text-[9px] text-warm-text">개</span>
                  </div>
                  <div className="pl-6 flex items-center gap-2">
                    <span className="text-[9px] text-warm-text/60 flex-shrink-0">반경</span>
                    <input
                      type="range" min={100} max={3000} step={50}
                      value={radii[key]}
                      onChange={e => setRadius(key, e.target.value)}
                      className="flex-1 h-1.5 cursor-pointer"
                      style={{ accentColor: color }}
                    />
                    <span className="text-[9px] font-semibold w-10 text-right tabular-nums flex-shrink-0"
                      style={{ color }}>
                      {radii[key] >= 1000 ? `${radii[key] / 1000}km` : `${radii[key]}m`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 핵심 지표 4개 ── */}
      <div className="grid grid-cols-2 gap-3">

        {/* 유동인구 예측 */}
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={11} className="text-warm-text" />
            <p className="text-[10px] text-warm-text font-medium">유동인구 예측</p>
          </div>
          <p className="text-xl font-extrabold text-navy tabular-nums leading-tight">
            {ftScore >= 10000
              ? `${(ftScore / 10000).toFixed(1)}만`
              : ftScore.toLocaleString()}
            <span className="text-xs font-normal text-warm-text ml-1">명/일</span>
          </p>
          <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: ftLabel.color, background: ftLabel.color + '18' }}>
            {ftLabel.text}
          </span>
        </div>

        {/* 카드매출 */}
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CreditCard size={11} className="text-warm-text" />
            <p className="text-[10px] text-warm-text font-medium">이 지역 카드매출</p>
          </div>
          {cardSales ? (
            <>
              <p className="text-xl font-extrabold text-navy tabular-nums leading-tight">
                {Math.round(cardSales.total_sales / 100_000_000).toLocaleString()}
                <span className="text-xs font-normal text-warm-text ml-1">억/월</span>
              </p>
              <p className="text-[10px] text-warm-text mt-1">
                피크: <strong className="text-navy">{TZ_LABELS[cardSales.peak_tz] || cardSales.peak_tz}</strong>
                {' '}({cardSales.peak_pct.toFixed(1)}%)
              </p>
            </>
          ) : (
            <p className="text-sm text-warm-text/50 mt-1">집계 지역 외</p>
          )}
        </div>

        {/* 거주수요 (아파트) */}
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 size={11} className="text-warm-text" />
            <p className="text-[10px] text-warm-text font-medium">거주수요
              {aptDong?.dong && (
                <span className="ml-1 text-navy font-bold">· {aptDong.dong}</span>
              )}
            </p>
          </div>
          {aptDong && aptDong.total_units > 0 ? (
            <>
              <p className="text-xl font-extrabold text-navy tabular-nums leading-tight">
                {aptDong.total_units.toLocaleString()}
                <span className="text-xs font-normal text-warm-text ml-1">세대</span>
              </p>
              <p className="text-[10px] text-warm-text mt-1">{aptDong.complexes}개 단지</p>
            </>
          ) : (
            <p className="text-sm text-warm-text/50 mt-1">아파트 정보 없음</p>
          )}
        </div>

        {/* 역 이용객 */}
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Train size={11} className="text-warm-text" />
            <p className="text-[10px] text-warm-text font-medium">역 이용객</p>
          </div>
          {amenities.stations > 0 && stationPassengersTotal != null ? (
            <>
              <p className="text-xl font-extrabold text-navy tabular-nums leading-tight">
                {stationPassengersTotal >= 10000
                  ? `${(stationPassengersTotal / 10000).toFixed(1)}만`
                  : stationPassengersTotal.toLocaleString()}
                <span className="text-xs font-normal text-warm-text ml-1">명/일</span>
              </p>
              <p className="text-[10px] text-warm-text mt-1">반경 내 역 {amenities.stations}개</p>
            </>
          ) : (
            <p className="text-sm text-warm-text/50 mt-1">인근 역 없음</p>
          )}
        </div>
      </div>

      {/* ── 업종 분포 & 경쟁 현황 ── */}
      <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-4">
        <p className="text-[11px] font-bold text-navy mb-3">업종 분포 · 경쟁 현황</p>

        {/* 분포 바 */}
        {bizTotal > 0 ? (
          <div className="mb-4">
            <div className="flex h-3 rounded-full overflow-hidden gap-px mb-1.5">
              {amenities.restaurants > 0 && (
                <div style={{ flex: amenities.restaurants, background: '#F97316' }} title={`음식점 ${amenities.restaurants}개`} />
              )}
              {amenities.cafes > 0 && (
                <div style={{ flex: amenities.cafes, background: '#92400E' }} title={`카페 ${amenities.cafes}개`} />
              )}
              {amenities.academies > 0 && (
                <div style={{ flex: amenities.academies, background: '#8B5CF6' }} title={`학원 ${amenities.academies}개`} />
              )}
            </div>
            <div className="flex gap-3 flex-wrap">
              {[
                { key: 'restaurants', label: '음식점', color: '#F97316' },
                { key: 'cafes',       label: '카페',   color: '#92400E' },
                { key: 'academies',   label: '학원',   color: '#8B5CF6' },
              ].map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[10px] text-warm-text">{label}</span>
                  <span className="text-[10px] font-bold text-navy">{amenities[key]}</span>
                  <span className="text-[9px] text-warm-text">
                    ({bizTotal > 0 ? Math.round((amenities[key] / bizTotal) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-warm-text/50 mb-4">반경 내 업종 데이터 없음</p>
        )}

        {/* 경쟁 현황 */}
        <div className="space-y-2.5">
          {[
            { key: 'restaurants', label: '음식점 경쟁', color: '#F97316', max: 200 },
            { key: 'cafes',       label: '카페 경쟁',   color: '#92400E', max: 80  },
            { key: 'academies',   label: '학원 경쟁',   color: '#8B5CF6', max: 80  },
          ].map(({ key, label, color, max }) => {
            const count = amenities[key]
            const pct   = Math.min((count / max) * 100, 100)
            const lvl   = competitionLevel(key, count)
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-warm-text">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-navy tabular-nums">{count}개</span>
                    <span className="text-[9px] font-semibold px-1.5 py-px rounded-full"
                      style={{ color: lvl.color, background: lvl.bg }}>
                      {lvl.label}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-warm-gray/15 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* 학교 — 경쟁이 아닌 고객 유입 요인 */}
        <div className="mt-3 pt-3 border-t border-warm-gray/10 flex items-center justify-between">
          <span className="text-[10px] text-warm-text">학교 (하교 고객 유입)</span>
          <span className="text-[10px] font-bold text-navy tabular-nums">
            반경 내 {amenities.schools}개
          </span>
        </div>
      </div>

      {/* ── 마이다에게 물어보기 ── */}
      <button
        onClick={handleAskMaida}
        disabled={llmLoading || !apiData}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm
                   transition-all disabled:opacity-50 disabled:cursor-not-allowed
                   bg-navy text-white hover:bg-navy/90 active:scale-[0.99] shadow-md"
      >
        <Sparkles size={15} />
        {llmLoading ? '마이다가 분석 중이에요...' : '마이다에게 이 위치의 상권 물어보기'}
      </button>

      {/* LLM 답변 카드 */}
      {llmAsked && (
        <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0">
              <Sparkles size={12} className="text-navy" />
            </div>
            <p className="text-[11px] font-bold text-navy">마이다 상권 분석</p>
          </div>
          {llmLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-2.5 bg-warm-gray/20 rounded-full w-full" />
              <div className="h-2.5 bg-warm-gray/20 rounded-full w-11/12" />
              <div className="h-2.5 bg-warm-gray/20 rounded-full w-4/5" />
              <div className="h-2.5 bg-warm-gray/20 rounded-full w-9/12" />
            </div>
          ) : (
            <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{llmSummary}</p>
          )}
        </div>
      )}

      {/* 확대 지도 모달 */}
      {expanded && (
        <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 9999 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-warm-gray/20 flex-shrink-0">
            <p className="text-sm font-bold text-navy">상권 지도</p>
            <button onClick={() => setExpanded(false)} className="p-1 rounded-lg hover:bg-warm-gray/10">
              <XIcon size={20} className="text-navy" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LeafletMap position={position} onMove={handleMarkerMove} />
          </div>
          <div className="px-4 py-3 border-t border-warm-gray/20 flex-shrink-0 bg-white">
            <form onSubmit={handleSearch} className="flex gap-1.5">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="도로명주소 입력 후 검색"
                className="flex-1 min-w-0 text-[11px] bg-white border border-warm-gray/30 rounded-xl
                           px-3 py-2.5 text-navy placeholder:text-warm-gray/60
                           focus:outline-none focus:border-navy transition-colors"
              />
              <button
                type="submit"
                disabled={searching}
                className="flex-shrink-0 bg-navy text-white rounded-xl px-3 py-2.5 disabled:opacity-50 transition-opacity"
              >
                <Search size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
