#!/usr/bin/env node
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const PORT = Number(process.env.X32_MEASUREMENT_PORT || 8766)
const SCAN_INTERVAL_MS = Number(process.env.X32_MEASUREMENT_SCAN_MS || 2000)
const BAND_LABELS = ['80Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz']
const BAND_FREQUENCIES = [80, 125, 250, 500, 1000, 2000, 4000, 8000]
const LOCATION_IDS = new Set([
  'FRONT_LEFT', 'FRONT_CENTER', 'FRONT_RIGHT',
  'MIDDLE_LEFT', 'MIDDLE_CENTER', 'MIDDLE_RIGHT',
  'BACK_LEFT', 'BACK_CENTER', 'BACK_RIGHT',
])
const LOCATION_CODES = {
  FRONT_LEFT: 'FL', FRONT_CENTER: 'FC', FRONT_RIGHT: 'FR',
  MIDDLE_LEFT: 'ML', MIDDLE_CENTER: 'MC', MIDDLE_RIGHT: 'MR',
  BACK_LEFT: 'BL', BACK_CENTER: 'BC', BACK_RIGHT: 'BR',
}
const PHASES = new Set(['A', 'B'])
const home = os.homedir()
const primaryDirectory = path.join(home, 'Desktop', 'X32 Measurements')
const candidateDirectories = [
  process.env.X32_MEASUREMENTS_DIR,
  primaryDirectory,
  path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Desktop', 'X32 Measurements'),
  path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'X32 Measurements'),
].filter(Boolean).map((item) => path.resolve(item))
const directories = [...new Set(candidateDirectories)]

