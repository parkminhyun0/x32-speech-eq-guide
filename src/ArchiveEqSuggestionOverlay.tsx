import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EqBand, EqFilterType } from './types'
import './archive-eq-suggestion-overlay.css'

type X32Snapshot = {
  channel: number
  name: string
  lowCutEnabled: boolean
  lowCutFrequency: number
  eqBands: EqBand[]
}

type BridgeState = {
  connection?: { connected?: boolean }
  selectedSnapshot?: X32Snapshot
}

type ArchiveRecommendation = {
  title?: string
  reason?: string
  blockedReason?: string
  frequency?: number
  bandLabel?: string
  currentGain?: number
  suggestedGain?: number
  delta?: number
  q?: number
  confidence?: number
}

type ArchiveCommonBand = {
  label: string
  frequency: number
  support: number
  direction: string
}

type ArchiveAnalysis = {
  sessionId: string
  phase: 'A' | 'B'
  locationCount: number
  confidence: number
  commonBands?: ArchiveCommonBand[]
  x32?: {
    connected?: boolean
    channel?: number
    name?: string
    matchedChannel?: boolean
  }
  recommendation?: ArchiveRecommendation | null
}

type ArchiveResponse = {
  latestSessionId?: string
  analysis?: ArchiveAnalysis | null
}

type OverlayState = {
  sessionId: string
  phase: 'A' | 'B'
  channel: number
  channelName: string
  locationCount: number
  confidence: number
  currentBands: EqBand[]
  candidateBands: EqBand[]
  lowCutEnabled: boolean
  lowCutFrequency: number
  bandIndex: number
  bandLabel: string
  frequency: number
  q: number
  currentGain: number
  suggestedGain: number | null
  delta: number | null
  title: string
  reason: string
  blockedReason?: string
  commonBand?: ArchiveCommonBand
}

const GRAPH_FREQUENCIES = [20, 31.5, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500, 20000]
const FILTER_MODES: EqFilterType[] = ['LowCut', 'LowShelf', 'PEQ', 'VEQ', 'HighShelf', 'HighCut']

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const xForFrequency = (frequency: number) => {
  const min = Math.log10(20)
  const max = Math.log10(20000)
  return ((Math.log10(clamp(frequency, 20, 20000)) - min) / (max - min)) * 760 + 20
}
const yForGain = (gain: number) => 150 - clamp(gain, -15, 15) * 8.2

function filterContribution(frequency: number, band: EqBand) {
  const center = clamp(Number(band.frequency) || 1000, 20, 20000)
  const gain = clamp(Number(band.gain) || 0, -15, 15)
  const q = clamp(Number(band.q) || 1, 0.3, 10)
  const octaves = Math.log2(frequency / center)
  const mode = FILTER_MODES.includes(band.filterType as EqFilterType) ? band.filterType : 'PEQ'

  if (mode === 'LowShelf') return gain / (1 + Math.exp(octaves * 7))
  if (mode === 'HighShelf') return gain / (1 + Math.exp(-octaves * 7))
  if (mode === 'LowCut') return frequency < center ? -Math.min(30, Math.log2(center / frequency) * 18) : 0
  if (mode === 'HighCut') return frequency > center ? -Math.min(30, Math.log2(frequency / center) * 18) : 0

  const width = Math.max(0.12, (mode === 'VEQ' ? 1.35 : 1) / q)
  return gain * Math.exp(-0.5 * (octaves / width) ** 2)
}

function responseAt(frequency: number, bands: EqBand[], lowCutEnabled: boolean, lowCutFrequency: number) {
  let gain = bands.reduce((sum, band) => sum + filterContribution(frequency, band), 0)
  if (lowCutEnabled && frequency < lowCutFrequency) {
    gain -= Math.min(30, Math.log2(lowCutFrequency / frequency) * 18)
  }
  return clamp(gain, -15, 15)
}

function curvePoints(bands: EqBand[], lowCutEnabled: boolean, lowCutFrequency: number) {
  return GRAPH_FREQUENCIES.map((frequency) => `${xForFrequency(frequency)},${yForGain(responseAt(frequency, bands, lowCutEnabled, lowCutFrequency))}`).join(' ')
}

async function fetchFirstJson<T>(urls: string[]): Promise<T | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const type = response.headers.get('content-type') || ''
      if (response.ok && type.includes('application/json')) return await response.json() as T
    } catch {
      // Local services may be unavailable on the public PWA. Continue silently.
    }
  }
  return null
}

