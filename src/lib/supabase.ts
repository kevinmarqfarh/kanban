import { createClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from './cloud'
import { isPublicKey } from './publicKey'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rucwlpzrumxejvhwazat.supabase.co'
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseConfigured = isPublicKey(publishableKey)
export const supabaseConfigurationError = 'Molnsynk är inte ansluten ännu. Din tavla sparas lokalt på den här enheten.'

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      // AbortSignal.timeout does not exist on iPadOS 15 (Safari 15); fetchWithTimeout works everywhere.
      global: { fetch: (input, init) => fetchWithTimeout(input, init) },
    })
  : null
