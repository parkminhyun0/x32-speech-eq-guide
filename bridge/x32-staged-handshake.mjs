import dgram from 'node:dgram'

const originalCreateSocket = dgram.createSocket.bind(dgram)
const pad4 = (length) => (length + 3) & ~3
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function oscString(value) {
  const raw = Buffer.from(`${value}\0`, 'utf8')
  return Buffer.concat([raw, Buffer.alloc(pad4(raw.length) - raw.length)])
}

function oscAddress(packet) {
  if (!Buffer.isBuffer(packet)) return ''
  const end = packet.indexOf(0)
  if (end <= 0) return ''
  return packet.toString('utf8', 0, end)
}

function oscLayout(packet) {
  if (!Buffer.isBuffer(packet)) return null
  const addressEnd = packet.indexOf(0)
  if (addressEnd <= 0) return null
  const tagsStart = pad4(addressEnd + 1)
  if (tagsStart >= packet.length) return null
  const tagsEnd = packet.indexOf(0, tagsStart)
  if (tagsEnd < 0) return null
  return {
    tags: packet.toString('utf8', tagsStart, tagsEnd),
    dataOffset: pad4(tagsEnd + 1),
  }
}

function transformQPacket(packet) {
  const address = oscAddress(packet)
  if (!/^\/ch\/\d{2}\/eq\/[1-4]\/q$/.test(address)) return packet
  const layout = oscLayout(packet)
  if (!layout || layout.tags !== ',f' || layout.dataOffset + 4 > packet.length) return packet

  const raw = packet.readFloatBE(layout.dataOffset)
  if (!Number.isFinite(raw)) return packet
  const copy = Buffer.from(packet)
  copy.writeFloatBE(1 - clamp(raw, 0, 1), layout.dataOffset)
  return copy
}

function transformMeterPacket(packet) {
  if (oscAddress(packet) !== '/meters/0') return packet
  const layout = oscLayout(packet)
  if (!layout || layout.tags !== ',b' || layout.dataOffset + 8 > packet.length) return packet

  const blobSize = packet.readInt32BE(layout.dataOffset)
  const blobStart = layout.dataOffset + 4
  if (blobSize < 4 || blobStart + blobSize > packet.length) return packet

  const valueCount = packet.readUInt32LE(blobStart)
  if (valueCount !== 70 || blobSize < 4 + valueCount * 4) return packet

  const convertedBlob = Buffer.alloc(8 + valueCount * 4)
  convertedBlob.writeUInt32LE(valueCount, 0)
  convertedBlob.writeUInt32LE(0, 4)
  for (let index = 0; index < valueCount; index += 1) {
    const value = packet.readFloatLE(blobStart + 4 + index * 4)
    convertedBlob.writeFloatBE(Number.isFinite(value) ? value : 0, 8 + index * 4)
  }

  const size = Buffer.alloc(4)
  size.writeInt32BE(convertedBlob.length, 0)
  return Buffer.concat([packet.subarray(0, layout.dataOffset), size, convertedBlob])
}

function transformIncomingPacket(packet) {
  const qFixed = transformQPacket(packet)
  return transformMeterPacket(qFixed)
}

function withoutCallback(args) {
  const copy = [...args]
  if (typeof copy.at(-1) === 'function') copy[copy.length - 1] = () => {}
  return copy
}

/**
 * Compatibility layer for the X32 OSC wire format used by firmware 4.02.
 *
 * 1. Stage all non-/info requests until the first OSC response arrives so the
 *    console is not flooded during connection startup.
 * 2. X32 EQ Q is encoded in the reverse normalized direction from the bridge's
 *    display conversion, so incoming Q floats are mirrored before decoding.
 * 3. Meter blobs carry a little-endian value count and little-endian native
 *    floats. Convert /meters/0 into the big-endian layout expected by the
 *    existing bridge decoder.
 *
 * This layer remains read-only and does not add any X32 setting commands.
 */