const store = {
  updatedAt: null,
  records: new Map(),
  files: new Map(),
  errors: [],
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round = (value, digits = 1) => Math.round(value * (10 ** digits)) / (10 ** digits)
const pad = (value, length = 2) => String(value).padStart(length, '0')
const safePart = (value) => String(value || '').normalize('NFKC').replace(/[^0-9A-Za-z가-힣_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'SESSION'
const median = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function localDateKey(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function localTimeKey(date) {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function measurementFilename(record) {
  const measured = new Date(record.measuredAt)
  const unique = String(record.measurementId).replace(/-/g, '').slice(0, 6).toUpperCase()
  return [
    'X32', localDateKey(measured), safePart(record.sessionId), `CH${pad(record.channel)}`, record.phase,
    LOCATION_CODES[record.locationId] || record.locationId, `R${pad(record.repetition)}`, localTimeKey(measured), unique,
  ].join('_') + '.json'
}

function ensurePrimaryDirectory() {
  try { fs.mkdirSync(primaryDirectory, { recursive: true }) } catch {}
}

function isRecord(value) {
  return Boolean(value)
    && typeof value === 'object'
    && value.schemaVersion === 1
    && typeof value.sessionId === 'string'
    && typeof value.measurementId === 'string'
    && typeof value.measuredAt === 'string'
    && LOCATION_IDS.has(value.locationId)
    && PHASES.has(value.phase)
    && Number.isInteger(Number(value.channel))
    && Number(value.channel) >= 1
    && Number(value.channel) <= 32
    && Array.isArray(value.averageBands)
    && value.averageBands.length === 8
    && value.averageBands.every((item) => Number.isFinite(Number(item)))
    && Array.isArray(value.targetCenter)
    && value.targetCenter.length === 8
}

function extractRecords(value) {
  if (isRecord(value)) return [value]
  if (Array.isArray(value)) return value.filter(isRecord)
  if (value && typeof value === 'object' && Array.isArray(value.records)) return value.records.filter(isRecord)
  return []
}

async function readJsonRequest(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 2_000_000) throw new Error('측정 업로드가 2MB를 초과했습니다.')
    chunks.push(chunk)
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
}

function readJsonFile(filePath) {
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size > 2_000_000) return []
  return extractRecords(JSON.parse(fs.readFileSync(filePath, 'utf8')))
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
}

function scan() {
  const nextRecords = new Map()
  const nextFiles = new Map()
  const errors = []
  for (const directory of directories) {
    let files = []
    try { files = listJsonFiles(directory) } catch (error) { errors.push(`${directory}: ${error.message}`); continue }
    for (const filePath of files) {
      try {
        const records = readJsonFile(filePath)
        nextFiles.set(filePath, records.map((record) => record.measurementId))
        records.forEach((record) => nextRecords.set(record.measurementId, { ...record, sourceFile: filePath }))
      } catch (error) {
        errors.push(`${path.basename(filePath)}: ${error.message}`)
      }
    }
  }
  store.records = nextRecords
  store.files = nextFiles
  store.errors = errors.slice(0, 20)
  store.updatedAt = Date.now()
}

function persistRecords(records) {
  ensurePrimaryDirectory()
  scan()
  const saved = []
  for (const record of records) {
    const existing = store.records.get(record.measurementId)
    if (existing) {
      saved.push({ measurementId: record.measurementId, filePath: existing.sourceFile, duplicate: true })
      continue
    }

    const filename = measurementFilename(record)
    let filePath = path.join(primaryDirectory, filename)
    if (fs.existsSync(filePath)) {
      const stem = filename.replace(/\.json$/i, '')
      filePath = path.join(primaryDirectory, `${stem}_${Date.now().toString(36)}.json`)
    }
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' })
    saved.push({ measurementId: record.measurementId, filePath, duplicate: false })
  }
  scan()
  return saved
}

function normalizedDeviation(record) {
  const measuredCenter = median(record.averageBands.map(Number))
  const targetCenter = median(record.targetCenter.map(Number))
  return record.averageBands.map((value, index) => (Number(value) - measuredCenter) - ((Number(record.targetCenter[index]) || targetCenter) - targetCenter))
}

function groupTrustedByLocation(records, phase) {
  const trusted = records.filter((record) => record.phase === phase && Number(record.confidence) >= 55 && Number(record.durationSeconds) >= 5 && Number(record.maxPeak) < 96)
  const grouped = new Map()
  for (const record of trusted) grouped.set(record.locationId, [...(grouped.get(record.locationId) || []), record])
  const locations = [...grouped.entries()].map(([locationId, items]) => {
    const vectors = items.map(normalizedDeviation)
    const vector = BAND_FREQUENCIES.map((_, index) => median(vectors.map((values) => values[index])))
    return {
      locationId,
      locationLabel: items[0]?.locationLabel || locationId,
      recordCount: items.length,
      confidence: Math.round(items.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / items.length),
      vector,
    }
  })
  return { trusted, locations }
}

function commonBands(locations) {
  if (!locations.length) return []
  const required = Math.max(2, Math.ceil(locations.length * 0.6))
  return BAND_FREQUENCIES.map((frequency, index) => {
    const values = locations.map((location) => location.vector[index])
    const deviation = median(values)
    const positive = values.filter((value) => value >= 6).length
    const negative = values.filter((value) => value <= -6).length
    const support = Math.max(positive, negative)
    return {
      index,
      label: BAND_LABELS[index],
      frequency,
      deviation: round(deviation),
      support,
      direction: deviation >= 0 ? '과다' : '부족',
    }
  }).filter((band) => Math.abs(band.deviation) >= 6 && band.support >= required)
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
}

function closestEqBand(snapshot, frequency) {
  if (!snapshot?.eqBands?.length) return null
  return [...snapshot.eqBands].sort((a, b) => Math.abs(Math.log2(frequency / Math.max(20, a.frequency))) - Math.abs(Math.log2(frequency / Math.max(20, b.frequency))))[0]
}

async function getX32State() {
  try {
    const response = await fetch('http://localhost:8765/api/status', { signal: AbortSignal.timeout(800) })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

function phaseScore(location) {
  return median(location.vector.map((value) => Math.abs(value)))
}

function compareAB(aLocations, bLocations) {
  const bMap = new Map(bLocations.map((location) => [location.locationId, location]))
  const pairs = aLocations.map((a) => ({ a, b: bMap.get(a.locationId) })).filter((pair) => pair.b)
  if (!pairs.length) return null
  const details = pairs.map(({ a, b }) => {
    const before = phaseScore(a)
    const after = phaseScore(b)
    return { locationId: a.locationId, locationLabel: a.locationLabel, before: round(before), after: round(after), change: round(before - after) }
  })
  const averageChange = round(details.reduce((sum, item) => sum + item.change, 0) / details.length)
  const improved = details.filter((item) => item.change >= 1).length
  const worsened = details.filter((item) => item.change <= -1).length
  let summary = `A/B 공통 위치 ${details.length}곳 중 개선 ${improved}곳, 악화 ${worsened}곳입니다.`
  if (worsened >= Math.max(2, Math.ceil(details.length * 0.3))) summary += ' 여러 위치가 악화되어 전체 적용 확정을 보류하세요.'
  else if (averageChange > 1.5) summary += ' 전체 상대 편차가 줄어든 후보입니다.'
  else summary += ' 변화가 작으므로 유지·원복을 청취와 함께 판단하세요.'
  return { matchedLocations: details.length, averageChange, improved, worsened, details, summary }
}

async function analyzeSession(records, sessionId) {
  const session = records.filter((record) => record.sessionId === sessionId)
  if (!session.length) return null
  const phase = session.some((record) => record.phase === 'B') ? 'B' : 'A'
  const selected = groupTrustedByLocation(session, phase)
  const a = groupTrustedByLocation(session, 'A')
  const b = groupTrustedByLocation(session, 'B')
  const common = commonBands(selected.locations)
  const confidence = selected.trusted.length ? Math.round(selected.trusted.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / selected.trusted.length) : 0
  const latest = [...session].sort((left, right) => right.measuredAt.localeCompare(left.measuredAt))[0]
  const x32 = await getX32State()
  const snapshot = x32?.selectedSnapshot
  const matchedChannel = Boolean(snapshot && Number(snapshot.channel) === Number(latest.channel))
  const analysis = {
    sessionId,
    phase,
    locationCount: selected.locations.length,
    recordCount: selected.trusted.length,
    confidence,
    commonBands: common,
    locations: selected.locations,
    abComparison: compareAB(a.locations, b.locations),
    x32: {
      connected: Boolean(x32?.connection?.connected),
      channel: Number(snapshot?.channel || 0),
      name: String(snapshot?.name || ''),
      matchedChannel,
    },
    recommendation: null,
  }

  const blocked = []
  if (selected.locations.length < 3) blocked.push('신뢰 가능한 서로 다른 위치가 3곳 미만입니다.')
  if (selected.trusted.some((record) => Number(record.maxPeak) >= 92)) blocked.push('일부 측정에서 Peak가 높아 Gain 구조 확인이 먼저입니다.')
  if (!x32?.connection?.connected) blocked.push('X32가 연결되지 않아 현재 EQ 값과 결합할 수 없습니다.')
  if (x32?.connection?.connected && !matchedChannel) blocked.push(`측정 채널 CH${String(latest.channel).padStart(2, '0')}과 Mac의 선택 채널 CH${String(snapshot?.channel || 0).padStart(2, '0')}이 다릅니다.`)
  if (!common.length && selected.locations.length >= 3) {
    analysis.recommendation = {
      title: '채널 EQ 전체 변경 보류',
      reason: '여러 위치에서 반복되는 큰 공통 편차가 없습니다. 특정 좌석·스피커 방향·공간 문제를 먼저 확인하세요.',
      confidence,
      applyOrder: ['위치별 결과 확인', 'Main/System·스피커 방향 확인', '현재 EQ 유지', '필요 시 동일 조건 재측정'],
    }
    return analysis
  }

  const top = common[0]
  const eqBand = top ? closestEqBand(snapshot, top.frequency) : null
  if (!eqBand && x32?.connection?.connected) blocked.push('선택 채널의 EQ 밴드 정보를 아직 받지 못했습니다.')
  if (eqBand && Math.abs(Number(eqBand.gain)) >= 6 && ((top.direction === '과다' && Number(eqBand.gain) < 0) || (top.direction === '부족' && Number(eqBand.gain) > 0))) blocked.push('현재 EQ가 이미 같은 방향으로 6dB 이상 조정되어 추가 변경을 제한합니다.')

  const delta = top?.direction === '과다' ? -0.5 : 0.5
  const currentGain = Number(eqBand?.gain || 0)
  analysis.recommendation = {
    title: top ? `${top.label} 공통 ${top.direction} · 1차 시험 후보` : '분석 대기',
    reason: top ? `${selected.locations.length}개 위치 중 ${top.support}개에서 같은 방향의 편차가 반복됐습니다. 한 밴드만 0.5dB 변경하고 동일 위치 B 측정으로 검증하세요.` : '공통 편차를 계산 중입니다.',
    blockedReason: blocked.length ? blocked.join(' ') : undefined,
    frequency: top?.frequency,
    bandLabel: eqBand?.name || top?.label,
    currentGain: round(currentGain),
    suggestedGain: round(clamp(currentGain + delta, -12, 12)),
    delta,
    q: Number(eqBand?.q || 1),
    confidence: Math.min(confidence, Math.round((top?.support || 0) / Math.max(1, selected.locations.length) * 100)),
    applyOrder: [
      `${eqBand?.name || top?.label} ${top?.frequency || ''}Hz만 ${delta > 0 ? '+' : ''}${delta}dB 시험`,
      '다른 EQ 밴드는 변경하지 않음',
      '동일 9개 위치에서 B 단계 측정',
      '악화 위치가 30% 이상이면 원상복구',
    ],
  }
  return analysis
}

function latestSessionId(records) {
  return [...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.sessionId || ''
}

async function responseBody() {
  const records = [...store.records.values()].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const latest = latestSessionId(records)
  return {
    available: true,
    updatedAt: store.updatedAt,
    directories: directories.filter((directory) => fs.existsSync(directory)),
    configuredDirectories: directories,
    files: store.files.size,
    records,
    latestSessionId: latest,
    analysis: latest ? await analyzeSession(records, latest) : null,
    errors: store.errors,
  }
}

function cors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-X32-Measurement')
  response.setHeader('Cache-Control', 'no-store')
}

function json(response, status, body) {
  cors(response)
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { cors(response); response.writeHead(204); response.end(); return }
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  try {
    if (url.pathname === '/api/health' && request.method === 'GET') return json(response, 200, { ok: true, port: PORT, updatedAt: store.updatedAt })
    if (url.pathname === '/api/measurements' && request.method === 'GET') return json(response, 200, await responseBody())
    if (url.pathname === '/api/import' && request.method === 'POST') {
      if (request.headers['x-x32-measurement'] !== '1') return json(response, 403, { error: '측정 업로드 헤더가 없습니다.' })
      const records = extractRecords(await readJsonRequest(request))
      if (!records.length) return json(response, 400, { error: '올바른 X32 위치 측정 기록이 없습니다.' })
      const saved = persistRecords(records)
      return json(response, 201, { ok: true, saved, archive: await responseBody() })
    }
    if (url.pathname === '/api/rescan' && request.method === 'POST') { scan(); return json(response, 200, await responseBody()) }
    return json(response, 404, { error: 'API를 찾을 수 없습니다.' })
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

function selfTest() {
  const record = {
    schemaVersion: 1,
    sessionId: '20260810-S01-CH01',
    sessionLabel: 'test',
    measurementId: 'test-1',
    measuredAt: '2026-08-10T00:00:00.000Z',
    deviceId: 'device',
    deviceLabel: 'test',
    channel: 1,
    sourceType: 'preacher',
    profileId: 'test',
    profileLabel: 'test',
    targetCenter: [22, 34, 43, 49, 54, 61, 59, 45],
    phase: 'A',
    locationId: 'MIDDLE_CENTER',
    locationLabel: '회중석 가운데 중앙',
    repetition: 1,
    durationSeconds: 30,
    averageRms: 18,
    maxPeak: 65,
    averageBands: [20, 31, 55, 48, 52, 60, 58, 44],
    confidence: 88,
    notes: '',
  }
  if (!isRecord(record)) throw new Error('record validation failed')
  if (!measurementFilename(record).startsWith('X32_')) throw new Error('measurement filename failed')
  if (normalizedDeviation(record).length !== 8) throw new Error('normalization failed')
  if (!commonBands(groupTrustedByLocation([record, { ...record, measurementId: 'test-2', locationId: 'FRONT_CENTER' }, { ...record, measurementId: 'test-3', locationId: 'BACK_CENTER' }], 'A').locations).length) throw new Error('common band analysis failed')
  console.log('X32 Measurement Archive self-test: OK')
}

if (process.env.X32_MEASUREMENT_SELF_TEST === '1') selfTest()
else {
  ensurePrimaryDirectory()
  scan()
  setInterval(scan, SCAN_INTERVAL_MS).unref()
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`X32 Measurement Archive가 시작됐습니다: http://localhost:${PORT}/api/measurements`)
    console.log('iPhone 자동 저장 주소:')
    for (const values of Object.values(os.networkInterfaces())) {
      for (const item of values || []) if (item.family === 'IPv4' && !item.internal) console.log(`  http://${item.address}:${PORT}/api/import`)
    }
    console.log('감시 폴더:')
    directories.forEach((directory) => console.log(`  ${directory}`))
  })
}
