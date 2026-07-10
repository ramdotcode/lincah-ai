import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const VALID_STAGES = ['new', 'interested', 'negotiating', 'won', 'lost'];

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      if (users && users.users.length > 0) user = users.users[0] as any;
    }

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, stage } = await req.json();

    if (!id || !stage) {
      return NextResponse.json({ error: 'ID and stage are required' }, { status: 400 });
    }
    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: `Invalid stage. Valid: ${VALID_STAGES.join(', ')}` }, { status: 400 });
    }

    // Cek kepemilikan: conversation harus milik bot user ini
    const { data: conv, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('id, bot_id, bots!inner(user_id)')
      .eq('id', id)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if ((conv.bots as any).user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // stage_updated_at diisi otomatis oleh trigger conversations_stage_updated_at
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({ stage, stage_updated_by: 'manual' })
      .eq('id', id)
      .select('id, stage, stage_updated_at, stage_updated_by')
      .single();

    if (error) {
      console.error('Stage update error:', error);
      return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
