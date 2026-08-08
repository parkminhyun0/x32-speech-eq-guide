#!/usr/bin/env node
import dgram from 'node:dgram'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BRIDGE_VERSION = '0.1.0-readonly'
const HTTP_PORT = Number(process.env.X32_BRIDGE_PORT || 8765)
const X32_PORT = 10023
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const APP_PREFIX = '/x32-speech-eq-guide/'
const EQ_TYPES = ['LowCut', 'LowShelf', 'PEQ', 'VEQ', 'HighShelf', 'HighCut']
const BAND_NAMES = ['LOW', 'LOW MID', 'HIGH MID', 'HIGH']

const pad4 = (length) => (length + 3) & ~3
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round = (value, digits = 2) => Math.round(value * (10 ** digits)) / (10 ** digits)

function oscString(value) {
  const raw = Buffer.from(`${value}\0`, 'utf8')
  return Buffer.concat([raw, Buffer.alloc(pad4(raw.length) - raw.length)])
}

function encodeOsc(address, args = []) {
  const parts = [oscString(address)]
  if (!args.length) return Buffer.concat(parts)
  parts.push(oscString(`,${args.map((arg) => arg.type).join('')}`))
  for (const arg of args) {
    if (arg.type === 's') parts.push(oscString(String(arg.value)))
    else if (arg.type === 'i') {
      const buffer = Buffer.alloc(4)
      buffer.writeInt32BE(Number(arg.value), 0)
      parts.push(buffer)
    } else if (arg.type === 'f') {
      const buffer = Buffer.alloc(4)
      buffer.writeFloatBE(Number(arg.value), 0)
      parts.push(buffer)
    } else if (arg.type === 'b') {
      const value = Buffer.from(arg.value)
      const size = Buffer.alloc(4)
      size.writeInt32BE(value.length, 0)
      parts.push(size, value, Buffer.alloc(pad4(value.length) - value.length))
    } else throw new Error(`지원하지 않는 OSC 타입: ${arg.type}`)
  }
  return Buffer.concat(parts)
}

function readOscString(buffer, offset) {
  let end = offset
  while (end < buffer.length && buffer[end] !== 0) end += 1
  if (end >= buffer.length) throw new Error('잘못된 OSC 문자열')
  return { value: buffer.toString('utf8', offset, end), offset: offset + pad4(end - offset + 1) }
}

function decodeOscPacket(buffer) {
  const first = readOscString(buffer, 0)
  if (first.value === '#bundle') {
    let offset = first.offset + 8
    const messages = []
    while (offset + 4 <= buffer.length) {
      const size = buffer.readInt32BE(offset)
      offset += 4
      if (size <= 0 || offset + size > buffer.length) break
      messages.push(...decodeOscPacket(buffer.subarray(offset, offset + size)))
      offset += size
    }
    return messages
  }
  if (!first.value.startsWith('/')) return []
  if (first.offset >= buffer.length) return [{ address: first.value, args: [] }]
  const tags = readOscString(buffer, first.offset)
  if (!tags.value.startsWith(',')) return [{ address: first.value, args: [] }]
  const args = []
  let offset = tags.offset
  for (const type of tags.value.slice(1)) {
    if (type === 's') {
      const item = readOscString(buffer, offset)
      args.push(item.value)
      offset = item.offset
    } else if (type === 'i') {
      args.push(buffer.readInt32BE(offset)); offset += 4
    } else if (type === 'f') {
      args.push(buffer.readFloatBE(offset)); offset += 4
    } else if (type === 'b') {
      const size = buffer.readInt32BE(offset); offset += 4
      args.push(Buffer.from(buffer.subarray(offset, offset + size))); offset += pad4(size)
    } else if (type === 'T') args.push(true)
    else if (type === 'F') args.push(false)
    else if (type === 'N') args.push(null)
    else break
  }
  return [{ address: first.value, args }]
}

const normalizedFrequency = (value, min = 20, max = 20000) => Math.round(min * ((max / min) ** clamp(Number(value), 0, 1)))
const normalizedGain = (value) => round(-15 + clamp(Number(value), 0, 1) * 30, 1)
const normalizedQ = (value) => round(0.3 * ((10 / 0.3) ** clamp(Number(value), 0, 1)), 2)
const normalizedTrim = (value) => round(-18 + clamp(Number(value), 0, 1) * 36, 1)

