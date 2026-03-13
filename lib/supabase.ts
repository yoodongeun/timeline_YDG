import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yhbdclfgfxsqyzbnpev.supabase.co' // 오타 방지를 위해 새로 복사
const supabaseAnonKey = 'sb_publishable_W903JHm_dZ_KSjywaMgS0g_ASqEvq9C' // 키값도 다시 확인

export const supabase = createClient(supabaseUrl, supabaseAnonKey)