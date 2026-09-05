// Push-to-talk voice for Watch Party. Capture + playback over the party's
// signaling channel: mono 16kHz s16le PCM, base64-wrapped, ~100ms chunks.
// Playback keeps a small jitter buffer and lowers the video volume (ducking)
// while someone is talking — the UI wires that through onVoiceActivity.

const SAMPLE_RATE = 16000
const CHUNK_SAMPLES = 1600 // 100ms at 16kHz
const JITTER_BUFFER_S = 0.12

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 0x8000
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export class WatchVoice {
  // Local mic capture
  private ctx: AudioContext | null = null
  private micStream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private captureTail = new Float32Array(0)
  private seq = 0
  private sending = false

  // Remote playback
  private playCtx: AudioContext | null = null
  private nextPlayTime = 0

  // UI callbacks
  onVoiceActivity: ((active: boolean) => void) | null = null
  private activityTimer: ReturnType<typeof setTimeout> | null = null

  async startCapture(send: (audioB64: string, durationMs: number, seq: number) => void): Promise<void> {
    if (this.ctx) return
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    const source = ctx.createMediaStreamSource(micStream)
    const processor = ctx.createScriptProcessor(2048, 1, 1)
    this.captureTail = new Float32Array(0)

    processor.onaudioprocess = (e) => {
      if (!this.sending) return
      const chunk = e.inputBuffer.getChannelData(0)
      // Accumulate into ~100ms chunks regardless of the hardware callback size.
      const merged = new Float32Array(this.captureTail.length + chunk.length)
      merged.set(this.captureTail)
      merged.set(chunk, this.captureTail.length)
      if (merged.length < CHUNK_SAMPLES) {
        this.captureTail = merged
        return
      }
      const take = merged.subarray(0, CHUNK_SAMPLES)
      this.captureTail = merged.slice(CHUNK_SAMPLES)
      const pcm = floatToInt16(take)
      this.seq += 1
      send(bytesToBase64(new Uint8Array(pcm.buffer)), 100, this.seq)
    }

    source.connect(processor)
    // Muted destination: route through the graph without echoing to speakers.
    const silent = ctx.createGain()
    silent.gain.value = 0
    processor.connect(silent)
    silent.connect(ctx.destination)

    this.ctx = ctx
    this.micStream = micStream
    this.source = source
    this.processor = processor
  }

  setSending(sending: boolean) {
    this.sending = sending
    if (!sending) {
      this.captureTail = new Float32Array(0)
      this.seq = 0
    }
  }

  isCapturing(): boolean {
    return !!this.ctx
  }

  async playChunk(audioB64: string): Promise<void> {
    try {
      if (!this.playCtx) {
        this.playCtx = new AudioContext()
        this.nextPlayTime = 0
      }
      if (this.playCtx.state === 'suspended') await this.playCtx.resume()
      const bytes = base64ToBytes(audioB64)
      const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      if (pcm.length === 0) return
      const buffer = this.playCtx.createBuffer(1, pcm.length, SAMPLE_RATE)
      buffer.copyToChannel(new Float32Array(int16ToFloat(pcm)), 0)
      const src = this.playCtx.createBufferSource()
      src.buffer = buffer
      const now = this.playCtx.currentTime
      this.nextPlayTime = Math.max(this.nextPlayTime, now + JITTER_BUFFER_S)
      src.start(this.nextPlayTime)
      this.nextPlayTime += buffer.duration
      if (this.nextPlayTime < now) this.nextPlayTime = 0

      if (this.onVoiceActivity) {
        this.onVoiceActivity(true)
        if (this.activityTimer) clearTimeout(this.activityTimer)
        this.activityTimer = setTimeout(() => this.onVoiceActivity?.(false), 600)
      }
    } catch {
      // Ignore malformed chunks.
    }
  }

  destroy() {
    this.sending = false
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
      this.micStream?.getTracks().forEach((t) => t.stop())
      this.ctx?.close()
    } catch {}
    this.processor = null
    this.source = null
    this.micStream = null
    this.ctx = null
    try {
      this.playCtx?.close()
    } catch {}
    this.playCtx = null
    if (this.activityTimer) clearTimeout(this.activityTimer)
    this.activityTimer = null
    this.onVoiceActivity = null
  }
}
