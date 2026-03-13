import { createClient } from '@supabase/supabase-js'

// 끝에 'i'를 뺀 정확한 주소입니다.
const supabaseUrl = 'https://yhbdclfgfxsqyzbnpev.supabase.co' 

// ★ 이 키값은 Supabase Dashboard -> Settings -> API -> anon public 키를 
// 그대로 복사해서 따옴표 안에 넣으셔야 합니다. (지금은 예시입니다)
const supabaseAnonKey = 'your-actual-anon-key-here' 

export const supabase = createClient(supabaseUrl, supabaseAnonKey)