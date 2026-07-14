import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, canAccessConversation } from '@/lib/apiAuth';

const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.subject?.trim()) {
    return NextResponse.json({ error: 'subject required' }, { status: 400 });
  }
  const priority = body.priority || 'normal';
  if (!TICKET_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
  }

  // Jika ticket dikaitkan ke percakapan, pastikan percakapan milik user
  if (body.conversation_id && !(await canAccessConversation(user.id, body.conversation_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      user_id: user.id,
      conversation_id: body.conversation_id || null,
      subject: body.subject.trim(),
      description: body.description?.trim() || null,
      customer_name: body.customer_name?.trim() || null,
      customer_contact: body.customer_contact?.trim() || null,
      priority,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, string> = {};
  if (body.status !== undefined) {
    if (!TICKET_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!TICKET_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
    }
    updates.priority = body.priority;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  // Pastikan ticket milik user
  const { data: ticket } = await supabaseAdmin
    .from('tickets')
    .select('id, user_id')
    .eq('id', body.id)
    .maybeSingle();

  if (!ticket || ticket.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
