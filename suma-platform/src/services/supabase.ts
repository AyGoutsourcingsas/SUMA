// ============================================================
// SUMA Platform — Supabase client
// ============================================================
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Fallback seguro para desarrollo local sin credenciales configuradas
const DEFAULT_URL = 'https://muawnpbdpnyobifycmec.supabase.co';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder_key';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseAnonKey !== DEFAULT_ANON
);

if (!isSupabaseConfigured) {
  console.info(
    '[SUMA] Supabase corriendo con configuración básica/demo. ' +
    'Configura VITE_SUPABASE_ANON_KEY en tu .env para conectar con tu proyecto en producción.'
  );
}

export const supabase = createClient(
  supabaseUrl || DEFAULT_URL,
  supabaseAnonKey || DEFAULT_ANON,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

export default supabase;