function normalizedLevel(value) {
  const level = clamp(Number(value), 0, 1)
  if (level <= 0) return -90
  if (level <= 0.0625) return round(-90 + (level / 0.0625) * 30, 1)
  if (level <= 0.25) return round(-60 + ((level - 0.0625) / 0.1875) * 30, 1)
  if (level <= 0.5) return round(-30 + ((level - 0.25) / 0.25) * 20, 1)
  return round(-10 + ((level - 0.5) / 0.5) * 20, 1)
}

function meterDb(value) {
  const linear = Math.max(0, Number(value) || 0)
  if (linear <= 0.00003) return -90
  return round(clamp(20 * Math.log10(linear), -90, 18), 1)
}

const emptyBands = () => BAND_NAMES.map((name) => ({ name, filterType: 'PEQ', frequency: 1000, gain: 0, q: 1 }))
function emptySnapshot(index = 1, name = '') {
  return {
    channel: index,
    name: name || `CH ${String(index).padStart(2, '0')}`,
    source: null,
    trimDb: null,
    lowCutEnabled: false,
    lowCutFrequency: 80,
    eqEnabled: false,
    dynamicsEnabled: false,
    gateEnabled: false,
    muted: false,
    faderDb: -90,
    meterDb: -90,
    eqBands: emptyBands(),
    raw: {},
    updatedAt: Date.now(),
  }
}

const state = {
  bridgeVersion: BRIDGE_VERSION,
  readOnly: true,
  connection: { mode: 'disconnected', host: '', port: X32_PORT, connected: false, lastSeen: null, error: '' },
  console: { name: '', model: '', firmware: '', oscVersion: '', ip: '' },
  channels: Array.from({ length: 32 }, (_, index) => ({ index: index + 1, name: `CH ${String(index + 1).padStart(2, '0')}`, meterDb: -90 })),
  selectedChannel: 1,
  selectedSnapshot: emptySnapshot(1),
  networkUrls: [],
}

let udp = null
let xremoteTimer = null
let meterTimer = null
let refreshTimer = null
let demoTimer = null
const sseClients = new Set()
const publicState = () => JSON.parse(JSON.stringify(state))
function broadcast() {
  const payload = `event: state\ndata: ${JSON.stringify(publicState())}\n\n`
  for (const response of sseClients) response.write(payload)
}
function setError(message) { state.connection.error = message; broadcast() }
function clearTimers() {
  for (const timer of [xremoteTimer, meterTimer, refreshTimer, demoTimer]) if (timer) clearInterval(timer)
  xremoteTimer = meterTimer = refreshTimer = demoTimer = null
}
function closeUdp() {
  clearTimers()
  if (udp) { try { udp.close() } catch {} }
  udp = null
}
function sendOsc(address, args = []) {
  if (!udp || state.connection.mode !== 'real') return
  udp.send(encodeOsc(address, args), state.connection.port, state.connection.host, (error) => {
    if (error) setError(`X32 전송 오류: ${error.message}`)
  })
}
const channelPrefix = (channel = state.selectedChannel) => `/ch/${String(channel).padStart(2, '0')}`

function querySelectedChannel() {
  if (state.connection.mode !== 'real') return
  const prefix = channelPrefix()
  const addresses = [
    `${prefix}/config/name`, `${prefix}/config/source`, `${prefix}/preamp/trim`, `${prefix}/preamp/hpon`, `${prefix}/preamp/hpf`,
    `${prefix}/gate/on`, `${prefix}/dyn/on`, `${prefix}/eq/on`, `${prefix}/mix/on`, `${prefix}/mix/fader`,
  ]
  for (let band = 1; band <= 4; band += 1) addresses.push(`${prefix}/eq/${band}/type`, `${prefix}/eq/${band}/f`, `${prefix}/eq/${band}/g`, `${prefix}/eq/${band}/q`)
  addresses.forEach((address, index) => setTimeout(() => sendOsc(address), index * 3))
}
function queryChannelNames() {
  for (let index = 1; index <= 32; index += 1) setTimeout(() => sendOsc(`${channelPrefix(index)}/config/name`), index * 8)
}
function subscribeMeters() {
  sendOsc('/meters', [
    { type: 's', value: '/meters/0' }, { type: 'i', value: 0 }, { type: 'i', value: 0 }, { type: 'i', value: 10 },
  ])
}

