import { createClient } from '@supabase/supabase-js'

// 주소 끝에 / 가 절대 없어야 합니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhbdclfgfxsqyzbnpev.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_W903JHm_dZ_KSjywaMgS0g_ASqEvq9C'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)