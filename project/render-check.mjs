/**
 * 화면이 실제로 그려지는지 확인한다.  실행:  node render-check.mjs
 *
 * `npm run build` 는 이걸 못 잡는다. 빌드는 import 가 실재하는지만 보고,
 * JS 는 타입을 안 본다. 실제로 한 번 그려봐야 나오는 오류가 있다.
 * 실제로 이렇게 잡았다 — 내 매장 화면이 열리자마자 죽고 있었는데
 * 빌드는 통과하고 있었다 (holidaysKnown 이름 겹침).
 *
 * useEffect 는 서버 렌더에서 안 돈다. 그래서 여기서 보는 것은 "첫 화면이
 * 터지지 않는가" 까지다. fetch 결과에 따라 달라지는 부분은 못 본다.
 */
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'

function makeLS(seed = {}) {
  return { _d: { ...seed },
    getItem(k){ return this._d[k] ?? null },
    setItem(k,v){ this._d[k]=v }, removeItem(k){ delete this._d[k] } }
}
globalThis.fetch = async () => ({ ok:true, status:200, json: async () => ({ count:0, results:[] }) })
globalThis.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} })

const vite = await createServer({ server:{ middlewareMode:true }, appType:'custom', logLevel:'silent' })
const { MemoryRouter } = await vite.ssrLoadModule('react-router-dom')

const PROFILE = JSON.stringify({ category:'카페', region:'동탄2동', business_status:'운영중',
  business_period_months:12, entity_type:'개인', vat_type:'간이과세', has_employee:false, age:30 })

const CASES = [
  ['Landing  (로그아웃)', '/src/pages/Landing.jsx', '/',         {}],
  ['Landing  (로그인)',   '/src/pages/Landing.jsx', '/',         { 'mars-fit-token':'t', 'mars-fit-profile':PROFILE }],
  ['Auth',                '/src/pages/Auth.jsx',    '/auth',     {}],
  ['District',            '/src/pages/District.jsx','/district', { 'mars-fit-profile':PROFILE }],
  ['Home',                '/src/pages/Home.jsx',    '/home',     { 'mars-fit-profile':PROFILE }],
  ['ApplicationGuide',    '/src/pages/ApplicationGuide.jsx','/apply',{ 'mars-fit-profile':PROFILE }],
  ['Schedule',            '/src/pages/Schedule.jsx','/schedule', { 'mars-fit-profile':PROFILE }],
  ['NoticeDetail',        '/src/pages/NoticeDetail.jsx','/notice',{ 'mars-fit-profile':PROFILE }],
  ['MissionControl',      '/src/pages/MissionControl.jsx','/mission',{ 'mars-fit-profile':PROFILE }],
  ['Onboarding',          '/src/pages/Onboarding.jsx','/onboarding',{ 'mars-fit-profile':PROFILE }],
]

let bad = 0
for (const [name, mod, path, seed] of CASES) {
  globalThis.localStorage = makeLS(seed)
  try {
    const { default: C } = await vite.ssrLoadModule(mod)
    const html = renderToString(
      React.createElement(MemoryRouter, { initialEntries:[path] }, React.createElement(C)))
    const kakao = html.includes('FEE500') ? ' [카카오노랑]' : ''
    const start = html.includes('카카오톡으로 시작') ? ' [카카오CTA]' : ''
    console.log(`✅ ${name.padEnd(20)} ${String(html.length).padStart(6)}자${kakao}${start}`)
  } catch (e) {
    bad++
    console.log(`❌ ${name.padEnd(20)} ${e.constructor.name}: ${e.message}`)
  }
}
console.log(bad ? `\n터진 화면 ${bad}개` : '\n전부 렌더 성공')
await vite.close()