function updateSelectedPath(address, value) {
  const prefix = channelPrefix()
  if (!address.startsWith(`${prefix}/`)) return
  const snapshot = state.selectedSnapshot
  snapshot.raw[address] = value
  snapshot.updatedAt = Date.now()
  if (address === `${prefix}/config/name`) snapshot.name = String(value || snapshot.name)
  else if (address === `${prefix}/config/source`) snapshot.source = Number(value)
  else if (address === `${prefix}/preamp/trim`) snapshot.trimDb = normalizedTrim(value)
  else if (address === `${prefix}/preamp/hpon`) snapshot.lowCutEnabled = Number(value) > 0
  else if (address === `${prefix}/preamp/hpf`) snapshot.lowCutFrequency = normalizedFrequency(value, 20, 400)
  else if (address === `${prefix}/gate/on`) snapshot.gateEnabled = Number(value) > 0
  else if (address === `${prefix}/dyn/on`) snapshot.dynamicsEnabled = Number(value) > 0
  else if (address === `${prefix}/eq/on`) snapshot.eqEnabled = Number(value) > 0
  else if (address === `${prefix}/mix/on`) snapshot.muted = Number(value) === 0
  else if (address === `${prefix}/mix/fader`) snapshot.faderDb = normalizedLevel(value)
  else {
    const match = address.match(/\/eq\/(\d)\/(type|f|g|q)$/)
    if (!match) return
    const band = snapshot.eqBands[Number(match[1]) - 1]
    if (!band) return
    if (match[2] === 'type') band.filterType = EQ_TYPES[clamp(Number(value), 0, EQ_TYPES.length - 1)] || 'PEQ'
    else if (match[2] === 'f') band.frequency = normalizedFrequency(value)
    else if (match[2] === 'g') band.gain = normalizedGain(value)
    else if (match[2] === 'q') band.q = normalizedQ(value)
  }
}

function decodeMeterBlob(blob) {
  let offset = blob.length === 288 ? 8 : 0
  const values = []
  for (let index = 0; index < Math.floor((blob.length - offset) / 4); index += 1) {
    const value = blob.readFloatBE(offset + index * 4)
    values.push(Number.isFinite(value) ? value : 0)
  }
  return values
}

function handleOscMessage({ address, args }) {
  state.connection.connected = true
  state.connection.lastSeen = Date.now()
  state.connection.error = ''
  if (address === '/info') {
    state.console.oscVersion = String(args[0] ?? '')
    state.console.model = String(args[2] ?? state.console.model)
    state.console.firmware = String(args[3] ?? state.console.firmware)
  } else if (address === '/xinfo') {
    state.console.ip = String(args[0] ?? state.console.ip)
    state.console.name = String(args[1] ?? state.console.name)
    state.console.model = String(args[2] ?? state.console.model)
    state.console.firmware = String(args[3] ?? state.console.firmware)
  } else if (address === '/status') {
    state.console.ip = String(args[1] ?? state.console.ip)
    state.console.name = String(args[2] ?? state.console.name)
  } else if (address === '/meters/0' && Buffer.isBuffer(args[0])) {
    const meters = decodeMeterBlob(args[0])
    state.channels = state.channels.map((channel, index) => ({ ...channel, meterDb: meterDb(meters[index] ?? 0) }))
    state.selectedSnapshot.meterDb = state.channels[state.selectedChannel - 1]?.meterDb ?? -90
  } else {
    const nameMatch = address.match(/^\/ch\/(\d{2})\/config\/name$/)
    if (nameMatch) {
      const index = Number(nameMatch[1])
      state.channels[index - 1] = { ...state.channels[index - 1], name: String(args[0] || `CH ${nameMatch[1]}`) }
    }
    if (args.length) updateSelectedPath(address, args[0])
  }
  broadcast()
}

