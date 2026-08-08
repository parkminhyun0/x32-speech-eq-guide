import dgram from 'node:dgram'

const originalCreateSocket = dgram.createSocket.bind(dgram)

function oscAddress(packet) {
  if (!Buffer.isBuffer(packet)) return ''
  const end = packet.indexOf(0)
  if (end <= 0) return ''
  return packet.toString('utf8', 0, end)
}

function withoutCallback(args) {
  const copy = [...args]
  if (typeof copy.at(-1) === 'function') copy[copy.length - 1] = () => {}
  return copy
}

/**
 * X32 firmware 4.02 can answer /info immediately but may ignore a burst of
 * discovery, 32 channel-name, EQ and meter requests sent in the same tick.
 * Stage all non-/info packets until the first OSC response arrives, then
 * release them gradually. This keeps the bridge read-only and does not change
 * any OSC address or value sent by server.mjs.
 */
dgram.createSocket = function createStagedSocket(...createArgs) {
  const socket = originalCreateSocket(...createArgs)
  const originalSend = socket.send.bind(socket)
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

  socket.prependListener('message', beginFlush)
  socket.once('close', cleanup)
  socket.once('error', cleanup)
  return socket
}

if (process.env.X32_HANDSHAKE_SELF_TEST === '1') {
  if (dgram.createSocket === originalCreateSocket) throw new Error('staged handshake patch was not installed')
  console.log('X32 staged OSC handshake self-test: OK')
}
