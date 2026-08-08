import { useEffect, useMemo, useState } from 'react'
import { Cable, CheckCircle2, CircleOff, Gauge, Laptop, Radio, RefreshCw, ShieldCheck, Wifi } from 'lucide-react'
import SingleTapButton from './SingleTapButton'
import type { EqBand, EqFilterType } from './types'
import './x32-connect.css'

export type X32ChannelSnapshot = {
  channel: number
  name: string
  source: number | null
  trimDb: number | null
  lowCutEnabled: boolean
  lowCutFrequency: number
  eqEnabled: boolean
  dynamicsEnabled: boolean
  gateEnabled: boolean
  muted: boolean
  faderDb: number
  meterDb: number
  eqBands: EqBand[]
  updatedAt: number
}

type BridgeChannel = {
  index: number
  name: string
  meterDb: number
}

type BridgeState = {
  bridgeVersion: string
  readOnly: boolean
  connection: {
    mode: 'disconnected' | 'real' | 'demo'
    host: string
    port: number
    connected: boolean
    lastSeen: number | null
    error: string
  }
  console: {
    name: string
    model: string
    firmware: string
    oscVersion: string
    ip: string
  }
  channels: BridgeChannel[]
  selectedChannel: number
  selectedSnapshot: X32ChannelSnapshot
  networkUrls: string[]
}

const FILTER_TYPES: EqFilterType[] = ['LowCut', 'LowShelf', 'PEQ', 'VEQ', 'HighShelf', 'HighCut']

function formatDb(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value <= -89.9) return '-∞'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`
}

function normalizeSnapshot(snapshot: X32ChannelSnapshot): X32ChannelSnapshot {
  return {
    ...snapshot,
    eqBands: snapshot.eqBands.map((band, index) => ({
      name: band.name || ['LOW', 'LOW MID', 'HIGH MID', 'HIGH'][index] || `BAND ${index + 1}`,
      frequency: Math.round(Number(band.frequency) || 1000),
      gain: Number(Number(band.gain || 0).toFixed(1)),
      q: Number(Number(band.q || 1).toFixed(2)),
      filterType: FILTER_TYPES.includes(band.filterType as EqFilterType) ? band.filterType : 'PEQ',
    })),
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.includes('application/json')) throw new Error(`Bridge 응답 ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

