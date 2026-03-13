import { createClient } from '@supabase/supabase-js'

// 끝에 'i'를 뺀 정확한 주소입니다.
const supabaseUrl = 'https://yhbdclfgfxzsqyzbnpev.supabase.co' // 사용자가 주신 주소로 정확히 수정
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloYmRjbGZneGZzcXl6Ym5wZXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODIzNjk3NjAsImV4cCI6MjAwNzk0NTc2MH0.U8A-' // URL이 바뀌면 이 키값도 Supabase 대시보드에서 새로 복사해야 할 수 있습니다.
// 그대로 복사해서 따옴표 안에 넣으셔야 합니다. (지금은 예시입니다)
const supabaseAnonKey = 'your-actual-anon-key-here'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)