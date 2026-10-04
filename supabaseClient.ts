import { createClient } from '@supabase/supabase-js'

// Read from environment variables - never hard-code credentials
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables are not fully configured. ' +
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_key must be set.'
  )
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!)