function closestBandIndex(bands: EqBand[], label?: string, frequency?: number) {
  const exact = bands.findIndex((band) => band.name === label)
  if (exact >= 0) return exact
  if (!Number.isFinite(frequency)) return -1
  return bands.reduce((best, band, index) => {
    if (best < 0) return index
    const currentDistance = Math.abs(Math.log2(Math.max(20, Number(frequency)) / Math.max(20, Number(band.frequency))))
    const bestDistance = Math.abs(Math.log2(Math.max(20, Number(frequency)) / Math.max(20, Number(bands[best].frequency))))
    return currentDistance < bestDistance ? index : best
  }, -1)
}

function buildOverlay(bridge: BridgeState | null, archive: ArchiveResponse | null): OverlayState | null {
  const snapshot = bridge?.selectedSnapshot
  const analysis = archive?.analysis
  const recommendation = analysis?.recommendation
  if (!bridge?.connection?.connected || !snapshot?.eqBands?.length || !analysis || !recommendation) return null

  const currentBands = snapshot.eqBands.map((band) => ({ ...band }))
  const bandIndex = closestBandIndex(currentBands, recommendation.bandLabel, recommendation.frequency)
  const currentBand = currentBands[bandIndex] ?? currentBands[0]
  const candidateBands = currentBands.map((band) => ({ ...band }))
  const suggestedGain = Number.isFinite(recommendation.suggestedGain) ? Number(recommendation.suggestedGain) : null
  if (bandIndex >= 0 && suggestedGain !== null && !recommendation.blockedReason) {
    candidateBands[bandIndex] = { ...candidateBands[bandIndex], gain: suggestedGain }
  }

  const currentGain = Number(currentBand?.gain ?? recommendation.currentGain ?? 0)
  const delta = suggestedGain === null ? null : Number((suggestedGain - currentGain).toFixed(2))
  return {
    sessionId: analysis.sessionId || archive?.latestSessionId || '',
    phase: analysis.phase,
    channel: snapshot.channel,
    channelName: snapshot.name,
    locationCount: analysis.locationCount,
    confidence: recommendation.confidence ?? analysis.confidence,
    currentBands,
    candidateBands,
    lowCutEnabled: snapshot.lowCutEnabled,
    lowCutFrequency: snapshot.lowCutFrequency,
    bandIndex,
    bandLabel: currentBand?.name || recommendation.bandLabel || 'EQ BAND',
    frequency: Number(currentBand?.frequency ?? recommendation.frequency ?? 1000),
    q: Number(currentBand?.q ?? recommendation.q ?? 1),
    currentGain,
    suggestedGain,
    delta,
    title: recommendation.title || '다지점 분석 결과',
    reason: recommendation.reason || '회중석 다지점 분석 결과를 X32 실제값과 대조했습니다.',
    blockedReason: recommendation.blockedReason,
    commonBand: analysis.commonBands?.[0],
  }
}

function ensurePolyline(svg: SVGSVGElement, className: string, points: string) {
  let line = svg.querySelector<SVGPolylineElement>(`polyline.${className}`)
  if (!line) {
    line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    line.setAttribute('class', className)
    line.setAttribute('data-archive-eq-overlay', 'true')
    svg.appendChild(line)
  }
  line.setAttribute('points', points)
}

function ensureMarker(svg: SVGSVGElement, frequency: number, gain: number) {
  let marker = svg.querySelector<SVGCircleElement>('circle.x32-archive-candidate-marker')
  if (!marker) {
    marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    marker.setAttribute('class', 'x32-archive-candidate-marker')
    marker.setAttribute('r', '8')
    marker.setAttribute('data-archive-eq-overlay', 'true')
    svg.appendChild(marker)
  }
  marker.setAttribute('cx', String(xForFrequency(frequency)))
  marker.setAttribute('cy', String(yForGain(gain)))
}

function removeGraphOverlay() {
  document.querySelectorAll('[data-archive-eq-overlay="true"]').forEach((node) => node.remove())
  document.querySelector('.x32-console-panel')?.classList.remove('has-archive-eq-overlay')
}

