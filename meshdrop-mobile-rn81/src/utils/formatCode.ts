/**
 * Auto-formatting input mask for code entry fields (Pairing & DROP codes).
 * Automatically inserts hyphens in real-time as the user types or pastes.
 */
export function formatCodeInput(text: string): string {
  if (!text) return ''

  // Clean out any non-alphanumeric chars
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!raw) return ''

  // MD- pairing code format: MD-XXXX-XXXX-XXXX-XXXX
  if (raw.startsWith('MD')) {
    const rest = raw.slice(2)
    const chunks = rest.match(/.{1,4}/g) || []
    return ['MD', ...chunks].join('-')
  }

  // DROP- share code format: DROP-XXXX-XXXX
  if (raw.startsWith('DROP')) {
    const rest = raw.slice(4)
    const chunks = rest.match(/.{1,4}/g) || []
    return ['DROP', ...chunks].join('-')
  }

  // Default 4-character chunking (e.g. XXXX-XXXX-XXXX)
  const chunks = raw.match(/.{1,4}/g) || []
  return chunks.join('-')
}
