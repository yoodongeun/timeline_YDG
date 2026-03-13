import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yhbdclfgfxzsqyzbnpev.supabase.co'
const supabaseAnonKey = 'sb_publishable_W903JHm_dZ_KSjywaMgS0g_ASqEvq9C'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)