import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null

if (!hasSupabaseConfig && import.meta.env.DEV) {
  console.warn('Supabase config missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export async function ensureSupabaseSession() {
  if (!supabase) {
    return null
  }

  const sessionResult = await supabase.auth.getSession()
  const existingSession = sessionResult?.data?.session ?? null
  if (existingSession) {
    return existingSession
  }

  const anonymousResult = await supabase.auth.signInAnonymously()
  if (anonymousResult.error) {
    throw new Error(
      'Supabase auth session is missing. Enable Anonymous sign-ins in Supabase Auth > Providers, then retry upload.',
    )
  }

  return anonymousResult?.data?.session ?? null
}

export { supabase, hasSupabaseConfig }
