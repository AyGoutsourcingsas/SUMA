// ============================================================
// SUMA Platform — Servicio de Autenticación
// ============================================================
import { supabase } from './supabase';
import type { CompanyUser, Company, CompanyModule } from '@/types/domain';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentUser(): Promise<CompanyUser | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('company_users')
    .select('*')
    .eq('auth_id', user.id)
    .single();

  return data;
}

export async function getCurrentCompany(): Promise<Company | null> {
  const { data } = await supabase
    .from('companies')
    .select('*')
    .single();
  return data;
}

export async function getCompanyModules(): Promise<CompanyModule[]> {
  const { data } = await supabase
    .from('company_modules')
    .select('*')
    .order('module_id');
  return data ?? [];
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/portal/reset-password`,
  });
  if (error) throw error;
}
