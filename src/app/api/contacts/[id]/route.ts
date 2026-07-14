import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser } from '@/lib/apiAuth';

// Detail satu kontak: profil + semua percakapan lintas bot + tiket + order terkait.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Identitas kanal (Fase 6). Fail-open bila tabel belum ada → turunkan dari kolom primer.
  const { data: identityRows } = await supabaseAdmin
    .from('contact_identities')
    .select('platform, external_id')
    .eq('contact_id', id);
  let identities: Array<{ platform: string; external_id: string }> = identityRows || [];
  if (identities.length === 0 && contact.platform && contact.external_id) {
    identities = [{ platform: contact.platform, external_id: contact.external_id }];
  }

  // Semua percakapan kontak ini (lintas bot), tanpa history penuh agar ringan
  const { data: conversations } = await supabaseAdmin
    .from('conversations')
    .select('id, bot_id, platform, stage, status, last_message, last_message_at, created_at, bots(name)')
    .eq('contact_id', id)
    .order('last_message_at', { ascending: false });

  const convs = (conversations || []).map((c: any) => ({
    ...c,
    bot_name: c.bots?.name || null,
    bots: undefined,
  }));
  const convIds = convs.map((c: any) => c.id);

  // Tiket & order yang tertaut ke percakapan kontak ini
  let tickets: any[] = [];
  let orders: any[] = [];
  if (convIds.length > 0) {
    const [ticketRes, orderRes] = await Promise.all([
      supabaseAdmin
        .from('tickets')
        .select('id, subject, status, priority, conversation_id, created_at')
        .eq('user_id', user.id)
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('orders')
        .select('id, items, status, address, notes, conversation_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
    ]);
    tickets = ticketRes.data || [];
    orders = orderRes.data || [];
  }

  return NextResponse.json({ contact, identities, conversations: convs, tickets, orders });
}
