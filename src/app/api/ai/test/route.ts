import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/ai';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    let { data: { user } } = await supabase.auth.getUser();
    
    // Development Bypass: Jika session tidak terbaca, gunakan user pertama dari database
    if (!user) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        if (users && users.users.length > 0) user = users.users[0] as any;
    }

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { systemPrompt, history, message, transferCondition } = await req.json();

    const result = await processMessage(
      systemPrompt,
      history || [],
      message,
      transferCondition || ''
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('AI Test Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
