import type { AnalysisResult, SourceMode } from './types'
import type { EqProfile } from './sourceProfiles'

export type MeasurementPhase = 'A' | 'B'
export type LocationId =
  | 'FRONT_LEFT' | 'FRONT_CENTER' | 'FRONT_RIGHT'
  | 'MIDDLE_LEFT' | 'MIDDLE_CENTER' | 'MIDDLE_RIGHT'
  | 'BACK_LEFT' | 'BACK_CENTER' | 'BACK_RIGHT'

export type LocationDefinition = {
  id: LocationId
  code: string
  row: 'FRONT' | 'MIDDLE' | 'BACK'
  rowLabel: string
  column: 'LEFT' | 'CENTER' | 'RIGHT'
  columnLabel: string
  label: string
}

export type LocationMeasurementRecord = {
  schemaVersion: 1
  sessionId: string
  sessionLabel: string
  measurementId: string
  measuredAt: string
  deviceId: string
  deviceLabel: string
  channel: number
  sourceType: SourceMode
  profileId: string
  profileLabel: string
  targetCenter: number[]
  phase: MeasurementPhase
  locationId: LocationId
  locationLabel: string
  repetition: number
  durationSeconds: number
  averageRms: number
  maxPeak: number
  averageBands: number[]
  confidence: number
  notes: string
}

export type MeasurementBundle = {
  schemaVersion: 1
  kind: 'x32-location-measurement-bundle'
  exportedAt: string
  sessionId: string
  records: LocationMeasurementRecord[]
}

export const LOCATIONS: LocationDefinition[] = [
  { id: 'FRONT_LEFT', code: 'FL', row: 'FRONT', rowLabel: '회중석 앞', column: 'LEFT', columnLabel: '왼쪽', label: '회중석 앞 왼쪽' },
  { id: 'FRONT_CENTER', code: 'FC', row: 'FRONT', rowLabel: '회중석 앞', column: 'CENTER', columnLabel: '중앙', label: '회중석 앞 중앙' },
  { id: 'FRONT_RIGHT', code: 'FR', row: 'FRONT', rowLabel: '회중석 앞', column: 'RIGHT', columnLabel: '오른쪽', label: '회중석 앞 오른쪽' },
  { id: 'MIDDLE_LEFT', code: 'ML', row: 'MIDDLE', rowLabel: '회중석 가운데', column: 'LEFT', columnLabel: '왼쪽', label: '회중석 가운데 왼쪽' },
  { id: 'MIDDLE_CENTER', code: 'MC', row: 'MIDDLE', rowLabel: '회중석 가운데', column: 'CENTER', columnLabel: '중앙', label: '회중석 가운데 중앙' },
  { id: 'MIDDLE_RIGHT', code: 'MR', row: 'MIDDLE', rowLabel: '회중석 가운데', column: 'RIGHT', columnLabel: '오른쪽', label: '회중석 가운데 오른쪽' },
  { id: 'BACK_LEFT', code: 'BL', row: 'BACK', rowLabel: '회중석 뒤', column: 'LEFT', columnLabel: '왼쪽', label: '회중석 뒤 왼쪽' },
  { id: 'BACK_CENTER', code: 'BC', row: 'BACK', rowLabel: '회중석 뒤', column: 'CENTER', columnLabel: '중앙', label: '회중석 뒤 중앙' },
  { id: 'BACK_RIGHT', code: 'BR', row: 'BACK', rowLabel: '회중석 뒤', column: 'RIGHT', columnLabel: '오른쪽', label: '회중석 뒤 오른쪽' },
]

export const LOCATION_ROWS = ['FRONT', 'MIDDLE', 'BACK'] as const
export const BAND_LABELS = ['80Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz']
export const BAND_FREQUENCIES = [80, 125, 250, 500, 1000, 2000, 4000, 8000]
export const STORAGE_KEY = 'x32-location-measurements-v1'
export const DEVICE_ID_KEY = 'x32-measurement-device-id-v1'
export const PENDING_SYNC_KEY = 'x32-location-measurement-pending-sync-v1'

const pad = (value: number, length = 2) => String(value).padStart(length, '0')
const safePart = (value: string) => value.normalize('NFKC').replace(/[^0-9A-Za-z가-힣_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'SESSION'

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

export function localTimeKey(date = new Date()) {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const next = createId()
  localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

export function deviceLabel() {
  const agent = navigator.userAgent
  if (/iPhone/i.test(agent)) return 'iPhone'
  if (/iPad/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Macintosh|Mac OS X/i.test(agent)) return 'Mac'
  if (/Android/i.test(agent)) return 'Android'
  return 'Web'
}

export function loadRecords(): LocationMeasurementRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isMeasurementRecord) : []
  } catch {
    return []
  }
}

