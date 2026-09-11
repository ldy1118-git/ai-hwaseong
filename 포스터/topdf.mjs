import { chromium } from 'playwright-core'
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
const b = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] })
const p = await b.newPage()
await p.goto('file://' + process.argv[2], { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
await p.pdf({
  path: process.argv[3],
  width: '900mm', height: '1200mm',
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  printBackground: true, preferCSSPageSize: true, scale: 1,
})
console.log('PDF 완료')
await b.close()
