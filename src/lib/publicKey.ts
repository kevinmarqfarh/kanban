// This checks key type only. Supabase validates authenticity and user permissions.
export function isPublicKey(key: string | undefined): boolean {
  if (!key || key.startsWith('sb_secret_')) return false
  if (key.startsWith('sb_publishable_')) return true
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'anon'
  } catch {
    return false
  }
}

export function assertPublicBuildKey(key: string | undefined): void {
  // A browser-side guard is too late: Vite would already have bundled the secret.
  if (key?.trim() && !isPublicKey(key.trim())) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable/anon key. Build stopped before exposing a server secret.')
  }
}
