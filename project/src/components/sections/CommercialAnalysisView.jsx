import { useState, useEffect, useRef, useCallback, useMemo, createElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  School, Utensils, BookOpen, Coffee, Search, Train,
  Maximize2, X as XIcon, Sparkles, Users, MapPin,
  ChevronDown, ChevronUp, ShoppingBag, Scissors, Stethoscope,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiUrl } from '../../utils/api'
import findImg   from '../../../design/find.png'
import { saveCandidate } from '../../utils/journey'

// ── Leaflet 아이콘 ───────────────────────────────────────────────
const leafletIcon = L.icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
})

// ── 순수 Leaflet 지도 컴포넌트 ──────────────────────────────────
function LeafletMap({ position, onMove, radii, markers, sizeKey, recommendPins = [] }) {
  const containerRef    = useRef(null)
  const mapRef          = useRef(null)
  const markerRef       = useRef(null)
  const overlayRef      = useRef(null)
  const recommendRef    = useRef(null)
  const onMoveRef       = useRef(onMove)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  useEffect(() => {
    if (mapRef.current) setTimeout(() => mapRef.current?.invalidateSize(), 50)
  }, [sizeKey])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [position.lat, position.lng], zoom: 14, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    const marker = L.marker([position.lat, position.lng], { draggable: true, icon: leafletIcon }).addTo(map)
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng()
      onMoveRef.current({ lat, lng })
    })
    overlayRef.current   = L.layerGroup().addTo(map)
    recommendRef.current = L.layerGroup().addTo(map)
    mapRef.current = map; markerRef.current = marker
    setMapReady(true)
    return () => {
      map.remove()
      mapRef.current = null; markerRef.current = null
      overlayRef.current = null; recommendRef.current = null
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
      const { color, Icon } = cfgMap[key] || {}
      if (!color || !Icon) return
      const svgHtml = renderToStaticMarkup(createElement(Icon, { size: 11, color: 'white', strokeWidth: 2.5 }))
      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="width:22px;height:22px;background:${color};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">${svgHtml}</div>`,
          className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        }),
      }).addTo(overlayRef.current)
      if (popup) m.bindPopup(popup)
    })
  }, [mapReady, position.lat, position.lng, radii, markers])

  // 추천 핀 (업종 모드에서만 사용)
  useEffect(() => {
    if (!mapReady || !recommendRef.current) return
    recommendRef.current.clearLayers()
    if (!recommendPins.length) return

    recommendPins.forEach(pin => {
      const colors  = ['#cb6b3d', '#2a3c77', '#10b981']
      const bg      = colors[(pin.rank - 1) % colors.length]
      const m = L.marker([pin.lat, pin.lng], {
        icon: L.divIcon({
          html: `<div style="width:32px;height:32px;background:${bg};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.4);cursor:pointer">
                   <span style="color:white;font-size:13px;font-weight:900">${pin.rank}</span>
                 </div>`,
          className: '', iconSize: [32, 32], iconAnchor: [16, 16],
        }),
        zIndexOffset: 1000,
      }).addTo(recommendRef.current)
      m.bindPopup(`<b>${pin.rank}위 추천 상권</b><br>반경 내 동종업종 ${pin.count}개`)
      m.on('click', () => onMoveRef.current({ lat: pin.lat, lng: pin.lng }))
    })

    if (recommendPins[0]) {
      mapRef.current?.setView([recommendPins[0].lat, recommendPins[0].lng], 13, { animate: true })
    }
  }, [mapReady, recommendPins])

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
  { key: 'restaurants', label: '음식점',   Icon: Utensils,    color: '#F97316', char: '식' },
  { key: 'cafes',       label: '카페',     Icon: Coffee,      color: '#92400E', char: '카' },
  { key: 'academies',   label: '학원',     Icon: BookOpen,    color: '#8B5CF6', char: '원' },
  { key: 'retail',      label: '소매점',   Icon: ShoppingBag, color: '#EC4899', char: '소' },
  { key: 'beauty',      label: '이용·미용', Icon: Scissors,    color: '#F59E0B', char: '미' },
  { key: 'medical',     label: '보건의료', Icon: Stethoscope, color: '#10B981', char: '의' },
  { key: 'schools',     label: '학교',     Icon: School,      color: '#3B82F6', char: '학' },
  { key: 'stations',    label: '지하철역', Icon: Train,       color: '#1E3A5F', char: '역' },
]

const DEFAULT_RADII = {
  schools: 500, restaurants: 500, academies: 500, cafes: 500,
  retail: 500, beauty: 500, medical: 500, stations: 500,
}

const RANGE_PRESETS = [
  { label: '가까이',  meters: 300,  walk: '도보 5분'  },
  { label: '보통',    meters: 500,  walk: '도보 10분', recommended: true },
  { label: '넓게',    meters: 1000, walk: '도보 20분' },
]

const COMPETITION_THRESHOLDS = {
  restaurants: [30, 80],
  cafes:       [15, 40],
  academies:   [15, 40],
  retail:      [20, 60],
  beauty:      [10, 30],
  medical:     [5,  15],
}

function competitionLevel(key, count) {
  const [mid, high] = COMPETITION_THRESHOLDS[key] || [20, 60]
  if (count >= high) return { label: '경쟁 심함', emoji: '🔴', color: '#EF4444', bg: '#FEF2F2',
    tip: '경쟁이 치열해요. 차별화 전략이 꼭 필요해요.' }
  if (count >= mid)  return { label: '경쟁 보통', emoji: '🟡', color: '#F97316', bg: '#FFF7ED',
    tip: '어느 정도 경쟁이 있어요. 틈새를 잘 공략해보세요.' }
  return               { label: '경쟁 적음', emoji: '🟢', color: '#10B981', bg: '#F0FDF4',
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
    desc: '역·학교·아파트가 고루 갖춰진 핵심 상권' }
  if (score >= 4000) return { text: '활발',     color: '#3B82F6',
    desc: '점심·저녁에 사람이 모이는 상권' }
  return               { text: '안정적',   color: '#8B5CF6',
    desc: '단골 비중이 높은 주거 중심 상권' }
}

function fmtWon(won) {
  if (won >= 1_0000_0000) return `약 ${(won / 1_0000_0000).toFixed(1)}억원`
  return `약 ${Math.round(won / 10000).toLocaleString()}만원`
}

async function fetchCommercialSummary({ amenities, aptDong, cardSales, stationPassengersTotal, radii, ftScore, ftLevel, targetCategory = null }) {
  const lines = []

  lines.push(`유동인구 예측: 약 ${ftScore.toLocaleString()}명/일 (${ftLevel.text} — ${ftLevel.desc})`)

  /* 평균으로 떨어졌으면 마이다에게도 그렇다고 말한다. 안 그러면

     「이 자리 매출이 월 21억」으로 읽고 그 위에 해석을 쌓는다. */

  if (cardSales?.area_name === '화성시 평균') {

    lines.push(`카드매출: 이 자리의 행정동 집계가 없어 화성시 평균(월 약 ${Math.round(cardSales.total_sales / 1e8)}억원)입니다. 이 자리 매출이 아닙니다`)

  } else if (cardSales) {

    lines.push(

      `지역 카드매출: 월 약 ${Math.round(cardSales.total_sales / 1e8)}억원` +
      ` / 피크 ${TZ_LABELS[cardSales.peak_tz] || cardSales.peak_tz} (${cardSales.peak_pct.toFixed(1)}%)`
    )
  }

  if (aptDong?.total_units > 0) {
    lines.push(`주변 아파트: ${aptDong.dong} ${aptDong.complexes}개 단지 ${aptDong.total_units.toLocaleString()}세대`)
  } else {
    lines.push('주변 아파트: 해당 동 집계 없음')
  }

  if (amenities.stations > 0) {
    const passTxt = stationPassengersTotal > 0
      ? ` / 일 평균 ${stationPassengersTotal.toLocaleString()}명` : ''
    lines.push(`지하철역: ${amenities.stations}개역${passTxt}`)
  } else {
    lines.push('지하철역: 반경 내 없음')
  }

  if (amenities.schools > 0) {
    lines.push(`학교: ${amenities.schools}개 (하교 시간대 고객 유입 기대)`)
  }

  const bizCategories = [
    { key: 'restaurants', label: '음식점' },
    { key: 'cafes',       label: '카페' },
    { key: 'academies',   label: '학원' },
    { key: 'retail',      label: '소매점' },
    { key: 'beauty',      label: '이용·미용' },
    { key: 'medical',     label: '보건의료' },
  ]
  const bizLines = bizCategories
    .filter(({ key }) => amenities[key] > 0)
    .map(({ key, label }) => {
      const count  = amenities[key]
      const lvl    = competitionLevel(key, count)
      const perStore = cardSales ? Math.round(cardSales.total_sales / count / 10000) : null
      const salesTxt = perStore ? ` / 가게당 ${perStore.toLocaleString()}만원/월(위 매출을 가게 수로 나눈 값)` : ''
      return `${label}: ${count}개 (${lvl.label})${salesTxt}`
    })
  if (bizLines.length > 0) lines.push('업종별 경쟁 현황:\n' + bizLines.join('\n'))

  const prompt = lines.join('\n')

  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: targetCategory
        ? `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 응원하는 친근한 상권 분석 도우미예요.
지금 사용자는 「${targetCategory}」 창업을 준비 중이에요. 이 위치의 데이터를 보고 ${targetCategory} 창업에 얼마나 좋은 자리인지 분석해주세요.

반드시 아래 JSON 형식으로만 답하세요:
{"bullets":["문장1","문장2","문장3"],"advice":"핵심 조언","top_categories":["카페","소매업"]}

규칙:
• bullets 3-5개, 각 항목은 완성된 한 문장 (40-80자)
• "${targetCategory} 창업"을 중심으로 이 위치가 얼마나 적합한지 설명
• 유동인구·경쟁 현황·주변 인프라(역·학교·아파트)를 근거로 자연스럽게 녹여 쓸 것
• "~해요", "~있어요", "~것 같아요" 친근한 말투
• advice: ${targetCategory}로 이 위치에 창업할 때 핵심 포인트, 50자 이내
• top_categories: 이 위치 최적 업종 1-3개 ["카페","음식점","소매업","제조업","기타"]에서 선택`
        : `당신은 마이다(Mar-DA)입니다. 화성시 소상공인을 응원하는 친근한 상권 분석 도우미예요.
창업을 고민하는 사장님께 데이터를 보여주는 게 아니라, 그 숫자가 뜻하는 바를 사람 말로 풀어주세요.

반드시 아래 JSON 형식으로만 답하세요:
{"bullets":["문장1","문장2","문장3"],"advice":"핵심 조언","top_categories":["카페","소매업"]}

규칙:
• bullets 3-5개, 각 항목은 완성된 한 문장 (40-80자)
• 숫자는 문장 안에 자연스럽게 녹여 쓸 것 (나열 금지)
• "~해요", "~있어요", "~것 같아요" 같은 친근한 말투
• 경쟁·기회·위험·특징을 골고루 해석
• advice: 이 위치에서 가장 중요한 창업 포인트, 50자 이내 한 문장
• top_categories: 이 위치에 가장 적합한 업종 1-3개. ["카페","음식점","소매업","제조업","기타"] 중에서만 선택`,
      prompt,
      json: true,
    }),
  })
  const data = await res.json()
  try {
    const parsed = JSON.parse(data.text)
    return {
      bullets: parsed.bullets || [],
      advice: parsed.advice || '',
      top_categories: parsed.top_categories || [],
    }
  } catch {
    return { bullets: [data.text || '분석 결과를 가져오지 못했어요.'], advice: '', top_categories: [] }
  }
}

const CATEGORY_EMOJI = { 카페: '☕', 음식점: '🍜', 소매업: '🛍', 제조업: '🔧', 기타: '🎨' }

// ── 숫자 강조 ─────────────────────────────────────────────────────
function HighlightedText({ text }) {
  const parts = text.split(/(\d[\d,]*(?:\.\d+)?(?:개|만원|억원|%|명|곳|역|단지|세대|km|m)?)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^\d/.test(part)
          ? <strong key={i} className="text-navy font-extrabold">{part}</strong>
          : part
      )}
    </>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function CommercialAnalysisView({ profile }) {
  const navigate = useNavigate()
  const [position, setPosition]           = useState(HWS_CENTER)
  const [address, setAddress]             = useState('')
  const [searching, setSearching]         = useState(false)
  const [radii, setRadii]                 = useState(DEFAULT_RADII)
  const [activePreset, setActivePreset]   = useState(500)
  const [showDetailSliders, setShowDetailSliders] = useState(false)
  const [expanded, setExpanded]           = useState(false)
  const [apiData, setApiData]             = useState(null)
  const [llmSummary, setLlmSummary]       = useState(null)
  const [llmLoading, setLlmLoading]       = useState(false)
  const [llmAsked, setLlmAsked]           = useState(false)
  const [enabledFacilities, setEnabledFacilities] = useState(
    () => Object.fromEntries(AMENITY_CONFIG.map(c => [c.key, true]))
  )
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [candidateSaved, setCandidateSaved]     = useState(false)
  const [inputMode, setInputMode]               = useState('map') // 'map' | 'address' | 'category'
  const [recommendPins, setRecommendPins]       = useState([])    // [{lat, lng, count, rank}]
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [recommendCategory, setRecommendCategory] = useState(null) // 현재 추천 업종
  const debounceRef  = useRef(null)
  const addressInput = useRef(null)
  const autoAnalyzeTriggered = useRef(false)

  /* 펼친 지도는 화면을 통째로 덮는다(`fixed inset-0`, z-index 9999).
     나가는 길이 오른쪽 위 아이콘 하나뿐이라 못 찾고 갇히는 일이 있었다.
     Esc 로도 닫는다 — 창을 덮는 것에는 늘 있어야 하는 길이다. */
  useEffect(() => {
    if (!expanded) return
    const esc = e => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [expanded])

  const effectiveRadii = useMemo(() => (
    Object.fromEntries(AMENITY_CONFIG.map(({ key }) => [key, enabledFacilities[key] ? radii[key] : 0]))
  ), [radii, enabledFacilities])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/api/commercial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: position.lat, lng: position.lng, radii: effectiveRadii }),
      })
        .then(r => r.json())
        .then(setApiData)
        .catch(() => {})
    }, 300)
  }, [position.lat, position.lng, effectiveRadii])

  useEffect(() => {
    setLlmSummary(null)
    setLlmAsked(false)
    setCandidateSaved(false)
    setSelectedCategory(null)
  }, [position.lat, position.lng])

  // 주소 모드로 전환하면 입력란에 바로 포커스
  useEffect(() => {
    if (inputMode === 'address') addressInput.current?.focus()
  }, [inputMode])

  // 프로필에 업종이 있으면 업종 추천 모드로 자동 시작
  useEffect(() => {
    if (profile?.category) {
      setRecommendCategory(profile.category)
      setInputMode('category')
      setSelectedCategory(profile.category)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    autoAnalyzeTriggered.current = false
    setLlmAsked(false)
    setLlmSummary(null)
  }, [recommendCategory])

  useEffect(() => {
    if (!apiData || autoAnalyzeTriggered.current || inputMode !== 'category' || !recommendCategory) return
    autoAnalyzeTriggered.current = true
    handleAskMaidaRef.current()
  }, [apiData, inputMode, recommendCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  // 업종 모드: 업종 선택 시 /api/recommend 호출 → 지도에 핀 표시
  useEffect(() => {
    if (inputMode !== 'category' || !recommendCategory) return
    setRecommendLoading(true)
    setRecommendPins([])
    fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: [recommendCategory], top_n: 3 }),
    })
      .then(r => r.json())
      .then(data => {
        const locs = data.recommendations?.[0]?.locations ?? []
        setRecommendPins(locs.map((l, i) => ({ ...l, rank: i + 1 })))
        if (locs[0]) {
          // 1위 위치로 지도 중심 이동
          setPosition({ lat: locs[0].lat, lng: locs[0].lng })
        }
      })
      .catch(() => setRecommendPins([]))
      .finally(() => setRecommendLoading(false))
  }, [inputMode, recommendCategory])

  const { amenities, displayMarkers, stationPassengersTotal, aptDong, cardSales, isAvgSales } = useMemo(() => {
    const counts  = apiData?.counts  || {}
    const markers = apiData?.markers || {}
    const amenities = {
      schools: counts.schools ?? 0, restaurants: counts.restaurants ?? 0,
      academies: counts.academies ?? 0, cafes: counts.cafes ?? 0,
      retail: counts.retail ?? 0, beauty: counts.beauty ?? 0, medical: counts.medical ?? 0,
      stations: counts.stations ?? 0,
    }
    const rawPassengers = markers.stations
      ? markers.stations.reduce((s, st) => s + (st.passengers || 0), 0) : null
    const aptDong   = apiData?.apt_dong   ?? null
    const cardSales = apiData?.card_sales ?? null
      // 행정동을 못 찾아 화성시 평균으로 떨어진 경우. 화면에 그렇다고 적는다.
      const isAvgSales = cardSales?.area_name === '화성시 평균'
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
    ;['restaurants', 'cafes', 'academies', 'retail', 'beauty', 'medical'].forEach(key =>
      (markers[key] || []).forEach(s => displayMarkers.push({ lat: s.lat, lng: s.lng, key }))
    )
    return { amenities, displayMarkers, stationPassengersTotal: rawPassengers, aptDong, cardSales, isAvgSales }
  }, [apiData])

  const ftScore = useMemo(
    () => calcFootTrafficScore(amenities, stationPassengersTotal, aptDong),
    [amenities, stationPassengersTotal, aptDong]
  )
  const ftLevel  = footTrafficLevel(ftScore)

  const applyPreset = useCallback((meters) => {
    setActivePreset(meters)
    setRadii({
      schools: meters, restaurants: meters, academies: meters, cafes: meters,
      retail: meters, beauty: meters, medical: meters, stations: meters,
    })
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
    setActivePreset(null)
    setRadii(prev => ({ ...prev, [key]: Number(value) }))
  }, [])

  const toggleFacility = useCallback((key) => {
    setEnabledFacilities(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleAskMaida = useCallback(async () => {
    setLlmLoading(true)
    setLlmSummary(null)
    setLlmAsked(true)
    setCandidateSaved(false)
    try {
      const result = await fetchCommercialSummary({ amenities, aptDong, cardSales, stationPassengersTotal, radii, ftScore, ftLevel, targetCategory: recommendCategory || profile?.category || null })
      setLlmSummary(result)
      // LLM 이 추천한 업종 중 첫 번째로 미리 선택
      if (result.top_categories?.length > 0 && !selectedCategory) {
        setSelectedCategory(result.top_categories[0])
      }
    } catch {
      setLlmSummary({ bullets: ['마이다가 잠깐 연결이 끊겼어요. 다시 시도해주세요.'], advice: '', top_categories: [] })
    } finally {
      setLlmLoading(false)
    }
  }, [amenities, aptDong, cardSales, stationPassengersTotal, radii, ftScore, ftLevel, selectedCategory, recommendCategory, profile])

  const handleAskMaidaRef = useRef(handleAskMaida)
  useEffect(() => { handleAskMaidaRef.current = handleAskMaida }, [handleAskMaida])

  const handleSaveCandidate = useCallback(() => {
    // ftScore 를 0-100 창업 적합도로 변환 (4000=65, 8000=92)
    const score = Math.min(92, Math.max(40, Math.round(40 + (ftScore / 8000) * 52)))
    saveCandidate({
      category: selectedCategory ?? profile?.category ?? '기타',
      address:  address || null,
      region:   address || null,
      score,
    })
    setCandidateSaved(true)
    window.dispatchEvent(new Event('mars-journey-updated'))
  }, [selectedCategory, profile, ftScore, address])

  return (
    <div className="max-w-5xl mx-auto px-4 pb-10 space-y-4">

      {/* ── 지도 카드 ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4 flex flex-col gap-3">

        {/* 업종 기반 개인화 안내 */}
        {(profile?.category || recommendCategory) && (
          <div className="flex items-center gap-2">
            <span className="text-base">{CATEGORY_EMOJI[recommendCategory || profile?.category] ?? '🚀'}</span>
            <div>
              <p className="text-sm font-bold text-navy">
                {(recommendCategory || profile?.category)} 창업에 맞는 상권을 찾아드려요
              </p>
              <p className="text-xs text-warm-text">업종을 바꾸거나 직접 위치를 고를 수도 있어요</p>
            </div>
          </div>
        )}

        {/* 입력 방식 탭 */}
        <div className="flex bg-gray-50 border border-warm-gray/20 rounded-xl p-0.5">
          <button type="button" onClick={() => setInputMode('map')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all
              ${inputMode === 'map' ? 'bg-white text-navy shadow-sm' : 'text-warm-text hover:text-navy'}`}>
            <MapPin size={11} /> 지도
          </button>
          <button type="button" onClick={() => setInputMode('address')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all
              ${inputMode === 'address' ? 'bg-white text-navy shadow-sm' : 'text-warm-text hover:text-navy'}`}>
            <Search size={11} /> 주소
          </button>
          <button type="button" onClick={() => setInputMode('category')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all
              ${inputMode === 'category' ? 'bg-white text-sunset-orange shadow-sm' : 'text-warm-text hover:text-navy'}`}>
            <Sparkles size={11} /> 업종 추천
          </button>
        </div>

        {/* 업종 모드: 업종 선택 → 화성시 내 추천 위치 표시 */}
        {inputMode === 'category' && (
          <div className="space-y-2">
            <p className="text-xs text-warm-text">업종을 고르면 화성시 내 최적 상권을 지도에 표시해드려요</p>
            <div className="flex flex-wrap gap-2">
              {['카페', '음식점', '소매업', '제조업', '기타'].map(cat => (
                <button key={cat} type="button"
                  onClick={() => setRecommendCategory(cat)}
                  className={[
                    'px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                    recommendCategory === cat
                      ? 'bg-sunset-orange text-white border-sunset-orange'
                      : 'bg-white text-navy border-navy/25 hover:border-navy/50',
                  ].join(' ')}>
                  {CATEGORY_EMOJI[cat]} {cat}
                </button>
              ))}
            </div>
            {recommendLoading && (
              <div className="flex items-center gap-2 text-xs text-warm-text py-1">
                <span className="w-3 h-3 rounded-full border-2 border-navy/30 border-t-navy animate-spin" />
                화성시 최적 상권을 찾고 있어요...
              </div>
            )}
            {!recommendLoading && recommendPins.length > 0 && (
              <p className="text-xs font-semibold text-sunset-orange">
                ✓ 번호 핀을 누르면 그 위치로 이동해요 →
              </p>
            )}
          </div>
        )}

        {/* 주소 모드: 검색폼 위로 */}
        {inputMode === 'address' && (
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <input
              ref={addressInput}
              type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="예: 동탄역, 병점동, 봉담읍, 동탄2신도시..."
              className="flex-1 min-w-0 text-sm bg-gray-50 border border-navy/30 rounded-xl
                         px-3 py-3 text-navy placeholder:text-warm-gray/50
                         focus:outline-none focus:border-navy focus:bg-white transition-colors"
            />
            <button type="submit" disabled={searching}
              className="flex-shrink-0 bg-navy text-white rounded-xl px-4 py-3 text-xs font-semibold
                         disabled:opacity-50 flex items-center gap-1.5">
              <Search size={13} />검색
            </button>
          </form>
        )}

        {/* 범위 프리셋 */}
        <div className="flex gap-2">
          {RANGE_PRESETS.map(({ label, meters }) => {
            const active = activePreset === meters
            return (
              <button key={meters} onClick={() => applyPreset(meters)}
                className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl border-2 text-xs font-bold transition-all
                  ${active
                    ? 'border-navy bg-navy text-white'
                    : 'border-warm-gray/30 bg-gray-50 text-warm-text hover:border-navy/40 hover:bg-white'
                  }`}>
                <span className="font-extrabold">{label}</span>
                <span className={`font-normal ${active ? 'text-white/70' : 'text-navy/50'}`}>{meters}m</span>
              </button>
            )
          })}
        </div>

        {/* 지도 */}
        <div
          className="relative rounded-xl overflow-hidden border border-warm-gray/15 flex-1 transition-all duration-300"
          style={{ minHeight: inputMode === 'address' ? 180 : 260 }}
        >
          <LeafletMap
            position={position} onMove={handleMarkerMove} radii={effectiveRadii}
            markers={inputMode === 'category' ? [] : displayMarkers.filter(m => enabledFacilities[m.key])}
            sizeKey={`${showDetailSliders}-${inputMode}`}
            recommendPins={inputMode === 'category' ? recommendPins : []}
          />
          {inputMode === 'map' && (
            <button onClick={() => setExpanded(true)}
              aria-label="지도 크게 보기"
              className="tap absolute top-2 right-2 bg-white/90 backdrop-blur-sm border border-warm-gray/30
                         rounded-lg px-2 py-1.5 shadow hover:bg-white transition-colors
                         flex items-center gap-1 text-[11px] font-bold text-navy"
              style={{ zIndex: 1000 }}>
              <Maximize2 size={13} /> 크게 보기
            </button>
          )}
          {inputMode === 'address' && (
            <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none"
              style={{ zIndex: 1000 }}>
              <span className="bg-navy/80 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                핀을 드래그해서 위치를 미세 조정할 수 있어요
              </span>
            </div>
          )}
        </div>

        {/* 유동인구 한 줄 */}
        {apiData && (
          <div className="flex items-center gap-2 text-xs text-warm-text">
            <Users size={11} className="flex-shrink-0" style={{ color: ftLevel.color }} />
            <span>
              유동인구 예측{' '}
              <strong className="text-navy tabular-nums">
                {ftScore >= 10000
                  ? `${(ftScore / 10000).toFixed(1)}만`
                  : ftScore.toLocaleString()}명/일
              </strong>
              {' '}·{' '}
              <span className="font-semibold" style={{ color: ftLevel.color }}>{ftLevel.text}</span>
            </span>
          </div>
        )}

        {address && (
          <div className="flex items-center gap-1.5 text-sm text-warm-text">
            <MapPin size={11} className="text-navy flex-shrink-0" />
            <span>선택한 위치: <strong className="text-navy">{address}</strong></span>
          </div>
        )}

        {/* 지도 모드: 검색폼 아래로 */}
        {inputMode === 'map' && (
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <input
              type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="예: 동탄역, 병점동, 봉담읍..."
              className="flex-1 min-w-0 text-sm bg-gray-50 border border-warm-gray/30 rounded-xl
                         px-3 py-2 text-navy placeholder:text-warm-gray/50
                         focus:outline-none focus:border-navy focus:bg-white transition-colors"
            />
            <button type="submit" disabled={searching}
              className="flex-shrink-0 bg-navy text-white rounded-xl px-3 py-2 text-xs font-semibold
                         disabled:opacity-50 flex items-center gap-1">
              <Search size={13} />검색
            </button>
          </form>
        )}

        {/* 세부 슬라이더 */}
        <div>
          <button onClick={() => setShowDetailSliders(v => !v)}
            className="flex items-center gap-1 text-xs text-navy/50 hover:text-navy transition-colors">
            {showDetailSliders ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            시설 종류별로 따로 설정
          </button>
          {showDetailSliders && (
            <div className="mt-2 space-y-3">
              {AMENITY_CONFIG.map(({ key, label, Icon, color }) => {
                const enabled = enabledFacilities[key]
                return (
                  <div key={key} className={`transition-opacity ${enabled ? '' : 'opacity-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon size={9} style={{ color: enabled ? color : '#aaa' }} />
                        <span className="text-xs text-warm-text">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {enabled && (
                          <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                            {radii[key] >= 1000 ? `${radii[key] / 1000}km` : `${radii[key]}m`}
                          </span>
                        )}
                        <button
                          onClick={() => toggleFacility(key)}
                          className="relative flex-shrink-0 rounded-full transition-colors duration-200"
                          style={{ width: 32, height: 18, background: enabled ? color : '#d1d5db' }}
                          title={enabled ? '끄기' : '켜기'}
                        >
                          <span
                            className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-200"
                            style={{ top: 2, left: enabled ? 16 : 2 }}
                          />
                        </button>
                      </div>
                    </div>
                    {enabled && (
                      <input type="range" min={100} max={3000} step={50}
                        value={radii[key]} onChange={e => setRadius(key, e.target.value)}
                        className="w-full h-1.5 cursor-pointer" style={{ accentColor: color }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 시설 끄기/켜기 */}
        <div className="flex flex-wrap gap-1.5">
          {AMENITY_CONFIG.map(({ key, label, Icon, color }) => {
            const enabled = enabledFacilities[key]
            return (
              <button key={key} onClick={() => toggleFacility(key)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all
                  ${enabled
                    ? 'border-navy/20 text-navy bg-navy/5'
                    : 'border-warm-gray/30 text-warm-text/40 bg-white'}`}>
                <Icon size={9} style={{ color: enabled ? color : '#ccc' }} />
                {label}
                <span className="font-bold tabular-nums ml-0.5">{amenities[key]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 마이다에게 묻기 ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-warm-gray/20 shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <img src={findImg} alt="마이다" className="w-10 h-10 object-contain flex-shrink-0" />
          <div className="flex-1">
            <p className="text-base font-bold text-navy">마이다에게 묻기</p>
            <p className="text-sm text-warm-text">위치 데이터를 보고 마이다가 분석해드려요</p>
          </div>
        </div>

        <button onClick={handleAskMaida} disabled={llmLoading || !apiData}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
                     transition-all disabled:opacity-50 bg-navy text-white hover:bg-navy/90 active:scale-[0.99]">
          <Sparkles size={14} />
          {llmLoading ? '분석 중이에요...' : '이 위치 상권 물어보기'}
        </button>

        {llmAsked && (
          <div>
            {llmLoading ? (
              <div className="space-y-3 animate-pulse">
                {[0.9, 0.75, 0.85].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-warm-gray/30 flex-shrink-0" />
                    <div className="h-3 bg-warm-gray/20 rounded-full flex-1"
                      style={{ width: `${w * 100}%` }} />
                  </div>
                ))}
                <div className="mt-3 h-3 bg-navy/10 rounded-full w-4/5" />
              </div>
            ) : llmSummary && (
              <div className="space-y-3">
                {llmSummary.bullets?.map((b, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-navy text-white text-xs font-bold
                                     flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      <HighlightedText text={b} />
                    </p>
                  </div>
                ))}
                {llmSummary.advice && (
                  <div className="mt-4 pt-3 border-t border-warm-gray/20 flex items-start gap-2.5 bg-navy/4 rounded-xl p-3">
                    <span className="text-lg flex-shrink-0">💡</span>
                    <p className="text-sm font-bold text-navy leading-snug">
                      <HighlightedText text={llmSummary.advice} />
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!llmAsked && (
          <p className="text-center text-xs text-warm-text/50">
            위치를 고른 뒤 눌러보세요
          </p>
        )}
      </div>

      {/* ── 창업 후보로 저장 ─────────────────────────────────────── */}
      {apiData && (
        <div className="bg-gradient-to-br from-navy/[0.04] to-sunset-orange/[0.03]
                        border border-navy/15 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🚀</span>
            <div>
              <p className="text-sm font-bold text-navy">이 위치, 창업 후보로 저장할까요?</p>
              <p className="text-xs text-warm-text mt-0.5">
                {address ? `${address} · ` : ''}유동인구 {ftLevel.text} 상권
              </p>
            </div>
          </div>

          {/* 업종 선택 */}
          <p className="text-xs font-semibold text-navy/60 mb-2">
            {llmSummary?.top_categories?.length > 0
              ? '마이다 추천 업종 (탭해서 선택)'
              : '업종을 골라보세요'}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(llmSummary?.top_categories?.length > 0
              ? llmSummary.top_categories
              : ['카페', '음식점', '소매업', '기타']
            ).map(cat => (
              <button key={cat} type="button"
                onClick={() => setSelectedCategory(cat)}
                className={[
                  'px-3 py-1.5 rounded-full text-sm font-bold border transition-colors',
                  selectedCategory === cat
                    ? 'bg-navy text-white border-navy'
                    : 'text-navy border-navy/30 hover:bg-navy/5 bg-white',
                ].join(' ')}>
                {CATEGORY_EMOJI[cat] ?? ''} {cat}
              </button>
            ))}
          </div>

          <button type="button"
            onClick={candidateSaved ? undefined : handleSaveCandidate}
            disabled={candidateSaved}
            className={[
              'w-full py-3 rounded-xl text-sm font-bold transition-all',
              candidateSaved
                ? 'bg-emerald-500 text-white cursor-default'
                : 'bg-sunset-orange text-white hover:bg-sunset-orange/90 active:scale-[0.99]',
            ].join(' ')}>
            {candidateSaved
              ? '✓ 창업 후보로 저장됐어요!'
              : `${selectedCategory ? `${CATEGORY_EMOJI[selectedCategory] ?? ''} ${selectedCategory}` : '이 업종'} · 이 위치로 저장`}
          </button>

          {candidateSaved && (
            <button
              onClick={() => navigate('/guide')}
              className="mt-3 w-full py-3 rounded-xl text-sm font-bold
                         bg-navy text-white hover:bg-navy/90 transition-colors flex items-center justify-center gap-2">
              다음 단계: 창업 준비 안내 →
            </button>
          )}
        </div>
      )}

      {/* ── 확대 지도 모달 ───────────────────────────────────────── */}
      {expanded && (
        <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 9999 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-warm-gray/20 flex-shrink-0">
            <p className="text-sm font-bold text-navy">지도에서 위치 선택</p>
            {/* 여기가 이 화면에서 나가는 유일한 길이다. 28px 짜리 아이콘 하나로
                  두면 못 찾는다. 글자를 붙이고 테두리를 둘렀다. */}
            <button onClick={() => setExpanded(false)}
              aria-label="지도 닫기"
              className="tap flex items-center gap-1.5 rounded-xl border border-warm-gray/40
                         px-3 py-2 text-sm font-bold text-navy hover:bg-warm-gray/10 transition-colors">
                <XIcon size={16} /> 닫기
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LeafletMap position={position} onMove={handleMarkerMove} radii={radii} markers={displayMarkers} />
          </div>
          <div className="px-4 py-3 border-t border-warm-gray/20 flex-shrink-0 bg-white">
            <form onSubmit={handleSearch} className="flex gap-1.5">
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="예: 동탄역, 병점동, 봉담읍..."
                className="flex-1 min-w-0 text-sm bg-gray-50 border border-warm-gray/30 rounded-xl
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