dgram.createSocket = function createStagedSocket(...createArgs) {
  const socket = originalCreateSocket(...createArgs)
  const originalSend = socket.send.bind(socket)
  const originalOn = socket.on.bind(socket)
  const queued = []
  let waitingForHandshake = true
  let handshakeArgs = null
  let retryTimer = null
  let flushTimer = null

  function cleanup() {
    if (retryTimer) clearInterval(retryTimer)
    if (flushTimer) clearInterval(flushTimer)
    retryTimer = null
    flushTimer = null
    queued.length = 0
  }

  function beginFlush() {
    if (!waitingForHandshake) return
    waitingForHandshake = false
    if (retryTimer) clearInterval(retryTimer)
    retryTimer = null

    console.log(`[X32 Bridge] OSC handshake 응답 수신 · 대기 요청 ${queued.length}개를 순차 전송합니다.`)
    flushTimer = setInterval(() => {
      const next = queued.shift()
      if (!next) {
        clearInterval(flushTimer)
        flushTimer = null
        return
      }
      originalSend(...next)
    }, 15)
  }

  socket.send = (...sendArgs) => {
    const address = oscAddress(sendArgs[0])

    if (waitingForHandshake && address === '/info') {
      handshakeArgs = withoutCallback(sendArgs)
      const result = originalSend(...sendArgs)
      if (!retryTimer) {
        console.log('[X32 Bridge] /info 단독 핸드셰이크를 시작합니다.')
        retryTimer = setInterval(() => {
          if (waitingForHandshake && handshakeArgs) originalSend(...handshakeArgs)
        }, 500)
      }
      return result
    }

    if (waitingForHandshake) {
      queued.push(sendArgs)
      return undefined
    }

    return originalSend(...sendArgs)
  }

  socket.on = (eventName, listener) => {
    if (eventName === 'message' && typeof listener === 'function') {
      return originalOn(eventName, (packet, ...rest) => listener(transformIncomingPacket(packet), ...rest))
    }
    return originalOn(eventName, listener)
  }

  socket.prependListener('message', beginFlush)
  socket.once('close', cleanup)
  socket.once('error', cleanup)
  return socket
}

function testFloatPacket(address, value) {
  const float = Buffer.alloc(4)
  float.writeFloatBE(value, 0)
  return Buffer.concat([oscString(address), oscString(',f'), float])
}

function testMeterPacket() {
  const values = Array.from({ length: 70 }, (_, index) => index === 0 ? 0.0316227766 : index / 100)
  const blob = Buffer.alloc(4 + values.length * 4)
  blob.writeUInt32LE(values.length, 0)
  values.forEach((value, index) => blob.writeFloatLE(value, 4 + index * 4))
  const size = Buffer.alloc(4)
  size.writeInt32BE(blob.length, 0)
  return { packet: Buffer.concat([oscString('/meters/0'), oscString(',b'), size, blob]), expected: values[0] }
}

if (process.env.X32_HANDSHAKE_SELF_TEST === '1') {
  if (dgram.createSocket === originalCreateSocket) throw new Error('staged handshake patch was not installed')

  const qInput = testFloatPacket('/ch/01/eq/1/q', 0.45)
  const qOutput = transformIncomingPacket(qInput)
  const qOffset = oscLayout(qOutput)?.dataOffset ?? -1
  if (qOffset < 0 || Math.abs(qOutput.readFloatBE(qOffset) - 0.55) > 0.0001) {
    throw new Error('X32 Q reverse-normalization self-test failed')
  }

  const meterInput = testMeterPacket()
  const meterOutput = transformIncomingPacket(meterInput.packet)
  const meterOffset = oscLayout(meterOutput)?.dataOffset ?? -1
  const meterSize = meterOffset >= 0 ? meterOutput.readInt32BE(meterOffset) : -1
  const firstMeter = meterOffset >= 0 ? meterOutput.readFloatBE(meterOffset + 4 + 8) : Number.NaN
  if (meterSize !== 288 || Math.abs(firstMeter - meterInput.expected) > 0.0001) {
    throw new Error('X32 meter little-endian conversion self-test failed')
  }

  console.log('X32 staged OSC handshake/Q/meter self-test: OK')
}
