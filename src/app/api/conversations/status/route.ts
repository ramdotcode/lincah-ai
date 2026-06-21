import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'ID and status are required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('conversations')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('Status update error:', error);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
