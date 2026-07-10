import { supabaseAdmin } from './supabase';

export type UserRole = 'admin' | 'owner' | 'agent';

export async function getUserRole(userId: string): Promise<UserRole | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data.role as UserRole;
}

export async function isAdmin(userId: string): Promise<boolean> {
  return (await getUserRole(userId)) === 'admin';
}
