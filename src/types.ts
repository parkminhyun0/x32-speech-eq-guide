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

export type EqBand = {
  name: string
  frequency: number
  gain: number
  q: number
}
