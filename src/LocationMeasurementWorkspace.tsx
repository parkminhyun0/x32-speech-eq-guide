import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CloudDownload, FileDown, FolderSync, Mic, MicOff, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import SingleTapButton from './SingleTapButton'
import { DEFAULT_PROFILE_ID, EQ_PROFILES, getEqProfile } from './sourceProfiles'
import type { AnalysisResult, AudioState, Sample } from './types'
import {
  analyzeLocalSession, BAND_LABELS, downloadJson, loadRecords, LOCATION_ROWS, LOCATIONS,
  measurementFilename, nextSessionId, parseMeasurementFile, recordFromResult, repetitionFor, saveRecords,
  type LocationId, type LocationMeasurementRecord, type MeasurementBundle, type MeasurementPhase,
} from './measurementSessions'
import './location-measurements.css'

const SECONDS = 30
const ranges = [[60,100],[100,160],[160,350],[350,700],[700,1400],[1400,2800],[2800,5600],[5600,10000]]
const emptyAudio: AudioState = { rms: 0, peak: 0, bands: Array(8).fill(0) }

type BridgeArchive = {
  directories: string[]
  records: LocationMeasurementRecord[]
  latestSessionId?: string
  analysis?: {
    locationCount: number
    confidence: number
    recommendation?: { title:string; reason:string; blockedReason?:string; currentGain?:number; suggestedGain?:number; frequency?:number; bandLabel?:string; q?:number }
  }
}

const median = (values:number[]) => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)] ?? 0
function resultFrom(samples:Sample[], target:number[]):AnalysisResult {
  const duration = samples.at(-1)?.at ?? 0
  const averageRms = Math.round(samples.reduce((s,x)=>s+x.rms,0)/Math.max(1,samples.length))
  const maxPeak = Math.max(0,...samples.map(x=>x.peak))
  const averageBands = BAND_LABELS.map((_,i)=>Math.round(samples.reduce((s,x)=>s+x.bands[i],0)/Math.max(1,samples.length)))
  const measuredCenter=median(averageBands), targetCenter=median(target)
  const large=averageBands.map((v,i)=>({i,d:(v-measuredCenter)-((target[i]??targetCenter)-targetCenter)})).filter(x=>Math.abs(x.d)>=10)
  const findings=large.slice(0,3).map(x=>`${BAND_LABELS[x.i]} 상대 편차가 ${x.d>0?'높은':'낮은'} 후보입니다.`)
  let score=100
  if(maxPeak>=92) score-=24
  else if(maxPeak<25) score-=12
  if(averageRms<4) score-=15
  return { duration:Math.round(duration*10)/10, averageRms, maxPeak, averageBands, score:Math.max(35,score), findings:findings.length?findings:['큰 상대 편차가 감지되지 않았습니다.'], recommendations:['여러 위치에서 반복되는 공통 문제만 EQ 후보로 사용하세요.'] }
}

async function readBridge():Promise<BridgeArchive|null>{
  for(const url of ['/api/measurements','http://localhost:8766/api/measurements']){
    try{const response=await fetch(url,{cache:'no-store'});if(response.ok)return await response.json() as BridgeArchive}catch{}
  }
  return null
}