export function saveRecords(records: LocationMeasurementRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-500)))
}

export function isMeasurementRecord(value: unknown): value is LocationMeasurementRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<LocationMeasurementRecord>
  return item.schemaVersion === 1
    && typeof item.sessionId === 'string'
    && typeof item.measurementId === 'string'
    && typeof item.measuredAt === 'string'
    && typeof item.locationId === 'string'
    && LOCATIONS.some((location) => location.id === item.locationId)
    && (item.phase === 'A' || item.phase === 'B')
    && Array.isArray(item.averageBands)
    && item.averageBands.length === 8
    && item.averageBands.every((band) => Number.isFinite(Number(band)))
}

export function parseMeasurementFile(value: unknown): LocationMeasurementRecord[] {
  if (isMeasurementRecord(value)) return [value]
  if (Array.isArray(value)) return value.filter(isMeasurementRecord)
  if (value && typeof value === 'object') {
    const records = (value as Partial<MeasurementBundle>).records
    if (Array.isArray(records)) return records.filter(isMeasurementRecord)
  }
  return []
}

export function loadPendingRecords(): LocationMeasurementRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isMeasurementRecord) : []
  } catch {
    return []
  }
}

function savePendingRecords(records: LocationMeasurementRecord[]) {
  localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(records.slice(-500)))
}

export function queueRecordForMac(record: LocationMeasurementRecord) {
  const pending = loadPendingRecords()
  const map = new Map(pending.map((item) => [item.measurementId, item]))
  map.set(record.measurementId, record)
  savePendingRecords([...map.values()])
}

export function removePendingRecord(measurementId: string) {
  savePendingRecords(loadPendingRecords().filter((record) => record.measurementId !== measurementId))
}

function archiveImportUrls() {
  if (typeof window === 'undefined') return []
  const urls: string[] = []
  if (window.location.protocol === 'http:') {
    urls.push(`http://${window.location.hostname}:8766/api/import`)
    if (window.location.hostname === 'localhost') urls.push('http://127.0.0.1:8766/api/import')
    if (window.location.hostname === '127.0.0.1') urls.push('http://localhost:8766/api/import')
  }
  return [...new Set(urls)]
}

export async function syncRecordToMac(record: LocationMeasurementRecord) {
  for (const url of archiveImportUrls()) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-X32-Measurement': '1' },
        body: JSON.stringify(record),
        signal: AbortSignal.timeout(1800),
      })
      if (response.ok) return true
    } catch {
      // The record remains in the local pending queue and is retried later.
    }
  }
  return false
}

export async function flushPendingRecords() {
  const pending = loadPendingRecords()
  const remaining: LocationMeasurementRecord[] = []
  let synced = 0
  for (const record of pending) {
    if (await syncRecordToMac(record)) synced += 1
    else remaining.push(record)
  }
  savePendingRecords(remaining)
  return { synced, pending: remaining.length }
}