function formatGain(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`
}

export default function ArchiveEqSuggestionOverlay() {
  const [overlay, setOverlay] = useState<OverlayState | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const [bridge, archive] = await Promise.all([
        fetchFirstJson<BridgeState>(['/api/status', 'http://localhost:8765/api/status']),
        fetchFirstJson<ArchiveResponse>(['/api/measurements', 'http://localhost:8766/api/measurements']),
      ])
      if (alive) setOverlay(buildOverlay(bridge, archive))
    }
    void load()
    const timer = window.setInterval(load, 2500)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    const ensureHost = () => {
      const panel = document.querySelector<HTMLElement>('.x32-console-panel')
      const shell = panel?.querySelector<HTMLElement>('.x32-console-shell')
      if (!panel || !shell) return
      let host = panel.querySelector<HTMLElement>('#archive-eq-overlay-host')
      if (!host) {
        host = document.createElement('div')
        host.id = 'archive-eq-overlay-host'
        shell.before(host)
      }
      setPortalHost(host)
    }
    ensureHost()
    const observer = new MutationObserver(ensureHost)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!overlay) {
      removeGraphOverlay()
      return undefined
    }

    const apply = () => {
      const panel = document.querySelector<HTMLElement>('.x32-console-panel')
      const svg = panel?.querySelector<SVGSVGElement>('.x32-graph svg')
      if (!panel || !svg) return
      panel.classList.add('has-archive-eq-overlay')
      ensurePolyline(svg, 'x32-archive-current-curve', curvePoints(overlay.currentBands, overlay.lowCutEnabled, overlay.lowCutFrequency))
      if (overlay.suggestedGain !== null && !overlay.blockedReason) {
        ensurePolyline(svg, 'x32-archive-candidate-curve', curvePoints(overlay.candidateBands, overlay.lowCutEnabled, overlay.lowCutFrequency))
        ensureMarker(svg, overlay.frequency, overlay.suggestedGain)
      } else {
        svg.querySelectorAll('.x32-archive-candidate-curve, .x32-archive-candidate-marker').forEach((node) => node.remove())
      }
    }

    apply()
    const timer = window.setInterval(apply, 500)
    return () => { window.clearInterval(timer); removeGraphOverlay() }
  }, [overlay])

  if (!overlay || !portalHost) return null

  const canSuggest = overlay.suggestedGain !== null && !overlay.blockedReason
  return createPortal(
    <section className={`archive-eq-overlay-card ${canSuggest ? 'is-ready' : 'is-blocked'}`} aria-label="iCloud 다지점 X32 EQ 점선 제안">
      <div className="archive-eq-overlay-heading">
        <div>
          <span>ICLOUD 9-POSITION + X32 LOCAL</span>
          <h3>실제 X32 EQ 실선 · 다지점 시험 후보 점선</h3>
          <p>{overlay.sessionId} · {overlay.phase} 단계 · CH {String(overlay.channel).padStart(2, '0')} {overlay.channelName}</p>
        </div>
        <strong>신뢰도 {overlay.confidence}%</strong>
      </div>
      <div className="archive-eq-overlay-badges">
        <span>신뢰 위치 {overlay.locationCount}/9</span>
        {overlay.commonBand && <span>{overlay.commonBand.label} {overlay.commonBand.direction} · {overlay.commonBand.support}곳</span>}
        <span>실선 X32 실제값</span>
        <span>점선 다지점 후보</span>
      </div>
      <div className="archive-eq-overlay-comparison">
        <div><small>BAND</small><strong>{overlay.bandIndex + 1} · {overlay.bandLabel}</strong></div>
        <div><small>FREQ · Q</small><strong>{Math.round(overlay.frequency)}Hz · Q {overlay.q.toFixed(2)}</strong></div>
        <div><small>현재 X32</small><strong>{formatGain(overlay.currentGain)}</strong></div>
        <div><small>시험 후보</small><strong>{formatGain(overlay.suggestedGain)}</strong></div>
        <div><small>변화</small><strong>{formatGain(overlay.delta)}</strong></div>
      </div>
      <p className="archive-eq-overlay-title">{overlay.title}</p>
      <p>{overlay.blockedReason || overlay.reason}</p>
      <p className="archive-eq-overlay-safety">점선은 자동 적용값이 아니라 첫 A/B 시험 후보입니다. X32-EDIT에서 한 밴드만 수동 조정하고 동일 위치 B 측정으로 유지·원복을 결정합니다.</p>
    </section>,
    portalHost,
  )
}
