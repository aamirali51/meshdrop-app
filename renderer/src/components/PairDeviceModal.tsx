import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Copy,
  Check,
  Link2,
  ShieldCheck,
  Camera,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react'
import QRCode from 'qrcode'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { useDevices } from '@/hooks/useDevices'
import { useShares } from '@/hooks/useShares'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/Modal'
import * as ipc from '@/lib/ipc'
import { EVENTS } from '@/types/protocol'
import type { Device } from '@/types'

// Connection lifecycle: idle -> connecting -> success | error
type PairStatus = 'idle' | 'connecting' | 'success' | 'error'

// Fallback safety timeout while waiting for the pairing completion events.
// 30s matches the worker's pairing watchdog and the IPC request timeout; a
// shorter window fired before slow (relayed/WAN) handshakes could complete.
const SAFETY_TIMEOUT_MS = 30000 // no completion event within this window => error
const SUCCESS_HOLD_MS = 800 // how long the success screen stays visible before auto-close

interface PairDeviceModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: 'myCode' | 'pair' | 'scan'
}

export function PairDeviceModal({ isOpen, onClose, defaultTab = 'myCode' }: PairDeviceModalProps) {
  const { getPairingCode, pairWithCode } = useDevices()
  const { claimFileWithCode } = useShares()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'myCode' | 'pair' | 'scan'>(defaultTab)
  const [myCode, setMyCode] = useState<string>('')
  const [inputCode, setInputCode] = useState<string>('')
  const [copied, setCopied] = useState<boolean>(false)
  // What the "Enter Code" input is for — pairing a device (MD-) vs claiming a
  // one-time file share (DROP-). Two intents, one input, no confusion.
  const [pairMode, setPairMode] = useState<'pair' | 'claim'>('pair')

  // Lifecycle state machine (idle / connecting / success / error).
  const [status, setStatus] = useState<PairStatus>('idle')
  const [progressText, setProgressText] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successName, setSuccessName] = useState<string | null>(null)

  // Refs keep the latest values reachable from event handlers and timers
  // without re-subscribing or re-arming anything on every render.
  const statusRef = useRef<PairStatus>('idle')
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCloseRef = useRef(onClose)
  const toastRef = useRef(toast)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  // Keep the status ref and state in lockstep (synchronous for handler guards).
  const transitionTo = useCallback((next: PairStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const clearTimers = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current)
      safetyTimerRef.current = null
    }
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
  }, [])

  // Back to a fresh, fully editable form.
  const resetToIdle = useCallback(() => {
    clearTimers()
    setProgressText(null)
    setErrorMsg(null)
    setSuccessName(null)
    transitionTo('idle')
  }, [clearTimers, transitionTo])

  // Enter 'connecting': disable inputs, arm the 15s safety timeout.
  const startPairing = useCallback(
    (text: string) => {
      clearTimers()
      setErrorMsg(null)
      setSuccessName(null)
      setProgressText(text)
      transitionTo('connecting')
      safetyTimerRef.current = setTimeout(() => {
        safetyTimerRef.current = null
        if (statusRef.current !== 'connecting') return
        setErrorMsg('Connection timed out. Please ensure the target peer is online.')
        transitionTo('error')
      }, SAFETY_TIMEOUT_MS)
    },
    [clearTimers, transitionTo]
  )

  // Success: drop the safety timer, show the confirmation screen, auto-close.
  const finishSuccess = useCallback(
    (dev?: Device | null) => {
      if (statusRef.current !== 'connecting') return
      clearTimers()
      setSuccessName(dev?.name || null)
      transitionTo('success')
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null
        onCloseRef.current()
      }, SUCCESS_HOLD_MS)
    },
    [clearTimers, transitionTo]
  )

  const failPairing = useCallback(
    (msg: string) => {
      clearTimers()
      setErrorMsg(msg)
      transitionTo('error')
    },
    [clearTimers, transitionTo]
  )

  // Shared submit path: DROP codes succeed when the claim resolves; MD codes
  // only register here — completion arrives later as a worker event.
  const submitCode = useCallback(
    async (clean: string) => {
      if (statusRef.current === 'connecting') return
      if (clean.startsWith('DROP-')) {
        startPairing('Claiming file share...')
        try {
          await claimFileWithCode(clean)
          finishSuccess(null)
        } catch (err) {
          failPairing(err instanceof Error ? err.message : 'Connection failed')
        }
      } else {
        startPairing('Searching for the device and pairing securely...')
        try {
          await pairWithCode(clean)
          setProgressText('Exchanging handshake and authenticating...')
        } catch (err) {
          failPairing(err instanceof Error ? err.message : 'Connection failed')
        }
      }
    },
    [claimFileWithCode, pairWithCode, startPairing, finishSuccess, failPairing]
  )

  // Open/mount lifecycle: reset state, fetch my code, subscribe to completion
  // events. Every listener and timer is torn down on close/unmount.
  useEffect(() => {
    if (!isOpen) return

    resetToIdle()
    setActiveTab(defaultTab)
    setInputCode('')
    setPairMode('pair')
    getPairingCode()
      .then((res) => {
        if (res && res.code) {
          setMyCode(res.code)
        }
      })
      .catch((err) => {
        console.error('Failed to get pairing code:', err)
      })

    const handlePaired = (data: unknown) => {
      if (statusRef.current !== 'connecting') return
      const dev = data as Device
      if (dev && dev.id && dev.name && dev.name !== 'Connecting...') {
        finishSuccess(dev)
        toastRef.current.success(
          'Device Paired!',
          `Connected with ${dev.name} (${dev.os || 'Remote Peer'})`
        )
      }
    }
    const unsub1 = ipc.on(EVENTS.DEVICE_PAIRED, handlePaired)
    const unsub2 = ipc.on(EVENTS.PEER_CONNECTED, handlePaired)
    const unsub3 = ipc.on(EVENTS.DEVICE_UPDATED, handlePaired)

    return () => {
      unsub1()
      unsub2()
      unsub3()
      clearTimers()
    }
  }, [isOpen, defaultTab, getPairingCode, resetToIdle, finishSuccess, clearTimers])

  // Render QR Code onto the canvas whenever myCode is available and activeTab is 'myCode'
  useEffect(() => {
    if (isOpen && activeTab === 'myCode' && myCode && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        myCode,
        {
          width: 160,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        },
        (err) => {
          if (err) console.error('Failed to generate QR code canvas:', err)
        }
      )
    }
  }, [isOpen, activeTab, myCode])

  // Camera QR Code scanner lifecycle
  useEffect(() => {
    if (isOpen && activeTab === 'scan') {
      const timer = setTimeout(() => {
        const scannerElement = document.getElementById('qr-reader')
        if (scannerElement && !scannerRef.current) {
          try {
            const scanner = new Html5QrcodeScanner(
              'qr-reader',
              { fps: 10, qrbox: { width: 220, height: 220 } },
              false
            )
            scanner.render(
              async (decodedText) => {
                // Accept either a raw MD-/DROP- code or a JSON envelope.
                let clean = decodedText.trim().toUpperCase()
                try {
                  const parsed = JSON.parse(decodedText)
                  if (parsed && typeof parsed.code === 'string') {
                    clean = parsed.code.trim().toUpperCase()
                  }
                } catch {}
                setInputCode(clean)
                scanner.clear().catch(() => {})
                scannerRef.current = null
                setActiveTab('pair')
                await submitCode(clean)
              },
              () => {}
            )
            scannerRef.current = scanner
          } catch (err) {
            console.error('QR Scanner init error:', err)
          }
        }
      }, 100)

      return () => {
        clearTimeout(timer)
        if (scannerRef.current) {
          scannerRef.current.clear().catch(() => {})
          scannerRef.current = null
        }
      }
    }
  }, [isOpen, activeTab, submitCode])

  const handleCopy = () => {
    if (!myCode) return
    navigator.clipboard.writeText(myCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = inputCode.trim().toUpperCase()
    if (!clean || statusRef.current === 'connecting') return
    await submitCode(clean)
  }

  // Shared lifecycle status panel rendered inside the active tab.
  const renderStatusPanel = () => {
    if (status === 'connecting') {
      return (
        <div className='flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs font-semibold text-primary'>
          <span className='h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary' />
          <span>{progressText || 'Exchanging handshake and authenticating...'}</span>
        </div>
      )
    }
    if (status === 'success') {
      return (
        <div className='flex flex-col items-center gap-2 rounded-xl border border-status-online/30 bg-status-online/15 p-4 text-center'>
          <div className='flex h-12 w-12 items-center justify-center rounded-full bg-status-online/20'>
            <CheckCircle2 className='h-7 w-7 text-status-online' />
          </div>
          <p className='text-xs font-bold text-foreground'>
            Successfully connected to {successName ? `"${successName}"` : 'the file share'}!
          </p>
          <p className='text-[10px] text-muted-foreground'>Closing automatically…</p>
        </div>
      )
    }
    if (status === 'error') {
      return (
        <div className='flex flex-col items-stretch gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3'>
          <div className='flex items-center gap-2 text-xs font-semibold text-destructive'>
            <XCircle className='h-4 w-4 shrink-0' />
            <span>{errorMsg || 'Connection failed'}</span>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='gap-1.5 self-start text-xs font-bold'
            onClick={resetToIdle}
          >
            <RefreshCw className='h-3.5 w-3.5' />
            Try Again
          </Button>
        </div>
      )
    }
    return null
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title='Pair a Device'
      description='Share a code with anyone. Pair the devices you own.'
    >
      <div className='flex gap-1 rounded-xl bg-muted p-1'>
        <button
          type='button'
          onClick={() => setActiveTab('myCode')}
          className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-all ${
            activeTab === 'myCode'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          My Code
        </button>
        <button
          type='button'
          onClick={() => setActiveTab('pair')}
          className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-all ${
            activeTab === 'pair'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Enter Code
        </button>
        <button
          type='button'
          onClick={() => setActiveTab('scan')}
          className={`flex items-center justify-center gap-1 flex-1 rounded-lg py-2 text-[11px] font-bold transition-all ${
            activeTab === 'scan'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Camera className='h-3 w-3 text-primary' />
          Scan QR
        </button>
      </div>

      {activeTab === 'myCode' && (
        <div className='flex flex-col items-center space-y-4 py-2'>
          <div className='flex h-44 w-44 shrink-0 items-center justify-center rounded-2xl border border-black/10 bg-white p-2 shadow-inner'>
            <canvas ref={canvasRef} className='h-full w-full rounded-lg object-contain' />
          </div>

          <div className='space-y-1 text-center'>
            <p className='text-xs text-muted-foreground'>Your Pairing Code</p>
            <div className='flex items-center justify-center gap-2'>
              <span className='font-mono text-xl font-bold tracking-wider text-foreground'>
                {myCode || 'MD-Loading...'}
              </span>
              <Button size='icon' variant='ghost' className='h-8 w-8' onClick={handleCopy}>
                {copied ? (
                  <Check className='h-4 w-4 text-status-online' />
                ) : (
                  <Copy className='h-4 w-4' />
                )}
              </Button>
            </div>
          </div>

          <p className='max-w-xs text-center text-[11px] text-muted-foreground'>
            Share this code or scan the QR Code to securely pair another device. Your pairing code
            is permanent — it only changes if you refresh it.
          </p>
        </div>
      )}

      {activeTab === 'pair' && (
        <form onSubmit={handlePairSubmit} className='space-y-4 py-2'>
          {/* Two intents, one input — the label/placeholder follow the choice. */}
          <div className='grid grid-cols-2 gap-1 rounded-lg bg-muted/30 p-1 text-[11px] font-bold'>
            <button
              type='button'
              onClick={() => {
                setPairMode('pair')
                setInputCode('')
              }}
              className={`rounded-md py-1.5 transition-all ${
                pairMode === 'pair'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pair a device
            </button>
            <button
              type='button'
              onClick={() => {
                setPairMode('claim')
                setInputCode('')
              }}
              className={`rounded-md py-1.5 transition-all ${
                pairMode === 'claim'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Receive a file
            </button>
          </div>

          <div className='space-y-2'>
            <label
              htmlFor='pair-code-input'
              className='flex items-center gap-1.5 text-xs font-medium text-foreground'
            >
              <Link2 className='h-3.5 w-3.5 text-primary' />
              {pairMode === 'pair'
                ? 'Enter the MD- code from your other device'
                : 'Enter a one-time DROP code'}
            </label>
            <Input
              id='pair-code-input'
              placeholder={
                pairMode === 'pair'
                  ? 'e.g. MD-ABCD-EFGH-JKLM-NPQR'
                  : 'e.g. DROP-4A82-9X1B'
              }
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              className='text-center font-mono text-sm uppercase tracking-wider'
              autoFocus
              disabled={status === 'connecting'}
            />
            <p className='text-[10px] text-muted-foreground'>
              {pairMode === 'pair'
                ? 'Pairs the device so you can send files and sync folders directly.'
                : 'Claims a file someone shared with a DROP code — no pairing needed.'}
            </p>
          </div>

          <Button
            type='submit'
            className='w-full font-bold'
            disabled={status === 'connecting' || !inputCode.trim()}
          >
            {status === 'connecting' ? (
              <>
                <span className='mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-hairline/30 border-t-white' />
                Connecting...
              </>
            ) : (
              <>
                <ShieldCheck className='mr-2 h-4 w-4' />
                {pairMode === 'pair' ? 'Pair Now' : 'Receive File'}
              </>
            )}
          </Button>

          {renderStatusPanel()}
        </form>
      )}

      {activeTab === 'scan' && (
        <div className='flex flex-col items-center space-y-3 py-2'>
          <div
            id='qr-reader'
            className='w-full overflow-hidden rounded-2xl border border-border/60 bg-black/40'
          />
          <p className='text-center text-[11px] text-muted-foreground'>
            Point your camera at a MeshDrop QR Code to pair or claim files automatically.
          </p>
          {renderStatusPanel()}
        </div>
      )}
    </Modal>
  )
}