export function nextSessionId(records: LocationMeasurementRecord[], channel: number, date = new Date()) {
  const dateKey = localDateKey(date)
  const pattern = new RegExp(`^${dateKey}-S(\\d{2})-CH\\d{2}$`)
  const max = records.reduce((current, record) => {
    const match = record.sessionId.match(pattern)
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `${dateKey}-S${pad(max + 1)}-CH${pad(channel)}`
}

export function repetitionFor(records: LocationMeasurementRecord[], sessionId: string, phase: MeasurementPhase, locationId: LocationId) {
  return records.filter((record) => record.sessionId === sessionId && record.phase === phase && record.locationId === locationId).length + 1
}

export function measurementFilename(record: LocationMeasurementRecord) {
  const location = LOCATIONS.find((item) => item.id === record.locationId)
  const measured = new Date(record.measuredAt)
  const unique = record.measurementId.replace(/-/g, '').slice(0, 6).toUpperCase()
  return [
    'X32', localDateKey(measured), safePart(record.sessionId), `CH${pad(record.channel)}`, record.phase,
    location?.code || record.locationId, `R${pad(record.repetition)}`, localTimeKey(measured), unique,
  ].join('_') + '.json'
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

export function recordFromResult(args: {
  result: AnalysisResult
  profile: EqProfile
  sessionId: string
  sessionLabel: string
  channel: number
  phase: MeasurementPhase
  locationId: LocationId
  repetition: number
  notes: string
}): LocationMeasurementRecord {
  const location = LOCATIONS.find((item) => item.id === args.locationId) ?? LOCATIONS[4]
  return {
    schemaVersion: 1,
    sessionId: args.sessionId,
    sessionLabel: args.sessionLabel,
    measurementId: createId(),
    measuredAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    deviceLabel: deviceLabel(),
    channel: Math.min(32, Math.max(1, Math.round(args.channel))),
    sourceType: args.profile.mode,
    profileId: args.profile.id,
    profileLabel: args.profile.label,
    targetCenter: [...args.profile.targetCenter],
    phase: args.phase,
    locationId: location.id,
    locationLabel: location.label,
    repetition: args.repetition,
    durationSeconds: args.result.duration,
    averageRms: args.result.averageRms,
    maxPeak: args.result.maxPeak,
    averageBands: [...args.result.averageBands],
    confidence: args.result.score,
    notes: args.notes.trim(),
  }
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function normalizedDeviation(record: LocationMeasurementRecord) {
  const measuredCenter = median(record.averageBands)
  const targetCenter = median(record.targetCenter)
  return record.averageBands.map((value, index) => (value - measuredCenter) - ((record.targetCenter[index] ?? targetCenter) - targetCenter))
}

export type LocalSessionAnalysis = {
  locationCount: number
  trustedCount: number
  confidence: number
  commonBands: Array<{ index: number; label: string; frequency: number; deviation: number; support: number; direction: '과다' | '부족' }>
  recommendation: string
}

export function analyzeLocalSession(records: LocationMeasurementRecord[], sessionId: string, phase: MeasurementPhase): LocalSessionAnalysis {
  const session = records.filter((record) => record.sessionId === sessionId && record.phase === phase)
  const trusted = session.filter((record) => record.confidence >= 55 && record.durationSeconds >= 5 && record.maxPeak < 96)
  const byLocation = new Map<LocationId, LocationMeasurementRecord[]>()
  trusted.forEach((record) => byLocation.set(record.locationId, [...(byLocation.get(record.locationId) || []), record]))
  const locationVectors = [...byLocation.values()].map((items) => {
    const vectors = items.map(normalizedDeviation)
    return BAND_FREQUENCIES.map((_, index) => median(vectors.map((vector) => vector[index])))
  })
  const requiredSupport = Math.max(2, Math.ceil(locationVectors.length * 0.6))
  const commonBands = BAND_FREQUENCIES.map((frequency, index) => {
    const values = locationVectors.map((vector) => vector[index])
    const deviation = median(values)
    const positive = values.filter((value) => value >= 6).length
    const negative = values.filter((value) => value <= -6).length
    const support = Math.max(positive, negative)
    return {
      index,
      label: BAND_LABELS[index],
      frequency,
      deviation: Math.round(deviation * 10) / 10,
      support,
      direction: deviation >= 0 ? '과다' as const : '부족' as const,
    }
  }).filter((item) => Math.abs(item.deviation) >= 6 && item.support >= requiredSupport)
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))

  let recommendation = '신뢰 가능한 위치가 3곳 이상 모이면 공통 편차를 기준으로 0.5dB 단위의 시험 후보를 제안합니다.'
  if (locationVectors.length >= 3 && commonBands[0]) {
    const top = commonBands[0]
    recommendation = `${top.label}가 ${locationVectors.length}개 위치 중 ${top.support}개에서 공통 ${top.direction} 후보입니다. X32 실제값과 대조한 뒤 ${top.direction === '과다' ? '-0.5dB 감쇠' : '+0.5dB 보강'}부터 한 밴드만 시험하세요.`
  } else if (locationVectors.length >= 3) {
    recommendation = '여러 위치에서 반복되는 큰 공통 편차가 없습니다. 특정 좌석 문제인지 확인하고 채널 EQ 전체 변경은 보류하세요.'
  }

  return {
    locationCount: byLocation.size,
    trustedCount: trusted.length,
    confidence: trusted.length ? Math.round(trusted.reduce((sum, record) => sum + record.confidence, 0) / trusted.length) : 0,
    commonBands,
    recommendation,
  }
}