export default function X32Connect() {
  const [bridge, setBridge] = useState<BridgeState | null>(null)
  const [bridgeAvailable, setBridgeAvailable] = useState(false)
  const [host, setHost] = useState(() => localStorage.getItem('x32-bridge-host') || '192.168.1.100')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Mac Bridge 상태를 확인하는 중입니다.')

  async function loadStatus() {
    try {
      const next = await fetchJson('/api/status') as BridgeState
      setBridge(next)
      setBridgeAvailable(true)
      setMessage(next.connection.connected ? 'Mac Bridge와 X32 데이터가 연결되었습니다.' : 'Mac Bridge가 실행 중입니다. X32 IP를 연결하세요.')
    } catch {
      setBridgeAvailable(false)
      setBridge(null)
      setMessage('이 화면은 GitHub Pages 모드입니다. Mac에서 X32 Bridge를 실행한 뒤 로컬 주소로 열어야 직접 연결됩니다.')
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    if (!bridgeAvailable) return undefined
    const events = new EventSource('/api/events')
    const onState = (event: MessageEvent<string>) => {
      try {
        const next = JSON.parse(event.data) as BridgeState
        setBridge(next)
        if (next.connection.error) setMessage(next.connection.error)
        else if (next.connection.connected) setMessage(next.connection.mode === 'demo' ? '시뮬레이션 데이터가 실행 중입니다.' : 'X32가 읽기 전용으로 연결되었습니다.')
      } catch {
        setMessage('Bridge 상태 데이터를 읽지 못했습니다.')
      }
    }
    events.addEventListener('state', onState as EventListener)
    events.onerror = () => setMessage('Bridge 실시간 연결이 끊겼습니다. 다시 확인하세요.')
    return () => events.close()
  }, [bridgeAvailable])

  async function post(path: string, body: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const next = await fetchJson(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as BridgeState
      setBridge(next)
      setBridgeAvailable(true)
      return next
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bridge 요청에 실패했습니다.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    const cleanHost = host.trim()
    if (!cleanHost) {
      setMessage('X32 IP를 입력하세요.')
      return
    }
    localStorage.setItem('x32-bridge-host', cleanHost)
    setMessage(`${cleanHost}:10023 응답을 기다리는 중입니다.`)
    await post('/api/connect', { host: cleanHost, port: 10023 })
  }

  async function selectChannel(channel: number) {
    await post('/api/select', { channel })
  }

  const snapshot = bridge?.selectedSnapshot ? normalizeSnapshot(bridge.selectedSnapshot) : null
  const selected = bridge?.channels.find((channel) => channel.index === bridge.selectedChannel)
  const meterPercent = useMemo(() => {
    const db = snapshot?.meterDb ?? -90
    return Math.max(2, Math.min(100, ((db + 60) / 60) * 100))
  }, [snapshot?.meterDb])
  const connected = Boolean(bridge?.connection.connected)
  const isDemo = bridge?.connection.mode === 'demo'

  return (
    <section className="panel x32-connect-panel" id="x32-connect">
      <div className="x32-connect-heading">
        <div>
          <span className="step">X32 IP</span>
          <h2>MacBook X32 직접 연결 · 읽기 전용</h2>
          <p>동일 Wi‑Fi의 Mac Bridge가 X32 실제 설정과 Meter를 읽어 현재 앱에 전달합니다.</p>
        </div>
        <div className={`x32-connect-status ${connected ? 'is-connected' : ''}`}>
          {connected ? <CheckCircle2 size={18} /> : <CircleOff size={18} />}
          <span>{connected ? (isDemo ? 'DEMO' : 'CONNECTED') : bridgeAvailable ? 'BRIDGE READY' : 'LOCAL BRIDGE REQUIRED'}</span>
        </div>
      </div>

      <div className="x32-connect-safety">
        <ShieldCheck size={19} />
        <p><strong>READ ONLY</strong> Scene·Fader·Gain·EQ·Routing을 X32로 전송하는 API는 포함하지 않았습니다.</p>
      </div>

      <div className="x32-connect-grid">
        <div className="x32-connect-card">
          <div className="x32-connect-card-title"><Wifi size={18} /><strong>1. X32 네트워크 연결</strong></div>
          <label htmlFor="x32-host">X32 IP</label>
          <div className="x32-host-row">
            <input
              id="x32-host"
              inputMode="decimal"
              autoCapitalize="none"
              autoCorrect="off"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="예: 192.168.1.100"
              disabled={!bridgeAvailable || busy}
            />
            <SingleTapButton className="primary" onActivate={connect} disabled={!bridgeAvailable || busy}>
              <Cable size={17} />{busy ? '확인 중' : 'X32 연결'}
            </SingleTapButton>
          </div>
          <div className="x32-connect-actions">
            <SingleTapButton className="secondary" onActivate={() => void post('/api/demo')} disabled={!bridgeAvailable || busy}>시뮬레이션</SingleTapButton>
            <SingleTapButton className="secondary" onActivate={loadStatus}><RefreshCw size={15} />Bridge 확인</SingleTapButton>
            {bridge?.connection.mode !== 'disconnected' && (
              <SingleTapButton className="secondary" onActivate={() => void post('/api/disconnect')} disabled={busy}>연결 해제</SingleTapButton>
            )}
          </div>
          <p className="x32-connect-message">{message}</p>
        </div>

        <div className="x32-connect-card console-card">
          <div className="x32-connect-card-title"><Laptop size={18} /><strong>2. 콘솔 상태</strong></div>
          <dl>
            <div><dt>Console</dt><dd>{bridge?.console.name || '—'}</dd></div>
            <div><dt>Model</dt><dd>{bridge?.console.model || '—'}</dd></div>
            <div><dt>Firmware</dt><dd>{bridge?.console.firmware || '—'}</dd></div>
            <div><dt>IP</dt><dd>{bridge?.console.ip || bridge?.connection.host || '—'}</dd></div>
          </dl>
        </div>
      </div>

      {bridgeAvailable && bridge && (
        <div className="x32-channel-workspace">
          <div className="x32-channel-selector">
            <label htmlFor="x32-channel">3. 분석할 X32 채널</label>
            <select
              id="x32-channel"
              value={bridge.selectedChannel}
              onChange={(event) => void selectChannel(Number(event.target.value))}
              disabled={busy}
            >
              {bridge.channels.map((channel) => (
                <option key={channel.index} value={channel.index}>
                  {String(channel.index).padStart(2, '0')} · {channel.name} · {formatDb(channel.meterDb)}
                </option>
              ))}
            </select>
          </div>

          {snapshot && (
            <div className="x32-live-snapshot">
              <div className="x32-snapshot-head">
                <div>
                  <span>CH {String(snapshot.channel).padStart(2, '0')}</span>
                  <h3>{snapshot.name || selected?.name}</h3>
                </div>
                <div className="x32-meter-value"><Gauge size={17} /><strong>{formatDb(snapshot.meterDb)}</strong></div>
              </div>
              <div className="x32-meter-track"><div style={{ width: `${meterPercent}%` }} /></div>
              <div className="x32-snapshot-facts">
                <span>Source {snapshot.source ?? '—'}</span>
                <span>Trim {formatDb(snapshot.trimDb)}</span>
                <span>Low Cut {snapshot.lowCutEnabled ? `${snapshot.lowCutFrequency}Hz` : 'OFF'}</span>
                <span>EQ {snapshot.eqEnabled ? 'ON' : 'OFF'}</span>
                <span>Dynamics {snapshot.dynamicsEnabled ? 'ON' : 'OFF'}</span>
                <span>{snapshot.muted ? 'MUTED' : `Fader ${formatDb(snapshot.faderDb)}`}</span>
              </div>
              <div className="x32-snapshot-bands">
                {snapshot.eqBands.map((band) => (
                  <div key={band.name}>
                    <strong>{band.name}</strong>
                    <span>{band.filterType}</span>
                    <span>{band.frequency}Hz</span>
                    <span>{formatDb(band.gain)}</span>
                    <span>Q {band.q}</span>
                  </div>
                ))}
              </div>
              <SingleTapButton
                className="x32-apply-live"
                onActivate={() => document.querySelector('.x32-console-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                disabled={!connected}
              >
                <Radio size={18} />X32 동일 배열 화면으로 이동
              </SingleTapButton>
              {isDemo && <p className="x32-demo-note">시뮬레이션은 내일 연결 전 UI·Bridge 동작 확인용입니다.</p>}
            </div>
          )}
        </div>
      )}

      {!bridgeAvailable && (
        <div className="x32-local-guide">
          <strong>내일 Mac에서 실행</strong>
          <code>npm run bridge:start</code>
          <p>터미널에 표시되는 <code>http://Mac-IP:8765/x32-speech-eq-guide/</code> 주소를 Mac과 아이폰에서 엽니다.</p>
        </div>
      )}
    </section>
  )
}