function startRealConnection(host, port = X32_PORT) {
  closeUdp()
  state.connection = { mode: 'real', host, port, connected: false, lastSeen: null, error: '' }
  state.console = { name: '', model: '', firmware: '', oscVersion: '', ip: '' }
  state.selectedSnapshot = emptySnapshot(state.selectedChannel, state.channels[state.selectedChannel - 1]?.name)
  udp = dgram.createSocket('udp4')
  udp.on('error', (error) => setError(`UDP 오류: ${error.message}`))
  udp.on('message', (packet) => {
    try { decodeOscPacket(packet).forEach(handleOscMessage) }
    catch (error) { setError(`OSC 해석 오류: ${error instanceof Error ? error.message : String(error)}`) }
  })
  udp.bind(0, '0.0.0.0', () => {
    sendOsc('/info'); sendOsc('/xinfo'); sendOsc('/status'); sendOsc('/xremote')
    queryChannelNames(); querySelectedChannel(); subscribeMeters()
    xremoteTimer = setInterval(() => sendOsc('/xremote'), 8000)
    meterTimer = setInterval(subscribeMeters, 8000)
    refreshTimer = setInterval(querySelectedChannel, 4000)
    setTimeout(() => {
      if (!state.connection.connected && state.connection.mode === 'real') setError('2초 안에 X32 응답이 없습니다. IP·동일 Wi-Fi·게스트 네트워크·AP 격리를 확인하세요.')
    }, 2200)
  })
  broadcast()
}

function selectChannel(channel) {
  const index = clamp(Number(channel) || 1, 1, 32)
  state.selectedChannel = index
  const prior = state.channels[index - 1]
  state.selectedSnapshot = emptySnapshot(index, prior?.name)
  state.selectedSnapshot.meterDb = prior?.meterDb ?? -90
  if (state.connection.mode === 'demo') {
    state.selectedSnapshot = {
      ...state.selectedSnapshot,
      source: index, trimDb: index === 1 ? 4.5 : 0, lowCutEnabled: index <= 5, lowCutFrequency: index === 1 ? 100 : 80,
      eqEnabled: true, dynamicsEnabled: index <= 5, gateEnabled: index >= 10, muted: false, faderDb: index === 1 ? -2.5 : -8,
      meterDb: prior?.meterDb ?? -90,
      eqBands: [
        { name: 'LOW', filterType: 'LowShelf', frequency: 120, gain: -1, q: 1 },
        { name: 'LOW MID', filterType: 'PEQ', frequency: 280, gain: -2.5, q: 1.4 },
        { name: 'HIGH MID', filterType: 'PEQ', frequency: 3200, gain: 1, q: 0.9 },
        { name: 'HIGH', filterType: 'HighShelf', frequency: 9000, gain: 0, q: 1 },
      ],
    }
  } else querySelectedChannel()
  broadcast()
}

function startDemo() {
  closeUdp()
  state.connection = { mode: 'demo', host: 'DEMO', port: X32_PORT, connected: true, lastSeen: Date.now(), error: '' }
  state.console = { name: 'Worship X32 Demo', model: 'X32', firmware: '4.x simulation', oscVersion: 'demo', ip: '192.168.1.100' }
  const names = ['설교자', '사회자', '찬양 인도', '보컬 1', '보컬 2', '어쿠스틱', '일렉 기타', '베이스', '건반', '킥', '스네어', '오버헤드 L', '오버헤드 R', '회중 마이크 L', '회중 마이크 R', 'Playback L']
  state.channels = Array.from({ length: 32 }, (_, index) => ({ index: index + 1, name: names[index] || `CH ${String(index + 1).padStart(2, '0')}`, meterDb: -45 + ((index * 7) % 25) }))
  selectChannel(1)
  demoTimer = setInterval(() => {
    state.connection.lastSeen = Date.now()
    state.channels = state.channels.map((channel, index) => ({ ...channel, meterDb: round(-48 + ((Date.now() / 400 + index * 11) % 28), 1) }))
    state.selectedSnapshot.meterDb = state.channels[state.selectedChannel - 1]?.meterDb ?? -90
    broadcast()
  }, 700)
  broadcast()
}

function disconnect() {
  closeUdp()
  state.connection = { mode: 'disconnected', host: '', port: X32_PORT, connected: false, lastSeen: null, error: '' }
  broadcast()
}

