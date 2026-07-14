import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, canAccessConversation } from '@/lib/apiAuth';

// Set/hapus perkiraan nilai deal sebuah lead (CRM Fase 9).
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, deal_value } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // null/'' → hapus nilai; selain itu harus angka >= 0
  let value: number | null = null;
  if (deal_value !== null && deal_value !== undefined && deal_value !== '') {
    const n = Number(deal_value);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'deal_value harus angka >= 0' }, { status: 400 });
    }
    value = Math.round(n);
  }

  if (!(await canAccessConversation(user.id, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update({ deal_value: value })
    .eq('id', id)
    .select('id, deal_value')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
