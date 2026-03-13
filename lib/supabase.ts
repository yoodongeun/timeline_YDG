import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yhbdclfgfxsqyzbnpevi.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloYmRjbGZneGZzcXl6Ym5wZXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODIzNjk3NjAsImV4cCI6MjAwNzk0NTc2MH0.U8A-'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)