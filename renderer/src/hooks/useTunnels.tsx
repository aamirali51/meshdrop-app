import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'

export interface TunnelRecord {
  tunnelId: string
  peerId: string
  peerName?: string
  host: string
  port: number
  udp?: boolean
  role: 'host' | 'guest'
  state: string
  bytesUp: number
  bytesDown: number
  createdAt: number
  code?: string | null
}

export interface TunnelCodeRecord {
  id: string
  code: string
  host: string
  port: number
  udp?: boolean
  name?: string
  expiresAt: number
  expirationPreset: string
  maxUses: number
  uses: number
  expired?: boolean
}

interface TunnelsContextValue {
  tunnels: TunnelRecord[]
  codes: TunnelCodeRecord[]
  loading: boolean
  refresh: () => void
  createPairedTunnel: (params: { peerId: string; port: number; host?: string; name?: string; udp?: boolean }) => Promise<{ tunnelId: string }>
  acceptTunnel: (tunnelId: string, opts?: { localPort?: number; localHost?: string }) => Promise<void>
  rejectTunnel: (tunnelId: string, reason?: string) => Promise<void>
  closeTunnel: (tunnelId: string) => Promise<void>
  createCode: (params: { port: number; host?: string; name?: string; udp?: boolean; expirationPreset?: string; maxUses?: number }) => Promise<TunnelCodeRecord>
  joinCode: (code: string) => Promise<void>
  cancelCode: (codeOrId: string) => Promise<void>
}

const TunnelsContext = createContext<TunnelsContextValue | null>(null)

export function TunnelsProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const [tunnels, setTunnels] = useState<TunnelRecord[]>([])
  const [codes, setCodes] = useState<TunnelCodeRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(() => {
    call((METHODS as unknown as Record<string, string>).TUNNEL_LIST || 'tunnel.list', null)
      .then((res) => setTunnels(((res as TunnelRecord[]) || [])))
      .catch(() => {})
    call((METHODS as unknown as Record<string, string>).TUNNEL_LIST_CODES || 'tunnel.listCodes', null)
      .then((res) => setCodes(((res as TunnelCodeRecord[]) || [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const refresh = useCallback(() => fetchAll(), [fetchAll])

  useEffect(() => {
    fetchAll()
    const events = [
      (EVENTS as unknown as Record<string, string>).TUNNEL_OFFER || 'tunnel.offer',
      (EVENTS as unknown as Record<string, string>).TUNNEL_OPENED || 'tunnel.opened',
      (EVENTS as unknown as Record<string, string>).TUNNEL_CLOSED || 'tunnel.closed',
      (EVENTS as unknown as Record<string, string>).TUNNEL_ERROR || 'tunnel.error'
    ]
    const unsubs = events.map((e) => on(e, () => setTimeout(fetchAll, 300)))
    const unsubOffer = on((EVENTS as unknown as Record<string, string>).TUNNEL_OFFER || 'tunnel.offer', (data: unknown) => {
      const d = data as { tunnelId?: string; peerId?: string; port?: number } | null
      if (d && d.tunnelId) {
        const msg = d.port ? `Port ${d.port} shared with you` : 'New tunnel offer'
        toast.success('Tunnel Offer', msg)
      }
    })
    return () => { unsubs.forEach((u) => u()); unsubOffer() }
  }, [fetchAll, toast])

  const createPairedTunnel = useCallback(async (params: { peerId: string; port: number; host?: string; name?: string; udp?: boolean }) => {
    return (await call((METHODS as unknown as Record<string, string>).TUNNEL_CREATE || 'tunnel.create', params)) as { tunnelId: string }
  }, [])
  const acceptTunnel = useCallback(async (tunnelId: string, opts?: { localPort?: number; localHost?: string }) => {
    await call((METHODS as unknown as Record<string, string>).TUNNEL_ACCEPT || 'tunnel.accept', { tunnelId, ...opts })
  }, [])
  const rejectTunnel = useCallback(async (tunnelId: string, reason?: string) => {
    await call((METHODS as unknown as Record<string, string>).TUNNEL_REJECT || 'tunnel.reject', { tunnelId, reason })
  }, [])
  const closeTunnel = useCallback(async (tunnelId: string) => {
    await call((METHODS as unknown as Record<string, string>).TUNNEL_CLOSE || 'tunnel.close', { tunnelId })
  }, [])
  const createCode = useCallback(async (params: { port: number; host?: string; name?: string; udp?: boolean; expirationPreset?: string; maxUses?: number }) => {
    const res = (await call((METHODS as unknown as Record<string, string>).TUNNEL_CREATE_CODE || 'tunnel.createCode', params)) as TunnelCodeRecord
    fetchAll()
    return res
  }, [fetchAll])
  const joinCode = useCallback(async (code: string) => {
    await call((METHODS as unknown as Record<string, string>).TUNNEL_JOIN_CODE || 'tunnel.joinCode', { code })
  }, [])
  const cancelCode = useCallback(async (codeOrId: string) => {
    await call((METHODS as unknown as Record<string, string>).TUNNEL_CANCEL_CODE || 'tunnel.cancelCode', { code: codeOrId })
    fetchAll()
  }, [fetchAll])

  return (
    <TunnelsContext.Provider value={{ tunnels, codes, loading, refresh, createPairedTunnel, acceptTunnel, rejectTunnel, closeTunnel, createCode, joinCode, cancelCode }}>
      {children}
    </TunnelsContext.Provider>
  )
}

export function useTunnels() {
  const ctx = useContext(TunnelsContext)
  if (!ctx) throw new Error('useTunnels must be used inside TunnelsProvider')
  return ctx
}
