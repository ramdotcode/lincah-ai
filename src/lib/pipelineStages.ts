// Server helper pipeline stage (CRM Fase 7). Fail-safe: bila tabel belum ada
// (pre-migrasi 0024) atau error, jatuh ke DEFAULT_STAGES → perilaku lama.

import { supabaseAdmin } from '@/lib/supabase';
import { cached, cacheKeys } from '@/lib/cache';
import { DEFAULT_STAGES, PipelineStageDef } from '@/lib/stageConstants';

// Ambil stage milik akun; auto-seed default bila kosong. Tidak pernah throw.
export async function getStagesForUser(userId: string): Promise<PipelineStageDef[]> {
  return cached(cacheKeys.stages(userId), async () => {
    const { data, error } = await supabaseAdmin
      .from('pipeline_stages')
      .select('key, label, color, position, type')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (error) return DEFAULT_STAGES; // tabel belum ada / error → default
    if (!data || data.length === 0) return DEFAULT_STAGES;
    return data as PipelineStageDef[];
  });
}

// Buat 5 stage default untuk akun bila belum punya satu pun. Dipakai route GET.
export async function ensureStagesForUser(userId: string): Promise<PipelineStageDef[]> {
  const { data, error } = await supabaseAdmin
    .from('pipeline_stages')
    .select('key, label, color, position, type')
    .eq('user_id', userId)
    .order('position', { ascending: true });

  if (error) return DEFAULT_STAGES; // tabel belum ada → jangan paksa
  if (data && data.length > 0) return data as PipelineStageDef[];

  const rows = DEFAULT_STAGES.map(s => ({ ...s, user_id: userId }));
  const { data: seeded } = await supabaseAdmin
    .from('pipeline_stages')
    .upsert(rows, { onConflict: 'user_id,key', ignoreDuplicates: true })
    .select('key, label, color, position, type');
  return (seeded as PipelineStageDef[]) || DEFAULT_STAGES;
}
