// Debug-logging gate (UI audit F21). All transport/IPC chatter is silent by
// default; it prints only when the user opts in via localStorage
// 'meshdrop.debug' = '1' or a `?debug=1` URL parameter. Even when enabled,
// secrets never reach the console: pairing codes (MD-…), drop codes
// (DROP-…/PARTY-…), 64-hex keys and `?t=` session tokens are masked here.

let debugEnabled: boolean | null = null

export function isDebugLoggingEnabled(): boolean {
  if (debugEnabled === null) {
    try {
      debugEnabled =
        typeof window !== 'undefined' &&
        (window.localStorage.getItem('meshdrop.debug') === '1' ||
          window.location.search.includes('debug=1'))
    } catch {
      debugEnabled = false
    }
  }
  return debugEnabled
}

// JSON keys whose values are secrets and must never be echoed.
const SENSITIVE_KEY = /(?:code|token|secret|password|privatekey)$/i

const SECRET_TEXT_PATTERNS: RegExp[] = [
  /\bMD-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}\b/gi, // pairing code, e.g. MD-XXXX-XXXX-XXXX-XXXX
  /\bDROP-GRP-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi, // group drop code
  /\bDROP-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi, // one-time drop code
  /\bPARTY-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi, // watch-party room code
  /\b[0-9a-fA-F]{64}\b/g, // raw 64-hex identity keys / hashes
  /[?&]t=[^&\s"'<>]{6,}/g // session token in a URL (?t=… / &t=…)
]

function redactText(input: string): string {
  let out = input
  for (const re of SECRET_TEXT_PATTERNS) out = out.replace(re, '••••')
  return out
}

// Render an IPC payload as readable, redacted text. Passing the raw object as
// a console.log arg renders as "[object Object]" when the main process
// forwards renderer logs to the terminal (Electron's console-message event
// carries only a flat string).
export function formatLogArg(v: unknown): string {
  if (v === undefined || v === null) return String(v)
  if (typeof v === 'object') {
    try {
      return redactText(
        JSON.stringify(v, (_key: string, value: unknown) =>
          SENSITIVE_KEY.test(_key) ? '••••' : value
        )
      )
    } catch {
      return String(v)
    }
  }
  return redactText(String(v))
}

/** console.log gated behind the debug flag and scrubbed for secrets. */
export function debugLog(...args: unknown[]): void {
  if (!isDebugLoggingEnabled()) return
  console.log(...args.map((a) => (typeof a === 'string' ? redactText(a) : formatLogArg(a))))
}
