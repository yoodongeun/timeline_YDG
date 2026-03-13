import { createClient } from '@supabase/supabase-js'

// 매니저님이 복사하신 정확한 정보를 여기에 직접 넣습니다.
const supabaseUrl = 'https://yhbdclfgfxsqyzbnpev.supabase.co'
const supabaseAnonKey = 'sb_publishable_W903JHm_dZ_KSjywaMgS0g_ASqEvq9C'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)