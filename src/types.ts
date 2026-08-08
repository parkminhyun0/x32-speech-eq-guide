export type AudioState = {
  rms: number
  peak: number
  bands: number[]
}

export type Sample = AudioState & {
  at: number
}

export type AnalysisResult = {
  duration: number
  averageRms: number
  maxPeak: number
  averageBands: number[]
  score: number
  findings: string[]
  recommendations: string[]
}

export type LiveAnalysisEvidence = {
  capturedAt: number
  mode: string
  rms: number
  peak: number
  bands: number[]
  frameDataUrl?: string
}

export type EqFilterType = 'LowCut' | 'LowShelf' | 'PEQ' | 'VEQ' | 'HighShelf' | 'HighCut'

export type EqBand = {
  name: string
  frequency: number
  gain: number
  q: number
  filterType?: EqFilterType
}

export type IntegratedEqSuggestion = {
  candidateBands: EqBand[]
  candidateLowCutEnabled: boolean
  candidateLowCutFrequency: number
  combinedBands: number[]
  confidence: number
  evidenceLabels: string[]
  notes: string[]
  blockedReason?: string
}

export type SourceMode = 'preacher' | 'vocal' | 'instrument'
