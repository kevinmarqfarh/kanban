/** Keep large image payloads out of synchronous Web Storage. Cloud/export data stays inline. */
const DATABASE = 'forma-image-assets-v1'
const STORE = 'images'
const REFERENCE = 'forma-image:v1:'
const images = new Map<string, string>()
const ids = new Map<string, string>()
let database: Promise<IDBDatabase> | null = null
let queue: Promise<unknown> = Promise.resolve()

export class MissingImageAsset extends Error {}

function open(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Bildlagring är inte tillgänglig.')); return }
    let settled = false
    const fail = (error: unknown) => { if (settled) return; settled = true; clearTimeout(timer); reject(error) }
    const timer = setTimeout(() => fail(new Error('Bildlagringen svarade inte. Försök igen.')), 5000)
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE) }
    request.onerror = () => fail(request.error)
    request.onblocked = () => fail(new Error('Stäng andra Forma-flikar och försök igen.'))
    request.onsuccess = () => {
      const db = request.result
      if (settled) { db.close(); return }
      settled = true; clearTimeout(timer)
      db.onversionchange = () => { db.close(); database = null }
      resolve(db)
    }
  }).catch(error => { database = null; throw error })
  return database
}

export async function refreshImageAssets(): Promise<void> {
  // Read only referenced, previously unseen assets, rather than every historic upload.
  const needed = new Set<string>()
  const references = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'image' && typeof entry === 'string' && entry.startsWith(REFERENCE) && !images.has(entry)) needed.add(entry)
      else if (entry && typeof entry === 'object') references(entry)
    }
  }
  for (const key of Object.keys(localStorage).filter(key => key.startsWith('forma:workspace:v1:'))) {
    try { references(JSON.parse(localStorage.getItem(key) ?? 'null')) } catch { /* Cache validation handles malformed metadata. */ }
  }
  if (!needed.size) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly')
    const loaded: [string, string][] = []
    for (const id of needed) {
      const request = transaction.objectStore(STORE).get(id)
      request.onsuccess = () => { if (typeof request.result === 'string') loaded.push([id, request.result]) }
    }
    transaction.oncomplete = () => { for (const [id, value] of loaded) { images.set(id, value); ids.set(value, id) }; resolve() }
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Bildlagringen kunde inte läsas.'))
  })
}

function collect(value: unknown, found: Set<string>): void {
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'image' && typeof entry === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(entry) && !ids.has(entry)) found.add(entry)
    else if (entry && typeof entry === 'object') collect(entry, found)
  }
}

/** Resolves true only after the IDB transaction commits. Never discard inline data on failure. */
export function prepareImageAssets(value: unknown): Promise<boolean> {
  const operation = queue.then(async () => {
    const found = new Set<string>(); collect(value, found)
    if (!found.size) return false
    const db = await open()
    const entries = [...found].map(image => [`${REFERENCE}${crypto.getRandomValues(new Uint32Array(4)).join('-')}`, image] as const)
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      for (const [id, image] of entries) transaction.objectStore(STORE).put(image, id)
      transaction.oncomplete = () => { for (const [id, image] of entries) { images.set(id, image); ids.set(image, id) }; resolve() }
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Bilden kunde inte sparas.'))
    })
    return true
  })
  queue = operation.catch(() => {})
  return operation
}

export function encodeImageCache(value: unknown): string {
  return JSON.stringify(value, (key, entry: unknown) => key === 'image' && typeof entry === 'string' ? ids.get(entry) ?? entry : entry)
}

export function decodeImageCache(raw: string): unknown {
  return JSON.parse(raw, (key, entry: unknown) => {
    if (key !== 'image' || typeof entry !== 'string' || !entry.startsWith(REFERENCE)) return entry
    const image = images.get(entry)
    if (!image) throw new MissingImageAsset('En sparad bild kunde inte läsas. Originalet har bevarats. Försök igen utan att rensa webbplatsdata.')
    return image
  })
}

/** Migrate old inline caches only after every referenced image is durable. Preserve concurrent writes. */
export async function initializeImageStorage(): Promise<void> {
  try {
    await refreshImageAssets()
    const keys = Object.keys(localStorage).filter(key => key.startsWith('forma:workspace:v1:'))
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const value = decodeImageCache(raw)
        await prepareImageAssets(value)
        const encoded = encodeImageCache(value)
        if (encoded !== raw && localStorage.getItem(key) === raw) localStorage.setItem(key, encoded)
      } catch { /* Preserve the original cache if IDB, decoding or migration fails. */ }
    }
  } catch { /* Inline caches remain usable in browsers that block IndexedDB. */ }
}
