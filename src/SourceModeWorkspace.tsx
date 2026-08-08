import { AlertTriangle, CheckCircle2, Guitar, Mic, Music2, ShieldCheck, SlidersHorizontal, Target } from 'lucide-react'
import SingleTapButton from './SingleTapButton'
import { EQ_PROFILES, MODE_LABELS, getEqProfile, getProfilesForMode } from './sourceProfiles'
import type { AnalysisResult, SourceMode } from './types'
import type { EqProfile } from './sourceProfiles'
import './source-mode-workspace.css'

type Props = {
  activeProfileId: string
  result: AnalysisResult | null
  onProfileChange: (profileId: string) => void
  onApplyProfile: (profile: EqProfile) => void
}

const modeIcons = {
  preacher: Mic,
  vocal: Music2,
  instrument: Guitar,
} satisfies Record<SourceMode, typeof Mic>

const measuredLabels = ['80Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz']

function formatGain(gain: number) {
  if (gain > 0) return `+${gain}dB`
  return `${gain}dB`
}

function filterLabel(filterType: EqProfile['eqBands'][number]['filterType']) {
  if (filterType === 'LowShelf') return 'Low Shelf'
  if (filterType === 'HighShelf') return 'High Shelf'
  return 'PEQ'
}

function measurementComparisons(profile: EqProfile, result: AnalysisResult | null) {
  if (!result) return []
  return result.averageBands
    .map((value, index) => ({
      label: measuredLabels[index],
      value,
      target: profile.targetCenter[index],
      difference: value - profile.targetCenter[index],
    }))
    .filter((item) => Math.abs(item.difference) >= 10)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 3)
}

export default function SourceModeWorkspace({ activeProfileId, result, onProfileChange, onApplyProfile }: Props) {
  const profile = getEqProfile(activeProfileId)
  const comparisons = measurementComparisons(profile, result)

  function selectMode(mode: SourceMode) {
    const first = getProfilesForMode(mode)[0]
    if (first) onProfileChange(first.id)
  }

  return (
    <section className="panel source-workspace-panel">
      <div className="source-workspace-heading">
        <div>
          <span className="step">SOURCE MODE</span>
          <h2>설교자·보컬·악기 EQ 워크스페이스</h2>
          <p>소스의 물리적 특성과 목적에 맞는 시작값을 선택하고, 측정과 A/B 비교로 세밀하게 보정합니다.</p>
        </div>
        <SlidersHorizontal size={24} />
      </div>

      <div className="source-mode-tabs" role="tablist" aria-label="EQ 소스 유형">
        {(Object.keys(MODE_LABELS) as SourceMode[]).map((mode) => {
          const Icon = modeIcons[mode]
          const isActive = profile.mode === mode
          return (
            <SingleTapButton
              key={mode}
              className={`source-mode-tab ${isActive ? 'is-active' : ''}`}
              onActivate={() => selectMode(mode)}
              role="tab"
              aria-selected={isActive}
            >
              <Icon size={19} />
              {MODE_LABELS[mode]}
            </SingleTapButton>
          )
        })}
      </div>

      <div className="source-profile-list" aria-label={`${MODE_LABELS[profile.mode]} 세부 프로필`}>
        {getProfilesForMode(profile.mode).map((item) => (
          <SingleTapButton
            key={item.id}
            className={`source-profile-chip ${item.id === profile.id ? 'is-active' : ''}`}
            onActivate={() => onProfileChange(item.id)}
            aria-pressed={item.id === profile.id}
          >
            {item.shortLabel}
          </SingleTapButton>
        ))}
      </div>

      <div className="source-profile-summary">
        <div>
          <span className="source-profile-kicker">현재 선택</span>
          <h3>{profile.label}</h3>
          <p>{profile.description}</p>
        </div>
        <div className="source-goal-card">
          <Target size={20} />
          <div><strong>최적화 목표</strong><p>{profile.goal}</p></div>
        </div>
      </div>

      <div className="source-workspace-grid">
        <article className="source-card">
          <div className="source-card-title"><ShieldCheck size={19} /><h3>EQ 전에 확인</h3></div>
          <ol className="source-check-list">
            {profile.preflight.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </article>

        <article className="source-card">
          <div className="source-card-title"><CheckCircle2 size={19} /><h3>보정 순서</h3></div>
          <ol className="source-check-list numbered">
            {profile.optimizationSteps.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </article>
      </div>

      <div className="source-preset-table-wrap">
        <div className="source-preset-heading">
          <div>
            <h3>X32 시작값 후보</h3>
            <p>고정 정답이 아니라 학습 자료의 교집합을 보수적으로 정리한 출발점입니다.</p>
          </div>
          <div className="lowcut-badge">LC {profile.lowCutFrequency}Hz</div>
        </div>
        <div className="source-preset-table" role="table" aria-label={`${profile.label} X32 시작값`}>
          <div className="source-preset-row source-preset-header" role="row">
            <span>Band</span><span>Type</span><span>Freq</span><span>Gain</span><span>Q</span><span>목적</span>
          </div>
          {profile.eqBands.map((item, index) => (
            <div className="source-preset-row" role="row" key={`${profile.id}-${item.name}`}>
              <strong>{item.name}</strong>
              <span>{filterLabel(item.filterType)}</span>
              <span>{item.frequency >= 1000 ? `${item.frequency / 1000}kHz` : `${item.frequency}Hz`}</span>
              <span className={item.gain > 0 ? 'gain-positive' : item.gain < 0 ? 'gain-negative' : ''}>{formatGain(item.gain)}</span>
              <span>{item.q}</span>
              <span>{profile.bandNotes[index]}</span>
            </div>
          ))}
        </div>
        <SingleTapButton className="apply-source-profile" onActivate={() => onApplyProfile(profile)}>
          <SlidersHorizontal size={19} />
          이 시작값을 X32 입력칸에 적용
        </SingleTapButton>
      </div>

      {result && (
        <div className="source-measurement-box">
          <div className="source-card-title"><Target size={19} /><h3>현재 측정과 선택 프로필 비교</h3></div>
          {comparisons.length ? comparisons.map((item) => (
            <p key={item.label}>
              <strong>{item.label}</strong>
              {item.difference > 0
                ? ` 선택 프로필의 비교 중심보다 ${item.difference}포인트 강한 후보입니다.`
                : ` 선택 프로필의 비교 중심보다 ${Math.abs(item.difference)}포인트 약한 후보입니다.`}
            </p>
          )) : <p>큰 편차 후보가 없습니다. 한 밴드씩 소폭 조정하며 객석 청취로 확정하세요.</p>}
        </div>
      )}

      <div className="source-caution-box">
        <AlertTriangle size={20} />
        <div>
          <strong>안전·검증 기준</strong>
          {profile.cautions.map((item) => <p key={item}>{item}</p>)}
          <p>앱은 믹서를 자동 제어하지 않으며, 적용 후에는 같은 조건에서 A/B 재측정해야 합니다.</p>
        </div>
      </div>
    </section>
  )
}