function networkUrls() {
  const urls = [`http://localhost:${HTTP_PORT}${APP_PREFIX}`]
  for (const values of Object.values(os.networkInterfaces())) {
    for (const item of values || []) if (item.family === 'IPv4' && !item.internal) urls.push(`http://${item.address}:${HTTP_PORT}${APP_PREFIX}`)
  }
  return [...new Set(urls)]
}
function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
async function readJson(request) {
  const chunks = []; let size = 0
  for await (const chunk of request) { size += chunk.length; if (size > 100000) throw new Error('요청이 너무 큽니다.'); chunks.push(chunk) }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json; charset=utf-8' }

function serveApp(request, response) {
  if (!fs.existsSync(DIST)) {
    response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<h1>앱 빌드가 없습니다.</h1><p>터미널에서 npm install 후 npm run bridge:start를 실행하세요.</p>')
    return
  }
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') { response.writeHead(302, { Location: APP_PREFIX }); response.end(); return }
  if (pathname.startsWith(APP_PREFIX)) pathname = pathname.slice(APP_PREFIX.length)
  pathname = pathname || 'index.html'
  let target = path.resolve(DIST, pathname)
  if (!target.startsWith(DIST)) { response.writeHead(403); response.end('Forbidden'); return }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(DIST, 'index.html')
  const extension = path.extname(target).toLowerCase()
  response.writeHead(200, { 'Content-Type': MIME[extension] || 'application/octet-stream', 'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=60' })
  fs.createReadStream(target).pipe(response)
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  try {
    if (url.pathname === '/api/events' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' })
      response.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`)
      sseClients.add(response); request.on('close', () => sseClients.delete(response)); return
    }
    if (url.pathname === '/api/status' && request.method === 'GET') return json(response, 200, publicState())
    if (url.pathname === '/api/connect' && request.method === 'POST') {
      const body = await readJson(request); const host = String(body.host || '').trim()
      if (!host || !/^[a-zA-Z0-9.-]+$/.test(host)) return json(response, 400, { error: '올바른 X32 IP 또는 호스트 이름을 입력하세요.' })
      startRealConnection(host, Number(body.port) || X32_PORT); return json(response, 202, publicState())
    }
    if (url.pathname === '/api/demo' && request.method === 'POST') { startDemo(); return json(response, 200, publicState()) }
    if (url.pathname === '/api/select' && request.method === 'POST') { const body = await readJson(request); selectChannel(body.channel); return json(response, 200, publicState()) }
    if (url.pathname === '/api/disconnect' && request.method === 'POST') { disconnect(); return json(response, 200, publicState()) }
    if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'API를 찾을 수 없습니다.' })
    serveApp(request, response)
  } catch (error) { json(response, 500, { error: error instanceof Error ? error.message : String(error) }) }
})

function selfTest() {
  const packet = encodeOsc('/test', [{ type: 's', value: 'hello' }, { type: 'i', value: 7 }, { type: 'f', value: 0.5 }])
  const decoded = decodeOscPacket(packet)[0]
  if (decoded.address !== '/test' || decoded.args[0] !== 'hello' || decoded.args[1] !== 7 || Math.abs(decoded.args[2] - 0.5) > 0.0001) throw new Error('OSC encode/decode self-test failed')
  if (normalizedFrequency(0, 20, 400) !== 20 || normalizedFrequency(1, 20, 400) !== 400) throw new Error('Frequency conversion self-test failed')
  console.log('X32 Bridge self-test: OK')
}

if (process.env.X32_BRIDGE_SELF_TEST === '1') selfTest()
else {
  state.networkUrls = networkUrls()
  server.listen(HTTP_PORT, '0.0.0.0', () => {
    state.networkUrls = networkUrls()
    console.log('\nX32 Read-Only Bridge가 시작됐습니다.')
    console.log('X32에는 설정 변경 명령을 보내지 않습니다.')
    for (const url of state.networkUrls) console.log(`  ${url}`)
    console.log('\nMac과 iPhone이 같은 Wi-Fi에 연결되어 있어야 합니다.\n')
    broadcast()
  })
}
process.on('SIGINT', () => { closeUdp(); server.close(() => process.exit(0)) })
