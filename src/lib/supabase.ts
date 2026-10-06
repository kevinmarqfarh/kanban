import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rucwlpzrumxejvhwazat.supabase.co'
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Never accept a server secret in a variable that Vite exposes to the browser.
function isPublicKey(key: string | undefined): boolean {
  if (!key || key.startsWith('sb_secret_')) return false
  if (key.startsWith('sb_publishable_')) return true
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'anon'
  } catch {
    return false
  }
}

export const supabaseConfigured = isPublicKey(publishableKey)
export const supabaseConfigurationError = 'Molnsynk är inte ansluten ännu. Din tavla sparas lokalt på den här enheten.'

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }) },
    })
  : null
