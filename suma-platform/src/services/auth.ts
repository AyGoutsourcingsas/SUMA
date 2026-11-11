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

/**
 * Empresa del usuario autenticado.
 * - Usuario normal: su empresa (via company_users.company_id).
 * - Superadmin: puede no tener empresa propia; devuelve null sin romper
 *   (el superadmin elige una "empresa activa" en la UI).
 */
export async function getCurrentCompany(): Promise<Company | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1) empresa asignada al usuario en company_users
  const { data: cu } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (cu?.company_id) {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('id', cu.company_id)
      .maybeSingle();
    return data ?? null;
  }

  // 2) sin empresa asignada (típico superadmin): no romper.
  return null;
}

/** Lista de empresas visibles (para el selector del superadmin). */
export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('name');
  if (error) return [];
  return data ?? [];
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
