export class RequestError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

const MAX_BODY_BYTES = 4096
export async function readBody(request: Request): Promise<{ action: 'public-key' | 'dispatch' | 'test'; endpoint?: string }> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new RequestError('Request body too large', 413)
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new RequestError('Expected application/json', 415)
  if (!request.body) throw new RequestError('Invalid JSON body', 400)
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0, raw = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      // Enforce the actual stream size; Content-Length can be absent or false.
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {})
        throw new RequestError('Request body too large', 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
  } catch (failure) {
    if (failure instanceof RequestError) throw failure
    throw new RequestError('Invalid JSON body', 400)
  } finally { reader.releaseLock() }
  let body
  try { body = JSON.parse(raw) } catch { throw new RequestError('Invalid JSON body', 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !['public-key', 'dispatch', 'test'].includes(body.action)) throw new RequestError('Unknown action', 400)
  if (body.action === 'test' && !pushEndpoint(body.endpoint)) throw new RequestError('Invalid push endpoint', 400)
  return body
}

export function pushEndpoint(value: unknown): string | null {
  // Only browser push providers may receive server requests. Validate stored rows too:
  // owners can write subscriptions directly through the Data API.
  if (typeof value !== 'string' || value.length > 2048 || !/^[\x21-\x7e]+$/.test(value) || !/^https:\/\/[a-z0-9.-]+(?::443)?\/[^\\#]*$/i.test(value)) return null
  try {
    const endpoint = new URL(value)
    const host = endpoint.hostname
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
      || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
    if (!allowed || endpoint.username || endpoint.password || endpoint.port || endpoint.hash) return null
    return endpoint.href
  } catch { return null }
}

export function validPushKeys(device: { p256dh: unknown; auth_key: unknown }): boolean {
  return typeof device.p256dh === 'string' && /^[A-Za-z0-9_-]{87}=?$/.test(device.p256dh)
    && typeof device.auth_key === 'string' && /^[A-Za-z0-9_-]{22}(?:==)?$/.test(device.auth_key)
}
