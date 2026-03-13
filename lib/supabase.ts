import { createClient } from '@supabase/supabase-js'

// 주소 끝에 / 가 절대 없어야 합니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yoodongeun.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloYmRjbGZneGZzcXl6Ym5wZXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODIzNjk3NjAsImV4cCI6MjAwNzk0NTc2MH0.U8A-' // Placeholder, user will provide if needed or env will override

export const supabase = createClient(supabaseUrl, supabaseAnonKey)