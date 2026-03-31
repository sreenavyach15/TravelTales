import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null

if (!hasSupabaseConfig && import.meta.env.DEV) {
  console.warn('Supabase config missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export { supabase, hasSupabaseConfig }
