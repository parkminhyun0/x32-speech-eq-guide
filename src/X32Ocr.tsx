import { useEffect, useState } from 'react'
import SingleTapButton from './SingleTapButton'
import type { EqBand } from './types'

type OcrStatus = 'idle' | 'working' | 'missing-image' | 'engine-error' | 'no-values' | 'review' | 'applied'

type OcrCandidate = EqBand & {
  confidence: number
}

type X32OcrProps = {
  imageUrl: string
  onApply: (bands: EqBand[], lowCut: number | null) => void
}

type TesseractMessage = {
  status?: string
  progress?: number
}

type TesseractResult = {
  data?: {
    text?: string
  }
}

declare global {
  interface Window {
    Tesseract?: {
      recognize: (
        image: string,
        language: string,
        options?: { logger?: (message: TesseractMessage) => void },
      ) => Promise<TesseractResult>
    }
  }
}

const BAND_NAMES = ['Low', 'Low Mid', 'High Mid', 'High']
const defaults = [
  { frequency: 120, gain: 0, q: 1 },
  { frequency: 250, gain: 0, q: 1.4 },
  { frequency: 3200, gain: 0, q: 1.4 },
  { frequency: 8000, gain: 0, q: 1 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function numberValue(value: string | number) {
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeFrequency(value: string, unit = '') {
  const parsed = numberValue(value)
  if (parsed === null) return null
  const normalized = /k/i.test(unit) ? parsed * 1000 : parsed
  return normalized >= 20 && normalized <= 20000 ? Math.round(normalized) : null
}

function parseText(text: string) {
  const cleaned = text
    .replace(/[−–—]/g, '-')
    .replace(/O(?=\d)/g, '0')
    .replace(/(\d)O/g, '$10')
    .replace(/,/g, '.')

  const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const frequencies = [...cleaned.matchAll(/(-?\d+(?:\.\d+)?)\s*(k?hz)\b/gi)]
    .map((match) => normalizeFrequency(match[1], match[2]))
    .filter((value): value is number => value !== null)
  const gains = [...cleaned.matchAll(/([+-]?\d+(?:\.\d+)?)\s*d\s*b\b/gi)]
    .map((match) => numberValue(match[1]))
    .filter((value): value is number => value !== null && value >= -15 && value <= 15)
  const qValues = [...cleaned.matchAll(/(?:\bq\b|quality)\s*[:=]?\s*(\d+(?:\.\d+)?)/gi)]
    .map((match) => numberValue(match[1]))
    .filter((value): value is number => value !== null && value >= 0.3 && value <= 10)

  const candidates: OcrCandidate[] = BAND_NAMES.map((name, index) => ({
    name,
    frequency: frequencies[index] ?? defaults[index].frequency,
    gain: gains[index] ?? defaults[index].gain,
    q: qValues[index] ?? defaults[index].q,
    confidence: Math.round([
      frequencies[index] !== undefined,
      gains[index] !== undefined,
      qValues[index] !== undefined,
    ].filter(Boolean).length / 3 * 100),
  }))

  const lowCutLine = lines.find((line) => /(low\s*cut|lo\s*cut|hpf)/i.test(line)) || ''
  const lowCutMatch = lowCutLine.match(/(\d+(?:\.\d+)?)\s*(k?hz)/i)
  const lowCut = lowCutMatch ? normalizeFrequency(lowCutMatch[1], lowCutMatch[2]) : null

  return {
    candidates,
    lowCut,
    detected: frequencies.length + gains.length + qValues.length,
  }
}

function statusMessage(status: OcrStatus) {
  if (status === 'missing-image') return '먼저 X32 EQ 화면 이미지를 촬영하거나 선택해 주세요.'
  if (status === 'engine-error') return '문자 인식 엔진을 불러오지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.'
  if (status === 'no-values') return '숫자를 충분히 읽지 못했습니다. 화면을 정면에서 밝고 선명하게 다시 촬영해 주세요.'
  if (status === 'applied') return '검토한 후보를 입력칸에 반영했습니다. 실제 X32 화면과 다시 대조해 주세요.'
  return 'OCR 결과는 후보입니다. 숫자를 직접 검토한 뒤에만 입력칸에 반영하세요.'
}

export default function X32Ocr({ imageUrl, onApply }: X32OcrProps) {
  const [status, setStatus] = useState<OcrStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [rawText, setRawText] = useState('')
  const [candidates, setCandidates] = useState<OcrCandidate[]>([])
  const [lowCut, setLowCut] = useState<number | null>(null)

  useEffect(() => {
    setStatus('idle')
    setProgress(0)
    setRawText('')
    setCandidates([])
    setLowCut(null)
  }, [imageUrl])

  async function analyze() {
    if (!imageUrl) {
      setStatus('missing-image')
      return
    }
    if (!window.Tesseract) {
      setStatus('engine-error')
      return
    }

    setStatus('working')
    setProgress(0)
    try {
      const result = await window.Tesseract.recognize(imageUrl, 'eng', {
        logger(message) {
          if (message.status === 'recognizing text') setProgress(Math.round((message.progress || 0) * 100))
        },
      })
      const text = result.data?.text || ''
      const parsed = parseText(text)
      setRawText(text)
      setCandidates(parsed.candidates)
      setLowCut(parsed.lowCut)
      setStatus(parsed.detected ? 'review' : 'no-values')
    } catch (error) {
      console.error('X32 OCR failed', error)
      setStatus('engine-error')
    }
  }

  function updateCandidate(index: number, field: 'frequency' | 'gain' | 'q', value: number) {
    setCandidates((current) => current.map((candidate, candidateIndex) => (
      candidateIndex === index ? { ...candidate, [field]: value } : candidate
    )))
  }

  function apply() {
    const normalized = candidates.map((candidate) => ({
      name: candidate.name,
      frequency: clamp(Math.round(candidate.frequency), 20, 20000),
      gain: clamp(Number(candidate.gain.toFixed(1)), -15, 15),
      q: clamp(Number(candidate.q.toFixed(1)), 0.3, 10),
    }))
    onApply(normalized, lowCut === null ? null : clamp(Math.round(lowCut), 20, 400))
    setStatus('applied')
  }

  const working = status === 'working'

  return (
    <section id="x32-ocr-panel" className="panel x32-ocr-panel">
      <div className="panel-heading compact">
        <div><span className="step">08</span><h2>X32 화면 자동 읽기 · Beta</h2></div>
        <span className="ocr-badge">검토 후 적용</span>
      </div>
      <p className="ocr-intro">휴대폰에서 문자 인식을 실행해 Frequency·Gain·Q 후보를 만듭니다. 사진과 숫자를 반드시 직접 대조하세요.</p>
      <div className="ocr-actions">
        <SingleTapButton
          className="primary"
          disabled={!imageUrl || working}
          onActivate={analyze}
        >
          {working ? `인식 중 ${progress}%` : '이미지 숫자 읽기'}
        </SingleTapButton>
        {working && <div className="ocr-progress"><span style={{ width: `${progress}%` }} /></div>}
      </div>
      <p className={`ocr-message ${status === 'engine-error' || status === 'missing-image' ? 'warning' : ''}`}>
        {statusMessage(status)}
      </p>

      {candidates.length > 0 && (
        <>
          <div className="ocr-lowcut-row">
            <label>
              Low Cut 후보
              <input
                type="number"
                inputMode="numeric"
                min="20"
                max="400"
                value={lowCut ?? ''}
                onChange={(event) => setLowCut(event.target.value === '' ? null : Number(event.target.value))}
              />
            </label>
          </div>
          <div className="ocr-table" role="table" aria-label="OCR로 읽은 X32 EQ 후보">
            <div className="ocr-row ocr-head" role="row"><span>밴드</span><span>Hz</span><span>dB</span><span>Q</span></div>
            {candidates.map((candidate, index) => (
              <div className="ocr-row" role="row" key={candidate.name}>
                <strong>{candidate.name}</strong>
                <input
                  aria-label={`${candidate.name} OCR frequency`}
                  type="number"
                  inputMode="numeric"
                  min="20"
                  max="20000"
                  value={candidate.frequency}
                  onChange={(event) => updateCandidate(index, 'frequency', Number(event.target.value))}
                />
                <input
                  aria-label={`${candidate.name} OCR gain`}
                  type="number"
                  inputMode="decimal"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={candidate.gain}
                  onChange={(event) => updateCandidate(index, 'gain', Number(event.target.value))}
                />
                <input
                  aria-label={`${candidate.name} OCR Q`}
                  type="number"
                  inputMode="decimal"
                  min="0.3"
                  max="10"
                  step="0.1"
                  value={candidate.q}
                  onChange={(event) => updateCandidate(index, 'q', Number(event.target.value))}
                />
              </div>
            ))}
          </div>
          <SingleTapButton className="ocr-apply" onActivate={apply}>검토한 후보를 X32 입력칸에 반영</SingleTapButton>
          <details className="ocr-raw"><summary>읽힌 원문 확인</summary><pre>{rawText}</pre></details>
        </>
      )}

      <p className="ocr-safety">촬영 각도·반사광·화면 테마에 따라 오독될 수 있습니다. 자동 믹서 제어 또는 자동 확정은 하지 않습니다.</p>
    </section>
  )
}
