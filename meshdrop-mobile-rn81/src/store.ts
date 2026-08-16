// Tiny shared state for the engine bridge (last paired peer, etc.).
import { on } from './bridge'

let lastPeer: { publicKey?: string; name?: string } | null = null
let engineStatus: 'starting' | 'ready' | 'error' = 'starting'
let engineError = ''

export function initStore() {
  on('trust:paired', (peer: any) => {
    if (peer && peer.publicKey) {
      lastPeer = peer
    }
  })
  on('__engine', (m: any) => {
    if (m && m.status) {
      engineStatus = m.status
      engineError = m.message || ''
    }
  })
}

export function getLastPeer() {
  return lastPeer
}

export function setLastPeer(peer: { publicKey?: string; name?: string } | null) {
  lastPeer = peer
}

export function getEngineStatus() {
  return engineStatus
}

export function getEngineError() {
  return engineError
}