export default function LocationMeasurementWorkspace(){
  const initial=loadRecords()
  const [records,setRecords]=useState<LocationMeasurementRecord[]>(initial)
  const [profileId,setProfileId]=useState(DEFAULT_PROFILE_ID)
  const [channel,setChannel]=useState(1)
  const [sessionId,setSessionId]=useState(()=>nextSessionId(initial,1))
  const [sessionLabel,setSessionLabel]=useState('현장 음향 측정')
  const [phase,setPhase]=useState<MeasurementPhase>('A')
  const [locationId,setLocationId]=useState<LocationId>('MIDDLE_CENTER')
  const [notes,setNotes]=useState('')
  const [isListening,setIsListening]=useState(false)
  const [elapsed,setElapsed]=useState(0)
  const [audio,setAudio]=useState<AudioState>(emptyAudio)
  const [lastResult,setLastResult]=useState<AnalysisResult|null>(null)
  const [status,setStatus]=useState('위치를 선택하고 30초 측정을 시작하세요.')
  const [bridge,setBridge]=useState<BridgeArchive|null>(null)
  const contextRef=useRef<AudioContext|null>(null), streamRef=useRef<MediaStream|null>(null), frameRef=useRef<number|null>(null)
  const startedRef=useRef(0), samplesRef=useRef<Sample[]>([]), finishingRef=useRef(false), importRef=useRef<HTMLInputElement|null>(null)
  const profile=getEqProfile(profileId)
  const sessionRecords=useMemo(()=>records.filter(x=>x.sessionId===sessionId),[records,sessionId])
  const analysis=useMemo(()=>analyzeLocalSession(records,sessionId,phase),[records,sessionId,phase])
  const repetition=repetitionFor(records,sessionId,phase,locationId)

  useEffect(()=>()=>stopHardware(),[])
  useEffect(()=>saveRecords(records),[records])
  useEffect(()=>{let alive=true;const load=async()=>{const value=await readBridge();if(alive)setBridge(value)};void load();const timer=setInterval(load,2500);return()=>{alive=false;clearInterval(timer)}},[])

  function stopHardware(){
    if(frameRef.current!==null)cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach(track=>track.stop())
    if(contextRef.current&&contextRef.current.state!=='closed')void contextRef.current.close()
    frameRef.current=null;streamRef.current=null;contextRef.current=null;setIsListening(false)
  }

  async function start(){
    try{
      stopHardware();finishingRef.current=false;setElapsed(0);setAudio(emptyAudio);setLastResult(null);samplesRef.current=[]
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})
      const context=new AudioContext(), analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.78
      context.createMediaStreamSource(stream).connect(analyser);contextRef.current=context;streamRef.current=stream;startedRef.current=performance.now();setIsListening(true)
      setStatus(`${LOCATIONS.find(x=>x.id===locationId)?.label} · ${phase} 측정 중`)
      const frequency=new Uint8Array(analyser.frequencyBinCount), time=new Uint8Array(analyser.fftSize), hzPerBin=context.sampleRate/analyser.fftSize
      const tick=()=>{
        analyser.getByteFrequencyData(frequency);analyser.getByteTimeDomainData(time)
        let sum=0,peak=0;for(const sample of time){const n=(sample-128)/128;sum+=n*n;peak=Math.max(peak,Math.abs(n))}
        const bands=ranges.map(([low,high])=>{const a=Math.max(0,Math.floor(low/hzPerBin)),b=Math.min(frequency.length-1,Math.ceil(high/hzPerBin));let total=0;for(let i=a;i<=b;i+=1)total+=frequency[i];return Math.round(total/Math.max(1,b-a+1)/255*100)})
        const next={rms:Math.round(Math.sqrt(sum/time.length)*100),peak:Math.round(peak*100),bands}, seconds=(performance.now()-startedRef.current)/1000
        setAudio(next);setElapsed(Math.min(SECONDS,seconds));samplesRef.current.push({...next,at:seconds})
        if(seconds>=SECONDS){finish();return} frameRef.current=requestAnimationFrame(tick)
      };tick()
    }catch(error){stopHardware();setStatus(error instanceof Error?`측정 실패: ${error.message}`:'측정 시작 실패')}
  }

  function finish(){
    if(finishingRef.current)return;finishingRef.current=true
    const samples=[...samplesRef.current];stopHardware();if((samples.at(-1)?.at??0)<5){finishingRef.current=false;setStatus('최소 5초 이상 측정해야 저장할 수 있습니다.');return}
    const result=resultFrom(samples,profile.targetCenter)
    const record=recordFromResult({result,profile,sessionId,sessionLabel,channel,phase,locationId,repetition,notes})
    setRecords(current=>[...current,record]);setLastResult(result);downloadJson(measurementFilename(record),record)
    setStatus(`${record.locationLabel} · ${record.phase} ${record.repetition}회 저장 완료. JSON 다운로드를 시작했습니다.`)
  }

  function newSession(){stopHardware();const next=nextSessionId(records,channel);setSessionId(next);setPhase('A');setLocationId('MIDDLE_CENTER');setStatus(`새 세션 ${next}`)}
  function exportSession(){if(!sessionRecords.length)return;const bundle:MeasurementBundle={schemaVersion:1,kind:'x32-location-measurement-bundle',exportedAt:new Date().toISOString(),sessionId,records:sessionRecords};downloadJson(`X32_${sessionId}_ALL.json`,bundle)}
  function redownload(){const latest=[...sessionRecords].sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt))[0];if(latest)downloadJson(measurementFilename(latest),latest)}
  async function importFiles(event:ChangeEvent<HTMLInputElement>){const imported:LocationMeasurementRecord[]=[];for(const file of Array.from(event.target.files||[])){try{imported.push(...parseMeasurementFile(JSON.parse(await file.text())))}catch{}}
    if(imported.length){setRecords(current=>{const map=new Map(current.map(x=>[x.measurementId,x]));imported.forEach(x=>map.set(x.measurementId,x));return [...map.values()]});setSessionId(imported[0].sessionId);setStatus(`${imported.length}개 기록을 불러왔습니다.`)}event.target.value=''}

  return <section className="location-workspace" id="location-measurement-workspace"><div className="location-shell">
    <div className="location-heading"><div><span className="step">FIELD SESSION</span><h2>9개 회중석 위치 · 누적 측정·iCloud JSON·Mac 비교</h2><p>측정 결과를 세션·A/B·위치·횟수별로 보관하며 Mac Bridge가 iCloud Desktop에서 자동 수집합니다.</p></div><div className="location-actions"><SingleTapButton className="secondary" onActivate={newSession}><Plus size={18}/>새 세션</SingleTapButton><SingleTapButton className="secondary" disabled={!sessionRecords.length} onActivate={exportSession}><FileDown size={18}/>세션 묶음 저장</SingleTapButton></div></div>
    <div className="session-form">
      <label><span>세션 ID</span><input value={sessionId} onChange={(e:ChangeEvent<HTMLInputElement>)=>setSessionId(e.target.value.trim().replace(/\s+/g,'-'))}/></label>
      <label><span>세션 이름</span><input value={sessionLabel} onChange={(e:ChangeEvent<HTMLInputElement>)=>setSessionLabel(e.target.value)}/></label>
      <label><span>X32 채널</span><input type="number" min="1" max="32" value={channel} onChange={(e:ChangeEvent<HTMLInputElement>)=>setChannel(Math.min(32,Math.max(1,Number(e.target.value)||1)))}/></label>
      <label><span>프로필</span><select value={profileId} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setProfileId(e.target.value)}>{EQ_PROFILES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
    </div>
    <div className="phase-switch"><button type="button" className={phase==='A'?'active':''} onClick={()=>setPhase('A')}><b>A</b><span>변경 전</span></button><button type="button" className={phase==='B'?'active':''} onClick={()=>setPhase('B')}><b>B</b><span>변경 후</span></button></div>
    <div className="venue-map"><div className="stage-direction">강대상 · 메인 스피커 방향</div>{LOCATION_ROWS.map(row=>{const cells=LOCATIONS.filter(x=>x.row===row);return <div className="venue-row" key={row}><strong>{cells[0].rowLabel}</strong><div className="venue-cells">{cells.map(location=>{const a=sessionRecords.filter(x=>x.locationId===location.id&&x.phase==='A').length,b=sessionRecords.filter(x=>x.locationId===location.id&&x.phase==='B').length;return <button type="button" key={location.id} className={`${locationId===location.id?'selected':''} ${a&&b?'compared':a?'has-a':b?'has-b':''}`} onClick={()=>setLocationId(location.id)}><span>{location.columnLabel}</span><small>A {a} · B {b}</small></button>})}</div></div>})}</div>
    <div className="measurement-console"><div className="measurement-target"><span>현재 위치</span><strong>{LOCATIONS.find(x=>x.id===locationId)?.label}</strong><small>{phase} · {repetition}회차 · CH {String(channel).padStart(2,'0')}</small></div><div className="measurement-live"><div><span>시간</span><strong>{elapsed.toFixed(1)} / 30초</strong></div><div><span>RMS</span><strong>{audio.rms}%</strong></div><div><span>Peak</span><strong>{audio.peak}%</strong></div></div><div className="measurement-buttons"><SingleTapButton className={isListening?'danger':'primary'} onActivate={isListening?finish:start}>{isListening?<MicOff size={18}/>:<Mic size={18}/>} {isListening?'정지·분석·저장':'30초 측정 시작'}</SingleTapButton><SingleTapButton className="secondary" onActivate={()=>{stopHardware();setElapsed(0);setAudio(emptyAudio);setStatus('초기화 완료')}}><RotateCcw size={18}/>초기화</SingleTapButton><SingleTapButton className="secondary" disabled={!sessionRecords.length} onActivate={redownload}><CloudDownload size={18}/>최근 JSON</SingleTapButton></div><label className="measurement-notes"><span>위치 메모</span><input value={notes} onChange={(e:ChangeEvent<HTMLInputElement>)=>setNotes(e.target.value)} placeholder="예: 기둥 옆, 후면 벽 1m"/></label><p className="measurement-status">{isListening?`${Math.max(0,Math.ceil(SECONDS-elapsed))}초 남음`:status}</p></div>
    {lastResult&&<div className="last-result"><strong>최근 측정</strong><span>RMS {lastResult.averageRms}</span><span>Peak {lastResult.maxPeak}</span><span>신뢰도 {lastResult.score}</span><div>{lastResult.averageBands.map((v,i)=><small key={BAND_LABELS[i]}>{BAND_LABELS[i]}<b>{v}</b></small>)}</div></div>}
    <div className="session-summary-grid"><article><div className="summary-title"><Save size={18}/><strong>현재 기기 보관</strong><span>{sessionRecords.length}개</span></div><p>{phase} · 신뢰 기록 {analysis.trustedCount}회 · 위치 {analysis.locationCount}/9 · 신뢰도 {analysis.confidence}%</p><div className="common-bands">{analysis.commonBands.length?analysis.commonBands.slice(0,3).map(x=><span key={x.label}>{x.label} {x.direction} · {x.support}곳</span>):<span>공통 편차 분석 대기</span>}</div><p className="analysis-message">{analysis.recommendation}</p></article><article className={bridge?'bridge-online':''}><div className="summary-title"><FolderSync size={18}/><strong>Mac iCloud 자동 수집</strong><span>{bridge?'연결됨':'Mac 로컬 전용'}</span></div>{bridge?<><p>수집 {bridge.records.length}개 · 감시 폴더 {bridge.directories.length}개 · {bridge.latestSessionId||'세션 대기'}</p><b>{bridge.analysis?.recommendation?.title||'다지점 분석 대기'}</b><p className="analysis-message">{bridge.analysis?.recommendation?.blockedReason||bridge.analysis?.recommendation?.reason}</p>{bridge.analysis?.recommendation?.suggestedGain!==undefined&&!bridge.analysis.recommendation.blockedReason&&<div className="eq-candidate"><span>{bridge.analysis.recommendation.bandLabel} · {bridge.analysis.recommendation.frequency}Hz</span><strong>{bridge.analysis.recommendation.currentGain}dB → {bridge.analysis.recommendation.suggestedGain}dB</strong><small>Q {bridge.analysis.recommendation.q} · 신뢰도 {bridge.analysis.confidence}%</small></div>}</>:<p>`npm run bridge:start` 후 iCloud Desktop/X32 Measurements를 자동 감시합니다.</p>}</article></div>
    <div className="records-list"><div className="records-head"><strong>세션 기록</strong><input ref={importRef} type="file" accept="application/json,.json" multiple hidden onChange={importFiles}/><SingleTapButton className="secondary" onActivate={()=>importRef.current?.click()}><Upload size={17}/>JSON 불러오기</SingleTapButton></div>{sessionRecords.length?[...sessionRecords].sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt)).map(record=><div className="record-row" key={record.measurementId}><div><strong>{record.locationLabel}</strong><span>{record.phase} · {record.repetition}회</span></div><div><span>RMS {record.averageRms}</span><span>Peak {record.maxPeak}</span><span>신뢰 {record.confidence}</span></div><button type="button" onClick={()=>setRecords(current=>current.filter(x=>x.measurementId!==record.measurementId))}><Trash2 size={17}/></button></div>):<p className="empty-records">아직 저장된 위치 측정이 없습니다.</p>}</div>
  </div></section>
}
